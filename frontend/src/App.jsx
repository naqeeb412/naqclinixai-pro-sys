import { useEffect, useState } from "react";
import * as api from "./api";

const C = { bg:"#0b0d10", card:"#161a20", line:"#252b34", text:"#e8edf4", muted:"#8b95a5", accent:"#22d3a7", danger:"#f0546d" };

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (api.getToken()) api.me().then(setUser).catch(() => api.setToken("")).finally(() => setLoading(false));
    else setLoading(false);
  }, []);

  if (loading) return <div style={{...s.screen}}>Loading…</div>;
  return user ? <Dashboard user={user} onLogout={() => { api.setToken(""); setUser(null); }} /> : <AuthScreen onAuth={setUser} />;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ clinic_name:"", email:"", password:"" });
  const [err, setErr] = useState("");
  
  async function submit(e) {
    e.preventDefault(); setErr("");
    try {
      if (mode === "login") {
        const r = await api.login(f.email, f.password);
        api.setToken(r.access_token);
        onAuth(await api.me());
      } else {
        await api.register(f.clinic_name, f.email, f.password);
        const r = await api.login(f.email, f.password);
        api.setToken(r.access_token);
        onAuth(await api.me());
      }
    } catch (e) { setErr(e.message.slice(0, 120)); }
  }
  
  return (
    <div style={s.screen}>
      <form onSubmit={submit} style={s.authBox}>
        <h1 style={{ margin:"0 0 8px" }}>🦷 NAQCLINIXAI</h1>
        <p style={{ color:C.muted, margin:"0 0 24px" }}>{mode === "login" ? "Sign in to your clinic" : "Create a new clinic account"}</p>
        {mode === "register" && <input style={s.input} placeholder="Clinic name" required onChange={e => setF({...f, clinic_name: e.target.value})} />}
        <input style={s.input} type="email" placeholder="Email" required onChange={e => setF({...f, email: e.target.value})} />
        <input style={s.input} type="password" placeholder="Password" required minLength={6} onChange={e => setF({...f, password: e.target.value})} />
        {err && <div style={{ color:C.danger, marginBottom:12, fontSize:13 }}>{err}</div>}
        <button style={s.btn} type="submit">{mode === "login" ? "Sign In" : "Create Account"}</button>
        <p style={{ color:C.muted, marginTop:16, fontSize:13, textAlign:"center" }}>
          {mode === "login" ? "No account? " : "Already have one? "}
          <a style={{ color:C.accent, cursor:"pointer" }} onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Register" : "Login"}</a>
        </p>
      </form>
    </div>
  );
}

function Dashboard({ user, onLogout }) {
  const [stats, setStats] = useState(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = () => api.dashboard().then(setStats).catch(console.error);
  useEffect(refresh, []);

  async function run() {
    if (!file) return setErr("Choose an image first");
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await api.analyze(file, name)); await refresh(); }
    catch (e) { setErr(e.message.slice(0, 160)); }
    finally { setBusy(false); }
  }

  async function downloadPDF() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/report/${result.case_id}`, { headers: { Authorization: `Bearer ${token}` }});
    if (!res.ok) return alert("Report failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report_${result.case_id}.pdf`; a.click(); URL.revokeObjectURL(url);
  }

  async function emailPDF() {
    const to = prompt("Send to patient email:"); if (!to) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/report/${result.case_id}/email`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to_email: to })
    });
    alert(res.ok ? "✅ Report sent" : "❌ Email failed");
  }

  return (
    <div style={s.app}>
      <header style={s.header}>
        <div><b>🦷 NAQCLINIXAI</b></div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ color:C.muted, fontSize:13 }}>{user.email}</span>
          <button style={s.ghost} onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.grid2}>
          <section style={s.card}>
            <h3 style={s.h3}>New Case Analysis</h3>
            <input style={s.input} placeholder="Patient name" value={name} onChange={e => setName(e.target.value)} />
            <input style={s.input} type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} />
            <button style={{...s.btn, opacity: busy ? 0.6 : 1}} disabled={busy} onClick={run}>{busy ? "Analyzing…" : "🧠 Run AI Analysis"}</button>
            {err && <div style={{ color:C.danger, marginTop:12, fontSize:13 }}>{err}</div>}
            {result && (
              <div style={{ ...s.card, background:"#0f1319", marginTop:16 }}>
                <h4 style={{ margin:"0 0 8px" }}>Clinical Output</h4>
                <p>Symmetry: <b>{result.symmetry}%</b></p>
                <p>Smile Score: <b>{result.smile_score}%</b></p>
                <p>Midline Deviation: <b>{result.midline_deviation} mm</b></p>
                <p style={{ color:C.accent }}>Plan: <b>{result.recommendation}</b></p>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button style={{...s.btn, background:"#252b34", color:C.text}} onClick={downloadPDF}>📄 Download PDF</button>
                  <button style={{...s.btn, background:"#252b34", color:C.text}} onClick={emailPDF}>✉️ Email Patient</button>
                </div>
              </div>
            )}
          </section>

          <section style={s.card}>
            <h3 style={s.h3}>Recent Cases ({stats?.total_cases || 0})</h3>
            {!stats?.recent?.length && <p style={{ color:C.muted }}>No cases yet.</p>}
            {stats?.recent?.map(c => (
              <div key={c.id} style={s.row}>
                <div><div style={{ fontWeight:600 }}>{c.patient || "Unnamed"}</div><div style={{ color:C.muted, fontSize:12 }}>{new Date(c.at).toLocaleString()}</div></div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}

const s = {
  screen: { background:C.bg, color:C.text, minHeight:"100vh", display:"grid", placeItems:"center", fontFamily:"system-ui, sans-serif" },
  authBox: { background:C.card, padding:36, borderRadius:14, width:360, border:`1px solid ${C.line}` },
  input: { width:"100%", boxSizing:"border-box", padding:"11px 13px", marginBottom:12, background:"#0f1319", border:`1px solid ${C.line}`, borderRadius:8, color:C.text, fontSize:14, outline:"none" },
  btn: { width:"100%", padding:"12px", borderRadius:8, border:"none", cursor:"pointer", background:C.accent, color:"#04231a", fontWeight:700, fontSize:15 },
  ghost: { padding:"8px 14px", borderRadius:8, background:"transparent", border:`1px solid ${C.line}`, color:C.text, cursor:"pointer", fontSize:13 },
  app: { background:C.bg, color:C.text, minHeight:"100vh", fontFamily:"system-ui, sans-serif" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 24px", borderBottom:`1px solid ${C.line}` },
  main: { padding:24, maxWidth:1100, margin:"0 auto" },
  grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 },
  card: { background:C.card, border:`1px solid ${C.line}`, borderRadius:12, padding:20 },
  h3: { margin:"0 0 14px", fontSize:15, color:C.text },
  row: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.line}` },
};
