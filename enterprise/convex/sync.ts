import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requirePremiumKitchen } from "./lib/premium";

// One kitchen (device) pushes its local rows for a given table up.
// Last-write-wins per (table, localId) — fine for the kitchens-with-2-3
// devices scale this targets; a real conflict-resolution UI is future
// scope, not something to invent speculatively here.
export const pushRecords = mutation({
	args: {
		table: v.string(),
		records: v.array(v.object({ localId: v.number(), data: v.any() })),
	},
	handler: async (ctx, { table, records }) => {
		const kitchen = await requirePremiumKitchen(ctx);
		const now = Date.now();

		for (const record of records) {
			const existing = await ctx.db
				.query("syncedRecords")
				.withIndex("by_kitchen_table_local", (q) =>
					q.eq("kitchenId", kitchen._id).eq("table", table).eq("localId", record.localId)
				)
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, { data: record.data, updatedAt: now });
			} else {
				await ctx.db.insert("syncedRecords", {
					kitchenId: kitchen._id,
					table,
					localId: record.localId,
					data: record.data,
					updatedAt: now,
				});
			}
		}
	},
});

// Another device for the same kitchen (org) pulls everything changed
// since its last sync, for one table at a time (mirrors how the local
// SQLite side is organized — one table's worth of rows at a time keeps
// payloads small and lets the desktop app show per-table sync progress).
export const pullRecords = query({
	args: { table: v.string(), since: v.optional(v.number()) },
	handler: async (ctx, { table, since }) => {
		const kitchen = await requirePremiumKitchen(ctx);
		const rows = await ctx.db
			.query("syncedRecords")
			.withIndex("by_kitchen_table", (q) => q.eq("kitchenId", kitchen._id).eq("table", table))
			.collect();
		return since ? rows.filter((r) => r.updatedAt > since) : rows;
	},
});

// Cloud-side summary for the premium dashboard's sync panel: how many
// synced records exist per local table, so a kitchen can see at a glance
// what has reached the cloud (and that an import actually landed).
export const listSyncedTables = query({
	args: {},
	handler: async (ctx) => {
		const kitchen = await requirePremiumKitchen(ctx);
		const rows = await ctx.db
			.query("syncedRecords")
			.withIndex("by_kitchen_table", (q) => q.eq("kitchenId", kitchen._id))
			.collect();
		const byTable = new Map<string, number>();
		for (const row of rows) byTable.set(row.table, (byTable.get(row.table) ?? 0) + 1);
		return [...byTable.entries()].map(([table, count]) => ({ table, count }));
	},
});
