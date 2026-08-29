import { useState, useEffect } from "react";
import { C } from "../theme";
import { exportFactsheet, fmtMins } from "../lib/utils";
import { Badge, Btn, FGrid, Field, VoiceField, VoiceIconButton, DurationInput, Modal, Pill, Sel, SectionHeader, StatCard, SearchBox, ExportButton } from "../ui";
import Icon from "../icons/Icon";
import { api, fetchImageUrl, uploadFile } from "../api/client";
import { keysToCamel } from "../api/caseConvert";

// Photo upload needs a recipe id to attach to (POST /recipes/<id>/image), so
// it only appears on the detail view for an already-saved recipe — not in
// the new/edit form modal, which would otherwise need a two-step
// create-then-attach flow for a brand new recipe.
function RecipePhoto({ recipe, onChange }) {
  const [url, setUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    // Only the "has a photo" branch needs to touch state here — leaving
    // `url` alone when there's no filename avoids a synchronous setState
    // during the effect (React flags that as a footgun), and the render
    // below already treats "no filename" as "no photo" regardless of
    // whatever `url` last held.
    if (recipe.imageFilename) {
      fetchImageUrl(`/recipes/${recipe.id}/image`).then(u => {
        if (cancelled) return;
        objectUrl = u;
        setUrl(u);
      });
    }
    // Object URLs aren't garbage-collected on their own — revoke the old one
    // whenever the photo changes or this unmounts, or every upload leaks memory.
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [recipe.id, recipe.imageFilename]);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file next time
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const updated = await uploadFile(`/recipes/${recipe.id}/image`, fd);
      onChange(keysToCamel(updated));
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setUploading(true); setError(null);
    try {
      const updated = await api.del(`/recipes/${recipe.id}/image`);
      onChange(keysToCamel(updated));
    } catch (err) {
      setError(err.message || "Couldn't remove photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{marginBottom:"1rem"}}>
      {url ? (
        <div style={{position:"relative"}}>
          <img src={url} alt={recipe.name} style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:10,display:"block"}} />
          <div style={{position:"absolute",top:8,right:8,display:"flex",gap:6}}>
            <label style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>
              {uploading?"…":"Replace"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pick} disabled={uploading} style={{display:"none"}} />
            </label>
            <button onClick={remove} disabled={uploading} style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",color:C.rust}}>Remove</button>
          </div>
        </div>
      ) : (
        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,height:100,border:`1px dashed ${C.khaki}`,borderRadius:10,cursor:"pointer",color:C.slateL,fontSize:12}}>
          <Icon name="image" size={20} />
          {uploading?"Uploading…":"Add a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pick} disabled={uploading} style={{display:"none"}} />
        </label>
      )}
      {error && <div style={{color:C.rust,fontSize:11,marginTop:4}}>{error}</div>}
    </div>
  );
}

