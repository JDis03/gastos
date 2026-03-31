// Gastos 70/30 — React rewrite
// Toast bug fixed via useEffect cleanup
// Clean component architecture with hooks

import React, { useState, useEffect, useRef, useCallback, useMemo, ErrorInfo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

// ── TYPES ────────────────────────────────────────────────────────────────────
interface Entry {
  id: number;
  date: string;
  desc: string;
  amt: number;
  note?: string;
  tag?: string;
  fromRecurring?: boolean;
}

interface Income {
  id: number;
  date: string;
  desc: string;
  amt: number;
  source: IncomeSource;
}

type IncomeSource = "sueldo"|"trading"|"freelance"|"venta"|"otro";

const INCOME_SOURCES: Record<IncomeSource,{label:string;icon:string;color:string}> = {
  sueldo:   { label:"Sueldo",   icon:"💼", color:"#1e4a8f" },
  trading:  { label:"Trading",  icon:"📈", color:"#e94560" },
  freelance:{ label:"Freelance",icon:"💻", color:"#2a7abf" },
  venta:    { label:"Venta",    icon:"🛍️", color:"#bf7a20" },
  otro:     { label:"Otro",     icon:"💰", color:"#2ecc71" },
};

type CatKey = "renta"|"comida"|"transporte"|"servicios"|"emergencias"|"trading"|"inversion";
type Entries = Record<CatKey, Entry[]>;

interface Month {
  income: number;      // referencia/fallback para datos antiguos
  incomes: Income[];   // ingresos reales del mes
  entries: Entries;
  savedAt: string | null;
  customPct?: Record<string, number>;
}

interface Recurring {
  id: number;
  desc: string;
  amt: number;
  cat: CatKey;
  type: "monthly"|"weekly";
  day: number;
  active: boolean;
}

interface Goal {
  id: number;
  name: string;
  emoji: string;
  target: number;
  saved: number;
  done: boolean;
}

interface DbxState {
  ref: string | null;
  ak: string | null;
  em: string | null;
  at: string | null;
  exp: number;
  ready: boolean;
}

interface ToastState {
  msg: string;
  type: "ok"|"err"|"info";
  id: number;
}

interface CloudData {
  months: number;
  total: number;
}

// ══════════════════════════════════════════════
//  ERROR BOUNDARY — captura errores JS en producción
// ══════════════════════════════════════════════
interface EBState { error: Error|null }
class ErrorBoundary extends React.Component<{children:React.ReactNode},EBState> {
  constructor(props: {children:React.ReactNode}){ super(props); this.state={error:null}; }
  static getDerivedStateFromError(e: Error): EBState { return {error:e}; }
  componentDidCatch(e: Error, info: ErrorInfo){ console.error("App error:",e,info); }
  render(){
    if(this.state.error) return (
      <div style={{height:"100dvh",background:"#0a0a0a",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:16,fontFamily:"system-ui"}}>
        <div style={{fontSize:48}}>⚠️</div>
        <div style={{fontSize:18,fontWeight:700}}>Algo salió mal</div>
        <div style={{fontSize:12,color:"#666",textAlign:"center",maxWidth:280}}>{this.state.error?.message}</div>
        <button onClick={()=>window.location.reload()} style={{background:"#e94560",border:"none",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:700,color:"#fff",cursor:"pointer",marginTop:8}}>
          Recargar app
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ══════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════
interface CatDef {
  pct: number; label: string; icon: string; ph: string;
  color: string; group: "ess"|"lib"; allowNegative?: boolean;
}
const CATS: Record<CatKey, CatDef> = {
  renta:       { pct:.35, label:"Renta",       icon:"🏠", ph:"Alquiler, Luz, Gas…",       color:"#1e4a8f", group:"ess" },
  comida:      { pct:.15, label:"Comida",       icon:"🛒", ph:"Leche, Pollo, Mercado…",    color:"#2a7abf", group:"ess" },
  transporte:  { pct:.10, label:"Transporte",   icon:"🚌", ph:"Bus, Gasolina, Uber…",      color:"#1a5a9f", group:"ess" },
  servicios:   { pct:.10, label:"Servicios",    icon:"💡", ph:"Celular, Ropa, Farmacia…",  color:"#0a3a7f", group:"ess" },
  emergencias: { pct:.10, label:"Emergencias",  icon:"🛡️", ph:"Ahorro, Médico…",           color:"#8f1a30", group:"lib" },
  trading:     { pct:.15, label:"Trading",      icon:"📈", ph:"Depósito (+) / Pérdida (-)…", color:"#e94560", group:"lib", allowNegative:true },
  inversion:   { pct:.05, label:"Inversión / Extras", icon:"🌱", ph:"ETF, Cripto (+) / Freelance, Ventas (−)…", color:"#bf3550", group:"lib", allowNegative:true },
};
const CK   = Object.keys(CATS);
const ESS  = CK.filter(c => CATS[c as CatKey].group === "ess");
const LIB  = CK.filter(c => CATS[c as CatKey].group === "lib");
const PAL  = CK.map(c => CATS[c as CatKey].color);
const MOS  = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const LS   = { REF:"dbx_ref_v8", AC:"dbx_ac_v8", AK:"dbx_ak_v8", EM:"dbx_em_v8", MONTHS:"months_v8", AS:"autosave_v8", REC:"recurring_v8", ALRT:"alert_pct_v8", GOALS:"goals_v8" };

const T = {
  bg:"#0a0a0a", bg2:"#111", bg3:"#161616", bg4:"#1a1a1a",
  b:"#1e1e1e",  b2:"#242424",
  red:"#e94560", blue:"#4a90d9", green:"#2ecc71", yellow:"#f5a623",
  t:"#fff", t2:"#888", t3:"#444", t4:"#2a2a2a"
};

// ── TAGS ─────────────────────────────────────────────────────────────────────
interface TagDef { label:string; emoji:string; color:string; text:string; }
type TagKey = "necesario"|"lujo"|"urgente"|"hormiga"|"ocio";
const TAGS: Record<TagKey, TagDef> = {
  necesario: { label:"Necesario", emoji:"✅", color:"#1a5a2a", text:"#2ecc71" },
  lujo:      { label:"Lujo",      emoji:"💎", color:"#1a1a5a", text:"#4a90d9" },
  urgente:   { label:"Urgente",   emoji:"🚨", color:"#5a1020", text:"#e94560" },
  hormiga:   { label:"Hormiga",   emoji:"🐜", color:"#3a2800", text:"#f5a623" },
  ocio:      { label:"Ocio",      emoji:"🎮", color:"#2a1a5a", text:"#9b59b6" },
};
const TK = Object.keys(TAGS);

// ── Dropbox App Key (embebido — PKCE sin secret es seguro) ──────────────────
const DBX_APP_KEY = "cbyqd1d666g19bf";

// ── Helpers ──────────────────────────────────
const fmt   = v => "$" + Math.abs(v).toFixed(2);
const fmts  = v => "$" + v.toFixed(2);
const today = () => new Date().toISOString().split("T")[0];
const curKey= () => new Date().toISOString().slice(0,7);
const monName = (k: string): string => { if(!k) return ""; const [y,m]=k.split("-"); const s=new Date(+y,+m-1,1).toLocaleString("es",{month:"long",year:"numeric"}); return s.charAt(0).toUpperCase()+s.slice(1); };
const monShort= k => { if(!k) return ""; const [,m]=k.split("-"); return MOS[+m-1]; };
const fmtDate = iso => { const d=new Date(iso+"T00:00:00"); return {day:d.getDate(),mon:d.toLocaleString("es",{month:"short"}).replace(".","")}; };
const emptyEntries = () => { const e={}; CK.forEach(c=>e[c]=[]); return e; };
// Ingreso real del mes: suma de income entries si existen, fallback a m.income para datos viejos
const totalIncomeMonth = m => (m.incomes&&m.incomes.length>0) ? m.incomes.reduce((s,i)=>s+i.amt,0) : m.income;
// Solo suma egresos positivos — para calcular disponible mensual
const totalSpentMonth = m => CK.reduce((s,c)=>(m.entries[c as CatKey]||[]).reduce((x,e)=>x+(e.amt>0?e.amt:0),0)+s,0);
// P&L neto de trading (puede ser negativo)
const tradingNetMonth = m => (m.entries.trading||[]).reduce((s,e)=>s+e.amt,0);
// Obtiene el % efectivo de una categoría (custom del mes o default global)
const getCatPct = (month, cat) => (month?.customPct?.[cat] ?? CATS[cat as CatKey].pct);
// Presupuesto efectivo de una categoría — usa ingreso real
const getCatBudget = (month, cat) => totalIncomeMonth(month) * getCatPct(month, cat);

// ── Local storage ─────────────────────────────
const saveLocal  = m => { try{ localStorage.setItem(LS.MONTHS, JSON.stringify(m)); }catch{} };
const loadLocal  = (): Record<string,Month> => { try{ const r=localStorage.getItem(LS.MONTHS); return r?JSON.parse(r):{} }catch{ return {} } };

// ══════════════════════════════════════════════
//  DROPBOX OAuth PKCE
// ══════════════════════════════════════════════
async function genVerifier(){const a=new Uint8Array(48);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/[+/=]/g,c=>({"+":"-","/":"_","=":""})[c]||"");}
async function genChallenge(v){const d=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",d);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/[+/=]/g,c=>({"+":"-","/":"_","=":""})[c]||"");}

// ══════════════════════════════════════════════
//  CUSTOM HOOKS
// ══════════════════════════════════════════════

// ── useToast — fixes the floating notification bug ──
function useToast() {
  const [toast, setToast] = useState<ToastState>({ msg:"", type:"ok", id:0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);

  // KEY FIX: useEffect with cleanup clears previous timer before setting new one
  useEffect(() => {
    if (!toast.msg) return;
    if(timerRef.current) clearTimeout(timerRef.current);                     // cancel previous
    timerRef.current = setTimeout(() => {
      setToast(t => ({...t, msg:""}));                  // auto-dismiss
    }, 3000);
    return () => { if(timerRef.current) clearTimeout(timerRef.current); };   // cleanup on unmount
  }, [toast.id]);                                       // re-run on new toast (by id)

  const show = useCallback((msg: string, type: "ok"|"err"|"info" = "ok") => {
    setToast({ msg, type, id: Date.now() });            // new id = new effect
  }, []);

  const dismiss = useCallback(() => {
    if(timerRef.current) clearTimeout(timerRef.current);
    setToast(t => ({...t, msg:""}));
  }, []);

  return { toast, show, dismiss };
}

// ── useDropbox ─────────────────────────────────
function useDropbox(showToast: (msg:string, type:"ok"|"err"|"info")=>void) {
  const [dbx, setDbx] = useState<DbxState>(() => {
    const ref = localStorage.getItem(LS.REF);
    const ak  = localStorage.getItem(LS.AK);
    const em  = localStorage.getItem(LS.EM)||"Conectado";
    let at=null, exp=0;
    try{ const ac=JSON.parse(localStorage.getItem(LS.AC)||"null"); if(ac){at=ac.t;exp=ac.e;} }catch{}
    return { ref, ak, em, at, exp, ready:false };
  });

  const getToken = useCallback(async (state=dbx) => {
    if (state.at && Date.now() < state.exp - 60000) return state.at;
    if (!state.ref || !state.ak) throw new Error("No refresh token");
    const r = await fetch("https://api.dropbox.com/oauth2/token",{
      method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({grant_type:"refresh_token",refresh_token:state.ref,client_id:state.ak})
    });
    const d = await r.json();
    if (!r.ok||!d.access_token) throw new Error(d.error_description||r.status);
    const newAt = d.access_token, newExp = Date.now()+(d.expires_in||14400)*1000;
    localStorage.setItem(LS.AC, JSON.stringify({t:newAt,e:newExp}));
    setDbx(s => ({...s, at:newAt, exp:newExp}));
    return newAt;
  }, [dbx]);

  // Genera URL de autorización SIN redirect_uri — App Key embebido
  const startOAuth = useCallback(async () => {
    const ver=await genVerifier(), chal=await genChallenge(ver);
    sessionStorage.setItem("dbx_v",ver); sessionStorage.setItem("dbx_k",DBX_APP_KEY);
    const url = `https://www.dropbox.com/oauth2/authorize?client_id=${DBX_APP_KEY}&response_type=code&code_challenge=${chal}&code_challenge_method=S256&token_access_type=offline`;
    window.open(url,"_blank");
  }, []);

  // Intercambia el código manual por tokens permanentes
  const exchangeCode = useCallback(async (code: string): Promise<boolean> => {
    const ver = sessionStorage.getItem("dbx_v");
    const ak  = sessionStorage.getItem("dbx_k") || DBX_APP_KEY;
    if (!ver||!ak) { showToast("Primero toca 'Autorizar' para generar el código","err"); return false; }
    if (!code.trim()) { showToast("Ingresa el código de Dropbox","err"); return false; }
    try{
      // SIN redirect_uri en el intercambio (debe coincidir con la autorización)
      const r = await fetch("https://api.dropbox.com/oauth2/token",{
        method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body: new URLSearchParams({code:code.trim(),grant_type:"authorization_code",client_id:ak,code_verifier:ver})
      });
      const d = await r.json();
      if (!r.ok||!d.access_token) { showToast("Error: "+(d.error_description||r.status),"err"); return false; }
      localStorage.setItem(LS.REF,d.refresh_token);
      localStorage.setItem(LS.AK,ak);
      localStorage.setItem(LS.AC,JSON.stringify({t:d.access_token,e:Date.now()+(d.expires_in||14400)*1000}));
      sessionStorage.removeItem("dbx_v"); sessionStorage.removeItem("dbx_k");
      // Info del usuario
      const ur = await fetch("https://api.dropboxapi.com/2/users/get_current_account",{method:"POST",headers:{"Authorization":"Bearer "+d.access_token,"Content-Type":"application/json"},body:"null"});
      const em = ur.ok ? ((await ur.json()).email||"Conectado") : "Conectado";
      localStorage.setItem(LS.EM, em);
      setDbx({ref:d.refresh_token,ak,em,at:d.access_token,exp:Date.now()+(d.expires_in||14400)*1000,ready:true});
      showToast("☁️ Dropbox conectado — funciona en cualquier dominio","ok");
      return true;
    }catch(e){ showToast("Error de red","err"); return false; }
  }, [showToast]);

  // handleCallback ya no se necesita — mantenemos por compatibilidad
  const handleCallback = useCallback(async () => false, []);

  const disconnect = useCallback(() => {
    [LS.REF,LS.AC,LS.AK,LS.EM].forEach(k=>localStorage.removeItem(k));
    setDbx({ref:null,ak:null,em:null,at:null,exp:0,ready:false});
    showToast("Dropbox desconectado","ok");
  }, [showToast]);

  const connected = !!dbx.ref;
  return { dbx, getToken, startOAuth, exchangeCode, disconnect, connected };
}

// ══════════════════════════════════════════════
//  COMPONENTS
// ══════════════════════════════════════════════

// ── Toast ─────────────────────────────────────
function Toast({ toast, dismiss }: { toast:ToastState; dismiss:()=>void }) {
  if (!toast.msg) return null;
  const bg  = toast.type==="err" ? "#2a0d14" : toast.type==="info" ? "#0d1e33" : "#0d2210";
  const bdr = toast.type==="err" ? "rgba(233,69,96,.3)" : toast.type==="info" ? "rgba(74,144,217,.3)" : "rgba(46,204,113,.3)";
  const col = toast.type==="err" ? T.red : toast.type==="info" ? T.blue : T.green;
  return (
    <div onClick={dismiss} style={{
      position:"fixed", bottom:"calc(72px + env(safe-area-inset-bottom,0px))",
      left:"50%", transform:"translateX(-50%)",
      background:bg, border:`1px solid ${bdr}`, color:col,
      borderRadius:50, padding:"9px 20px", fontSize:12, fontWeight:600,
      zIndex:999, whiteSpace:"nowrap", cursor:"pointer",
      maxWidth:"90vw", textAlign:"center", userSelect:"none",
      animation:"toastIn .3s cubic-bezier(.4,0,.2,1)",
      boxShadow:"0 4px 20px rgba(0,0,0,.4)"
    }}>{toast.msg}</div>
  );
}

// ── BottomNav ─────────────────────────────────
function BottomNav({ screen, onNav, onAdd, hasMonth }: { screen:string; onNav:(id:string)=>void; onAdd:()=>void; hasMonth:boolean }) {

  const NAV = [
    { id:"month",    icon:"☰",   svg:null, label:"Gastos"  },
    { id:"settings", icon:"◎",   svg:null, label:"Ajustes" },
  ];

  const isMain = ["home","month","settings"].includes(screen);
  if(!isMain) return null;

  const ICON_COMPONENTS = {
    month: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={(active?T.red:T.t3) as string} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    settings: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={(active?T.red:T.t3) as string} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  };

  return (
    <div style={{
      position:"relative", flexShrink:0,
      background:"#0d0d0d",
      borderTop:"1px solid rgba(255,255,255,.06)",
      paddingBottom:"env(safe-area-inset-bottom,0px)",
      zIndex:40,
    }}>
      {/* FAB — absolutamente centrado, sobresale por encima */}
      <button onClick={onAdd} style={{
        position:"absolute",
        top:-28,
        left:"50%",
        transform:"translateX(-50%)",
        width:58, height:58, borderRadius:"50%",
        background:"linear-gradient(135deg,#e94560,#c23050)",
        border:"3px solid #0d0d0d",
        color:"#fff",
        cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"0 4px 24px rgba(233,69,96,.5), 0 2px 8px rgba(0,0,0,.4)",
        zIndex:50,
        transition:"transform .15s",
      }}
      onTouchStart={e=>e.currentTarget.style.transform="translateX(-50%) scale(.92)"}
      onTouchEnd={e=>e.currentTarget.style.transform="translateX(-50%) scale(1)"}
      >
        <span style={{fontSize:28, fontWeight:200, lineHeight:1}}>+</span>
      </button>

      {/* Nav items — 3 botones con hueco central */}
      <div style={{display:"flex", alignItems:"flex-end"}}>
        {NAV.map((item, idx)=>{
          const active = screen===item.id;
          // Hueco central para el FAB
          const isLeft  = idx < Math.floor(NAV.length/2);
          const isRight = idx >= Math.ceil(NAV.length/2);

          const handlePress = () => {
            if(item.id==="month" && !hasMonth){ onNav("home"); return; }
            onNav(item.id);
          };

          return (
            <React.Fragment key={item.id}>
              {/* Spacer central para dejar hueco al FAB */}
              {idx === 1 && (
                <div style={{flex:1, height:54}}/>
              )}
              <button onClick={handlePress} style={{
                flex:1, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                gap:3, padding:"10px 0 10px",
                background:"none", border:"none", cursor:"pointer",
                position:"relative",
              }}>
                {active && (
                  <div style={{
                    position:"absolute", top:0, left:"25%", right:"25%",
                    height:2, borderRadius:"0 0 3px 3px",
                    background:T.red,
                  }}/>
                )}
                <div style={{opacity:active?1:.6, transition:"opacity .2s"}}>
                  {(ICON_COMPONENTS as Record<string,(a:boolean)=>React.ReactNode>)[item.id]?.(active)}
                </div>
                <span style={{
                  fontSize:9, letterSpacing:.5, fontWeight:active?700:400,
                  color:active?T.red:T.t3,
                  transition:"color .2s",
                }}>{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── TopBar ────────────────────────────────────
function TopBar({ title, onBack, right }: { title:string; onBack?:()=>void; right?:React.ReactNode }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10,
      padding:"calc(12px + env(safe-area-inset-top,0px)) 14px 12px",
      background:T.bg2, borderBottom:`1px solid ${T.b}`, flexShrink:0
    }}>
      {onBack && (
        <button onClick={onBack} style={{background:"none",border:"none",color:T.t2,fontSize:22,cursor:"pointer",padding:"2px 8px 2px 0",lineHeight:1}}>‹</button>
      )}
      <div style={{fontSize:15,fontWeight:700,flex:1}}>{title}</div>
      {right && <div style={{display:"flex",gap:6,alignItems:"center"}}>{right}</div>}
    </div>
  );
}

// ── IconBtn ───────────────────────────────────
function IconBtn({ children, onClick, title }: { children:React.ReactNode; onClick:()=>void; title?:string }) {
  return (
    <button onClick={onClick} title={title} style={{background:"none",border:"none",color:T.t2,fontSize:17,cursor:"pointer",padding:5,lineHeight:1,borderRadius:8}}>
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────
function Card({ children, style }: { children:React.ReactNode; style?:React.CSSProperties }) {
  return <div style={{background:T.bg2,borderRadius:16,padding:16,marginBottom:12,border:`1px solid ${T.b}`,...style}}>{children}</div>;
}

// ── SaveBar ───────────────────────────────────
function SaveBar({ dirty, saving, onCloud, onLocal }: { dirty:boolean; saving:boolean; onCloud:()=>void; onLocal:()=>void }) {
  if (!dirty && !saving) return null;
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",background:"rgba(245,166,35,.08)",borderBottom:"1px solid rgba(245,166,35,.2)",flexShrink:0}}>
      <span style={{fontSize:11,color:T.yellow,display:"flex",alignItems:"center",gap:6}}>
        {saving && <span style={{display:"inline-block",width:10,height:10,border:`2px solid rgba(245,166,35,.3)`,borderTopColor:T.yellow,borderRadius:"50%",animation:"spin .6s linear infinite"}}/>}
        {saving ? "Guardando…" : "Cambios sin guardar"}
      </span>
      <div style={{display:"flex",gap:7}}>
        <button onClick={onCloud} style={{background:"#0d1e33",color:T.blue,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>☁️ Nube</button>
        <button onClick={onLocal} style={{background:"rgba(245,166,35,.15)",color:T.yellow,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>💾 Local</button>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────
function Modal({ open, onClose, title, subtitle, children }: { open:boolean; onClose:()=>void; title?:string; subtitle?:string; children:React.ReactNode }) {
  if (!open) return null;
  return (
    <div onClick={e=>{if(e.target===e.currentTarget) onClose();}} style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:100,
      display:"flex",alignItems:"flex-end",
      animation:"fadeIn .25s ease"
    }}>
      <div style={{
        width:"100%",background:T.bg2,borderRadius:"22px 22px 0 0",
        padding:`20px 18px calc(20px + env(safe-area-inset-bottom,0px))`,
        maxHeight:"92vh",overflowY:"auto",
        animation:"slideUp .3s cubic-bezier(.4,0,.2,1)"
      }}>
        <div style={{width:36,height:4,background:T.b2,borderRadius:4,margin:"0 auto 16px"}}/>
        {title && <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>{title}</div>}
        {subtitle && <div style={{fontSize:12,color:T.t3,marginBottom:16,lineHeight:1.6}}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

// ── QuickAdd Modal ────────────────────────────
function QuickAddModal({ open, onClose, onAdd, monthLabel }: { open:boolean; onClose:()=>void; onAdd:(e:Omit<Entry,'id'>& {cat:CatKey})=>void; monthLabel:string }) {
  const [desc,  setDesc]  = useState("");
  const [amt,   setAmt]   = useState("");
  const [date,  setDate]  = useState(today());
  const [cat,   setCat]   = useState("comida");
  const [note,  setNote]  = useState("");
  const [tag,   setTag]   = useState("");
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if(open){ setDesc(""); setAmt(""); setDate(today()); setNote(""); setTag(""); setTimeout(()=>descRef.current?.focus(),400); } }, [open]);

  const confirm = () => {
    if (!desc.trim()) { descRef.current?.focus(); return; }
    if (!parseFloat(amt)||parseFloat(amt)<=0) return;
    onAdd({ cat: cat as CatKey, desc:desc.trim(), amt:parseFloat(amt), date, note:note.trim(), tag });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Agregar gasto rápido" subtitle={`→ ${monthLabel}`}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:6}}>Descripción</div>
        <input ref={descRef} value={desc} onChange={e=>setDesc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&confirm()}
          placeholder="ej: Arroz, Uber, Electricidad…"
          style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:T.t,outline:"none"}}/>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:6}}>Monto</div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16,fontWeight:700,color:T.red}}>$</span>
            <input value={amt} onChange={e=>setAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&confirm()}
              type="number" placeholder="0.00" inputMode="decimal"
              style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:12,padding:"12px 14px 12px 32px",fontSize:20,fontWeight:800,color:T.t,outline:"none"}}/>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:6}}>Fecha</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:12,padding:"12px 10px",fontSize:12,color:T.t2,outline:"none",colorScheme:"dark"}}/>
        </div>
      </div>
      <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:8}}>Categoría</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:16}}>
        {CK.map(c => (
          <div key={c} onClick={()=>setCat(c)} style={{
            background:cat===c?"#1a0a0a":T.bg3,
            border:`1px solid ${cat===c?T.red:T.b2}`,
            borderRadius:12,padding:"10px 4px",textAlign:"center",cursor:"pointer",
            transition:"all .15s"
          }}>
            <div style={{fontSize:20}}>{CATS[c as CatKey].icon}</div>
            <div style={{fontSize:9,color:cat===c?T.red:T.t3,marginTop:3,letterSpacing:.5}}>{CATS[c as CatKey].label}</div>
          </div>
        ))}
      </div>
      <button onClick={confirm} style={{width:"100%",background:T.red,border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:700,color:"#fff",cursor:"pointer"}}>
        Agregar → {CATS[cat as CatKey].icon}
      </button>
    </Modal>
  );
}

