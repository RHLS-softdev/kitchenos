import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

/*
 * Point your Stripe webhook (Dashboard -> Developers -> Webhooks) at:
 *   https://<your-deployment>.convex.site/stripe/webhook
 * Events to send: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted.
 *
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set via
 * `npx convex env set` — see enterprise/README.md. Never hardcode them.
 *
 * This is the ONLY code path in the entire app allowed to set a kitchen's
 * tier to "premium" — kitchens.setSubscriptionStatus is an internalMutation,
 * unreachable from any client, so a paying customer's tier can only ever
 * come from Stripe actually confirming payment.
 */
const http = httpRouter();

http.route({
	path: "/stripe/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
		const signature = request.headers.get("stripe-signature")!;
		const body = await request.text();

		let event: Stripe.Event;
		try {
			event = await stripe.webhooks.constructEventAsync(
				body,
				signature,
				process.env.STRIPE_WEBHOOK_SECRET!
			);
		} catch (err) {
			return new Response(`Webhook signature verification failed`, { status: 400 });
		}

		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				// clerkOrgId is passed through as Checkout Session metadata when
				// the desktop app creates the checkout session (enterprise/frontend
				// upgrade flow) — see enterprise/README.md for that call.
				const clerkOrgId = session.metadata?.clerkOrgId;
				if (clerkOrgId) {
					await ctx.runMutation(internal.kitchens.setSubscriptionStatus, {
						clerkOrgId,
						tier: "premium",
						stripeCustomerId: session.customer as string,
						stripeSubscriptionId: session.subscription as string,
					});
				}
				break;
			}
			case "customer.subscription.updated": {
				const sub = event.data.object as Stripe.Subscription;
				const clerkOrgId = sub.metadata?.clerkOrgId;
				if (clerkOrgId) {
					await ctx.runMutation(internal.kitchens.setSubscriptionStatus, {
						clerkOrgId,
						tier: sub.status === "active" || sub.status === "trialing" ? "premium" : "free",
						currentPeriodEnd: sub.current_period_end * 1000,
					});
				}
				break;
			}
			case "customer.subscription.deleted": {
				const sub = event.data.object as Stripe.Subscription;
				const clerkOrgId = sub.metadata?.clerkOrgId;
				if (clerkOrgId) {
					await ctx.runMutation(internal.kitchens.setSubscriptionStatus, {
						clerkOrgId,
						tier: "free",
					});
				}
				break;
			}
		}

		return new Response(null, { status: 200 });
	}),
});

export default http;
