import { useState } from "react";
import { C } from "./theme";
import { invStatus } from "./lib/utils";
import { AuthProvider } from "./api/AuthProvider";
import { useAuth } from "./api/authContext";
import { useApiResource } from "./api/useApiResource";
import { api } from "./api/client";
import { keysToCamel, keysToSnake } from "./api/caseConvert";
import LoginScreen from "./LoginScreen";

import Dashboard from "./pages/Dashboard";
import Recipes from "./pages/Recipes";
import Inventory from "./pages/Inventory";
import ShoppingList from "./pages/ShoppingList";
import Procurement from "./pages/Procurement";
import Equipment from "./pages/Equipment";
import Catering from "./pages/Catering";
import FlavourAI from "./pages/FlavourAI";
import Billing from "./pages/Billing";
import Marketplace from "./pages/Marketplace";
import VoiceInput from "./pages/VoiceInput";
import Pricing from "./pages/Pricing";
import Workflow from "./pages/Workflow";
import Reports from "./pages/Reports";
import Ingredients from "./pages/Ingredients";
import Icon from "./icons/Icon";

const MODULES = [
  { id:"dashboard",   icon:"layout-dashboard", label:"Dashboard" },
  { id:"recipes",     icon:"chef-hat", label:"Recipes" },
  { id:"ingredients", icon:"database", label:"Ingredients" },
  { id:"inventory",   icon:"packages", label:"Inventory" },
  { id:"shopping",    icon:"shopping-cart", label:"Shopping list" },
  { id:"procurement", icon:"truck-delivery", label:"Procurement" },
  { id:"equipment",   icon:"tools-kitchen-3", label:"Equipment" },
  { id:"catering",    icon:"building-store", label:"Catering" },
  { id:"workflow",    icon:"checklist", label:"Workflow" },
  { id:"reports",     icon:"chart-bar", label:"Reports" },
  { id:"flavour",     icon:"sparkles", label:"Flavour AI" },
  { id:"billing",     icon:"receipt", label:"Billing" },
  { id:"marketplace", icon:"building-store", label:"Marketplace" },
  { id:"voice",       icon:"microphone", label:"Voice input" },
];

