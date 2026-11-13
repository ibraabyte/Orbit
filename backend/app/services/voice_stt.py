"""Speech to text with the user's own voice model (OpenAI, Groq or ElevenLabs).

The assistant's mic records on the phone; when the user connected a voice model, the recording comes here and goes on
to that provider with the user's own key, and only the text comes back. Nothing is kept: not the audio, not the text.
Without a voice model the phone keeps turning speech into text itself (src/hooks/use-voice.ts).
"""

import io
import struct
import wave
from dataclasses import dataclass

import httpx2 as httpx

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None

# Used when the user leaves the model empty. They can type any other model name their provider offers.
DEFAULT_MODELS = {"openai": "gpt-4o-transcribe", "groq": "whisper-large-v3", "elevenlabs": "scribe_v1"}
NAMES = {"openai": "OpenAI", "groq": "Groq", "elevenlabs": "ElevenLabs"}
_OPENAI_STYLE = {"openai": "https://api.openai.com/v1", "groq": "https://api.groq.com/openai/v1"}
_ELEVENLABS = "https://api.elevenlabs.io/v1/speech-to-text"

# A hint for the models that take one (OpenAI, Groq): the words people use, so Saudi Arabic comes out as said.
_HINTS = {
    "ar": "كلام باللهجة السعودية لمساعد شخصي: ذكّرني بكره الساعة ثمان، أضف مهمة، صرفت خمسين ريال، أكلت كبسة، وش عندي اليوم؟",
    "en": "A note for a personal assistant: remind me tomorrow at eight, add a task, I spent fifty riyals.",
}
# Audio types the app sends and every provider here reads.
MEDIA_TYPES = {"audio/m4a": "m4a", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/webm": "webm", "audio/mpeg": "mp3"}


class VoiceUnavailable(Exception):
    """The provider couldn't be reached or answered with an error. The message is safe to show."""


class VoiceKeyRejected(VoiceUnavailable):
    """The provider refused the key."""


class VoiceModelRejected(VoiceUnavailable):
    """The provider took the key but not the request (usually a wrong model name)."""


@dataclass(frozen=True)
class VoiceAccess:
    provider: str
    model: str
    api_key: str


def model_or_default(provider: str, model: str | None) -> str:
    return (model or "").strip() or DEFAULT_MODELS[provider]


def silence_wav(seconds: float = 1.0, rate: int = 16_000) -> bytes:
    """A short silent recording, to check a key and model without sending anything the user said."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(struct.pack("<h", 0) * int(seconds * rate))
    return buffer.getvalue()


def transcribe(access: VoiceAccess, audio: bytes, media_type: str, language: str | None) -> str:
    """The words in the recording, as text. language: "ar", "en" or None to let the model tell."""
    name = NAMES[access.provider]
    filename = f"speech.{MEDIA_TYPES.get(media_type, 'm4a')}"
    files = {"file": (filename, audio, media_type)}
    if access.provider == "elevenlabs":
        url = _ELEVENLABS
        headers = {"xi-api-key": access.api_key}
        data = {"model_id": access.model, "tag_audio_events": "false"}
        if language:
            data["language_code"] = language
    else:
        url = f"{_OPENAI_STYLE[access.provider]}/audio/transcriptions"
        headers = {"Authorization": f"Bearer {access.api_key}"}
        data = {"model": access.model, "response_format": "json"}
        if language:
            data["language"] = language
            data["prompt"] = _HINTS.get(language, "")
    try:
        with httpx.Client(transport=transport, timeout=90.0) as client:
            response = client.post(url, headers=headers, data=data, files=files)
    except httpx.HTTPError as exc:
        raise VoiceUnavailable(f"Can't reach {name} from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise VoiceKeyRejected(f"{name} refused this API key.")
    if response.status_code == 429:
        raise VoiceUnavailable(f"{name} is busy or the account is out of credit. Try again later.")
    if response.status_code in (400, 404, 422):
        raise VoiceModelRejected(f"{name} didn't take that request ({response.status_code}). Check the model name.")
    if response.status_code != 200:
        raise VoiceUnavailable(f"{name} answered with an error ({response.status_code}). Try again later.")
    try:
        text = response.json().get("text")
    except (ValueError, AttributeError) as exc:
        raise VoiceUnavailable(f"{name} sent an answer Orbit couldn't read.") from exc
    return str(text or "").strip()


def check_access(access: VoiceAccess) -> None:
    """Raises if the key or model doesn't work. Sends one second of silence, never the user's voice."""
    transcribe(access, silence_wav(), "audio/wav", None)
