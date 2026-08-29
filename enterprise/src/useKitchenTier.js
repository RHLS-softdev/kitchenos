import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Display-only. This decides whether to SHOW the premium UI, not whether
// a premium action is ALLOWED — every Convex mutation re-checks that for
// itself via requirePremiumKitchen (see convex/lib/premium.ts). Never wire
// a mutation's permission to this hook's return value.
export function useKitchenTier() {
	const kitchen = useQuery(api.kitchens.getMyKitchen);
	return {
		loading: kitchen === undefined,
		tier: kitchen?.tier ?? "free",
		isPremium: kitchen?.tier === "premium",
	};
}
