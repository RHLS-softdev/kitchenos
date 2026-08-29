import { useState } from "react";
import { C } from "../theme";
import { Btn, FGrid, Field, VoiceField, Modal, Pill, Sel, AIError, SectionHeader, StatCard, SearchBox, ExportButton } from "../ui";
import Icon from "../icons/Icon";
import { callAI } from "../api/ai";

const STATUS_OPTIONS = [{value:"processing",label:"Processing"},{value:"in-transit",label:"In transit"},{value:"partial",label:"Partially received"},{value:"delivered",label:"Delivered"},{value:"cancelled",label:"Cancelled"}];
const BLANK_ORDER = {supplierId:"",items:"",due:"",total:0,invoiceUrl:""};
const BLANK_LINE = {name:"",unit:"",qtyOrdered:"",unitCost:"",inventoryItemId:""};

export default function Procurement({ orders, suppliers, inventory, userRole, onAdd, onEdit, onReceive }) {
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [f, setF] = useState(BLANK_ORDER);
  const [lines, setLines] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [query, setQuery] = useState("");
  const filtered = orders.filter(o => (o.supplier||"").toLowerCase().includes(query.toLowerCase()));
  const spend = orders.reduce((s,o)=>s+o.total,0);
  const pending = orders.filter(o=>o.status!=="delivered").length;

  const runForecast = async () => {
    setLoading(true); setForecast(null); setError(null);
    const result = await callAI("forecast", {});
    setLoading(false);
    if(!result.ok){ setError(result.error); return; }
    setForecast(result.data);
  };

  const addLine = () => setLines(p=>[...p,{...BLANK_LINE}]);
  const setLine = (i,k,v) => setLines(p=>p.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const removeLine = (i) => setLines(p=>p.filter((_,idx)=>idx!==i));

  const submitOrder = async () => {
    const e = {};
    if(!f.supplierId) e.supplier="Select a supplier above";
    if(+f.total < 0) e.total="Cannot be negative";
    setFormErrors(e);
    if(Object.keys(e).length) return;
    const validLines = lines.filter(l=>l.name.trim()).map(l=>({
      name:l.name, unit:l.unit, qtyOrdered:+l.qtyOrdered||0, unitCost:+l.unitCost||0,
      ...(l.inventoryItemId?{inventoryItemId:+l.inventoryItemId}:{}),
    }));
    const result = await onAdd({
      ...f, supplierId:+f.supplierId, total:+f.total, status:"processing",
      ...(validLines.length?{lineItems:validLines}:{}),
    });
    if(result.ok){ setShowForm(false); setF(BLANK_ORDER); setLines([]); setFormErrors({}); }
    else setFormErrors(result.fieldErrors||{});
  };

  const submitEdit = async () => {
    const result = await onEdit(editingOrder.id, {
      due: editingOrder.due, total: +editingOrder.total, invoiceUrl: editingOrder.invoiceUrl,
    });
    if(result.ok) setEditingOrder(null);
  };

  // Every order gets a working Receive action, whether or not it was
  // created with structured line items — orders with none just get marked
  // received outright (there's nothing granular to reconcile).
  const startReceiving = (o) => {
    if (o.lineItems?.length > 0) {
      setReceiveOrder({ ...o, draft: o.lineItems.map(li => ({ ...li, receiving: "" })) });
    } else if (window.confirm(`Mark this order from ${o.supplier} as fully received?`)) {
      onReceive(o.id, { lines: [] });
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Procurement" sub="Supplier orders, lead times, and spend tracking"
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search by supplier..." />
          <ExportButton resource="orders" userRole={userRole} />
          <Btn size="sm" variant="ghost" onClick={runForecast} disabled={loading}>
            <span style={{display:"flex",alignItems:"center",gap:6}}><Icon name="sparkles" size={13}/> {loading?"Forecasting…":"AI forecast"}</span>
          </Btn>
          <Btn size="sm" variant="primary" onClick={()=>setShowForm(true)}>+ New order</Btn>
        </div>} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <StatCard label="Orders total" value={orders.length} unit="" />
        <StatCard label="Total spend" value={`$${spend.toLocaleString()}`} unit="" />
        <StatCard label="Pending deliveries" value={pending} unit="" color={pending>0?C.gold:C.ink} />
      </div>
      {error&&<AIError message={error} onRetry={runForecast} />}
      {forecast&&(
        <div style={{background:C.white,border:`0.5px solid ${C.sage}44`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:700,color:C.sage,display:"flex",alignItems:"center",gap:6}}><Icon name="sparkles" size={15}/> AI demand forecast</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:13,color:C.slate}}>Est. total: <strong>${forecast.totalEstimate?.toLocaleString()}</strong></span>
              <button onClick={()=>setForecast(null)} style={{background:"none",border:"none",cursor:"pointer",color:C.slate,fontSize:16}}>×</button>
            </div>
          </div>
          <div style={{background:C.sageXL,borderRadius:8,padding:"8px 12px",fontSize:13,color:C.sage,marginBottom:12}}>{forecast.summary}</div>
          {forecast.items?.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`0.5px solid ${C.cream}`,fontSize:13}}>
              <Pill variant={item.urgency==="high"?"critical":item.urgency==="medium"?"warning":"ok"}>{item.urgency}</Pill>
              <span style={{flex:1,fontWeight:500}}>{item.name}</span>
              <span style={{color:C.slate}}>{item.qty} {item.unit}</span>
              <span style={{fontSize:12,color:C.slateL}}>{item.reason}</span>
            </div>
          ))}
          {forecast.notes&&<div style={{marginTop:10,fontSize:12,color:C.slate,borderLeft:`2px solid ${C.gold}`,paddingLeft:10}}>{forecast.notes}</div>}
        </div>
      )}
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Active orders</div>
        {filtered.length===0&&<div style={{color:C.slateL,fontSize:13,textAlign:"center",padding:"1rem"}}>{query?"No orders match your search.":"No orders yet."}</div>}
        {filtered.map(o=>(
          <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`0.5px solid ${C.cream}`,fontSize:13}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600}}>{o.supplier}</div>
              <div style={{fontSize:12,color:C.slate}}>{o.items||`${o.lineItems?.length||0} line item(s)`}</div>
              {o.invoiceUrl && <a href={o.invoiceUrl} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.sage}}>Invoice ↗</a>}
            </div>
            <div style={{textAlign:"right",minWidth:70}}><div style={{fontWeight:700}}>${o.total.toLocaleString()}</div>{o.due&&<div style={{fontSize:12,color:C.slate}}>Due {o.due}</div>}</div>
            {o.status!=="delivered"&&o.status!=="cancelled"&&(
              <Btn size="sm" onClick={()=>startReceiving(o)}>Receive</Btn>
            )}
            <button onClick={()=>setEditingOrder({...o})} title="Edit due date, total, or invoice link"
              style={{background:"none",border:`0.5px solid ${C.khaki}`,borderRadius:6,cursor:"pointer",padding:"5px 7px",color:C.slate,display:"flex"}}>
              <Icon name="pencil" size={14} />
            </button>
            <select value={o.status} onChange={e=>onEdit(o.id,{status:e.target.value})}
              style={{border:`0.5px solid ${C.khaki}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontFamily:"inherit",background:C.cream}}>
              {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      {showForm&&(
        <Modal title="New purchase order" onClose={()=>setShowForm(false)}>
          <FGrid cols={2}>
            <Sel label="Supplier" value={f.supplierId} onChange={v=>setF(p=>({...p,supplierId:v}))}
              options={[{value:"",label:"Select supplier..."},...suppliers.map(s=>({value:String(s.id),label:s.name}))]} error={formErrors.supplier} />
            <Field label="Due date" value={f.due} onChange={v=>setF(p=>({...p,due:v}))} type="date" />
          </FGrid>
          <VoiceField label="Items / description (optional if using line items below)" value={f.items} onChange={v=>setF(p=>({...p,items:v}))} placeholder="e.g. Duck legs 10kg, Heavy cream 8L" />
          <FGrid cols={2}>
            <Field label="Total ($)" value={f.total} onChange={v=>setF(p=>({...p,total:v}))} type="number" error={formErrors.total} />
            <Field label="Invoice link (optional)" value={f.invoiceUrl} onChange={v=>setF(p=>({...p,invoiceUrl:v}))} placeholder="https://..." />
          </FGrid>

          <div style={{marginTop:"1rem",paddingTop:"0.75rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:700,color:C.slate,textTransform:"uppercase"}}>Line items (enables per-item receiving)</div>
              <Btn size="sm" onClick={addLine}>+ Add line</Btn>
            </div>
            {lines.map((l,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"1.5fr 1.5fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                <Sel label="" value={l.inventoryItemId} onChange={v=>{
                  const item = inventory.find(x=>String(x.id)===v);
                  setLines(p=>p.map((line,idx)=>idx===i?{...line,inventoryItemId:v,
                    name:item?item.name:line.name, unit:item?item.unit:line.unit}:line));
                }} options={[{value:"",label:"Link to stock item (optional)"},...inventory.map(x=>({value:String(x.id),label:x.name}))]} />
                <Field label="" value={l.name} onChange={v=>setLine(i,"name",v)} placeholder="Item name" />
                <Field label="" value={l.unit} onChange={v=>setLine(i,"unit",v)} placeholder="Unit" />
                <Field label="" value={l.qtyOrdered} onChange={v=>setLine(i,"qtyOrdered",v)} type="number" placeholder="Qty" />
                <Field label="" value={l.unitCost} onChange={v=>setLine(i,"unitCost",v)} type="number" placeholder="Unit cost" />
                <button onClick={()=>removeLine(i)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.rust}}>×</button>
              </div>
            ))}
            {lines.length===0 && <div style={{fontSize:11,color:C.slateL}}>No line items — this order can still be created and marked received as a whole, just without per-item quantities.</div>}
          </div>

          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={submitOrder}>Create order</Btn>
            <Btn variant="secondary" onClick={()=>{setShowForm(false);setFormErrors({});}}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {editingOrder&&(
        <Modal title={`Edit order — ${editingOrder.supplier}`} onClose={()=>setEditingOrder(null)}>
          <FGrid cols={2}>
            <Field label="Due date" value={editingOrder.due||""} onChange={v=>setEditingOrder(p=>({...p,due:v}))} type="date" />
            <Field label="Total ($)" value={editingOrder.total} onChange={v=>setEditingOrder(p=>({...p,total:v}))} type="number" />
          </FGrid>
          <Field label="Invoice link" value={editingOrder.invoiceUrl||""} onChange={v=>setEditingOrder(p=>({...p,invoiceUrl:v}))} placeholder="https://..." />
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={submitEdit}>Save changes</Btn>
            <Btn variant="secondary" onClick={()=>setEditingOrder(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {receiveOrder&&(
        <Modal title={`Receive delivery — ${receiveOrder.supplier}`} onClose={()=>setReceiveOrder(null)}>
          {receiveOrder.draft.map((li,i)=>(
            <div key={li.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:13}}>{li.name} <span style={{color:C.slateL,fontSize:11}}>(ordered {li.qtyOrdered}, received {li.qtyReceived})</span></div>
              <Field label="" value={li.receiving} onChange={v=>setReceiveOrder(p=>({...p,draft:p.draft.map((x,idx)=>idx===i?{...x,receiving:v}:x)}))} type="number" placeholder="Qty received now" />
              <div style={{fontSize:12,color:C.slate}}>{li.unit}</div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:"1.25rem",paddingTop:"1rem",borderTop:`0.5px solid ${C.khaki}`}}>
            <Btn variant="primary" onClick={async ()=>{
              const linesPayload = receiveOrder.draft.filter(l=>+l.receiving>0).map(l=>({lineItemId:l.id,qtyReceived:+l.receiving}));
              const result = await onReceive(receiveOrder.id, { lines: linesPayload });
              if(result.ok) setReceiveOrder(null);
            }}>Confirm receipt</Btn>
            <Btn variant="secondary" onClick={()=>setReceiveOrder(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
