import { useState, useRef } from "react";
import { C } from "./theme";
import Icon from "./icons/Icon";
import { downloadFile, uploadFile } from "./api/client";

export const Badge = ({ children, color = C.sage }) => (
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background:color+"22",color,letterSpacing:"0.03em"}}>{children}</span>
);

export const StatCard = ({ label, value, unit, delta, color = C.ink }) => (
  <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:12,padding:"1rem 1.25rem",display:"flex",flexDirection:"column",gap:4}}>
    <div style={{fontSize:12,color:C.slate,fontWeight:500}}>{label}</div>
    <div style={{fontSize:26,fontWeight:700,color,lineHeight:1,fontFamily:"'DM Serif Display',Georgia,serif"}}>
      {value}<span style={{fontSize:14,fontWeight:400,color:C.slate,marginLeft:3}}>{unit}</span>
    </div>
    {delta && <div style={{fontSize:11,color:delta.startsWith("+")?C.sage:C.rust}}>{delta} vs last week</div>}
  </div>
);

export const SectionHeader = ({ title, sub, action }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"1rem"}}>
    <div>
      <div style={{fontSize:20,fontWeight:700,fontFamily:"'DM Serif Display',Georgia,serif",color:C.ink}}>{title}</div>
      {sub && <div style={{fontSize:13,color:C.slate,marginTop:2}}>{sub}</div>}
    </div>
    {action}
  </div>
);

export const Pill = ({ children, variant = "neutral" }) => {
  const map = {neutral:{bg:C.khaki,c:C.slate},ok:{bg:C.sageXL,c:C.sage},warning:{bg:C.goldXL,c:C.gold},critical:{bg:C.rustXL,c:C.rust},info:{bg:"#E0ECFF",c:"#2563EB"},low:{bg:C.goldXL,c:C.gold}};
  const s = map[variant]||map.neutral;
  return <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.c}}>{children}</span>;
};

export const Btn = ({ children, onClick, variant = "secondary", size = "md", disabled, type }) => {
  const base = {border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:600,borderRadius:8,transition:"opacity 0.15s",opacity:disabled?0.5:1};
  const v = {
    primary:{background:C.sage,color:C.white,fontSize:size==="sm"?12:14,padding:size==="sm"?"5px 12px":"8px 18px"},
    danger:{background:C.rust,color:C.white,fontSize:size==="sm"?12:14,padding:size==="sm"?"5px 12px":"8px 18px"},
    secondary:{background:C.cream,color:C.ink,border:`0.5px solid ${C.khaki}`,fontSize:size==="sm"?12:14,padding:size==="sm"?"5px 12px":"8px 18px"},
    ghost:{background:"transparent",color:C.sage,border:`0.5px solid ${C.sage}`,fontSize:size==="sm"?12:14,padding:size==="sm"?"5px 12px":"8px 18px"},
  };
  return <button type={type || "button"} style={{...base,...v[variant]}} onClick={onClick} disabled={disabled}>{children}</button>;
};

export const Modal = ({ title, onClose, children, width = 520 }) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:C.white,borderRadius:14,padding:"1.5rem",width:"100%",maxWidth:width,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
        <div style={{fontSize:16,fontWeight:700,fontFamily:"'DM Serif Display',Georgia,serif"}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.slate,lineHeight:1,padding:"0 4px"}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

export const Field = ({ label, value, onChange, type = "text", placeholder, required, small, error }) => (
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:11,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}{required&&<span style={{color:C.rust}}> *</span>}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{border:`0.5px solid ${error?C.rust:C.khaki}`,borderRadius:8,padding:small?"5px 8px":"7px 10px",fontSize:13,fontFamily:"inherit",background:C.cream,outline:"none",width:"100%"}} />
    {error && <span style={{fontSize:11,color:C.rust}}>{error}</span>}
  </div>
);

