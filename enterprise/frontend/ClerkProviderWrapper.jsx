// Only ever imported from a premium entry point (see enterprise/README.md's
// "keeping this out of the free build" section) — never from core/frontend's
// main.jsx. Importing this pulls in @clerk/react and convex/react,
// which is exactly the accidental-cloud-dependency Hard Rule 1 and Rule 3
// exist to prevent in the offline build.
//
// Updated to @clerk/react (Core 3): @clerk/clerk-react is deprecated, and
// the standalone Vite project (src/) is the live copy — this file stays as
// the drop-in reference for dropping the premium UI into another host.
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
