import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requirePremiumKitchen } from "./lib/premium";

// Reference implementation of "Security by Backend" (Hard Rule 2). Copy
// this shape for AI analytics / any other premium feature: call
// requirePremiumKitchen first, scope every read/write to kitchen._id,
// never trust an org/kitchen id argument from the client for anything
// security-relevant (kitchenId here comes from the verified JWT via
// requirePremiumKitchen, not from `args`).
export const placeOrder = mutation({
	args: {
		supplierName: v.string(),
		items: v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() })),
	},
	handler: async (ctx, { supplierName, items }) => {
		const kitchen = await requirePremiumKitchen(ctx);
		const identity = await ctx.auth.getUserIdentity();

		return await ctx.db.insert("supplierOrders", {
			kitchenId: kitchen._id,
			supplierName,
			items,
			status: "draft",
			placedByClerkUserId: identity!.subject,
			placedAt: Date.now(),
		});
	},
});

export const listOrders = query({
	args: {},
	handler: async (ctx) => {
		const kitchen = await requirePremiumKitchen(ctx);
		return await ctx.db
			.query("supplierOrders")
			.withIndex("by_kitchen", (q) => q.eq("kitchenId", kitchen._id))
			.order("desc")
			.collect();
	},
});
