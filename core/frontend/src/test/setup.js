import '@testing-library/jest-dom/vitest';

// jsdom implements neither MediaRecorder nor getUserMedia, so without these
// every VoiceField/VoiceIconButton in every test would silently render
// without its mic button (the `supported` check in useSpeechToText would be
// false), which would hide real regressions in the voice-input wiring
// itself. Fakes just need to be enough for "does the mic button appear, and
// does the record->stop->transcribe->onChange chain fire correctly" - actual
// audio encoding and actual transcription are out of scope here (the
// latter is covered server-side, see backend/tests/test_voice.py).
navigator.mediaDevices = navigator.mediaDevices || {};
navigator.mediaDevices.getUserMedia = async () => ({
	getTracks: () => [{ stop() {} }],
});

class FakeMediaRecorder {
	ondataavailable = null;
	onstop = null;
	mimeType = "audio/webm";
	constructor() {
		// useSpeechToText constructs a fresh instance every time toggle()
		// starts recording. Tests can't reach into the component to grab it,
		// so it's stashed here - same "last one wins" shape a real single-
		// mic-button test needs, since only one dictation is ever in flight
		// at a time in this app.
		window.__lastMediaRecorderInstance = this;
	}
	start() {
		// A real recorder would start emitting ondataavailable chunks - tests
		// don't need real audio bytes, just something Blob-able, so this is
		// a no-op and stop() below supplies a fake chunk directly.
	}
	stop() {
		this.ondataavailable?.({ data: new Blob(["fake-audio"]) });
		this.onstop?.();
	}
}
window.MediaRecorder = FakeMediaRecorder;
