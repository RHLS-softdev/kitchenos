import { useState } from "react";
import { C } from "../theme";
import { CATEGORIES } from "../lib/utils";
import { Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, SectionHeader, SearchBox, ExportButton } from "../ui";
import Icon from "../icons/Icon";

const blankGramsRow = { unit: "", grams: "" };

const IngredientForm = ({ initial, onSubmit, onClose }) => {
	const blank = {
		name: "", category: "Other", defaultUnit: "g",
		kcalPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0,
		allergens: "", notes: "",
	};
	const [f, setF] = useState(initial ? {
		...blank, ...initial, allergens: (initial.allergens || []).join(", "),
	} : blank);
	const [gramsRows, setGramsRows] = useState(
		initial?.gramsPerUnit ? Object.entries(initial.gramsPerUnit).map(([unit, grams]) => ({ unit, grams: String(grams) }))
			: [{ unit: "g", grams: "1" }]
	);
	const [errors, setErrors] = useState({});
	const set = (k, v) => setF(p => ({ ...p, [k]: v }));
	const setGramsRow = (i, k, v) => setGramsRows(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

	const submit = async () => {
		if (!f.name.trim()) { setErrors({ name: "Ingredient name is required" }); return; }
		const gramsPerUnit = Object.fromEntries(
			gramsRows.filter(r => r.unit.trim() && r.grams !== "").map(r => [r.unit.trim().toLowerCase(), +r.grams])
		);
		const result = await onSubmit({
			...f, gramsPerUnit,
			kcalPer100g: +f.kcalPer100g, proteinPer100g: +f.proteinPer100g,
			carbsPer100g: +f.carbsPer100g, fatPer100g: +f.fatPer100g,
			allergens: f.allergens.split(",").map(x => x.trim()).filter(Boolean),
		});
		if (!result.ok) setErrors(result.fieldErrors || {});
	};

	return (
		<div>
			<div style={{ background: C.goldXL, border: `0.5px solid ${C.gold}44`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.gold, marginBottom: "0.75rem", display: "flex", gap: 8, alignItems: "flex-start" }}>
				<Icon name="info-circle" size={15} style={{ marginTop: 1, flexShrink: 0 }} />
				<span>Entering this manually keeps it unverified. Verified data (with a source and reviewer) can only be marked so by an owner — see the checkmark action on each row.</span>
			</div>
			<FGrid cols={2}>
				<VoiceField label="Ingredient name *" value={f.name} onChange={v => set("name", v)} required error={errors.name} />
				<Sel label="Category" value={f.category} onChange={v => set("category", v)} options={CATEGORIES} />
			</FGrid>
			<FGrid cols={4}>
				<Field label="Calories/100g" value={f.kcalPer100g} onChange={v => set("kcalPer100g", v)} type="number" />
				<Field label="Protein/100g" value={f.proteinPer100g} onChange={v => set("proteinPer100g", v)} type="number" />
				<Field label="Carbs/100g" value={f.carbsPer100g} onChange={v => set("carbsPer100g", v)} type="number" />
				<Field label="Fat/100g" value={f.fatPer100g} onChange={v => set("fatPer100g", v)} type="number" />
			</FGrid>
			<VoiceField label="Allergens (comma-separated)" value={f.allergens} onChange={v => set("allergens", v)} placeholder="dairy, gluten, egg" />

			<div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `0.5px solid ${C.khaki}` }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
					<div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase" }}>
						Unit conversion (grams per unit) — needed for recipe nutrition auto-calc
					</div>
					<Btn size="sm" onClick={() => setGramsRows(p => [...p, { ...blankGramsRow }])}>+ Add unit</Btn>
				</div>
				{gramsRows.map((r, i) => (
					<div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6 }}>
						<Field label="" value={r.unit} onChange={v => setGramsRow(i, "unit", v)} placeholder="e.g. piece, cup, g" />
						<Field label="" value={r.grams} onChange={v => setGramsRow(i, "grams", v)} type="number" placeholder="grams" />
						<button onClick={() => setGramsRows(p => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.rust }}>×</button>
					</div>
				))}
			</div>

			<VoiceField label="Notes" value={f.notes} onChange={v => set("notes", v)} />
			<div style={{ display: "flex", gap: 8, marginTop: "1.25rem", paddingTop: "1rem", borderTop: `0.5px solid ${C.khaki}` }}>
				<Btn variant="primary" onClick={submit}>{initial ? "Save changes" : "Add ingredient"}</Btn>
				<Btn variant="secondary" onClick={onClose}>Cancel</Btn>
			</div>
		</div>
	);
};

