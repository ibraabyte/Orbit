"""Server-only Codex Responses transport for a user's encrypted ChatGPT connection."""

import json
import uuid
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import httpx2 as httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services import chatgpt_auth

BASE_URL = "https://chatgpt.com/backend-api/codex"
transport: httpx.BaseTransport | None = None
# Models can differ between accounts, so a selection never crosses user/account boundaries.
model_cache: dict[tuple[uuid.UUID, str], str] = {}


@dataclass(frozen=True)
class Reply:
    text: str
    tool_calls: list[dict[str, Any]]
    model: str


def _stream_error() -> chatgpt_auth.ChatgptError:
    return chatgpt_auth.ChatgptError("ChatGPT's answer was interrupted or couldn't be read. Try again.")


def read_sse(lines: Iterable[str], model: str) -> Reply:
    """Read complete SSE records, accepting a final response when text deltas are absent."""
    deltas: list[str] = []
    calls: dict[str, dict[str, Any]] = {}
    fallback: list[str] = []
    data: list[str] = []
    finished = False

    def item_done(item: Any) -> None:
        if not isinstance(item, dict):
            raise _stream_error()
        if item.get("type") == "function_call":
            if not all(isinstance(item.get(key), str) for key in ("call_id", "name", "arguments")):
                raise _stream_error()
            calls[item["call_id"]] = item

    def record(payload: str) -> None:
        nonlocal finished, model, fallback
        if payload == "[DONE]":
            return
        try:
            event = json.loads(payload)
        except ValueError as exc:
            raise _stream_error() from exc
        if not isinstance(event, dict):
            raise _stream_error()
        kind = event.get("type")
        if kind == "response.output_text.delta":
            if not isinstance(event.get("delta"), str):
                raise _stream_error()
            deltas.append(event["delta"])
        elif kind == "response.output_item.done":
            item_done(event.get("item"))
        elif kind in ("response.completed", "response.done"):
            response = event.get("response")
            if not isinstance(response, dict) or response.get("status", "completed") != "completed":
                raise _stream_error()
            output = response.get("output", [])
            if not isinstance(output, list):
                raise _stream_error()
            fallback = []
            for item in output:
                item_done(item)
                if item.get("type") == "message":
                    content = item.get("content", [])
                    if not isinstance(content, list):
                        raise _stream_error()
                    for part in content:
                        if not isinstance(part, dict):
                            raise _stream_error()
                        if part.get("type") == "output_text":
                            if not isinstance(part.get("text"), str):
                                raise _stream_error()
                            fallback.append(part["text"])
            if isinstance(response.get("model"), str):
                model = response["model"]
            finished = True
        elif kind in ("error", "response.failed", "response.incomplete", "response.cancelled"):
            raise _stream_error()

    for line in lines:
        if not line:
            if data:
                record("\n".join(data))
                data = []
                if finished:
                    break
        elif line.startswith("data:"):
            value = line[5:]
            data.append(value[1:] if value.startswith(" ") else value)
    if data:
        record("\n".join(data))
    if not finished:
        raise _stream_error()
    text = "".join(deltas if deltas else fallback)
    if not text and not calls:
        raise _stream_error()
    return Reply(text, list(calls.values()), model)


def _headers(credentials: chatgpt_auth.Credentials) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {credentials.access_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "OpenAI-Beta": "responses=experimental",
        "session_id": str(uuid.uuid4()),
        "originator": "codex_cli_rs",
        "chatgpt-account-id": credentials.account_id,
    }


