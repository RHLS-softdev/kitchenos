import { useState } from "react";
import { C } from "../theme";
import { invStatus, daysUntil, CATEGORIES } from "../lib/utils";
import { Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, SectionHeader, StatCard, SearchBox, ExportButton } from "../ui";

const InvForm = ({ initial, suppliers, locations, onSubmit, onClose }) => {
  const defaultLocationId = locations.find(l=>l.isDefault)?.id || (locations[0]?.id ?? "");
  const blank = {name:"",category:"Protein",unit:"kg",qty:0,parLevel:0,cost:0,supplierId:"",locationId:defaultLocationId,expires:""};
  const [f, setF] = useState(initial?{...blank,...initial,supplierId:initial.supplierId||"",locationId:initial.locationId||defaultLocationId}:blank);
  const [errors, setErrors] = useState({});
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const validate = () => {
    const e = {};
    if(!f.name.trim()) e.name = "Item name is required";
    if(+f.qty < 0) e.qty = "Cannot be negative";
    if(+f.parLevel < 0) e.parLevel = "Cannot be negative";
    if(+f.cost < 0) e.cost = "Cannot be negative";
    return e;
  };
  const submit = async () => {
    const e = validate();
    setErrors(e);
    if(Object.keys(e).length) return;
    const result = await onSubmit({...f,qty:+f.qty,parLevel:+f.parLevel,cost:+f.cost,supplierId:f.supplierId?+f.supplierId:null,locationId:f.locationId?+f.locationId:null});
    if(!result.ok) setErrors(result.fieldErrors||{});
  };
  const supplierOptions = [{value:"",label:"— No supplier linked —"}, ...suppliers.map(s=>({value:String(s.id),label:s.name}))];
  const locationOptions = locations.map(l=>({value:String(l.id),label:l.name+(l.isDefault?" (default)":"")}));
  return (
    <div>
      <FGrid cols={2}>
        <VoiceField label="Item name *" value={f.name} onChange={v=>set("name",v)} required error={errors.name} />
        <Sel label="Category" value={f.category} onChange={v=>set("category",v)} options={CATEGORIES} />
      </FGrid>
      <FGrid cols={3}>
        <Field label="Current qty" value={f.qty} onChange={v=>set("qty",v)} type="number" error={errors.qty} />
        <Field label="Unit" value={f.unit} onChange={v=>set("unit",v)} placeholder="kg / L / pcs" />
        <Field label="Par level" value={f.parLevel} onChange={v=>set("parLevel",v)} type="number" error={errors.parLevel} />
      </FGrid>
      <FGrid cols={2}>
        <Field label="Cost per unit ($)" value={f.cost} onChange={v=>set("cost",v)} type="number" error={errors.cost} />
        <Sel label="Supplier" value={f.supplierId} onChange={v=>set("supplierId",v)} options={supplierOptions} />
      </FGrid>
      <FGrid cols={2}>
        <Sel label="Location" value={f.locationId?String(f.locationId):""} onChange={v=>set("locationId",v)} options={locationOptions} />
        <Field label="Expiry date" value={f.expires||""} onChange={v=>set("expires",v)} type="date" />
      </FGrid>
      <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
        <Btn variant="primary" onClick={submit}>{initial?"Save changes":"Add item"}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
};

// Batch (lot) tracking — the backend (InventoryBatch, FIFO-capable) has
// existed since before this page had any UI for it; this fills that gap.
// A batch always belongs to one inventory item, so the form only needs the
// per-lot fields — inventoryItemId comes from whichever row's "Batches"
// panel is open, not from the form itself.
const BatchForm = ({ item, initial, onSubmit, onClose }) => {
  const blank = {lotNumber:"",qty:0,unitCost:item.cost||0,receivedDate:new Date().toISOString().slice(0,10),expires:""};
  const [f, setF] = useState(initial?{...blank,...initial}:blank);
  const [errors, setErrors] = useState({});
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const validate = () => {
    const e = {};
    if(+f.qty < 0) e.qty = "Cannot be negative";
    if(+f.unitCost < 0) e.unitCost = "Cannot be negative";
    return e;
  };
  const submit = async () => {
    const e = validate();
    setErrors(e);
    if(Object.keys(e).length) return;
    const result = await onSubmit({...f,inventoryItemId:item.id,qty:+f.qty,unitCost:+f.unitCost,expires:f.expires||null});
    if(!result.ok) setErrors(result.fieldErrors||{});
  };
  return (
    <div>
      <FGrid cols={2}>
        <Field label="Lot / batch number" value={f.lotNumber} onChange={v=>set("lotNumber",v)} placeholder="Optional — e.g. supplier's lot code" />
        <Field label={`Quantity (${item.unit||"units"})`} value={f.qty} onChange={v=>set("qty",v)} type="number" error={errors.qty} />
      </FGrid>
      <FGrid cols={2}>
        <Field label="Unit cost ($)" value={f.unitCost} onChange={v=>set("unitCost",v)} type="number" error={errors.unitCost} />
        <Field label="Received date" value={f.receivedDate} onChange={v=>set("receivedDate",v)} type="date" />
      </FGrid>
      <Field label="Expiry date" value={f.expires||""} onChange={v=>set("expires",v)} type="date" />
      <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
        <Btn variant="primary" onClick={submit}>{initial?"Save changes":"Add batch"}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
};

// FIFO-ordered batch list for one item, shown inline under its row. Oldest
// received_date first — that's the actual point of tracking batches
// separately instead of one undifferentiated qty.
const BatchPanel = ({ item, batches, userRole, onAddBatch, onEditBatch, onDeleteBatch }) => {
  const [editBatch, setEditBatch] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const canDelete = userRole==="owner"||userRole==="manager";
  const sorted = [...batches].sort((a,b)=>(a.receivedDate||"").localeCompare(b.receivedDate||""));
  const total = sorted.reduce((s,b)=>s+(b.qty||0),0);
  const handleSubmit = async (batch) => {
    const result = editBatch ? await onEditBatch(editBatch.id, batch) : await onAddBatch(batch);
    if(result.ok){ setShowForm(false); setEditBatch(null); }
    return result;
  };
  return (
    <div style={{background:C.cream,padding:"10px 16px 14px 40px",borderBottom:`0.5px solid ${C.khaki}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          Batches — {total} {item.unit} tracked across {sorted.length} lot{sorted.length===1?"":"s"}
        </span>
        <Btn size="sm" variant="primary" onClick={()=>{setEditBatch(null);setShowForm(true);}}>+ Add batch</Btn>
      </div>
      {sorted.length===0 ? (
        <div style={{fontSize:12,color:C.slateL,fontStyle:"italic"}}>No batches logged yet — stock is tracked as one undifferentiated quantity above until you add one.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map((b,idx)=>{
            const d = daysUntil(b.expires);
            return (
              <div key={b.id} style={{display:"grid",gridTemplateColumns:"20px 1.3fr 1fr 1fr 1fr 1fr auto",gap:8,alignItems:"center",fontSize:12,background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"6px 10px"}}>
                <span style={{color:C.slateL,fontSize:10}}>{idx===0?"FIFO next":`#${idx+1}`}</span>
                <span style={{fontWeight:500}}>{b.lotNumber||"— unlabeled —"}</span>
                <span>{b.qty} {item.unit}</span>
                <span style={{color:C.slate}}>${(b.unitCost||0).toFixed(2)}/unit</span>
                <span style={{color:C.slate}}>Recv. {b.receivedDate||"—"}</span>
                <span style={{color:d!==null&&d<0?C.rust:d!==null&&d<7?C.gold:C.slate}}>
                  {b.expires?(d<0?`Expired ${Math.abs(d)}d ago`:d===0?"Expires today":`${d}d left`):"No expiry set"}
                </span>
                <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setEditBatch(b);setShowForm(true);}} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.slate}}>Edit</button>
                  {canDelete && <button onClick={()=>onDeleteBatch(b.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.rust,padding:"0 4px"}}>×</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <Modal title={editBatch?`Edit batch — ${item.name}`:`Add batch — ${item.name}`} onClose={()=>{setShowForm(false);setEditBatch(null);}}>
          <BatchForm item={item} initial={editBatch} onSubmit={handleSubmit} onClose={()=>{setShowForm(false);setEditBatch(null);}} />
        </Modal>
      )}
    </div>
  );
};

