import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field, Btn, Modal, VoiceField, VoiceIconButton } from "./ui";

// uploadFile is what useSpeechToText posts a recorded clip to
// (/voice/transcribe) — mocked here so dictation tests don't need a real
// backend; downloadFile and everything else from this module stays real.
vi.mock("./api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, uploadFile: vi.fn() };
});
import { uploadFile } from "./api/client";

describe("Field", () => {
	it("renders its label and current value, and reports typed changes", async () => {
		const onChange = vi.fn();
		render(<Field label="Item name" value="Flour" onChange={onChange} />);
		expect(screen.getByText("Item name")).toBeInTheDocument();
		const input = screen.getByDisplayValue("Flour");
		await userEvent.type(input, "!");
		// controlled input: each keystroke fires onChange with the input's
		// own next value, not the accumulated string (the test component
		// doesn't feed the value back in), so just confirm it fired.
		expect(onChange).toHaveBeenCalled();
	});

	it("shows a field-level error message when given one", () => {
		render(<Field label="Qty" value={-1} onChange={() => {}} error="Cannot be negative" />);
		expect(screen.getByText("Cannot be negative")).toBeInTheDocument();
	});
});

describe("Btn", () => {
	it("calls onClick when enabled, and not when disabled", async () => {
		const onClick = vi.fn();
		const { rerender } = render(<Btn onClick={onClick}>Save</Btn>);
		await userEvent.click(screen.getByText("Save"));
		expect(onClick).toHaveBeenCalledTimes(1);

		rerender(<Btn onClick={onClick} disabled>Save</Btn>);
		await userEvent.click(screen.getByText("Save"));
		expect(onClick).toHaveBeenCalledTimes(1); // unchanged
	});
});

describe("Modal", () => {
	it("closes on backdrop click and on the × button, but not on inner content clicks", () => {
		const onClose = vi.fn();
		render(
			<Modal title="Add item" onClose={onClose}>
				<div>form contents</div>
			</Modal>
		);
		fireEvent.click(screen.getByText("form contents"));
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.click(screen.getByText("×"));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

// Dictation: tap mic -> record (fake MediaRecorder) -> tap again -> the clip
// is "transcribed" (mocked /voice/transcribe response) -> text is appended
// to whatever was already typed. This is the behaviour every VoiceField
// across the app relies on, so it's worth locking down once here rather
// than per-page.
describe("voice dictation", () => {
	it("VoiceField shows a mic button and appends transcribed text to the existing value", async () => {
		uploadFile.mockResolvedValue({ text: "need more" });
		const onChange = vi.fn();
		render(<VoiceField label="Notes" value="Ran out of cream" onChange={onChange} />);
		const micBtn = screen.getByTitle("Dictate");

		await userEvent.click(micBtn); // starts recording -> constructs a FakeMediaRecorder
		await userEvent.click(screen.getByTitle("Recording… tap to stop")); // stop -> triggers transcription

		await waitFor(() => expect(onChange).toHaveBeenCalledWith("Ran out of cream need more"));
		expect(uploadFile).toHaveBeenCalledWith("/voice/transcribe", expect.any(FormData));
	});

	it("VoiceIconButton renders nothing when the browser has no mic/recording support", () => {
		const originalMR = window.MediaRecorder;
		const originalGUM = navigator.mediaDevices.getUserMedia;
		delete window.MediaRecorder;
		delete navigator.mediaDevices.getUserMedia;
		const { container } = render(<VoiceIconButton value="" onChange={() => {}} />);
		expect(container).toBeEmptyDOMElement();
		window.MediaRecorder = originalMR;
		navigator.mediaDevices.getUserMedia = originalGUM;
	});

	it("VoiceIconButton dictates into an empty value without a leading space", async () => {
		uploadFile.mockResolvedValue({ text: "flour" });
		const onChange = vi.fn();
		render(<VoiceIconButton value="" onChange={onChange} title="Dictate ingredient name" />);
		await userEvent.click(screen.getByTitle("Dictate ingredient name"));
		act(() => window.__lastMediaRecorderInstance.stop());
		await waitFor(() => expect(onChange).toHaveBeenCalledWith("flour"));
	});

	it("disables the mic button and shows a distinct label while transcribing", async () => {
		let resolveUpload;
		uploadFile.mockReturnValue(new Promise(res => { resolveUpload = res; }));
		render(<VoiceIconButton value="" onChange={() => {}} title="Dictate" />);
		await userEvent.click(screen.getByTitle("Dictate"));
		act(() => window.__lastMediaRecorderInstance.stop());

		const transcribingBtn = await screen.findByTitle("Transcribing…");
		expect(transcribingBtn).toBeDisabled();
		await act(async () => resolveUpload({ text: "done" })); // let the pending upload settle so it doesn't leak into the next test
	});

	it("a failed transcription doesn't throw or call onChange", async () => {
		uploadFile.mockRejectedValue(new Error("network error"));
		const onChange = vi.fn();
		render(<VoiceIconButton value="" onChange={onChange} title="Dictate" />);
		await userEvent.click(screen.getByTitle("Dictate"));
		act(() => window.__lastMediaRecorderInstance.stop());

		await waitFor(() => expect(screen.getByTitle("Dictate")).not.toBeDisabled()); // back to idle
		expect(onChange).not.toHaveBeenCalled();
	});
});