export const Sel = ({ label, value, onChange, options, error }) => (
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:11,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{border:`0.5px solid ${error?C.rust:C.khaki}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",background:C.cream,outline:"none"}}>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
    {error && <span style={{fontSize:11,color:C.rust}}>{error}</span>}
  </div>
);

export const FGrid = ({ children, cols = 2, gap = "0.75rem" }) => (
  <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap,marginBottom:"0.75rem"}}>{children}</div>
);

// Amount + unit picker that stores/emits minutes, so a 24-hour cure doesn't
// need to be typed in as "1440". `value`/`onChange` are always in minutes —
// only the displayed amount+unit are converted, on the way in and out.
const DURATION_UNITS = [
  { value: "min", label: "min", perMin: 1 },
  { value: "hours", label: "hours", perMin: 60 },
  { value: "days", label: "days", perMin: 1440 },
];
const bestDurationUnit = mins => {
  if (mins >= 1440 && mins % 1440 === 0) return "days";
  if (mins >= 60 && mins % 60 === 0) return "hours";
  return "min";
};
export const DurationInput = ({ label, value, onChange, error }) => {
  const mins = +value || 0;
  const [unit, setUnit] = useState(bestDurationUnit(mins));
  const perMin = DURATION_UNITS.find(u => u.value === unit).perMin;
  const amount = mins / perMin;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:11,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>
      <div style={{display:"flex",gap:6}}>
        <input type="number" min="0" value={amount}
          onChange={e=>onChange(String(Math.round((+e.target.value||0) * perMin)))}
          style={{flex:1,border:`0.5px solid ${error?C.rust:C.khaki}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",background:C.cream,outline:"none",width:"100%"}} />
        <select value={unit} onChange={e=>setUnit(e.target.value)}
          style={{border:`0.5px solid ${C.khaki}`,borderRadius:8,padding:"7px 8px",fontSize:12,fontFamily:"inherit",background:C.cream,outline:"none"}}>
          {DURATION_UNITS.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </div>
      {error && <span style={{fontSize:11,color:C.rust}}>{error}</span>}
    </div>
  );
};

// Adds a mic button to any text/textarea-shaped input — tap to record, tap
// again to stop; the clip is sent to the local /voice/transcribe endpoint
// (faster-whisper, running fully offline — see app/voice.py) and the
// transcript is appended to the existing value. Previously used the
// browser's own SpeechRecognition API, which only worked in Chrome/Edge and
// was quietly a cloud call (Chrome's implementation goes through Google);
// MediaRecorder + a local model works in any browser/webview with a
// microphone, entirely on-device.
// eslint-disable-next-line react-refresh/only-export-components
export const useSpeechToText = (onResult) => {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const supported = typeof window !== "undefined"
    && typeof MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;

  const stopStream = (recorder) => {
    recorder.stream?.getTracks().forEach(track => track.stop()); // release the mic
  };

  const toggle = async () => {
    if (!supported) return;
    if (listening) {
      recorderRef.current?.stop(); // triggers onstop below, which does the rest
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return; // permission denied or no mic — same silent no-op as before
    }
    const recorder = new MediaRecorder(stream);
    recorder.stream = stream; // stashed for stopStream() above — MediaRecorder doesn't expose it itself pre-spec
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stopStream(recorder);
      setListening(false);
      setTranscribing(true);
      try {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "dictation.webm");
        const result = await uploadFile("/voice/transcribe", formData);
        if (result?.text) onResult(result.text);
      } catch {
        // Transcription failure just means dictation didn't add anything
        // this time — typing still works, no need for an intrusive error.
      } finally {
        setTranscribing(false);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setListening(true);
  };

  return { listening, transcribing, toggle, supported };
};

// Drop-in replacement for Field with a mic button — everything manually
// typed should offer this (and everything auto-calculated should NOT be
// editable at all, see Recipes/Ingredients pages for that half of the rule).
export const VoiceField = ({ label, value, onChange, type = "text", placeholder, required, small, error }) => {
  const { listening, transcribing, toggle, supported } = useSpeechToText(text => onChange((value ? value + " " : "") + text));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:11,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}{required&&<span style={{color:C.rust}}> *</span>}</label>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{flex:1,border:`0.5px solid ${error?C.rust:C.khaki}`,borderRadius:8,padding:small?"5px 8px":"7px 10px",fontSize:13,fontFamily:"inherit",background:C.cream,outline:"none",width:"100%"}} />
        {supported && (
          <button type="button" onClick={toggle} disabled={transcribing}
            title={transcribing?"Transcribing…":listening?"Recording… tap to stop":"Dictate"}
            style={{border:"none",borderRadius:8,cursor:transcribing?"default":"pointer",padding:"6px 8px",background:listening?C.rust:transcribing?C.slateL:C.khaki,color:listening||transcribing?C.white:C.slate,display:"flex",alignItems:"center",opacity:transcribing?0.7:1}}>
            <Icon name={listening?"microphone-off":"microphone"} size={14} />
          </button>
        )}
      </div>
      {error && <span style={{fontSize:11,color:C.rust}}>{error}</span>}
    </div>
  );
};

