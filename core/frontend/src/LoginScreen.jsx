import { useState } from "react";
import { C } from "./theme";
import { Btn, Field } from "./ui";
import { useAuth } from "./api/authContext";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(orgName, email, password);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.cream,padding:"1rem"}}>
      <div style={{background:C.white,border:`0.5px solid ${C.khaki}`,borderRadius:14,padding:"2rem",width:"100%",maxWidth:400}}>
        <div style={{fontFamily:"'DM Serif Display',Georgia,serif",fontSize:26,color:C.ink,marginBottom:4}}>KitchenOS</div>
        <div style={{fontSize:13,color:C.slate,marginBottom:"1.5rem"}}>
          {mode === "login" ? "Sign in to your kitchen." : "Set up a new organization."}
        </div>

        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
          {mode === "register" && (
            <Field label="Organization name *" value={orgName} onChange={setOrgName} placeholder="Meridian Hotels — London" required />
          )}
          <Field label="Email *" value={email} onChange={setEmail} type="email" required />
          <Field label="Password *" value={password} onChange={setPassword} type="password" required
            placeholder={mode === "register" ? "At least 8 characters" : undefined} />

          {error && <div style={{fontSize:12,color:C.rust,background:C.rustXL,borderRadius:8,padding:"8px 12px"}}>{error}</div>}

          <Btn type="submit" variant="primary" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create organization"}
          </Btn>
        </form>

        <div style={{marginTop:"1rem",textAlign:"center",fontSize:12,color:C.slate}}>
          {mode === "login" ? (
            <>New here? <a href="#" onClick={e=>{e.preventDefault();setMode("register");setError(null);}} style={{color:C.sage,fontWeight:600}}>Create an organization</a></>
          ) : (
            <>Already have an account? <a href="#" onClick={e=>{e.preventDefault();setMode("login");setError(null);}} style={{color:C.sage,fontWeight:600}}>Sign in</a></>
          )}
        </div>
      </div>
    </div>
  );
}
