"""
Data backfill for orgs that existed before the locations feature. New orgs
get a default location immediately at registration (see app/auth.py) — this
only matters for an org that was already sitting in someone's local
kitchen.db before this version, whose db_upgrade.py-added location_id
column just landed as NULL on every existing inventory row.

Runs at every startup (see run_sidecar.py) rather than as a one-off
migration script, since the desktop build doesn't have a "run this once"
mechanism to hook into anyway — it's cheap and fully idempotent, so running
it every launch is simpler than tracking whether it already ran.
"""
from .models import Organization, Location, InventoryItem


def ensure_default_locations(db):
    for org in Organization.query.all():
        default = Location.query.filter_by(org_id=org.id, is_default=True).first()
        if not default:
            default = Location.query.filter_by(org_id=org.id).first()
            if not default:
                default = Location(org_id=org.id, name="Main Kitchen", is_default=True)
                db.session.add(default)
                db.session.flush()  # need default.id below
            else:
                default.is_default = True

        (InventoryItem.query
         .filter_by(org_id=org.id, location_id=None)
         .update({"location_id": default.id}))

    db.session.commit()
