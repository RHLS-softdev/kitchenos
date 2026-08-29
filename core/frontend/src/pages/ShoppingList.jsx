import { useState } from "react";
import { C } from "../theme";
import { computeShoppingList } from "../lib/utils";
import Icon from "../icons/Icon";
import { Btn, Pill, SectionHeader } from "../ui";

export default function ShoppingList({ inventory, recipes, catering, onCreateOrder }) {
  const items = computeShoppingList(inventory, recipes, catering);
  const [checked, setChecked] = useState({});
  const [placing, setPlacing] = useState(false);
  const toggle = name => setChecked(p=>({...p,[name]:!p[name]}));
  const selectedCount = Object.values(checked).filter(Boolean).length;
  const estTotal = items.reduce((s,i)=>s+i.needed*(i.cost||0),0);

  // Grouped by supplier so a shopping run maps directly onto who to call/order
  // from — items with no known supplier fall under "Unassigned".
  const groups = {};
  items.forEach(i => {
    const key = i.supplier && i.supplier !== "—" ? i.supplier : "Unassigned";
    (groups[key] = groups[key] || []).push(i);
  });

  const placeOrder = async () => {
    const sel = items.filter(i=>checked[i.name]);
    setPlacing(true);
    await onCreateOrder({
      supplier: "Various",
      items: sel.map(i=>`${i.name} (×${i.needed.toFixed(1)} ${i.unit})`).join(", "),
      status: "processing",
      total: sel.reduce((s,i)=>s+i.needed*(i.cost||0),0),
    });
    setPlacing(false);
    setChecked({});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Shopping list" sub={`Auto-generated from par levels and upcoming catering requirements · Est. total $${estTotal.toFixed(2)}`}
        action={<Btn size="sm" variant="primary" disabled={selectedCount===0||placing} onClick={placeOrder}>
          {placing?"Placing…":`Place order (${selectedCount} items)`}
        </Btn>} />
      {items.length===0?(
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"3rem",textAlign:"center",color:C.slateL}}>
          <div style={{marginBottom:8,color:C.sage,display:"flex",justifyContent:"center"}}><Icon name="circle-check" size={32} /></div>
          All stock is above par level and catering requirements are met.
        </div>
      ):(
        Object.entries(groups).map(([supplier, groupItems]) => (
          <div key={supplier} style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 16px",background:C.khaki,fontSize:12,fontWeight:700}}>
              <span>{supplier}</span>
              <span>Est. ${groupItems.reduce((s,i)=>s+i.needed*(i.cost||0),0).toFixed(2)}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"auto 2fr 1fr 1fr 1fr 2fr 1fr",padding:"8px 16px",background:C.cream,fontSize:11,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em"}}>
              {["","Item","Need","Unit","Est. cost","Reason","Priority"].map(h=><span key={h}>{h}</span>)}
            </div>
            {groupItems.map(item=>(
              <div key={item.name} style={{display:"grid",gridTemplateColumns:"auto 2fr 1fr 1fr 1fr 2fr 1fr",padding:"11px 16px",borderBottom:`0.5px solid ${C.cream}`,fontSize:13,alignItems:"center",background:checked[item.name]?C.sageXL:C.white}}>
                <input type="checkbox" checked={!!checked[item.name]} onChange={()=>toggle(item.name)} style={{accentColor:C.sage,width:15,height:15,marginRight:4}} />
                <span style={{fontWeight:500,textDecoration:checked[item.name]?"line-through":"none"}}>{item.name}</span>
                <span style={{fontWeight:700,color:item.priority==="critical"?C.rust:item.priority==="low"?C.gold:C.ink}}>{item.needed.toFixed(1)}</span>
                <span style={{color:C.slate}}>{item.unit}</span>
                <span style={{color:C.slate}}>{item.cost?`$${(item.needed*item.cost).toFixed(2)}`:"—"}</span>
                <span style={{fontSize:12,color:C.slate}}>{item.reasons.join("; ")}</span>
                <Pill variant={item.priority==="critical"?"critical":item.priority==="low"?"warning":"ok"}>{item.priority}</Pill>
              </div>
            ))}
          </div>
        ))
      )}
      <div style={{background:C.goldXL,border:`0.5px solid ${C.gold}44`,borderRadius:12,padding:"1rem 1.25rem",fontSize:13,color:C.gold}}>
        <strong>How to use:</strong> Tick items to include, then "Place order" to add them to Procurement as a new order.
      </div>
    </div>
  );
}
