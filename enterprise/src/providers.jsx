// Wires Clerk auth + Convex together for the premium web app. Updated
// from the scaffolded frontend/ClerkProviderWrapper.jsx: @clerk/clerk-react
// (v5) is deprecated — Clerk renamed it to @clerk/react in Core 3, which
// is what the Lingua Mundi commercial layer confirmed as current.
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function EnterpriseProviders({ children }) {
	return (
		<ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
			<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
				{children}
			</ConvexProviderWithClerk>
		</ClerkProvider>
	);
}
