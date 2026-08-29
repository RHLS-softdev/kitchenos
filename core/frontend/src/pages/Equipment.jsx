import { useState } from "react";
import { C } from "../theme";
import { Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, SectionHeader, SearchBox, ExportButton } from "../ui";

const BLANK_EQUIPMENT = {name:"",status:"ok",lastService:"",nextService:"",warranty:"",notes:"",cost:0};

export default function Equipment({ equipment, userRole, onAdd, onEdit, onLogService }) {
  const [logModal, setLogModal] = useState(null);
  const [logNote, setLogNote] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0,10));
  const [logNext, setLogNext] = useState("");
  const [editModal, setEditModal] = useState(null);
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const filtered = equipment.filter(eq => eq.name.toLowerCase().includes(query.toLowerCase()));

  const submitLog = async (eq) => {
    const result = await onLogService(eq.id, {
      date: logDate,
      note: logNote || "Routine service completed",
      ...(logNext ? { nextService: logNext } : {}),
    });
    if(result.ok){ setLogModal(null); setLogNote(""); setLogNext(""); }
  };

  const submitEdit = async () => {
    const e = {};
    if(!editModal.name.trim()) e.name = "Equipment name is required";
    if(+editModal.cost < 0) e.cost = "Cannot be negative";
    setErrors(e);
    if(Object.keys(e).length) return;
    const payload = {...editModal, cost:+editModal.cost};
    const result = editModal.id ? await onEdit(editModal.id, payload) : await onAdd(payload);
    if(result.ok){ setEditModal(null); setErrors({}); }
    else setErrors(result.fieldErrors||{});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Equipment management" sub="Service schedules, warranties, and asset log"
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search equipment..." />
          <ExportButton resource="equipment" userRole={userRole} />
          <Btn size="sm" variant="primary" onClick={()=>{setEditModal({...BLANK_EQUIPMENT});setErrors({});}}>+ Add equipment</Btn>
        </div>} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"1rem"}}>
        {filtered.map(eq=>(
          <div key={eq.id} style={{background:C.white,border:`0.5px solid ${eq.status==="critical"?C.rust:eq.status==="warning"?C.gold:C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontWeight:600,fontSize:14}}>{eq.name}</div>
              <Pill variant={eq.status}>{eq.status}</Pill>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12,color:C.slate,marginBottom:10}}>
              <div><span style={{fontWeight:600}}>Last service</span><br/>{eq.lastService||"—"}</div>
              <div><span style={{fontWeight:600}}>Next service</span><br/><span style={{color:eq.status!=="ok"?C.rust:C.ink}}>{eq.nextService||"—"}</span></div>
              <div><span style={{fontWeight:600}}>Warranty until</span><br/>{eq.warranty||"—"}</div>
              <div><span style={{fontWeight:600}}>Asset value</span><br/>${(eq.cost||0).toLocaleString()}</div>
            </div>
            {eq.notes&&<div style={{padding:"6px 10px",background:C.rustXL,borderRadius:6,fontSize:12,color:C.rust,marginBottom:10}}>{eq.notes}</div>}
            {eq.log?.length>0&&(
              <div style={{fontSize:11,color:C.slateL,marginBottom:10}}>Last entry: {eq.log[eq.log.length-1].date} — {eq.log[eq.log.length-1].note}</div>
            )}
            <div style={{display:"flex",gap:8}}>
              <Btn size="sm" variant="primary" onClick={()=>{setLogModal(eq);setLogDate(new Date().toISOString().slice(0,10));setLogNote("");setLogNext("");}}>Log service</Btn>
              <Btn size="sm" onClick={()=>{setEditModal(eq);setErrors({});}}>Edit</Btn>
            </div>
          </div>
        ))}
        {filtered.length===0&&<div style={{color:C.slateL,fontSize:13}}>{query?"No equipment matches your search.":"No equipment yet — add your first item above."}</div>}
      </div>
      {logModal&&(
        <Modal title={`Log service — ${logModal.name}`} onClose={()=>setLogModal(null)}>
          <FGrid cols={2}>
            <Field label="Service date" value={logDate} onChange={setLogDate} type="date" />
            <Field label="Next service date" value={logNext} onChange={setLogNext} type="date" placeholder={logModal.nextService} />
          </FGrid>
          <VoiceField label="Notes" value={logNote} onChange={setLogNote} placeholder="What was done? Any observations?" />
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={()=>submitLog(logModal)}>Save service record</Btn>
            <Btn variant="secondary" onClick={()=>setLogModal(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {editModal&&(
        <Modal title={editModal.id?"Edit equipment":"Add equipment"} onClose={()=>setEditModal(null)}>
          <FGrid cols={1}><VoiceField label="Name" value={editModal.name} onChange={v=>setEditModal(p=>({...p,name:v}))} error={errors.name} /></FGrid>
          <FGrid cols={2}>
            <Sel label="Status" value={editModal.status} onChange={v=>setEditModal(p=>({...p,status:v}))} options={["ok","warning","critical"]} />
            <Field label="Asset value ($)" value={editModal.cost} onChange={v=>setEditModal(p=>({...p,cost:+v}))} type="number" error={errors.cost} />
            <Field label="Last service" value={editModal.lastService||""} onChange={v=>setEditModal(p=>({...p,lastService:v}))} type="date" />
            <Field label="Next service" value={editModal.nextService||""} onChange={v=>setEditModal(p=>({...p,nextService:v}))} type="date" />
            <Field label="Warranty until (YYYY-MM)" value={editModal.warranty||""} onChange={v=>setEditModal(p=>({...p,warranty:v}))} />
            <VoiceField label="Notes" value={editModal.notes||""} onChange={v=>setEditModal(p=>({...p,notes:v}))} />
          </FGrid>
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={submitEdit}>Save</Btn>
            <Btn variant="secondary" onClick={()=>setEditModal(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
