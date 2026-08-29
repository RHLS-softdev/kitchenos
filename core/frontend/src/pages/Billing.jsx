import { useState, useEffect } from "react";
import { C } from "../theme";
import { Btn, Pill, SectionHeader, StatCard } from "../ui";
import { useAuth } from "../api/authContext";
import { api } from "../api/client";
import { keysToCamel } from "../api/caseConvert";

// The premium tier is a separate web app (enterprise/), per the v3
// roadmap: free desktop stays offline, and the one free→premium bridge
// is this button opening that app in the system browser. In the Tauri
// shell that's the shell plugin's open (needs shell:allow-open); in the
// plain web build (docker/dev) it's a normal window.open. Clicking it is
// the explicit subscribe action Hard Rule 1 carves out — the free app
// itself never talks to Convex or Clerk.
const PREMIUM_URL = import.meta.env.VITE_PREMIUM_URL ?? "https://rhls-softdev.github.io/kitchenos-launch/premium/";

async function openPremium() {
	if (window.__TAURI_INTERNALS__) {
		const { open } = await import("@tauri-apps/plugin-shell");
		await open(PREMIUM_URL);
	} else {
		window.open(PREMIUM_URL, "_blank", "noopener");
	}
}

export default function Billing({ orders, catering, recipes }) {
  const { user, logout } = useAuth();
  const [foodCost, setFoodCost] = useState(null);
  useEffect(() => {
    api.get("/reports/food-cost").then(res => setFoodCost(keysToCamel(res))).catch(() => {});
  }, []);

  const spend = orders.filter(o=>o.status==="delivered").reduce((s,o)=>s+o.total,0);
  const openInv = orders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled");

  // CateringEvent doesn't store its own cost — estimate it from linked
  // recipes' cost/serving scaled to headcount, same scaling the shopping
  // list uses for ingredient quantities.
  const confirmedCatering = catering.filter(e=>e.status==="confirmed");
  let totalCateringCost = 0, totalCovers = 0;
  confirmedCatering.forEach(e => {
    totalCovers += e.pax || 0;
    (e.menuRecipeIds||[]).forEach(rid => {
      const recipe = recipes.find(r=>r.id===rid);
      if (recipe?.servings) totalCateringCost += (recipe.cost/recipe.servings) * (e.pax||0);
    });
  });
  const avgCostPerCover = totalCovers>0 ? totalCateringCost/totalCovers : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Billing & financials" sub="Food cost ratios, invoices, and subscription management" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        <StatCard label="Monthly food cost" value={`$${spend.toLocaleString()}`} unit="" />
        <StatCard label="Avg food cost %" value={foodCost?.averageFoodCostPct ?? "—"} unit={foodCost?.averageFoodCostPct!=null?"%":""} color={C.sage} />
        <StatCard label="Open invoices" value={openInv.length} unit="" color={openInv.length>0?C.gold:C.ink} />
        <StatCard label="Avg cost/cover" value={avgCostPerCover!=null?`$${avgCostPerCover.toFixed(2)}`:"—"} unit="" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Subscription plan</div>
          <div style={{background:C.sageXL,borderRadius:10,padding:"1rem",border:`0.5px solid ${C.sage}44`}}>
            <div style={{fontSize:11,color:C.sage,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Current plan</div>
            <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:22,color:C.ink,marginTop:2}}>Free · $0</div>
            <div style={{fontSize:12,color:C.slate,marginTop:4}}>Single kitchen, fully offline · everything in this app</div>
            <div style={{marginTop:12,display:"flex",gap:8}}>
              <Btn size="sm" variant="primary" onClick={openPremium}>Upgrade to Premium — $50/mo</Btn>
              <Btn size="sm" onClick={openPremium}>Manage billing</Btn>
            </div>
            <div style={{fontSize:12,color:C.slate,marginTop:8}}>
              Premium adds multi-kitchen sync, supplier ordering, and AI analytics. It runs as a separate web app —
              your local data stays local until you choose to export it.
            </div>
          </div>
        </div>
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Open invoices</div>
          {openInv.length===0&&<div style={{color:C.slateL,fontSize:13}}>No open invoices.</div>}
          {openInv.map(o=>(
            <div key={o.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`0.5px solid ${C.cream}`,fontSize:13,alignItems:"center"}}>
              <div><div style={{fontWeight:500}}>{o.supplier}</div><div style={{fontSize:11,color:C.slate}}>Due {o.due||"—"}</div></div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontWeight:700}}>${o.total.toLocaleString()}</span>
                <Pill variant={o.status==="in-transit"?"info":"warning"}>{o.status}</Pill>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Account</div>
        <div style={{fontSize:13,color:C.slate,marginBottom:12}}>
          Signed in as <strong style={{color:C.ink}}>{user?.email}</strong> ({user?.position || user?.role})
        </div>
        <Btn size="sm" variant="secondary" onClick={logout}>Sign out</Btn>
      </div>
    </div>
  );
}
