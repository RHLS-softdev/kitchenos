import { useState } from "react";
import { C } from "../theme";
import { Btn, Pill, AIError, SectionHeader, useSpeechToText } from "../ui";
import Icon from "../icons/Icon";
import { callAI } from "../api/ai";

export default function VoiceInput({ inventory, onSaveRecipe, onUpdateInventory }) {
  const [mode, setMode] = useState("recipe"); // recipe | stocktake
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState({});
  const [error, setError] = useState(null);
  // Same hook every other dictation field in the app uses (local
  // faster-whisper via /voice/transcribe — see app/voice.py) rather than a
  // second, separate SpeechRecognition implementation just for this page.
  // "Continuous" narration falls out naturally: recording just keeps
  // running until Stop is tapped, then the whole clip is transcribed at
  // once — no need for live partial results when Step 2 already requires
  // reviewing the transcript before it's used for anything.
  const { listening, transcribing, toggle, supported } = useSpeechToText(
    text => setTranscript(prev => (prev ? prev + " " : "") + text)
  );

  const parseInput = async () => {
    if(!transcript.trim()) return;
    setLoading(true); setParsed(null); setError(null);
    const endpoint = mode==="recipe" ? "voice-recipe" : "voice-stocktake";
    const result = await callAI(endpoint, { transcript });
    setLoading(false);
    if(!result.ok){ setError(result.error); return; }

    if(mode==="recipe"){
      const data = result.data;
      setParsed(data);
      const v={}; data.ingredients?.forEach((_,i)=>{v[i]=false;}); setVerified(v);
    } else {
      const data = result.data; // array
      setParsed({stocktake:data});
      const v={}; data.forEach((_,i)=>{v[i]=false;}); setVerified(v);
    }
  };

  const allVerified = parsed && Object.values(verified).every(Boolean) && Object.keys(verified).length > 0;

  const saveRecipe = async () => {
    if(!parsed||mode!=="recipe") return;
    setSaving(true);
    const result = await onSaveRecipe({
      name: parsed.name||"New recipe",
      category: parsed.category||"Main",
      origin: parsed.origin||"",
      servings: parsed.servings||4,
      cost: parsed.estCostUSD||0,
      kcal:0, protein:0, carbs:0, fat:0,
      allergens: parsed.allergens||["none"],
      flavours: parsed.flavours||[],
      verified: false,
      prepMins: parsed.prepMins||0,
      cookMins: parsed.cookMins||0,
      ingredients: parsed.ingredients?.map(i=>({name:i.name,qty:i.qty,unit:i.unit}))||[],
      steps: parsed.steps||[],
    });
    setSaving(false);
    if(result.ok){ setParsed(null); setTranscript(""); setVerified({}); }
    else setError(result.error||"Couldn't save recipe.");
  };

  const applyStocktake = async () => {
    if(!parsed?.stocktake) return;
    setSaving(true);
    const toApply = parsed.stocktake.filter((_,i)=>verified[i]);
    for(const item of toApply){
      const match = inventory.find(inv=>inv.name.toLowerCase()===item.name.toLowerCase());
      if(match){
        await onUpdateInventory(match.id, { qty: item.qty, unit: item.unit||match.unit });
      }
    }
    setSaving(false);
    setParsed(null); setTranscript(""); setVerified({});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <SectionHeader title="Voice input" sub="Narrate a recipe or verbal stocktake — AI structures it — you verify before saving" />
      <div style={{display:"flex",gap:2,background:C.cream,border:`0.5px solid ${C.khaki}`,borderRadius:10,padding:3,width:"fit-content"}}>
        {[["recipe","chef-hat","Recipe parser"],["stocktake","packages","Verbal stocktake"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>{setMode(id);setParsed(null);setTranscript("");setError(null);}}
            style={{display:"flex",alignItems:"center",gap:6,border:"none",borderRadius:8,padding:"6px 16px",fontSize:13,fontFamily:"inherit",fontWeight:600,cursor:"pointer",background:mode===id?C.white:C.cream,color:mode===id?C.ink:C.slateL,boxShadow:mode===id?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
            <Icon name={icon} size={14} />{label}
          </button>
        ))}
      </div>
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Step 1 — {mode==="recipe"?"Narrate your recipe":"Read off your current stock levels"}</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {supported ? (
            <Btn variant={listening?"danger":"primary"} onClick={toggle} disabled={transcribing}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <Icon name={listening?"microphone-off":"microphone"} size={14} />
                {transcribing?"Transcribing…":listening?"Stop recording":"Start recording"}
              </span>
            </Btn>
          ) : (
            <span style={{fontSize:12,color:C.slateL}}>Microphone dictation isn't available here — type below instead.</span>
          )}
          {listening&&<span style={{fontSize:12,color:C.rust,alignSelf:"center",animation:"pulse 1s infinite",display:"flex",alignItems:"center",gap:4}}><Icon name="microphone" size={12}/> Listening…</span>}
        </div>
        <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
          placeholder={mode==="recipe"
            ? "Or type here…\n\nExample: 'Duck confit for four. You'll need four duck legs, 500g duck fat, thyme and garlic. Salt overnight. Cook in fat at 80 degrees for six hours. Costs about 38 dollars for the batch.'"
            : "Or type here…\n\nExample: 'Chicken breast, 18 kilos. Heavy cream, 6 litres. Arborio rice, 15 kilos. Duck legs, critical, only 2 kilos left.'"}
          style={{width:"100%",minHeight:100,border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"10px 12px",fontSize:13,fontFamily:"inherit",background:C.cream,resize:"vertical"}} />
        <div style={{marginTop:10}}>
          <Btn variant="primary" onClick={parseInput} disabled={loading||!transcript.trim()}>
            <span style={{display:"flex",alignItems:"center",gap:6}}>
              {loading?"AI is parsing…":<><Icon name="sparkles" size={14}/> Parse with AI →</>}
            </span>
          </Btn>
        </div>
      </div>
      {error&&<AIError message={error} onRetry={parseInput} />}
      {parsed&&!parsed.stocktake&&(
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem",display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:700}}>Step 2 — Verify before saving</div>
            <Pill variant="warning">⚠ Human review required</Pill>
          </div>
          {parsed.notes&&<div style={{background:C.goldXL,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.gold,borderLeft:`3px solid ${C.gold}`}}><strong>AI notes:</strong> {parsed.notes}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:13}}>
            {[["Name",parsed.name],["Category",parsed.category],["Servings",parsed.servings],["Prep",`${parsed.prepMins}min`],["Cook",`${parsed.cookMins}min`],["Est. cost",`$${parsed.estCostUSD}`]].map(([l,v])=>(
              <div key={l} style={{background:C.cream,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:11,color:C.slate,marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Ingredients — tick to verify each</div>
            {parsed.ingredients?.map((ing,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`0.5px solid ${C.cream}`}}>
                <input type="checkbox" checked={!!verified[i]} onChange={()=>setVerified(v=>({...v,[i]:!v[i]}))} style={{accentColor:C.sage,width:16,height:16}} />
                <span style={{flex:1,fontSize:13}}>{ing.qty} {ing.unit} {ing.name}</span>
                <Pill variant={ing.confidence==="high"?"ok":ing.confidence==="medium"?"warning":"critical"}>{ing.confidence}</Pill>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Btn variant="primary" disabled={!allVerified||saving} onClick={saveRecipe}>{saving?"Saving…":"✓ Save to recipe library"}</Btn>
            {!allVerified&&<span style={{fontSize:12,color:C.slate}}>Verify all ingredients to enable save</span>}
          </div>
        </div>
      )}
      {parsed?.stocktake&&(
        <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1.25rem",display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:700}}>Step 2 — Verify stock counts before applying</div>
            <Pill variant="warning">⚠ Human review required</Pill>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.slate,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Parsed stock — tick items to apply</div>
            {parsed.stocktake.map((item,i)=>{
              const match = inventory.find(inv=>inv.name.toLowerCase()===item.name.toLowerCase());
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`0.5px solid ${C.cream}`}}>
                  <input type="checkbox" checked={!!verified[i]} onChange={()=>setVerified(v=>({...v,[i]:!v[i]}))} style={{accentColor:C.sage,width:16,height:16}} />
                  <span style={{flex:1,fontSize:13,fontWeight:500}}>{item.name}{!match&&<span style={{color:C.rust,fontWeight:400}}> — no matching inventory item, will be skipped</span>}</span>
                  <span style={{fontSize:13,fontWeight:700}}>{item.qty} {item.unit}</span>
                  <Pill variant={item.confidence==="high"?"ok":item.confidence==="medium"?"warning":"critical"}>{item.confidence}</Pill>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Btn variant="primary" disabled={!allVerified||saving} onClick={applyStocktake}>{saving?"Applying…":"✓ Apply to inventory"}</Btn>
            {!allVerified&&<span style={{fontSize:12,color:C.slate}}>Tick items to apply</span>}
          </div>
        </div>
      )}
    </div>
  );
}
