import os
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

    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=WHISPER_VAD_FILTER,
    )

    recognition = " ".join(segment.text.strip() for segment in segments).strip()
    return (
        jsonify(
            {
                "filePath": str(audio_path),
                "recognition": recognition,
                "language": info.language,
                "language_probability": info.language_probability,
            }
        ),
        200,
    )


if __name__ == "__main__":
    app.run(host=WHISPER_HOST, port=WHISPER_PORT)