function KitchenOS() {
  const { user } = useAuth();
  const [page, setPage] = useState("dashboard");

  const recipesRes   = useApiResource("/recipes");
  const inventoryRes = useApiResource("/inventory");
  const equipmentRes = useApiResource("/equipment");
  const cateringRes  = useApiResource("/catering");
  const suppliersRes = useApiResource("/suppliers");
  const ordersRes    = useApiResource("/orders");
  const tasksRes     = useApiResource("/tasks");
  const tempLogsRes  = useApiResource("/temperature-logs");
  const shiftNotesRes = useApiResource("/shift-notes");
  const wasteLogsRes = useApiResource("/waste-logs");
  const ingredientsRes = useApiResource("/ingredients");
  const inventoryBatchesRes = useApiResource("/inventory-batches");
  const locationsRes = useApiResource("/locations");

  const allReady = ![recipesRes, inventoryRes, equipmentRes, cateringRes, suppliersRes, ordersRes,
    tasksRes, tempLogsRes, shiftNotesRes, wasteLogsRes, ingredientsRes, inventoryBatchesRes].some(r => r.loading);

  // Equipment service log is a custom endpoint, not standard CRUD.
  const logService = async (id, payload) => {
    try {
      const res = await api.post(`/equipment/${id}/log`, keysToSnake(payload));
      const updated = keysToCamel(res);
      equipmentRes.setData(prev => prev.map(x => x.id === id ? updated : x));
      return { ok: true, data: updated };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const updateInventoryFromVoice = (id, payload) => inventoryRes.update(id, payload);

  // Recalculating nutrition is a custom endpoint (reads linked Ingredient
  // rows, computes totals) — not a plain field update.
  const recalculateNutrition = async (recipeId) => {
    try {
      const res = await api.post(`/recipes/${recipeId}/recalculate-nutrition`, {});
      const result = keysToCamel(res);
      recipesRes.setData(prev => prev.map(x => x.id === recipeId ? result.recipe : x));
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // Marking an ingredient verified is a custom endpoint (records who/when,
  // owner-only server-side) — not a plain field update.
  const verifyIngredient = async (id, verified) => {
    try {
      const res = await api.post(`/ingredients/${id}/verify`, { verified });
      const updated = keysToCamel(res);
      ingredientsRes.setData(prev => prev.map(x => x.id === id ? updated : x));
      return { ok: true, data: updated };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // Receiving is a custom endpoint (fans out into inventory qty + batches +
  // price history), not a plain field update — same shape as logService above.
  const receiveOrder = async (id, payload) => {
    try {
      const res = await api.post(`/orders/${id}/receive`, keysToSnake(payload));
      const updated = keysToCamel(res);
      ordersRes.setData(prev => prev.map(x => x.id === id ? updated : x));
      return { ok: true, data: updated };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const alerts = inventoryRes.data.filter(i=>invStatus(i)!=="ok").length
    + equipmentRes.data.filter(e=>e.status!=="ok").length;

  const pages = {
    dashboard:   <Dashboard recipes={recipesRes.data} inventory={inventoryRes.data} equipment={equipmentRes.data} catering={cateringRes.data} orders={ordersRes.data} onNav={setPage} />,
    recipes:     <Recipes recipes={recipesRes.data} ingredients={ingredientsRes.data} userRole={user?.role} onAdd={recipesRes.create} onEdit={recipesRes.update} onDelete={recipesRes.remove} onRecalculateNutrition={recalculateNutrition} onNav={setPage} />,
    ingredients: <Ingredients ingredients={ingredientsRes.data} userRole={user?.role} onAdd={ingredientsRes.create} onEdit={ingredientsRes.update} onDelete={ingredientsRes.remove} onVerify={verifyIngredient} />,
    inventory:   <Inventory inventory={inventoryRes.data} batches={inventoryBatchesRes.data} suppliers={suppliersRes.data} locations={locationsRes.data} userRole={user?.role} onAdd={inventoryRes.create} onEdit={inventoryRes.update} onDelete={inventoryRes.remove} onLogWaste={wasteLogsRes.create} onAddBatch={inventoryBatchesRes.create} onEditBatch={inventoryBatchesRes.update} onDeleteBatch={inventoryBatchesRes.remove} onAddLocation={locationsRes.create} onEditLocation={locationsRes.update} onDeleteLocation={locationsRes.remove} />,
    shopping:    <ShoppingList inventory={inventoryRes.data} recipes={recipesRes.data} catering={cateringRes.data} onCreateOrder={ordersRes.create} />,
    procurement: <Procurement orders={ordersRes.data} suppliers={suppliersRes.data} inventory={inventoryRes.data} userRole={user?.role} onAdd={ordersRes.create} onEdit={ordersRes.update} onReceive={receiveOrder} />,
    equipment:   <Equipment equipment={equipmentRes.data} userRole={user?.role} onAdd={equipmentRes.create} onEdit={equipmentRes.update} onLogService={logService} />,
    catering:    <Catering catering={cateringRes.data} recipes={recipesRes.data} userRole={user?.role} onAdd={cateringRes.create} onEdit={cateringRes.update} onDelete={cateringRes.remove} />,
    workflow:    <Workflow tasks={tasksRes.data} userRole={user?.role} onAddTask={tasksRes.create} onEditTask={tasksRes.update} onDeleteTask={tasksRes.remove}
                            tempLogs={tempLogsRes.data} onAddTempLog={tempLogsRes.create}
                            shiftNotes={shiftNotesRes.data} onAddShiftNote={shiftNotesRes.create} />,
    reports:     <Reports />,
    flavour:     <FlavourAI recipes={recipesRes.data} />,
    billing:     <Billing orders={ordersRes.data} catering={cateringRes.data} recipes={recipesRes.data} />,
    marketplace: <Marketplace suppliers={suppliersRes.data} userRole={user?.role} onAdd={suppliersRes.create} onNav={setPage} />,
    voice:       <VoiceInput inventory={inventoryRes.data} onSaveRecipe={recipesRes.create} onUpdateInventory={updateInventoryFromVoice} />,
    pricing:     <Pricing />,
  };

  if(!allReady){
    return (
      <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.slate,fontSize:14}}>
        Loading KitchenOS…
      </div>
    );
  }

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:220,flexShrink:0,background:C.ink,display:"flex",flexDirection:"column",padding:"0 0 1rem"}}>
        <div style={{padding:"1.25rem 1.25rem 1rem"}}>
          <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:20,color:C.cream,letterSpacing:"-0.02em"}}>KitchenOS</div>
          <div style={{fontSize:11,color:C.slateL,marginTop:2}}>Restaurant intelligence</div>
        </div>
        <nav style={{flex:1,padding:"0.75rem",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
          {MODULES.map(m=>{
            const isAlert = (m.id==="inventory"||m.id==="equipment")&&alerts>0;
            return (
              <button key={m.id} onClick={()=>setPage(m.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,border:"none",background:page===m.id?"#ffffff18":"transparent",color:page===m.id?C.cream:C.slateL,cursor:"pointer",textAlign:"left",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:page===m.id?600:400,transition:"background 0.15s",justifyContent:"space-between"}}>
                <span style={{display:"flex",gap:10,alignItems:"center"}}>
                  <Icon name={m.icon} size={17} />{m.label}
                </span>
                {isAlert&&<span style={{fontSize:10,fontWeight:700,background:C.rust,color:C.white,borderRadius:10,padding:"1px 5px"}}>{alerts}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{padding:"0 0.75rem"}}>
          <button onClick={()=>setPage("pricing")} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:`${C.sage}33`,border:`0.5px solid ${C.sage}66`,borderRadius:8,color:C.sageL,padding:"8px 12px",fontSize:12,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",fontWeight:600}}>
            <Icon name="receipt" size={14} /> Upgrade plan
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:52,borderBottom:`0.5px solid ${C.khaki}`,background:C.white,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 1.5rem",flexShrink:0}}>
          <div style={{fontSize:13,color:C.slate}}>
            {user?.email}
            {user?.position && <span style={{color:C.slateL}}> · {user.position}</span>}
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <button onClick={()=>setPage("voice")} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:C.rustXL,border:`0.5px solid ${C.rust}44`,borderRadius:20,fontSize:12,fontWeight:600,color:C.rust,cursor:"pointer",fontFamily:"inherit"}}>
              <Icon name="microphone" size={14} /> Voice input
            </button>
            <div style={{width:32,height:32,borderRadius:"50%",background:C.sageXL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:C.sage}}>
              {(user?.email||"?")[0].toUpperCase()}
            </div>
          </div>
        </div>
        {/* Page content */}
        <div style={{flex:1,overflowY:"auto",padding:"1.5rem"}}>
          {pages[page]||pages.dashboard}
        </div>
      </div>
    </div>
  );
}

function AuthGate() {
  const { status } = useAuth();
  if(status === "loading"){
    return (
      <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.slate,fontSize:14}}>
        Loading…
      </div>
    );
  }
  if(status === "guest") return <LoginScreen />;
  return <KitchenOS />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
