import { useState } from "react";
import { C } from "../theme";
import { fmtMins } from "../lib/utils";
import { Badge, Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, SectionHeader, StatCard, SearchBox, ExportButton } from "../ui";

const BLANK_EVENT = {name:"",date:"",pax:50,status:"quoted",revenue:0,menuRecipeIds:[],notes:""};

export default function Catering({ catering, recipes, userRole, onAdd, onEdit, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editEv, setEditEv] = useState(null);
  const [runSheet, setRunSheet] = useState(null);
  const [f, setF] = useState(BLANK_EVENT);
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const filtered = catering.filter(ev => ev.name.toLowerCase().includes(query.toLowerCase()));
  const confirmed = catering.filter(e=>e.status==="confirmed").reduce((s,e)=>s+e.revenue,0);
  const pipeline = catering.filter(e=>e.status!=="confirmed").reduce((s,e)=>s+e.revenue,0);
  const toggleMenu = (id) => setF(p=>({...p,menuRecipeIds:p.menuRecipeIds.includes(id)?p.menuRecipeIds.filter(x=>x!==id):[...p.menuRecipeIds,id]}));
  const openForm = (ev) => { setEditEv(ev); setF(ev?{...ev,menuRecipeIds:ev.menuRecipeIds||[]}:BLANK_EVENT); setErrors({}); setShowForm(true); };

  const submit = async () => {
    const e = {};
    if(!f.name.trim()) e.name="Event name is required";
    if(!f.date) e.date="Date is required";
    if(+f.pax < 1) e.pax="Must be at least 1";
    if(+f.revenue < 0) e.revenue="Cannot be negative";
    setErrors(e);
    if(Object.keys(e).length) return;
    const payload = {...f, pax:+f.pax, revenue:+f.revenue};
    const result = editEv ? await onEdit(editEv.id, payload) : await onAdd(payload);
    if(result.ok) setShowForm(false);
    else setErrors(result.fieldErrors||{});
  };

  const recipeName = id => recipes.find(r=>r.id===id)?.name || `#${id}`;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Catering & events" sub="Event P&L, run sheets, and recipe scaling"
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search events..." />
          <ExportButton resource="catering" userRole={userRole} />
          <Btn size="sm" variant="primary" onClick={()=>openForm(null)}>+ New event</Btn>
        </div>} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <StatCard label="Events" value={catering.length} unit="" />
        <StatCard label="Confirmed revenue" value={`$${(confirmed/1000).toFixed(1)}k`} unit="" color={C.sage} />
        <StatCard label="Pipeline revenue" value={`$${(pipeline/1000).toFixed(1)}k`} unit="" color={C.gold} />
      </div>
      {filtered.map(ev=>(
        <div key={ev.id} style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:600,fontSize:15,marginBottom:2}}>{ev.name}</div>
              <div style={{fontSize:12,color:C.slate}}>{ev.date} · {ev.pax} pax</div>
              {ev.notes&&<div style={{fontSize:12,color:C.gold,marginTop:2}}>Note: {ev.notes}</div>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontWeight:700,fontSize:16,color:C.sage}}>${ev.revenue.toLocaleString()}</span>
              <Pill variant={ev.status==="confirmed"?"ok":ev.status==="planning"?"info":"neutral"}>{ev.status}</Pill>
            </div>
          </div>
          <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
            {(ev.menuRecipeIds||[]).map(id=><Badge key={id} color={C.sage}>{recipeName(id)}</Badge>)}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <Btn size="sm" variant="primary" onClick={()=>setRunSheet(ev)}>Run sheet</Btn>
            <Btn size="sm" onClick={()=>openForm(ev)}>Edit</Btn>
            <Btn size="sm" variant="danger" onClick={()=>onDelete(ev.id)}>Delete</Btn>
          </div>
        </div>
      ))}
      {filtered.length===0&&<div style={{color:C.slateL,fontSize:13}}>{query?"No events match your search.":"No events yet — add your first one above."}</div>}
      {showForm&&(
        <Modal title={editEv?"Edit event":"New catering event"} onClose={()=>setShowForm(false)} width={560}>
          <VoiceField label="Event name *" value={f.name} onChange={v=>setF(p=>({...p,name:v}))} error={errors.name} />
          <div style={{height:"0.5rem"}}/>
          <FGrid cols={3}>
            <Field label="Date" value={f.date||""} onChange={v=>setF(p=>({...p,date:v}))} type="date" error={errors.date} />
            <Field label="Pax" value={f.pax} onChange={v=>setF(p=>({...p,pax:+v}))} type="number" error={errors.pax} />
            <Field label="Revenue ($)" value={f.revenue} onChange={v=>setF(p=>({...p,revenue:+v}))} type="number" error={errors.revenue} />
          </FGrid>
          <Sel label="Status" value={f.status} onChange={v=>setF(p=>({...p,status:v}))} options={["quoted","planning","confirmed","completed","cancelled"]} />
          <div style={{marginTop:"0.75rem",fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Menus (select all that apply)</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:"0.75rem"}}>
            {recipes.map(r=>(
              <button key={r.id} onClick={()=>toggleMenu(r.id)}
                style={{border:`0.5px solid ${f.menuRecipeIds.includes(r.id)?C.sage:C.khaki}`,background:f.menuRecipeIds.includes(r.id)?C.sageXL:C.cream,borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:f.menuRecipeIds.includes(r.id)?700:400,color:f.menuRecipeIds.includes(r.id)?C.sage:C.ink}}>
                {r.name}
              </button>
            ))}
            {recipes.length===0&&<span style={{fontSize:12,color:C.slateL}}>Add recipes first to assign menus.</span>}
          </div>
          <VoiceField label="Notes" value={f.notes||""} onChange={v=>setF(p=>({...p,notes:v}))} placeholder="Dietary requirements, special requests…" />
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={submit}>{editEv?"Save changes":"Create event"}</Btn>
            <Btn variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {runSheet&&(
        <Modal title={`Run sheet — ${runSheet.name}`} onClose={()=>setRunSheet(null)} width={620}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:"1rem"}}>
            {[["Date",runSheet.date],["Pax",runSheet.pax],["Revenue",`$${runSheet.revenue.toLocaleString()}`]].map(([l,v])=>(
              <div key={l} style={{background:C.cream,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:11,color:C.slate}}>{l}</div>
                <div style={{fontWeight:600,fontSize:14}}>{v}</div>
              </div>
            ))}
          </div>
          {runSheet.notes&&<div style={{background:C.goldXL,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.gold,marginBottom:"1rem"}}>Note: {runSheet.notes}</div>}
          {(runSheet.menuRecipeIds||[]).map(recipeId=>{
            const recipe = recipes.find(r=>r.id===recipeId);
            if(!recipe) return null;
            const scale = runSheet.pax / recipe.servings;
            return (
              <div key={recipeId} style={{marginBottom:"1rem",borderBottom:`0.5px solid ${C.cream}`,paddingBottom:"1rem"}}>
                <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:15,marginBottom:6}}>{recipe.name} <span style={{fontSize:12,color:C.slate,fontFamily:"'DM Sans',sans-serif"}}>×{scale.toFixed(1)} scale ({runSheet.pax} pax from {recipe.servings} base)</span></div>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{background:C.cream}}>
                    {["Ingredient","Base qty","Scaled qty","Unit"].map(h=><th key={h} style={{padding:"4px 8px",textAlign:"left",fontSize:11,color:C.slate}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(recipe.ingredients||[]).map((ing,i)=>(
                      <tr key={i} style={{borderBottom:`0.5px solid ${C.cream}`}}>
                        <td style={{padding:"4px 8px"}}>{ing.name}</td>
                        <td style={{padding:"4px 8px",color:C.slate}}>{ing.qty}</td>
                        <td style={{padding:"4px 8px",fontWeight:600,color:C.sage}}>{(parseFloat(ing.qty)*scale).toFixed(1)}</td>
                        <td style={{padding:"4px 8px",color:C.slate}}>{ing.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{marginTop:6,fontSize:11,color:C.slate}}>
                  Est. food cost: <strong style={{color:C.ink}}>${(recipe.cost*scale).toFixed(0)}</strong> · Prep: {fmtMins(recipe.prepMins)} · Cook: {fmtMins(recipe.cookMins)}
                </div>
              </div>
            );
          })}
          <div style={{fontSize:12,color:C.slate,borderTop:`0.5px solid ${C.khaki}`,paddingTop:"0.75rem"}}>
            {(()=>{
              const totalCost = (runSheet.menuRecipeIds||[]).reduce((s,id)=>{const r=recipes.find(x=>x.id===id);return s+(r?(r.cost*(runSheet.pax/r.servings)):0);},0);
              return (
                <>
                  Total estimated food cost: <strong>${totalCost.toFixed(0)}</strong>
                  {" · "}Food cost %: <strong>{runSheet.revenue?(totalCost/runSheet.revenue*100).toFixed(1):"—"}%</strong>
                </>
              );
            })()}
          </div>
        </Modal>
      )}
    </div>
  );
}
