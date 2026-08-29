import io
from .conftest import register, auth_header


class _FakeSegment:
	def __init__(self, text):
		self.text = text


class _FakeModel:
	def __init__(self, text="add two cups of flour", raise_error=False):
		self.text = text
		self.raise_error = raise_error
		self.received_kwargs = None

	def transcribe(self, audio_file, **kwargs):
		if self.raise_error:
			raise RuntimeError("simulated decode failure")
		self.received_kwargs = kwargs
		# Whisper naturally splits longer dictation into multiple segments —
		# returning two here confirms the route joins them correctly.
		return [_FakeSegment(" add two cups of flour "), _FakeSegment(" and a pinch of salt ")], None


def test_transcribes_and_joins_segments(client, monkeypatch):
	import app.voice as voice
	monkeypatch.setattr(voice, "_get_model", lambda: _FakeModel())

	data = register(client)
	r = client.post(
		"/voice/transcribe",
		headers=auth_header(data["access_token"]),
		data={"audio": (io.BytesIO(b"fake-audio-bytes"), "clip.webm")},
		content_type="multipart/form-data",
	)
	assert r.status_code == 200
	assert r.get_json()["text"] == "add two cups of flour and a pinch of salt"


def test_requires_an_audio_file(client):
	data = register(client)
	r = client.post("/voice/transcribe", headers=auth_header(data["access_token"]), data={})
	assert r.status_code == 400


def test_requires_auth(client):
	r = client.post("/voice/transcribe", data={"audio": (io.BytesIO(b"x"), "clip.webm")}, content_type="multipart/form-data")
	assert r.status_code == 401


def test_model_failure_returns_500_not_a_crash(client, monkeypatch):
	import app.voice as voice
	monkeypatch.setattr(voice, "_get_model", lambda: _FakeModel(raise_error=True))

	data = register(client)
	r = client.post(
		"/voice/transcribe",
		headers=auth_header(data["access_token"]),
		data={"audio": (io.BytesIO(b"fake-audio-bytes"), "clip.webm")},
		content_type="multipart/form-data",
	)
	assert r.status_code == 500
	assert "error" in r.get_json()


def test_model_is_loaded_once_and_reused(app, monkeypatch):
	"""_get_model is meant to be a lazy singleton — loading Whisper's weights
	is the slow, heavy part, so it should happen once, not per-request."""
	import app.voice as voice
	import faster_whisper

	call_count = {"n": 0}

	class _StubWhisperModel:
		def __init__(self, *args, **kwargs):
			call_count["n"] += 1

	monkeypatch.setattr(faster_whisper, "WhisperModel", _StubWhisperModel)
	monkeypatch.setattr(voice, "_model", None)  # don't inherit state from another test
	with app.app_context():
		voice._get_model()
		voice._get_model()
	assert call_count["n"] == 1
