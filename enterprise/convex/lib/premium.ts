import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/*
 * Hard Rule 2, enforced here and only here: "Premium features are NOT
 * gated by client-side booleans. Any Convex mutation for a premium
 * feature MUST check the caller's Clerk Organization subscription tier
 * and throw a 403 error if unauthorized."
 *
 * Every premium query/mutation should start with:
 *   const kitchen = await requirePremiumKitchen(ctx);
 * and use `kitchen._id` for all its reads/writes. Nothing about a
 * feature being "premium" should ever be decided anywhere else —
 * not in the React app, not by trusting a tier value the client sends.
 *
 * Note: this queries the kitchens table directly instead of going
 * through api.kitchens.getByClerkOrgId — deliberately, so this module
 * doesn't import ../_generated/api (which would create a module-type
 * cycle with every premium feature file that imports this one).
 */
export async function requirePremiumKitchen(
	ctx: QueryCtx | MutationCtx,
): Promise<Doc<"kitchens">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 401, message: "Sign in required." });
	}

	// Clerk's Convex JWT template includes the active organization's id as
	// `org_id` in the token — this comes from Clerk, not from the client,
	// so it can't be spoofed by editing request payloads.
	const clerkOrgId = identity.org_id as string | undefined;
	if (!clerkOrgId) {
		throw new ConvexError({
			code: 403,
			message: "No active kitchen (Clerk Organization) selected.",
		});
	}

	const kitchen = await ctx.db
		.query("kitchens")
		.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
		.unique();
	if (!kitchen) {
		throw new ConvexError({ code: 403, message: "This kitchen has no cloud account yet." });
	}

	const notExpired = !kitchen.currentPeriodEnd || kitchen.currentPeriodEnd > Date.now();
	if (kitchen.tier !== "premium" || !notExpired) {
		throw new ConvexError({
			code: 403,
			message: "This feature requires an active KitchenOS Premium subscription.",
		});
	}

	return kitchen;
}
