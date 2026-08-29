import { useState } from "react";
import { C } from "../theme";
import { Badge, Btn, FGrid, Field, VoiceField, Modal, Sel, SectionHeader, SearchBox, ExportButton } from "../ui";

export default function Marketplace({ suppliers, userRole, onAdd, onNav }) {
  const [showForm, setShowForm] = useState(false);
  const [profileSupplier, setProfileSupplier] = useState(null);
  const [query, setQuery] = useState("");
  const [f, setF] = useState({name:"",type:"Farm",distance:0,rating:5.0,products:"",certified:"",contact:"",note:""});
  const [errors, setErrors] = useState({});
  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || s.type.toLowerCase().includes(query.toLowerCase()));

  const submit = async () => {
    const e = {};
    if(!f.name.trim()) e.name="Name is required";
    if(+f.distance < 0) e.distance="Cannot be negative";
    if(+f.rating < 1 || +f.rating > 5) e.rating="Must be between 1 and 5";
    setErrors(e);
    if(Object.keys(e).length) return;

    const result = await onAdd({
      ...f,
      products: f.products.split(",").map(x=>x.trim()).filter(Boolean),
      certified: f.certified.split(",").map(x=>x.trim()).filter(Boolean),
    });
    if(!result.ok){ setErrors(result.fieldErrors||{}); return; }
    setShowForm(false); setErrors({});
    setF({name:"",type:"Farm",distance:0,rating:5.0,products:"",certified:"",contact:"",note:""});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Supplier marketplace" sub="Buy direct from farms and producers."
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search suppliers..." />
          <ExportButton resource="suppliers" userRole={userRole} />
          <Btn size="sm" variant="primary" onClick={()=>setShowForm(true)}>+ Add supplier</Btn>
        </div>} />
      <div style={{background:`linear-gradient(135deg, ${C.sage}18, ${C.sageXL})`,border:`0.5px solid ${C.sage}44`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:16,fontWeight:700,color:C.sage}}>Direct sourcing saves an average of 18–32% vs distributor pricing</div>
        <div style={{fontSize:13,color:C.sage+"bb",marginTop:4}}>Check the Procurement tab for an AI demand forecast based on your current stock.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        {filtered.map(s=>(
          <div key={s.id} style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{s.name}</div>
                <div style={{fontSize:12,color:C.slate}}>{s.type} · {s.distance}km · ⭑ {s.rating}</div>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {(s.certified||[]).map(c=><Badge key={c} color={C.sage}>{c}</Badge>)}
              </div>
            </div>
            <div style={{fontSize:12,color:C.slate,marginBottom:8}}><strong>Products:</strong> {Array.isArray(s.products)?s.products.join(", "):s.products}</div>
            {s.note&&<div style={{fontSize:12,color:C.slate,marginBottom:12,fontStyle:"italic"}}>"{s.note}"</div>}
            <div style={{display:"flex",gap:8}}>
              <Btn size="sm" variant="primary" onClick={()=>onNav("procurement")}>Order via Procurement</Btn>
              <Btn size="sm" onClick={()=>setProfileSupplier(s)}>View profile</Btn>
            </div>
          </div>
        ))}
        {filtered.length===0&&<div style={{color:C.slateL,fontSize:13}}>{query?"No suppliers match your search.":"No suppliers yet — add your first one above."}</div>}
      </div>
      {showForm&&(
        <Modal title="Add new supplier" onClose={()=>setShowForm(false)}>
          <FGrid cols={2}>
            <VoiceField label="Name *" value={f.name} onChange={v=>setF(p=>({...p,name:v}))} required error={errors.name} />
            <Sel label="Type" value={f.type} onChange={v=>setF(p=>({...p,type:v}))} options={["Farm","Dairy co-op","Produce hub","Mill","Fishery","Distributor","Other"]} />
            <Field label="Distance (km)" value={f.distance} onChange={v=>setF(p=>({...p,distance:+v}))} type="number" error={errors.distance} />
            <Field label="Rating (1–5)" value={f.rating} onChange={v=>setF(p=>({...p,rating:+v}))} type="number" error={errors.rating} />
          </FGrid>
          <VoiceField label="Products (comma-separated)" value={f.products} onChange={v=>setF(p=>({...p,products:v}))} placeholder="Chicken, Duck, Pork" />
          <div style={{height:"0.5rem"}}/>
          <VoiceField label="Certifications (comma-separated)" value={f.certified} onChange={v=>setF(p=>({...p,certified:v}))} placeholder="organic, halal" />
          <div style={{height:"0.5rem"}}/>
          <Field label="Contact email" value={f.contact} onChange={v=>setF(p=>({...p,contact:v}))} type="email" />
          <div style={{height:"0.5rem"}}/>
          <VoiceField label="Notes" value={f.note} onChange={v=>setF(p=>({...p,note:v}))} />
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={submit}>Add supplier</Btn>
            <Btn variant="secondary" onClick={()=>{setShowForm(false);setErrors({});}}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {profileSupplier&&(
        <Modal title={profileSupplier.name} onClose={()=>setProfileSupplier(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:10,fontSize:13}}>
            <div><strong>Type:</strong> {profileSupplier.type}</div>
            <div><strong>Distance:</strong> {profileSupplier.distance}km</div>
            <div><strong>Rating:</strong> {profileSupplier.rating} / 5</div>
            <div><strong>Products:</strong> {Array.isArray(profileSupplier.products)?profileSupplier.products.join(", "):profileSupplier.products || "—"}</div>
            <div><strong>Certifications:</strong> {(profileSupplier.certified||[]).join(", ") || "—"}</div>
            <div><strong>Contact:</strong> {profileSupplier.contact ? <a href={`mailto:${profileSupplier.contact}`} style={{color:C.sage}}>{profileSupplier.contact}</a> : "—"}</div>
            {profileSupplier.note && <div style={{fontStyle:"italic",color:C.slate}}>"{profileSupplier.note}"</div>}
          </div>
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="secondary" onClick={()=>setProfileSupplier(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
