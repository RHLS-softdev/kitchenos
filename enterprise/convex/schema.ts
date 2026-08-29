import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/*
 * Design note: this does NOT re-declare all ~18 KitchenOS tables
 * (recipes, inventory_items, inventory_batches, ...) a second time here.
 * Two reasons:
 *
 *   1. core/backend/app/migration.py already exports every org-scoped
 *      SQLite table generically (anything with an org_id column). Mirroring
 *      that as 18 hand-written Convex tables would mean keeping two schemas
 *      in sync by hand forever, for a feature (cloud sync) that doesn't
 *      need to understand what a "recipe" is — it just needs to move rows.
 *   2. `syncedRecords` below is schema-agnostic: it stores the table name
 *      and the row's original data as JSON, so a new SQLite column, or even
 *      a whole new local table, works here with zero Convex changes.
 *
 * If a specific premium feature later needs real Convex-side querying of,
 * say, inventory levels (not just store-and-forward), that feature earns
 * its own typed table at that point — see supplierOrders below for what
 * that looks like once a feature is Convex-native rather than synced.
 */
export default defineSchema({
	// One row per Clerk Organization ("Kitchen"). This is the single source
	// of truth for subscription tier — never trust a client-supplied tier.
	kitchens: defineTable({
		clerkOrgId: v.string(),
		name: v.string(),
		tier: v.union(v.literal("free"), v.literal("premium")),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		currentPeriodEnd: v.optional(v.number()), // unix ms; used to soft-expire on missed renewals
	}).index("by_clerk_org", ["clerkOrgId"]),

	// Generic store-and-forward sync: every local SQLite row that's been
	// pushed to the cloud (via migration import, or ongoing sync) lands
	// here, tagged with which local table it came from and its original
	// row id, so it can be matched back up on any device that pulls it.
	syncedRecords: defineTable({
		kitchenId: v.id("kitchens"),
		table: v.string(), // e.g. "recipes", "inventory_items" — matches core/backend table names
		localId: v.number(), // the SQLite row's original integer id
		data: v.any(),
		updatedAt: v.number(),
	})
		.index("by_kitchen_table", ["kitchenId", "table"])
		.index("by_kitchen_table_local", ["kitchenId", "table", "localId"]),

	// A Convex-native premium feature (not synced from local — this only
	// exists in the cloud, which is the point: supplier ordering needs a
	// real-time shared source of truth across every kitchen in the org).
	supplierOrders: defineTable({
		kitchenId: v.id("kitchens"),
		supplierName: v.string(),
		items: v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() })),
		status: v.union(v.literal("draft"), v.literal("sent"), v.literal("confirmed")),
		placedByClerkUserId: v.string(),
		placedAt: v.number(),
	}).index("by_kitchen", ["kitchenId"]),
});
