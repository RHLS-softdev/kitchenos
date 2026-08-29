import { useKitchenTier } from "./useKitchenTier";

export function PremiumGate({ children, fallback }) {
	const { loading, isPremium } = useKitchenTier();
	if (loading) return null;
	if (isPremium) return children;
	return fallback ?? <UpgradePrompt />;
}

function UpgradePrompt() {
	return (
		<div className="premium-gate-upsell">
			<p>This feature is part of KitchenOS Premium ($50/month per kitchen).</p>
			<p>Multi-kitchen sync and supplier ordering are included; cross-kitchen analytics is on the roadmap.</p>
		</div>
	);
}
