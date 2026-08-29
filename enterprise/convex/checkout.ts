import { mutation } from "./_generated/server";
import Stripe from "stripe";

/*
 * Checkout-session creation for the KitchenOS Premium upgrade — the piece
 * http.ts's comment already points at ("see enterprise/README.md for that
 * call") but was never shipped in the scaffold. Added during the v0.6
 * release pass, following the exact Lingua Mundi commercial pattern
 * (Stripe Checkout Session with mode=subscription, the org id carried
 * through BOTH session.metadata and subscription_data.metadata — http.ts
 * reads the former for checkout.session.completed and the latter for
 * customer.subscription.updated/deleted).
 *
 * STRIPE_PREMIUM_PRICE_ID comes from `npx convex env set` (the $50/mo
 * recurring Price created in the Stripe account). If unset, the checkout
 * uses an inline $50/month recurring price, so the only strictly
 * required Stripe env var is the secret key.
 *
 * The Stripe webhook (http.ts) remains the ONLY path that flips a
 * kitchen's tier to "premium" — this mutation only creates a Checkout
 * Session, it never touches kitchen.tier.
 */
export const PREMIUM_PRICE_USD = 50;

export const createCheckoutSession = mutation({
	args: {},
	handler: async (ctx) => {
		// The upgrade flow is the FIRST cloud touch for a free kitchen, so
		// this deliberately does NOT call requirePremiumKitchen (which
		// throws on free kitchens) — it only needs the org's kitchen row
		// (created by ensureKitchen) for the Stripe customer id.
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Sign in required.");
		}
		const clerkOrgId = identity.org_id as string;
		if (!clerkOrgId) {
			throw new Error("No active kitchen (Clerk Organization) selected.");
		}
		const kitchen = await ctx.db
			.query("kitchens")
			.withIndex("by_clerk_org", (q) => q.eq("clerkOrgId", clerkOrgId))
			.unique();

		const stripeSecret = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecret) {
			throw new Error("STRIPE_SECRET_KEY is not set on this Convex deployment.");
		}
		const stripe = new Stripe(stripeSecret);

		const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
		const lineItems = priceId
			? [{ price: priceId, quantity: 1 }]
			: [
					{
						price_data: {
							currency: "usd",
							product_data: {
								name: "KitchenOS Premium — per kitchen",
								description:
									"Multi-kitchen sync, supplier ordering, and cross-kitchen analytics, per kitchen per month.",
							},
							unit_amount: PREMIUM_PRICE_USD * 100,
							recurring: { interval: "month" as const },
						},
						quantity: 1,
					},
				];

		// DASHBOARD_URL is the premium app's origin; in dev the Vite app
		// runs on 5173. The webhook (not the redirect) is what actually
		// grants the tier, so these URLs only affect the UX after payment.
		const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:5173";
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: lineItems,
			success_url: `${dashboardUrl}/#billing`,
			cancel_url: `${dashboardUrl}/#billing`,
			metadata: { clerkOrgId },
			subscription_data: {
				metadata: { clerkOrgId },
			},
			customer: kitchen?.stripeCustomerId ?? undefined,
			client_reference_id: clerkOrgId,
		});

		return { url: session.url! };
	},
});
