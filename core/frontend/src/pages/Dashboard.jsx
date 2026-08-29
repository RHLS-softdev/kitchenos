import { C } from "../theme";
import { invStatus } from "../lib/utils";
import Icon from "../icons/Icon";
import { Btn, Pill, SectionHeader, StatCard } from "../ui";
import { useAuth } from "../api/authContext";

export default function Dashboard({ recipes, inventory, equipment, catering, orders, onNav }) {
  const { user } = useAuth();
  const alerts = inventory.filter(i=>invStatus(i)!=="ok").length +
                 equipment.filter(e=>e.status!=="ok").length;
  const stockVal = inventory.reduce((s,i)=>s+i.qty*i.cost,0);
  const confirmedRev = catering.filter(e=>e.status==="confirmed").reduce((s,e)=>s+e.revenue,0);
  const openOrders = orders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled").length;
  const pricedRecipes = recipes.filter(r=>r.menuPrice>0);
  const avgFoodCostPct = pricedRecipes.length
    ? Math.round(pricedRecipes.reduce((s,r)=>s+(r.cost/r.menuPrice)*100,0)/pricedRecipes.length)
    : null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
      <SectionHeader title="Operations overview" sub={`${user?.email ?? ""} · live data`} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <StatCard label="Active recipes"    value={recipes.length} unit="" />
        <StatCard label="Inventory alerts"  value={alerts} unit="" color={alerts>0?C.rust:C.sage} />
        <StatCard label="Est. stock value"  value={`$${Math.round(stockVal).toLocaleString()}`} unit="" color={C.sage} />
        <StatCard label="Confirmed revenue" value={`$${(confirmedRev/1000).toFixed(1)}`} unit="k" color={C.sage} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        <StatCard label="Open orders" value={openOrders} unit="" color={openOrders>0?C.gold:C.ink} />
        <StatCard label="Avg. food cost %" value={avgFoodCostPct ?? "—"} unit={avgFoodCostPct!=null?"%":""} color={C.slate} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"1rem"}}>
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:"1rem"}}>Inventory status</div>
          {inventory.map(item=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`0.5px solid ${C.cream}`}}>
              <Pill variant={invStatus(item)}>{invStatus(item).toUpperCase()}</Pill>
              <span style={{flex:1,fontSize:13}}>{item.name}</span>
              <span style={{fontSize:13,fontWeight:600,color:invStatus(item)==="critical"?C.rust:invStatus(item)==="low"?C.gold:C.ink}}>
                {item.qty} {item.unit}
              </span>
            </div>
          ))}
          {inventory.length===0&&<div style={{color:C.slateL,fontSize:13,padding:"1rem 0"}}>No inventory items yet.</div>}
          <div style={{marginTop:12}}><Btn size="sm" variant="ghost" onClick={()=>onNav("inventory")}>Manage inventory →</Btn></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Upcoming catering</div>
            {catering.slice(0,3).map(e=>(
              <div key={e.id} style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:600}}>{e.name}</div>
                <div style={{fontSize:11,color:C.slate}}>{e.date} · {e.pax} pax · <span style={{color:C.sage}}>${e.revenue.toLocaleString()}</span></div>
              </div>
            ))}
            {catering.length===0&&<div style={{color:C.slateL,fontSize:12}}>No events yet.</div>}
            <div style={{marginTop:6}}><Btn size="sm" variant="ghost" onClick={()=>onNav("catering")}>View all →</Btn></div>
          </div>
          {equipment.filter(e=>e.status!=="ok").length>0&&(
            <div style={{background:C.rustXL,border:`0.5px solid ${C.rust}44`,borderRadius:12,padding:"1.25rem"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.rust,marginBottom:6}}>⚠ Equipment alerts</div>
              {equipment.filter(e=>e.status!=="ok").map(e=>(
                <div key={e.id} style={{fontSize:12,color:C.rust,marginBottom:4}}>{e.name}</div>
              ))}
              <div style={{marginTop:8}}><Btn size="sm" variant="danger" onClick={()=>onNav("equipment")}>Review →</Btn></div>
            </div>
          )}
          <div style={{background:C.sageXL,border:`0.5px solid ${C.sage}44`,borderRadius:12,padding:"1.25rem"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.sage,marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Icon name="microphone" size={14}/> Voice input ready</div>
            <div style={{fontSize:12,color:C.sage+"bb"}}>Narrate a recipe or run a verbal stocktake.</div>
            <div style={{marginTop:10}}><Btn variant="primary" size="sm" onClick={()=>onNav("voice")}>Open voice input</Btn></div>
          </div>
        </div>
      </div>
    </div>
  );
}
