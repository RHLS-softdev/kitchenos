import { useState, useEffect } from "react";
import { C } from "../theme";
import { Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, SectionHeader, Badge, SearchBox, ExportButton } from "../ui";
import { api } from "../api/client";
import { keysToCamel } from "../api/caseConvert";

const BLANK_TASK = { type: "prep", title: "", notes: "", assignedTo: "", dueDate: "", recurring: "" };
const TASK_TYPES = [
	{ value: "prep", label: "Prep list" },
	{ value: "cleaning", label: "Cleaning schedule" },
	{ value: "checklist", label: "Checklist" },
];
const READING_TYPES = [
	{ value: "fridge", label: "Fridge" },
	{ value: "freezer", label: "Freezer" },
	{ value: "hot_hold", label: "Hot hold" },
	{ value: "other", label: "Other" },
];

// The kitchen calendar aggregates dated items from across the app (catering,
// tasks, equipment service) — it's a read-only endpoint, not its own
// resource, so it's fetched directly here rather than via useApiResource.
function useCalendar() {
	const [events, setEvents] = useState([]);
	useEffect(() => {
		api.get("/calendar").then(res => setEvents(keysToCamel(res || []))).catch(() => {});
	}, []);
	return events;
}

function TasksSection({ tasks, userRole, onAdd, onEdit, onDelete }) {
	const [modal, setModal] = useState(null);
	const [errors, setErrors] = useState({});
	const [filter, setFilter] = useState("prep");
	const [query, setQuery] = useState("");

	const submit = async () => {
		if (!modal.title.trim()) { setErrors({ title: "Title is required" }); return; }
		const result = modal.id ? await onEdit(modal.id, modal) : await onAdd(modal);
		if (result.ok) { setModal(null); setErrors({}); }
		else setErrors(result.fieldErrors || {});
	};

	const toggleDone = (task) => onEdit(task.id, { ...task, completed: !task.completed });
	const visible = tasks.filter(t => t.type === filter && t.title.toLowerCase().includes(query.toLowerCase()));

	return (
		<div>
			<SectionHeader title="Kitchen tasks" sub="Prep lists, cleaning schedules, and general checklists"
				action={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<SearchBox value={query} onChange={setQuery} placeholder="Search tasks..." />
					<ExportButton resource="tasks" userRole={userRole} />
					<Btn size="sm" variant="primary" onClick={() => { setModal({ ...BLANK_TASK, type: filter }); setErrors({}); }}>+ Add task</Btn>
				</div>} />
			<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
				{TASK_TYPES.map(t => (
					<button key={t.value} onClick={() => setFilter(t.value)}
						style={{ border: "none", cursor: "pointer", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
							background: filter === t.value ? C.sage : C.khaki, color: filter === t.value ? C.white : C.slate }}>
						{t.label}
					</button>
				))}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{visible.map(task => (
					<div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.white, border: `0.5px solid ${C.khaki}`, borderRadius: 10, padding: "10px 14px" }}>
						<input type="checkbox" checked={!!task.completed} onChange={() => toggleDone(task)} style={{ width: 16, height: 16 }} />
						<div style={{ flex: 1 }}>
							<div style={{ fontSize: 13, fontWeight: 600, textDecoration: task.completed ? "line-through" : "none", color: task.completed ? C.slateL : C.ink }}>{task.title}</div>
							{task.notes && <div style={{ fontSize: 12, color: C.slate }}>{task.notes}</div>}
							<div style={{ fontSize: 11, color: C.slateL, marginTop: 2 }}>
								{task.assignedTo && <>Assigned: {task.assignedTo} · </>}
								{task.dueDate && <>Due: {task.dueDate}</>}
								{task.recurring && <> · Repeats {task.recurring}</>}
							</div>
						</div>
						<Btn size="sm" onClick={() => { setModal(task); setErrors({}); }}>Edit</Btn>
						<Btn size="sm" variant="danger" onClick={() => onDelete(task.id)}>Delete</Btn>
					</div>
				))}
				{visible.length === 0 && <div style={{ color: C.slateL, fontSize: 13 }}>{query?"No tasks match your search.":"Nothing here yet."}</div>}
			</div>
			{modal && (
				<Modal title={modal.id ? "Edit task" : "Add task"} onClose={() => setModal(null)}>
					<FGrid cols={1}><VoiceField label="Title" value={modal.title} onChange={v => setModal(p => ({ ...p, title: v }))} error={errors.title} /></FGrid>
					<FGrid cols={2}>
						<Sel label="Type" value={modal.type} onChange={v => setModal(p => ({ ...p, type: v }))} options={TASK_TYPES} />
						<VoiceField label="Assigned to" value={modal.assignedTo || ""} onChange={v => setModal(p => ({ ...p, assignedTo: v }))} placeholder="Name or role" />
						<Field label="Due date" value={modal.dueDate || ""} onChange={v => setModal(p => ({ ...p, dueDate: v }))} type="date" />
						<Sel label="Repeats" value={modal.recurring || ""} onChange={v => setModal(p => ({ ...p, recurring: v }))} options={["", "daily", "weekly"]} />
					</FGrid>
					<VoiceField label="Notes" value={modal.notes || ""} onChange={v => setModal(p => ({ ...p, notes: v }))} />
					<div style={{ display: "flex", gap: 8, marginTop: "1.25rem", paddingTop: "1rem", borderTop: `0.5px solid ${C.khaki}` }}>
						<Btn variant="primary" onClick={submit}>Save</Btn>
						<Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
					</div>
				</Modal>
			)}
		</div>
	);
}