// ── FlexBudgetModal ──────────────────────────
function FlexBudgetModal({ open, onClose, month, monthKey, onUpdate, showToast }: { open:boolean; onClose:()=>void; month:Month|undefined; monthKey:string; onUpdate:(key:string,fn:(m:Month)=>Month)=>void; showToast:(m:string,t:'ok'|'err'|'info')=>void }) {
  const current = month?.customPct || {};
  const [pcts, setPcts] = useState({});

  useEffect(()=>{
    if(open){
      const init = {};
      CK.forEach(c=> init[c] = Math.round((current[c]??CATS[c as CatKey].pct)*100));
      setPcts(init);
    }
  },[open]);

  const total = Object.values(pcts).reduce((s,v)=>s+(v||0),0);
  const remaining = 100 - total;
  const isValid = Math.abs(remaining) < 0.5;

  const adjust = (cat, delta) => {
    setPcts(p=>{
      const next = Math.max(0, Math.min(50, (p[cat]||0)+delta));
      return {...p,[cat]:next};
    });
  };

  const reset = () => {
    const init={};
    CK.forEach(c=>init[c]=Math.round(CATS[c as CatKey].pct*100));
    setPcts(init);
  };

  const save = () => {
    if(!isValid){ showToast(`Ajusta ${remaining>0?"−":"+"} ${Math.abs(remaining)}% para completar el 100%`,"err"); return; }
    const customPct = {};
    CK.forEach(c=> customPct[c] = pcts[c]/100);
    onUpdate(monthKey, m=>({...m, customPct}));
    showToast("✓ Presupuesto flexible guardado","ok");
    onClose();
  };

  const clearCustom = () => {
    onUpdate(monthKey, m=>{ const nm={...m}; delete nm.customPct; return nm; });
    showToast("Presupuesto reseteado a valores default","ok");
    onClose();
  };

  if(!open||!month) return null;
  const income = totalIncomeMonth(month);

  return (
    <div onClick={e=>{if(e.target===e.currentTarget) onClose();}} style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:200,
      display:"flex",alignItems:"flex-end",animation:"fadeIn .25s ease"
    }}>
      <div style={{
        width:"100%",background:T.bg2,borderRadius:"22px 22px 0 0",
        padding:`20px 18px calc(24px + env(safe-area-inset-bottom,0px))`,
        maxHeight:"92vh",overflowY:"auto",animation:"slideUp .3s cubic-bezier(.4,0,.2,1)"
      }}>
        <div style={{width:36,height:4,background:T.b2,borderRadius:4,margin:"0 auto 16px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div>
            <div style={{fontSize:17,fontWeight:800}}>Presupuesto flexible</div>
            <div style={{fontSize:12,color:T.t3,marginTop:3}}>Solo para {monName(monthKey)}</div>
          </div>
          <button onClick={reset} style={{background:"rgba(245,166,35,.1)",border:"1px solid rgba(245,166,35,.2)",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.yellow,cursor:"pointer"}}>
            Reset default
          </button>
        </div>

        {/* Total indicator */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          background:isValid?"rgba(46,204,113,.08)":remaining>0?"rgba(74,144,217,.08)":"rgba(233,69,96,.08)",
          border:`1px solid ${isValid?"rgba(46,204,113,.25)":remaining>0?"rgba(74,144,217,.25)":"rgba(233,69,96,.25)"}`,
          borderRadius:12,padding:"10px 14px",marginBottom:16
        }}>
          <div style={{fontSize:12,color:T.t2}}>
            {isValid?"✅ Total correcto":remaining>0?`⬆️ Falta asignar ${remaining}%`:`⬇️ Excedido en ${Math.abs(remaining)}%`}
          </div>
          <div style={{fontSize:20,fontWeight:900,color:isValid?T.green:remaining>0?T.blue:T.red}}>
            {total}%
          </div>
        </div>

        {/* Category sliders */}
        {["ess","lib"].map(group=>(
          <div key={group}>
            <div style={{fontSize:9,letterSpacing:3,color:group==="ess"?T.blue:T.red,textTransform:"uppercase",margin:"12px 0 8px",fontWeight:700}}>
              {group==="ess"?"● Esenciales (70%)":"● Libertad (30%)"}
            </div>
            {CK.filter(c=>CATS[c as CatKey].group===group).map(c=>{
              const def = Math.round(CATS[c as CatKey].pct*100);
              const cur = pcts[c]||0;
              const diff = cur - def;
              const budget = income*(cur/100);
              return (
                <div key={c} style={{background:T.bg3,borderRadius:14,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{fontSize:20,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg4,borderRadius:10,flexShrink:0}}>{CATS[c as CatKey].icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:13,fontWeight:600}}>{CATS[c as CatKey].label}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {diff!==0&&<span style={{fontSize:10,fontWeight:700,color:diff>0?T.green:T.red}}>{diff>0?"+":""}{diff}%</span>}
                          <span style={{fontSize:15,fontWeight:900,color:diff!==0?T.yellow:T.t}}>{cur}%</span>
                        </div>
                      </div>
                      <div style={{fontSize:10,color:T.t3,marginTop:2}}>
                        Default: {def}% · Presup: <span style={{color:diff!==0?T.yellow:T.t3}}>{fmts(budget)}</span>
                      </div>
                    </div>
                  </div>
                  {/* +/- controls */}
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {[-5,-1].map(d=>(
                      <button key={d} onClick={()=>adjust(c,d)}
                        style={{background:T.bg4,border:`1px solid ${T.b2}`,borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:700,color:T.t2,cursor:"pointer",flex:1}}>
                        {d}%
                      </button>
                    ))}
                    {/* Progress bar */}
                    <div style={{flex:3,height:6,background:T.bg4,borderRadius:6,overflow:"hidden",margin:"0 4px"}}>
                      <div style={{height:"100%",borderRadius:6,width:`${Math.min(cur/50*100,100)}%`,
                        background:diff>0?"linear-gradient(90deg,#1a5a2a,#2ecc71)":diff<0?"linear-gradient(90deg,#5a1020,#e94560)":"linear-gradient(90deg,#1e3a5f,#4a90d9)",
                        transition:"width .3s ease"}}/>
                    </div>
                    {[1,5].map(d=>(
                      <button key={d} onClick={()=>adjust(c,d)}
                        style={{background:T.bg4,border:`1px solid ${T.b2}`,borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:700,color:T.t2,cursor:"pointer",flex:1}}>
                        +{d}%
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Actions */}
        <button onClick={save} disabled={!isValid}
          style={{width:"100%",background:isValid?T.green:"rgba(42,42,42,.5)",border:"none",borderRadius:14,padding:14,fontSize:14,fontWeight:700,color:isValid?"#000":T.t3,cursor:isValid?"pointer":"default",marginTop:8,marginBottom:8,transition:"all .2s"}}>
          {isValid?"✓ Guardar presupuesto":"Ajusta para que sume 100%"}
        </button>
        {month?.customPct&&(
          <button onClick={clearCustom}
            style={{width:"100%",background:"none",border:`1px solid rgba(233,69,96,.3)`,borderRadius:14,padding:11,fontSize:12,color:T.red,cursor:"pointer"}}>
            Eliminar personalización
          </button>
        )}
      </div>
    </div>
  );
}

// ── NewMonthModal ─────────────────────────────
function NewMonthModal({ open, onClose, onConfirm }: { open:boolean; onClose:()=>void; onConfirm:(key:string)=>void }) {
  const now = new Date();
  const opts = Array.from({length:4},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-1+i,1);return d.toISOString().slice(0,7);});
  const [selKey, setSelKey] = useState(curKey());

  useEffect(() => { if(open){ setSelKey(curKey()); } }, [open]);

  const confirm = () => { onConfirm(selKey); onClose(); };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo mes" subtitle="Selecciona el período — agrega ingresos dentro del mes.">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {opts.map(k => (
          <div key={k} onClick={()=>setSelKey(k)} style={{
            background:selKey===k?"#0d1e33":T.bg3,
            border:`1px solid ${selKey===k?T.blue:T.b2}`,
            borderRadius:10,padding:10,textAlign:"center",cursor:"pointer",
            fontSize:13,color:selKey===k?T.t:T.t2,textTransform:"capitalize",
            transition:"all .2s"
          }}>{monName(k)}</div>
        ))}
      </div>
      <button onClick={confirm} style={{width:"100%",background:T.red,border:"none",borderRadius:13,padding:15,fontSize:14,fontWeight:700,color:"#fff",cursor:"pointer",letterSpacing:2,textTransform:"uppercase"}}>
        Crear mes →
      </button>
      <button onClick={onClose} style={{width:"100%",background:"none",border:"none",padding:12,fontSize:13,color:T.t3,cursor:"pointer",marginTop:6}}>Cancelar</button>
    </Modal>
  );
}

// ── Entry Item (editable) ─────────────────────
// ── TagBadge ──────────────────────────────────
function TagBadge({ tag, small=false }: { tag:string; small?:boolean }) {
  const t = TAGS[tag as TagKey]; if(!t) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3,
      background:t.color,color:t.text,borderRadius:20,
      padding:small?"1px 6px":"2px 8px",fontSize:small?9:10,fontWeight:700,
      letterSpacing:.5,flexShrink:0}}>
      {t.emoji} {t.label}
    </span>
  );
}

