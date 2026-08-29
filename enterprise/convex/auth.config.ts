// Tells Convex to trust JWTs issued by your Clerk instance.
// CLERK_JWT_ISSUER_DOMAIN is set via `npx convex env set` — see enterprise/README.md.
// You also need a Clerk JWT template named exactly "convex" (Clerk dashboard
// -> JWT Templates -> New template -> Convex). That name is not configurable
// on the Convex side without also changing the `applicationID` here.
export default {
	providers: [
		{
			domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
			applicationID: "convex",
		},
	],
};
