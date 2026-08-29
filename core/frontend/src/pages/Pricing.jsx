import { C } from "../theme";
import { Btn, SectionHeader } from "../ui";

// Real pricing model (v3 roadmap): Free (offline, forever) + Premium
// ($50/mo per kitchen). Premium is managed in the Premium web app; this
// page is informational only — billing is enforced server-side there.
const TIERS = [
  { name: "Free", price: 0, color: C.slate,
    features: ["Everything for a single kitchen, offline", "Recipes, inventory, procurement, workflow", "Financial reporting & food cost", "Local voice input (on-device)"] },
  { name: "Premium", price: 50, color: C.sage,
    features: ["Everything in Free", "Multi-kitchen sync (beta)", "Supplier ordering", "Cross-kitchen analytics (roadmap)"] },
];

export default function Pricing() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <SectionHeader title="Plans & pricing" sub="Free forever, offline — Premium when you need the cloud" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "1rem" }}>
        {TIERS.map((t) => (
          <div key={t.name} style={{ background: C.white, border: `${t.name === "Premium" ? "2px" : "0.5px"} solid ${t.name === "Premium" ? C.sage : C.khaki}`, borderRadius: 14, padding: "1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, color: t.color }}>{t.name}</div>
            <div>
              <span style={{ fontSize: 36, fontWeight: 800 }}>${t.price}</span>
              <span style={{ fontSize: 14, color: C.slate }}>{t.price === 0 ? "" : "/mo per kitchen"}</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {t.features.map((f) => (
                <div key={f} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: C.sage, fontWeight: 700, marginTop: 1 }}>✓</span><span>{f}</span>
                </div>
              ))}
            </div>
            <span title="Premium is managed in the Premium web app">
              <Btn variant={t.name === "Premium" ? "primary" : "ghost"} disabled>
                {t.name === "Premium" ? "Upgrade in the Premium web app" : "Included"}
              </Btn>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
