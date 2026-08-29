import { useState, useEffect } from "react";
import { C } from "../theme";
import { Btn, SectionHeader, StatCard, Badge } from "../ui";
import { api, downloadFile } from "../api/client";
import { keysToCamel } from "../api/caseConvert";

// Every report here is read-only and computed server-side from data that
// already exists elsewhere (recipes, catering, inventory, orders) — so this
// page just fetches each endpoint directly rather than going through
// useApiResource, which is built around list/create/update/delete resources.
function useReport(path) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	// Same fetch-on-mount pattern as useApiResource.js's refetch — intentional.
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoading(true);
		api.get(path).then(res => setData(keysToCamel(res))).catch(() => setData(null)).finally(() => setLoading(false));
	}, [path]);
	return { data, loading };
}

const QUADRANT_INFO = {
	star: { color: C.sage, label: "Star", hint: "Profitable and popular — protect it" },
	plowhorse: { color: C.gold, label: "Plowhorse", hint: "Popular but thin margin — re-cost it" },
	puzzle: { color: "#2563EB", label: "Puzzle", hint: "Profitable but rarely sold — promote it" },
	dog: { color: C.rust, label: "Dog", hint: "Neither — candidate to cut" },
};

function ExportButton({ report }) {
	return <Btn size="sm" onClick={() => downloadFile(`/reports/export/${report}.csv`, `${report}.csv`)}>Export CSV</Btn>;
}

function ProfitabilitySection() {
	const { data, loading } = useReport("/reports/profitability");
	if (loading) return null;
	const rows = data || [];
	return (
		<div>
			<SectionHeader title="Recipe profitability & menu engineering" sub="Margin vs. popularity across catering menus — popularity is a proxy until POS data is connected"
				action={<ExportButton report="profitability" />} />
			{rows.length === 0 ? (
				<div style={{ color: C.slateL, fontSize: 13 }}>Set a menu price on your recipes to see profitability here.</div>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
					<thead>
						<tr style={{ textAlign: "left", color: C.slate, fontSize: 11, textTransform: "uppercase" }}>
							<th style={{ padding: "6px 8px" }}>Recipe</th>
							<th style={{ padding: "6px 8px" }}>Cost</th>
							<th style={{ padding: "6px 8px" }}>Menu price</th>
							<th style={{ padding: "6px 8px" }}>Margin</th>
							<th style={{ padding: "6px 8px" }}>Food cost %</th>
							<th style={{ padding: "6px 8px" }}>Quadrant</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(r => {
							const q = QUADRANT_INFO[r.quadrant];
							return (
								<tr key={r.recipeId} style={{ borderTop: `0.5px solid ${C.khaki}` }}>
									<td style={{ padding: "8px" }}>{r.name}</td>
									<td style={{ padding: "8px" }}>${r.cost.toFixed(2)}</td>
									<td style={{ padding: "8px" }}>${r.menuPrice.toFixed(2)}</td>
									<td style={{ padding: "8px", color: r.margin >= 0 ? C.sage : C.rust }}>${r.margin.toFixed(2)}</td>
									<td style={{ padding: "8px" }}>{(100 - r.marginPct).toFixed(1)}%</td>
									<td style={{ padding: "8px" }}><Badge color={q.color}>{q.label}</Badge></td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</div>
	);
}

function ValuationSection() {
	const { data, loading } = useReport("/reports/inventory-valuation");
	const food = useReport("/reports/food-cost");
	if (loading) return null;
	return (
		<div>
			<SectionHeader title="Inventory valuation & food cost" action={<ExportButton report="inventory-valuation" />} />
			<div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1rem" }}>
				<StatCard label="Total inventory value" value={`$${(data?.total ?? 0).toLocaleString()}`} />
				<StatCard label="Average food cost %" value={food.data?.averageFoodCostPct ?? "—"} unit={food.data?.averageFoodCostPct != null ? "%" : ""} />
				<StatCard label="Recipes with a menu price" value={food.data?.recipeCount ?? 0} />
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{(data?.byCategory || []).map(c => (
					<div key={c.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 10px", background: C.white, border: `0.5px solid ${C.khaki}`, borderRadius: 8 }}>
						<span>{c.category}</span>
						<span style={{ fontWeight: 600 }}>${c.value.toLocaleString()}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function SupplierComparisonSection() {
	const { data, loading } = useReport("/reports/supplier-comparison");
	if (loading) return null;
	const rows = data || [];
	return (
		<div>
			<SectionHeader title="Supplier comparison" sub="Spend and on-time delivery rate, once orders are marked received" action={<ExportButton report="supplier-comparison" />} />
			{rows.length === 0 ? (
				<div style={{ color: C.slateL, fontSize: 13 }}>No orders yet.</div>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
					<thead>
						<tr style={{ textAlign: "left", color: C.slate, fontSize: 11, textTransform: "uppercase" }}>
							<th style={{ padding: "6px 8px" }}>Supplier</th>
							<th style={{ padding: "6px 8px" }}>Orders</th>
							<th style={{ padding: "6px 8px" }}>Total spend</th>
							<th style={{ padding: "6px 8px" }}>On-time %</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r, i) => (
							<tr key={i} style={{ borderTop: `0.5px solid ${C.khaki}` }}>
								<td style={{ padding: "8px" }}>{r.supplier}</td>
								<td style={{ padding: "8px" }}>{r.orderCount}</td>
								<td style={{ padding: "8px" }}>${r.totalSpend.toLocaleString()}</td>
								<td style={{ padding: "8px" }}>{r.onTimePct != null ? `${r.onTimePct}%` : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function PurchaseTrendsSection() {
	const { data, loading } = useReport("/reports/purchase-trends");
	if (loading) return null;
	const rows = data || [];
	const max = Math.max(1, ...rows.map(r => r.spend));
	return (
		<div>
			<SectionHeader title="Purchase trends" sub="Monthly spend across all suppliers" action={<ExportButton report="purchase-trends" />} />
			{rows.length === 0 ? (
				<div style={{ color: C.slateL, fontSize: 13 }}>No orders yet.</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{rows.map(r => (
						<div key={r.month} style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<div style={{ width: 70, fontSize: 12, color: C.slate }}>{r.month}</div>
							<div style={{ flex: 1, background: C.khaki, borderRadius: 4, height: 16 }}>
								<div style={{ width: `${(r.spend / max) * 100}%`, background: C.sage, height: "100%", borderRadius: 4 }} />
							</div>
							<div style={{ width: 70, fontSize: 12, textAlign: "right" }}>${r.spend.toLocaleString()}</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function Reports() {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
			<SectionHeader title="Reports" sub="Financial intelligence — computed live from your recipes, inventory, and orders" />
			<ProfitabilitySection />
			<ValuationSection />
			<SupplierComparisonSection />
			<PurchaseTrendsSection />
		</div>
	);
}