function EntryItem({ entry, cat, isEditing, onEdit, onSave, onCancel, onDelete }: { entry:Entry; cat:CatKey; isEditing:boolean; onEdit:(cat:CatKey,id:number)=>void; onSave:(cat:CatKey,id:number,data:Partial<Entry>)=>void; onCancel:()=>void; onDelete:(cat:CatKey,id:number)=>void }) {
  const [desc,  setDesc]  = useState(entry.desc);
  const [amt,   setAmt]   = useState(entry.amt);
  const [date,  setDate]  = useState(entry.date);
  const [note,  setNote]  = useState(entry.note||"");
  const [tag,   setTag]   = useState(entry.tag||"");
  const [showNote, setShowNote] = useState(false);
  const { day, mon } = fmtDate(entry.date);

  useEffect(() => {
    if(isEditing){
      setDesc(entry.desc); setAmt(entry.amt); setDate(entry.date);
      setNote(entry.note||""); setTag(entry.tag||"");
    }
  }, [isEditing]);

  if (isEditing) return (
    <div style={{background:"#0d1e33",border:"1px solid rgba(74,144,217,.3)",borderRadius:12,padding:12,marginBottom:6}}>
      {/* Desc + Amount */}
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <input value={desc} onChange={e=>setDesc(e.target.value)}
          style={{flex:1,background:T.bg3,border:"1px solid rgba(74,144,217,.4)",borderRadius:8,padding:"8px 10px",fontSize:13,color:T.t,outline:"none",minWidth:0}}/>
        <div style={{position:"relative",width:84,flexShrink:0}}>
          <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.t3,pointerEvents:"none"}}>$</span>
          <input value={amt} onChange={e=>setAmt(e.target.value)} type="number" inputMode="decimal"
            style={{width:"100%",background:T.bg3,border:"1px solid rgba(74,144,217,.4)",borderRadius:8,padding:"8px 6px 8px 18px",fontSize:13,fontWeight:700,color:T.t,outline:"none",textAlign:"right"}}/>
        </div>
      </div>
      {/* Note */}
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="📝 Nota opcional…"
        style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"7px 10px",fontSize:11,color:T.t2,outline:"none",marginBottom:8}}/>
      {/* Tags */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontSize:10,color:T.t3,alignSelf:"center"}}>Etiqueta:</span>
        {TK.map(k=>(
          <button key={k} onClick={()=>setTag(tag===k?"":k)} className="tag-pop"
            style={{background:tag===k?TAGS[k as TagKey].color:"rgba(42,42,42,.6)",border:`1px solid ${tag===k?TAGS[k as TagKey].text:T.b2}`,
              borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700,
              color:tag===k?TAGS[k as TagKey].text:T.t3,cursor:"pointer",transition:"all .15s"}}>
            {TAGS[k as TagKey].emoji} {TAGS[k as TagKey].label}
          </button>
        ))}
      </div>
      {/* Date + Actions */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 8px",fontSize:11,color:T.t2,outline:"none",colorScheme:"dark",flexShrink:0}}/>
        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
          <button onClick={()=>onDelete(cat,entry.id)} style={{background:"rgba(233,69,96,.12)",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.red,cursor:"pointer"}}>🗑</button>
          <button onClick={onCancel} style={{background:T.bg3,border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.t3,cursor:"pointer"}}>✕</button>
          <button onClick={()=>onSave(cat,entry.id,{desc:desc.trim(),amt:parseFloat(amt),date,note:note.trim(),tag})}
            style={{background:T.blue,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer"}}>✓ Guardar</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="entry-new" style={{marginBottom:5}}>
      <div onClick={()=>onEdit(cat,entry.id)}
        style={{display:"flex",alignItems:"center",gap:7,background:T.bg3,
          borderRadius:entry.note||entry.tag?"12px 12px 0 0":"12px",
          padding:"9px 10px",cursor:"pointer",transition:"background .15s",
          borderLeft:entry.tag?`3px solid ${TAGS[entry.tag]?.text||T.b2}`:"none"}}>
        <div style={{fontSize:10,color:T.t3,flexShrink:0,width:28,textAlign:"center",background:T.bg4,borderRadius:5,padding:3,lineHeight:1.3}}>
          {day}<b style={{display:"block",fontSize:11,color:T.t2}}>{mon}</b>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.desc}</div>
          {entry.tag && <TagBadge tag={entry.tag} small/>}
        </div>
        {(()=>{
          const isExtraIncome = cat==="inversion" && entry.amt<0;
          return (
            <div style={{fontSize:13,fontWeight:800,flexShrink:0,color:isExtraIncome?T.green:entry.amt<0?T.red:T.t}}>
              {isExtraIncome ? "💰 +" : entry.amt<0 ? "−" : ""}{fmt(Math.abs(entry.amt))}
            </div>
          );
        })()}
        <span style={{fontSize:10,color:T.t3,flexShrink:0}}>✎</span>
      </div>
      {/* Note bubble */}
      {entry.note && (
        <div style={{background:"#0d1a0d",borderRadius:"0 0 12px 12px",padding:"5px 12px 7px 46px",
          fontSize:10,color:"#4a8a4a",lineHeight:1.5,borderTop:`1px solid ${T.b}`}}>
          📝 {entry.note}
        </div>
      )}
    </div>
  );
}

