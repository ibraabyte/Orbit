"""Builds the ready "Orbit Bank SMS" Shortcut and signs it so anyone can import it.

    uv run python scripts/build_bank_shortcut.py --api https://orbit.apps.ibrabyte.app --out app/static/orbit-bank-sms.shortcut

What it does on the phone: takes the message text, stops if it looks like a code or holds a long number (the same two
filters as backend/BANK_SMS.md), then POSTs {"message": ...} to /bank-sms with the key. The key is asked for once, when the
file is imported, so the file itself holds no secret. Signing needs macOS (`shortcuts sign`).
"""

import argparse
import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

NAME = "Orbit Bank SMS"
# Copied as is from backend/BANK_SMS.md.
OTP = r"(?i)(OTP|one[ -]?time|verification|verify|authentication|passcode|password|PIN|CVV|CVC|code|كود|رمز|تحقق|تأكيد|تفعيل|توثيق|سري|كلمة.?مرور|كلمة.?المرور)"  # noqa: E501
LONG_NUMBER = r"(?i)([0-9٠-٩۰-۹][0-9٠-٩۰-۹ -]{10,}[0-9٠-٩۰-۹]|SA[0-9٠-٩۰-۹ ]{20,})"
QUESTION = "Paste the key from Orbit (Integrations > Bank SMS) · الصق المفتاح من Orbit (الربط > رسائل البنك)"
OBJECT = "￼"  # where a variable sits inside a text field


def _ref(output_uuid: str, name: str) -> dict:
    return {"Type": "ActionOutput", "OutputUUID": output_uuid, "OutputName": name}


def _text(before: str, ref: dict | None = None) -> dict:
    """A text field: plain text, optionally followed by one variable."""
    value: dict = {"string": before + (OBJECT if ref else "")}
    if ref:
        value["attachmentsByRange"] = {f"{{{len(before)}, 1}}": ref}
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def _variable(ref: dict) -> dict:
    return {"Value": ref, "WFSerializationType": "WFTextTokenAttachment"}


def _dictionary(items: dict[str, dict]) -> dict:
    fields = [{"WFItemType": 0, "WFKey": _text(key), "WFValue": value} for key, value in items.items()]
    return {"Value": {"WFDictionaryFieldValueItems": fields}, "WFSerializationType": "WFDictionaryFieldValue"}


def _action(identifier: str, **parameters) -> dict:
    return {"WFWorkflowActionIdentifier": f"is.workflow.actions.{identifier}", "WFWorkflowActionParameters": parameters}


def _stop_if_matches(message: dict, pattern: str) -> list[dict]:
    match, group = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
    has_any_value = 100
    return [
        _action("text.match", UUID=match, WFMatchTextPattern=pattern, WFMatchTextCaseSensitive=False, text=_variable(message)),
        _action(
            "conditional",
            GroupingIdentifier=group,
            WFControlFlowMode=0,
            WFCondition=has_any_value,
            WFInput={"Type": "Variable", "Variable": _variable(_ref(match, "Matches"))},
        ),
        _action("exit"),
        _action("conditional", GroupingIdentifier=group, WFControlFlowMode=2),
    ]


def build_plist(api: str) -> dict:
    message_id, key_id = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
    message = _ref(message_id, "Text")
    actions = [
        _action("gettext", UUID=message_id, WFTextActionText=_text("", {"Type": "ExtensionInput"})),
        _action("gettext", UUID=key_id, WFTextActionText=""),
        *_stop_if_matches(message, OTP),
        *_stop_if_matches(message, LONG_NUMBER),
        _action(
            "downloadurl",
            WFURL=api.rstrip("/") + "/bank-sms",
            WFHTTPMethod="POST",
            ShowHeaders=True,
            WFHTTPHeaders=_dictionary({"Authorization": _text("Bearer ", _ref(key_id, "Text"))}),
            WFHTTPBodyType="JSON",
            WFJSONValues=_dictionary({"message": _text("", message)}),
        ),
    ]
    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2607.0.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59511, "WFWorkflowIconStartColor": 431817727},
        "WFWorkflowImportQuestions": [
            {"ActionIndex": 1, "Category": "Parameter", "DefaultValue": "", "ParameterKey": "WFTextActionText", "Text": QUESTION}
        ],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", required=True, help="The Orbit API address, e.g. https://orbit.apps.ibrabyte.app")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if sys.platform != "darwin":
        print("Signing needs macOS (`shortcuts sign`). Run this on the Mac.", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory() as folder:
        unsigned = Path(folder) / f"{NAME}.shortcut"
        unsigned.write_bytes(plistlib.dumps(build_plist(args.api), fmt=plistlib.FMT_BINARY))
        done = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(args.out)], check=False)
    if done.returncode != 0 or not args.out.exists():
        print("shortcuts sign failed. Is this Mac signed in to iCloud?", file=sys.stderr)
        return 1
    print(f"Signed: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
