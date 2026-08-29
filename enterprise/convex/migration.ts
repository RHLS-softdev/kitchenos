import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePremiumKitchen } from "./lib/premium";

// The desktop app calls this once, right after a user subscribes, with the
// exact JSON that GET /migration/export (core/backend/app/migration.py)
// produced locally. Deliberately reuses the same syncedRecords table and
// upsert-by-(table, localId) shape as ongoing sync (sync.ts) — a first
// import and a later re-sync are the same operation as far as Convex is
// concerned, so there's no separate "migrated" table to keep consistent
// with the synced one.
export const importKitchenData = mutation({
	args: {
		exportPayload: v.object({
			schema_version: v.number(),
			exported_at: v.string(),
			tables: v.record(v.string(), v.array(v.record(v.string(), v.any()))),
		}),
	},
	handler: async (ctx, { exportPayload }) => {
		const kitchen = await requirePremiumKitchen(ctx);

		if (exportPayload.schema_version !== 1) {
			throw new Error(
				`Unsupported export schema_version ${exportPayload.schema_version} — ` +
					"update this mutation and core/backend/app/migration.py together."
			);
		}

		const now = Date.now();
		let imported = 0;

		for (const [table, rows] of Object.entries(exportPayload.tables)) {
			for (const row of rows) {
				const localId = row.id as number;
				const existing = await ctx.db
					.query("syncedRecords")
					.withIndex("by_kitchen_table_local", (q) =>
						q.eq("kitchenId", kitchen._id).eq("table", table).eq("localId", localId)
					)
					.unique();

				if (existing) {
					await ctx.db.patch(existing._id, { data: row, updatedAt: now });
				} else {
					await ctx.db.insert("syncedRecords", {
						kitchenId: kitchen._id,
						table,
						localId,
						data: row,
						updatedAt: now,
					});
				}
				imported++;
			}
		}

		return { imported };
	},
});
