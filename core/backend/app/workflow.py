from datetime import date
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from .extensions import db
from .crud import get_org_id, make_crud_blueprint, require_roles, rows_to_csv, DEFAULT_EXPORT_ROLES
from .models import KitchenTask, TemperatureLog, ShiftNote, CateringEvent, Equipment

tasks_bp = make_crud_blueprint("kitchen_tasks", KitchenTask, "/tasks")
temperature_logs_bp = make_crud_blueprint("temperature_logs", TemperatureLog, "/temperature-logs")

# Shift notes are append-only (no edit/delete via the generic factory) —
# a small hand-written blueprint instead, so the author is always the
# logged-in user rather than whatever the client sends.
shift_notes_bp = Blueprint("shift_notes", __name__, url_prefix="/shift-notes")


@shift_notes_bp.route("", methods=["GET"])
@jwt_required()
def list_shift_notes():
	notes = (ShiftNote.query.filter_by(org_id=get_org_id())
			 .order_by(ShiftNote.created_at.desc()).all())
	return jsonify([n.to_dict() for n in notes])


@shift_notes_bp.route("", methods=["POST"])
@jwt_required()
def create_shift_note():
	data = request.get_json() or {}
	note_text = (data.get("note") or "").strip()
	if not note_text:
		return jsonify({"errors": {"note": "Note text is required"}}), 400
	note = ShiftNote(org_id=get_org_id(), author_id=int(get_jwt_identity()),
					  shift=data.get("shift") or "general", note=note_text)
	db.session.add(note)
	db.session.commit()
	return jsonify(note.to_dict()), 201


@shift_notes_bp.route("/export.csv", methods=["GET"])
@jwt_required()
@require_roles(*DEFAULT_EXPORT_ROLES)
def export_shift_notes():
	notes = (ShiftNote.query.filter_by(org_id=get_org_id())
			 .order_by(ShiftNote.created_at.desc()).all())
	csv_text = rows_to_csv([n.to_dict() for n in notes])
	return Response(csv_text, mimetype="text/csv",
					 headers={"Content-Disposition": 'attachment; filename="shift_notes.csv"'})


# Read-only kitchen calendar — merges dated items from across the app into
# one list so the frontend doesn't have to stitch four resources together.
# Not its own table: everything here already lives somewhere else.
calendar_bp = Blueprint("calendar", __name__, url_prefix="/calendar")


@calendar_bp.route("", methods=["GET"])
@jwt_required()
def calendar():
	org_id = get_org_id()
	events = []

	for c in CateringEvent.query.filter_by(org_id=org_id).all():
		if c.date:
			events.append({"date": c.date.isoformat(), "type": "catering",
							"title": c.name, "refId": c.id})

	for t in KitchenTask.query.filter_by(org_id=org_id, completed=False).all():
		if t.due_date:
			events.append({"date": t.due_date.isoformat(), "type": t.type,
							"title": t.title, "refId": t.id})

	for e in Equipment.query.filter_by(org_id=org_id).all():
		if e.next_service:
			events.append({"date": e.next_service.isoformat(), "type": "maintenance",
							"title": f"Service due: {e.name}", "refId": e.id})

	events.sort(key=lambda ev: ev["date"])
	return jsonify(events)


ALL_WORKFLOW_BLUEPRINTS = [tasks_bp, temperature_logs_bp, shift_notes_bp, calendar_bp]
