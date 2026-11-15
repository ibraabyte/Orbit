"""The ready Shortcut file and its builder."""

import importlib.util
import plistlib
from pathlib import Path

from fastapi.testclient import TestClient

SCRIPT = Path(__file__).parents[1] / "scripts/build_bank_shortcut.py"
spec = importlib.util.spec_from_file_location("build_bank_shortcut", SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

OTP = r"(?i)(OTP|one[ -]?time|verification|verify|authentication|passcode|password|PIN|CVV|CVC|code|كود|رمز|تحقق|تأكيد|تفعيل|توثيق|سري|كلمة.?مرور|كلمة.?المرور)"
LONG = r"(?i)([0-9٠-٩۰-۹][0-9٠-٩۰-۹ -]{10,}[0-9٠-٩۰-۹]|SA[0-9٠-٩۰-۹ ]{20,})"


def test_builder_plist_has_both_filters_the_address_and_one_question():
    workflow = builder.build_plist("https://orbit.example.test")
    assert plistlib.loads(plistlib.dumps(workflow)) == workflow
    actions = workflow["WFWorkflowActions"]
    patterns = [
        a["WFWorkflowActionParameters"]["WFMatchTextPattern"]
        for a in actions
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.text.match"
    ]
    assert patterns == [OTP, LONG]
    posts = [a["WFWorkflowActionParameters"] for a in actions if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"]
    assert len(posts) == 1 and posts[0]["WFURL"] == "https://orbit.example.test/bank-sms" and posts[0]["WFHTTPMethod"] == "POST"
    questions = workflow["WFWorkflowImportQuestions"]
    assert len(questions) == 1 and actions[questions[0]["ActionIndex"]]["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext"
    # The two filters stop the shortcut before anything is sent.
    exits = [i for i, a in enumerate(actions) if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.exit"]
    assert len(exits) == 2 and all(
        i < actions.index(next(a for a in actions if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl")) for i in exits
    )


def test_shortcut_is_public_and_has_no_key(client: TestClient):
    response = client.get("/bank-sms/shortcut")
    assert response.status_code == 200
    assert "Orbit%20Bank%20SMS.shortcut" in response.headers["content-disposition"]
    assert b"orbit_sms_" not in response.content and len(response.content) > 100
