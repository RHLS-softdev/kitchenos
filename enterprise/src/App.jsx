import { useEffect, useState } from "react";
import {
	Show, SignIn, SignUp, UserButton, useAuth, useOrganization, useOrganizationList,
} from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useKitchenTier } from "./useKitchenTier";
import "./styles.css";

/*
 * KitchenOS Premium dashboard — the premium tier's web app (enterprise/).
 *
 * Hard Rule 2 (security by backend): every panel below is display +
 * convenience. All real enforcement happens in Convex via
 * requirePremiumKitchen — the UI gates what it SHOWS, never what is
 * ALLOWED.
 *
 * Hard Rule 4 (seamless migration): "Import my local data" feeds the
 * exact JSON from the free app's GET /migration/export into
 * api.migration.importKitchenData, which upserts into the same
 * syncedRecords table as ongoing sync.
 */

function AuthScreen({ mode }) {
	return (
		<div className="auth-screen">
			<div className="auth-card">
				<h1 className="brand">KitchenOS Premium</h1>
				<p className="tagline">Multi-kitchen sync, supplier ordering, and cross-kitchen analytics.</p>
				{mode === "sign-up" ? <SignUp /> : <SignIn />}
			</div>
		</div>
	);
}

/** Upsell shown inside a premium feature's panel when the kitchen is on Free. */
function PremiumUpsell({ feature }) {
	return (
		<div className="upsell">
			<p>
				<strong>{feature}</strong> is part of KitchenOS Premium ($50/month per kitchen).
			</p>
			<p>Upgrade above to unlock it — your local data stays local until you export it.</p>
		</div>
	);
}

/** Import the free app's GET /migration/export JSON into the cloud. */
function MigrationPanel() {
	const importKitchenData = useMutation(api.migration.importKitchenData);
	const [status, setStatus] = useState(null);
	const [error, setError] = useState(null);

	async function handleFile(file) {
		setStatus(null);
		setError(null);
		try {
			const payload = JSON.parse(await file.text());
			if (typeof payload.schema_version !== "number" || typeof payload.tables !== "object") {
				throw new Error("That doesn't look like a KitchenOS export — it must be the JSON from “Export my data” in the desktop app.");
			}
			const result = await importKitchenData({ exportPayload: payload });
			setStatus(`Imported ${result.imported} rows from ${file.name}.`);
		} catch (err) {
			console.error("[premium] import failed:", err);
			setError(err instanceof Error ? err.message : String(err));
		}
	}

	return (
		<section className="card">
			<h2>Import my local data</h2>
			<p className="muted">
				In the desktop app: Billing → export isn't a button — use <code>GET /migration/export</code> from a
				terminal, or the desktop's Export action. Pick that JSON file here to push it to the cloud.
			</p>
			<input type="file" accept="application/json,.json" onChange={(e) => {
				const file = e.target.files?.[0];
				if (file) void handleFile(file);
			}} />
			{status && <p className="ok">{status}</p>}
			{error && <p className="err">{error}</p>}
		</section>
	);
}