// ── CategoryCard ──────────────────────────────
function CategoryCard({ catKey, entries, income, editingEntry, onEdit, onSave, onCancel, onDelete, onAdd, alertPct=80, onAlert, customPct=null }: { catKey:CatKey; entries:Entry[]; income:number; editingEntry:{cat:CatKey;id:number}|null; onEdit:(cat:CatKey,id:number)=>void; onSave:(cat:CatKey,id:number,data:Partial<Entry>)=>void; onCancel:()=>void; onDelete:(cat:CatKey,id:number)=>void; onAdd:(cat:CatKey,entry:Omit<Entry,'id'>)=>void; alertPct?:number; onAlert?:(cat:CatKey,pct:number)=>void; customPct?:number|null }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amt,  setAmt]  = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [tag,  setTag]  = useState("");
  const descRef = useRef<HTMLInputElement>(null);
  const alertedRef = useRef<boolean>(false);
  const cat = CATS[catKey];

  // Para trading: mostramos el neto (depósitos - pérdidas)
  // Para la barra de progreso solo usamos depósitos positivos
  const spentPositive = entries.reduce((s,e)=>s+(e.amt>0?e.amt:0),0);
  const spentNet      = entries.reduce((s,e)=>s+e.amt,0); // neto real (puede ser negativo)
  const spent  = spentNet; // para mostrar en header
  const budget = income * (customPct ?? cat.pct);
  const pct    = budget>0 ? Math.min((spentPositive/budget)*100,100) : 0;
  const over   = spentPositive>budget;
  const nearLimit = pct >= alertPct && !over;

  // Fire alert when crossing the threshold
  useEffect(()=>{
    if(pct >= alertPct && !alertedRef.current && onAlert){
      alertedRef.current = true;
      onAlert(catKey, pct);
    }
    if(pct < alertPct - 5) alertedRef.current = false; // reset
  },[pct]);
  const barCol = catKey==="renta"||catKey==="comida"||catKey==="transporte"||catKey==="servicios"
    ? `linear-gradient(90deg,#1e3a5f,${T.blue})`
    : `linear-gradient(90deg,#5a1020,${T.red})`;

  const allowNeg = CATS[catKey]?.allowNegative;
  const add = () => {
    const parsed = parseFloat(amt);
    if (!desc.trim()||!parsed||(parsed<=0&&!allowNeg)||(allowNeg&&parsed===0)) return;
    onAdd(catKey,{desc:desc.trim(),amt:parsed,date,note:note.trim(),tag});
    setDesc(""); setAmt(""); setNote(""); setTag(""); descRef.current?.focus();
  };

  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));

  return (
    <div style={{background:T.bg2,borderRadius:14,marginBottom:8,overflow:"hidden",border:`1px solid ${over&&spent>0?'rgba(233,69,96,.35)':spent>0?'rgba(46,204,113,.2)':T.b}`,transition:"border-color .3s"}}>
      {/* Header */}
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 13px",cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:19,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg4,borderRadius:10,flexShrink:0}}>{cat.icon}</div>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>{cat.label}</div>
            <div style={{fontSize:10,color:T.t3,marginTop:1}}>
              Presup: <span style={{color:customPct!==null?T.yellow:T.t3}}>{fmts(budget)}</span>
              {customPct!==null&&<span style={{color:T.yellow,marginLeft:3}}>({(customPct*100).toFixed(0)}%✎)</span>}
              {" "}· {entries.length} gasto{entries.length!==1?"s":""}
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
          <div style={{fontSize:15,fontWeight:800,color:spentNet===0?T.t:spentNet<0?T.red:over?T.red:T.green}}>
            {spentNet<0?"−":""}{fmts(Math.abs(spentNet))}
            {spentNet<0&&<span style={{fontSize:9,color:T.red,marginLeft:4}}>pérdida neta</span>}
          </div>
          <div style={{fontSize:9,color:T.t3,transition:"transform .3s",transform:open?"rotate(180deg)":"none"}}>▼</div>
        </div>
      </div>
      {/* Mini bar */}
      <div style={{height:2,background:T.bg4,margin:"0 13px",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:barCol,transition:"width .5s ease"}}/>
      </div>
      {/* Body */}
      {open && (
        <div style={{padding:"12px 13px 13px",borderTop:`1px solid ${T.b}`}}>
          {/* Add row */}
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
            <span style={{fontSize:10,color:T.t3}}>📅</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 9px",fontSize:11,color:T.t2,outline:"none",colorScheme:"dark"}}/>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:8}}>
            <input ref={descRef} value={desc} onChange={e=>setDesc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
              placeholder={cat.ph}
              style={{flex:1,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:9,padding:"9px 11px",fontSize:13,color:T.t,outline:"none",minWidth:0}}/>
            <div style={{position:"relative",width:80,flexShrink:0}}>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.t3,pointerEvents:"none"}}>$</span>
              <input value={amt} onChange={e=>setAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
                type="number" placeholder={allowNeg?"+ / -":"0"} inputMode="decimal"
                style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:9,padding:"9px 6px 9px 17px",fontSize:13,fontWeight:700,color:T.t,outline:"none",textAlign:"right"}}/>
            </div>
            <button onClick={add} className="btn-press" style={{background:T.red,border:"none",borderRadius:9,padding:"9px 12px",fontSize:16,color:"#fff",cursor:"pointer",flexShrink:0}}>+</button>
          </div>
          {/* Note + Tag row */}
          <div style={{display:"flex",gap:7,marginBottom:10,alignItems:"center"}}>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="📝 Nota opcional"
              style={{flex:1,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:9,padding:"7px 10px",fontSize:11,color:T.t2,outline:"none",minWidth:0}}/>
            <select value={tag} onChange={e=>setTag(e.target.value)}
              style={{background:tag?TAGS[tag as TagKey]?.color:T.bg3,border:`1px solid ${tag?TAGS[tag as TagKey]?.text:T.b2}`,borderRadius:9,padding:"7px 9px",fontSize:11,color:tag?TAGS[tag as TagKey]?.text:T.t3,outline:"none",flexShrink:0,maxWidth:110}}>
              <option value="">🏷 Etiqueta</option>
              {TK.map(k=><option key={k} value={k}>{TAGS[k as TagKey].emoji} {TAGS[k as TagKey].label}</option>)}
            </select>
          </div>
          {/* Entries */}
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {sorted.length===0 && <div style={{textAlign:"center",padding:10,color:T.t4,fontSize:12}}>Sin registros · toca + para agregar</div>}
            {sorted.map(e => (
              <EntryItem key={e.id} entry={e} cat={catKey}
                isEditing={editingEntry?.cat===catKey&&editingEntry?.id===e.id}
                onEdit={onEdit} onSave={onSave} onCancel={onCancel} onDelete={onDelete}/>
            ))}
          </div>
          {/* Total row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg,borderRadius:9,padding:"8px 11px",marginTop:4}}>
            <span style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:2}}>Total</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14,fontWeight:800,color:spentNet<0?T.red:T.t}}>
                {spentNet<0?"−":""}{fmts(Math.abs(spentNet))}
              </span>
              <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,
                background:spentNet<0?"rgba(233,69,96,.12)":spentPositive===0?"rgba(42,42,42,.5)":over?"rgba(233,69,96,.12)":"rgba(46,204,113,.12)",
                color:spentNet<0?T.red:spentPositive===0?T.t3:over?T.red:T.green}}>
                {spentNet<0?"Pérdida neta":spentPositive===0?"$0":over?"+"+fmt(spentPositive-budget)+" excedido":"-"+fmt(budget-spentPositive)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DonutChart (Recharts) ─────────────────────
function DonutChart({ data, income }: { data:{name:string;value:number;color:string}[]; income:number }) {
  const RADIAN = Math.PI / 180;
  const total  = data.reduce((s,d)=>s+d.value,0);
  const has    = total > 0;

  const renderLabel = ({ cx,cy,midAngle,innerRadius,outerRadius,percent,name }) => {
    if (percent < 0.05) return null;
    const r = innerRadius+(outerRadius-innerRadius)*0.5;
    const x = cx + r*Math.cos(-midAngle*RADIAN);
    const y = cy + r*Math.sin(-midAngle*RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={9}>{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={has?data:CK.map(c=>({name:CATS[c as CatKey].label,value:1,color:"#1e1e1e"}))}
          cx="50%" cy="50%" innerRadius={55} outerRadius={85}
          dataKey="value" labelLine={false} label={has?renderLabel:undefined}>
          {(has?data:CK.map(c=>({color:"#1e1e1e"}))).map((d,i)=>(
            <Cell key={i} fill={d.color} stroke={T.bg} strokeWidth={2}/>
          ))}
        </Pie>
        {has && <Tooltip formatter={(v,n)=>[fmt(v),n]} contentStyle={{background:T.bg2,border:`1px solid ${T.b}`,borderRadius:8,fontSize:11}} itemStyle={{color:T.t}}/>}
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── IncomesCard ───────────────────────────────
function IncomesCard({ incomes, onAdd, onDelete, onEdit }: {
  incomes:  Income[];
  onAdd:    (inc: Omit<Income,"id">) => void;
  onDelete: (id: number) => void;
  onEdit:   (id: number, data: Omit<Income,"id">) => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [desc,      setDesc]      = useState("");
  const [amt,       setAmt]       = useState("");
  const [date,      setDate]      = useState(today());
  const [source,    setSource]    = useState<IncomeSource>("sueldo");
  const [editingId, setEditingId] = useState<number|null>(null);
  // edit state
  const [eDesc,   setEDesc]   = useState("");
  const [eAmt,    setEAmt]    = useState("");
  const [eDate,   setEDate]   = useState("");
  const [eSource, setESource] = useState<IncomeSource>("sueldo");
  const descRef = useRef<HTMLInputElement>(null);

  const total  = incomes.reduce((s,i)=>s+i.amt,0);
  const sorted = [...incomes].sort((a,b)=>b.date.localeCompare(a.date));

  const add = () => {
    const parsed = parseFloat(amt);
    if (!desc.trim()||!parsed||parsed<=0) return;
    onAdd({desc:desc.trim(), amt:parsed, date, source});
    setDesc(""); setAmt(""); descRef.current?.focus();
  };

  const startEdit = (i: Income) => {
    setEditingId(i.id);
    setEDesc(i.desc); setEAmt(String(i.amt)); setEDate(i.date); setESource(i.source);
  };

  const saveEdit = () => {
    const parsed = parseFloat(eAmt);
    if (!eDesc.trim()||!parsed||parsed<=0||editingId===null) return;
    onEdit(editingId, {desc:eDesc.trim(), amt:parsed, date:eDate, source:eSource});
    setEditingId(null);
  };

  return (
    <Card style={{border:"1px solid rgba(46,204,113,.25)"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:19,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(46,204,113,.1)",borderRadius:10,flexShrink:0}}>💰</div>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:T.green}}>Ingresos del mes</div>
            <div style={{fontSize:10,color:T.t3,marginTop:1}}>{incomes.length} entrada{incomes.length!==1?"s":""}</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
          <div style={{fontSize:16,fontWeight:800,color:T.green}}>{fmts(total)}</div>
          <div style={{fontSize:9,color:T.t3,transition:"transform .3s",transform:open?"rotate(180deg)":"none"}}>▼</div>
        </div>
      </div>

      {/* Mini barra por fuente */}
      {total>0 && (
        <div style={{display:"flex",gap:2,marginTop:8,height:3,borderRadius:3,overflow:"hidden"}}>
          {(Object.keys(INCOME_SOURCES) as IncomeSource[]).map(s=>{
            const sub = incomes.filter(i=>i.source===s).reduce((x,i)=>x+i.amt,0);
            if(!sub) return null;
            return <div key={s} style={{flex:sub,background:INCOME_SOURCES[s].color,borderRadius:3}}/>;
          })}
        </div>
      )}

      {open && (
        <div style={{marginTop:12,borderTop:`1px solid ${T.b}`,paddingTop:12}}>
          {/* Selector de fuente */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {(Object.keys(INCOME_SOURCES) as IncomeSource[]).map(s=>(
              <button key={s} onClick={()=>setSource(s)} style={{
                background:source===s?INCOME_SOURCES[s].color+"33":"none",
                border:`1px solid ${source===s?INCOME_SOURCES[s].color:T.b2}`,
                borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,
                color:source===s?INCOME_SOURCES[s].color:T.t3,cursor:"pointer",transition:"all .15s"
              }}>
                {INCOME_SOURCES[s].icon} {INCOME_SOURCES[s].label}
              </button>
            ))}
          </div>

          {/* Fila de agregar */}
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input ref={descRef} value={desc} onChange={e=>setDesc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
              placeholder="Descripción…"
              style={{flex:1,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:9,padding:"9px 11px",fontSize:13,color:T.t,outline:"none",minWidth:0}}/>
            <div style={{position:"relative",width:90,flexShrink:0}}>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.green,pointerEvents:"none"}}>$</span>
              <input value={amt} onChange={e=>setAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
                type="number" placeholder="0" inputMode="decimal"
                style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:9,padding:"9px 6px 9px 18px",fontSize:13,fontWeight:700,color:T.green,outline:"none",textAlign:"right"}}/>
            </div>
            <button onClick={add} style={{background:T.green,border:"none",borderRadius:9,padding:"9px 12px",fontSize:16,color:"#000",cursor:"pointer",fontWeight:700,flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
            <span style={{fontSize:10,color:T.t3}}>📅</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 9px",fontSize:11,color:T.t2,outline:"none",colorScheme:"dark"}}/>
          </div>

          {/* Lista de ingresos */}
          {sorted.length===0 && (
            <div style={{textAlign:"center",padding:"12px 0",color:T.t4,fontSize:12}}>Sin ingresos registrados aún</div>
          )}
          {sorted.map(i=>{
            const src = INCOME_SOURCES[i.source];
            const isEditing = editingId===i.id;

            if(isEditing) return (
              <div key={i.id} style={{background:"#0d2210",border:"1px solid rgba(46,204,113,.3)",borderRadius:12,padding:12,marginBottom:6}}>
                {/* Fuente */}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                  {(Object.keys(INCOME_SOURCES) as IncomeSource[]).map(s=>(
                    <button key={s} onClick={()=>setESource(s)} style={{
                      background:eSource===s?INCOME_SOURCES[s].color+"33":"none",
                      border:`1px solid ${eSource===s?INCOME_SOURCES[s].color:T.b2}`,
                      borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700,
                      color:eSource===s?INCOME_SOURCES[s].color:T.t3,cursor:"pointer"
                    }}>
                      {INCOME_SOURCES[s].icon} {INCOME_SOURCES[s].label}
                    </button>
                  ))}
                </div>
                {/* Desc + Monto */}
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <input value={eDesc} onChange={e=>setEDesc(e.target.value)}
                    style={{flex:1,background:T.bg3,border:"1px solid rgba(46,204,113,.4)",borderRadius:8,padding:"8px 10px",fontSize:13,color:T.t,outline:"none",minWidth:0}}/>
                  <div style={{position:"relative",width:90,flexShrink:0}}>
                    <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,color:T.green,pointerEvents:"none"}}>$</span>
                    <input value={eAmt} onChange={e=>setEAmt(e.target.value)} type="number" inputMode="decimal"
                      style={{width:"100%",background:T.bg3,border:"1px solid rgba(46,204,113,.4)",borderRadius:8,padding:"8px 6px 8px 18px",fontSize:13,fontWeight:700,color:T.green,outline:"none",textAlign:"right"}}/>
                  </div>
                </div>
                {/* Fecha + Acciones */}
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="date" value={eDate} onChange={e=>setEDate(e.target.value)}
                    style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 8px",fontSize:11,color:T.t2,outline:"none",colorScheme:"dark",flexShrink:0}}/>
                  <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                    <button onClick={()=>{ if(confirm("¿Eliminar este ingreso?")) onDelete(i.id); setEditingId(null); }}
                      style={{background:"rgba(233,69,96,.12)",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.red,cursor:"pointer"}}>🗑</button>
                    <button onClick={()=>setEditingId(null)}
                      style={{background:T.bg3,border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.t3,cursor:"pointer"}}>✕</button>
                    <button onClick={saveEdit}
                      style={{background:T.green,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#000",cursor:"pointer"}}>✓ Guardar</button>
                  </div>
                </div>
              </div>
            );

            const {day,mon} = fmtDate(i.date);
            return (
              <div key={i.id} className="entry-new" onClick={()=>startEdit(i)}
                style={{display:"flex",alignItems:"center",gap:8,background:T.bg3,borderRadius:10,padding:"9px 10px",marginBottom:5,borderLeft:`3px solid ${src.color}`,cursor:"pointer"}}>
                <div style={{fontSize:10,color:T.t3,flexShrink:0,width:28,textAlign:"center",background:T.bg4,borderRadius:5,padding:3,lineHeight:1.3}}>
                  {day}<b style={{display:"block",fontSize:11,color:T.t2}}>{mon}</b>
                </div>
                <span style={{fontSize:14,flexShrink:0}}>{src.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.desc}</div>
                  <div style={{fontSize:9,color:src.color,marginTop:1}}>{src.label}</div>
                </div>
                <div style={{fontSize:13,fontWeight:800,color:T.green,flexShrink:0}}>+{fmts(i.amt)}</div>
                <span style={{fontSize:10,color:T.t3,flexShrink:0}}>✎</span>
              </div>
            );
          })}

          {/* Desglose por fuente */}
          {incomes.length>1 && (
            <div style={{marginTop:10,background:T.bg3,borderRadius:10,padding:"10px 12px"}}>
              {(Object.keys(INCOME_SOURCES) as IncomeSource[]).map(s=>{
                const sub=incomes.filter(i=>i.source===s).reduce((x,i)=>x+i.amt,0);
                if(!sub) return null;
                return (
                  <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                    <span style={{fontSize:11,color:T.t3}}>{INCOME_SOURCES[s].icon} {INCOME_SOURCES[s].label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:INCOME_SOURCES[s].color}}>{fmts(sub)}</span>
                  </div>
                );
              })}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,paddingTop:6,borderTop:`1px solid ${T.b}`}}>
                <span style={{fontSize:11,fontWeight:700,color:T.t}}>Total</span>
                <span style={{fontSize:14,fontWeight:900,color:T.green}}>{fmts(total)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── ResumenTab ────────────────────────────────
function ResumenTab({ month, monthKey, goals=[], onUpdateGoals, onAddIncome, onDeleteIncome, onEditIncome }: { month:Month; monthKey:string; goals:Goal[]; onUpdateGoals:(fn:(prev:Goal[])=>Goal[])=>void; onAddIncome:(inc:Omit<Income,"id">)=>void; onDeleteIncome:(id:number)=>void; onEditIncome:(id:number,data:Omit<Income,"id">)=>void }) {
  const income = totalIncomeMonth(month);
  const spent  = totalSpentMonth(month);  // solo salidas positivas de cada categoría
  const avail  = income - spent;
  const pctU   = income>0 ? Math.min((spent/income)*100,100) : 0;

  // Proyección del mes
  const [y,mo]         = monthKey.split("-").map(Number);
  const daysInMonth    = new Date(y, mo, 0).getDate();
  const today_d        = new Date();
  const isCurrentMonth = today_d.getFullYear()===y && today_d.getMonth()===mo-1;
  const daysPassed     = isCurrentMonth ? today_d.getDate() : daysInMonth;
  const dailyAvg       = daysPassed>0 ? spent/daysPassed : 0;
  const projected      = dailyAvg * daysInMonth;
  const daysLeft       = Math.max(0, daysInMonth - daysPassed);
  const safeDaily      = (income>0 && daysLeft>0) ? (income-spent)/daysLeft : 0;

  // Donut: solo dinero que realmente SALIÓ (positivos) por categoría
  const donutData = CK.map(c=>({
    name:  CATS[c as CatKey].label,
    value: (month.entries[c as CatKey]||[]).reduce((s,e)=>s+(e.amt>0?e.amt:0),0),
    color: CATS[c as CatKey].color,
  }));

  // Barras: Presupuesto vs Gastado (solo salidas positivas)
  const cp = month?.customPct || {};
  const barData = CK.map(c=>({
    name:        CATS[c as CatKey].label,
    Presupuesto: +(income*(cp[c]??CATS[c as CatKey].pct)).toFixed(2),
    Gastado:     +((month.entries[c as CatKey]||[]).reduce((s,e)=>s+(e.amt>0?e.amt:0),0)).toFixed(2),
  }));

  // Línea diaria: solo egresos positivos acumulados
  const allEntries: {date:string;amt:number}[] = [];
  CK.forEach(c=>(month.entries[c as CatKey]||[])
    .filter(e=>e.amt>0)
    .forEach(e=>allEntries.push({date:e.date,amt:e.amt})));
  allEntries.sort((a,b)=>a.date.localeCompare(b.date));
  const byDay: Record<string,number> = {};
  allEntries.forEach(e=>{byDay[e.date]=(byDay[e.date]||0)+e.amt;});
  const days = Object.keys(byDay).sort();
  let acc=0;
  const lineData = days.map(d=>({
    name:      fmtDate(d).day+" "+fmtDate(d).mon,
    Acumulado: +(acc+=byDay[d], acc).toFixed(2),
    Diario:    +byDay[d].toFixed(2),
  }));

  // Esenciales vs Libertad (solo salidas positivas — consistente)
  const essGastado = ESS.reduce((s,c)=>
    (month.entries[c as CatKey]||[]).reduce((x,e)=>x+(e.amt>0?e.amt:0),0)+s, 0);
  const libGastado = LIB.reduce((s,c)=>
    (month.entries[c as CatKey]||[]).reduce((x,e)=>x+(e.amt>0?e.amt:0),0)+s, 0);
  const essPct = income>0 ? ((essGastado/income)*100).toFixed(0) : "0";
  const libPct = income>0 ? ((libGastado/income)*100).toFixed(0) : "0";

  const ttStyle = {background:T.bg2,border:`1px solid ${T.b}`,borderRadius:8,fontSize:11};
  const itStyle = {color:T.t};

  return (
    <div style={{paddingTop:12}}>
      {/* Ingresos */}
      <IncomesCard incomes={month.incomes||[]} onAdd={onAddIncome} onDelete={onDeleteIncome} onEdit={onEditIncome}/>

      {/* Resumen */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontSize:10,color:T.t3,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Ingresos del mes</div>
            <div style={{fontSize:22,fontWeight:800,color:income>0?T.green:T.t3}}>{income>0?fmts(income):"Sin ingresos aún"}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:T.t3,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Uso</div>
            <div style={{fontSize:14,fontWeight:700,color:pctU>=100?T.red:pctU>=70?T.yellow:T.green}}>
              {income>0?pctU.toFixed(1)+"%":"—"}
            </div>
          </div>
        </div>
        {month?.customPct && (
          <div style={{background:"rgba(245,166,35,.08)",border:"1px solid rgba(245,166,35,.2)",borderRadius:10,padding:"6px 12px",marginBottom:10,fontSize:11,color:T.yellow}}>
            ⚡ Presupuesto personalizado activo para este mes
          </div>
        )}
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
          <span style={{borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,background:"#0d1e33",color:T.blue}}>
            🔵 Esenciales · {fmts(essGastado)} ({essPct}%)
          </span>
          <span style={{borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,background:"#2a0d14",color:T.red}}>
            🔴 Libertad · {fmts(libGastado)} ({libPct}%)
          </span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.t3,marginBottom:5}}>
          <span>Total egresos este mes</span>
          <span style={{color:pctU>=100?T.red:pctU>=80?T.yellow:T.t3}}>{fmts(spent)}</span>
        </div>
        <div style={{height:6,background:T.bg4,borderRadius:6,overflow:"hidden",marginBottom:12}}>
          <div style={{height:"100%",borderRadius:6,width:`${pctU}%`,
            background:pctU<70?"linear-gradient(90deg,#1e3a5f,#4a90d9)":pctU<100?"linear-gradient(90deg,#3a2800,#f5a623)":"linear-gradient(90deg,#5a1020,#e94560)",
            transition:"width .5s ease"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {([["Egresos",fmts(spent),T.t],["Disponible",fmts(Math.max(avail,0)),T.green],["Balance",(avail>=0?"+":"")+fmts(avail),avail>=0?T.green:T.red]] as [string,string,string][]).map(([l,v,c])=>(
            <div key={l} style={{background:T.bg3,borderRadius:11,padding:10,textAlign:"center"}}>
              <div style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
              <div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Donut */}
      <Card>
        <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.t3,marginBottom:12}}>Distribución de egresos</div>
        <DonutChart data={donutData} income={income}/>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginTop:12}}>
          {CK.map((c,i)=>{
            const s=donutData[i].value;
            const b=income*(cp[c]??CATS[c as CatKey].pct);
            const total=donutData.reduce((x,d)=>x+d.value,0);
            const p=total>0?((s/total)*100).toFixed(1):"0.0";
            return (
              <div key={c} style={{display:"flex",alignItems:"center",gap:9}}>
                <div style={{width:9,height:9,borderRadius:3,background:PAL[i],flexShrink:0}}/>
                <div style={{flex:1,fontSize:12,color:T.t2}}>{CATS[c as CatKey].label}</div>
                <div style={{fontSize:10,color:T.t3}}>{p}%</div>
                <div style={{fontSize:12,fontWeight:700,color:income>0&&s>b?T.red:T.t}}>{fmts(s)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Barras */}
      <Card>
        <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.t3,marginBottom:12}}>Egreso vs Presupuesto</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="name" tick={{fill:T.t3,fontSize:8}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:T.t3,fontSize:8}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v}/>
            <Tooltip contentStyle={ttStyle} itemStyle={itStyle}/>
            <Bar dataKey="Presupuesto" fill="rgba(74,144,217,.2)" stroke={T.blue} strokeWidth={1} radius={4}/>
            <Bar dataKey="Gastado" radius={4}>
              {barData.map((d,i)=><Cell key={i}
                fill={d.Gastado>d.Presupuesto?"rgba(233,69,96,.7)":"rgba(46,204,113,.7)"}
                stroke={(d.Gastado>d.Presupuesto?T.red:T.green) as string} strokeWidth={1}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Línea acumulada */}
      {lineData.length>0 && (
        <Card>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.t3,marginBottom:12}}>Egresos acumulados diarios</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={lineData} margin={{top:0,right:0,left:-20,bottom:0}}>
              <XAxis dataKey="name" tick={{fill:T.t3,fontSize:8}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.t3,fontSize:8}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v}/>
              <Tooltip contentStyle={ttStyle} itemStyle={itStyle}/>
              <Line type="monotone" dataKey="Acumulado" stroke={T.red} strokeWidth={2} dot={{r:2,fill:T.red}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Proyección — solo si hay ingresos Y gastos */}
      {isCurrentMonth && income>0 && spent>0 && (
        <Card style={{border:`1px solid ${projected>income?"rgba(233,69,96,.35)":"rgba(74,144,217,.25)"}`}}>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.t3,marginBottom:14}}>📈 Proyección del mes</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {([
              ["Gasto proyectado",  fmts(projected),             projected>income?T.red:T.green,  projected>income?"⚠️ Supera el ingreso":"✓ Dentro del presupuesto"],
              ["Promedio diario",   fmts(dailyAvg),              T.t,                             `${daysPassed} días registrados`],
              ["Días restantes",    String(daysLeft),            T.t,                             `de ${daysInMonth} días del mes`],
              ["Puedes gastar/día", fmts(Math.max(0,safeDaily)), safeDaily<=0?T.red:T.green,      safeDaily<=0?"Presupuesto agotado":"Para no pasarte"],
            ] as [string,string,string,string][]).map(([l,v,c,sub])=>(
              <div key={l} style={{background:T.bg3,borderRadius:12,padding:12}}>
                <div style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
                <div style={{fontSize:10,color:T.t3,marginTop:3}}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:T.t3,marginBottom:5,display:"flex",justifyContent:"space-between"}}>
            <span>Proyección vs ingreso</span>
            <span style={{color:projected>income?T.red:T.green}}>{((projected/income)*100).toFixed(1)}%</span>
          </div>
          <div style={{height:6,background:T.bg4,borderRadius:6,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:6,
              width:`${Math.min((projected/income)*100,100)}%`,
              background:projected>income?"linear-gradient(90deg,#5a1020,#e94560)":"linear-gradient(90deg,#1e3a5f,#4a90d9)",
              transition:"width .5s ease"}}/>
          </div>
        </Card>
      )}

      <GoalsCard goals={goals} onUpdateGoals={onUpdateGoals} monthSaved={Math.max(0,avail)}/>
      <TradingPnLCard entries={month.entries.trading||[]} income={income}/>
      <HormigazAnalyzer month={month}/>

    </div>
  );
}


// ── TradingPnLCard ───────────────────────────
function TradingPnLCard({ entries, income }: { entries:Entry[]; income:number }) {
  const deposits = entries.filter(e=>e.amt>0).reduce((s,e)=>s+e.amt,0);
  const losses   = entries.filter(e=>e.amt<0).reduce((s,e)=>s+e.amt,0);
  const net      = deposits + losses; // losses are negative
  const budget   = income * 0.15;
  const pct      = budget>0 ? Math.min((Math.abs(net)/budget)*100,100) : 0;
  if (entries.length===0) return null;

  return (
    <Card style={{border:`1px solid ${net<0?"rgba(233,69,96,.3)":"rgba(74,144,217,.25)"}`}}>
      <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.t3,marginBottom:14}}>📈 Trading — Resultado neto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[
          ["Depositado", fmts(deposits), T.blue],
          ["Pérdidas",   fmts(Math.abs(losses)), losses<0?T.red:T.t3],
          ["Neto real",  (net>=0?"+":"")+fmts(net), net>=0?T.green:T.red],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:T.bg3,borderRadius:11,padding:10,textAlign:"center"}}>
            <div style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
            <div style={{fontSize:14,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      {losses<0 && (
        <div style={{background:"rgba(233,69,96,.06)",borderRadius:10,padding:"10px 12px",fontSize:11,color:T.t2,lineHeight:1.7}}>
          ⚠️ Tus pérdidas de trading (<strong style={{color:T.red}}>{fmts(Math.abs(losses))}</strong>) reducen tu resultado real de inversión.
          El neto que efectivamente "invertiste" este mes es <strong style={{color:net>=0?T.green:T.red}}>{fmts(net)}</strong>.
        </div>
      )}
      {net>0 && (
        <div style={{background:"rgba(46,204,113,.06)",borderRadius:10,padding:"10px 12px",fontSize:11,color:T.t2,lineHeight:1.7}}>
          ✅ Trading positivo este mes: ganaste <strong style={{color:T.green}}>{fmts(net)}</strong> neto sobre tu capital.
        </div>
      )}
    </Card>
  );
}

// ── HormigazAnalyzer ──────────────────────────
function HormigazAnalyzer({ month }: { month:Month }) {
  const income = totalIncomeMonth(month);
  const [expanded, setExpanded] = useState(false);
  const THRESHOLD = 15; // gastos < $15 son candidatos a hormiga

  // Recolectar todos los gastos pequeños de comida, servicios y transporte
  const antCats = ["comida","servicios","transporte"];
  const allSmall: (Entry & {cat:CatKey})[] = [];
  antCats.forEach(cat=>{
    (month.entries[cat]||[]).forEach(e=>{
      if(e.amt > 0 && e.amt <= THRESHOLD) allSmall.push({...e, cat});
    });
  });

  // Agrupar por descripción similar (lowercase, primeras 3 palabras)
  const groups = {};
  allSmall.forEach(e=>{
    const key = e.desc.toLowerCase().split(" ").slice(0,3).join(" ");
    if(!groups[key]) groups[key]={key,cat:e.cat,entries:[],total:0,icon:CATS[e.cat].icon};
    groups[key].entries.push(e);
    groups[key].total += e.amt;
  });

  const sorted = Object.values(groups).sort((a,b)=>b.total-a.total);
  const totalAnts = allSmall.reduce((s,e)=>s+e.amt,0);
  const annualImpact = totalAnts * 12;
  const [y,mo] = (Object.keys(month.entries||{}).length ? "" : "2026-01").split("-");
  const daysInMonth = 30;

  // Estrategias basadas en investigación
  const strategies = [
    { icon:"⏰", title:"Regla de las 24 horas", desc:"Antes de cualquier compra pequeña no planificada, espera un día. El impulso desaparece solo." },
    { icon:"💵", title:"Presupuesto inverso", desc:"Ahorra primero, gasta después. Define cuánto vas a ahorrar este mes y retíralo al recibir el ingreso." },
    { icon:"📋", title:"Lista antes de salir", desc:"Nunca vayas al supermercado sin lista. Las compras impulsivas ocurren sin plan." },
    { icon:"🎯", title:"Límite semanal en efectivo", desc:"Asigna un monto fijo semanal para gastos pequeños. Cuando se acaba, se acaba." },
    { icon:"🔍", title:"Auditoría mensual", desc:"Cada mes revisa este analizador. Los patrones que ves aquí son tus gastos hormiga reales." },
    { icon:"☕", title:"Efecto latte", desc:`${fmts(totalAnts/daysInMonth)}/día en pequeñas compras = ${fmts(annualImpact)} al año. Ese dinero puede ser una meta de ahorro.` },
  ];

  if(allSmall.length===0) return (
    <Card style={{border:"1px solid rgba(74,144,217,.15)"}}>
      <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.blue,marginBottom:8}}>🐜 Gastos Hormiga</div>
      <div style={{fontSize:12,color:T.t3,textAlign:"center",padding:"12px 0"}}>
        Sin gastos hormiga detectados este mes. ✅<br/>
        <span style={{fontSize:10}}>Se detectan compras &lt; ${THRESHOLD} en comida, servicios y transporte.</span>
      </div>
    </Card>
  );

  return (
    <Card style={{border:"1px solid rgba(245,166,35,.2)"}}>
      <div onClick={()=>setExpanded(e=>!e)} style={{cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.yellow}}>🐜 Gastos Hormiga</div>
          <span style={{fontSize:10,color:T.t3}}>{expanded?"▲ cerrar":"▼ ver análisis"}</span>
        </div>
        {/* Impact summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[
            ["Este mes",    fmts(totalAnts),     T.yellow],
            ["Proyectado año", fmts(annualImpact), T.red],
            ["N° compras",  allSmall.length,      T.t],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:T.bg3,borderRadius:11,padding:10,textAlign:"center"}}>
              <div style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{height:4,background:T.bg4,borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:4,width:`${Math.min((totalAnts/(income||1))*100,100)}%`,
            background:"linear-gradient(90deg,#3a2800,#f5a623)",transition:"width .5s ease"}}/>
        </div>
        <div style={{fontSize:10,color:T.t3,marginTop:6}}>
          Representan el <strong style={{color:T.yellow}}>{((totalAnts/(income||1))*100).toFixed(1)}%</strong> de tu ingreso mensual
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:14}}>
          {/* Top ant purchases */}
          {sorted.length>0 && (
            <>
              <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:8}}>Top compras hormiga</div>
              {sorted.slice(0,5).map((g,i)=>{
                const annual = g.total * 12;
                const freq = g.entries.length;
                return (
                  <div key={g.key} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.b}`}}>
                    <div style={{fontSize:20,flexShrink:0}}>{g.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,textTransform:"capitalize",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.key}</div>
                      <div style={{fontSize:10,color:T.t3,marginTop:2}}>{freq} vez{freq!==1?"ces":""} · {CATS[g.cat].label}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:13,fontWeight:800,color:T.yellow}}>{fmts(g.total)}</div>
                      <div style={{fontSize:9,color:T.red}}>{fmts(annual)}/año</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Savings strategies */}
          <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",margin:"16px 0 10px"}}>
            💡 Estrategias para reducirlos
          </div>
          {strategies.map(s=>(
            <div key={s.title} style={{display:"flex",gap:10,marginBottom:10,padding:"10px 12px",background:T.bg3,borderRadius:10}}>
              <span style={{fontSize:18,flexShrink:0}}>{s.icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,marginBottom:2}}>{s.title}</div>
                <div style={{fontSize:11,color:T.t3,lineHeight:1.6}}>{s.desc}</div>
              </div>
            </div>
          ))}

          {/* What you could do with saved money */}
          <div style={{background:"rgba(46,204,113,.06)",borderRadius:12,padding:"12px 14px",marginTop:4}}>
            <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:6}}>
              💰 Si reduces el 50% de tus gastos hormiga…
            </div>
            <div style={{fontSize:12,color:T.t2,lineHeight:1.8}}>
              Ahorrarías <strong style={{color:T.green}}>{fmts(totalAnts*0.5)}/mes</strong> →{" "}
              <strong style={{color:T.green}}>{fmts(totalAnts*0.5*12)}/año</strong><br/>
              Equivale a <strong style={{color:T.green}}>{fmts(totalAnts*0.5*12/income)}</strong> meses de ingreso extra
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── GoalsCard ─────────────────────────────────
function GoalsCard({ goals, onUpdateGoals, monthSaved }: { goals:Goal[]; onUpdateGoals:(fn:(prev:Goal[])=>Goal[])=>void; monthSaved:number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name,    setName]    = useState("");
  const [target,  setTarget]  = useState("");
  const [emoji,   setEmoji]   = useState("🎯");

  const EMOJIS = ["🎯","✈️","🏠","🚗","💻","📱","🎓","🏖️","💍","🐶","🎸","🏋️"];

  const add = () => {
    if (!name.trim()||!parseFloat(target)||parseFloat(target)<=0) return;
    try{
      onUpdateGoals(prev=>[...prev,{id:Date.now(),name:name.trim(),target:parseFloat(target),saved:0,emoji,done:false}]);
      setName(""); setTarget(""); setShowAdd(false);
    }catch(e){ console.error("Goals add error:",e); }
  };

  const addSavings = (id, amount) => {
    onUpdateGoals(prev=>prev.map(g=>g.id===id
      ? {...g, saved:Math.min(g.target, g.saved+amount), done:g.saved+amount>=g.target}
      : g
    ));
  };

  const remove = id => { if(confirm("¿Eliminar esta meta?")) onUpdateGoals(prev=>prev.filter(g=>g.id!==id)); };

  return (
    <Card style={{border:"1px solid rgba(46,204,113,.15)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.green}}>🎯 Metas de ahorro</div>
        <button onClick={()=>setShowAdd(s=>!s)}
          style={{background:"rgba(46,204,113,.12)",border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:T.green,cursor:"pointer"}}>
          {showAdd?"✕ Cancelar":"+ Nueva meta"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{background:T.bg3,borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            {EMOJIS.map(e=>(
              <button key={e} onClick={()=>setEmoji(e)}
                style={{fontSize:20,background:emoji===e?"rgba(46,204,113,.2)":"none",border:`1px solid ${emoji===e?T.green:T.b2}`,borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>
                {e}
              </button>
            ))}
          </div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="ej: Vacaciones, Laptop, Auto…"
            style={{width:"100%",background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 12px",fontSize:13,color:T.t,outline:"none",marginBottom:8}}/>
          <div style={{position:"relative",marginBottom:10}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.green,pointerEvents:"none"}}>$</span>
            <input value={target} onChange={e=>setTarget(e.target.value)} type="number" placeholder="Meta de ahorro" inputMode="decimal"
              style={{width:"100%",background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 10px 10px 28px",fontSize:16,fontWeight:800,color:T.t,outline:"none"}}/>
          </div>
          <button onClick={add}
            style={{width:"100%",background:T.green,border:"none",borderRadius:10,padding:11,fontSize:13,fontWeight:700,color:"#000",cursor:"pointer"}}>
            Crear meta →
          </button>
        </div>
      )}

      {/* Goals list */}
      {goals.length===0 && !showAdd && (
        <div style={{textAlign:"center",padding:"16px 0",color:T.t4,fontSize:12,lineHeight:1.7}}>
          Sin metas aún.<br/>Agrega una meta de ahorro para seguir tu progreso.
        </div>
      )}

      {goals.map(g=>{
        const pct = g.target>0 ? Math.min((g.saved/g.target)*100,100) : 0;
        const left = Math.max(0, g.target-g.saved);
        const monthsLeft = monthSaved>0 ? Math.ceil(left/monthSaved) : null;
        return (
          <div key={g.id} style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.b}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:24,flexShrink:0}}>{g.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                  <button onClick={()=>remove(g.id)} style={{background:"none",border:"none",color:T.t4,fontSize:13,cursor:"pointer",flexShrink:0,marginLeft:6}}>✕</button>
                </div>
                <div style={{fontSize:11,color:T.t3,marginTop:2}}>
                  {fmts(g.saved)} de {fmts(g.target)} · {pct.toFixed(0)}%
                  {monthsLeft&&!g.done?` · ~${monthsLeft} mes${monthsLeft!==1?"es":""}`:""}
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{height:8,background:T.bg4,borderRadius:6,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",borderRadius:6,
                width:`${pct}%`,
                background:g.done?"linear-gradient(90deg,#1a5a1a,#2ecc71)":"linear-gradient(90deg,#1e4a1e,#2ecc71)",
                transition:"width .6s ease"}}/>
            </div>
            {g.done ? (
              <div style={{textAlign:"center",color:T.green,fontSize:12,fontWeight:700}}>🎉 ¡Meta alcanzada!</div>
            ) : (
              <div style={{display:"flex",gap:6}}>
                <span style={{fontSize:11,color:T.t3,alignSelf:"center",flex:1}}>Faltan {fmts(left)}</span>
                {[10,50,100].map(a=>(
                  <button key={a} onClick={()=>addSavings(g.id,a)}
                    style={{background:"rgba(46,204,113,.1)",border:"1px solid rgba(46,204,113,.2)",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,color:T.green,cursor:"pointer"}}>
                    +${a}
                  </button>
                ))}
                <button onClick={()=>{const v=parseFloat(prompt("¿Cuánto quieres agregar?",""));if(v>0)addSavings(g.id,v);}}
                  style={{background:"rgba(46,204,113,.1)",border:"1px solid rgba(46,204,113,.2)",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,color:T.green,cursor:"pointer"}}>
                  +✎
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* This month contribution */}
      {goals.some(g=>!g.done) && monthSaved>0 && (
        <div style={{background:"rgba(46,204,113,.06)",borderRadius:10,padding:"10px 12px",marginTop:4}}>
          <div style={{fontSize:11,color:T.green,fontWeight:600}}>💡 Este mes ahorraste {fmts(monthSaved)}</div>
          <div style={{fontSize:10,color:T.t3,marginTop:2}}>Agrégalo a tus metas con los botones de arriba</div>
        </div>
      )}
    </Card>
  );
}

// ── GastosTab ─────────────────────────────────
function GastosTab({ month, monthKey, editingEntry, onEdit, onSave, onCancel, onDelete, onAdd, alertPct=80, onAlert }: { month:Month; monthKey:string; editingEntry:{cat:CatKey;id:number}|null; onEdit:(cat:CatKey,id:number)=>void; onSave:(cat:CatKey,id:number,data:Partial<Entry>)=>void; onCancel:()=>void; onDelete:(cat:CatKey,id:number)=>void; onAdd:(cat:CatKey,entry:Omit<Entry,'id'>)=>void; alertPct?:number; onAlert?:(cat:CatKey,pct:number)=>void }) {
  const cp = month?.customPct || {};
  const fmtSec = (label,color,cats) => (
    <div key={label}>
      <div style={{display:"flex",alignItems:"center",gap:7,margin:"14px 0 8px"}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:color,flexShrink:0}}/>
        <div style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",fontWeight:700,color}}>{label}</div>
        <div style={{marginLeft:"auto",fontSize:12,fontWeight:700,color}}>
          {fmts(cats.reduce((s,c)=>s+(month.entries[c as CatKey]||[]).reduce((x,e)=>x+e.amt,0),0))}
        </div>
      </div>
      {cats.map(c=>(
        <CategoryCard key={c} catKey={c} entries={month.entries[c as CatKey]||[]} income={totalIncomeMonth(month)}
          editingEntry={editingEntry} onEdit={onEdit} onSave={onSave} onCancel={onCancel} onDelete={onDelete} onAdd={onAdd}
          alertPct={alertPct} onAlert={onAlert} customPct={cp[c]??null}/>
      ))}
    </div>
  );
  return (
    <div style={{paddingTop:8}}>
      {fmtSec("Esenciales · 70%",T.blue,ESS)}
      {fmtSec("Libertad · 30%",T.red,LIB)}
    </div>
  );
}

// ── BuscarTab ─────────────────────────────────
function BuscarTab({ month, onGoToEdit }: { month:Month; onGoToEdit:(cat:CatKey,id:number)=>void }) {
  const [tagFilter, setTagFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const results = useMemo(()=>{
    const ql = q.trim().toLowerCase();
    const out: (Entry & {cat:CatKey})[] = [];
    CK.forEach(c=>(month?.entries[c as CatKey]||[]).forEach(e=>{
      const matchQ = !ql || e.desc.toLowerCase().includes(ql);
      const matchT = !tagFilter || e.tag===tagFilter;
      if(matchQ && matchT) out.push({...e,cat:c as CatKey});
    }));
    return out.sort((a,b)=>b.date.localeCompare(a.date));
  },[q,tagFilter,month]);

  const hl = txt => {
    const parts = txt.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,  "gi"));
    return parts.map((p,i)=> p.toLowerCase()===q.toLowerCase()
      ? <mark key={i} style={{background:"rgba(233,69,96,.3)",color:T.red,borderRadius:3,padding:"0 2px"}}>{p}</mark>
      : p
    );
  };

  return (
    <div style={{paddingTop:12}}>
      <div style={{position:"relative",marginBottom:12}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.t3,pointerEvents:"none"}}>🔍</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar en todos los gastos del mes…" autoComplete="off"
          style={{width:"100%",background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:12,padding:"10px 36px",fontSize:13,color:T.t,outline:"none"}}/>
        {q && <button onClick={()=>setQ("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.t3,fontSize:16,cursor:"pointer"}}>✕</button>}
      </div>
      {/* Tag filter chips */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        <button onClick={()=>setTagFilter("")}
          style={{background:!tagFilter?"rgba(255,255,255,.1)":"none",border:`1px solid ${!tagFilter?T.t2:T.b2}`,borderRadius:20,padding:"4px 10px",fontSize:11,color:!tagFilter?T.t:T.t3,cursor:"pointer"}}>
          Todos
        </button>
        {TK.map(k=>(
          <button key={k} onClick={()=>setTagFilter(tagFilter===k?"":k)}
            style={{background:tagFilter===k?TAGS[k as TagKey].color:"none",border:`1px solid ${tagFilter===k?TAGS[k as TagKey].text:T.b2}`,
              borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,
              color:tagFilter===k?TAGS[k as TagKey].text:T.t3,cursor:"pointer"}}>
            {TAGS[k as TagKey].emoji} {TAGS[k as TagKey].label}
          </button>
        ))}
      </div>
      {!q && !tagFilter && <div style={{textAlign:"center",padding:24,color:T.t4,fontSize:13}}>Escribe o filtra por etiqueta</div>}
      {(q||tagFilter) && results.length===0 && <div style={{textAlign:"center",padding:24,color:T.t4,fontSize:13}}>Sin resultados</div>}
      {results.length>0 && (q||tagFilter) && (
        <>
          <div style={{fontSize:10,letterSpacing:3,color:T.t3,textTransform:"uppercase",marginBottom:8}}>{results.length} resultado{results.length!==1?"s":""}</div>
          {results.map(e=>{
            const {day,mon} = fmtDate(e.date);
            return (
              <div key={e.id} onClick={()=>onGoToEdit(e.cat,e.id)}
                style={{display:"flex",alignItems:"center",gap:10,background:T.bg2,borderRadius:11,padding:"10px 12px",marginBottom:6,cursor:"pointer",
                  border:`1px solid ${e.tag?TAGS[e.tag]?.text+"44":T.b}`,
                  borderLeft:e.tag?`3px solid ${TAGS[e.tag]?.text}`:undefined}}>
                <div style={{fontSize:18,flexShrink:0}}>{CATS[e.cat].icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hl(e.desc)}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:T.t3}}>{CATS[e.cat].label} · {day} {mon}</span>
                    {e.tag && <TagBadge tag={e.tag} small/>}
                    {e.note && <span style={{fontSize:10,color:"#4a8a4a"}}>📝 {e.note}</span>}
                  </div>
                </div>
                <div style={{fontSize:14,fontWeight:800,flexShrink:0,color:(e.cat==="inversion"&&e.amt<0)?T.green:e.amt<0?T.red:T.t}}>
                  {(e.cat==="inversion"&&e.amt<0)?"💰 +":e.amt<0?"−":""}{fmt(Math.abs(e.amt))}</div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── MonthScreen ───────────────────────────────
function MonthScreen({ months, monthKey, onBack, onUpdate, showToast, getToken, connected, alertPct=80, goals=[], onUpdateGoals }: {
  months: Record<string,Month>;
  monthKey: string;
  onBack: () => void;
  onUpdate: (key:string, fn:(m:Month)=>Month) => void;
  showToast: (m:string, t:'ok'|'err'|'info') => void;
  getToken: () => Promise<string>;
  connected: boolean;
  alertPct?: number;
  goals: Goal[];
  onUpdateGoals: (fn:(prev:Goal[])=>Goal[]) => void;
}) {
  const month = months[monthKey];
  const [tab, setTab]           = useState("resumen");
  const [editingEntry, setEditingEntry] = useState<{cat:CatKey;id:number}|null>(null);
  const [dirty,  setDirty]      = useState(false);
  const [saving, setSaving]     = useState(false);
  const [showFlex, setShowFlex] = useState(false);
  const autosaveTimer           = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const autosaveEnabled         = localStorage.getItem(LS.AS)==="1";

  // ── helpers de serialización centralizados ────
  const serializeMonth = useCallback((m: Month) => ({
    version: 9,
    month:   monthKey,
    income:  m.income,        // mantenemos por compatibilidad con v8
    incomes: m.incomes || [], // nuevo: array de ingresos reales
    savedAt: new Date().toISOString(),
    entries: m.entries,
  }), [monthKey]);

  const markDirty = useCallback(() => {
    setDirty(true);
    if (autosaveEnabled && connected) {
      if(autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(autoSave, 4000);
    }
  },[connected,autosaveEnabled]);

  const autoSave = useCallback(async () => {
    setSaving(true);
    try { await doSaveCloud(); setDirty(false); }
    catch{}
    finally { setSaving(false); }
  },[]);

  useEffect(()=>()=>clearTimeout(autosaveTimer.current),[]);

  // ── CRUD entries ─────────────────────────────
  const addEntry = useCallback((cat: CatKey, entry: Omit<Entry,'id'>) => {
    onUpdate(monthKey, m=>({
      ...m, entries:{...m.entries,[cat]:[...(m.entries[cat]||[]),{id:Date.now(),...entry}]}
    }));
    markDirty();
    showToast(`${CATS[cat].icon} Agregado en ${CATS[cat].label}`,"ok");
  },[monthKey,onUpdate,markDirty,showToast]);

  const saveEntry = useCallback((cat: CatKey, id: number, data: Partial<Entry>) => {
    onUpdate(monthKey, m=>({
      ...m, entries:{...m.entries,[cat]:(m.entries[cat]||[]).map(e=>e.id===id?{...e,...data}:e)}
    }));
    setEditingEntry(null); markDirty();
    showToast("Entrada actualizada","ok");
  },[monthKey,onUpdate,markDirty,showToast]);

  const delEntry = useCallback((cat: CatKey, id: number) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    onUpdate(monthKey, m=>({
      ...m, entries:{...m.entries,[cat]:(m.entries[cat]||[]).filter(e=>e.id!==id)}
    }));
    setEditingEntry(null); markDirty();
  },[monthKey,onUpdate,markDirty]);

  // ── CRUD incomes ─────────────────────────────
  const addIncome = useCallback((inc: Omit<Income,'id'>) => {
    onUpdate(monthKey, m=>({
      ...m, incomes:[...(m.incomes||[]),{id:Date.now(),...inc}]
    }));
    markDirty();
    showToast(`💰 Ingreso agregado: +${fmts(inc.amt)}`,"ok");
  },[monthKey,onUpdate,markDirty,showToast]);

  const delIncome = useCallback((id: number) => {
    onUpdate(monthKey, m=>({
      ...m, incomes:(m.incomes||[]).filter(i=>i.id!==id)
    }));
    markDirty();
  },[monthKey,onUpdate,markDirty]);

  const editIncome = useCallback((id: number, data: Omit<Income,'id'>) => {
    onUpdate(monthKey, m=>({
      ...m, incomes:(m.incomes||[]).map(i=>i.id===id?{...i,...data}:i)
    }));
    markDirty();
    showToast("Ingreso actualizado","ok");
  },[monthKey,onUpdate,markDirty,showToast]);

  // ── Cloud / local save ────────────────────────
  const doSaveCloud = useCallback(async()=>{
    if (!connected||!monthKey||!months[monthKey]) { showToast("Dropbox no conectado","info"); return; }
    const token = await getToken();
    const data  = serializeMonth(months[monthKey]);
    const r = await fetch("https://content.dropboxapi.com/2/files/upload",{
      method:"POST",
      headers:{
        "Authorization":"Bearer "+token,
        "Content-Type":"application/octet-stream",
        "Dropbox-API-Arg":JSON.stringify({path:`/gastos7030/${monthKey}.json`,mode:"overwrite",mute:true})
      },
      body:JSON.stringify(data)
    });
    if (!r.ok) throw new Error(String(r.status));
    onUpdate(monthKey, m=>({...m, savedAt:data.savedAt}));
    setDirty(false); setSaving(false);
    showToast(`☁️ ${monName(monthKey)} guardado`,"ok");
  },[connected,getToken,months,monthKey,onUpdate,serializeMonth,showToast]);

  const saveCloud = useCallback(async()=>{
    setSaving(true);
    try { await doSaveCloud(); }
    catch(e: any){ showToast("Error al guardar: "+e.message,"err"); }
    finally{ setSaving(false); }
  },[doSaveCloud,showToast]);

  const exportLocal = useCallback(()=>{
    const data = serializeMonth(months[monthKey]);
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`gastos-${monthKey}.json`; a.click();
    URL.revokeObjectURL(url); setDirty(false);
    showToast("📥 Archivo descargado","ok");
  },[months,monthKey,serializeMonth,showToast]);

  const tabs = [
    {id:"resumen", label:"📊 Resumen"},
    {id:"gastos",  label:"📝 Gastos"},
    {id:"buscar",  label:"🔍 Buscar"},
  ];

  if (!month) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <TopBar title={monName(monthKey)} onBack={onBack}
        right={[
          <IconBtn key="flex" onClick={()=>setShowFlex(true)} title="Presupuesto flexible">
            <span style={{fontSize:13,fontWeight:700,color:month?.customPct?T.yellow:T.t3}}>⚡</span>
          </IconBtn>,
          <IconBtn key="cloud" onClick={saveCloud} title="Guardar en nube">☁️</IconBtn>,
          <IconBtn key="save"  onClick={exportLocal} title="Guardar local">💾</IconBtn>
        ]}/>
      <SaveBar dirty={dirty} saving={saving} onCloud={saveCloud} onLocal={exportLocal}/>
      <div style={{display:"flex",background:T.bg2,borderBottom:`1px solid ${T.b}`,flexShrink:0}}>
        {tabs.map(t=>(

          <div key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,padding:"12px 4px",textAlign:"center",fontSize:11,fontWeight:600,cursor:"pointer",
            color:tab===t.id?T.red:T.t3, borderBottom:`2px solid ${tab===t.id?T.red:"transparent"}`,
            transition:"all .2s"
          }}>{t.label}</div>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"0 14px 20px"}}>
        {tab==="resumen" && <ResumenTab month={month} monthKey={monthKey} goals={goals} onUpdateGoals={onUpdateGoals} onAddIncome={addIncome} onDeleteIncome={delIncome} onEditIncome={editIncome}/>}
        {tab==="gastos"  && <GastosTab  month={month} monthKey={monthKey} editingEntry={editingEntry}
          onEdit={(cat,id)=>setEditingEntry({cat,id})} onSave={saveEntry} onCancel={()=>setEditingEntry(null)}
          onDelete={delEntry} onAdd={addEntry} alertPct={alertPct}
          onAlert={(cat,pct)=>showToast(`⚠️ ${CATS[cat as CatKey].label} al ${pct.toFixed(0)}% del presupuesto`,"err")}/>}
        {tab==="buscar"  && <BuscarTab  month={month}
          onGoToEdit={(cat,id)=>{ setTab("gastos"); setTimeout(()=>setEditingEntry({cat,id}),100); }}/>}
      </div>
      <FlexBudgetModal
        open={showFlex} onClose={()=>setShowFlex(false)}
        month={month} monthKey={monthKey}
        onUpdate={(key,updater)=>{ onUpdate(key,updater); markDirty(); }}
        showToast={showToast}/>
    </div>
  );
}

// ── HomeScreen ────────────────────────────────
function HomeScreen({ months, onOpenMonth, showToast, connected=false }: { months:Record<string,Month>; onOpenMonth:(k:string)=>void; showToast:(m:string,t:"ok"|"err"|"info")=>void; connected?:boolean }) {
  const keys = Object.keys(months).sort().reverse();
  const curMo = curKey();

  // Global stats
  const totalMeses   = keys.length;
  const totalGastado = keys.reduce((s,k)=>s+totalSpentMonth(months[k]),0);
  const curMonth     = months[curMo];
  const curIncome    = curMonth ? totalIncomeMonth(curMonth) : 0;
  const curSpent     = curMonth ? totalSpentMonth(curMonth) : 0;
  const curPct       = curIncome>0 ? Math.min((curSpent/curIncome)*100,100) : 0;

  return (
    <div style={{overflowY:"auto",flex:1,background:T.bg}}>

      {/* ── HERO HEADER ── */}
      <div style={{
        background:"linear-gradient(160deg,#0d0d0d 0%,#1a0a0f 60%,#0d0d0d 100%)",
        padding:"calc(env(safe-area-inset-top,0px) + 24px) 20px 28px",
        position:"relative",overflow:"hidden"
      }}>
        {/* Decorative glow */}
        <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(233,69,96,.12) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-20,left:-20,width:120,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(74,144,217,.08) 0%,transparent 70%)",pointerEvents:"none"}}/>

        {/* Top row — solo branding, sin botones */}
        <div style={{marginBottom:20,position:"relative"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            {/* Logo mark */}
            <div style={{
              width:36,height:36,borderRadius:10,flexShrink:0,
              background:"linear-gradient(135deg,#e94560,#c23050)",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 2px 12px rgba(233,69,96,.4)"
            }}>
              <span style={{fontSize:18,fontWeight:900,color:"#fff",lineHeight:1}}>$</span>
            </div>
            <div>
              <div style={{fontSize:11,letterSpacing:4,color:"rgba(233,69,96,.7)",textTransform:"uppercase",fontWeight:600}}>Mis Finanzas</div>
              <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,lineHeight:1.1}}>
                Gastos <span style={{color:T.red}}>70/30</span>
              </div>
            </div>
          </div>
          {/* Greeting line */}
          <div style={{fontSize:12,color:T.t3,paddingLeft:46}}>
            {keys.length>0
              ? `${keys.length} mes${keys.length!==1?"es":""} registrados`
              : "Bienvenido — agrega tu primer gasto"}
          </div>
        </div>

        {/* Current month hero card */}
        {curMonth ? (
          <div onClick={()=>onOpenMonth(curMo)} style={{
            background:"rgba(255,255,255,.04)",
            border:"1px solid rgba(233,69,96,.2)",
            borderRadius:20,padding:"16px 18px",cursor:"pointer",
            backdropFilter:"blur(10px)",
            WebkitTapHighlightColor:"transparent"
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <div style={{fontSize:10,color:T.t3,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>Mes actual</div>
                <div style={{fontSize:18,fontWeight:800,textTransform:"capitalize"}}>{monName(curMo)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.t3,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Ingreso</div>
                <div style={{fontSize:16,fontWeight:800}}>{fmts(curIncome)}</div>
              </div>
            </div>

            {/* Big spent number */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:6}}>
                <div>
                  <div style={{fontSize:10,color:T.t3,marginBottom:3}}>Gastado</div>
                  <div style={{fontSize:28,fontWeight:900,color:curPct>=100?T.red:curPct>=80?T.yellow:T.t,lineHeight:1}}>{fmts(curSpent)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:T.t3,marginBottom:3}}>Disponible</div>
                  <div style={{fontSize:20,fontWeight:800,color:curSpent>curIncome?T.red:T.green}}>{fmts(Math.max(0,curIncome-curSpent))}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{height:6,background:"rgba(255,255,255,.06)",borderRadius:6,overflow:"hidden"}}>
                <div style={{
                  height:"100%",borderRadius:6,
                  width:`${curPct}%`,
                  background:curPct>=100?"linear-gradient(90deg,#5a1020,#e94560)":curPct>=80?"linear-gradient(90deg,#3a2800,#f5a623)":"linear-gradient(90deg,#1e3a5f,#4a90d9)",
                  transition:"width .6s ease",
                  boxShadow:curPct>=80?"0 0 8px rgba(233,69,96,.4)":"0 0 8px rgba(74,144,217,.3)"
                }}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:9,color:T.t3}}>
                <span>{curPct.toFixed(1)}% usado</span>
                <span>{CK.reduce((s,c)=>s+(curMonth.entries[c as CatKey]||[]).length,0)} gastos</span>
              </div>
            </div>

            {/* Mini cat breakdown */}
            <div style={{display:"flex",gap:4}}>
              {CK.map(c=>{
                const s=(curMonth.entries[c as CatKey]||[]).reduce((x,e)=>x+(e.amt>0?e.amt:0),0);
                const b=curIncome*CATS[c as CatKey].pct;
                const p=b>0?Math.min((s/b)*100,100):0;
                return (
                  <div key={c} title={CATS[c as CatKey].label} style={{flex:1}}>
                    <div style={{height:3,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:3,width:`${p}%`,background:CATS[c as CatKey].color,transition:"width .5s ease"}}/>
                    </div>
                    <div style={{fontSize:8,color:T.t3,textAlign:"center",marginTop:3}}>{CATS[c as CatKey].icon}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{background:"rgba(255,255,255,.04)",border:"1px dashed rgba(233,69,96,.3)",borderRadius:20,padding:"20px 18px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:8}}>📊</div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Sin mes activo</div>
            <div style={{fontSize:12,color:T.t3}}>Crea tu primer mes para comenzar</div>
          </div>
        )}
      </div>

      {/* ── QUICK STATS ── */}
      {keys.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"14px 16px 0"}}>
          {[
            ["Meses",    totalMeses,          "📅", T.blue],
            ["Total",    fmts(totalGastado),  "💸", T.red],
            ["Activo",   connected?"☁️":"📵", connected?"Nube":"Local", connected?T.green:T.t3],
          ].map(([l,v,ico,c])=>(
            <div key={l} style={{background:T.bg2,border:`1px solid ${T.b}`,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:4}}>{typeof ico==="string"&&ico.length<=2?ico:''}</div>
              <div style={{fontSize:13,fontWeight:800,color:c,marginBottom:2}}>{typeof v==="number"?v:v}</div>
              <div style={{fontSize:9,color:T.t3,textTransform:"uppercase",letterSpacing:1}}>{l}</div>
            </div>
          ))}
        </div>
      )}



      {/* ── MONTH LIST ── */}
      <div style={{padding:"4px 16px 24px"}}>
        {keys.length>1 && (
          <div style={{fontSize:10,letterSpacing:3,color:T.t3,textTransform:"uppercase",margin:"8px 0 10px"}}>
            Historial
          </div>
        )}
        {keys.filter(k=>k!==curMo).map(k=>{
          const m=months[k];
          const spent=totalSpentMonth(m);
          const inc=totalIncomeMonth(m);
          const pct=inc>0?Math.min((spent/inc)*100,100):0;
          const barCol=pct<70?"linear-gradient(90deg,#1e3a5f,#4a90d9)":pct<100?"linear-gradient(90deg,#3a2800,#f5a623)":"linear-gradient(90deg,#5a1020,#e94560)";
          const n=CK.reduce((s,c)=>s+(m.entries[c as CatKey]||[]).length,0);
          const tagCounts={};
          CK.forEach(c=>(m.entries[c as CatKey]||[]).forEach(e=>{ if(e.tag) tagCounts[e.tag]=(tagCounts[e.tag]||0)+1; }));
          const tags=Object.entries(tagCounts);
          return (
            <div key={k} onClick={()=>onOpenMonth(k)} className="btn-press" style={{
              background:T.bg2,borderRadius:16,padding:"14px 16px",marginBottom:8,cursor:"pointer",
              border:`1px solid ${T.b}`,WebkitTapHighlightColor:"transparent"
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{
                    width:36,height:36,borderRadius:10,
                    background:"rgba(255,255,255,.04)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:14,fontWeight:800,color:T.t3
                  }}>{k.split("-")[1]}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,textTransform:"capitalize"}}>{monName(k)}</div>
                    <div style={{fontSize:10,color:T.t3,marginTop:1}}>Ingresos: {fmts(inc)}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,fontWeight:800,color:spent>inc?T.red:T.t}}>{fmts(spent)}</div>
                  <div style={{fontSize:10,color:spent>inc?T.red:T.green,marginTop:1}}>
                    {spent>inc?"−":"+"}{fmts(Math.abs(inc-spent))}
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div style={{height:3,background:T.bg4,borderRadius:3,overflow:"hidden",marginBottom:8}}>
                <div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:barCol,transition:"width .5s ease"}}/>
              </div>

              {/* Bottom row */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:10,color:T.t3}}>{n} gasto{n!==1?"s":""} · {pct.toFixed(0)}%</div>
                <div style={{display:"flex",gap:4}}>
                  {tags.map(([k,count])=>(
                    <span key={k} style={{background:TAGS[k as TagKey]?.color,color:TAGS[k as TagKey]?.text,borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:700}}>
                      {TAGS[k as TagKey]?.emoji} {count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── ConnectScreen ─────────────────────────────
function ConnectScreen({ dbx, connected, onBack, onStartOAuth, onExchangeCode, onDisconnect, onLoadCloud, cloudData, onApplyCloud, onHideCloud, loading }: { dbx:DbxState; connected:boolean; onBack:()=>void; onStartOAuth:(key:string)=>void; onExchangeCode:(code:string)=>Promise<boolean>; onDisconnect:()=>void; onLoadCloud:()=>void; cloudData:CloudData|null; onApplyCloud:()=>void; onHideCloud:()=>void; loading:boolean }) {
  const [code,    setCode]    = useState("");
  const [step,    setStep]    = useState<"auth"|"code">("auth");
  const [working, setWorking] = useState(false);

  const handleExchange = async () => {
    if(!code.trim()) return;
    setWorking(true);
    const ok = await onExchangeCode(code.trim());
    setWorking(false);
    if(ok){
      setCode(""); setStep("auth");
      // Sync automático tras conectar para restaurar datos
      await onLoadCloud();
      onBack();
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <TopBar title="Conectar Dropbox" onBack={onBack}/>
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px 20px"}}>
        <p style={{fontSize:12,color:T.t3,lineHeight:1.7,marginBottom:16}}>Conexión permanente — funciona en cualquier dominio.</p>
        {!connected ? (
          <Card style={{border:`1px solid #0d2a4a`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <span style={{fontSize:28}}>☁️</span>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>Sincronizar con Dropbox</div>
                <div style={{fontSize:11,color:T.t3,marginTop:2}}>Solo necesitas autorizar una vez</div>
              </div>
            </div>
            {/* Paso 1 */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                background:step==="code"?T.green:T.blue,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>
                {step==="code"?"✓":"1"}
              </div>
              <div style={{fontSize:13,fontWeight:600}}>Autorizar en Dropbox</div>
            </div>
            <button onClick={()=>{onStartOAuth(""); setStep("code");}}
              style={{width:"100%",background:step==="code"?"rgba(46,204,113,.1)":T.blue,
                border:`1px solid ${step==="code"?"rgba(46,204,113,.3)":"transparent"}`,
                borderRadius:12,padding:13,fontSize:13,fontWeight:700,
                color:step==="code"?T.green:"#fff",cursor:"pointer",marginBottom:16}}>
              {step==="code"?"✓ Dropbox abierto — busca el código":"Abrir Dropbox →"}
            </button>
            {/* Paso 2 */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                background:step==="code"?T.blue:T.t4,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>2</div>
              <div style={{fontSize:13,fontWeight:600,color:step==="code"?T.t:T.t3}}>Pega el código que muestra Dropbox</div>
            </div>
            <input value={code} onChange={e=>setCode(e.target.value)}
              placeholder="Pega el código aquí…"
              onKeyDown={e=>e.key==="Enter"&&handleExchange()}
              style={{width:"100%",background:T.bg3,
                border:`1px solid ${step==="code"?"rgba(74,144,217,.4)":T.b2}`,
                borderRadius:12,padding:"12px 14px",fontSize:14,color:T.t,
                outline:"none",fontFamily:"monospace",marginBottom:10,
                opacity:step==="auth"?.4:1}}/>
            <button onClick={handleExchange} disabled={!code.trim()||working||step==="auth"}
              style={{width:"100%",
                background:code.trim()&&!working&&step==="code"?T.green:"rgba(42,42,42,.5)",
                border:"none",borderRadius:12,padding:13,fontSize:13,fontWeight:700,
                color:code.trim()&&!working&&step==="code"?"#000":T.t3,
                cursor:code.trim()&&!working&&step==="code"?"pointer":"default"}}>
              {working?"Conectando…":"Conectar →"}
            </button>
          </Card>
        ) : (
          <Card style={{border:"1px solid rgba(46,204,113,.25)",background:"#0a1a10"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:24}}>✅</span>
              <div><div style={{fontSize:14,fontWeight:700,color:T.green}}>Conectado</div><div style={{fontSize:11,color:T.t3,marginTop:2}}>{dbx.em}</div></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={onLoadCloud} style={{flex:1,background:"#0d1e33",border:"none",borderRadius:10,padding:9,fontSize:12,fontWeight:600,color:T.blue,cursor:"pointer"}}>⬇️ Cargar datos</button>
              <button onClick={onDisconnect} style={{flex:1,background:T.bg3,border:"none",borderRadius:10,padding:9,fontSize:12,fontWeight:600,color:T.t3,cursor:"pointer"}}>Desconectar</button>
            </div>
          </Card>
        )}
        {cloudData && (
          <div style={{background:"#0a1a10",border:"1px solid rgba(46,204,113,.25)",borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:3,color:T.green,textTransform:"uppercase",marginBottom:10}}>☁️ DATOS EN DROPBOX</div>
            <div style={{fontSize:12,color:T.t2,lineHeight:1.8,marginBottom:12}}>
              <strong style={{color:T.t,fontSize:18,display:"block"}}>{cloudData.months} mes{cloudData.months!==1?"es":""}</strong>
              {cloudData.total} gastos registrados
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={onApplyCloud} style={{background:T.green,border:"none",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:700,color:"#000",cursor:"pointer"}}>Cargar todos →</button>
              <button onClick={onHideCloud}  style={{background:"none",border:`1px solid ${T.b2}`,borderRadius:10,padding:"9px 12px",fontSize:12,color:T.t3,cursor:"pointer"}}>Cerrar</button>
            </div>
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0"}}>
          <div style={{flex:1,height:1,background:T.b}}/>
          <span style={{fontSize:10,color:T.t4,letterSpacing:2,whiteSpace:"nowrap"}}>IMPORTAR ARCHIVO</span>
          <div style={{flex:1,height:1,background:T.b}}/>
        </div>
        <label style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:T.bg2,border:`1px dashed ${T.b2}`,borderRadius:13,padding:12,fontSize:12,color:T.t3,cursor:"pointer"}}>
          📁 Cargar archivo .json
          <input type="file" style={{display:"none"}} accept=".json"/>
        </label>
      </div>
    </div>
  );
}

// ── RecurringScreen ───────────────────────────
function RecurringScreen({ recurring, setRecurring, onBack, showToast }: { recurring:Recurring[]; setRecurring:React.Dispatch<React.SetStateAction<Recurring[]>>; onBack:()=>void; showToast:(m:string,t:'ok'|'err'|'info')=>void }) {
  const [desc,  setDesc]  = useState("");
  const [amt,   setAmt]   = useState("");
  const [cat,   setCat]   = useState("comida");
  const [type,  setType]  = useState("monthly");
  const [day,   setDay]   = useState(1);

  const add = () => {
    if (!desc.trim()||!parseFloat(amt)||parseFloat(amt)<=0) return;
    setRecurring(r=>[...r,{id:Date.now(),desc:desc.trim(),amt:parseFloat(amt),cat:cat as CatKey,type:type as 'monthly'|'weekly',day:typeof day==='string'?parseInt(day):day,active:true}]);
    setDesc(""); setAmt("");
    showToast("🔄 Recurrente agregado","ok");
  };

  const toggle = id => setRecurring(r=>r.map(x=>x.id===id?{...x,active:!x.active}:x));
  const remove = id => { if(confirm("¿Eliminar este recurrente?")) setRecurring(r=>r.filter(x=>x.id!==id)); };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <TopBar title="Gastos Recurrentes" onBack={onBack}/>
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 20px"}}>
        <p style={{fontSize:12,color:T.t3,lineHeight:1.7,marginBottom:16}}>
          Se agregan automáticamente al crear un mes nuevo. Puedes activarlos o desactivarlos.
        </p>

        {/* Add form */}
        <Card>
          <div style={{fontSize:10,letterSpacing:3,color:T.blue,textTransform:"uppercase",marginBottom:12}}>Nuevo recurrente</div>
          <div style={{marginBottom:10}}>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="ej: Arriendo, Netflix, Gym…"
              style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 12px",fontSize:13,color:T.t,outline:"none",marginBottom:8}}/>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{position:"relative",flex:1}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:T.red,pointerEvents:"none"}}>$</span>
                <input value={amt} onChange={e=>setAmt(e.target.value)} type="number" placeholder="0.00" inputMode="decimal"
                  style={{width:"100%",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 10px 10px 26px",fontSize:14,fontWeight:700,color:T.t,outline:"none"}}/>
              </div>
              <select value={type} onChange={e=>setType(e.target.value)}
                style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 12px",fontSize:12,color:T.t2,outline:"none",flexShrink:0}}>
                <option value="monthly">Mensual</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            {type==="monthly" && (
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontSize:11,color:T.t3}}>Día del mes:</span>
                <input value={day} onChange={e=>setDay(e.target.value)} type="number" min="1" max="31"
                  style={{width:60,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"6px 10px",fontSize:13,fontWeight:700,color:T.t,outline:"none",textAlign:"center"}}/>
              </div>
            )}
          </div>
          <div style={{fontSize:10,letterSpacing:2,color:T.t3,textTransform:"uppercase",marginBottom:8}}>Categoría</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
            {CK.map(c=>(
              <div key={c} onClick={()=>setCat(c)} style={{
                background:cat===c?"#1a0a0a":T.bg3,border:`1px solid ${cat===c?T.red:T.b2}`,
                borderRadius:10,padding:"8px 4px",textAlign:"center",cursor:"pointer",transition:"all .15s"
              }}>
                <div style={{fontSize:18}}>{CATS[c as CatKey].icon}</div>
                <div style={{fontSize:9,color:cat===c?T.red:T.t3,marginTop:2}}>{CATS[c as CatKey].label}</div>
              </div>
            ))}
          </div>
          <button onClick={add} style={{width:"100%",background:T.blue,border:"none",borderRadius:12,padding:12,fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer"}}>
            + Agregar recurrente
          </button>
        </Card>

        {/* List */}
        {recurring.length>0 && (
          <Card>
            <div style={{fontSize:10,letterSpacing:3,color:T.t3,textTransform:"uppercase",marginBottom:12}}>
              {recurring.length} recurrente{recurring.length!==1?"s":""}
            </div>
            {recurring.map((r,i)=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:i<recurring.length-1?`1px solid ${T.b}`:"none",opacity:r.active?1:.45}}>
                <div style={{fontSize:22,flexShrink:0}}>{CATS[r.cat].icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</div>
                  <div style={{fontSize:10,color:T.t3,marginTop:2}}>
                    {fmt(r.amt)} · {r.type==="monthly"?`Día ${r.day} de cada mes`:"Semanal"} · {CATS[r.cat].label}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>toggle(r.id)} style={{background:r.active?"rgba(46,204,113,.12)":"rgba(42,42,42,.5)",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:r.active?T.green:T.t3,cursor:"pointer",fontWeight:700}}>
                    {r.active?"✓ ON":"OFF"}
                  </button>
                  <button onClick={()=>remove(r.id)} style={{background:"rgba(233,69,96,.1)",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.red,cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            ))}
          </Card>
        )}

        {recurring.length===0 && (
          <div style={{textAlign:"center",padding:"32px 0",color:T.t4,fontSize:13,lineHeight:1.7}}>
            Sin recurrentes aún.<br/>Agrega arriendo, Netflix, servicios…
          </div>
        )}
      </div>
    </div>
  );
}

// ── SettingsScreen ────────────────────────────
function SettingsScreen({ connected, userEmail, autosave, onToggleAutosave, onBack, onSaveCloud, onExportLocal, onImport, onDeleteMonth, currentMonthKey, showToast, onGoConnect, onGoRecurring, alertPct, onChangeAlertPct }: { connected:boolean; userEmail:string|null; autosave:boolean; onToggleAutosave:()=>void; onBack:()=>void; onSaveCloud:()=>void; onExportLocal:()=>void; onImport:(e:React.ChangeEvent<HTMLInputElement>)=>void; onDeleteMonth:()=>void; currentMonthKey:string|null; showToast:(m:string,t:'ok'|'err'|'info')=>void; onGoConnect:()=>void; onGoRecurring:()=>void; alertPct:number; onChangeAlertPct:(v:number)=>void }) {
  const rows = [
    {section:"☁️ DROPBOX", items:[
      {label:"Estado",sub:connected?(userEmail||"Conectado"):"No conectado",btn:()=>onGoConnect() as unknown,btnLbl:"Gestionar"},
      {label:"Auto-guardado",sub:autosave?"Activo — guarda 4s tras cada cambio":"Desactivado",btn:onToggleAutosave,btnLbl:autosave?"✓ Activo":"Activar",primary:autosave},
      {label:"Guardar ahora",sub:"Sube el mes actual a Dropbox",btn:onSaveCloud,btnLbl:"Guardar",blue:true},
    ]},
    {section:"💾 ARCHIVOS", items:[
      {label:"Exportar mes",sub:"Descarga .json local",btn:onExportLocal,btnLbl:"Exportar",primary:true},
      {label:"Importar archivo",sub:"Carga un .json guardado",btn:null,btnLbl:"Importar",upload:true},
    ]},
    {section:"⚙️ MES ACTUAL", items:[
      {label:"Eliminar mes",sub:currentMonthKey?"Mes: "+monName(currentMonthKey||''):"Sin mes abierto",btn:onDeleteMonth,btnLbl:"Eliminar",danger:true},
    ]},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <TopBar title="Ajustes" onBack={onBack}/>
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 20px"}}>
        {rows.map(({section,items})=>(
          <div key={section}>
            <div style={{fontSize:9,letterSpacing:3,textTransform:"uppercase",color:T.t3,margin:"16px 0 8px"}}>{section}</div>
            <Card>
              {items.map(({label,sub,btn,btnLbl,primary,blue,danger,upload},i)=>(
                <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:i===0?"13px 0 13px":"13px 0",borderBottom:i<items.length-1?`1px solid ${T.b}`:"none"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:danger?T.red:T.t}}>{label}</div>
                    <div style={{fontSize:11,color:T.t3,marginTop:3}}>{sub}</div>
                  </div>
                  {upload
                    ? <label style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:"7px 13px",fontSize:12,color:T.t2,cursor:"pointer",whiteSpace:"nowrap"}}>
                        {btnLbl}<input type="file" style={{display:"none"}} accept=".json" onChange={onImport}/>
                      </label>
                    : <button onClick={btn} style={{background:primary?T.red:blue?"#0d1e33":T.bg3,border:`1px solid ${primary?T.red:blue?"rgba(74,144,217,.4)":danger?"rgba(233,69,96,.3)":T.b2}`,borderRadius:10,padding:"7px 13px",fontSize:12,color:primary?"#fff":blue?T.blue:danger?T.red:T.t2,cursor:"pointer",whiteSpace:"nowrap",fontWeight:primary?700:400}}>
                        {btnLbl}
                      </button>
                  }
                </div>
              ))}
            </Card>
          </div>
        ))}
        {/* Gastos Recurrentes */}
        <div style={{fontSize:9,letterSpacing:3,textTransform:"uppercase",color:T.t3,margin:"16px 0 8px"}}>🔄 GASTOS RECURRENTES</div>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0"}}>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>Gestionar recurrentes</div>
              <div style={{fontSize:11,color:T.t3,marginTop:3}}>Se agregan automáticamente al crear un mes</div>
            </div>
            <button onClick={onGoRecurring} style={{background:"#0d1e33",border:"1px solid rgba(74,144,217,.4)",borderRadius:10,padding:"7px 13px",fontSize:12,color:T.blue,cursor:"pointer",fontWeight:700}}>
              Gestionar
            </button>
          </div>
        </Card>

        {/* Alertas */}
        <div style={{fontSize:9,letterSpacing:3,textTransform:"uppercase",color:T.t3,margin:"16px 0 8px"}}>🔔 ALERTAS DE PRESUPUESTO</div>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0"}}>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>Alertar al llegar al</div>
              <div style={{fontSize:11,color:T.t3,marginTop:3}}>Avisa cuando una categoría supera este %</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>onChangeAlertPct(Math.max(50,alertPct-10))} style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 10px",fontSize:14,color:T.t2,cursor:"pointer"}}>−</button>
              <span style={{fontSize:16,fontWeight:800,color:T.yellow,minWidth:40,textAlign:"center"}}>{alertPct}%</span>
              <button onClick={()=>onChangeAlertPct(Math.min(100,alertPct+10))} style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:8,padding:"5px 10px",fontSize:14,color:T.t2,cursor:"pointer"}}>+</button>
            </div>
          </div>
        </Card>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:T.t4,lineHeight:1.7}}>Gastos 70/30 · v9.0<br/>Ingresos variables · Trading P&amp;L · OAuth permanente</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  APP (Main Router)
