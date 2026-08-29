import { useState } from "react";
import { C } from "../theme";
import { Badge, Btn, AIError, SectionHeader } from "../ui";
import { callAI } from "../api/ai";

export default function FlavourAI({ recipes }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyse = async () => {
    if(!q.trim()) return;
    setLoading(true); setRes(null); setError(null);
    const result = await callAI("flavour", { query: q });
    setLoading(false);
    if(!result.ok){ setError(result.error); return; }
    setRes(result.data);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Flavour AI" sub="Ingredient and dish analysis" />
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Analyse a dish or ingredient</div>
        <div style={{display:"flex",gap:8}}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyse()} placeholder="e.g. 'duck confit with cherry jus' or 'white miso paste'…"
            style={{flex:1,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"inherit",background:C.cream}} />
          <Btn variant="primary" onClick={analyse} disabled={loading||!q.trim()}>{loading?"Analysing…":"Analyse"}</Btn>
        </div>
        {loading&&<div style={{textAlign:"center",padding:"2rem",color:C.slateL,fontSize:13}}>Analysing flavour profile…</div>}
        {error&&<div style={{marginTop:"1rem"}}><AIError message={error} onRetry={analyse} /></div>}
        {res&&(
          <div style={{marginTop:"1.25rem",display:"flex",flexDirection:"column",gap:"1rem"}}>
            <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:20}}>{res.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div><div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Flavour profile</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{res.flavourProfile?.map(f=><Badge key={f} color={C.gold}>{f}</Badge>)}</div></div>
              <div><div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Cuisine origins</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{res.cuisines?.map(c=><Badge key={c} color={C.sage}>{c}</Badge>)}</div></div>
              <div><div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Allergens</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{res.allergens?.map(a=><Badge key={a} color={C.rust}>{a}</Badge>)}</div></div>
            </div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Best pairings</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{res.pairings?.map(p=><Badge key={p} color={C.slate}>{p}</Badge>)}</div></div>
            {res.complementaryRecipes?.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Complements your library</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{res.complementaryRecipes.map(r=><Badge key={r} color={C.sage}>{r}</Badge>)}</div></div>}
            <div style={{background:C.sageXL,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.sage,borderLeft:`3px solid ${C.sage}`}}>
              <span style={{fontWeight:700}}>Chef note: </span>{res.chefNote}
            </div>
          </div>
        )}
      </div>
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Library flavour map</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
          {recipes.map(r=>(
            <div key={r.id} style={{background:C.cream,borderRadius:10,padding:"10px 14px",minWidth:140}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{r.name}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{r.flavours.map(f=><Badge key={f} color={C.gold}>{f}</Badge>)}</div>
            </div>
          ))}
          {recipes.length===0&&<div style={{color:C.slateL,fontSize:13}}>No recipes yet.</div>}
        </div>
      </div>
    </div>
  );
}