/** Cloud-side summary: what has reached Convex, per local table. */
function SyncPanel() {
	const tables = useQuery(api.sync.listSyncedTables);
	return (
		<section className="card">
			<h2>Cloud sync</h2>
			<p className="muted">Rows stored in the cloud for this kitchen, by local table (last-write-wins per row).</p>
			{tables === undefined ? (
				<p>Loading…</p>
			) : tables.length === 0 ? (
				<p className="muted">Nothing synced yet — import your local data above (or push from another device).</p>
			) : (
				<table className="sync-table">
					<thead>
						<tr><th>Table</th><th>Rows in cloud</th></tr>
					</thead>
					<tbody>
						{tables.map((t) => (
							<tr key={t.table}><td>{t.table}</td><td>{t.count}</td></tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}

/** Convex-native premium feature: supplier orders (shared source of truth). */
function SupplierOrdersPanel() {
	const orders = useQuery(api.supplierOrders.listOrders);
	const placeOrder = useMutation(api.supplierOrders.placeOrder);
	const [supplier, setSupplier] = useState("");
	const [itemName, setItemName] = useState("");
	const [qty, setQty] = useState(1);
	const [unit, setUnit] = useState("kg");
	const [message, setMessage] = useState(null);

	async function handlePlace() {
		if (!supplier.trim() || !itemName.trim()) return;
		try {
			await placeOrder({ supplierName: supplier.trim(), items: [{ name: itemName.trim(), qty, unit }] });
			setMessage("Order placed (draft).");
			setItemName("");
			setQty(1);
		} catch (err) {
			console.error("[premium] order failed:", err);
			setMessage("Couldn't place the order — check your connection and that you're still Premium.");
		}
	}

	return (
		<section className="card">
			<h2>Supplier ordering</h2>
			<p className="muted">Cloud-native — one shared source of truth across every device in the kitchen.</p>

			<div className="order-form">
				<input placeholder="Supplier name" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
				<input placeholder="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
				<input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
				<select value={unit} onChange={(e) => setUnit(e.target.value)}>
					{["kg", "g", "l", "ml", "unit", "box", "case"].map((u) => <option key={u} value={u}>{u}</option>)}
				</select>
				<button className="btn" onClick={handlePlace}>Place order</button>
			</div>
			{message && <p className="muted">{message}</p>}

			{orders === undefined ? (
				<p>Loading orders…</p>
			) : orders.length === 0 ? (
				<p className="muted">No orders yet.</p>
			) : (
				<ul className="order-list">
					{orders.map((order) => (
						<li key={order._id}>
							<strong>{order.supplierName}</strong>
							<span className="muted">
								{" "}· {order.status} · {order.items.map((i) => `${i.qty}${i.unit} ${i.name}`).join(", ")}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export default function App() {
	const { isSignedIn, orgId } = useAuth();
	const { organization, isLoaded: orgLoaded } = useOrganization();
	const orgList = useOrganizationList();
	const ensureKitchen = useMutation(api.kitchens.ensureKitchen);
	const { loading, kitchen, isPremium } = useKitchenTier();
	const createCheckoutSession = useMutation(api.checkout.createCheckoutSession);
	const [hash, setHash] = useState(window.location.hash);
	const [newKitchenName, setNewKitchenName] = useState("");
	const [orgError, setOrgError] = useState(null);

	useEffect(() => {
		const onHashChange = () => setHash(window.location.hash);
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	// Signed-in + signed-out hash cleanup (avoids the sign-in page looping).
	useEffect(() => {
		if (isSignedIn && (hash === "#/sign-in" || hash === "#/sign-up")) {
			history.replaceState(null, "", window.location.pathname);
			setHash("");
		}
	}, [isSignedIn, hash]);

	useEffect(() => {
		if (orgId) {
			ensureKitchen({ clerkOrgId: orgId, name: organization?.name ?? "Kitchen" });
		}
	}, [orgId, organization?.name, ensureKitchen]);

	async function upgrade() {
		try {
			const { url } = await createCheckoutSession();
			window.location.href = url;
		} catch (err) {
			console.error("[premium] checkout failed:", err);
			window.alert("Couldn't start checkout — the payment connection isn't ready yet.");
		}
	}

	async function createKitchen() {
		const name = newKitchenName.trim();
		if (!name) return;
		setOrgError(null);
		try {
			const created = await orgList.createOrganization({ name });
			await orgList.setActive({ organization: created.id });
			setNewKitchenName("");
		} catch (err) {
			console.error("[premium] create organization failed:", err);
			setOrgError("Couldn't create the kitchen — your plan may limit organizations, or you may already have one.");
		}
	}

	if (!isSignedIn && hash === "#/sign-in") return <AuthScreen mode="sign-in" />;
	if (!isSignedIn && hash === "#/sign-up") return <AuthScreen mode="sign-up" />;

	return (
		<div className="dashboard">
			<header className="topbar">
				<span className="brand">KitchenOS Premium</span>
				<Show when="signed-out">
					<div className="auth-actions">
						<a className="btn" href="#/sign-in">Sign in</a>
						<a className="btn btn-primary" href="#/sign-up">Sign up</a>
					</div>
				</Show>
				<Show when="signed-in">
					<UserButton />
				</Show>
			</header>

			<main className="content">
				<Show when="signed-out">
					<div className="hero">
						<h1>KitchenOS Premium</h1>
						<p>
							Everything in the free desktop app, plus multi-kitchen sync, supplier ordering, and
							cross-kitchen analytics — $50/month per kitchen.
						</p>
						<div className="hero-actions">
							<a className="btn btn-primary" href="#/sign-up">Get started</a>
							<a className="btn" href="#/sign-in">I have an account</a>
						</div>
					</div>
				</Show>

				<Show when="signed-in">
					{/* One Clerk Organization per kitchen; premium features need an active org. */}
					{orgLoaded && !orgId && (
						<section className="card">
							<h2>Create your kitchen</h2>
							<p className="muted">
								Each kitchen is its own organization — Premium is billed per kitchen. Create one to
								continue.
							</p>
							<div className="order-form">
								<input
									placeholder="Kitchen name (e.g. La Cocina)"
									value={newKitchenName}
									onChange={(e) => setNewKitchenName(e.target.value)}
								/>
								<button className="btn btn-primary" onClick={createKitchen}>Create kitchen</button>
							</div>
							{orgError && <p className="err">{orgError}</p>}
							{orgList.userMemberships && orgList.userMemberships.length > 0 && (
								<div className="muted" style={{ marginTop: 12 }}>
									Or switch to an existing kitchen:{" "}
									{orgList.userMemberships.map((m) => (
										<button key={m.organization.id} className="btn" onClick={() => orgList.setActive({ organization: m.organization.id })}>
											{m.organization.name}
										</button>
									))}
								</div>
							)}
						</section>
					)}

					{orgId && (
						<section className="card billing">
							<h2>Plan</h2>
							{loading ? (
								<p>Loading your plan…</p>
							) : (
								<div className="plan-row">
									<p>
										<strong>{organization?.name}</strong> — current plan:{" "}
										<strong>{isPremium ? "Premium" : "Free"}</strong>
										{isPremium && kitchen?.currentPeriodEnd ? (
											<span className="muted">
												{" "}— renews {new Date(kitchen.currentPeriodEnd).toLocaleDateString()}
											</span>
										) : null}
									</p>
									{!isPremium && (
										<button className="btn btn-primary" onClick={upgrade}>
											Upgrade to Premium — $50/mo
										</button>
									)}
								</div>
							)}
						</section>
					)}

					{orgId && !isPremium && (
						<div className="upsell-wide">
							Premium unlocks multi-kitchen sync, supplier ordering, and cross-kitchen analytics. Your free
							desktop app keeps working offline either way.
						</div>
					)}

					{orgId && (
						<>
							{isPremium ? <MigrationPanel /> : <PremiumUpsell feature="Cloud migration & sync" />}
							{isPremium ? <SyncPanel /> : <PremiumUpsell feature="Multi-kitchen sync" />}
							{isPremium ? <SupplierOrdersPanel /> : <PremiumUpsell feature="Supplier ordering" />}
						</>
					)}
				</Show>
			</main>
		</div>
	);
}
