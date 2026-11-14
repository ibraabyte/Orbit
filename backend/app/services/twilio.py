"""The few Twilio REST calls the phone agent needs, with the user's own account (SID and auth token).

Checking the account and the number calls go out from, starting a call (its audio is streamed to Orbit's
/calls/stream, see app.services.phone_agent), hanging up, and checking that a status update really came from Twilio.
"""

import base64
import hashlib
import hmac
from collections.abc import Mapping
from xml.sax.saxutils import quoteattr

import httpx2 as httpx

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None

API = "https://api.twilio.com/2010-04-01"
# Twilio's own errors that need the user to change something in their Twilio account.
_HINTS = {
    21210: "This number isn't in your Twilio account. Buy it, or verify it under Phone Numbers > Verified Caller IDs.",
    21215: "Calls to this country are off in your Twilio account. Turn it on under Voice > Settings > Geo permissions.",
    21216: "Twilio won't call this number. Check it and try again.",
    21219: "A Twilio trial account can only call verified numbers. Upgrade the account or verify this number.",
    21211: "Twilio says this phone number isn't valid.",
}


class TwilioUnavailable(Exception):
    """Twilio couldn't be reached or refused the request. The message is safe to show."""


class TwilioKeyRejected(TwilioUnavailable):
    """Twilio refused the account SID or the auth token."""


def _request(method: str, sid: str, token: str, path: str, data: Mapping[str, str] | None = None, params=None) -> dict:
    try:
        with httpx.Client(transport=transport, timeout=20.0, auth=(sid, token)) as client:
            response = client.request(method, f"{API}/Accounts/{sid}{path}", data=data, params=params)
    except httpx.HTTPError as exc:
        raise TwilioUnavailable("Can't reach Twilio from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise TwilioKeyRejected("Twilio refused this account SID or auth token.")
    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code >= 400:
        code = body.get("code") if isinstance(body, dict) else None
        raise TwilioUnavailable(_HINTS.get(code) or f"Twilio answered with an error ({response.status_code}). Try again later.")
    return body if isinstance(body, dict) else {}


def check_account(sid: str, token: str) -> None:
    _request("GET", sid, token, ".json")


def number_usable(sid: str, token: str, number: str) -> bool:
    """The number is one of the account's own Twilio numbers, or a verified caller ID (the user's own mobile)."""
    owned = _request("GET", sid, token, "/IncomingPhoneNumbers.json", params={"PhoneNumber": number})
    if owned.get("incoming_phone_numbers"):
        return True
    verified = _request("GET", sid, token, "/OutgoingCallerIds.json", params={"PhoneNumber": number})
    return bool(verified.get("outgoing_caller_ids"))


def stream_twiml(stream_url: str, parameters: Mapping[str, str]) -> str:
    """When the call is answered, Twilio streams its audio both ways to Orbit."""
    params = "".join(f"<Parameter name={quoteattr(name)} value={quoteattr(value)}/>" for name, value in parameters.items())
    return f"<Response><Connect><Stream url={quoteattr(stream_url)}>{params}</Stream></Connect></Response>"


def create_call(sid: str, token: str, *, to: str, from_: str, twiml: str, status_url: str, time_limit: int, ring_seconds: int) -> str:
    """Starts the call and returns Twilio's call SID."""
    body = _request(
        "POST",
        sid,
        token,
        "/Calls.json",
        data={
            "To": to,
            "From": from_,
            "Twiml": twiml,
            "StatusCallback": status_url,
            "StatusCallbackMethod": "POST",
            "StatusCallbackEvent": "initiated ringing answered completed",
            # The call is cut after this many seconds whatever happens, so a stuck call can't run up the bill.
            "TimeLimit": str(time_limit),
            "Timeout": str(ring_seconds),
        },
    )
    call_sid = body.get("sid")
    if not isinstance(call_sid, str) or not call_sid:
        raise TwilioUnavailable("Twilio sent an answer Orbit couldn't read.")
    return call_sid


def end_call(sid: str, token: str, call_sid: str, *, ringing: bool = False) -> None:
    """Hangs up a call that is on the line, or stops one that is still ringing."""
    _request("POST", sid, token, f"/Calls/{call_sid}.json", data={"Status": "canceled" if ringing else "completed"})


def signature(token: str, url: str, params: Mapping[str, str]) -> str:
    """Twilio's X-Twilio-Signature: HMAC-SHA1 of the URL followed by each POST field (sorted by name) and its value."""
    payload = url + "".join(f"{name}{params[name]}" for name in sorted(params))
    digest = hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def signature_valid(token: str, url: str, params: Mapping[str, str], given: str | None) -> bool:
    return bool(given) and hmac.compare_digest(signature(token, url, params), given)