const WASTE_REASONS = ["spoilage","trim","overproduction","prep_error","other"];

const WasteForm = ({ item, onSubmit, onClose }) => {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("spoilage");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const submit = async () => {
    if(+qty <= 0){ setErrors({qty:"Enter a quantity greater than 0"}); return; }
    const result = await onSubmit({
      inventoryItemId: item.id, itemName: item.name, unit: item.unit,
      qty: +qty, reason, notes, costImpact: +qty * (item.cost||0),
    });
    if(result.ok) onClose();
    else setErrors(result.fieldErrors||{});
  };
  return (
    <div>
      <FGrid cols={2}>
        <Field label={`Quantity (${item.unit||"units"})`} value={qty} onChange={setQty} type="number" error={errors.qty} />
        <Sel label="Reason" value={reason} onChange={setReason} options={WASTE_REASONS} />
      </FGrid>
      <VoiceField label="Notes (optional)" value={notes} onChange={setNotes} placeholder="What happened?" />
      <div style={{fontSize:12,color:C.slate,margin:"0.5rem 0"}}>
        Estimated cost impact: ${((+qty||0)*(item.cost||0)).toFixed(2)}
      </div>
      <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
        <Btn variant="primary" onClick={submit}>Log waste</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
};

// Simple management panel for the "physical places inventory lives" list —
// add, rename, set default, delete. Delete is blocked server-side (400) if
// the location still has items in it, so the error just surfaces inline
// rather than needing a client-side item-count check duplicated here.
const LocationsPanel = ({ locations, inventory, onAdd, onEdit, onDelete, onClose }) => {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null); // {id, name} while editing
  const [error, setError] = useState(null);
  const countFor = (locId) => inventory.filter(i=>i.locationId===locId).length;

  const addLocation = async () => {
    if(!newName.trim()) return;
    const result = await onAdd({ name: newName.trim() });
    if(result.ok) setNewName(""); else setError(result.error);
  };
  const saveRename = async () => {
    const result = await onEdit(renaming.id, { name: renaming.name });
    if(result.ok) setRenaming(null); else setError(result.error);
  };
  const makeDefault = async (loc) => {
    const result = await onEdit(loc.id, { isDefault: true });
    if(!result.ok) setError(result.error);
  };
  const remove = async (loc) => {
    setError(null);
    const result = await onDelete(loc.id);
    if(result && !result.ok) setError(result.error);
  };

  return (
    <Modal title="Manage locations" onClose={onClose}>
      {error && <div style={{background:C.rustXL,color:C.rust,borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:"0.75rem"}}>{error}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:"1rem"}}>
        {locations.map(loc=>(
          <div key={loc.id} style={{display:"flex",alignItems:"center",gap:8,background:C.cream,borderRadius:8,padding:"8px 10px"}}>
            {renaming?.id===loc.id ? (
              <input value={renaming.name} onChange={e=>setRenaming({...renaming,name:e.target.value})} autoFocus
                style={{flex:1,border:`0.5px solid ${C.khaki}`,borderRadius:6,padding:"4px 8px",fontSize:13,fontFamily:"inherit"}} />
            ) : (
              <span style={{flex:1,fontSize:13,fontWeight:500}}>{loc.name}</span>
            )}
            <span style={{fontSize:11,color:C.slateL}}>{countFor(loc.id)} item{countFor(loc.id)===1?"":"s"}</span>
            {loc.isDefault ? (
              <Pill variant="ok">Default</Pill>
            ) : (
              <button onClick={()=>makeDefault(loc)} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.slate}}>Set default</button>
            )}
            {renaming?.id===loc.id ? (
              <button onClick={saveRename} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.sage}}>Save</button>
            ) : (
              <button onClick={()=>setRenaming({id:loc.id,name:loc.name})} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.slate}}>Rename</button>
            )}
            <button onClick={()=>remove(loc)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.rust,padding:"0 4px"}} title="Delete">×</button>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New location name (e.g. Walk-in Fridge)"
          onKeyDown={e=>e.key==="Enter"&&addLocation()}
          style={{flex:1,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"6px 10px",fontSize:13,fontFamily:"inherit"}} />
        <Btn size="sm" variant="primary" onClick={addLocation}>+ Add</Btn>
      </div>
    </Modal>
  );
};

