"""The one AI entry point for the assistant features (morning brief, Ask Orbit): system text and a prompt in, plain text out.

It goes through the user's own AI like the WHOOP summary does (same access, same provider calls and errors), so a
new feature adds a prompt and never a provider path.
"""

from app.services import chatgpt_ai, chatgpt_auth, whoop_ai
from app.services.whoop_ai import AiAccess, ChatgptAccess, InsightUnavailable


def complete(access: AiAccess | ChatgptAccess, system: str, prompt: str, max_tokens: int = 1024) -> str:
    """Raises InsightUnavailable (AiKeyRejected for a refused key); its message is safe to show in the app."""
    system = whoop_ai.system_for(access, system)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    if isinstance(access, ChatgptAccess):
        try:
            text = chatgpt_ai.respond(access.db, access.user_id, messages).text
        except chatgpt_auth.ChatgptError as exc:
            raise InsightUnavailable(str(exc)) from exc
    elif access.provider == "anthropic":
        response = whoop_ai._call_anthropic(
            lambda: whoop_ai._anthropic(access.api_key).messages.create(
                model=access.model, max_tokens=max_tokens, system=system, messages=messages[1:]
            )
        )
        if response.stop_reason == "refusal":
            raise InsightUnavailable("Claude declined to answer this.")
        text = "".join(block.text for block in response.content if block.type == "text")
    else:
        # ponytail: no token cap here; newer OpenAI models want max_completion_tokens and the others max_tokens. Callers cap the words.
        answer = whoop_ai._chat(access, {"messages": messages})
        try:
            text = answer["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise InsightUnavailable("The AI provider sent an answer Orbit can't read. Try again.") from exc
    if not isinstance(text, str) or not text.strip():
        raise InsightUnavailable("The AI sent an empty answer. Try again.")
    return text.strip()
