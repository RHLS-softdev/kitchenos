"""
Local, offline speech-to-text for dictation (VoiceField/VoiceIconButton on
the frontend). Runs via faster-whisper, entirely on-device — no Convex/Clerk
call, no cloud STT vendor. This replaces the browser's own SpeechRecognition
API, which was a quiet cloud dependency (Chrome's implementation calls
Google) — see roadmap.md's AI-architecture addendum, which flagged this as
the one feature that wasn't actually local despite everything else being
offline-first.

Model weights are NOT downloaded by this app at runtime — that would be a
network call the free tier isn't supposed to make. They're bundled into the
packaged desktop binary as a data file (see desktop/README.md) and the path
is handed in via KITCHENOS_WHISPER_MODEL_PATH (set by run_sidecar.py when
frozen). In dev, leaving that env var unset falls back to the bare model
name "small", which faster-whisper resolves from its own local Hugging Face
cache — useful for testing this without a packaged build, as long as that
model has been downloaded once already.
"""
import os
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

bp = Blueprint("voice", __name__, url_prefix="/voice")

_model = None


def _get_model():
    """Lazy singleton: loading Whisper's weights takes real time and RAM, so
    it happens once, on first actual use — not at import time (which would
    slow down every test that imports this module, even ones that never
    touch transcription) and not unconditionally at app startup (which
    would cost every user that fixed load time even if they never dictate
    anything)."""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        model_path = os.environ.get("KITCHENOS_WHISPER_MODEL_PATH", "small")
        _model = WhisperModel(model_path, device="cpu", compute_type="int8")
    return _model


@bp.route("/transcribe", methods=["POST"])
@jwt_required()
def transcribe():
    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"error": "No audio file provided"}), 400
    try:
        segments, _info = _get_model().transcribe(audio_file, beam_size=1)
        text = " ".join(segment.text.strip() for segment in segments).strip()
    except Exception as e:  # noqa: BLE001 — any decode/model failure should
        # degrade to "dictation didn't work this time", not a crashed request
        current_app.logger.warning("Transcription failed: %s", e)
        return jsonify({"error": "Couldn't transcribe that clip. Try again, or just type it."}), 500
    return jsonify({"text": text})