class _CodexClient:
    def __init__(self, client: httpx.Client, db: Session, user_id: uuid.UUID):
        self.client = client
        self.db = db
        self.user_id = user_id
        self.credentials = chatgpt_auth.get_credentials(db, user_id)

    @contextmanager
    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Iterator[httpx.Response]:
        """Refresh on a 401, with exactly one repeat of the rejected request."""
        try:
            for attempt in range(2):
                with self.client.stream(method, f"{BASE_URL}/{path}", headers=_headers(self.credentials), json=body) as response:
                    if response.status_code != 401:
                        yield response
                        return
                    # Close the response before exchanging tokens or repeating the request.
                if attempt:
                    chatgpt_auth.mark_expired(self.db, self.user_id)
                    raise chatgpt_auth.ChatgptExpired("Your ChatGPT connection expired. Connect ChatGPT again.")
                try:
                    self.credentials = chatgpt_auth.get_credentials(self.db, self.user_id, force_refresh=True)
                except chatgpt_auth.ChatgptError as exc:
                    chatgpt_auth.mark_expired(self.db, self.user_id)
                    raise chatgpt_auth.ChatgptExpired("Your ChatGPT connection expired. Connect ChatGPT again.") from exc
        except httpx.HTTPError as exc:
            raise chatgpt_auth.ChatgptError("Can't reach ChatGPT from the server. Try again later.") from exc

    def model(self) -> str:
        override = get_settings().chatgpt_model.strip()
        if override:
            return override
        key = (self.user_id, self.credentials.account_id)
        if key in model_cache:
            return model_cache[key]
        with self.request("GET", "models?client_version=0.163.0") as response:
            response.read()
            _check_status(response)
            try:
                models = response.json()["models"]
                if not isinstance(models, list):
                    raise ValueError
                choices = [
                    item
                    for item in models
                    if isinstance(item, dict)
                    and item.get("visibility") == "list"
                    and item.get("supported_in_api") is not False
                    and isinstance(item.get("slug"), str)
                    and item["slug"]
                    and isinstance(item.get("priority"), (int, float))
                    and not isinstance(item["priority"], bool)
                ]
                selected = min(choices, key=lambda item: item["priority"])["slug"]
            except (ValueError, KeyError, TypeError) as exc:
                raise chatgpt_auth.ChatgptError("ChatGPT didn't offer an available model for this account. Try again later.") from exc
        model_cache[(self.user_id, self.credentials.account_id)] = selected
        return selected


def _check_status(response: httpx.Response) -> None:
    if response.status_code == 429:
        raise chatgpt_auth.ChatgptError("ChatGPT is busy or this account reached its usage limit. Try again later.")
    if response.status_code != 200:
        raise chatgpt_auth.ChatgptError(f"ChatGPT answered with an error ({response.status_code}). Try again later.")


def _message_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list) and all(isinstance(part, dict) and isinstance(part.get("text"), str) for part in content):
        return "\n".join(part["text"] for part in content)
    raise chatgpt_auth.ChatgptError("Orbit couldn't prepare this ChatGPT request.")


def _body(model: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]:
    instructions = []
    items = []
    for message in messages:
        if message.get("type") in ("function_call", "function_call_output"):
            items.append(message)
            continue
        role = message.get("role")
        content = _message_text(message.get("content"))
        if role in ("system", "developer"):
            instructions.append(content)
        elif role == "tool":
            items.append({"type": "function_call_output", "call_id": message["tool_call_id"], "output": content})
        elif role in ("user", "assistant"):
            if content:
                items.append(
                    {
                        "type": "message",
                        "role": role,
                        "content": [
                            {
                                "type": "output_text" if role == "assistant" else "input_text",
                                "text": content,
                            }
                        ],
                    }
                )
            for call in message.get("tool_calls", []):
                function = call["function"]
                items.append({"type": "function_call", "call_id": call["id"], "name": function["name"], "arguments": function["arguments"]})
        else:
            raise chatgpt_auth.ChatgptError("Orbit couldn't prepare this ChatGPT request.")
    functions = []
    for tool in tools or []:
        function = tool.get("function", tool)
        functions.append(
            {
                "type": "function",
                "name": function["name"],
                "description": function.get("description", ""),
                "parameters": function.get("parameters", {"type": "object", "properties": {}}),
                "strict": False,
            }
        )
    return {
        "model": model,
        "instructions": "\n\n".join(instructions),
        "input": items,
        "stream": True,
        "store": False,
        "tools": functions,
        "tool_choice": "auto",
        "parallel_tool_calls": False,
    }


def respond(
    db: Session,
    user_id: uuid.UUID,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
) -> Reply:
    with httpx.Client(transport=transport, timeout=120.0, follow_redirects=False) as client:
        codex = _CodexClient(client, db, user_id)
        for attempt in range(2):
            model = codex.model()
            with codex.request("POST", "responses", _body(model, messages, tools)) as response:
                if response.status_code == 400:
                    response.read()
                    if "not supported" in response.text.lower():
                        model_cache.pop((user_id, codex.credentials.account_id), None)
                        if not attempt and not get_settings().chatgpt_model.strip():
                            continue
                _check_status(response)
                return read_sse(response.iter_lines(), model)
    raise chatgpt_auth.ChatgptError("ChatGPT couldn't use an available model. Try again later.")
