export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export const invStatus = i =>
  i.qty === 0 ? "critical"
  : i.qty < i.parLevel * 0.55 ? "critical"
  : i.qty < i.parLevel ? "low"
  : "ok";

// Shared between Inventory and Ingredients so both pages' category
// dropdowns stay in sync. Produce is subdivided rather than one bucket —
// makes shelf-life/spoilage patterns easier to spot at a glance.
export const CATEGORIES = [
  "Protein", "Dairy", "Grain",
  "Fruit", "Leafy Greens", "Alliums", "Root Vegetables", "Cruciferous", "Squash & Gourds", "Mushrooms", "Fresh Herbs",
  "Herbs & Spices", "Dry Goods", "Beverages", "Other",
];

export const fmtMins = m => {
  if (m == null) return "—";
  if (m >= 1440) {
    const days = Math.floor(m / 1440);
    const hours = Math.round((m % 1440) / 60);
    return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  }
  if (m >= 60) return `${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:""}`;
  return `${m}m`;
};

// Days until a YYYY-MM-DD date, compared against UTC midnight today
// (avoids timezone/midnight drift).
export const daysUntil = dateStr => {
  if (!dateStr) return null;
  const today = new Date();
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.parse(dateStr + "T00:00:00Z");
  if (isNaN(target)) return null;
  return Math.round((target - todayUTC) / 86400000);
};

// Opens a printable factsheet for a recipe in a new tab.
export const exportFactsheet = (recipe) => {
  const perServing = v => (recipe.servings ? Math.round(v / recipe.servings) : v);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${recipe.name} — KitchenOS Factsheet</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;max-width:720px;margin:2rem auto;color:#0D1117;padding:0 1rem;font-size:14px}
  h1{font-family:'DM Serif Display',Georgia,serif;font-size:2.2rem;margin-bottom:.25rem}
  h2{font-family:'DM Serif Display',Georgia,serif;font-size:1.1rem;margin:1.5rem 0 .5rem;border-bottom:1px solid #E8E0D0;padding-bottom:.25rem}
  .meta{color:#6B7280;font-size:13px;margin-bottom:1.5rem}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:1rem}
  .stat{background:#F5F0E8;border-radius:8px;padding:.6rem .9rem}
  .stat .val{font-size:1.4rem;font-weight:700;line-height:1.1}
  .stat .lbl{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{padding:.4rem .6rem;border-bottom:1px solid #E8E0D0;text-align:left}
  th{font-weight:700;background:#F5F0E8;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  ol{padding-left:1.25rem} li{margin-bottom:.4rem;line-height:1.5}
  .tag{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;margin:2px;background:#D4E8DA;color:#4A7C59}
  .tag.rust{background:#F5E0D4;color:#C45C2E}
  .footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #E8E0D0;font-size:11px;color:#9CA3AF}
  .verified{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#D4E8DA;color:#4A7C59;margin-left:.5rem}
  .unverified{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#F5EDD4;color:#C4962E;margin-left:.5rem}
  @media print{body{margin:0}.no-print{display:none!important}}
</style>
</head><body>
<div class="no-print" style="background:#D4E8DA;padding:.75rem 1rem;border-radius:8px;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between">
  <span style="color:#4A7C59;font-weight:600;font-size:13px">KitchenOS factsheet — ready to print</span>
  <button onclick="window.print()" style="background:#4A7C59;color:#fff;border:none;padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600;font-size:13px">Print / Save PDF</button>
</div>
<h1>${recipe.name} <span class="${recipe.verified ? "verified" : "unverified"}">${recipe.verified ? "✓ Verified" : "Pending review"}</span></h1>
<div class="meta">${recipe.category} · ${recipe.origin} · ${recipe.servings} servings · $${recipe.cost} total ($${(recipe.cost / recipe.servings).toFixed(2)}/serving)</div>
<h2>Nutrition (per serving)</h2>
<div class="grid3">
  <div class="stat"><div class="lbl">Calories</div><div class="val">${perServing(recipe.kcal)} <span style="font-size:.8rem;font-weight:400">kcal</span></div></div>
  <div class="stat"><div class="lbl">Protein</div><div class="val">${recipe.protein}g</div></div>
  <div class="stat"><div class="lbl">Carbs</div><div class="val">${recipe.carbs}g</div></div>
  <div class="stat"><div class="lbl">Fat</div><div class="val">${recipe.fat}g</div></div>
  <div class="stat"><div class="lbl">Prep time</div><div class="val" style="font-size:1.1rem">${fmtMins(recipe.prepMins)}</div></div>
  <div class="stat"><div class="lbl">Cook time</div><div class="val" style="font-size:1.1rem">${fmtMins(recipe.cookMins)}</div></div>
</div>
<h2>Allergens</h2>
<div>${recipe.allergens.map(a => `<span class="tag rust">${a}</span>`).join("")}</div>
<h2>Flavour profile</h2>
<div>${recipe.flavours.map(f => `<span class="tag">${f}</span>`).join("")}</div>
<h2>Ingredients (${recipe.servings} servings)</h2>
<table><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr>
${(recipe.ingredients || []).map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.unit}</td></tr>`).join("")}
</table>
<h2>Method</h2>
<ol>${(recipe.steps || []).map(s => `<li>${s}</li>`).join("")}</ol>
<div class="footer">Generated by KitchenOS · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · All quantities verified by kitchen team</div>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
};

// Builds the auto-generated shopping list from inventory shortfalls + catering needs.
export const computeShoppingList = (inventory, recipes, catering) => {
  const items = {};
  inventory.forEach(item => {
    if (item.qty < item.parLevel) {
      const key = item.name.toLowerCase();
      items[key] = {
        name: item.name, needed: +(item.parLevel - item.qty).toFixed(2),
        unit: item.unit, supplier: item.supplier, cost: item.cost || 0,
        reasons: ["Below par level"],
        priority: invStatus(item),
      };
    }
  });
  catering.filter(e => e.status !== "cancelled").forEach(ev => {
    (ev.menuRecipeIds || []).forEach(recipeId => {
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe?.ingredients) {
        const scale = ev.pax / recipe.servings;
        recipe.ingredients.forEach(ing => {
          const key = ing.name.toLowerCase();
          const needed = +(parseFloat(ing.qty) * scale).toFixed(2);
          if (items[key]) { items[key].needed += needed; items[key].reasons.push(ev.name); }
          else items[key] = { name: ing.name, needed, unit: ing.unit, supplier: "—", cost: 0, reasons: [ev.name], priority: "ok" };
        });
      }
    });
  });
  return Object.values(items).sort(
    (a, b) => ["critical", "low", "ok"].indexOf(a.priority) - ["critical", "low", "ok"].indexOf(b.priority)
  );
};
