import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// Public: any signed-in user can look up their own org's tier, to decide
// whether to show premium UI. This is a READ, not the security boundary —
// see lib/premium.ts's requirePremiumKitchen for the actual enforcement.
// Showing/hiding a button based on this is fine; a mutation trusting it
// instead of calling requirePremiumKitchen would not be.
export const getByClerkOrgId = query({
	args: { clerkOrgId: v.string() },
	handler: async (ctx, { clerkOrgId }) => {
		// Membership check: only return the kitchen if the caller is a
		// member of the requested Clerk Organization (public query).
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.org_id !== clerkOrgId) return null;
		return await ctx.db
			.query("kitchens")
			.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
			.unique();
	},
});

export const getMyKitchen = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		const clerkOrgId = identity?.org_id as string | undefined;
		if (!clerkOrgId) return null;
		return await ctx.db
			.query("kitchens")
			.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
			.unique();
	},
});

// Called the first time a kitchen touches the cloud at all (e.g. right
// before the subscribe checkout flow starts), so there's a `kitchens` row
// to attach a Stripe customer id to. Starts at tier "free" on purpose —
// the Stripe webhook (http.ts) is the only thing allowed to flip it to
// "premium", after payment actually succeeds.
export const ensureKitchen = mutation({
	args: { clerkOrgId: v.string(), name: v.string() },
	handler: async (ctx, { clerkOrgId, name }) => {
		const existing = await ctx.db
			.query("kitchens")
			.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
			.unique();
		if (existing) return existing._id;
		return await ctx.db.insert("kitchens", { clerkOrgId, name, tier: "free" });
	},
});

// Internal-only (see http.ts) — the Stripe webhook is the sole writer of
// tier/subscription fields. Nothing reachable from the client can call an
// internalMutation directly, which is what keeps this safe from a user
// just… deciding they're premium.
export const setSubscriptionStatus = internalMutation({
	args: {
		clerkOrgId: v.string(),
		tier: v.union(v.literal("free"), v.literal("premium")),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		currentPeriodEnd: v.optional(v.number()),
	},
	handler: async (ctx, { clerkOrgId, ...patch }) => {
		const kitchen = await ctx.db
			.query("kitchens")
			.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
			.unique();
		if (!kitchen) return; // webhook arrived before ensureKitchen ran client-side; safe to drop
		await ctx.db.patch(kitchen._id, patch);
	},
});