// ══════════════════════════════════════════════
function AppInner() {
  const { toast, show: showToast, dismiss } = useToast();
  const { dbx, getToken, startOAuth, exchangeCode, disconnect, connected } = useDropbox(showToast);

  const [months,       setMonths]       = useState<Record<string,Month>>(loadLocal);
  const [currentKey,   setCurrentKey]   = useState<string|null>(()=>{
    // Restaurar el mes que tenía abierto antes del reload
    const saved = sessionStorage.getItem("cur_key");
    const local = loadLocal();
    return (saved && local[saved]) ? saved : null;
  });
  const [screen,       setScreen]       = useState<string>(()=>{
    // Siempre arrancar en home — evita pantalla negra si mes no carga
    return "home";
  });
  const [screenStack,  setScreenStack]  = useState<string[]>(["home"]);
  const [showNewMonth, setShowNewMonth] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [autosave,     setAutosave]     = useState(()=>localStorage.getItem(LS.AS)==="1");
  const [cloudData,    setCloudData]    = useState<CloudData|null>(null);
  const [loading,      setLoading]      = useState(false);
  const [recurring,    setRecurring]    = useState<Recurring[]>(()=>{ try{ return JSON.parse(localStorage.getItem(LS.REC)||"[]"); }catch{ return []; } });
  const [alertPct,     setAlertPct]     = useState<number>(()=>parseInt(localStorage.getItem(LS.ALRT)||"80"));
  const [showRecurring,setShowRecurring]= useState(false);
  const [pendingRecurring,setPendingRecurring] = useState<number|null>(null);
  const [goals, setGoals] = useState<Goal[]>(()=>{ try{ return JSON.parse(localStorage.getItem(LS.GOALS)||"[]"); }catch{ return []; } });

  // Persist months
  useEffect(()=>saveLocal(months), [months]);
  // Si estamos en month pero el mes ya no existe, volver a home sin parpadeo
  useEffect(()=>{
    if(screen==="month" && currentKey && !months[currentKey]){
      setScreenStack(["home"]);
      setScreen("home");
    }
  },[screen, currentKey, months]);
  // Persistir currentKey para recordar último mes abierto
  useEffect(()=>{ if(currentKey) sessionStorage.setItem("cur_key",currentKey); else sessionStorage.removeItem("cur_key"); },[currentKey]);
  // Guarda recurring en localStorage — leer goals fresh para evitar stale closure
  useEffect(()=>{
    if(!recurring) return;
    localStorage.setItem(LS.REC,JSON.stringify(recurring));
    if(connected){
      const t=setTimeout(async()=>{
        try{
          const token=await getToken();
          const freshGoals=JSON.parse(localStorage.getItem(LS.GOALS)||"[]");
          await saveSettingsCloud(token,recurring,freshGoals);
        }catch{}
      },3000);
      return ()=>clearTimeout(t);
    }
  },[recurring,connected]);

  // Guarda goals en localStorage — leer recurring fresh para evitar stale closure
  useEffect(()=>{
    if(!goals) return;
    localStorage.setItem(LS.GOALS,JSON.stringify(goals));
    if(connected){
      const t=setTimeout(async()=>{
        try{
          const token=await getToken();
          const freshRec=JSON.parse(localStorage.getItem(LS.REC)||"[]");
          await saveSettingsCloud(token,freshRec,goals);
        }catch{}
      },3000);
      return ()=>clearTimeout(t);
    }
  },[goals,connected]);

  useEffect(()=>localStorage.setItem(LS.ALRT,alertPct),[alertPct]);

  // Handle OAuth callback on load + auto-sync
  useEffect(()=>{
    if(location.search.includes("code=")){
      history.replaceState({},"",location.pathname);
    } else {
      if(location.hash) history.replaceState({},"",location.pathname);
      if(dbx.ref){
        syncCloud(true)
          .then(()=>showToast("☁️ Datos sincronizados","ok"))
          .catch(()=>{});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Bug fix: cuando connected cambia a true (nueva conexión en la misma sesión),
  // sincronizar para restaurar goals y recurrentes de la nube
  const prevConnectedRef = useRef(false);
  useEffect(()=>{
    if(connected && !prevConnectedRef.current){
      // acaba de conectarse en esta sesión
      syncCloud(true)
        .then(()=>showToast("☁️ Datos restaurados desde Dropbox","ok"))
        .catch(()=>{});
    }
    prevConnectedRef.current = connected;
  },[connected]);

  // Navigation helpers
  // ── NAVIGATION — solo estado React, sin browser history ────────────────────
  const goScreen = useCallback((id)=>{
    setScreenStack(s=>[...s,id]);
    setScreen(id);
  },[]);

  const goBack = useCallback(()=>{
    setScreenStack(s=>{
      if(s.length<=1) return s;
      const next=[...s]; next.pop();
      setScreen(next[next.length-1]);
      return next;
    });
  },[]);

  const goHome = useCallback(()=>{
    setScreenStack(["home"]);
    setScreen("home");
  },[]);

  // Month operations
  const updateMonth = useCallback((key: string, updater: (m:Month)=>Month)=>{
    if(!key) return;
    setMonths(m=>({
      ...m,
      [key]: updater(m[key] || { income:0, incomes:[], entries:emptyEntries(), savedAt:null })
    }));
  },[]);

  const createMonth = useCallback((key: string)=>{
    setMonths(m=>{
      if (m[key]&&!confirm("Ya existe "+monName(key)+". ¿Reemplazar?")) return m;
      const ent = emptyEntries();
      const [y,mo] = key.split("-").map(Number);
      const dayOfMonth = (d: number) => new Date(y,mo-1,d).toISOString().split("T")[0];
      recurring.forEach(r=>{
        if(!r.active) return;
        const entryDate = r.type==="monthly"
          ? dayOfMonth(Math.min(r.day||1, new Date(y,mo,0).getDate()))
          : today();
        ent[r.cat].push({id:Date.now()+Math.random(),date:entryDate,desc:r.desc,amt:r.amt,fromRecurring:true});
      });
      if(recurring.filter(r=>r.active).length > 0)
        setPendingRecurring(recurring.filter(r=>r.active).length);
      return {...m,[key]:{income:0, incomes:[], entries:ent, savedAt:null}};
    });
    setCurrentKey(key);
    goScreen("month");
  },[goScreen,recurring]);

  const importFile = useCallback((e: React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const d=JSON.parse(ev.target?.result as string);
        if(!d.entries){showToast("Archivo no válido","err");return;}
        const key=d.month||curKey();
        const ent={...d.entries}; CK.forEach(c=>{if(!ent[c]) ent[c]=[];});
        // v8 compat: si no tiene incomes pero tiene income, crear ingreso sintético
        const incomes: Income[] = d.incomes || (d.income>0
          ? [{id:Date.now(),date:key+"-01",desc:"Ingreso base (importado)",amt:d.income,source:"otro" as IncomeSource}]
          : []);
        setMonths(m=>({...m,[key]:{income:d.income||0,incomes,entries:ent,savedAt:d.savedAt||null}}));
        showToast("📂 "+monName(key)+" importado","ok");
      }catch{showToast("Archivo no válido","err");}
    };
    r.readAsText(file); e.target.value="";
  },[showToast]);

  // Cloud sync
  // Sube recurring + goals a Dropbox como archivo de settings
  const saveSettingsCloud = useCallback(async(token, rec, gls)=>{
    try{
      const data={recurring:rec,goals:gls,savedAt:new Date().toISOString()};
      await fetch("https://content.dropboxapi.com/2/files/upload",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/octet-stream",
          "Dropbox-API-Arg":JSON.stringify({path:"/gastos7030/_settings.json",mode:"overwrite",mute:true})},
        body:JSON.stringify(data)
      });
    }catch{}
  },[]);

  const syncCloud = useCallback(async(silent=false)=>{
    try{
    const ref = localStorage.getItem(LS.REF);
    const ak  = localStorage.getItem(LS.AK);
    if(!ref||!ak) return;
    let token;
    try{
      const ac = JSON.parse(localStorage.getItem(LS.AC)||'null');
      if(ac && Date.now() < ac.e - 60000){
        token = ac.t;
      } else {
        const r=await fetch("https://api.dropbox.com/oauth2/token",{
          method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
          body:new URLSearchParams({grant_type:"refresh_token",refresh_token:ref,client_id:ak})
        });
        const d=await r.json();
        if(!r.ok||!d.access_token) throw new Error("No se pudo refrescar token");
        token=d.access_token;
        localStorage.setItem(LS.AC,JSON.stringify({t:token,e:Date.now()+(d.expires_in||14400)*1000}));
      }
    }catch(e){ throw e; }

    const r=await fetch("https://api.dropboxapi.com/2/files/list_folder",{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({path:"/gastos7030"})
    });
    if(!r.ok){
      if(r.status===409) return;
      throw new Error("list_folder: "+r.status);
    }
    const d=await r.json();
    const files=(d.entries||[]).filter(e=>e.name.endsWith(".json"));
    if(!files.length) return;

    const newMonths={};
    let total=0;
    for(const f of files){
      try{
        const r2=await fetch("https://content.dropboxapi.com/2/files/download",{
          method:"POST",
          headers:{"Authorization":"Bearer "+token,"Dropbox-API-Arg":JSON.stringify({path:f.path_lower})}
        });
        if(r2.ok){
          const md=await r2.json();
          // Archivo de settings — restaurar recurring y goals
          // Estrategia: fusión por id en ambas direcciones
          if(f.name==="_settings.json"){
            if(md.recurring&&Array.isArray(md.recurring)&&md.recurring.length>0){
              const localRec = JSON.parse(localStorage.getItem(LS.REC)||"[]");
              // Fusión: local tiene prioridad para items existentes, nube aporta los que faltan
              const localIds = new Set(localRec.map((r:Recurring)=>r.id));
              const merged = [...localRec, ...md.recurring.filter((r:Recurring)=>!localIds.has(r.id))];
              if(merged.length !== localRec.length || localRec.length===0){
                setRecurring(merged);
                localStorage.setItem(LS.REC,JSON.stringify(merged));
              }
            }
            if(md.goals&&Array.isArray(md.goals)&&md.goals.length>0){
              const localGoals = JSON.parse(localStorage.getItem(LS.GOALS)||"[]");
              const localIds = new Set(localGoals.map((g:Goal)=>g.id));
              const merged = [...localGoals, ...md.goals.filter((g:Goal)=>!localIds.has(g.id))];
              if(merged.length !== localGoals.length || localGoals.length===0){
                setGoals(merged);
                localStorage.setItem(LS.GOALS,JSON.stringify(merged));
              }
            }
            continue;
          }
          // Archivo de mes normal
          if(md.month&&md.entries){
            const ent={...md.entries};
            CK.forEach(c=>{if(!ent[c]) ent[c]=[];});
            // v8 compat: si no tiene incomes pero tiene income, crear ingreso sintético
            const incomes: Income[] = md.incomes || (md.income>0
              ? [{id:Date.now(),date:md.month+"-01",desc:"Ingreso base (importado)",amt:md.income,source:"otro" as IncomeSource}]
              : []);
            newMonths[md.month]={income:md.income||0,incomes,entries:ent,savedAt:md.savedAt,customPct:md.customPct};
            total+=CK.reduce((s,c)=>s+(ent[c]||[]).length,0);
          }
        }
      }catch{}
    }

    if(Object.keys(newMonths).length>0){
      setMonths(local=>({...local,...newMonths}));
      if(!silent) setCloudData({months:Object.keys(newMonths).length,total});
    }
    }catch(e){ console.error("syncCloud error:",e); throw e; }
  },[]);

  const handleLoadCloud = useCallback(async()=>{
    setLoading(true);
    showToast("⏳ Cargando de Dropbox…","info");
    try{
      await syncCloud(false);
      showToast("☁️ Datos cargados","ok");
    }catch(e){
      showToast("Error al cargar: "+e.message,"err");
    } finally {
      setLoading(false);
    }
  },[syncCloud,showToast]);

  // Quick add
  const quickAdd = useCallback((entry)=>{
    const key = curKey();
    if(!months[key]){
      // Mes no existe — crear sin income fijo, agregar el gasto
      const ent = emptyEntries();
      const [y,mo] = key.split("-").map(Number);
      recurring.forEach(r=>{
        if(!r.active) return;
        const d = r.type==="monthly"
          ? new Date(y,mo-1,Math.min(r.day||1,new Date(y,mo,0).getDate())).toISOString().split("T")[0]
          : today();
        ent[r.cat].push({id:Date.now()+Math.random(),date:d,desc:r.desc,amt:r.amt,fromRecurring:true});
      });
      ent[entry.cat].push({id:Date.now(),...entry});
      setMonths(m=>({...m,[key]:{income:0,incomes:[],entries:ent,savedAt:null}}));
      setCurrentKey(key);
      const recCount = recurring.filter(r=>r.active).length;
      showToast(`✅ ${monName(key)} creado${recCount>0?` · ${recCount} recurrentes aplicados`:""}`, "ok");
      return;
    }
    setCurrentKey(key);
    updateMonth(key,m=>({...m,entries:{...m.entries,[entry.cat]:[...(m.entries[entry.cat]||[]),{id:Date.now(),...entry}]}}));
    showToast(`${CATS[entry.cat].icon} Agregado en ${CATS[entry.cat].label}`,"ok");
  },[currentKey,months,updateMonth,showToast,recurring]);

  // serialize helper reutilizable en AppInner
  const serializeMonthGlobal = useCallback((key: string, m: Month) => ({
    version: 9,
    month:   key,
    income:  m.income,
    incomes: m.incomes || [],
    savedAt: new Date().toISOString(),
    entries: m.entries,
  }),[]);

  const exportLocal = useCallback(()=>{
    if(!currentKey||!months[currentKey]){showToast("Abre un mes primero","info");return;}
    const data = serializeMonthGlobal(currentKey, months[currentKey]);
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`gastos-${currentKey}.json`;a.click();
    URL.revokeObjectURL(url); showToast("📥 Archivo descargado","ok");
  },[currentKey,months,serializeMonthGlobal,showToast]);

  const saveCloud = useCallback(async()=>{
    if(!connected){showToast("Dropbox no conectado","info");return;}
    if(!currentKey){showToast("Abre un mes primero","info");return;}
    try{
      const token=await getToken();
      const data=serializeMonthGlobal(currentKey,months[currentKey]);
      const r=await fetch("https://content.dropboxapi.com/2/files/upload",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/octet-stream","Dropbox-API-Arg":JSON.stringify({path:`/gastos7030/${currentKey}.json`,mode:"overwrite",mute:true})},
        body:JSON.stringify(data)
      });
      if(!r.ok) throw new Error(String(r.status));
      updateMonth(currentKey,m=>({...m,savedAt:data.savedAt}));
      showToast("☁️ "+monName(currentKey)+" guardado","ok");
    }catch(e: any){showToast("Error al guardar: "+e.message,"err");}
  },[connected,getToken,currentKey,months,updateMonth,serializeMonthGlobal,showToast]);

  // Global unhandled promise rejection handler
  useEffect(()=>{
    const handler = (e: PromiseRejectionEvent)=>{
      console.error("Unhandled promise rejection:",e.reason);
    };
    window.addEventListener("unhandledrejection",handler);
    return ()=>window.removeEventListener("unhandledrejection",handler);
  },[]);

  // BottomNav is shown for main screens (home/month/settings)
  // Notify pending recurring when entering month
  useEffect(()=>{
    if(pendingRecurring&&pendingRecurring>0){
      showToast(`🔄 ${pendingRecurring} gasto${pendingRecurring!==1?"s":""} recurrente${pendingRecurring!==1?"s":""} agregado${pendingRecurring!==1?"s":""}`, "ok");
      setPendingRecurring(null);
    }
  },[pendingRecurring]);

  return (
    <div style={{height:"100dvh",background:T.bg,color:T.t,fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @keyframes toastIn{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes slideInLeft{from{transform:translateX(-30%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes entryIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes tagPop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        input,button{font-family:inherit;}
        ::-webkit-scrollbar{display:none;}
        .screen-enter{animation:slideInRight .28s cubic-bezier(.4,0,.2,1);}
        .entry-new{animation:entryIn .2s ease;}
        .tag-pop{animation:tagPop .15s ease;}
        .skeleton{background:linear-gradient(90deg,#1a1a1a 25%,#242424 50%,#1a1a1a 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .btn-press:active{transform:scale(.94);transition:transform .1s;}
        input::placeholder{color:#2a2a2a;}
      `}</style>

      {/* Screens */}
      <div style={{flex:1,overflow:"hidden",position:"relative"}}>
        {(screen==="home"
          ||!["home","month","connect","settings","recurring"].includes(screen)
        ) && (
          <div key="home" className="screen-enter" style={{height:"100%",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <HomeScreen months={months}
            onOpenMonth={k=>{setCurrentKey(k);goScreen("month");}}
            connected={connected}
            showToast={showToast}/>
          </div>
        )}
        {screen==="month" && currentKey && months[currentKey] && (
          <MonthScreen months={months} monthKey={currentKey}
            onBack={goBack} onUpdate={updateMonth}
            showToast={showToast} getToken={getToken} connected={connected}
            alertPct={alertPct} goals={goals} onUpdateGoals={setGoals}/>
        )}
        {screen==="connect" && (
          <ConnectScreen dbx={dbx} connected={connected} onBack={goBack}
            onStartOAuth={()=>startOAuth()} onExchangeCode={exchangeCode} onDisconnect={disconnect}
            onLoadCloud={handleLoadCloud} loading={loading}
            cloudData={cloudData}
            onApplyCloud={()=>setCloudData(null)}
            onHideCloud={()=>setCloudData(null)}/>
        )}
        {screen==="settings" && (
          <SettingsScreen connected={connected} userEmail={dbx.em}
            autosave={autosave}
            onToggleAutosave={()=>{const n=!autosave;setAutosave(n);localStorage.setItem(LS.AS,n?"1":"0");showToast(n?"Auto-guardado activado":"Auto-guardado desactivado","ok");}}
            onBack={goBack} onSaveCloud={saveCloud} onExportLocal={exportLocal} onImport={importFile}
            currentMonthKey={currentKey}
            onDeleteMonth={()=>{ if(!currentKey||!confirm("¿Eliminar todos los datos de "+monName(currentKey)+"?")) return; setMonths(m=>{const nm={...m};delete nm[currentKey];return nm;}); setCurrentKey(null); goBack(); }}
            onGoConnect={()=>goScreen("connect")}
            onGoRecurring={()=>goScreen("recurring")}
            alertPct={alertPct}
            onChangeAlertPct={(v:number)=>{setAlertPct(v);showToast("Alerta al "+v+"%","ok");}}
            showToast={showToast}/>
        )}
        {screen==="recurring" && (
          <RecurringScreen
            recurring={recurring}
            setRecurring={setRecurring}
            onBack={goBack}
            showToast={showToast}/>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        screen={screen}
        hasMonth={!!(currentKey&&months[currentKey])}
        onAdd={()=>setShowQuickAdd(true)}
        onNav={id=>{
          if(id==="home"){ goHome(); return; }
          if(id==="month"){
            const k=curKey();
            if(months[k]){ setCurrentKey(k); goScreen("month"); }
            else if(currentKey&&months[currentKey]){ setCurrentKey(currentKey); goScreen("month"); }
            else { createMonth(k); }
            return;
          }
          goScreen(id);
        }}
      />

      {/* Modals */}
      <NewMonthModal open={showNewMonth} onClose={()=>setShowNewMonth(false)} onConfirm={createMonth}/>
      <QuickAddModal open={showQuickAdd} onClose={()=>setShowQuickAdd(false)} onAdd={quickAdd}
        monthLabel={monName(currentKey||curKey())}/>

      {/* Toast — fixed, auto-dismisses properly */}
      <Toast toast={toast} dismiss={dismiss}/>


    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner/>
    </ErrorBoundary>
  );
}