export default function Ingredients({ ingredients, userRole, onAdd, onEdit, onDelete, onVerify }) {
	const [showForm, setShowForm] = useState(false);
	const [editItem, setEditItem] = useState(null);
	const [query, setQuery] = useState("");
	const filtered = ingredients.filter(i =>
		i.name.toLowerCase().includes(query.toLowerCase()) || i.category.toLowerCase().includes(query.toLowerCase()));
	const verifiedCount = ingredients.filter(i => i.verified).length;

	const handleSubmit = async (item) => {
		const result = editItem ? await onEdit(editItem.id, item) : await onAdd(item);
		if (result.ok) setShowForm(false);
		return result;
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
			<SectionHeader title="Ingredient database" sub={`Verified nutrition & allergen data — ${verifiedCount} of ${ingredients.length} verified · recipes link to these for automatic nutrition calculation`}
				action={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<SearchBox value={query} onChange={setQuery} placeholder="Search ingredients..." />
					<ExportButton resource="ingredients" userRole={userRole} />
					<Btn size="sm" variant="primary" onClick={() => { setEditItem(null); setShowForm(true); }}>+ Add ingredient</Btn>
				</div>} />

			<div style={{ background: C.cream, border: `0.5px solid ${C.khaki}`, borderRadius: 12, padding: "0.85rem 1.1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
				<div style={{ fontSize: 12, color: C.slate }}>
					<strong>Automated lookup</strong> (open nutrition databases + the same deterministic AI parser used for voice input) isn't built yet —
					entries are searched, entered, and verified by hand for now. Planned; see the roadmap.
				</div>
				<span title="Coming soon — see roadmap.md">
					<Btn size="sm" disabled>
						<span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="flask" size={14} /> Look up nutrition</span>
					</Btn>
				</span>
			</div>

			<div style={{ background: C.white, border: `0.5px solid ${C.khaki}`, borderRadius: 12, overflow: "hidden" }}>
				<div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 1.3fr 110px", padding: "8px 16px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em" }}>
					{["Ingredient", "Category", "Kcal", "Protein", "Carbs", "Fat", "Status", ""].map(h => <span key={h}>{h}</span>)}
				</div>
				{filtered.map(item => (
					<div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 1.3fr 110px", padding: "11px 16px", borderBottom: `0.5px solid ${C.cream}`, fontSize: 13, alignItems: "center" }}>
						<span style={{ fontWeight: 500 }}>{item.name}</span>
						<span style={{ color: C.slate, fontSize: 12 }}>{item.category}</span>
						<span>{item.kcalPer100g}</span>
						<span>{item.proteinPer100g}g</span>
						<span>{item.carbsPer100g}g</span>
						<span>{item.fatPer100g}g</span>
						<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
							{item.verified
								? <Pill variant="ok">verified</Pill>
								: <Pill variant="warning">unverified</Pill>}
							<span style={{ fontSize: 10, color: C.slateL }}>{item.source.replace("_", " ")}</span>
						</div>
						<div style={{ display: "flex", gap: 4 }}>
							{userRole === "owner" && (
								<button onClick={() => onVerify(item.id, !item.verified)}
									title={item.verified ? "Unverify" : "Mark verified"}
									style={{ background: "none", border: `0.5px solid ${C.khaki}`, borderRadius: 6, cursor: "pointer", padding: "3px 6px", color: item.verified ? C.sage : C.slate, display: "flex" }}>
									<Icon name="circle-check" size={14} />
								</button>
							)}
							<button onClick={() => { setEditItem(item); setShowForm(true); }} style={{ background: "none", border: `0.5px solid ${C.khaki}`, borderRadius: 6, cursor: "pointer", fontSize: 11, padding: "3px 7px", color: C.slate }}>Edit</button>
							<button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.rust, padding: "0 4px" }}>×</button>
						</div>
					</div>
				))}
				{filtered.length === 0 && <div style={{ padding: "2rem", textAlign: "center", color: C.slateL, fontSize: 13 }}>
					{query ? "No ingredients match your search." : "No ingredients yet — add one, or link them from a recipe's ingredient list."}
				</div>}
			</div>

			{showForm && (
				<Modal title={editItem ? "Edit ingredient" : "Add ingredient"} onClose={() => setShowForm(false)}>
					<IngredientForm initial={editItem} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
				</Modal>
			)}
		</div>
	);
}
