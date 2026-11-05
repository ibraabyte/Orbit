"""A small tool loop over the user's own AI, the same for every provider Orbit supports.

The caller gives a system text, the user's message, tool definitions (name, description, JSON schema) and a function
that answers one tool call with a string. The loop sends the conversation, answers every tool call the model makes,
and stops when the model answers in plain text (or after MAX_ROUNDS). Claude goes through the Anthropic SDK; OpenAI,
Gemini and OpenRouter through their shared chat format; a ChatGPT account through app.services.chatgpt_ai.

Errors come out as whoop_ai.InsightUnavailable (AiKeyRejected for a refused key), whose message is safe to show.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.services import chatgpt_ai, chatgpt_auth, whoop_ai
from app.services.whoop_ai import AiAccess, ChatgptAccess, InsightUnavailable

MAX_ROUNDS = 6


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class Call:
    name: str
    arguments: dict[str, Any] | None  # None: the model sent arguments that aren't a JSON object


Handler = Callable[[Call], str]


def _arguments(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict):
        return raw
    try:
        value = json.loads(raw) if isinstance(raw, str) else None
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _openai_tools(tools: list[Tool]) -> list[dict[str, Any]]:
    return [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}} for t in tools]


def _run_claude(access: AiAccess, system: str, prompt: str, tools: list[Tool], handle: Handler) -> str:
    client = whoop_ai._anthropic(access.api_key)
    specs = [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools]
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    for _ in range(MAX_ROUNDS):
        response = whoop_ai._call_anthropic(
            lambda: client.messages.create(model=access.model, max_tokens=8000, system=system, tools=specs, messages=messages)
        )
        if response.stop_reason == "refusal":
            raise InsightUnavailable("Claude declined to answer this.")
        text = "".join(block.text for block in response.content if block.type == "text")
        uses = [block for block in response.content if block.type == "tool_use"]
        if response.stop_reason == "max_tokens" and not uses:
            raise InsightUnavailable("Claude's answer was cut off. Try a shorter request.")
        if not uses:
            return text
        # The whole content goes back as it came, thinking blocks included.
        messages.append({"role": "assistant", "content": response.content})
        results = [{"type": "tool_result", "tool_use_id": use.id, "content": handle(Call(use.name, _arguments(use.input)))} for use in uses]
        messages.append({"role": "user", "content": results})
    return ""


def _run_chat(access: AiAccess, system: str, prompt: str, tools: list[Tool], handle: Handler) -> str:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    for _ in range(MAX_ROUNDS):
        answer = whoop_ai._chat(access, {"messages": messages, "tools": _openai_tools(tools)})
        try:
            message = answer["choices"][0]["message"]
            calls = message.get("tool_calls") or []
            text = message.get("content") or ""
            if not isinstance(calls, list) or not isinstance(text, str):
                raise TypeError
        except (KeyError, IndexError, TypeError, AttributeError) as exc:
            raise InsightUnavailable("The AI provider sent an answer Orbit can't read. Try again.") from exc
        if not calls:
            return text
        messages.append({"role": "assistant", "content": text or None, "tool_calls": calls})
        for call in calls:
            function = call.get("function", {}) if isinstance(call, dict) else {}
            result = handle(Call(str(function.get("name", "")), _arguments(function.get("arguments"))))
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": result})
    return ""


def _run_chatgpt(access: ChatgptAccess, system: str, prompt: str, tools: list[Tool], handle: Handler) -> str:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    for _ in range(MAX_ROUNDS):
        try:
            reply = chatgpt_ai.respond(access.db, access.user_id, messages, _openai_tools(tools))
        except chatgpt_auth.ChatgptError as exc:
            raise InsightUnavailable(str(exc)) from exc
        if not reply.tool_calls:
            return reply.text
        messages.append(
            {
                "role": "assistant",
                "content": reply.text,
                "tool_calls": [
                    {"id": call["call_id"], "function": {"name": call["name"], "arguments": call["arguments"]}} for call in reply.tool_calls
                ],
            }
        )
        for call in reply.tool_calls:
            result = handle(Call(call["name"], _arguments(call["arguments"])))
            messages.append({"role": "tool", "tool_call_id": call["call_id"], "content": result})
    return ""


def run(access: AiAccess | ChatgptAccess, system: str, prompt: str, tools: list[Tool], handle: Handler) -> str:
    """Returns the model's last plain-text answer (possibly empty)."""
    system = whoop_ai.system_for(access, system)
    if isinstance(access, ChatgptAccess):
        text = _run_chatgpt(access, system, prompt, tools, handle)
    elif access.provider == "anthropic":
        text = _run_claude(access, system, prompt, tools, handle)
    else:
        text = _run_chat(access, system, prompt, tools, handle)
    return text.strip()