export default function Inventory({ inventory, batches, suppliers, locations, userRole, onAdd, onEdit, onDelete, onLogWaste, onAddBatch, onEditBatch, onDeleteBatch, onAddLocation, onEditLocation, onDeleteLocation }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [wasteItem, setWasteItem] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showLocations, setShowLocations] = useState(false);
  const locationName = (id) => locations.find(l=>l.id===id)?.name || "Unassigned";
  const filtered = inventory.filter(i =>
    (i.name.toLowerCase().includes(query.toLowerCase()) || i.category.toLowerCase().includes(query.toLowerCase()))
    && (!locationFilter || i.locationId===+locationFilter));
  const low = inventory.filter(i=>invStatus(i)!=="ok").length;
  const expiring = inventory.filter(i=>{ const d=daysUntil(i.expires); return d!==null&&d>=0&&d<7; }).length;
  const stockVal = inventory.reduce((s,i)=>s+i.qty*i.cost,0);
  const locationFilterOptions = [{value:"",label:"All locations"}, ...locations.map(l=>({value:String(l.id),label:l.name}))];

  const handleSubmit = async (item) => {
    const result = editItem ? await onEdit(editItem.id, item) : await onAdd(item);
    if(result.ok) setShowForm(false);
    return result;
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Inventory & stock" sub="Live par-level tracking with reorder alerts, shelf-life countdown, and waste logging"
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search inventory..." />
          <Sel value={locationFilter} onChange={setLocationFilter} options={locationFilterOptions} />
          <Btn size="sm" variant="ghost" onClick={()=>setShowLocations(true)}>Manage locations</Btn>
          <ExportButton resource="inventory" userRole={userRole} />
          <Btn size="sm" variant="primary" onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Add item</Btn>
        </div>} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        <StatCard label="Total SKUs"     value={inventory.length} unit="" />
        <StatCard label="Below par"      value={low}   unit="" color={low>0?C.rust:C.sage} />
        <StatCard label="Expiring soon"  value={expiring} unit="" color={expiring>0?C.gold:C.ink} />
        <StatCard label="Est. stock value" value={`$${Math.round(stockVal).toLocaleString()}`} unit="" color={C.sage} />
      </div>
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1.8fr 0.9fr 1fr 0.8fr 0.8fr 1.1fr 0.9fr 140px",padding:"8px 16px",background:C.cream,fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em"}}>
          {["Item","Category","Location","Stock","Par","Supplier","Status",""].map(h=><span key={h}>{h}</span>)}
        </div>
        {filtered.map(item=>{
          const itemBatches = batches.filter(b=>b.inventoryItemId===item.id);
          const isExpanded = expandedId===item.id;
          return (
          <div key={item.id}>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr 0.9fr 1fr 0.8fr 0.8fr 1.1fr 0.9fr 140px",padding:"11px 16px",borderBottom:isExpanded?"none":`0.5px solid ${C.cream}`,fontSize:13,alignItems:"center"}}>
              <div>
                <span style={{fontWeight:500}}>{item.name}</span>
                {item.expires&&(()=>{ const d=daysUntil(item.expires); return (
                  <div style={{fontSize:10,color:d!==null&&d<0?C.rust:d!==null&&d<7?C.gold:C.slateL}}>
                    {d===null?`Exp. ${item.expires}`:d<0?`Expired ${Math.abs(d)}d ago`:d===0?"Expires today":`Expires in ${d}d`}
                  </div>
                );})()}
              </div>
              <span style={{color:C.slate}}>{item.category}</span>
              <span style={{color:item.locationId?C.slate:C.slateL,fontSize:12,fontStyle:item.locationId?"normal":"italic"}}>{locationName(item.locationId)}</span>
              <span style={{fontWeight:700,color:invStatus(item)==="critical"?C.rust:invStatus(item)==="low"?C.gold:C.ink}}>{item.qty} {item.unit}</span>
              <span style={{color:C.slate}}>{item.parLevel} {item.unit}</span>
              <span style={{color:C.slate,fontSize:12}}>{item.supplier}</span>
              <Pill variant={invStatus(item)}>{invStatus(item)}</Pill>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setExpandedId(isExpanded?null:item.id)} title="FIFO batch / lot tracking"
                  style={{background:isExpanded?C.khaki:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.slate}}>
                  Batches{itemBatches.length>0?` (${itemBatches.length})`:""}
                </button>
                <button onClick={()=>setWasteItem(item)} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.rust}}>Log waste</button>
                <button onClick={()=>{setEditItem(item);setShowForm(true);}} style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:C.slate}}>Edit</button>
                <button onClick={()=>onDelete(item.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.rust,padding:"0 4px"}}>×</button>
              </div>
            </div>
            {isExpanded && (
              <BatchPanel item={item} batches={itemBatches} userRole={userRole}
                onAddBatch={onAddBatch} onEditBatch={onEditBatch} onDeleteBatch={onDeleteBatch} />
            )}
          </div>
          );
        })}
        {filtered.length===0&&<div style={{padding:"2rem",textAlign:"center",color:C.slateL,fontSize:13}}>{query||locationFilter?"No items match your search.":"No items in inventory. Add one to get started."}</div>}
      </div>
      {showLocations&&(
        <LocationsPanel locations={locations} inventory={inventory}
          onAdd={onAddLocation} onEdit={onEditLocation} onDelete={onDeleteLocation}
          onClose={()=>setShowLocations(false)} />
      )}
      {showForm&&(
        <Modal title={editItem?"Edit item":"Add inventory item"} onClose={()=>setShowForm(false)}>
          <InvForm initial={editItem} suppliers={suppliers} locations={locations} onSubmit={handleSubmit} onClose={()=>setShowForm(false)} />
        </Modal>
      )}
      {wasteItem&&(
        <Modal title={`Log waste — ${wasteItem.name}`} onClose={()=>setWasteItem(null)}>
          <WasteForm item={wasteItem} onSubmit={onLogWaste} onClose={()=>setWasteItem(null)} />
        </Modal>
      )}
    </div>
  );
}
