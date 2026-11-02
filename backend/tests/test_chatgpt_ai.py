"""Codex wire protocol tests. All credentials and network replies here are synthetic."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx2 as httpx
import pytest

from app.config import get_settings
from app.services import chatgpt_ai

USER = uuid.UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
MESSAGES = [{"role": "system", "content": "Be brief."}, {"role": "user", "content": "Hello"}]


def event(kind, **values):
    return f"data: {json.dumps({'type': kind, **values})}\n\n"


def completed(text="Hello", kind="response.completed"):
    return event(
        kind,
        response={
            "status": "completed",
            "model": "chosen",
            "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}],
        },
    )


@pytest.fixture
def api(monkeypatch):
    api = chatgpt_ai
    monkeypatch.setenv("ORBIT_JWT_SECRET", "test-secret-that-is-long-enough-for-hs256-signing")
    monkeypatch.setattr(get_settings(), "chatgpt_model", "")
    api.model_cache.clear()
    fresh = SimpleNamespace(access_token="new-access", account_id="test-account", expires_at=datetime.now(UTC) + timedelta(hours=1))
    stale = SimpleNamespace(access_token="old-access", account_id="test-account", expires_at=fresh.expires_at)
    refreshes = []
    expired = []

    def credentials(db, user_id, force_refresh=False):
        refreshes.append(force_refresh)
        return fresh if force_refresh else stale

    monkeypatch.setattr(api.chatgpt_auth, "get_credentials", credentials)
    monkeypatch.setattr(api.chatgpt_auth, "mark_expired", lambda db, user_id: expired.append(user_id))
    return api, refreshes, expired


def install(api, monkeypatch, handler):
    monkeypatch.setattr(api, "transport", httpx.MockTransport(handler))


def test_sse_uses_deltas_and_does_not_repeat_completed_text(api):
    module, _, _ = api
    wire = event("response.output_text.delta", delta="مر") + event("response.output_text.delta", delta="حبًا") + completed("مرحبًا")
    reply = module.read_sse(wire.splitlines(), "fallback")
    assert reply.text == "مرحبًا"
    assert reply.model == "chosen"


@pytest.mark.parametrize("kind", ["response.completed", "response.done"])
def test_sse_completed_fallback_and_function_calls(api, kind):
    module, _, _ = api
    call = {"type": "function_call", "call_id": "call1", "name": "weather", "arguments": '{"city":"Riyadh"}'}
    wire = event("response.output_item.done", item=call) + event(
        kind, response={"status": "completed", "output": [call, {"type": "message", "content": [{"type": "output_text", "text": "Done"}]}]}
    )
    reply = module.read_sse(wire.splitlines(), "fallback")
    assert reply.text == "Done"
    assert reply.tool_calls == [call]
    assert reply.model == "fallback"


def test_sse_multiline_data_and_comments(api):
    module, _, _ = api
    wire = ': heartbeat\n\ndata: {"type":"response.output_text.delta",\ndata: "delta":"OK"}\n\n' + completed("OK")
    assert module.read_sse(wire.splitlines(), "m").text == "OK"


def test_sse_stops_reading_at_the_completed_event(api):
    module, _, _ = api

    def lines():
        yield from completed("Done").splitlines()
        raise AssertionError("The completed response must not wait for the connection to close")

    assert module.read_sse(lines(), "m").text == "Done"


@pytest.mark.parametrize(
    "wire",
    [
        event("response.output_text.delta", delta="partial"),
        event("response.failed", response={"error": {"message": "secret-provider-detail"}}),
        event("response.incomplete", response={"status": "incomplete"}),
        "data: invalid-json\n\n",
        event("response.completed", response={"status": "incomplete", "output": []}),
    ],
)
def test_sse_rejects_failed_or_incomplete_streams_without_leaking_errors(api, wire):
    module, _, _ = api
    with pytest.raises(module.chatgpt_auth.ChatgptError) as error:
        module.read_sse(wire.splitlines(), "m")
    assert "secret-provider-detail" not in str(error.value)


def test_selects_visible_supported_lowest_priority_and_caches_per_user(api, monkeypatch):
    module, _, _ = api
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/models"):
            assert request.url.params["client_version"] == "0.163.0"
            return httpx.Response(
                200,
                json={
                    "models": [
                        {"slug": "hidden", "visibility": "hide", "priority": 0},
                        {"slug": "unsupported", "visibility": "list", "supported_in_api": False, "priority": 0},
                        {"slug": "expensive", "visibility": "list", "priority": 5},
                        {"slug": "chosen", "visibility": "list", "priority": 1},
                    ]
                },
            )
        assert json.loads(request.content)["model"] == "chosen"
        return httpx.Response(200, text=completed())

    install(module, monkeypatch, handler)
    assert module.respond(None, USER, MESSAGES).text == "Hello"
    module.respond(None, USER, MESSAGES)
    module.respond(None, uuid.uuid4(), MESSAGES)
    assert sum(r.method == "GET" for r in calls) == 2


def test_env_model_skips_discovery_and_sends_codex_body_and_headers(api, monkeypatch):
    module, _, _ = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "override-model")
    calls = []

    def handler(request):
        assert str(request.url) == "https://chatgpt.com/backend-api/codex/responses"
        calls.append(request)
        assert request.headers["authorization"] == "Bearer old-access"
        assert request.headers["chatgpt-account-id"] == "test-account"
        assert request.headers["accept"] == "text/event-stream"
        assert request.headers["openai-beta"] == "responses=experimental"
        assert request.headers["originator"] == "codex_cli_rs"
        uuid.UUID(request.headers["session_id"])
        body = json.loads(request.content)
        assert body["model"] == "override-model"
        assert body["instructions"] == "Be brief.\n\nUse Arabic."
        assert body["input"] == [
            {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Hello"}]},
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Hi"}]},
            {"type": "function_call", "call_id": "c1", "name": "weather", "arguments": "{}"},
            {"type": "function_call_output", "call_id": "c1", "output": "sunny"},
        ]
        assert body["tools"] == [
            {"type": "function", "name": "weather", "description": "Weather", "parameters": {"type": "object"}, "strict": False}
        ]
        assert (body["stream"], body["store"], body["tool_choice"], body["parallel_tool_calls"]) == (True, False, "auto", False)
        return httpx.Response(200, text=completed())

    install(module, monkeypatch, handler)
    messages = MESSAGES + [
        {"role": "system", "content": "Use Arabic."},
        {
            "role": "assistant",
            "content": "Hi",
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "weather", "arguments": "{}"}}],
        },
        {"role": "tool", "tool_call_id": "c1", "content": "sunny"},
    ]
    tools = [
        {"type": "function", "function": {"name": "weather", "description": "Weather", "parameters": {"type": "object"}, "strict": True}}
    ]
    module.respond(None, USER, messages, tools)
    module.respond(None, USER, messages, tools)
    assert calls[0].headers["session_id"] != calls[1].headers["session_id"]


def test_401_refreshes_then_retries_once(api, monkeypatch):
    module, refreshes, expired = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "fixed")
    calls = []

    def handler(request):
        calls.append(request.headers["authorization"])
        return httpx.Response(401) if len(calls) == 1 else httpx.Response(200, text=completed())

    install(module, monkeypatch, handler)
    assert module.respond(None, USER, MESSAGES).text == "Hello"
    assert calls == ["Bearer old-access", "Bearer new-access"]
    assert refreshes == [False, True]
    assert expired == []


def test_second_401_expires_connection(api, monkeypatch):
    module, refreshes, expired = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "fixed")
    install(module, monkeypatch, lambda request: httpx.Response(401, text="secret-provider-detail"))
    with pytest.raises(module.chatgpt_auth.ChatgptExpired) as error:
        module.respond(None, USER, MESSAGES)
    assert refreshes == [False, True]
    assert expired == [USER]
    assert "secret-provider-detail" not in str(error.value)


def test_models_401_also_refreshes(api, monkeypatch):
    module, refreshes, _ = api
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(401)
        if request.method == "GET":
            return httpx.Response(200, json={"models": [{"slug": "chosen", "visibility": "list", "priority": 1}]})
        assert request.headers["authorization"] == "Bearer new-access"
        return httpx.Response(200, text=completed())

    install(module, monkeypatch, handler)
    module.respond(None, USER, MESSAGES)
    assert refreshes == [False, True]


def test_unsupported_model_clears_cache_and_rediscovers_once(api, monkeypatch):
    module, _, _ = api
    discoveries = []
    requests = []

    def handler(request):
        if request.method == "GET":
            discoveries.append(request)
            return httpx.Response(
                200, json={"models": [{"slug": "old" if len(discoveries) == 1 else "chosen", "visibility": "list", "priority": 1}]}
            )
        requests.append(json.loads(request.content)["model"])
        return (
            httpx.Response(400, json={"error": {"message": "Model not supported"}})
            if len(requests) == 1
            else httpx.Response(200, text=completed())
        )

    install(module, monkeypatch, handler)
    assert module.respond(None, USER, MESSAGES).text == "Hello"
    assert requests == ["old", "chosen"]
    assert len(discoveries) == 2


@pytest.mark.parametrize("status", [429, 500])
def test_provider_failures_do_not_expire_valid_connection(api, monkeypatch, status):
    module, _, expired = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "fixed")
    install(module, monkeypatch, lambda request: httpx.Response(status, text="secret-provider-detail"))
    with pytest.raises(module.chatgpt_auth.ChatgptError) as error:
        module.respond(None, USER, MESSAGES)
    assert expired == []
    assert "secret-provider-detail" not in str(error.value)


def test_refresh_failure_after_401_requests_reconnection(api, monkeypatch):
    module, _, expired = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "fixed")

    def credentials(db, user_id, force_refresh=False):
        if force_refresh:
            raise module.chatgpt_auth.ChatgptError("Refresh failed")
        return SimpleNamespace(access_token="old-access", account_id="test-account")

    monkeypatch.setattr(module.chatgpt_auth, "get_credentials", credentials)
    install(module, monkeypatch, lambda request: httpx.Response(401))
    with pytest.raises(module.chatgpt_auth.ChatgptExpired, match="Connect ChatGPT again"):
        module.respond(None, USER, MESSAGES)
    assert expired == [USER]


@pytest.mark.parametrize("data", [{"models": []}, {"models": {}}, {"models": [
    {"slug": "bad", "visibility": "list", "priority": "first"},
    {"slug": "hidden", "visibility": "hide", "priority": 0},
]}])
def test_model_discovery_requires_a_supported_visible_model(api, monkeypatch, data):
    module, _, expired = api
    install(module, monkeypatch, lambda request: httpx.Response(200, json=data))
    with pytest.raises(module.chatgpt_auth.ChatgptError, match="available model"):
        module.respond(None, USER, MESSAGES)
    assert expired == []


def test_unsupported_model_retry_is_bounded_and_evicts_cache(api, monkeypatch):
    module, _, _ = api
    calls = []

    def handler(request):
        calls.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"models": [{"slug": "chosen", "visibility": "list", "priority": 1}]})
        return httpx.Response(400, text="Model not supported")

    install(module, monkeypatch, handler)
    with pytest.raises(module.chatgpt_auth.ChatgptError):
        module.respond(None, USER, MESSAGES)
    assert sum(request.method == "GET" for request in calls) == 2
    assert sum(request.method == "POST" for request in calls) == 2
    assert module.model_cache == {}


def test_env_override_is_not_replaced_when_model_is_unsupported(api, monkeypatch):
    module, _, _ = api
    monkeypatch.setattr(get_settings(), "chatgpt_model", "unsupported-override")
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400, text="Model not supported")

    install(module, monkeypatch, handler)
    with pytest.raises(module.chatgpt_auth.ChatgptError):
        module.respond(None, USER, MESSAGES)
    assert len(calls) == 1 and calls[0].method == "POST"
