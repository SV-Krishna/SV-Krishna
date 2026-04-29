import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request
from faster_whisper import WhisperModel


app = Flask(__name__)


WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "tiny.en")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
WHISPER_PORT = int(os.environ.get("WHISPER_PORT", "9001"))
WHISPER_VAD_FILTER = os.environ.get("WHISPER_VAD_FILTER", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
WHISPER_RETRY_PROMPT = os.environ.get(
    "WHISPER_RETRY_PROMPT",
    "marine telemetry depth speed wind speed true wind depth below transducer",
)


def _transcribe_file(audio_path: Path, language: str | None) -> tuple[str, str, float]:
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=WHISPER_VAD_FILTER,
    )
    recognition = " ".join(segment.text.strip() for segment in segments).strip()
    return recognition, info.language, info.language_probability


def _transcribe_file_lenient(audio_path: Path, language: str | None) -> tuple[str, str, float]:
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=False,
        no_speech_threshold=0.05,
        log_prob_threshold=-2.0,
        condition_on_previous_text=False,
        temperature=0.0,
        initial_prompt=WHISPER_RETRY_PROMPT,
    )
    recognition = " ".join(segment.text.strip() for segment in segments).strip()
    return recognition, info.language, info.language_probability


model = WhisperModel(
    WHISPER_MODEL,
    device=WHISPER_DEVICE,
    compute_type=WHISPER_COMPUTE_TYPE,
)


@app.get("/")
def root() -> tuple:
    return (
        jsonify(
            {
                "status": "ok",
                "model": WHISPER_MODEL,
                "device": WHISPER_DEVICE,
                "compute_type": WHISPER_COMPUTE_TYPE,
            }
        ),
        200,
    )


@app.post("/recognize")
def recognize() -> tuple:
    payload = request.get_json(silent=True) or {}
    file_path = str(payload.get("filePath", "")).strip()
    language = str(payload.get("language", "")).strip() or None

    if not file_path:
        return jsonify({"error": "filePath is required"}), 400

    audio_path = Path(file_path)
    if not audio_path.exists():
        return jsonify({"error": f"file not found: {audio_path}"}), 404

    recognition, detected_language, language_probability = _transcribe_file(audio_path, language)

    # Retry once with a normalized/boosted copy for very low-level captures.
    if not recognition and shutil.which("sox"):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            boosted = Path(tmp.name)
        try:
            subprocess.run(
                [
                    "sox",
                    str(audio_path),
                    str(boosted),
                    "gain",
                    "15",
                    "norm",
                    "-3",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            recognition, detected_language, language_probability = _transcribe_file(boosted, language)
        finally:
            try:
                boosted.unlink(missing_ok=True)
            except Exception:
                pass

    # Final retry: lenient decode with marine prompt for weak bridge/cockpit audio.
    if not recognition:
        recognition, detected_language, language_probability = _transcribe_file_lenient(audio_path, language)

    return (
        jsonify(
            {
                "filePath": str(audio_path),
                "recognition": recognition,
                "language": detected_language,
                "language_probability": language_probability,
            }
        ),
        200,
    )


if __name__ == "__main__":
    app.run(host=WHISPER_HOST, port=WHISPER_PORT)