function TemperatureSection({ logs, userRole, onAdd }) {
	const [modal, setModal] = useState(null);
	const [errors, setErrors] = useState({});
	const blank = { location: "", readingType: "fridge", tempC: "", notes: "" };

	const submit = async () => {
		if (!modal.location.trim()) { setErrors({ location: "Location is required" }); return; }
		const result = await onAdd({ ...modal, tempC: +modal.tempC });
		if (result.ok) { setModal(null); setErrors({}); }
		else setErrors(result.fieldErrors || {});
	};

	const sorted = [...logs].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt)).slice(0, 15);

	return (
		<div>
			<SectionHeader title="Temperature logs" sub="HACCP-style fridge / freezer / hot-hold checks"
				action={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<ExportButton resource="temperature-logs" userRole={userRole} />
					<Btn size="sm" variant="primary" onClick={() => { setModal({ ...blank }); setErrors({}); }}>+ Log reading</Btn>
				</div>} />
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{sorted.map(log => (
					<div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.white, border: `0.5px solid ${C.khaki}`, borderRadius: 10, padding: "8px 14px" }}>
						<Pill variant={log.withinRange ? "ok" : "critical"}>{log.withinRange ? "OK" : "Out of range"}</Pill>
						<div style={{ flex: 1 }}>
							<span style={{ fontWeight: 600, fontSize: 13 }}>{log.location}</span>
							<span style={{ fontSize: 12, color: C.slate, marginLeft: 8 }}>{log.readingType.replace("_", " ")} — {log.tempC}°C</span>
						</div>
						<div style={{ fontSize: 11, color: C.slateL }}>{new Date(log.recordedAt).toLocaleString()}</div>
					</div>
				))}
				{sorted.length === 0 && <div style={{ color: C.slateL, fontSize: 13 }}>No readings logged yet.</div>}
			</div>
			{modal && (
				<Modal title="Log temperature reading" onClose={() => setModal(null)}>
					<FGrid cols={2}>
						<VoiceField label="Location" value={modal.location} onChange={v => setModal(p => ({ ...p, location: v }))} placeholder="Walk-in fridge 1" error={errors.location} />
						<Sel label="Reading type" value={modal.readingType} onChange={v => setModal(p => ({ ...p, readingType: v }))} options={READING_TYPES} />
						<Field label="Temperature (°C)" value={modal.tempC} onChange={v => setModal(p => ({ ...p, tempC: v }))} type="number" />
					</FGrid>
					<VoiceField label="Notes" value={modal.notes} onChange={v => setModal(p => ({ ...p, notes: v }))} />
					<div style={{ display: "flex", gap: 8, marginTop: "1.25rem", paddingTop: "1rem", borderTop: `0.5px solid ${C.khaki}` }}>
						<Btn variant="primary" onClick={submit}>Save</Btn>
						<Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
					</div>
				</Modal>
			)}
		</div>
	);
}

function ShiftNotesSection({ notes, userRole, onAdd }) {
	const [draft, setDraft] = useState("");
	const [shift, setShift] = useState("general");

	const submit = async () => {
		if (!draft.trim()) return;
		const result = await onAdd({ shift, note: draft });
		if (result.ok) setDraft("");
	};

	const sorted = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

	return (
		<div>
			<SectionHeader title="Shift notes" sub="A simple team feed — handoffs, 86s, reminders for the next shift"
				action={<ExportButton resource="shift-notes" filename="shift_notes.csv" userRole={userRole} />} />
			<div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-end" }}>
				<Sel label="" value={shift} onChange={setShift} options={["general", "morning", "afternoon", "evening"]} />
				<div style={{ flex: 1 }}>
					<VoiceField label="" value={draft} onChange={setDraft} placeholder="What does the next shift need to know?" />
				</div>
				<Btn variant="primary" onClick={submit}>Post</Btn>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
				{sorted.map(n => (
					<div key={n.id} style={{ background: C.white, border: `0.5px solid ${C.khaki}`, borderRadius: 10, padding: "8px 14px" }}>
						<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
							<Badge color={C.sage}>{n.shift}</Badge>
							<span style={{ fontSize: 11, color: C.slateL }}>{n.authorEmail} · {new Date(n.createdAt).toLocaleString()}</span>
						</div>
						<div style={{ fontSize: 13 }}>{n.note}</div>
					</div>
				))}
				{sorted.length === 0 && <div style={{ color: C.slateL, fontSize: 13 }}>No notes yet — post the first one above.</div>}
			</div>
		</div>
	);
}

function UpcomingWidget() {
	const events = useCalendar();
	if (events.length === 0) return null;
	return (
		<div style={{ background: C.cream, border: `0.5px solid ${C.khaki}`, borderRadius: 12, padding: "1rem 1.25rem" }}>
			<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Upcoming</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{events.slice(0, 8).map((e, i) => (
					<div key={i} style={{ display: "flex", gap: 10, fontSize: 12, color: C.slate }}>
						<span style={{ width: 90, flexShrink: 0, color: C.slateL }}>{e.date}</span>
						<Badge color={e.type === "catering" ? C.rust : e.type === "maintenance" ? C.gold : C.sage}>{e.type}</Badge>
						<span>{e.title}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export default function Workflow({ tasks, userRole, onAddTask, onEditTask, onDeleteTask, tempLogs, onAddTempLog, shiftNotes, onAddShiftNote }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
			<UpcomingWidget />
			<TasksSection tasks={tasks} userRole={userRole} onAdd={onAddTask} onEdit={onEditTask} onDelete={onDeleteTask} />
			<TemperatureSection logs={tempLogs} userRole={userRole} onAdd={onAddTempLog} />
			<ShiftNotesSection notes={shiftNotes} userRole={userRole} onAdd={onAddShiftNote} />
		</div>
	);
}