const RecipeForm = ({ initial, ingredientDb, userRole, onSubmit, onClose }) => {
  const blank = {name:"",category:"Main",origin:"",servings:4,cost:0,kcal:0,protein:0,carbs:0,fat:0,allergens:"none",flavours:"",prepMins:30,cookMins:30,verified:false,menuPrice:0,storageNotes:"",shelfLifeDays:"",ingredients:[{name:"",qty:"",unit:""}],steps:[""]};
  const [f, setF] = useState(initial ? {
    ...initial,
    allergens: initial.allergens?.join(", ")||"none",
    flavours: initial.flavours?.join(", ")||"",
    shelfLifeDays: initial.shelfLifeDays ?? "",
  } : blank);
  const [errors, setErrors] = useState({});
  const setFld = (k,v) => setF(p=>({...p,[k]:v}));
  const setIng = (i,k,v) => { const a=[...f.ingredients]; a[i]={...a[i],[k]:v}; setFld("ingredients",a); };
  const linkIngredient = (i, ingredientId) => {
    const match = ingredientDb.find(x=>String(x.id)===ingredientId);
    setIng(i, "ingredientId", ingredientId ? +ingredientId : undefined);
    if (match) { setIng(i, "name", match.name); if (!f.ingredients[i].unit) setIng(i, "unit", match.defaultUnit || "g"); }
  };
  const setStep = (i,v) => { const a=[...f.steps]; a[i]=v; setFld("steps",a); };
  const nutritionLocked = initial?.nutritionSource === "calculated" && userRole !== "owner";
  const validate = () => {
    const e = {};
    if(!f.name.trim()) e.name = "Name is required";
    if(+f.servings < 1) e.servings = "Must be at least 1";
    [["cost","Cost"],["kcal","Calories"],["protein","Protein"],["carbs","Carbs"],["fat","Fat"],["prepMins","Prep time"],["cookMins","Cook time"],["menuPrice","Menu price"]].forEach(([k,label])=>{
      if(+f[k] < 0) e[k] = `${label} cannot be negative`;
    });
    return e;
  };
  const submit = async () => {
    const e = validate();
    setErrors(e);
    if(Object.keys(e).length) return;
    const result = await onSubmit({
      ...f,
      allergens: f.allergens.split(",").map(x=>x.trim()).filter(Boolean),
      flavours: f.flavours.split(",").map(x=>x.trim()).filter(Boolean),
      servings:+f.servings, cost:+f.cost, kcal:+f.kcal, protein:+f.protein,
      carbs:+f.carbs, fat:+f.fat, prepMins:+f.prepMins, cookMins:+f.cookMins,
      menuPrice:+f.menuPrice, shelfLifeDays: f.shelfLifeDays===""?null:+f.shelfLifeDays,
    });
    if(!result.ok) setErrors(result.fieldErrors||{});
  };
  return (
    <div>
      <FGrid cols={2}><VoiceField label="Name *" value={f.name} onChange={v=>setFld("name",v)} required error={errors.name} /></FGrid>
      <FGrid cols={3}>
        <Sel label="Category" value={f.category} onChange={v=>setFld("category",v)} options={["Main","Starter","Dessert","Side","Sauce","Pastry","Bread"]} />
        <VoiceField label="Origin / cuisine" value={f.origin} onChange={v=>setFld("origin",v)} />
        <Field label="Servings" value={f.servings} onChange={v=>setFld("servings",v)} type="number" error={errors.servings} />
      </FGrid>
      {nutritionLocked ? (
        <div style={{background:C.goldXL,border:`0.5px solid ${C.gold}44`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.gold,marginBottom:"0.75rem",display:"flex",gap:8,alignItems:"flex-start"}}>
          <Icon name="lock" size={15} style={{marginTop:1,flexShrink:0}} />
          <span>
            Nutrition (kcal {f.kcal} / protein {f.protein}g / carbs {f.carbs}g / fat {f.fat}g) was auto-calculated from
            linked ingredients — only an owner can override it by hand. Use "Recalculate nutrition" on the detail view instead.
          </span>
        </div>
      ) : (
        <>
          <FGrid cols={4}>
            <Field label="Cost ($)" value={f.cost} onChange={v=>setFld("cost",v)} type="number" error={errors.cost} />
            <Field label="Kcal (total)" value={f.kcal} onChange={v=>setFld("kcal",v)} type="number" error={errors.kcal} />
            <Field label="Protein (g)" value={f.protein} onChange={v=>setFld("protein",v)} type="number" error={errors.protein} />
            <Field label="Fat (g)" value={f.fat} onChange={v=>setFld("fat",v)} type="number" error={errors.fat} />
          </FGrid>
          <FGrid cols={1}><Field label="Carbs (g)" value={f.carbs} onChange={v=>setFld("carbs",v)} type="number" error={errors.carbs} /></FGrid>
        </>
      )}
      <FGrid cols={2}>
        <DurationInput label="Prep time" value={f.prepMins} onChange={v=>setFld("prepMins",v)} error={errors.prepMins} />
        <DurationInput label="Cook time" value={f.cookMins} onChange={v=>setFld("cookMins",v)} error={errors.cookMins} />
      </FGrid>
      <FGrid cols={2}>
        <VoiceField label="Allergens (comma-separated)" value={f.allergens} onChange={v=>setFld("allergens",v)} placeholder="dairy, gluten, egg" />
        <VoiceField label="Flavours (comma-separated)" value={f.flavours} onChange={v=>setFld("flavours",v)} placeholder="umami, savoury, rich" />
      </FGrid>
      <FGrid cols={3}>
        <Field label="Menu price ($)" value={f.menuPrice} onChange={v=>setFld("menuPrice",v)} type="number" error={errors.menuPrice} />
        <Field label="Shelf life (days)" value={f.shelfLifeDays} onChange={v=>setFld("shelfLifeDays",v)} type="number" placeholder="e.g. 3" />
        <VoiceField label="Storage notes" value={f.storageNotes||""} onChange={v=>setFld("storageNotes",v)} placeholder="Refrigerate, use within..." />
      </FGrid>
      <div style={{fontSize:12,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em",margin:"0.75rem 0 0.5rem"}}>Ingredients</div>
      <div style={{fontSize:11,color:C.slateL,marginBottom:6}}>Link a line to the ingredient database to make it eligible for nutrition auto-calc.</div>
      {f.ingredients.map((ing,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"1.6fr 1.6fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
          <select value={ing.ingredientId||""} onChange={e=>linkIngredient(i,e.target.value)}
            style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",background:ing.ingredientId?C.sageXL:C.cream}}>
            <option value="">Not linked</option>
            {ingredientDb.map(dbi=><option key={dbi.id} value={dbi.id}>{dbi.name}{dbi.verified?" ✓":""}</option>)}
          </select>
          <input value={ing.name} onChange={e=>setIng(i,"name",e.target.value)} placeholder="Ingredient name"
            style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",background:C.cream}} />
          <input value={ing.qty} onChange={e=>setIng(i,"qty",e.target.value)} placeholder="Qty"
            style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",background:C.cream}} />
          <input value={ing.unit} onChange={e=>setIng(i,"unit",e.target.value)} placeholder="Unit"
            style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",background:C.cream}} />
          <div style={{display:"flex",gap:2}}>
            <VoiceIconButton value={ing.name} onChange={v=>setIng(i,"name",v)} title="Dictate ingredient name" />
            <button onClick={()=>setFld("ingredients",f.ingredients.filter((_,j)=>j!==i))} style={{border:"none",background:"none",cursor:"pointer",color:C.rust,fontSize:16,padding:"0 4px"}}>×</button>
          </div>
        </div>
      ))}
      <Btn size="sm" variant="ghost" onClick={()=>setFld("ingredients",[...f.ingredients,{name:"",qty:"",unit:""}])}>+ Add ingredient</Btn>
      <div style={{fontSize:12,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em",margin:"0.75rem 0 0.5rem"}}>Method steps</div>
      {f.steps.map((step,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:6,marginBottom:6,alignItems:"flex-start"}}>
          <span style={{fontSize:12,color:C.slate,paddingTop:7,fontWeight:700}}>{i+1}.</span>
          <textarea value={step} onChange={e=>setStep(i,e.target.value)} rows={2}
            style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",background:C.cream,resize:"vertical"}} />
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <VoiceIconButton value={step} onChange={v=>setStep(i,v)} title="Dictate this step" />
            <button onClick={()=>setFld("steps",f.steps.filter((_,j)=>j!==i))} style={{border:"none",background:"none",cursor:"pointer",color:C.rust,fontSize:16,padding:"4px"}}>×</button>
          </div>
        </div>
      ))}
      <Btn size="sm" variant="ghost" onClick={()=>setFld("steps",[...f.steps,""])}>+ Add step</Btn>
      <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
        <Btn variant="primary" onClick={submit}>{initial?"Save changes":"Add recipe"}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
};

function VersionHistoryModal({ recipeId, onClose }) {
  const [versions, setVersions] = useState(null);
  useEffect(() => {
    api.get(`/recipes/${recipeId}/versions`).then(res => setVersions(keysToCamel(res))).catch(() => setVersions([]));
  }, [recipeId]);
  return (
    <Modal title="Version history" onClose={onClose}>
      {versions === null && <div style={{fontSize:13,color:C.slateL}}>Loading…</div>}
      {versions?.length === 0 && <div style={{fontSize:13,color:C.slateL}}>No edits recorded yet — versions are saved automatically whenever this recipe is updated.</div>}
      {versions?.map(v=>(
        <div key={v.id} style={{borderBottom:`0.5px solid ${C.khaki}`,padding:"8px 0",fontSize:12}}>
          <div style={{fontWeight:600,marginBottom:4}}>{new Date(v.createdAt).toLocaleString()}</div>
          <div style={{color:C.slate}}>Cost was ${v.snapshot.cost} · Menu price was ${v.snapshot.menuPrice ?? 0} · Servings {v.snapshot.servings}</div>
        </div>
      ))}
    </Modal>
  );
}

export default function Recipes({ recipes, ingredients, userRole, onAdd, onEdit, onDelete, onRecalculateNutrition, onNav }) {
  const [sel, setSel] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showVersions, setShowVersions] = useState(null);
  const [editRec, setEditRec] = useState(null);
  const [query, setQuery] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState(null);
  // Photo upload/remove hits its own endpoint (not the regular onEdit path),
  // so its result is layered on top of the `recipes` prop here rather than
  // plumbed all the way back through App.jsx — it'll reconcile with the next
  // normal refetch. Keyed by id so switching recipes doesn't show a stale override.
  const [photoOverride, setPhotoOverride] = useState(null);
  const filtered = recipes.filter(rec => rec.name.toLowerCase().includes(query.toLowerCase()) || rec.category.toLowerCase().includes(query.toLowerCase()));
  const rBase = recipes.find(x=>x.id===sel);
  const r = rBase && photoOverride?.id===rBase.id ? { ...rBase, imageFilename: photoOverride.imageFilename } : rBase;

  const handleSubmit = async (rec) => {
    const result = editRec ? await onEdit(editRec.id, rec) : await onAdd(rec);
    if(result.ok){ setShowForm(false); setSel(result.data.id); }
    return result;
  };

  const recalculateNutrition = async () => {
    setRecalculating(true); setRecalcResult(null);
    const result = await onRecalculateNutrition(r.id);
    setRecalcResult(result.ok ? result.data : { error: result.error });
    setRecalculating(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Recipe library" sub={`${recipes.length} recipes`}
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search recipes..." />
          <ExportButton resource="recipes" userRole={userRole} allowedRoles={["owner"]} label="Export CSV" />
          <Btn size="sm" variant="ghost" onClick={()=>onNav("voice")}><span style={{display:"flex",alignItems:"center",gap:6}}><Icon name="microphone" size={13}/> Voice add</span></Btn>
          <Btn size="sm" variant="primary" onClick={()=>{setEditRec(null);setShowForm(true);}}>+ New recipe</Btn>
        </div>} />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:"1rem"}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(rec=>(
            <div key={rec.id} onClick={()=>{setSel(rec.id);setRecalcResult(null);}} style={{background:sel===rec.id?C.sageXL:C.white,border:`0.5px solid ${sel===rec.id?C.sage:C.khaki}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"border 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{fontWeight:600,fontSize:14}}>{rec.name}</div>
                <Pill variant={rec.verified?"ok":"warning"}>{rec.verified?"Verified":"Pending"}</Pill>
              </div>
              <div style={{fontSize:12,color:C.slate,marginTop:4}}>{rec.category} · {rec.origin} · {rec.servings} srv · ${rec.cost}</div>
              <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                {rec.flavours.map(f=><Badge key={f} color={C.gold}>{f}</Badge>)}
                {rec.allergens.filter(a=>a!=="none").map(a=><Badge key={a} color={C.rust}>{a}</Badge>)}
              </div>
            </div>
          ))}
          {filtered.length===0&&<div style={{color:C.slateL,fontSize:13,padding:"1rem"}}>{query?"No recipes match your search.":"No recipes yet — add one or use Voice add."}</div>}
        </div>
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
          {!r ? (
            <div style={{color:C.slateL,fontSize:13,padding:"3rem",textAlign:"center"}}>
              <div style={{marginBottom:8,color:C.slateL,display:"flex",justifyContent:"center"}}><Icon name="chef-hat" size={32} /></div>
              Select a recipe to view details
            </div>
          ) : (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem"}}>
                <div>
                  <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:20}}>{r.name}</div>
                  <div style={{fontSize:12,color:C.slate}}>{r.category} · {r.origin} · {fmtMins(r.prepMins)} prep · {fmtMins(r.cookMins)} cook</div>
                </div>
                <Pill variant={r.verified?"ok":"warning"}>{r.verified?"Verified":"Needs review"}</Pill>
              </div>
              <RecipePhoto recipe={r} onChange={updated => setPhotoOverride({ id: r.id, imageFilename: updated.imageFilename })} />
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em"}}>Nutrition</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <Badge color={r.nutritionSource==="calculated"?C.sage:r.nutritionSource==="partial"?C.gold:C.slateL}>
                    {r.nutritionSource==="calculated"?"Calculated":r.nutritionSource==="partial"?"Partially calculated":"Manual"}
                  </Badge>
                  <Btn size="sm" onClick={recalculateNutrition} disabled={recalculating}>{recalculating?"Recalculating…":"Recalculate"}</Btn>
                </div>
              </div>
              {recalcResult&&(
                <div style={{background:recalcResult.error?C.rustXL:C.sageXL,borderRadius:8,padding:"8px 12px",fontSize:12,color:recalcResult.error?C.rust:C.sage,marginBottom:"0.75rem"}}>
                  {recalcResult.error ? recalcResult.error : (
                    <>
                      Resolved {recalcResult.resolvedCount} of {recalcResult.totalLines} ingredient line(s).
                      {recalcResult.unresolvedLines?.length>0 && (
                        <ul style={{margin:"4px 0 0",paddingLeft:"1.1rem"}}>
                          {recalcResult.unresolvedLines.map((u,i)=><li key={i}>{u.name}: {u.reason}</li>)}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"1rem"}}>
                <StatCard label="Calories/serving" value={r.servings?Math.round(r.kcal/r.servings):r.kcal} unit="kcal" />
                <StatCard label="Cost/serving" value={`$${r.servings?(r.cost/r.servings).toFixed(2):r.cost}`} unit="" />
              </div>
              {r.menuPrice>0&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"1rem"}}>
                  <StatCard label="Menu price" value={`$${r.menuPrice.toFixed(2)}`} unit="" />
                  <StatCard label="Margin/serving" value={`$${(r.menuPrice-(r.cost/(r.servings||1))).toFixed(2)}`} unit="" color={r.menuPrice-(r.cost/(r.servings||1))>=0?C.sage:C.rust} />
                </div>
              )}
              {(r.storageNotes||r.shelfLifeDays)&&(
                <div style={{background:C.cream,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.slate,marginBottom:"1rem"}}>
                  {r.storageNotes&&<div>{r.storageNotes}</div>}
                  {r.shelfLifeDays&&<div>Shelf life: {r.shelfLifeDays} day(s)</div>}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:"1rem"}}>
                {[["Protein",r.protein,"g",C.sage],["Carbs",r.carbs,"g",C.gold],["Fat",r.fat,"g",C.rust]].map(([l,v,u,c])=>(
                  <div key={l} style={{background:C.cream,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:11,color:C.slate}}>{l}</div>
                    <div style={{fontSize:18,fontWeight:700,color:c}}>{v}<span style={{fontSize:11,color:C.slate}}>{u}</span></div>
                  </div>
                ))}
              </div>
              {r.ingredients?.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Ingredients</div>
                  <div style={{marginBottom:"1rem"}}>
                    {r.ingredients.map((ing,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`0.5px solid ${C.cream}`,fontSize:12}}>
                        <span>{ing.name}</span><span style={{color:C.slate}}>{ing.qty} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {r.steps?.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Method</div>
                  <ol style={{paddingLeft:"1rem",marginBottom:"1rem"}}>
                    {r.steps.map((s,i)=><li key={i} style={{fontSize:12,marginBottom:4,color:C.ink}}>{s}</li>)}
                  </ol>
                </>
              )}
              <div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Flavour profile</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1rem"}}>
                {r.flavours.map(f=><Badge key={f} color={C.gold}>{f}</Badge>)}
              </div>
              <div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Allergens</div>
              <div style={{display:"flex",gap:6,marginBottom:"1.25rem"}}>
                {r.allergens.map(a=><Pill key={a} variant={a==="none"?"ok":"warning"}>{a}</Pill>)}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn size="sm" variant="primary" onClick={()=>{setEditRec(r);setShowForm(true);}}>Edit recipe</Btn>
                <Btn size="sm" onClick={()=>exportFactsheet(r)}>Export factsheet ↗</Btn>
                <Btn size="sm" onClick={()=>setShowVersions(r.id)}>Version history</Btn>
                <Btn size="sm" variant="danger" onClick={async ()=>{await onDelete(r.id);setSel(null);}}>Delete</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
      {showForm&&(
        <Modal title={editRec?"Edit recipe":"New recipe"} onClose={()=>setShowForm(false)} width={680}>
          <RecipeForm initial={editRec} ingredientDb={ingredients} userRole={userRole} onSubmit={handleSubmit} onClose={()=>setShowForm(false)} />
        </Modal>
      )}
      {showVersions&&<VersionHistoryModal recipeId={showVersions} onClose={()=>setShowVersions(null)} />}
    </div>
  );
}
