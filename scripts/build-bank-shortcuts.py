#!/usr/bin/env python3
"""Builds the signed iPhone Shortcuts for bank SMS (backend/BANK_SMS.md). macOS only; signing needs an Apple account.

    python3 scripts/build-bank-shortcuts.py --url https://YOUR-API --out dist/bank-shortcuts

One self-contained shortcut per bank, for that bank's Message automation to run. They don't call a shared shortcut
because a Run Shortcut link doesn't survive import ("Shortcut Not Found"). The key is never in a file: each one asks
for it when imported.
"""

import argparse
import plistlib
import subprocess
import tempfile
import uuid
from pathlib import Path

BANKS = {"rajhi": "Rajhi", "alinma": "Alinma", "stc": "STC Bank", "d360": "D360", "barq": "Barq", "snb": "SNB"}
OTP = (
    r"(?i)(OTP|one[ -]?time|verification|verify|authentication|passcode|password|PIN|CVV|CVC|code|كود|رمز|تحقق|تأكيد"
    r"|تفعيل|توثيق|سري|كلمة.?مرور|كلمة.?المرور)"
)
LONG_NUMBER = r"(?i)([0-9٠-٩۰-۹][0-9٠-٩۰-۹ -]{10,}[0-9٠-٩۰-۹]|SA[0-9٠-٩۰-۹ ]{20,})"
SHORTCUT_INPUT = {"Type": "ExtensionInput"}


def action(identifier: str, **parameters) -> dict:
    return {"WFWorkflowActionIdentifier": f"is.workflow.actions.{identifier}", "WFWorkflowActionParameters": parameters}


def output_of(step: dict, name: str = "Output") -> dict:
    return {"OutputUUID": step["WFWorkflowActionParameters"]["UUID"], "OutputName": name, "Type": "ActionOutput"}


def with_output(identifier: str, **parameters) -> dict:
    return action(identifier, UUID=str(uuid.uuid4()).upper(), **parameters)


def variable(attachment: dict) -> dict:
    return {"Value": attachment, "WFSerializationType": "WFTextTokenAttachment"}


def text(*parts) -> dict:
    """A text field mixing plain strings and variables."""
    string, attachments = "", {}
    for part in parts:
        if isinstance(part, str):
            string += part
        else:
            attachments[f"{{{len(string.encode('utf-16-le')) // 2}, 1}}"] = part
            string += "￼"
    return {"Value": {"string": string, "attachmentsByRange": attachments}, "WFSerializationType": "WFTextTokenString"}


def dictionary(**fields) -> dict:
    items = [{"WFItemType": 0, "WFKey": text(key), "WFValue": value} for key, value in fields.items()]
    return {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}


def stop_if_matches(pattern: str, message: dict) -> list[dict]:
    match = with_output("text.match", WFMatchTextPattern=pattern, WFMatchTextCaseSensitive=False, text=text(message))
    group = str(uuid.uuid4()).upper()
    condition = {"Type": "Variable", "Variable": variable(output_of(match, "Matches"))}
    return [
        match,
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=0, WFCondition=100, WFInput=condition),
        action("exit"),
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=2),
    ]


def bank_shortcut(code: str, url: str) -> dict:
    key = with_output("gettext", WFTextActionText="")
    message = with_output("gettext", WFTextActionText=text(SHORTCUT_INPUT))
    message_text = output_of(message, "Text")

    # event_id: a UUID-shaped hash of the message and the moment, since Shortcuts has no UUID action everywhere.
    now = with_output("date", WFDateActionMode="Current Date")
    stamp = with_output("format.date", WFDateFormatStyle="Custom", WFDateFormat="yyyyMMddHHmmssSSS", WFDate=text(output_of(now, "Date")))
    seed = with_output("gettext", WFTextActionText=text(message_text, output_of(stamp, "Formatted Date")))
    digest = with_output("hash", WFHashType="MD5", WFInput=variable(output_of(seed, "Text")))
    event_id = with_output(
        "text.replace",
        WFInput=text(output_of(digest, "Hash")),
        WFReplaceTextRegularExpression=True,
        WFReplaceTextFind="^(.{8})(.{4})(.{4})(.{4})(.{12})$",
        WFReplaceTextReplace="$1-$2-$3-$4-$5",
    )
    send = with_output(
        "downloadurl",
        WFURL=f"{url.rstrip('/')}/bank-sms",
        WFHTTPMethod="POST",
        ShowHeaders=True,
        WFHTTPHeaders=dictionary(Authorization=text("Bearer ", output_of(key, "Text"))),
        WFHTTPBodyType="JSON",
        WFJSONValues=dictionary(bank=text(code), message=text(message_text), event_id=text(output_of(event_id, "Updated Text"))),
    )
    return shortcut(
        [key, message, *stop_if_matches(OTP, message_text), *stop_if_matches(LONG_NUMBER, message_text), now, stamp, seed, digest, event_id, send, action("nothing")],
        questions=[{"ActionIndex": 0, "Category": "Parameter", "ParameterKey": "WFTextActionText", "Text": "الصق مفتاح الاختصار من تطبيق Orbit", "DefaultValue": ""}],
        input_classes=["WFStringContentItem", "WFGenericFileContentItem"],
        # Typing a message when run by hand makes it testable without a real SMS.
        no_input={"Name": "WFWorkflowNoInputBehaviorAskForInput", "Parameters": {"ItemClass": "WFStringContentItem"}},
    )


def shortcut(actions: list[dict], questions: list | None = None, input_classes: list | None = None, no_input: dict | None = None) -> dict:
    body = {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2700",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 431817727, "WFWorkflowIconGlyphNumber": 59511},
        "WFWorkflowImportQuestions": questions or [],
        "WFWorkflowInputContentItemClasses": input_classes or [],
        "WFWorkflowTypes": [],
        "WFWorkflowOutputContentItemClasses": [],
    }
    if no_input:
        body["WFWorkflowNoInputBehavior"] = no_input
    return body


def write_signed(body: dict, path: Path) -> None:
    with tempfile.TemporaryDirectory() as folder:
        unsigned = Path(folder) / "unsigned.shortcut"
        unsigned.write_bytes(plistlib.dumps(body, fmt=plistlib.FMT_BINARY))
        subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(path)], check=True, capture_output=True)


def check() -> None:
    """Fails if the plumbing breaks: every variable must point at an earlier step, and the key field must stay empty."""
    body = bank_shortcut("rajhi", "https://example.test")
    assert body["WFWorkflowActions"][0]["WFWorkflowActionParameters"]["WFTextActionText"] == ""
    assert body["WFWorkflowImportQuestions"][0]["ActionIndex"] == 0
    seen: set[str] = set()

    def references(value):
        if isinstance(value, dict):
            if "OutputUUID" in value:
                yield value["OutputUUID"]
            for child in value.values():
                yield from references(child)
        elif isinstance(value, list):
            for child in value:
                yield from references(child)

    for step in body["WFWorkflowActions"]:
        parameters = step["WFWorkflowActionParameters"]
        assert set(references(parameters)) <= seen, step["WFWorkflowActionIdentifier"]
        seen.add(parameters.get("UUID", ""))
    assert text("a", SHORTCUT_INPUT)["Value"]["attachmentsByRange"].keys() == {"{1, 1}"}


if __name__ == "__main__":
    check()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Orbit API address")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for code, name in BANKS.items():
        write_signed(bank_shortcut(code, args.url), args.out / f"Orbit SMS {name}.shortcut")
    print(f"Built {len(BANKS)} shortcuts in {args.out}")