// Mic-only version of the button inside VoiceField, with no input/label/
// wrapper of its own — for dense grid/table rows (e.g. a recipe's
// ingredient or method-step lines) where VoiceField's own layout would
// break the row. Same record-transcribe-append behaviour, just composable.
export const VoiceIconButton = ({ value, onChange, title }) => {
  const { listening, transcribing, toggle, supported } = useSpeechToText(text => onChange((value ? value + " " : "") + text));
  if (!supported) return null;
  return (
    <button type="button" onClick={toggle} disabled={transcribing}
      title={transcribing?"Transcribing…":title || (listening?"Recording… tap to stop":"Dictate")}
      style={{border:"none",borderRadius:8,cursor:transcribing?"default":"pointer",padding:"6px 8px",background:listening?C.rust:transcribing?C.slateL:C.khaki,color:listening||transcribing?C.white:C.slate,display:"flex",alignItems:"center",flexShrink:0,opacity:transcribing?0.7:1}}>
      <Icon name={listening?"microphone-off":"microphone"} size={14} />
    </button>
  );
};

// Inline error banner for failed AI/API calls, with optional retry
export const AIError = ({ message, onRetry }) => (
  <div style={{background:C.rustXL,border:`0.5px solid ${C.rust}44`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.rust,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
    <span><strong>Error: </strong>{message}</span>
    {onRetry && <Btn size="sm" variant="danger" onClick={onRetry}>Retry</Btn>}
  </div>
);

// Role-gated CSV export — every /export.csv route the backend exposes can
// use this. Greys out (rather than hiding) when the current user's role
// isn't allowed, with a tooltip explaining why, so people understand it's
// a permissions thing and not a missing feature.
export const ExportButton = ({ resource, filename, userRole, allowedRoles = ["owner","manager"], label = "Export CSV" }) => {
  const allowed = allowedRoles.includes(userRole);
  const roleLabel = allowedRoles.map(r => r==="owner"?"the chef":r).join(" or ");
  if (!allowed) {
    return (
      <span title={`Only ${roleLabel} can export this`} style={{display:"inline-flex"}}>
        <Btn size="sm" disabled>{label}</Btn>
      </span>
    );
  }
  return (
    <Btn size="sm" onClick={() => downloadFile(`/${resource}/export.csv`, filename || `${resource}.csv`)}>
      {label}
    </Btn>
  );
};

// Simple client-side search box — every page with a list gets one of these
// rather than a bespoke filter input per page.
export const SearchBox = ({ value, onChange, placeholder = "Search..." }) => (
  <div style={{position:"relative",minWidth:200}}>
    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.slateL,display:"flex"}}>
      <Icon name="search" size={15} />
    </span>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:"100%",border:`0.5px solid ${C.khaki}`,borderRadius:20,padding:"7px 12px 7px 32px",fontSize:13,fontFamily:"inherit",background:C.white,outline:"none"}} />
  </div>
);
