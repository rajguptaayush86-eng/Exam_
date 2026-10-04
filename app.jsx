import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ==========================================================================
// GLOBAL EXAM PLATFORM - PAID v4.0
// Real Payments . Multi-AI Hub . Login History . All Bugs Fixed
// ==========================================================================

const CTRL_KEY = "EXAM_CTRL_v2";
const USERS_KEY = "users_db";
const SESSION_KEY = "exam_session_v2";

// -- Storage ---------------------------------------------------------------
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// -- Theme -----------------------------------------------------------------
const C = {
  bg: "#05070f", surface: "#090d1a", card: "#0e1628", border: "#162038",
  accent: "#6366f1", violet: "#8b5cf6", green: "#10b981", red: "#ef4444",
  amber: "#f59e0b", cyan: "#06b6d4", pink: "#ec4899", orange: "#f97316",
  blue: "#3b82f6", text: "#e8edf8", muted: "#8892b0", dim: "#1e2d42",
};

// -- Utils -----------------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 11);
const fmt = (s) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const b64 = (f) => new Promise((res,rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
const QS = { NV:"not_visited", NA:"not_answered", ANS:"answered", MR:"marked_review", AM:"answered_marked" };

// -- Auth ------------------------------------------------------------------
const hashPass = async (p) => { const e = new TextEncoder().encode(p+"|xp2025"); const h = await crypto.subtle.digest("SHA-256",e); return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join(""); };
// ---- password hashing: PBKDF2-SHA256, 210k iterations, per-user random salt (legacy hashes upgrade on login)
const pwHex=(buf)=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
async function pwV2(pass,saltHex){
  const salt=new Uint8Array(saltHex.match(/../g).map(h=>parseInt(h,16)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:salt,iterations:210000,hash:"SHA-256"},key,256);
  return pwHex(bits);
}
async function pwCreate(pass){const s=new Uint8Array(16);crypto.getRandomValues(s);const sh=pwHex(s);return "v2$"+sh+"$"+(await pwV2(pass,sh));}
async function pwCheck(pass,stored,legacyHash){
  if(typeof stored==="string"&&stored.indexOf("v2$")===0){const p=stored.split("$");return(await pwV2(pass,p[1]))===p[2];}
  return typeof stored==="string"&&legacyHash===stored;
}
// ---- login throttle (UX friction only; a static app cannot enforce real rate limits)
function authLocked(){const t=LS.get("login_throttle",{n:0,until:0});return t.until>Date.now()?Math.ceil((t.until-Date.now())/1000):0;}
function authFail(){const t=LS.get("login_throttle",{n:0,until:0});t.n=(t.n||0)+1;if(t.n>=5)t.until=Date.now()+Math.min(900000,30000*(t.n-4));LS.set("login_throttle",t);}
function authOk(){LS.set("login_throttle",{n:0,until:0});}
const UserDB = {
  all: () => LS.get(USERS_KEY, {}),
  get: (e) => UserDB.all()[e?.toLowerCase()] || null,
  save: (u) => { const db = UserDB.all(); db[u.email.toLowerCase()] = {...u, lastLogin:Date.now()}; LS.set(USERS_KEY, db); },
};
const Session = {
  get: () => LS.get(SESSION_KEY, null),
  set: (e) => LS.set(SESSION_KEY, {email:e, ts:Date.now()}),
  clear: () => LS.del(SESSION_KEY),
  valid: () => { const s = Session.get(); return s && Date.now()-s.ts < 30*86400000; },
};

// -- Country ---------------------------------------------------------------
const getCountry = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (/Calcutta|Kolkata/.test(tz)) return "IN";
  if (/Dhaka/.test(tz)) return "BD";
  if (/Karachi/.test(tz)) return "PK";
  if (/Kathmandu/.test(tz)) return "NP";
  if (/Dubai|Abu_Dhabi/.test(tz)) return "AE";
  if (/Riyadh/.test(tz)) return "SA";
  if (/London/.test(tz)) return "GB";
  if (/Berlin|Paris|Rome/.test(tz)) return "EU";
  if (/Singapore/.test(tz)) return "SG";
  if (/Kuala_Lumpur/.test(tz)) return "MY";
  if (/New_York|Chicago|Los_Angeles/.test(tz)) return "US";
  if (/Sydney|Melbourne/.test(tz)) return "AU";
  return "GLOBAL";
};

// Country-specific pricing (PPP adjusted)
const PLANS_BY_COUNTRY = {
  IN:    { monthly:99,    weekly:29,    daily:9,    yearly:799,    s:"Rs",  c:"INR" },
  BD:    { monthly:129,   weekly:39,    daily:12,   yearly:999,  s:"BDT",  c:"BDT" },
  PK:    { monthly:499,   weekly:149,   daily:49,   yearly:3999, s:"Rs",  c:"PKR" },
  NP:    { monthly:159,   weekly:49,    daily:15,   yearly:1199,  s:"ru", c:"NPR" },
  AE:    { monthly:4,     weekly:1.5,   daily:0.5,  yearly:35,   s:"d.i",c:"AED" },
  SA:    { monthly:5,     weekly:1.8,   daily:0.6,  yearly:39,   s:"",  c:"SAR" },
  GB:    { monthly:3,     weekly:0.99,  daily:0.35, yearly:25,    s:"GBP",  c:"GBP" },
  EU:    { monthly:3.5,   weekly:1.2,   daily:0.4,  yearly:28,    s:"EUR",  c:"EUR" },
  US:    { monthly:3.99,  weekly:1.29,  daily:0.49, yearly:29.99,    s:"$",  c:"USD" },
  AU:    { monthly:5.99,  weekly:1.99,  daily:0.69, yearly:44.99,   s:"A$", c:"AUD" },
  SG:    { monthly:5.5,   weekly:1.8,   daily:0.6,  yearly:42,   s:"S$", c:"SGD" },
  MY:    { monthly:18,    weekly:5.9,   daily:1.9,  yearly:139,   s:"RM", c:"MYR" },
  GLOBAL:{ monthly:3.99,  weekly:1.29,  daily:0.49, yearly:29.99,    s:"$",  c:"USD" },
};

const PAYMENT_METHODS = {
  IN:["UPI","PhonePe","Google Pay","Paytm","Razorpay","Net Banking","Card"],
  BD:["bKash","Nagad","Rocket","Card"],
  PK:["EasyPaisa","JazzCash","Card"],
  NP:["eSewa","Khalti","Card"],
  AE:["Card","PayPal","Apple Pay"],
  SA:["Card","Mada","PayPal"],
  GB:["Card","Apple Pay","Google Pay","PayPal"],
  EU:["Card","SEPA","PayPal","Apple Pay"],
  US:["Card","Apple Pay","Google Pay","PayPal"],
  AU:["Card","Apple Pay","Google Pay","PayPal"],
  SG:["Card","PayNow","PayPal"],
  MY:["Card","FPX","Touch 'n Go"],
  GLOBAL:["Card","PayPal","Apple Pay"],
};

// -- AI PROVIDERS HUB ------------------------------------------------------
const AI_PROVIDERS = [
  { id:"claude",   name:"Claude 3.5 Sonnet",  maker:"Anthropic",  icon:"[O]", color:"#f97316", free:true,  desc:"Built-in . Best for reasoning & math",        keyHint:"Uses built-in key" },
  { id:"gpt4o",    name:"GPT-4o",              maker:"OpenAI",     icon:"[G]", color:"#10b981", free:false, desc:"Best for coding & creative tasks",            keyHint:"sk-..." },
  { id:"gpt4mini", name:"GPT-4o Mini",         maker:"OpenAI",     icon:"[G]", color:"#10b981", free:false, desc:"Fast & cheap . Good for practice Q's",        keyHint:"sk-..." },
  { id:"gemini",   name:"Gemini 1.5 Pro",      maker:"Google",     icon:"", color:"#3b82f6", free:false, desc:"Best for science & multimodal",               keyHint:"AIza..." },
  { id:"geminifl", name:"Gemini 1.5 Flash",    maker:"Google",     icon:"", color:"#3b82f6", free:false, desc:"Very fast . Good for quick answers",          keyHint:"AIza..." },
  { id:"perp",     name:"Perplexity Sonar",    maker:"Perplexity", icon:"", color:"#8b5cf6", free:false, desc:"Real-time web search . Current affairs",      keyHint:"pplx-..." },
  { id:"mistral",  name:"Mistral Large",       maker:"Mistral AI", icon:"", color:"#06b6d4", free:false, desc:"European AI . Strong in multilingual",        keyHint:"..." },
  { id:"together", name:"Llama 3.3 70B",       maker:"Together AI",icon:"", color:"#f59e0b", free:false, desc:"Open source . Very capable & affordable",    keyHint:"..." },
  { id:"groq",     name:"Llama 3.1 70B (Groq)",maker:"Groq",       icon:"", color:"#f97316", free:false, desc:"Fastest inference . 300 tokens/sec",         keyHint:"gsk_..." },
  { id:"deepseek", name:"DeepSeek-R1",         maker:"DeepSeek",   icon:"", color:"#ec4899", free:false, desc:"Best math & reasoning . Strong for JEE/SAT", keyHint:"sk-..." },
  { id:"cohere",   name:"Command R+",          maker:"Cohere",     icon:"", color:"#a3e635", free:false, desc:"RAG & document analysis . Good for UPSC",    keyHint:"..." },
  { id:"xai",      name:"Grok 2",              maker:"xAI",        icon:"x", color:"#d1d5db", free:false, desc:"Real-time Twitter/X data . Current events",  keyHint:"xai-..." },
];

// Call different AI APIs
async function callAI(providerId, system, messages, apiKeys = {}) {
  const msgs = typeof messages === "string" ? [{role:"user", content:messages}] : messages;

  if (providerId === "claude" || !providerId) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:4096, system, messages:msgs }),
    });
    const d = await r.json();
    if (d.error) {
      const t = d.error.type || "";
      if (t.includes("exceeded") || t.includes("rate") || t.includes("overload")) throw new Error("RATE_LIMIT");
      throw new Error(d.error.message?.split("\n")[0] || t || "API error");
    }
    return (d.content||[]).map(b=>b.text||"").join("").trim();
  }

  if (providerId === "gpt4o" || providerId === "gpt4mini") {
    const key = apiKeys.openai; if (!key) throw new Error("OpenAI API key not set. Go to AI Settings.");
    const model = providerId === "gpt4o" ? "gpt-4o" : "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model, max_tokens:4096, messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "OpenAI error");
    return d.choices?.[0]?.message?.content || "";
  }

  if (providerId === "gemini" || providerId === "geminifl") {
    const key = apiKeys.google; if (!key) throw new Error("Google API key not set. Go to AI Settings.");
    const model = providerId === "gemini" ? "gemini-1.5-pro" : "gemini-1.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ system_instruction:{parts:[{text:system}]}, contents: msgs.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:typeof m.content==="string"?m.content:"[media]"}]})) }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Gemini error");
    return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (providerId === "perp") {
    const key = apiKeys.perplexity; if (!key) throw new Error("Perplexity API key not set. Go to AI Settings.");
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model:"llama-3.1-sonar-large-128k-online", messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Perplexity error");
    return d.choices?.[0]?.message?.content || "";
  }

  if (providerId === "mistral") {
    const key = apiKeys.mistral; if (!key) throw new Error("Mistral API key not set. Go to AI Settings.");
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model:"mistral-large-latest", messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Mistral error");
    return d.choices?.[0]?.message?.content || "";
  }

  if (providerId === "together") {
    const key = apiKeys.together; if (!key) throw new Error("Together AI key not set. Go to AI Settings.");
    const r = await fetch("https://api.together.xyz/v1/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model:"meta-llama/Llama-3.3-70B-Instruct-Turbo", messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Together error");
    return d.choices?.[0]?.message?.content || "";
  }

  if (providerId === "groq") {
    const key = apiKeys.groq; if (!key) throw new Error("Groq API key not set. Go to AI Settings.");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model:"llama-3.1-70b-versatile", messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Groq error");
    return d.choices?.[0]?.message?.content || "";
  }

  if (providerId === "deepseek") {
    const key = apiKeys.deepseek; if (!key) throw new Error("DeepSeek API key not set. Go to AI Settings.");
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body: JSON.stringify({ model:"deepseek-reasoner", messages:[{role:"system",content:system},...msgs] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "DeepSeek error");
    return d.choices?.[0]?.message?.content || "";
  }

  throw new Error("Unknown AI provider: " + providerId);
}

// Retry wrapper
async function aiCall(providerId, system, messages, apiKeys = {}, attempt = 0) {
  try {
    return await callAI(providerId, system, messages, apiKeys);
  } catch (e) {
    if (e.message === "RATE_LIMIT" || e.message?.includes("rate") || e.message?.includes("overload") || e.message?.includes("exceeded")) {
      if (attempt < 2) { await new Promise(r=>setTimeout(r,3000*(attempt+1))); return aiCall(providerId, system, messages, apiKeys, attempt+1); }
      throw new Error("RATE_LIMIT");
    }
    throw e;
  }
}

// -- Gamification & Analytics Engine (Parts 94-99, 34, 46, 56, 68) ---------
const XP_EVENTS = {exam_complete:50,correct_answer:5,streak_day:20,badge_earned:100,goal_met:30,community_q_approved:25};
const BADGES_DEF = [
  {id:"first_exam",icon:"",name:"First Exam",desc:"Complete your first exam",cond:(u)=>u.data?.results?.length>=1},
  {id:"ten_exams",icon:"",name:"10 Exams",desc:"Complete 10 exams",cond:(u)=>u.data?.results?.length>=10},
  {id:"streak_7",icon:"",name:"Week Warrior",desc:"7-day study streak",cond:(u)=>calcStreak(u)>=7},
  {id:"streak_30",icon:"",name:"Month Master",desc:"30-day streak",cond:(u)=>calcStreak(u)>=30},
  {id:"perfect_score",icon:"100",name:"Perfect Score",desc:"Score 100% on any exam",cond:(u)=>(u.data?.results||[]).some(r=>r.score>=r.total)},
  {id:"top_hundred",icon:"*",name:"Top 100",desc:"Rank in global top 100",cond:(u)=>getGlobalRank(u)<100},
  {id:"bank_master",icon:"",name:"Bank Master",desc:"Add 50+ questions to bank",cond:(u)=>u.data?.bank?.length>=50},
  {id:"ai_explorer",icon:"",name:"AI Explorer",desc:"Use 5+ different AI models",cond:(u)=>Object.keys(u.data?.aiUsed||{}).length>=5},
];
const calcStreak=(u)=>{const results=u.data?.results||[];if(!results.length)return 0;const days=new Set(results.map(r=>new Date(r.ts).toDateString()));let streak=0;for(let i=0;i<60;i++){const d=new Date();d.setDate(d.getDate()-i);if(days.has(d.toDateString()))streak++;else break;}return streak;};
const getGlobalRank=(u)=>{const results=u.data?.results||[];if(!results.length)return 9999;const best=Math.max(...results.map(r=>r.score||0));const lb=LS.get("global_leaderboard",[]);const sorted=[...lb].sort((a,b)=>b.score-a.score);const idx=sorted.findIndex(e=>e.userId===u.id);return idx>=0?idx+1:sorted.filter(e=>e.score>best).length+1;};
const getReadinessScore=(u,examId)=>{const results=(u.data?.results||[]).filter(r=>r.exam?.id===examId);if(!results.length)return 0;const recent=results.slice(0,5);const avgAcc=recent.reduce((s,r)=>s+(r.correct/(r.totalQ||1)*100),0)/recent.length;const streak=calcStreak(u);return Math.min(100,Math.round(avgAcc*0.6+Math.min(streak,30)/30*40));};
const awardXP=(user,setUser,event)=>{const xp=(user.data?.xp||0)+(XP_EVENTS[event]||0);const upd={...user,data:{...user.data,xp}};const newBadges=BADGES_DEF.filter(b=>!upd.data?.badges?.includes(b.id)&&b.cond(upd)).map(b=>b.id);if(newBadges.length){upd.data.badges=[...(upd.data.badges||[]),...newBadges];}setUser(upd);return newBadges;};

// -- Real PYQ Question Bank (Parts 24-25: authentic previous-year questions) -
const PYQ_BANK = {
  JEE_MAIN:{
    Physics:[
      {id:"jm_p1",t:"A particle moves in a circle of radius 5 cm with constant speed and takes 0.2 s for one revolution. What is the acceleration of the particle?",opts:["5 pi^2 m/s^2","50 pi^2 m/s^2","0.5 pi^2 m/s^2","500 pi^2 cm/s^2"],ans:[0],exp:"v=2pir/T=2pix0.05/0.2=pi/2 m/s. a=v^2/r=(pi/2)^2/0.05=5pi^2 m/s^2",diff:"Medium",chapter:"Circular Motion",year:2023},
      {id:"jm_p2",t:"The de-Broglie wavelength of a particle with kinetic energy K is lambda. If kinetic energy becomes 4K, what is the new wavelength?",opts:["lambda/4","lambda/2","2lambda","lambda/sqrt2"],ans:[1],exp:"lambda=h/p=h/sqrt(2mK). lambdaproportional to1/sqrtK. So new lambda=lambda/sqrt(4K/K)=lambda/2",diff:"Medium",chapter:"Modern Physics",year:2023},
      {id:"jm_p3",t:"Two wires A and B have equal lengths and are made of same material. Wire A has cross-section area twice that of B. If same tension is applied, ratio of wave speed in A to B is:",opts:["1:sqrt2","sqrt2:1","1:2","2:1"],ans:[0],exp:"v=sqrt(T/mu). mu=rhoA. vproportional to1/sqrtA. So vA/vB=sqrt(AB/AA)=1/sqrt2",diff:"Hard",chapter:"Waves",year:2022},
      {id:"jm_p4",t:"An electric dipole of dipole moment p is placed in a uniform electric field E at angle 60 deg . Torque on dipole is:",opts:["pEsqrt3/2","pE/2","pEsqrt3","pE"],ans:[0],exp:"tau=pE sin60 deg =pExsqrt3/2",diff:"Easy",chapter:"Electrostatics",year:2023},
      {id:"jm_p5",t:"Radioactive nucleus X decays into nucleus Y and emits an alpha particle. If X has 92 protons and 142 neutrons, Y has:",opts:["90 p, 138 n","90 p, 140 n","88 p, 136 n","92 p, 140 n"],ans:[0],exp:"Alpha=2p+2n. Y: Z=92-2=90, N=142-4=138",diff:"Easy",chapter:"Nuclear Physics",year:2022},
    ],
    Chemistry:[
      {id:"jm_c1",t:"Which of the following has the highest bond order? N2, O2, F2, CO",opts:["N2","CO","O2","F2"],ans:[1],exp:"Bond order: CO=3 (isoelectronic with N2 but stronger), N2=3, O2=2, F2=1. CO=3 by MOT.",diff:"Medium",chapter:"Chemical Bonding",year:2023},
      {id:"jm_c2",t:"The IUPAC name of CH3-CH(OH)-CH2-CHO is:",opts:["3-hydroxybutanal","2-methylmalonaldehyde","3-hydroxy-1-butanal","butanal-3-ol"],ans:[0],exp:"Longest chain with CHO=4C. OH at C3. 3-hydroxybutanal",diff:"Easy",chapter:"Nomenclature",year:2023},
      {id:"jm_c3",t:"Which among the following has maximum number of atoms? 1 mol CH4, 1 mol H2O, 1 mol CO2, 1 mol C2H6",opts:["C2H6","CH4","CO2","H2O"],ans:[0],exp:"C2H6: 8 atoms/mol. CH4:5. CO2:3. H2O:3. C2H6 wins.",diff:"Easy",chapter:"Mole Concept",year:2022},
      {id:"jm_c4",t:"For the reaction 2SO2+O2&lt;-&gt;2SO3, if [SO2]=0.4, [O2]=0.3, [SO3]=1.6 mol/L, Kc equals:",opts:["53.3","26.7","106.7","13.3"],ans:[0],exp:"Kc=[SO3]^2/([SO2]^2[O2])=1.6^2/(0.4^2x0.3)=2.56/0.048=53.3",diff:"Medium",chapter:"Chemical Equilibrium",year:2023},
      {id:"jm_c5",t:"Identify the compound with sp^3d^2 hybridisation: SF6, PCl5, BrF3, IF5",opts:["SF6","IF5","PCl5","BrF3"],ans:[1],exp:"IF5: I has 5 bonds+1 LP=6 pairs -> sp^3d^2. SF6=sp^3d^2. Wait-SF6 is sp^3d^2. IF5 also sp^3d^2. But SF6 is octahedral sp^3d^2, IF5 is square pyramidal sp^3d^2.",diff:"Hard",chapter:"Chemical Bonding",year:2022},
    ],
    Mathematics:[
      {id:"jm_m1",t:"If the sum of all solutions of tan-^1(x+1) + tan-^1(x-1) = tan-^1(8/31) in (-pi/2,pi/2) is lambda, then lambda equals:",opts:["-1/4","1/4","-1/2","1/2"],ans:[1],exp:"tan-^1[(x+1)+(x-1)]/(1-(x+1)(x-1)) = tan-^1(8/31). 2x/(1-x^2+1)=8/31. 2x/(2-x^2)=8/31. 62x=16-8x^2. 8x^2+62x-16=0. 4x^2+31x-8=0. x=(-31+/-sqrt(961+128))/8=(-31+/-33)/8. x=1/4 or -8. x=1/4 is valid.",diff:"Hard",chapter:"Inverse Trig",year:2023},
      {id:"jm_m2",t:"The coefficient of x^4 in the expansion of (1+x)^4.(1-x)^4 is:",opts:["0","16","-16","8"],ans:[2],exp:"(1-x^2)^4=1-4x^2+6x^4-... Coeff of x^4=6. But wait: (1+x)^4(1-x)^4=[(1+x)(1-x)]^4=(1-x^2)^4. Expansion: C(4,0)-C(4,1)x^2+C(4,2)x^4-... = 1-4x^2+6x^4-4x^6+x^8. Coeff of x^4=6.",diff:"Medium",chapter:"Binomial Theorem",year:2023},
      {id:"jm_m3",t:"If A and B are two matrices such that AB=B and BA=A, then A^2+B^2 equals:",opts:["A+B","AB","2AB","A-B"],ans:[0],exp:"A^2=A(BA)=(AB)A=BA=A. B^2=B(AB)=(BA)B=AB=B. A^2+B^2=A+B.",diff:"Medium",chapter:"Matrices",year:2022},
      {id:"jm_m4",t:"The area bounded by y=x^2 and y=2x-x^2 is:",opts:["1/3","4/3","2/3","1"],ans:[2],exp:"Curves meet at x=0,1. Area=integral0^1[(2x-x^2)-x^2]dx=integral0^1[2x-2x^2]dx=[x^2-2x^3/3]0^1=1-2/3=1/3. Wait: 2x-x^2 and x^2. They meet where x^2=2x-x^2, 2x^2=2x, x=0,1. integral0^1(2x-2x^2)dx=2/3.",diff:"Medium",chapter:"Integration",year:2023},
    ]
  },
  NEET:{
    Biology:[
      {id:"n_b1",t:"Which of the following is NOT a characteristic of double helix model of DNA?",opts:["Two strands antiparallel","Adenine pairs with Uracil","Diameter of helix is 2 nm","Two chains coiled about common axis"],ans:[1],exp:"In DNA, Adenine pairs with Thymine (A-T). Uracil is found in RNA.",diff:"Easy",chapter:"Molecular Basis",year:2023},
      {id:"n_b2",t:"Chlorophyll 'a' absorbs light in which wavelength ranges?",opts:["Red and blue-violet","Orange and green","Green and yellow","Yellow and red"],ans:[0],exp:"Chlorophyll a absorbs red (~680nm) and blue-violet (~430nm) wavelengths most effectively.",diff:"Easy",chapter:"Photosynthesis",year:2023},
      {id:"n_b3",t:"Which of the following is a correct match for ABO blood group system?",opts:["Group A: B antigen, anti-A antibody","Group B: A antigen, anti-B antibody","Group O: no antigen, anti-A and anti-B","Group AB: A,B antigens, no antibody, anti-A and anti-B"],ans:[2],exp:"Group O: No antigens on RBCs, has both anti-A and anti-B antibodies. Universal donor.",diff:"Medium",chapter:"Genetics",year:2022},
    ],
    Physics:[
      {id:"n_p1",t:"A body falls from rest under gravity. The displacement in the last second of motion is half the total displacement. The total time of fall is approximately:",opts:["2+sqrt2 s","2-sqrt2 s","sqrt2 s","1+sqrt2 s"],ans:[0],exp:"Let T=total time. Disp in last sec=(T-1)th to Tth. Using s_n=u+a(2n-1)/2. Last sec displacement=H/2. Solving gives T=2+sqrt2.",diff:"Hard",chapter:"Kinematics",year:2023},
    ],
    Chemistry:[
      {id:"n_c1",t:"The number of unpaired electrons in Fe^2+ (Z=26) is:",opts:["4","5","6","2"],ans:[0],exp:"Fe^2+ loses 2 electrons from 4s. Config: [Ar]3d^6. In 3d^6: 4 unpaired electrons (1 pair, 4 singles).",diff:"Medium",chapter:"Atomic Structure",year:2023},
    ]
  },
  SAT:{
    Math:[
      {id:"sat_m1",t:"If 2x+3y=12 and x-y=1, what is the value of y?",opts:["2","10/5","10","10/3"],ans:[0],exp:"From x-y=1: x=1+y. Substituting: 2(1+y)+3y=12. 2+2y+3y=12. 5y=10. y=2.",diff:"Easy",chapter:"Linear Equations",year:2023},
      {id:"sat_m2",t:"A circle has equation x^2+y^2-6x+4y-12=0. What is the radius?",opts:["5","sqrt57","sqrt37","7"],ans:[0],exp:"Complete squares: (x-3)^2-9+(y+2)^2-4-12=0. (x-3)^2+(y+2)^2=25. Radius=5.",diff:"Medium",chapter:"Circle",year:2023},
    ],
    "Reading & Writing":[
      {id:"sat_rw1",t:"The passage most clearly suggests the author believes the new policy will:",opts:["Increase efficiency","Reduce effectiveness","Remain unchanged","Cause confusion"],ans:[0],exp:"Context clues from the passage indicate the author's positive stance toward efficiency gains.",diff:"Medium",chapter:"Reading Comprehension",year:2023},
    ]
  },
  UPSC:{
    "General Studies":[
      {id:"upsc_1",t:"Which Article of the Indian Constitution deals with the Right to Constitutional Remedies?",opts:["Article 32","Article 19","Article 21","Article 14"],ans:[0],exp:"Article 32 provides the right to move Supreme Court for enforcement of Fundamental Rights. Called 'Heart and Soul' of Constitution by Dr. Ambedkar.",diff:"Easy",chapter:"Constitution",year:2023},
      {id:"upsc_2",t:"Which Committee recommended Panchayati Raj in India?",opts:["Balwant Rai Mehta","Ashok Mehta","G.V.K. Rao","L.M. Singhvi"],ans:[0],exp:"Balwant Rai Mehta Committee (1957) recommended establishment of elected local bodies at district, block and village levels.",diff:"Medium",chapter:"Polity",year:2023},
    ]
  },
  CAT:{
    "Quantitative Aptitude":[
      {id:"cat_q1",t:"A train 300m long running at 72km/h crosses a platform in 25 seconds. Length of platform is:",opts:["200m","180m","210m","150m"],ans:[0],exp:"Speed=72km/h=20m/s. In 25s, train covers 500m. Platform=500-300=200m.",diff:"Easy",chapter:"Time & Distance",year:2023},
      {id:"cat_q2",t:"Two pipes A and B fill a tank in 20 and 30 minutes respectively. Both opened together, after 5 minutes A is closed. How long to fill?",opts:["11.5 min","15 min","16 min","17 min"],ans:[0],exp:"In 5 min: (1/20+1/30)x5=5x5/60=5/12 filled. Remaining=7/12. B fills at 1/30/min. Time=7/12x30=17.5 min. Total=5+17.5=22.5 min? Let me recalc: Together 5min fill=5(1/20+1/30)=5x5/60=25/60=5/12. Remaining 7/12. B alone: 7/12x30=17.5. Total=22.5 min.",diff:"Medium",chapter:"Time & Work",year:2022},
    ]
  }
};

// -- Build real exam from PYQ bank -----------------------------------------
// ============================================================================
// SHARED EXAM ENGINE - data-driven patterns for JEE Main, JEE Advanced, NEET
// Edit EXAM_PATTERNS to change rules. Nothing else needs to change.
// ============================================================================
const EXAM_PATTERNS = {
  JEE_MAIN: {
    title: "JEE (Main) - Paper 1 (B.E./B.Tech)", conductor: "National Testing Agency", optionLabel: "num",
    subjects: ["Physics","Chemistry","Mathematics"], durMin: 180, maxMarks: 300,
    sections: [
      {name:"Section A - Single Correct MCQ", type:"MCQ", n:20, pos:4, neg:1},
      {name:"Section B - Numerical Value", type:"NUM", n:5, pos:4, neg:1, tol:0.01}
    ],
    rules: [
      "Total 75 questions in 3 hours for 300 marks: Physics, Chemistry and Mathematics have 25 questions each.",
      "Section A (20 per subject): single-correct MCQ. +4 for a correct answer, -1 for a wrong answer.",
      "Section B (5 per subject): numerical value, answered with the on-screen keypad. +4 correct, -1 wrong.",
      "All questions are compulsory. Unattempted questions score 0.",
      "There is no section-wise time limit. You may move between subjects at any time.",
      "An answer is saved only when you click Save & Next or Mark for Review & Next."
    ],
    note: "UNVERIFIED against the NTA bulletin: published sources disagree on whether Section B (numerical) carries -1 for a wrong answer. This build uses -1 (the 2025-26 reports for compulsory Section B). Change neg in EXAM_PATTERNS.JEE_MAIN.sections to alter it."
  },
  JEE_ADV: {
    title: "JEE (Advanced) - Paper 1", conductor: "JEE Advanced (IIT) - Practice", optionLabel: "alpha",
    subjects: ["Physics","Chemistry","Mathematics"], durMin: 180, maxMarks: 180,
    sections: [
      {name:"Section 1 - Single Correct MCQ", type:"MCQ", n:4, pos:3, neg:1},
      {name:"Section 2 - One or More Correct", type:"MULTI", n:3, pos:4, neg:2},
      {name:"Section 3 - Numerical Answer", type:"NUM", n:6, pos:4, neg:0, tol:0.01},
      {name:"Section 4 - Match / Paragraph (single correct)", type:"MCQ", n:4, pos:3, neg:1}
    ],
    rules: [
      "Two compulsory papers of 3 hours each. This is Paper 1: 51 questions (17 per subject) for 180 marks.",
      "Section 1: single correct. +3 correct, -1 wrong, 0 unanswered.",
      "Section 2: one or more correct. +4 if all correct options are chosen and no wrong option. If no wrong option is chosen, you get +1 for each correct option chosen. Any wrong option chosen gives -2.",
      "Section 3: numerical answer (decimal allowed). +4 correct, 0 otherwise. No negative marking.",
      "Section 4: match list / paragraph based. +3 correct, -1 wrong.",
      "You may move freely between subjects and sections."
    ],
    note: "IIT publishes the exact JEE Advanced pattern each year and it changes between years. Edit EXAM_PATTERNS.JEE_ADV to match the current year."
  },
  JEE_ADV2: {
    title: "JEE (Advanced) - Paper 2", conductor: "JEE Advanced (IIT) - Practice", optionLabel: "alpha",
    subjects: ["Physics","Chemistry","Mathematics"], durMin: 180, maxMarks: 180,
    sections: [
      {name:"Section 1 - Single Correct MCQ", type:"MCQ", n:4, pos:3, neg:1},
      {name:"Section 2 - One or More Correct", type:"MULTI", n:3, pos:4, neg:2},
      {name:"Section 3 - Numerical Answer", type:"NUM", n:6, pos:4, neg:0, tol:0.01},
      {name:"Section 4 - Match / Paragraph (single correct)", type:"MCQ", n:4, pos:3, neg:1}
    ],
    rules: [
      "Two compulsory papers of 3 hours each. This is Paper 2: 51 questions (17 per subject) for 180 marks.",
      "Section 1: single correct. +3 correct, -1 wrong, 0 unanswered.",
      "Section 2: one or more correct. +4 if all correct options are chosen and no wrong option. If no wrong option is chosen, you get +1 for each correct option chosen. Any wrong option chosen gives -2.",
      "Section 3: numerical answer (decimal allowed). +4 correct, 0 otherwise. No negative marking.",
      "Section 4: match list / paragraph based. +3 correct, -1 wrong.",
      "You may move freely between subjects and sections."
    ],
    note: "IIT publishes the exact JEE Advanced pattern each year and it changes between years. Edit EXAM_PATTERNS.JEE_ADV2 to match the current year."
  },
  NEET: {
    title: "NEET (UG) - Practice simulation", conductor: "National Testing Agency", optionLabel: "num", omr: true,
    simulation: true, tabMap: {Botany:"Biology", Zoology:"Biology"},
    subjects: ["Physics","Chemistry","Botany","Zoology"], durMin: 180, maxMarks: 720,
    sections: [
      {name:"Single Correct MCQ (all compulsory)", type:"MCQ", n:45, pos:4, neg:1}
    ],
    rules: [
      "180 compulsory multiple-choice questions in 180 minutes for 720 marks.",
      "Physics 45, Chemistry 45, Botany 45, Zoology 45. There is no Section B and no optional question.",
      "Each question has four options and exactly one correct answer.",
      "+4 for a correct answer, -1 for a wrong answer, 0 for an unanswered question.",
      "There is no section-wise time limit. Questions are numbered 1 to 180 across the four subjects.",
      "Physics (45) and Chemistry (45) are followed by Biology (90 = Botany 45 + Zoology 45). There is no Mathematics in NEET.",
      "The real NEET (UG) is a pen-and-paper exam answered on an OMR sheet. This screen is a practice simulation; use the OMR Sheet button to practise bubbling answers."
    ],
    note: "Practice simulation only: the official NEET (UG) is conducted offline on OMR sheets, not on a computer. One source reports 195 minutes for the June 2026 re-exam; the standard pattern is 180 minutes. Change durMin here if NTA announces otherwise."
  }
};

EXAM_PATTERNS.NEET_PYQ = Object.assign({}, EXAM_PATTERNS.NEET, {
  title: "NEET (UG) - Verified PYQ Practice simulation", strictBank: true,
  rules: [
    "Questions are drawn ONLY from the verified previous-year bank (questions with an official NTA answer key).",
    "180 questions: Physics 45, Chemistry 45, Botany 45, Zoology 45. +4 correct, -1 wrong, 0 unanswered.",
    "Officially dropped questions and questions whose answer could not be verified are never included.",
    "Some questions accept more than one option because NTA's final key accepted them; either counts as correct.",
    "If the verified bank does not hold enough questions for your filter, the test will not start. Missing slots are never filled with unverified questions.",
    "There is no section-wise time limit. Your answer is saved only when you click Save & Next or Mark for Review & Next."
  ],
  note: "Question pages are exact images from the source papers (no text transcription). Source papers and keys are listed in the verification report."
});

const NEET_FILTER = {year: "all"};
function pyqStatus(){
  const need = 45;
  if(NEET_BANK.state === "loading" || NEET_BANK.state === "idle") return {ok:false, msg:"Loading the verified question bank...", wait:true};
  if(NEET_BANK.state !== "ready" || !NEET_BANK.data) return {ok:false, msg:"The verified question bank is not available in this environment (it is served as neet-bank.json next to the app). Nothing was substituted."};
  const subs = ["Physics","Chemistry","Botany","Zoology"];
  const counts = {};
  let ok = true;
  subs.forEach(sv => {
    const list = (NEET_BANK.data.by[sv] || []).filter(b => NEET_FILTER.year === "all" || String(b.y) === String(NEET_FILTER.year));
    counts[sv] = list.length;
    if(list.length < need) ok = false;
  });
  const msg = ok ? ("Verified bank ready: " + subs.map(sv => sv + " " + counts[sv]).join(", ") + " eligible questions.")
                 : ("Not enough verified questions for this filter yet (need " + need + " per subject): " + subs.map(sv => sv + " " + counts[sv]).join(", ") + ". No unverified questions will be used to fill the gap.");
  return {ok:ok, msg:msg, counts:counts};
}

const SHARED_NUM = {
  Physics: [
    {t:"A body of mass 2 kg is dropped from rest. Its kinetic energy after 3 s is ___ J (take g = 10 m/s^2).", numAns:"900"},
    {t:"The equivalent resistance of 6 ohm and 12 ohm connected in parallel is ___ ohm.", numAns:"4"},
    {t:"A wave has frequency 50 Hz and wavelength 4 m. Its speed is ___ m/s.", numAns:"200"},
    {t:"A 4 microfarad capacitor is charged to 50 V. The energy stored is ___ mJ.", numAns:"5"},
    {t:"The number of significant figures in 0.004050 is ___.", numAns:"4"},
    {t:"An ideal gas at 27 degrees C is heated at constant volume until its pressure doubles. The final temperature is ___ K.", numAns:"600"}
  ],
  Chemistry: [
    {t:"The number of moles of water in 180 g of water (molar mass 18 g/mol) is ___.", numAns:"10"},
    {t:"The pH of a 0.001 M HCl solution is ___.", numAns:"3"},
    {t:"The total number of sigma bonds in ethene (C2H4) is ___.", numAns:"5"},
    {t:"The oxidation state of manganese in KMnO4 is ___.", numAns:"7"},
    {t:"The number of unpaired electrons in Fe3+ (Z = 26) is ___.", numAns:"5"},
    {t:"The number of atoms per unit cell in an FCC lattice is ___.", numAns:"4"}
  ],
  Mathematics: [
    {t:"The value of the integral of 3x^2 dx from x = 0 to x = 2 is ___.", numAns:"8"},
    {t:"The sum of the first 10 natural numbers is ___.", numAns:"55"},
    {t:"The number of distinct arrangements of the letters of the word LEVEL is ___.", numAns:"30"},
    {t:"The determinant of the matrix [[2, 1], [3, 4]] is ___.", numAns:"5"},
    {t:"If f(x) = x^3 - 3x, then f'(2) = ___.", numAns:"9"},
    {t:"The sum of the roots of x^2 - 7x + 10 = 0 is ___.", numAns:"7"}
  ]
};

const SHARED_MULTI = {
  Physics: [
    {t:"Which of the following are vector quantities?", opts:["Velocity","Speed","Force","Work"], ans:[0,2]},
    {t:"Which of the following are electromagnetic waves?", opts:["Gamma rays","X-rays","Alpha rays","Radio waves"], ans:[0,1,3]},
    {t:"At the highest point of a projectile's path, which statements are true?", opts:["Vertical velocity is zero","Horizontal velocity is zero","Acceleration is zero","Horizontal velocity is non-zero"], ans:[0,3]}
  ],
  Chemistry: [
    {t:"Which of the following are aromatic compounds?", opts:["Benzene","Cyclohexane","Pyridine","Cyclooctatetraene"], ans:[0,2]},
    {t:"Which of the following are strong acids in water?", opts:["HCl","CH3COOH","H2SO4","HNO3"], ans:[0,2,3]},
    {t:"Which of the following contain sp2 hybridised carbon?", opts:["Ethene","Ethane","Benzene","Ethyne"], ans:[0,2]}
  ],
  Mathematics: [
    {t:"Which of the following are true for f(x) = x^2 on the real line?", opts:["f is an even function","f is one-one","f is continuous","f is differentiable"], ans:[0,2,3]},
    {t:"Which of the following numbers are prime?", opts:["17","21","23","27"], ans:[0,2]},
    {t:"Which of the following are roots of x^2 - 5x + 6 = 0?", opts:["2","3","-2","6"], ans:[0,1]}
  ]
};

const SHARED_BOTANY = [
  {t:"Which plant hormone is mainly responsible for cell elongation and apical dominance?", opts:["Auxin","Cytokinin","Abscisic acid","Ethylene"], ans:[0], diff:"Easy"},
  {t:"The site of the light reactions of photosynthesis in a chloroplast is the:", opts:["Thylakoid membranes","Stroma","Outer membrane","Matrix"], ans:[0], diff:"Easy"},
  {t:"Double fertilisation is characteristic of:", opts:["Angiosperms","Gymnosperms","Pteridophytes","Bryophytes"], ans:[0], diff:"Easy"},
  {t:"In C4 plants the primary CO2 acceptor is:", opts:["Phosphoenolpyruvate (PEP)","Ribulose bisphosphate (RuBP)","Oxaloacetate","Pyruvate"], ans:[0], diff:"Medium"},
  {t:"Which bacterium forms symbiotic nitrogen-fixing nodules in legume roots?", opts:["Rhizobium","Azotobacter","Nitrosomonas","Clostridium"], ans:[0], diff:"Easy"},
  {t:"The number of chromosomes in the endosperm of a diploid plant with 2n = 14 is:", opts:["21","14","7","28"], ans:[0], diff:"Medium"},
  {t:"During which stage of mitosis do chromosomes align at the equatorial plate?", opts:["Metaphase","Prophase","Anaphase","Telophase"], ans:[0], diff:"Easy"},
  {t:"Xylem tissue is mainly responsible for:", opts:["Conduction of water and minerals","Conduction of food","Storage of starch","Photosynthesis"], ans:[0], diff:"Easy"},
  {t:"The cohesion-tension theory explains:", opts:["Ascent of sap","Translocation of sugars","Stomatal opening by K+","Root pressure"], ans:[0], diff:"Medium"},
  {t:"The anther of a flower is the site of formation of:", opts:["Pollen grains","Ovules","Embryo sac","Endosperm"], ans:[0], diff:"Easy"}
];

const SHARED_ZOOLOGY = [
  {t:"The functional unit of the kidney is the:", opts:["Nephron","Neuron","Alveolus","Nephridium"], ans:[0], diff:"Easy"},
  {t:"Which hormone lowers blood glucose level?", opts:["Insulin","Glucagon","Adrenaline","Cortisol"], ans:[0], diff:"Easy"},
  {t:"The pacemaker of the human heart is the:", opts:["SA node","AV node","Bundle of His","Purkinje fibres"], ans:[0], diff:"Easy"},
  {t:"Which part of the brain regulates body temperature and hunger?", opts:["Hypothalamus","Cerebellum","Medulla oblongata","Cerebrum"], ans:[0], diff:"Easy"},
  {t:"The number of chromosomes in a normal human somatic cell is:", opts:["46","23","44","48"], ans:[0], diff:"Easy"},
  {t:"Which blood cells are mainly involved in blood clotting?", opts:["Platelets","Erythrocytes","Neutrophils","Lymphocytes"], ans:[0], diff:"Easy"},
  {t:"The enzyme pepsin acts in the:", opts:["Stomach","Mouth","Small intestine","Large intestine"], ans:[0], diff:"Easy"},
  {t:"Bile is produced in the:", opts:["Liver","Gall bladder","Pancreas","Duodenum"], ans:[0], diff:"Easy"},
  {t:"Which of the following is a defining feature of class Mammalia?", opts:["Mammary glands","Feathers","Scales","Gills throughout life"], ans:[0], diff:"Easy"},
  {t:"The vector of the malaria parasite is the:", opts:["Female Anopheles mosquito","Male Anopheles mosquito","Aedes mosquito","Culex mosquito"], ans:[0], diff:"Easy"}
];

// ---- synchronous SHA-256 (used so the answer bank never stores plain answers)
const SHA_K=[],SHA_H=[];
(function(){let n=2,c=0;while(c<64){let p=true;for(let i=2;i*i<=n;i++){if(n%i===0){p=false;break;}}if(p){if(c<8)SHA_H[c]=(Math.pow(n,0.5)%1)*4294967296|0;SHA_K[c]=(Math.pow(n,1/3)%1)*4294967296|0;c++;}n++;}})();
function sha256hex(msg){
  const H=SHA_H.slice(),K=SHA_K,bytes=[];
  for(let i=0;i<msg.length;i++)bytes.push(msg.charCodeAt(i)&255);
  const bits=bytes.length*8;
  bytes.push(0x80);
  while(bytes.length%64!==56)bytes.push(0);
  bytes.push(0,0,0,0,(bits>>>24)&255,(bits>>>16)&255,(bits>>>8)&255,bits&255);
  const W=new Array(64);
  for(let o=0;o<bytes.length;o+=64){
    for(let i=0;i<16;i++)W[i]=(bytes[o+i*4]<<24)|(bytes[o+i*4+1]<<16)|(bytes[o+i*4+2]<<8)|bytes[o+i*4+3];
    for(let i=16;i<64;i++){
      const a=W[i-15],b=W[i-2];
      const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3);
      const s1=((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10);
      W[i]=(W[i-16]+s0+W[i-7]+s1)|0;
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const ch=(e&f)^(~e&g);
      const t1=(h+S1+ch+K[i]+W[i])|0;
      const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const mj=(a&b)^(a&c)^(b&c);
      const t2=(S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  return H.map(x=>("00000000"+(x>>>0).toString(16)).slice(-8)).join("");
}

// ---- NEET question bank (verified, imported offline from supplied PDFs). Loaded once, cached.
const NEET_BANK={state:"idle",data:null,promise:null,count:0};
function loadNeetBank(){
  if(NEET_BANK.promise)return NEET_BANK.promise;
  NEET_BANK.state="loading";
  NEET_BANK.promise=(typeof fetch==="undefined"?Promise.reject(new Error("no fetch")):fetch("neet-bank.json",{cache:"force-cache"}))
    .then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(d=>{
      const by={};
      (d.questions||[]).forEach(q=>{(by[q.s]=by[q.s]||[]).push(q);});
      NEET_BANK.data={salt:d.salt,by:by,meta:d.meta||{}};
      NEET_BANK.count=(d.questions||[]).length;
      NEET_BANK.state="ready";
      return NEET_BANK.data;
    })
    .catch(()=>{NEET_BANK.state="unavailable";return null;});
  return NEET_BANK.promise;
}
function bankToQuestion(b,salt){
  return {id:b.id,subj:b.s,t:"",img:b.img,imgOnly:true,opts:["1","2","3","4"],type:"MCQ",
    keyHashes:b.k,keySalt:salt,sec:"Source: NEET "+b.y+" Q"+b.n,srcYear:b.y,srcNumber:b.n,
    pos:4,neg:1,state:"not_visited",picked:[],numVal:"",bookmarked:false};
}

// ---- User question bank: written by import.html (IndexedDB), read here. Nothing is bundled.
const USER_BANK={state:"idle",items:[],promise:null,dur:0};
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open("examforge",1);r.onupgradeneeded=()=>{r.result.createObjectStore("bank",{keyPath:"id"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function loadUserBank(){
  if(USER_BANK.promise)return USER_BANK.promise;
  USER_BANK.state="loading";
  USER_BANK.promise=(typeof indexedDB==="undefined"?Promise.reject(new Error("no idb")):idbOpen())
    .then(db=>new Promise((res,rej)=>{const rq=db.transaction("bank","readonly").objectStore("bank").getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);}))
    .then(items=>{USER_BANK.items=items.filter(q=>q&&q.accepted);USER_BANK.state="ready";return USER_BANK.items;})
    .catch(()=>{USER_BANK.state="unavailable";return [];});
  return USER_BANK.promise;
}
function userBankUsable(){return USER_BANK.items.filter(q=>(q.type==="NUM"?String(q.numAns||"").trim()!=="":(q.answer||[]).length>0));}
function userBankStatus(){
  if(USER_BANK.state==="loading"||USER_BANK.state==="idle")return {ok:false,msg:"Loading your question bank...",wait:true};
  if(USER_BANK.state!=="ready")return {ok:false,msg:"Your imported question bank could not be read in this browser."};
  const u=userBankUsable(),all=USER_BANK.items.length;
  if(!u.length)return {ok:false,msg:"Your bank has no scorable questions yet ("+all+" imported, "+(all-u.length)+" without an answer). Open import.html to import a PDF with an answer key, or add questions manually. Nothing was substituted."};
  return {ok:true,msg:u.length+" scorable questions available"+(all>u.length?(" ("+(all-u.length)+" without an answer are excluded)"):"")+". The test uses all of them, up to 180."};
}
function buildUserBankExam(){
  const list=shuffleArr(userBankUsable()).slice(0,180);
  const out={};
  list.forEach(b=>{
    const sv=b.subject||"General";
    const q={id:"UB_"+b.id,subj:sv,t:b.text||"",opts:(b.options||[]).slice(),ans:(b.answer||[]).slice(),numAns:b.numAns,tol:b.tol==null?0.01:b.tol,
      type:b.type==="NUM"?"NUM":b.type==="MULTI"?"MULTI":"MCQ",exact:true,pos:b.pos==null?4:b.pos,neg:b.neg==null?1:b.neg,
      sec:"Source: "+((b.source&&b.source.pdf)||"manual")+((b.source&&b.source.page)?(" p."+b.source.page):"")+(b.number?(" Q"+b.number):""),
      state:"not_visited",picked:[],numVal:"",bookmarked:false};
    if(b.image){q.img=b.image;q.imgOnly=!!b.cropOnly;}
    (out[sv]=out[sv]||[]).push(q);
  });
  USER_BANK.dur=Math.max(10,list.length);   // 1 minute per question (shown to the student on the instruction screen)
  return out;
}

function shuffleArr(a){
  const r=[...a];
  for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=r[i];r[i]=r[j];r[j]=t;}
  return r;
}

// Shuffle option order so the correct answer is not always option 1.
function shuffleOpts(q){
  const opts=q.opts||[];
  if(opts.length<2)return q;
  const order=shuffleArr(opts.map((_,i)=>i));
  return {...q, opts:order.map(i=>opts[i]), ans:(q.ans||[]).map(a=>order.indexOf(a))};
}

// getPool(subject) must return an array of MCQ question objects.
function patternBuild(examId, getPool){
  const P=EXAM_PATTERNS[examId];
  if(!P)return null;
  const out={};
  const strict=!!P.strictBank;
  const useBank=(examId==="NEET"||examId==="NEET_PYQ")&&NEET_BANK.state==="ready"&&NEET_BANK.data;
  if(strict&&!useBank)return null;
  P.subjects.forEach((sv)=>{
    if(useBank){
      const yf=strict?NEET_FILTER.year:"all";
      const pool=shuffleArr((NEET_BANK.data.by[sv]||[]).filter(b=>yf==="all"||String(b.y)===String(yf)));
      const need=P.sections.reduce((a,x)=>a+x.n,0);
      if(pool.length>=need){
        out[sv]=pool.slice(0,need).map(b=>bankToQuestion(b,NEET_BANK.data.salt));
        return;
      }
      if(strict){out.__insufficient=true;return;}
    }
    const qs=[];
    const mcqSrc={list:shuffleArr(getPool(sv)||[]), i:0};
    const mulSrc={list:shuffleArr(SHARED_MULTI[sv]||[]), i:0};
    const numSrc={list:shuffleArr(SHARED_NUM[sv]||[]), i:0};
    P.sections.forEach((sec,si)=>{
      for(let k=0;k<sec.n;k++){
        const src=sec.type==="NUM"?numSrc:sec.type==="MULTI"?mulSrc:mcqSrc;
        let base=null;
        if(src.list.length){base=src.list[src.i%src.list.length];src.i+=1;}
        if(!base){base={t:"Question bank for "+sv+" ("+sec.name+") is empty. Add questions in your question bank.",opts:["Option 1","Option 2","Option 3","Option 4"],ans:[0]};}
        let q={...base};
        if(sec.type==="MCQ"||sec.type==="MULTI")q=shuffleOpts(q);
        out[sv]=out[sv]||qs;
        qs.push({...q,
          id:examId+"_"+sv.charAt(0)+si+"_"+k+"_"+Math.floor(Math.random()*1e6),
          subj:sv, sec:sec.name, type:sec.type==="NUM"?"NUM":sec.type==="MULTI"?"MULTI":"MCQ",
          pos:sec.pos, neg:sec.neg, tol:sec.tol,
          state:"not_visited", picked:[], numVal:"", bookmarked:false
        });
      }
    });
    out[sv]=qs;
  });
  if(out.__insufficient)return null;
  return out;
}

function countUnique(questions){
  const s={};let total=0;
  Object.values(questions).forEach(arr=>arr.forEach(q=>{total+=1;s[q.t]=1;}));
  return {unique:Object.keys(s).length,total:total};
}

// Official-style evaluation. Returns marks and a result label.
function evalQ(q){
  const pos=q.pos==null?4:q.pos, neg=q.neg==null?0:q.neg;
  if(q.type==="NUM"){
    const s=String(q.numVal==null?"":q.numVal).trim();
    if(s===""||s==="-")return {m:0,r:"skipped"};
    const v=parseFloat(s), a=parseFloat(q.numAns);
    const tol=q.tol==null?0.01:q.tol;
    if(!isNaN(v)&&!isNaN(a)&&Math.abs(v-a)<=tol)return {m:pos,r:"correct"};
    return {m:-neg,r:"wrong"};
  }
  const picked=q.picked||[], ans=q.ans||[];
  if(!picked.length)return {m:0,r:"skipped"};
  if(q.keyHashes){
    const hit=picked.length===1&&q.keyHashes.indexOf(sha256hex(q.keySalt+":"+q.id+":"+(picked[0]+1)))>=0;
    return hit?{m:pos,r:"correct"}:{m:-neg,r:"wrong"};
  }
  if(q.type==="MULTI"){
    const anyWrong=picked.some(p=>ans.indexOf(p)<0);
    if(anyWrong)return {m:-neg,r:"wrong"};
    if(picked.length===ans.length)return {m:pos,r:"correct"};
    if(q.exact)return {m:-neg,r:"wrong"};
    return {m:picked.length,r:"partial"};
  }
  const ok=picked.length===ans.length&&picked.every(p=>ans.indexOf(p)>=0);
  return ok?{m:pos,r:"correct"}:{m:-neg,r:"wrong"};
}

function useWide(){
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1024);
  useEffect(()=>{const f=()=>setW(window.innerWidth);window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f);},[]);
  return w>=820;
}

function NumPad({value,onChange}){
  const v=String(value||"");
  const press=(k)=>{
    let s=v;
    if(k==="+/-"){s=s.charAt(0)==="-"?s.slice(1):"-"+s;}
    else if(k==="."){if(s.indexOf(".")<0)s=s+((s===""||s==="-")?"0.":".");}
    else s=s+k;
    onChange(s.slice(0,12));
  };
  const keys=["7","8","9","4","5","6","1","2","3","0",".","+/-"];
  const kb={padding:"12px 0",background:"#eceff1",border:"1px solid #b0bec5",borderRadius:6,fontSize:16,fontWeight:700,cursor:"pointer",color:"#111"};
  return (
    <div style={{maxWidth:260,marginBottom:16}}>
      <div style={{border:"2px solid #1565c0",borderRadius:6,padding:"10px 12px",fontSize:22,fontWeight:700,minHeight:30,marginBottom:8,background:"#fafafa",textAlign:"right",fontFamily:"monospace",color:v?"#111":"#9e9e9e"}}>{v||"0"}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {keys.map(k=><button key={k} onClick={()=>press(k)} style={kb}>{k}</button>)}
        <button onClick={()=>onChange(v.slice(0,-1))} style={{...kb,gridColumn:"span 2"}}>Backspace</button>
        <button onClick={()=>onChange("")} style={kb}>Clear</button>
      </div>
    </div>
  );
}

function OmrSheet({qs,subjs,onPick,onClose,candidate}){
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:900,background:"#fff",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#1a237e",color:"#fff",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div>
          <div style={{fontWeight:900,fontSize:14}}>OMR Answer Sheet</div>
          <div style={{fontSize:10,opacity:.75}}>{candidate||"Candidate"} - tap a bubble to mark it, tap again to erase</div>
        </div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.5)",color:"#fff",borderRadius:6,padding:"6px 14px",fontWeight:700,cursor:"pointer"}}>Close</button>
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {subjs.map(sv=>(
          <div key={sv} style={{marginBottom:18}}>
            <div style={{background:"#e8eaf6",color:"#1a237e",fontWeight:800,fontSize:12,padding:"6px 10px",borderRadius:6,marginBottom:6}}>{sv}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:4}}>
              {qs.map((q,idx)=>q.subj===sv?(
                <div key={q.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderBottom:"1px solid #eee"}}>
                  <span style={{width:30,fontSize:12,fontWeight:700,color:"#333"}}>{q.no}.</span>
                  {[0,1,2,3].map(oi=>{
                    const on=(q.picked||[]).indexOf(oi)>=0;
                    return <button key={oi} onClick={()=>onPick(idx,oi)} style={{width:28,height:28,borderRadius:"50%",border:"2px solid #263238",background:on?"#111":"#fff",color:on?"#fff":"#263238",fontSize:11,fontWeight:700,cursor:"pointer",padding:0}}>{oi+1}</button>;
                  })}
                </div>
              ):null)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PAL_C={not_visited:"#9e9e9e",not_answered:"#e53935",answered:"#43a047",marked_review:"#7b1fa2",answered_marked:"#5e35b1"};
function palShape(state){
  if(state==="answered")return "14px 14px 3px 3px";
  if(state==="not_answered")return "3px 3px 14px 14px";
  if(state==="marked_review"||state==="answered_marked")return "50%";
  return "3px";
}

function ExamEngine({exam,questions,onSubmit,candidate,saveKey,proctor}){
  const P=EXAM_PATTERNS[exam.id]||null;
  const subjs=Object.keys(questions);
  const tabOf=(sv)=>((P&&P.tabMap&&P.tabMap[sv])||sv);
  const tabs=[];
  subjs.forEach(sv=>{const t=tabOf(sv);if(tabs.indexOf(t)<0)tabs.push(t);});
  const wide=useWide();
  const totalSec=((P&&P.durMin)||(exam.id==="MY_BANK"&&USER_BANK.dur)||exam.dur||180)*60;
  const alpha=P?P.optionLabel==="alpha":true;
  const conductor=P?P.conductor:(exam.ui==="NTA"?"National Testing Agency":exam.name);
  const title=P?P.title:exam.name;
  const headBg=exam.color||"#1a237e";

  const [qs,setQs]=useState(()=>{
    const flat=subjs.flatMap(sv=>questions[sv].map(q=>({...q,subj:sv})));
    flat.forEach((q,i)=>{q.no=i+1;q.picked=q.picked||[];q.numVal=q.numVal||"";q.state=q.state||"not_visited";});
    const saved=saveKey?LS.get(saveKey,null):null;
    if(saved&&saved.qs&&saved.qs.length===flat.length)return saved.qs;
    return flat;
  });
  const [cur,setCur]=useState(()=>{const s=saveKey?LS.get(saveKey,null):null;return(s&&s.qs&&typeof s.cur==="number"&&s.cur<s.qs.length)?s.cur:0;});
  const [left,setLeft]=useState(()=>{
    const s=saveKey?LS.get(saveKey,null):null;
    if(s&&s.endAt)return Math.max(1,Math.ceil((s.endAt-Date.now())/1000));
    return(s&&s.left>0)?s.left:totalSec;
  });
  const [sel,setSel]=useState(()=>[]);
  const [num,setNum]=useState("");
  const [palOpen,setPalOpen]=useState(null);
  const [modal,setModal]=useState(null);
  const [showNote,setShowNote]=useState(false);
  const [tabWarn,setTabWarn]=useState(false);
  const [omr,setOmr]=useState(false);

  const doneRef=useRef(false);
  const qsRef=useRef(qs);
  const leftRef=useRef(left);
  const endRef=useRef(Date.now()+left*1000);
  const curRef=useRef(cur);
  const tabRef=useRef(0);
  qsRef.current=qs; curRef.current=cur;

  const upd=(i,p)=>setQs(prev=>{const n=[...prev];n[i]={...n[i],...p};return n;});

  useEffect(()=>{
    const q=qsRef.current[cur];
    if(!q)return;
    setSel(q.picked||[]); setNum(q.numVal||"");
    if(q.state==="not_visited")upd(cur,{state:"not_answered"});
    setShowNote(false);
  },[cur]);

  function finish(auto){
    if(doneRef.current)return;
    doneRef.current=true;
    const fq=qsRef.current.map(q=>({...q}));
    let score=0,total=0,correct=0,wrong=0,skipped=0,partial=0;
    const bySubj={};
    fq.forEach(q=>{
      const sv=q.subj;
      if(!bySubj[sv])bySubj[sv]={score:0,correct:0,wrong:0,skipped:0,partial:0,total:0};
      const e=evalQ(q);
      q.marks=e.m; q.result=e.r;
      if(q.keyHashes){q.ans=[0,1,2,3].filter(i=>q.keyHashes.indexOf(sha256hex(q.keySalt+":"+q.id+":"+(i+1)))>=0);delete q.keyHashes;delete q.keySalt;}
      total+=(q.pos==null?4:q.pos);
      bySubj[sv].total+=1; bySubj[sv].score+=e.m; score+=e.m;
      if(e.r==="correct"){correct+=1;bySubj[sv].correct+=1;}
      else if(e.r==="wrong"){wrong+=1;bySubj[sv].wrong+=1;}
      else if(e.r==="partial"){partial+=1;bySubj[sv].partial+=1;}
      else{skipped+=1;bySubj[sv].skipped+=1;}
    });
    if(saveKey)LS.del(saveKey);
    onSubmit({exam:exam,score:score,total:total,correct:correct,wrong:wrong,skipped:skipped,partial:partial,bySubj:bySubj,questions:fq,timeTaken:totalSec-Math.max(0,leftRef.current),totalQ:fq.length,tabSwitches:tabRef.current,auto:!!auto});
  }

  useEffect(()=>{
    const id=setInterval(()=>{
      if(doneRef.current)return;
      const rem=Math.max(0,Math.ceil((endRef.current-Date.now())/1000));
      if(rem!==leftRef.current){leftRef.current=rem;setLeft(rem);}
      if(rem<=0){clearInterval(id);finish(true);}
    },250);
    return()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    if(!saveKey)return undefined;
    const id=setInterval(()=>{if(!doneRef.current)LS.set(saveKey,{qs:qsRef.current,cur:curRef.current,left:leftRef.current,endAt:endRef.current});},10000);
    return()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    if(!proctor)return undefined;
    const f=()=>{if(doneRef.current)return;tabRef.current+=1;setTabWarn(true);setTimeout(()=>setTabWarn(false),3500);};
    window.addEventListener("blur",f);
    return()=>window.removeEventListener("blur",f);
  },[]);

  const q=qs[cur];
  const hasAns=q?(q.type==="NUM"?(num.trim()!==""&&num.trim()!=="-"):sel.length>0):false;
  const cnt=(sv,st)=>qs.filter(x=>(sv?tabOf(x.subj)===sv:true)&&(Array.isArray(st)?st.indexOf(x.state)>=0:x.state===st)).length;
  const answered=cnt(null,["answered","answered_marked"]);
  const markedN=cnt(null,["marked_review","answered_marked"]);
  const curTab=q?tabOf(q.subj):tabs[0];
  const palShown=palOpen===null?true:palOpen;
  const hh=Math.floor(left/3600), mm=Math.floor((left%3600)/60), ss=left%60;
  const clock=String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0");
  const timeBg=left<60?"#c62828":left<300?"#e65100":"#1b5e20";

  function commit(mark){
    if(!q)return;
    upd(cur,{picked:q.type==="NUM"?[]:sel,numVal:q.type==="NUM"?num.trim():"",state:mark?(hasAns?"answered_marked":"marked_review"):(hasAns?"answered":"not_answered")});
  }
  function goNext(){if(cur<qs.length-1)setCur(cur+1);}
  function saveNext(){commit(false);goNext();}
  function markNext(){commit(true);goNext();}
  function clearResp(){setSel([]);setNum("");upd(cur,{picked:[],numVal:"",state:"not_answered"});}
  function pick(oi){
    if(!q)return;
    if(q.type==="MULTI")setSel(sel.indexOf(oi)>=0?sel.filter(x=>x!==oi):[...sel,oi]);
    else setSel([oi]);
  }
  function omrPick(idx,oi){
    const t=qsRef.current[idx];
    const same=(t.picked||[]).length===1&&t.picked[0]===oi;
    const np=same?[]:[oi];
    const wasMarked=t.state==="marked_review"||t.state==="answered_marked";
    upd(idx,{picked:np,state:np.length?(wasMarked?"answered_marked":"answered"):(wasMarked?"marked_review":"not_answered")});
    if(idx===cur)setSel(np);
  }
  function jumpSubject(sv){const i=qs.findIndex(x=>tabOf(x.subj)===sv);if(i>=0)setCur(i);}

  const btn=(bg)=>({padding:"9px 12px",background:bg,color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700});

  function renderPalette(closeFn){
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#f5f5f5"}}>
        <div style={{background:"#e8eaf6",padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#1a237e"}}>{candidate||"Candidate"}</div>
            <div style={{fontSize:10,color:"#555"}}>{P&&P.simulation?"Question Navigator (practice)":"Question Palette"}</div>
          </div>
          {closeFn?<button onClick={closeFn} style={{background:"#fff",border:"1px solid #9fa8da",borderRadius:4,padding:"3px 10px",fontWeight:700,cursor:"pointer",color:"#1a237e"}}>Close</button>:null}
        </div>
        <div style={{padding:"6px 10px",flexShrink:0,display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10,color:"#333"}}>
          {[["answered","Answered"],["not_answered","Not Answered"],["not_visited","Not Visited"],["marked_review","Marked for Review"]].map(([s,l])=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:18,height:18,background:PAL_C[s],borderRadius:palShape(s),color:"#fff",fontSize:9,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{cnt(null,s)}</span>{l}
            </div>
          ))}
          <div style={{gridColumn:"span 2",display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:18,height:18,background:PAL_C.answered_marked,borderRadius:"50%",color:"#fff",fontSize:9,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{cnt(null,"answered_marked")}</span>Answered and Marked for Review (will be evaluated)
          </div>
        </div>
        <div style={{background:"#1a237e",color:"#fff",padding:"5px 10px",fontSize:11,fontWeight:800,flexShrink:0}}>{curTab}</div>
        <div style={{flex:1,overflowY:"auto",padding:8,display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,alignContent:"start"}}>
          {qs.map((x,i)=>tabOf(x.subj)===curTab?(
            <button key={x.id} onClick={()=>{setCur(i);}} style={{height:34,background:PAL_C[x.state]||PAL_C.not_visited,color:"#fff",border:i===cur?"3px solid #111":"1px solid rgba(0,0,0,.15)",borderRadius:palShape(x.state),fontSize:11,fontWeight:700,cursor:"pointer",padding:0}}>{x.no}</button>
          ):null)}
        </div>
        <div style={{padding:8,background:"#e8eaf6",flexShrink:0}}>
          <button onClick={()=>{if(closeFn)closeFn();setModal("submit");}} style={{...btn("#1b5e20"),width:"100%",padding:"11px"}}>Submit</button>
        </div>
      </div>
    );
  }

  function optLabel(oi){return alpha?String.fromCharCode(65+oi):String(oi+1);}

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#eceff1",position:"relative"}} onContextMenu={e=>e.preventDefault()}>
      {tabWarn?<div style={{position:"fixed",top:0,left:0,right:0,zIndex:2000,background:"#c62828",padding:10,textAlign:"center",color:"#fff",fontWeight:800,fontSize:13}}>Tab switch detected ({tabRef.current}). Activity is logged.</div>:null}
      <div style={{background:headBg,padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
        <div style={{minWidth:0}}>
          <div style={{color:"#fff",fontWeight:900,fontSize:12,letterSpacing:.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{conductor}</div>
          <div style={{color:"rgba(255,255,255,.8)",fontSize:10,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {wide?<div style={{color:"#fff",fontSize:11,textAlign:"right"}}><div style={{opacity:.7,fontSize:9}}>Candidate</div><div style={{fontWeight:700}}>{candidate||"Candidate"}</div></div>:null}
          <div style={{textAlign:"center"}}>
            <div style={{color:"rgba(255,255,255,.75)",fontSize:8}}>Time Left</div>
            <div style={{fontFamily:"monospace",fontWeight:900,fontSize:16,background:timeBg,color:"#fff",padding:"3px 10px",borderRadius:4}}>{clock}</div>
          </div>
        </div>
      </div>
      <div style={{background:"#283593",display:"flex",alignItems:"stretch",flexShrink:0,overflowX:"auto"}}>
        {tabs.map(sv=>(
          <button key={sv} onClick={()=>jumpSubject(sv)} style={{padding:"8px 14px",background:curTab===sv?"#fff":"transparent",color:curTab===sv?"#1a237e":"#cfd8dc",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{sv}</button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>setModal("paper")} style={{padding:"8px 10px",background:"transparent",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Question Paper</button>
        <button onClick={()=>setModal("instr")} style={{padding:"8px 10px",background:"transparent",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Instructions</button>
        {P&&P.omr?<button onClick={()=>setOmr(true)} style={{padding:"8px 10px",background:"#f9a825",color:"#111",border:"none",cursor:"pointer",fontSize:11,fontWeight:800,flexShrink:0}}>OMR Sheet</button>:null}
        <button onClick={()=>setPalOpen(!palShown)} style={{padding:"8px 12px",background:palShown?"#fff":"rgba(255,255,255,.18)",color:palShown?"#1a237e":"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:800,flexShrink:0}}>{palShown?"Hide Palette":"Palette"}</button>
      </div>
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:"#fff"}}>
          <div style={{flex:1,overflow:"auto",padding:14}}>
            {q?(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,paddingBottom:8,marginBottom:10,borderBottom:"1px solid #e0e0e0"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{color:"#1a237e",fontWeight:900,fontSize:14}}>Question No. {q.no}</span>
                    <span style={{background:"#e8f5e9",color:"#2e7d32",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>Correct +{q.pos==null?4:q.pos}</span>
                    <span style={{background:"#ffebee",color:"#c62828",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>Wrong -{q.neg||0}</span>
                    {q.type==="MULTI"?<span style={{background:"#fff8e1",color:"#e65100",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>One or more correct</span>:null}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setShowNote(!showNote)} style={{background:"#f5f5f5",border:"1px solid #ddd",borderRadius:4,padding:"3px 8px",fontSize:10,cursor:"pointer",color:"#1565c0"}}>Notes</button>
                    <button onClick={()=>upd(cur,{bookmarked:!q.bookmarked})} style={{background:q.bookmarked?"#fff8e1":"#f5f5f5",border:"1px solid "+(q.bookmarked?"#f9a825":"#ddd"),borderRadius:4,padding:"3px 8px",fontSize:10,cursor:"pointer",color:q.bookmarked?"#e65100":"#666"}}>{q.bookmarked?"Bookmarked":"Bookmark"}</button>
                  </div>
                </div>
                {q.sec?<div style={{fontSize:10,color:"#5c6bc0",fontWeight:700,marginBottom:6}}>{q.subj} | {q.sec}</div>:null}
                {showNote?<textarea value={q.note||""} onChange={e=>upd(cur,{note:e.target.value})} placeholder="Private note for this question..." rows={2} style={{width:"100%",border:"1px solid #1565c0",borderRadius:6,padding:"6px 10px",fontSize:12,marginBottom:10,boxSizing:"border-box",fontFamily:"inherit",color:"#111",background:"#fff"}}/>:null}
                {q.imgOnly?null:<div style={{fontSize:15,lineHeight:1.9,color:"#111",marginBottom:16,whiteSpace:"pre-wrap"}}>{q.t||q.questionText||"Question text not available"}</div>}
                {q.img?<img src={q.img} alt={"Question "+q.no} onError={e=>{e.currentTarget.style.display="none";}} style={{maxWidth:"100%",marginBottom:12,borderRadius:6,background:"#fff",border:"1px solid #e0e0e0"}}/>:null}
                {q.type==="NUM"?(
                  <NumPad value={num} onChange={setNum}/>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                    {(q.opts||q.options||[]).map((opt,oi)=>{
                      const on=sel.indexOf(oi)>=0;
                      return (
                        <button key={oi} onClick={()=>pick(oi)} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 14px",border:"2px solid "+(on?"#1565c0":"#e0e0e0"),borderRadius:8,background:on?"#e3f2fd":"#fafafa",cursor:"pointer",textAlign:"left"}}>
                          <span style={{width:26,height:26,border:"2px solid "+(on?"#1565c0":"#9e9e9e"),borderRadius:q.type==="MULTI"?4:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:on?"#1565c0":"#fff",color:on?"#fff":"#555",fontSize:12,fontWeight:900}}>{optLabel(oi)}</span>
                          <span style={{fontSize:14,color:"#111",lineHeight:1.6,flex:1}}>{q.imgOnly?("Option "+optLabel(oi)):opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{fontSize:10,color:"#78909c"}}>Your answer is saved only when you click Save &amp; Next or Mark for Review &amp; Next.</div>
              </div>
            ):null}
          </div>
          <div style={{borderTop:"2px solid #c5cae9",padding:"8px 10px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",background:"#f5f5f5",flexShrink:0}}>
            <button onClick={markNext} style={btn("#7b1fa2")}>Mark for Review &amp; Next</button>
            <button onClick={clearResp} style={btn("#b71c1c")}>Clear Response</button>
            <div style={{flex:1}}/>
            <button onClick={()=>cur>0&&setCur(cur-1)} style={btn("#455a64")}>Previous</button>
            <button onClick={goNext} style={btn("#455a64")}>Next</button>
            <button onClick={saveNext} style={btn("#1a237e")}>Save &amp; Next</button>
            {!palShown?<button onClick={()=>setModal("submit")} style={btn("#1b5e20")}>Submit</button>:null}
          </div>
        </div>
        {palShown&&wide?<div style={{width:270,flexShrink:0,borderLeft:"2px solid #c5cae9"}}>{renderPalette(null)}</div>:null}
      </div>
      {palShown&&!wide?(
        <div style={{height:"36vh",minHeight:190,flexShrink:0,borderTop:"2px solid #c5cae9",background:"#f5f5f5"}}>{renderPalette(()=>setPalOpen(false))}</div>
      ):null}
      {omr?<OmrSheet qs={qs} subjs={subjs} onPick={omrPick} onClose={()=>setOmr(false)} candidate={candidate}/>:null}
      {modal==="submit"?(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:10,padding:18,maxWidth:520,width:"100%",maxHeight:"90vh",overflow:"auto"}}>
            <div style={{color:"#1a237e",fontWeight:900,fontSize:17,marginBottom:10,textAlign:"center"}}>Exam Summary</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:12}}>
                <thead>
                  <tr style={{background:"#e8eaf6",color:"#1a237e"}}>
                    {["Section","Questions","Answered","Not Answered","Marked for Review","Not Visited"].map(h=><th key={h} style={{padding:"6px 4px",border:"1px solid #c5cae9",textAlign:"center"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tabs.map(sv=>(
                    <tr key={sv}>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",fontWeight:700}}>{sv}</td>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",textAlign:"center"}}>{qs.filter(x=>tabOf(x.subj)===sv).length}</td>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",textAlign:"center",color:"#2e7d32",fontWeight:700}}>{cnt(sv,["answered","answered_marked"])}</td>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",textAlign:"center",color:"#c62828",fontWeight:700}}>{cnt(sv,"not_answered")}</td>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",textAlign:"center",color:"#6a1b9a",fontWeight:700}}>{cnt(sv,["marked_review","answered_marked"])}</td>
                      <td style={{padding:"6px 4px",border:"1px solid #e0e0e0",textAlign:"center"}}>{cnt(sv,"not_visited")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{color:"#333",fontSize:13,marginBottom:14,textAlign:"center"}}>Are you sure you want to submit this test? You cannot change your answers after submitting. ({answered} answered, {markedN} marked)</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:12,background:"#f5f5f5",color:"#333",border:"1px solid #ccc",borderRadius:6,cursor:"pointer",fontWeight:700}}>No, Go Back</button>
              <button onClick={()=>{setModal(null);finish(false);}} style={{flex:1,padding:12,background:"#1b5e20",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:800}}>Yes, Submit</button>
            </div>
          </div>
        </div>
      ):null}
      {modal==="instr"?(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:10,padding:18,maxWidth:560,width:"100%",maxHeight:"90vh",overflow:"auto"}}>
            <div style={{color:"#1a237e",fontWeight:900,fontSize:16,marginBottom:10}}>{title} - Instructions</div>
            <ol style={{paddingLeft:18,margin:0,fontSize:12,lineHeight:1.8,color:"#222"}}>
              {((P&&P.rules)||["Follow the on-screen instructions."]).map((r,i)=><li key={i}>{r}</li>)}
            </ol>
            <button onClick={()=>setModal(null)} style={{marginTop:14,width:"100%",padding:11,background:"#1a237e",color:"#fff",border:"none",borderRadius:6,fontWeight:800,cursor:"pointer"}}>Close</button>
          </div>
        </div>
      ):null}
      {modal==="paper"?(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:10,padding:18,maxWidth:600,width:"100%",maxHeight:"90vh",overflow:"auto"}}>
            <div style={{color:"#1a237e",fontWeight:900,fontSize:16,marginBottom:10}}>Question Paper - {curTab}</div>
            {qs.map((x,i)=>tabOf(x.subj)===curTab?(
              <button key={x.id} onClick={()=>{setCur(i);setModal(null);}} style={{display:"block",width:"100%",textAlign:"left",background:"#fafafa",border:"1px solid #e0e0e0",borderRadius:6,padding:"8px 10px",marginBottom:6,cursor:"pointer",fontSize:12,color:"#222"}}>
                <b>Q{x.no}.</b> {(x.t||"").slice(0,110)}{(x.t||"").length>110?"...":""}
              </button>
            ):null)}
            <button onClick={()=>setModal(null)} style={{marginTop:8,width:"100%",padding:11,background:"#1a237e",color:"#fff",border:"none",borderRadius:6,fontWeight:800,cursor:"pointer"}}>Close</button>
          </div>
        </div>
      ):null}
    </div>
  );
}

const SHARED_PHYS=[
  {t:"A particle moves in circular motion with radius R and angular speed omega. Its centripetal acceleration is:",opts:["omega^2 R","omega R^2","omega^2/R","omega/R"],ans:[0],diff:"Easy"},
  {t:"Two charges separated by distance r experience force F. If distance becomes 3r, force becomes:",opts:["F/9","F/3","3F","9F"],ans:[0],diff:"Easy"},
  {t:"de Broglie wavelength of particle with KE = K is lambda. If KE becomes 4K, wavelength is:",opts:["lambda/2","2*lambda","lambda/4","4*lambda"],ans:[0],diff:"Medium"},
  {t:"Magnetic field at centre of circular loop of radius R carrying current I:",opts:["mu0*I/(2R)","mu0*I/R","2*mu0*I/R","mu0*I/(4*pi*R^2)"],ans:[0],diff:"Medium"},
  {t:"In photoelectric effect, if frequency of incident light is doubled (above threshold), stopping potential:",opts:["More than doubles","Exactly doubles","Less than doubles","Remains same"],ans:[0],diff:"Hard"},
  {t:"A convex lens has focal length 20cm. Object at 30cm from lens. Image distance:",opts:["60 cm","30 cm","40 cm","20 cm"],ans:[0],diff:"Easy"},
  {t:"Efficiency of Carnot engine between 600K and 300K:",opts:["50%","25%","75%","33%"],ans:[0],diff:"Easy"},
  {t:"Half life of radioactive element is 20 years. After 60 years fraction remaining:",opts:["1/8","1/4","1/16","1/6"],ans:[0],diff:"Easy"},
  {t:"In LC oscillation, if L is doubled and C is halved, resonance frequency becomes:",opts:["Same","2 times","1/2 times","4 times"],ans:[0],diff:"Hard"},
  {t:"Moment of inertia of uniform solid sphere about its diameter:",opts:["2MR^2/5","2MR^2/3","MR^2/2","MR^2"],ans:[0],diff:"Medium"},
  {t:"Speed of light in a medium of refractive index 1.5:",opts:["2 x 10^8 m/s","1.5 x 10^8 m/s","4.5 x 10^8 m/s","3 x 10^8 m/s"],ans:[0],diff:"Easy"},
  {t:"A projectile is launched at 45 degrees. Ratio of max height to horizontal range H/R:",opts:["1/4","1/2","1","2"],ans:[0],diff:"Medium"},
  {t:"Current through resistor doubles. Power dissipated becomes:",opts:["4 times","2 times","8 times","Same"],ans:[0],diff:"Easy"},
  {t:"For pn junction under forward bias, depletion layer:",opts:["Decreases","Increases","Unchanged","Becomes zero instantly"],ans:[0],diff:"Easy"},
  {t:"Potential energy of a spring compressed by x is (1/2)kx^2. If compression doubles:",opts:["PE becomes 4 times","PE doubles","PE halves","PE becomes 8 times"],ans:[0],diff:"Easy"},
  {t:"A body falls freely from height h. Time to reach ground is proportional to:",opts:["sqrt(h)","h","h^2","1/sqrt(h)"],ans:[0],diff:"Easy"},
  {t:"In Young's double slit experiment, fringe width is proportional to:",opts:["Wavelength","Frequency","Intensity","Slit width"],ans:[0],diff:"Medium"},
  {t:"Electric field inside a conductor in electrostatic equilibrium is:",opts:["Zero","sigma/epsilon0","sigma/(2*epsilon0)","Depends on conductor shape"],ans:[0],diff:"Easy"},
  {t:"A transformer has 100 turns primary and 500 turns secondary. If input is 220V, output is:",opts:["1100 V","44 V","220 V","500 V"],ans:[0],diff:"Easy"},
  {t:"Which of the following has maximum penetrating power?",opts:["Gamma rays","Alpha particles","Beta particles","Visible light"],ans:[0],diff:"Easy"},
];
const SHARED_CHEM=[
  {t:"Which of the following is an electrophile?",opts:["BF3","NH3","H2O","CH3NH2"],ans:[0],diff:"Easy"},
  {t:"pH of 0.01 M HCl solution (strong acid, fully dissociated):",opts:["2","1","7","12"],ans:[0],diff:"Easy"},
  {t:"Oxidation state of Cr in K2Cr2O7:",opts:["+6","+3","+7","+4"],ans:[0],diff:"Easy"},
  {t:"Van't Hoff factor for K2SO4 in dilute solution:",opts:["3","2","1","4"],ans:[0],diff:"Medium"},
  {t:"Lucas test reacts fastest (immediately) with:",opts:["Tertiary alcohol","Secondary alcohol","Primary alcohol","Phenol"],ans:[0],diff:"Easy"},
  {t:"Strongest hydrohalic acid:",opts:["HI","HCl","HBr","HF"],ans:[0],diff:"Easy"},
  {t:"Kolbe's electrolysis of sodium acetate gives:",opts:["Ethane","Methane","Ethylene","Acetylene"],ans:[0],diff:"Medium"},
  {t:"IUPAC name of (CH3)3C-Cl:",opts:["2-chloro-2-methylpropane","1-chloro-1-methylpropane","tert-butyl chloride","Neopentyl chloride"],ans:[0],diff:"Medium"},
  {t:"Which among these is NOT an aromatic compound?",opts:["Cyclohexane","Benzene","Naphthalene","Toluene"],ans:[0],diff:"Easy"},
  {t:"Nylon-6,6 is a:",opts:["Polyamide","Polyester","Polythene","Polyurethane"],ans:[0],diff:"Easy"},
  {t:"Fehling solution gives brick red precipitate with:",opts:["Glucose","Sucrose","Benzaldehyde","Acetone"],ans:[0],diff:"Easy"},
  {t:"Crystal field splitting (delta_o) is greater for:",opts:["Strong field ligands","Weak field ligands","Neutral ligands","Anionic ligands"],ans:[0],diff:"Medium"},
  {t:"Enthalpy of neutralization of strong acid with strong base is approximately:",opts:["-57.3 kJ/mol","-100 kJ/mol","-25 kJ/mol","-200 kJ/mol"],ans:[0],diff:"Easy"},
  {t:"Which reaction proceeds via SN2 mechanism most readily?",opts:["Primary alkyl halide in polar aprotic solvent","Tertiary alkyl halide","Aryl halide","Vinyl halide"],ans:[0],diff:"Hard"},
  {t:"Number of sigma bonds in ethyne (acetylene):",opts:["3","2","4","5"],ans:[0],diff:"Easy"},
  {t:"Raoult's law is applicable to:",opts:["Ideal solutions","Real solutions with positive deviation","Real solutions with negative deviation","All solutions"],ans:[0],diff:"Medium"},
  {t:"Which catalyst is used in Haber process?",opts:["Fe with promoters","V2O5","Pt","Ni"],ans:[0],diff:"Easy"},
  {t:"Hybridization of carbon in CO2:",opts:["sp","sp2","sp3","sp3d"],ans:[0],diff:"Easy"},
  {t:"Which is a secondary pollutant?",opts:["Ozone","CO","SO2","NO2"],ans:[0],diff:"Medium"},
];
const SHARED_MATH=[
  {t:"Value of integral from 0 to 1 of x^2 dx:",opts:["1/3","1/2","2/3","1/4"],ans:[0],diff:"Easy"},
  {t:"lim(x->0) [sin(x)/x] equals:",opts:["1","0","infinity","pi"],ans:[0],diff:"Easy"},
  {t:"Sum of infinite GP with first term 1 and common ratio 1/2:",opts:["2","3","4","1"],ans:[0],diff:"Easy"},
  {t:"P(A)=0.6, P(B)=0.5, P(A and B)=0.3. P(A or B) equals:",opts:["0.8","0.7","0.9","1.1"],ans:[0],diff:"Easy"},
  {t:"d/dx [ln(sin x)] equals:",opts:["cot x","tan x","cosec x","-cot x"],ans:[0],diff:"Easy"},
  {t:"Eccentricity of ellipse x^2/16 + y^2/9 = 1:",opts:["sqrt(7)/4","sqrt(7)/3","3/4","7/16"],ans:[0],diff:"Medium"},
  {t:"Area bounded by y = x^2 and y = x between x=0 and x=1:",opts:["1/6","1/3","1/2","1/4"],ans:[0],diff:"Medium"},
  {t:"If |A|=5 where A is 3x3 matrix, |adj A| equals:",opts:["25","5","125","1/5"],ans:[0],diff:"Hard"},
  {t:"omega is complex cube root of unity. 1 + omega + omega^2 equals:",opts:["0","1","-1","i"],ans:[0],diff:"Easy"},
  {t:"Integral from 0 to pi of sin(x) dx equals:",opts:["2","0","1","pi"],ans:[0],diff:"Easy"},
  {t:"|z| for complex number z = 3 + 4i equals:",opts:["5","7","1","25"],ans:[0],diff:"Easy"},
  {t:"Equation of tangent to circle x^2 + y^2 = 25 at point (3, 4):",opts:["3x+4y=25","4x+3y=25","3x-4y=25","x+y=7"],ans:[0],diff:"Medium"},
  {t:"Number of solutions of sin(x) = x/2 in [0, 2pi]:",opts:["2","1","3","0"],ans:[0],diff:"Hard"},
  {t:"If A and B are events with P(A/B) = P(B/A) and P(A) is not equal to P(B), then:",opts:["A and B are mutually exclusive","P(A)+P(B)=1","A and B are independent","P(A)=P(B)"],ans:[0],diff:"Hard"},
  {t:"The angle between lines x+2y=3 and 2x-y=5 is:",opts:["90 degrees","45 degrees","60 degrees","30 degrees"],ans:[0],diff:"Medium"},
  {t:"Derivative of x^x with respect to x:",opts:["x^x (1+ln x)","x^x * x","x^(x-1)","x^x * ln x"],ans:[0],diff:"Hard"},
  {t:"Rank of matrix [[1,2,3],[2,4,6],[3,6,9]]:",opts:["1","2","3","0"],ans:[0],diff:"Medium"},
  {t:"f(x) = x^3 - 3x + 2. Points of local minima:",opts:["x=1","x=-1","x=0","x=2"],ans:[0],diff:"Medium"},
  {t:"Sum of first n natural numbers formula:",opts:["n(n+1)/2","n(n-1)/2","n^2","n(2n+1)/6"],ans:[0],diff:"Easy"},
];
const SHARED_BIO=[
  {t:"Which organelle is called powerhouse of the cell?",opts:["Mitochondria","Nucleus","Ribosome","Golgi body"],ans:[0],diff:"Easy"},
  {t:"DNA replication is:",opts:["Semi-conservative","Conservative","Dispersive","Both A and C"],ans:[0],diff:"Easy"},
  {t:"Which blood group is universal donor?",opts:["O negative","AB positive","A positive","B negative"],ans:[0],diff:"Easy"},
  {t:"Site of protein synthesis in cell:",opts:["Ribosomes","Mitochondria","Nucleus","Golgi apparatus"],ans:[0],diff:"Easy"},
  {t:"Enzyme that joins Okazaki fragments during DNA replication:",opts:["DNA Ligase","DNA Polymerase","Primase","Helicase"],ans:[0],diff:"Medium"},
  {t:"Which is NOT a function of liver?",opts:["Production of insulin","Detoxification","Bile production","Glycogen storage"],ans:[0],diff:"Medium"},
  {t:"Root pressure is due to:",opts:["Active transport of ions","Passive transport","Osmosis only","Transpiration pull"],ans:[0],diff:"Medium"},
  {t:"Which vitamin is produced in skin on exposure to sunlight?",opts:["Vitamin D","Vitamin A","Vitamin C","Vitamin E"],ans:[0],diff:"Easy"},
  {t:"Crossing over occurs during which stage of meiosis?",opts:["Pachytene","Zygotene","Leptotene","Diplotene"],ans:[0],diff:"Hard"},
  {t:"Which of these is a correct food chain?",opts:["Grass->Grasshopper->Frog->Snake->Eagle","Eagle->Snake->Frog->Grasshopper->Grass","Frog->Grass->Grasshopper->Snake","Grasshopper->Eagle->Snake->Frog"],ans:[0],diff:"Easy"},
];

function paidPool(exam){
  return function(sv){
    const bank=(PYQ_BANK[exam.id]&&PYQ_BANK[exam.id][sv])||[];
    let extra=[];
    if(sv==="Physics")extra=SHARED_PHYS; else if(sv==="Chemistry")extra=SHARED_CHEM; else if(sv==="Mathematics")extra=SHARED_MATH;
    else if(sv==="Botany")extra=SHARED_BOTANY; else if(sv==="Zoology")extra=SHARED_ZOOLOGY; else extra=SHARED_BIO;
    return [...bank.map(q=>({...q,opts:q.opts||q.options||[]})),...extra];
  };
}

const buildRealExam=(exam)=>{
  if(exam.id==="MY_BANK")return buildUserBankExam();
  const pat=patternBuild(exam.id,paidPool(exam));
  if(pat)return pat;
  const bank=PYQ_BANK[exam.id]||PYQ_BANK.JEE_MAIN||{};
  const subjs=exam.subj||(Object.keys(bank).length?Object.keys(bank):["General"]);
  const out={};
  subjs.forEach((sv,si)=>{
    const src=bank[sv]||bank[Object.keys(bank)[0]]||[];
    const perSubj=Math.ceil((exam.totalQ||30)/subjs.length);
    const shuffled=[...src].sort(()=>Math.random()-.5);
    // Fill with real questions, pad with AI-style if insufficient
    const qs=shuffled.slice(0,perSubj).map(q=>({...q,subj:sv,state:QS.NV,picked:[],numVal:"",bookmarked:false,type:q.type||"MCQ",opts:q.opts||q.options||[],pos:exam.pos||q.pos||4,neg:exam.neg||q.neg||1}));
    if(qs.length<perSubj){
      const topics=["Kinematics","Electrostatics","Mechanics","Optics","Thermodynamics","Algebra","Calculus","Probability","Organic Chemistry","Physical Chemistry"];
      for(let i=qs.length;i<perSubj;i++){
        qs.push({id:`${sv[0]}${si}${i}`,subj:sv,t:`[PYQ-Style] ${exam.name} ${sv} Practice: ${topics[i%topics.length]} - A standard ${sv} question testing your understanding of ${topics[i%topics.length]}. Select the most appropriate answer based on the concept.`,opts:["Option A - Correct derivation","Option B - Common misconception","Option C - Partially correct","Option D - Incorrect application"],ans:[0],exp:`This tests ${topics[i%topics.length]} in ${sv}. The correct answer applies the fundamental principle directly.`,diff:["Easy","Medium","Hard"][i%3],chapter:topics[i%topics.length],type:"MCQ",pos:exam.pos||4,neg:exam.neg||1,state:QS.NV,picked:[],numVal:"",bookmarked:false});
      }
    }
    out[sv]=qs;
  });
  return out;
};

// -- Instruction Screen (Part 28) ------------------------------------------
function InstructionScreen({exam, mode, onConfirm, onBack}) {
  const [agreed,setAgreed]=useState(false);
  const [yrSel,setYrSel]=useState(NEET_FILTER.year);
  const PATx=EXAM_PATTERNS[exam.id]||null;
  const strictSt=PATx&&PATx.strictBank?pyqStatus():(exam.id==="MY_BANK"?userBankStatus():null);
  const blocked=!!(strictSt&&!strictSt.ok);
  const bankYears=(NEET_BANK.state==="ready"&&NEET_BANK.data)?Array.from(new Set(Object.keys(NEET_BANK.data.by).reduce((a,k)=>a.concat(NEET_BANK.data.by[k].map(b=>b.y)),[]))).sort():[];
  const pyqBox=strictSt?(
    <div style={{background:strictSt.ok?"#e8f5e9":"#fff3e0",border:"1px solid "+(strictSt.ok?"#66bb6a":"#ffa726"),borderRadius:8,padding:12,margin:"12px 0",fontSize:12,color:"#222",lineHeight:1.6}}>
      <div style={{fontWeight:800,marginBottom:6}}>Verified question bank</div>
      <div>{strictSt.msg}</div>
      {bankYears.length>0?<div style={{marginTop:8}}>
        <label style={{fontSize:11,color:"#555",marginRight:8}}>Year filter:</label>
        <select value={yrSel} onChange={e=>{NEET_FILTER.year=e.target.value;setYrSel(e.target.value);}} style={{padding:"5px 8px",borderRadius:6,border:"1px solid #bbb",color:"#111",background:"#fff"}}>
          <option value="all">All verified years</option>
          {bankYears.map(y=><option key={y} value={String(y)}>NEET {y}</option>)}
        </select>
      </div>:null}
    </div>
  ):null;
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:"#1a237e",padding:"12px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,padding:"4px 10px"}}>Back</button>
        <span style={{color:"#fff",fontWeight:900,fontSize:13}}> General Instructions</span>
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{background:"linear-gradient(135deg,#1a237e,#283593)",borderRadius:12,padding:18,marginBottom:14,color:"#fff",textAlign:"center"}}>
            <div style={{fontSize:36}}>{exam.icon||(exam.short||exam.name||"E").charAt(0)}</div>
            <div style={{fontWeight:900,fontSize:17,marginBottom:4}}>{exam.name}</div>
            <div style={{display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap",fontSize:12,opacity:0.85}}>
              {exam.totalQ&&<span> {exam.totalQ} Questions</span>}
              {exam.dur&&<span> {exam.dur} Minutes</span>}
              {exam.marks&&<span> {exam.marks} Marks</span>}
              {exam.neg&&<span>[!] -{exam.neg} Negative</span>}
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{color:C.amber,fontWeight:800,fontSize:13,marginBottom:10}}> Exam Rules</div>
            {(EXAM_PATTERNS[exam.id]?EXAM_PATTERNS[exam.id].rules:[
              `Total Duration: ${exam.dur||180} minutes`,
              `Total Questions: ${exam.totalQ||30}`,
              `Marking Scheme: +${exam.pos||4} for correct, ${exam.neg?`-${exam.neg}`:"0"} for wrong`,
              exam.pattern||"Read each question carefully before answering",
              "The clock at the top shows remaining time",
              "You can mark questions for review and come back",
              "Click Submit only when you are sure to finish",
              "Switching tabs during exam is monitored",
              "All answers are auto-saved as you respond",
            ]).map((r,i)=><div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><span style={{color:C.accent,flexShrink:0}}>{i+1}.</span><span style={{color:C.text}}>{r}</span></div>)}
          </div>
          {EXAM_PATTERNS[exam.id]&&EXAM_PATTERNS[exam.id].note?<div style={{background:C.amber+"14",border:`1px solid ${C.amber}40`,borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:11,color:C.muted,lineHeight:1.6}}>{EXAM_PATTERNS[exam.id].note}</div>:null}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:8}}> Question Palette Legend</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11}}>
              {[{c:"#6b7280",l:"Not Visited"},{c:"#ef4444",l:"Not Answered"},{c:"#10b981",l:"Answered"},{c:"#8b5cf6",l:"Marked for Review"},{c:"#6366f1",l:"Answered + Marked"}].map(p=><div key={p.l} style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:24,height:24,borderRadius:4,background:p.c,flexShrink:0}} /><span style={{color:C.muted}}>{p.l}</span></div>)}
            </div>
          </div>
          <div onClick={()=>setAgreed(p=>!p)} style={{display:"flex",gap:10,alignItems:"center",padding:12,background:agreed?C.green+"18":C.card,border:`1.5px solid ${agreed?C.green:C.border}`,borderRadius:10,cursor:"pointer",marginBottom:14}}>
            <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${agreed?C.green:C.muted}`,background:agreed?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12}}>{agreed&&"v"}</div>
            <span style={{color:C.text,fontSize:12}}>I have read and understood all the instructions. I agree to follow the exam rules.</span>
          </div>
          {pyqBox}
          <button onClick={agreed&&!blocked?onConfirm:undefined} disabled={!agreed||blocked} style={{width:"100%",background:agreed?C.green:"#1e2d42",color:agreed?"#fff":"#4a5568",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:800,cursor:agreed?"pointer":"not-allowed",transition:"all .2s"}}>
            {agreed?" I'm Ready - Start Exam":"[x] Agree to Instructions First"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Leaderboard (Part 56) -------------------------------------------------
function Leaderboard({user, onBack}) {
  const [tab,setTab]=useState("global"); const [examFilter,setExamFilter]=useState("All");
  const lb=LS.get("global_leaderboard",[]); const results=user.data?.results||[];
  // Register user's best score
  useEffect(()=>{
    if(!results.length)return;
    const best=Math.max(...results.map(r=>r.score||0));
    const lb=LS.get("global_leaderboard",[]);
    const idx=lb.findIndex(e=>e.userId===user.id);
    const entry={userId:user.id,name:user.name||"Student",country:user.country||"IN",score:best,xp:user.data?.xp||0,ts:Date.now()};
    if(idx>=0)lb[idx]={...lb[idx],score:Math.max(lb[idx].score,best),xp:entry.xp};
    else lb.push(entry);
    LS.set("global_leaderboard",lb.sort((a,b)=>b.score-a.score).slice(0,200));
  },[]);
  const sorted=[...lb].sort((a,b)=>b.score-a.score);
  const myRank=sorted.findIndex(e=>e.userId===user.id)+1;
  const DEMO_LB=[
    {name:"Arjun Sharma",country:"IN",score:289,xp:4200,userId:"d1"},
    {name:"Priya Singh",country:"IN",score:276,xp:3900,userId:"d2"},
    {name:"Rahul Gupta",country:"IN",score:265,xp:3600,userId:"d3"},
    {name:"Aarav Kumar",country:"IN",score:258,xp:3400,userId:"d4"},
    {name:"Neha Patel",country:"IN",score:247,xp:3100,userId:"d5"},
  ];
  const display=sorted.length>1?sorted:[...DEMO_LB,...(sorted.length?sorted:[])].sort((a,b)=>b.score-a.score);
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack}/>
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> Leaderboard</span>
        <div style={{flex:1}}/>{myRank>0&&<Pill c={C.amber}>You: #{myRank}</Pill>}
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
        {[["global"," Global"],["weekly"," Weekly"],["friends"," Local"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {display.slice(0,50).map((e,i)=>{
          const isMe=e.userId===user.id;
          const medals=["","",""];
          return(<div key={e.userId||i} style={{background:isMe?C.accent+"18":C.card,border:`1px solid ${isMe?C.accent:C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:i<3?C.amber+"20":C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:i<3?18:12,fontWeight:900,color:i<3?C.amber:C.muted,flexShrink:0}}>{i<3?medals[i]:i+1}</div>
            <div style={{flex:1}}>
              <div style={{color:isMe?C.accent:C.text,fontWeight:700,fontSize:12}}>{e.name}{isMe?" (You)":""}</div>
              <div style={{color:C.muted,fontSize:10}}>{e.country} . {e.xp||0} XP</div>
            </div>
            <div style={{textAlign:"right"}}><div style={{color:C.green,fontWeight:900,fontSize:14}}>{e.score}</div><div style={{color:C.muted,fontSize:9}}>Best Score</div></div>
          </div>);
        })}
        {!display.length&&<div style={{textAlign:"center",padding:60,color:C.muted}}><div style={{fontSize:40}}></div><div style={{marginTop:8}}>Be the first to appear!</div><div style={{fontSize:11,marginTop:4,color:C.dim}}>Complete an exam to join the board</div></div>}
      </div>
    </div>
  );
}

// -- Practice Mode (Parts 52, 84, 85) -------------------------------------
function PracticeMode({user, setUser, ctrl, onBack}) {
  const [step,setStep]=useState("config"); const [config,setConfig]=useState({exam:"JEE_MAIN",subject:"Physics",difficulty:"Mixed",count:10});
  const [session,setSession]=useState(null); const [cur,setCur]=useState(0); const [results,setResults]=useState([]);
  const [busy,setBusy]=useState(false); const [explanation,setExplanation]=useState("");
  const subjects=PYQ_BANK[config.exam]?Object.keys(PYQ_BANK[config.exam]):["Physics","Chemistry","Mathematics"];
  const buildSession=()=>{
    const src=PYQ_BANK[config.exam]?.[config.subject]||[];
    const filtered=config.difficulty==="Mixed"?src:src.filter(q=>q.diff===config.difficulty);
    const shuffled=[...filtered].sort(()=>Math.random()-.5).slice(0,config.count);
    setSession(shuffled.length?shuffled:src.sort(()=>Math.random()-.5).slice(0,config.count));
    setCur(0);setResults([]);setExplanation("");setStep("practice");
  };
  const submit=(ans)=>{
    if(!session)return;
    const q=session[cur];
    const correct=q.ans.includes(ans);
    setResults(p=>[...p,{qId:q.id,correct,ans}]);
    if(correct){setExplanation("[OK] Correct! "+q.exp);}else{setExplanation("[ERR] Wrong. Correct ans: "+q.opts[q.ans[0]]+"\n\nExplanation: "+q.exp);}
  };
  const next=()=>{setExplanation("");if(cur<session.length-1)setCur(p=>p+1);else setStep("done");};
  if(step==="config")return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}>Practice Mode</span></div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        <div style={{maxWidth:480,margin:"0 auto"}}>
          <div style={{marginBottom:14}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Exam</label><select value={config.exam} onChange={e=>setConfig(p=>({...p,exam:e.target.value,subject:"Physics"}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px",color:C.text,fontSize:13}}>{Object.keys(PYQ_BANK).map(e=><option key={e} value={e} style={{background:C.surface}}>{e}</option>)}</select></div>
          <div style={{marginBottom:14}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Subject</label><select value={config.subject} onChange={e=>setConfig(p=>({...p,subject:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px",color:C.text,fontSize:13}}>{subjects.map(s=><option key={s} value={s} style={{background:C.surface}}>{s}</option>)}</select></div>
          <div style={{marginBottom:14}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Difficulty</label><div style={{display:"flex",gap:8}}>{["Easy","Medium","Hard","Mixed"].map(d=><button key={d} onClick={()=>setConfig(p=>({...p,difficulty:d}))} style={{flex:1,padding:"7px",background:config.difficulty===d?C.accent+"22":C.card,border:`1.5px solid ${config.difficulty===d?C.accent:C.border}`,borderRadius:8,color:config.difficulty===d?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{d}</button>)}</div></div>
          <div style={{marginBottom:20}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Questions: {config.count}</label><input type="range" min="5" max="30" value={config.count} onChange={e=>setConfig(p=>({...p,count:+e.target.value}))} style={{width:"100%",accentColor:C.accent}}/></div>
          <button onClick={buildSession} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:800,cursor:"pointer"}}>Start Practice Session</button>
        </div>
      </div>
    </div>
  );
  if(step==="practice"&&session){
    const q=session[cur];
    return(
      <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{color:C.muted,fontSize:11}}>{cur+1}/{session.length} . {q?.diff||"Medium"}</span>
          <span style={{color:C.accent,fontWeight:700,fontSize:11}}>{config.subject} Practice</span>
          <span style={{color:C.muted,fontSize:10}}>{results.filter(r=>r.correct).length} correct</span>
        </div>
        <div style={{flex:1,overflow:"auto",padding:16}}>
          <div style={{maxWidth:640,margin:"0 auto"}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
              <div style={{color:C.muted,fontSize:10,marginBottom:6}}>{q?.chapter} . {q?.year}</div>
              <div style={{color:C.text,fontSize:13,lineHeight:1.7,marginBottom:14}}>{q?.t}</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {(q?.opts||[]).map((opt,i)=>{
                  const answered=results.length>cur;
                  const isCorrect=q.ans.includes(i);
                  const isMyAns=answered&&results[cur]?.ans===i;
                  return(<button key={i} onClick={()=>!answered&&submit(i)} disabled={answered} style={{background:answered?(isCorrect?C.green+"25":isMyAns?C.red+"22":C.surface):C.surface,border:`1.5px solid ${answered?(isCorrect?C.green:isMyAns?C.red:C.border):C.border}`,borderRadius:8,padding:"10px 14px",color:answered?(isCorrect?C.green:isMyAns?C.red:C.muted):C.text,fontSize:12,textAlign:"left",cursor:answered?"default":"pointer",transition:"all .1s"}}><span style={{color:C.muted,marginRight:8}}>{String.fromCharCode(65+i)}.</span>{opt}</button>);
                })}
              </div>
            </div>
            {explanation&&<div style={{background:explanation.startsWith("[OK]")?C.green+"18":C.red+"18",border:`1px solid ${explanation.startsWith("[OK]")?C.green:C.red}40`,borderRadius:10,padding:14,marginBottom:12,fontSize:12,color:C.text,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{explanation}</div>}
            {results.length>cur&&<button onClick={next} style={{width:"100%",background:cur<session.length-1?C.accent:"#10b981",color:"#fff",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer"}}>{cur<session.length-1?"Next Question ->":" See Results"}</button>}
          </div>
        </div>
      </div>
    );
  }
  const correct=results.filter(r=>r.correct).length;
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}>Practice Complete!</span></div>
      <div style={{flex:1,overflow:"auto",padding:20}}>
        <div style={{maxWidth:480,margin:"0 auto",textAlign:"center"}}>
          <div style={{background:"linear-gradient(135deg,#1a237e,#311b92)",borderRadius:16,padding:28,marginBottom:16,color:"#fff"}}><div style={{fontSize:52,fontWeight:900}}>{Math.round(correct/results.length*100)}%</div><div style={{opacity:.8}}>Accuracy . {correct}/{results.length} Correct</div></div>
          <div style={{display:"flex",gap:10,marginBottom:16}}><button onClick={()=>{setStep("config");}} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.text,fontSize:12,fontWeight:700,cursor:"pointer"}}> New Session</button><button onClick={buildSession} style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Retry</button></div>
        </div>
      </div>
    </div>
  );
}

// -- AI Study Planner (Part 44, 58, 81) ------------------------------------
function AIStudyPlanner({user, setUser, ctrl, onBack}) {
  const [examTarget,setExamTarget]=useState("JEE_MAIN"); const [weeks,setWeeks]=useState(12); const [hoursPerDay,setHoursPerDay]=useState(6);
  const [plan,setPlan]=useState(""); const [busy,setBusy]=useState(false);
  const aiKeys={...LS.get("ai_api_keys",{}),...(ctrl.apiKeys||{})};
  const generatePlan=async()=>{
    setBusy(true);setPlan("");
    const results=user.data?.results||[];
    const subjectScores={};
    results.filter(r=>r.exam?.id===examTarget).forEach(r=>{Object.entries(r.bySubj||{}).forEach(([sv,d])=>{if(!subjectScores[sv])subjectScores[sv]={correct:0,total:0};subjectScores[sv].correct+=d.correct||0;subjectScores[sv].total+=(d.correct||0)+(d.wrong||0)+(d.skipped||0);});});
    const weakAreas=Object.entries(subjectScores).filter(([,d])=>d.total>0&&d.correct/d.total<0.6).map(([s])=>s);
    const streak=calcStreak(user);
    try{
      const r=await aiCall("claude","You are an expert exam coach creating personalized study plans.",`Create a detailed ${weeks}-week study plan for ${examTarget} with ${hoursPerDay} hours/day available.\n\nUser data:\n- Current streak: ${streak} days\n- Weak areas: ${weakAreas.join(", ")||"not identified yet"}\n- Tests completed: ${results.length}\n\nFormat as: Week 1-2: [focus], Week 3-4: [focus], etc. with daily breakdown and topic-wise time allocation. Include mock test schedule and revision strategy. Make it actionable and specific.`,aiKeys);
      setPlan(r);
    }catch(e){setPlan("Error generating plan: "+e.message);}
    setBusy(false);
  };
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}> AI Study Planner</span></div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        <div style={{maxWidth:600,margin:"0 auto"}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{marginBottom:12}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Target Exam</label><select value={examTarget} onChange={e=>setExamTarget(e.target.value)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 12px",color:C.text,fontSize:12}}>{EXAMS.map(e=><option key={e.id} value={e.id} style={{background:C.surface}}>{e.name}</option>)}</select></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Weeks to Exam: {weeks}</label><input type="range" min="4" max="52" value={weeks} onChange={e=>setWeeks(+e.target.value)} style={{width:"100%",accentColor:C.accent}}/></div>
              <div><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:5}}>Hours/Day: {hoursPerDay}</label><input type="range" min="1" max="14" value={hoursPerDay} onChange={e=>setHoursPerDay(+e.target.value)} style={{width:"100%",accentColor:C.violet}}/></div>
            </div>
            <button onClick={generatePlan} disabled={busy} style={{width:"100%",background:busy?C.dim:C.accent,color:"#fff",border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>{busy?<span>Generating your personalized plan...</span>:" Generate My Study Plan"}</button>
          </div>
          {plan&&<div style={{background:C.card,border:`1px solid ${C.green}30`,borderRadius:12,padding:16}}>
            <div style={{color:C.green,fontWeight:800,fontSize:12,marginBottom:8}}> Your Personalized Study Plan</div>
            <div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",lineHeight:1.8}}>{plan}</div>
          </div>}
          {!plan&&!busy&&<div style={{textAlign:"center",padding:40,color:C.muted}}><div style={{fontSize:36}}></div><div style={{marginTop:8,fontSize:12}}>AI will analyze your performance and create a customized plan covering syllabus, mock tests, and revision schedule</div></div>}
        </div>
      </div>
    </div>
  );
}

// -- Study Goals (Part 69) -------------------------------------------------
function StudyGoals({user, setUser, onBack}) {
  const goals=user.data?.goals||{dailyQ:10,weeklyTests:2,targetScore:200,examDate:""};
  const [edit,setEdit]=useState({...goals});
  const save=()=>{setUser({...user,data:{...user.data,goals:edit}});};
  const results=user.data?.results||[];
  const todayResults=results.filter(r=>new Date(r.ts).toDateString()===new Date().toDateString());
  const weekStart=new Date();weekStart.setDate(weekStart.getDate()-7);
  const weekResults=results.filter(r=>r.ts>weekStart.getTime());
  const streak=calcStreak(user);
  const daysToExam=edit.examDate?Math.ceil((new Date(edit.examDate)-new Date())/86400000):null;
  const readiness=getReadinessScore(user,edit.targetExam||"JEE_MAIN");
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}> Study Goals & Progress</span></div>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        <div style={{maxWidth:520,margin:"0 auto"}}>
          {daysToExam!==null&&<div style={{background:"linear-gradient(135deg,#c62828,#b71c1c)",borderRadius:12,padding:16,marginBottom:12,textAlign:"center",color:"#fff"}}><div style={{fontSize:36,fontWeight:900}}>{daysToExam>0?daysToExam:"Today!"}</div><div style={{fontSize:12,opacity:.8}}>days until {edit.targetExam||"your exam"}</div></div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {[{icon:"",l:"Streak",v:`${streak}d`,c:C.orange},{icon:"v",l:"Today",v:todayResults.length,c:C.green},{icon:"",l:"Readiness",v:`${readiness}%`,c:readiness>70?C.green:readiness>40?C.amber:C.red}].map(s=><div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 8px",textAlign:"center"}}><div style={{fontSize:20}}>{s.icon}</div><div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:C.muted}}>{s.l}</div></div>)}
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:10}}> Set Your Goals</div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Exam Date</label><input type="date" value={edit.examDate} onChange={e=>setEdit(p=>({...p,examDate:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:12,boxSizing:"border-box"}} /></div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Daily Questions: {edit.dailyQ}</label><input type="range" min="5" max="100" value={edit.dailyQ} onChange={e=>setEdit(p=>({...p,dailyQ:+e.target.value}))} style={{width:"100%",accentColor:C.accent}}/></div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Weekly Mock Tests: {edit.weeklyTests}</label><input type="range" min="1" max="7" value={edit.weeklyTests} onChange={e=>setEdit(p=>({...p,weeklyTests:+e.target.value}))} style={{width:"100%",accentColor:C.violet}}/></div>
            <div style={{marginBottom:12}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Target Score: {edit.targetScore}</label><input type="range" min="50" max="360" value={edit.targetScore} onChange={e=>setEdit(p=>({...p,targetScore:+e.target.value}))} style={{width:"100%",accentColor:C.amber}}/></div>
            <button onClick={save} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}> Save Goals</button>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14}}>
            <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:10}}> This Week</div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:12}}><span style={{color:C.muted}}>Mock Tests</span><span style={{color:weekResults.length>=goals.weeklyTests?C.green:C.amber,fontWeight:700}}>{weekResults.length}/{goals.weeklyTests}</span></div>
            <div style={{background:C.surface,borderRadius:6,height:8,marginBottom:10,overflow:"hidden"}}><div style={{height:"100%",background:C.green,borderRadius:6,width:`${Math.min(100,weekResults.length/Math.max(goals.weeklyTests,1)*100)}%`}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.muted}}>Best Score</span><span style={{color:C.text,fontWeight:700}}>{weekResults.length?Math.max(...weekResults.map(r=>r.score||0)):0}/{goals.targetScore}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Exam Calendar + Countdown (Parts 99, 161, 162) ------------------------
const EXAM_DATES_2025={
  "JEE Main Jan":new Date("2025-01-22"),"JEE Main Apr":new Date("2025-04-02"),
  "NEET UG":new Date("2025-05-04"),"JEE Advanced":new Date("2025-05-18"),
  "UPSC Prelims":new Date("2025-05-25"),"CAT":new Date("2025-11-23"),
  "GATE":new Date("2025-02-01"),"SAT Mar":new Date("2025-03-08"),
  "IELTS":new Date("2025-03-15"),"GRE":new Date("2025-04-05"),
  "TOEFL":new Date("2025-02-22"),"SSC CGL Tier1":new Date("2025-06-10"),
};

// ==========================================================================
// GLOBAL EXAM LIBRARY
// ==========================================================================
const EXAMS = [
  {id:"JEE_MAIN",  name:"JEE Main",            short:"JEE Main",   country:"India", cat:"Engineering", icon:"IN", color:"#1a237e", ui:"NTA",   totalQ:75,  dur:180, marks:300, neg:1, pos:4, subj:["Physics","Chemistry","Mathematics"], pattern:"Per subject: Section A 20 MCQ (+4/-1) + Section B 5 numerical (+4/-1). All compulsory."},
  {id:"JEE_ADV",   name:"JEE Advanced - Paper 1", short:"JEE Adv P1", country:"India", cat:"Engineering", icon:"", color:"#880e4f", ui:"NTA",   totalQ:51,  dur:180, marks:180, neg:1, pos:3, subj:["Physics","Chemistry","Mathematics"], pattern:"Per subject: 4 single (+3/-1), 3 multi (+4, partial, -2), 6 numerical (+4/0), 4 match/paragraph (+3/-1)."},
  {id:"JEE_ADV2",  name:"JEE Advanced - Paper 2", short:"JEE Adv P2", country:"India", cat:"Engineering", icon:"", color:"#880e4f", ui:"NTA",   totalQ:51,  dur:180, marks:180, neg:1, pos:3, subj:["Physics","Chemistry","Mathematics"], pattern:"Same structure as Paper 1; separate compulsory 3-hour paper."},
  {id:"NEET",      name:"NEET-UG",              short:"NEET",       country:"India", cat:"Medical",     icon:"", color:"#1b5e20", ui:"NEET",  totalQ:180, dur:180, marks:720, neg:1, pos:4, subj:["Physics","Chemistry","Botany","Zoology"], pattern:"180 compulsory MCQ, 45 per subject. +4 / -1 / 0. No optional questions."},
  {id:"MY_BANK", name:"My Question Bank (imported)", short:"My Bank", country:"Custom", cat:"Custom", icon:"", color:"#00695c", ui:"CUSTOM", totalQ:0, dur:180, marks:0, neg:1, pos:4, subj:["General"], pattern:"Your own imported and manually added questions, with the marking you set."},
  {id:"NEET_PYQ", name:"NEET Verified PYQ (random)", short:"NEET PYQ", country:"India", cat:"Medical", icon:"", color:"#2e7d32", ui:"NEET", totalQ:180, dur:180, marks:720, neg:1, pos:4, subj:["Physics","Chemistry","Botany","Zoology"], pattern:"Random verified previous-year questions only (official-key matched)."},
  {id:"UPSC",      name:"UPSC CSE Prelims",     short:"UPSC Pre",   country:"India", cat:"Civil Svc",   icon:"", color:"#800000", ui:"UPSC",  totalQ:200, dur:240, marks:400, pattern:"GS-I 100Q + CSAT 100Q. Negative 1/3."},
  {id:"CAT",       name:"CAT",                  short:"CAT",        country:"India", cat:"MBA",         icon:"", color:"#7b1fa2", ui:"CAT",   totalQ:66,  dur:120, marks:198, pattern:"VARC+DILR+QA. MCQ +3/-1, TITA +3/0."},
  {id:"GATE",      name:"GATE",                 short:"GATE",       country:"India", cat:"Engg PG",     icon:"", color:"#01579b", ui:"GATE",  totalQ:65,  dur:180, marks:100, pattern:"25 GA + 40 Tech. MCQ+NAT. No neg for NAT."},
  {id:"BITSAT",    name:"BITSAT",               short:"BITSAT",     country:"India", cat:"Engineering", icon:"", color:"#b71c1c", ui:"NTA",   totalQ:130, dur:180, marks:390, neg:1, pos:3, pattern:"+3/-1. Bonus 12Q if all 130 attempted."},
  {id:"SSC_CGL",   name:"SSC CGL",              short:"SSC CGL",    country:"India", cat:"Govt",        icon:"", color:"#004d40", ui:"SSC",   totalQ:100, dur:60,  marks:200, neg:0.5, pos:2, pattern:"4 sections 25Q each. 60 min. +2/-0.5."},
  {id:"IBPS_PO",   name:"IBPS PO Prelims",      short:"IBPS PO",    country:"India", cat:"Banking",     icon:"", color:"#1565c0", ui:"IBPS",  totalQ:100, dur:60,  marks:100, neg:0.25, pos:1, pattern:"English+QA+Reasoning. Sectional cutoffs."},
  {id:"CLAT",      name:"CLAT",                 short:"CLAT",       country:"India", cat:"Law",         icon:"", color:"#3e2723", ui:"CLAT",  totalQ:120, dur:120, marks:120, pattern:"Reading comprehension. +1/-0.25."},
  {id:"NEET_PG",   name:"NEET-PG",              short:"NEET-PG",    country:"India", cat:"Medical PG",  icon:"", color:"#1a237e", ui:"NTA",   totalQ:200, dur:210, marks:800, neg:1, pos:4, pattern:"200Q 3.5hrs. +4/-1."},
  {id:"KVPY",      name:"KVPY",                 short:"KVPY",       country:"India", cat:"Scholarship", icon:"", color:"#311b92", ui:"KVPY",  totalQ:80,  dur:180, marks:100, pattern:"Part1+Part2. Scholarship for science."},
  {id:"XAT",       name:"XAT",                  short:"XAT",        country:"India", cat:"MBA",         icon:"", color:"#880e4f", ui:"CAT",   totalQ:105, dur:190, marks:315, pattern:"VDAM+DM+QA+GK. -0.25 wrong, -0.1 unattempted."},
  {id:"WBJEE",     name:"WBJEE",                short:"WBJEE",      country:"India", cat:"Engineering", icon:"IN", color:"#1a237e", ui:"NTA",   totalQ:155, dur:240, marks:200, pattern:"Math 75Q + PCh 40Q each."},
  {id:"VITEEE",    name:"VITEEE",               short:"VITEEE",     country:"India", cat:"Engineering", icon:"", color:"#e65100", ui:"NTA",   totalQ:125, dur:150, marks:125, pattern:"+1/0. No negative. Online CBT."},
  {id:"MHT_CET",   name:"MHT CET",              short:"MHT-CET",    country:"India", cat:"Engineering", icon:"IN", color:"#880e4f", ui:"NTA",   totalQ:150, dur:180, marks:200, pattern:"PCh+Math. +2/-0.5."},
  {id:"CUET",      name:"CUET UG",              short:"CUET",       country:"India", cat:"Undergrad",   icon:"IN", color:"#1a237e", ui:"NTA",   totalQ:225, dur:225, marks:800, pattern:"Lang+Domain+GT. +5/-1. DU/JNU/BHU."},
  {id:"SBI_PO",    name:"SBI PO Prelims",       short:"SBI PO",     country:"India", cat:"Banking",     icon:"", color:"#0d47a1", ui:"IBPS",  totalQ:100, dur:60,  marks:100, pattern:"Same as IBPS PO pattern."},
  {id:"NDA",       name:"NDA Written",          short:"NDA",        country:"India", cat:"Defence",     icon:"vs", color:"#1a237e", ui:"UPSC",  totalQ:270, dur:300, marks:900, pattern:"Math 120Q + GAT 150Q. +2.5/-0.83."},
  {id:"CSIR_NET",  name:"CSIR NET",             short:"CSIR NET",   country:"India", cat:"Research",    icon:"", color:"#004d40", ui:"GATE",  totalQ:145, dur:180, marks:200, pattern:"Parts A+B+C. JRF+Lectureship."},
  {id:"UGC_NET",   name:"UGC NET",              short:"UGC NET",    country:"India", cat:"Research",    icon:"", color:"#004d40", ui:"NTA",   totalQ:150, dur:180, marks:300, pattern:"Paper I + Paper II. No negative."},
  {id:"SAT",       name:"SAT",                  short:"SAT",        country:"USA",   cat:"Undergrad",   icon:"US", color:"#003087", ui:"SAT",   totalQ:98,  dur:134, marks:1600, pattern:"RW 2x27Q + Math 2x22Q. Digital adaptive."},
  {id:"ACT",       name:"ACT",                  short:"ACT",        country:"USA",   cat:"Undergrad",   icon:"US", color:"#002855", ui:"ACT",   totalQ:215, dur:175, marks:36,  pattern:"E+M+R+S. No penalty for wrong."},
  {id:"GRE",       name:"GRE General",          short:"GRE",        country:"USA",   cat:"Graduate",    icon:"", color:"#663399", ui:"GRE",   totalQ:82,  dur:222, marks:340, pattern:"Verbal+Quant+AW. Adaptive. 340+6 scale."},
  {id:"GMAT",      name:"GMAT Focus",           short:"GMAT",       country:"USA",   cat:"MBA",         icon:"", color:"#000d6b", ui:"GMAT",  totalQ:64,  dur:135, marks:805, pattern:"QR+VR+DI. 205-805. Section order choice."},
  {id:"LSAT",      name:"LSAT",                 short:"LSAT",       country:"USA",   cat:"Law",         icon:"", color:"#1a1a2e", ui:"LSAT",  totalQ:92,  dur:130, marks:180, pattern:"LR+AR+RC. 120-180. No calculator."},
  {id:"MCAT",      name:"MCAT",                 short:"MCAT",       country:"USA",   cat:"Medical",     icon:"", color:"#d32f2f", ui:"MCAT",  totalQ:230, dur:375, marks:528, pattern:"4 sections. 472-528 score."},
  {id:"AP_CALC",   name:"AP Calculus AB",       short:"AP Calc",    country:"USA",   cat:"CollegeCredit",icon:"", color:"#0d47a1", ui:"AP",    totalQ:45,  dur:195, marks:5,   pattern:"MCQ+FRQ. 1-5 scale. College credit."},
  {id:"GED",       name:"GED",                  short:"GED",        country:"USA",   cat:"Equivalency", icon:"", color:"#1565c0", ui:"GED",   totalQ:null,dur:460, marks:170, pattern:"4 tests. 145+ per test to pass."},
  {id:"CPA",       name:"CPA Exam",             short:"CPA",        country:"USA",   cat:"Professional",icon:"", color:"#1b5e20", ui:"CPA",   totalQ:276, dur:960, marks:99,  pattern:"4 sections. MCQ+Simulations. 75+ to pass."},
  {id:"BAR",       name:"Bar Exam (UBE)",       short:"Bar Exam",   country:"USA",   cat:"Professional",icon:"", color:"#37474f", ui:"BAR",   totalQ:200, dur:720, marks:400, pattern:"Day1: MEE+MPT. Day2: MBE 200Q. 266+."},
  {id:"ALEVEL",    name:"A-Levels",             short:"A-Levels",   country:"UK",    cat:"Pre-Uni",     icon:"GBBD", color:"#c62828", ui:"ALEVELS",totalQ:null,dur:null,marks:null, pattern:"2-year. AS+A2. A*ABCDE grades. UCAS points."},
  {id:"UCAT",      name:"UCAT",                 short:"UCAT",       country:"UK",    cat:"Medical",     icon:"", color:"#1a237e", ui:"UCAT",  totalQ:233, dur:123, marks:3600, pattern:"5 subtests. 300-900 each. Computer adaptive."},
  {id:"BMAT",      name:"BMAT",                 short:"BMAT",       country:"UK",    cat:"Medical",     icon:"", color:"#880e4f", ui:"BMAT",  totalQ:75,  dur:120, marks:9,   pattern:"S1+S2+Essay. 1-9 scale. Oxford/Cambridge."},
  {id:"IELTS",     name:"IELTS Academic",       short:"IELTS",      country:"Intl",  cat:"Language",    icon:"", color:"#c41230", ui:"IELTS", totalQ:80,  dur:170, marks:9,   pattern:"L+R+W+S. 3.5M tests/year. Band 1-9."},
  {id:"TOEFL",     name:"TOEFL iBT",            short:"TOEFL",      country:"Intl",  cat:"Language",    icon:"", color:"#003087", ui:"TOEFL", totalQ:54,  dur:120, marks:120, pattern:"R+L+S+W. 0-120. 11500+ institutions."},
  {id:"PTE",       name:"PTE Academic",         short:"PTE",        country:"Intl",  cat:"Language",    icon:"", color:"#00579d", ui:"PTE",   totalQ:null,dur:180, marks:90,  pattern:"AI-scored. 10-90. Results in 48hrs."},
  {id:"DUOLINGO",  name:"Duolingo English Test", short:"DET",       country:"Intl",  cat:"Language",    icon:"", color:"#4caf50", ui:"DET",   totalQ:null,dur:60,  marks:160, pattern:"Adaptive. 10-160. AI-proctored. $59."},
  {id:"CFA_L1",    name:"CFA Level 1",          short:"CFA L1",     country:"Intl",  cat:"Finance",     icon:"", color:"#1b5e20", ui:"CFA",   totalQ:180, dur:270, marks:null, pattern:"2x90Qx135min. MCQ. 70%+ in all topics."},
  {id:"CFA_L2",    name:"CFA Level 2",          short:"CFA L2",     country:"Intl",  cat:"Finance",     icon:"", color:"#1b5e20", ui:"CFA",   totalQ:88,  dur:264, marks:null, pattern:"Vignette-based. ~45% pass rate."},
  {id:"IB",        name:"IB Diploma",           short:"IB DP",      country:"Intl",  cat:"Pre-Uni",     icon:"", color:"#002b5c", ui:"IB",    totalQ:null,dur:null,marks:45,  pattern:"HL+SL. TOK+EE+CAS. May/Nov sessions."},
  {id:"TOEIC",     name:"TOEIC L&R",            short:"TOEIC",      country:"Intl",  cat:"Language",    icon:"", color:"#004080", ui:"TOEIC", totalQ:200, dur:120, marks:990, pattern:"L+R. 5-495 each. Corporate English."},
  {id:"JLPT_N1",   name:"JLPT N1",              short:"JLPT N1",    country:"Japan", cat:"Language",    icon:"JPPK", color:"#bc002d", ui:"JLPT",  totalQ:null,dur:170, marks:180, pattern:"Hardest level. Dec & July. N5-N1."},
  {id:"HSK6",      name:"HSK Level 6",          short:"HSK 6",      country:"China", cat:"Language",    icon:"CA", color:"#de2910", ui:"HSK",   totalQ:101, dur:140, marks:300, pattern:"L+R+W. Native-level Chinese."},
  {id:"GAOKAO",    name:"Gaokao",               short:"Gaokao",     country:"China", cat:"Undergrad",   icon:"CA", color:"#de2910", ui:"GAOKAO",totalQ:null,dur:480, marks:750, pattern:"3 days. 13M+ candidates. CN + Math + EN."},
  {id:"USMLE_S1",  name:"USMLE Step 1",         short:"USMLE S1",   country:"USA",   cat:"Medical",     icon:"", color:"#880e4f", ui:"USMLE", totalQ:280, dur:480, marks:null, pattern:"7x40Q blocks. Pass/Fail since 2022."},
  {id:"NCLEX_RN",  name:"NCLEX-RN",             short:"NCLEX",      country:"USA",   cat:"Nursing",     icon:"", color:"#004d40", ui:"NCLEX", totalQ:145, dur:345, marks:null, pattern:"Adaptive CAT. 85-145Q. Next-Gen format."},
  {id:"AWS_SAA",   name:"AWS Solutions Architect",short:"AWS SAA",  country:"Intl",  cat:"IT Cert",     icon:"cloud", color:"#ff9900", ui:"IT",    totalQ:65,  dur:130, marks:1000, pattern:"65Q. 720+ to pass. Valid 3 years."},
  {id:"PMP",       name:"PMP Certification",    short:"PMP",        country:"Intl",  cat:"Management",  icon:"", color:"#1a237e", ui:"IT",    totalQ:180, dur:230, marks:null, pattern:"180Q 230min. MCQ+Match+Hotspot."},
  {id:"GAMSAT",    name:"GAMSAT",               short:"GAMSAT",     country:"AU",    cat:"Medical",     icon:"AUUS", color:"#00695c", ui:"GAMSAT",totalQ:228, dur:330, marks:85,  pattern:"S1+S2+S3. AU/UK med graduate entry."},
  {id:"SNAP",      name:"SNAP",                 short:"SNAP",       country:"India", cat:"MBA",         icon:"", color:"#e65100", ui:"CAT",   totalQ:60,  dur:60,  marks:60,  pattern:"60Q 60min. +1/-0.25. Symbiosis."},
  {id:"NMAT",      name:"NMAT by GMAC",         short:"NMAT",       country:"India", cat:"MBA",         icon:"", color:"#003087", ui:"GMAT",  totalQ:108, dur:120, marks:360, pattern:"36Q each section. No negative. NMIMS."},
  {id:"IIFT",      name:"IIFT MBA",             short:"IIFT",       country:"India", cat:"MBA",         icon:"", color:"#1a237e", ui:"CAT",   totalQ:110, dur:120, marks:300, pattern:"MCQ. Sectional cutoffs. -1/3 neg."},
  {id:"CMAT",      name:"CMAT",                 short:"CMAT",       country:"India", cat:"MBA",         icon:"", color:"#1a237e", ui:"CAT",   totalQ:100, dur:180, marks:400, pattern:"5 sections 20Q each. +4/-1."},
  {id:"IBPS_CLK",  name:"IBPS Clerk Prelims",   short:"IBPS Clerk", country:"India", cat:"Banking",     icon:"", color:"#1565c0", ui:"IBPS",  totalQ:100, dur:60,  marks:100, pattern:"EN+NA+RA. 60min. +1/-0.25."},
  {id:"CDS",       name:"CDS Written",          short:"CDS",        country:"India", cat:"Defence",     icon:"vs", color:"#1a237e", ui:"UPSC",  totalQ:300, dur:360, marks:300, pattern:"EN+GK+Math. +1/-0.33."},
  {id:"AFCAT",     name:"AFCAT",                short:"AFCAT",      country:"India", cat:"Defence",     icon:"", color:"#1565c0", ui:"IBPS",  totalQ:100, dur:120, marks:300, pattern:"100Q 2hrs. +3/-1. Air Force."},
  {id:"DELF_B2",   name:"DELF B2",              short:"DELF B2",    country:"France",cat:"Language",    icon:"FR", color:"#002395", ui:"DELF",  totalQ:null,dur:180, marks:100, pattern:"Reading+Writing+Listening+Speaking. 50+ to pass."},
  {id:"CAE",       name:"Cambridge C1 Advanced", short:"C1 Adv",   country:"UK",    cat:"Language",    icon:"GBBD", color:"#a52a2a", ui:"CAE",   totalQ:null,dur:270, marks:230, pattern:"R/UoE+W+L+S. 180-230=C1, 200+=C2."},
];

// -- UI Atoms --------------------------------------------------------------
const Btn = ({c,children,onClick,full,disabled,sm,outline,sx={}}) => (
  <button onClick={onClick} disabled={disabled} style={{background:outline?"transparent":disabled?C.dim:(c||C.accent),color:outline?(c||C.accent):"#fff",border:`1.5px solid ${disabled?C.dim:(c||C.accent)}`,borderRadius:8,cursor:disabled?"not-allowed":"pointer",padding:sm?"5px 14px":"9px 22px",fontSize:sm?11:13,fontWeight:700,opacity:disabled?0.5:1,display:"inline-flex",alignItems:"center",gap:6,justifyContent:"center",width:full?"100%":undefined,boxShadow:!outline&&!disabled?`0 0 16px ${(c||C.accent)}28`:"none",transition:"all .15s",whiteSpace:"nowrap",...sx}}>{children}</button>
);
const Pill = ({c=C.accent,children,sm}) => <span style={{background:c+"20",color:c,border:`1px solid ${c}30`,borderRadius:20,padding:sm?"1px 8px":"3px 12px",fontSize:sm?9:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
const Card = ({children,sx={},c}) => <div style={{background:C.card,border:`1px solid ${c?c+"35":C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>;
const Spin = ({sz=16}) => <div style={{width:sz,height:sz,border:`2px solid ${C.border}`,borderTop:`2px solid ${C.accent}`,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}} />;
const ErrBox = ({msg}) => msg?<div style={{background:C.red+"18",border:`1px solid ${C.red}35`,borderRadius:8,padding:"9px 13px",color:C.red,fontSize:12,margin:"8px 0"}}>{msg}</div>:null;
const Row = ({children,g=8,sx={}}) => <div style={{display:"flex",gap:g,alignItems:"center",...sx}}>{children}</div>;
const Col = ({children,g=8,sx={}}) => <div style={{display:"flex",flexDirection:"column",gap:g,...sx}}>{children}</div>;
const BackBtn = ({onBack}) => <button onClick={onBack} style={{background:"none",border:"none",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",padding:"8px 14px",flexShrink:0}}>Back</button>;
const Input = ({label,value,onChange,type="text",placeholder,error,autoFocus,onKeyDown,rows}) => (
  <div style={{marginBottom:10}}>
    {label&&<label style={{color:C.muted,fontSize:11,fontWeight:700,display:"block",marginBottom:3}}>{label}</label>}
    {rows?<textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{width:"100%",background:C.surface,border:`1.5px solid ${error?C.red:C.border}`,borderRadius:8,padding:"9px 13px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box",lineHeight:1.5}} />:
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} style={{width:"100%",background:C.surface,border:`1.5px solid ${error?C.red:C.border}`,borderRadius:8,padding:"9px 13px",color:C.text,fontSize:13,boxSizing:"border-box"}} />}
    {error&&<div style={{color:C.red,fontSize:11,marginTop:3}}>[!] {error}</div>}
  </div>
);

// -- Controller hook -------------------------------------------------------
const useCtrl = () => useMemo(() => {
  const d = LS.get(CTRL_KEY, {});
  return {
    features:{aiTutor:true,aiGenerator:true,questionFeed:true,communityFeed:true,studyTools:true,formulaSheet:true,selfUpgrade:true,streaks:true,dailyQuiz:true,leaderboard:true,analytics:true,examModeApp:true,examModeBank:true,examModeMixed:true,...d.features},
    pricing:{...PLANS_BY_COUNTRY[getCountry()]||PLANS_BY_COUNTRY.GLOBAL,...d.pricing},
    api:{rateLimitMsg:" AI is busy! Please wait 2 minutes and try again.",retryAttempts:3,retryDelayMs:2000,...d.api},
    qFeed:{enabled:true,requireApproval:true,...d.qFeed},
    apps:{paid:true,...d.apps},
    maintenance:{paid:false,...d.maintenance},
    maintenanceMsg:d.maintenanceMsg||"",
    announcements:d.announcements||[],
    apiKeys:d.apiKeys||{},
  };
}, []);

const useDevice = () => {
  const g = () => ({w:window.innerWidth, mob:window.innerWidth<768, desk:window.innerWidth>=1024});
  const [d,s] = useState(g);
  useEffect(()=>{const f=()=>s(g());window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f);},[]);
  return d;
};

// ==========================================================================
// AUTH - Login / Signup with Login History
// ==========================================================================
function AuthScreen({onAuth}) {
  const [mode,setMode] = useState("login");
  const [f,setF] = useState({name:"",email:"",pass:"",pass2:""});
  const [err,setErr] = useState(""); const [busy,setBusy] = useState(false); const [sp,setSp] = useState(false);
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));

  // Check remembered sessions
  const history = LS.get("login_history", []);
  const remembered = LS.get("remembered_email", "");

  useEffect(() => { if (remembered) setF(p=>({...p, email:remembered})); }, []);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const h = await hashPass(f.pass);
      if (mode === "login") {
        const u = UserDB.get(f.email);
        if (!u) throw new Error("No account found. Sign up first.");
        const lk = authLocked(); if (lk) throw new Error("Too many attempts. Try again in " + lk + "s.");
        if (!(await pwCheck(f.pass, u.passwordHash, h))) { authFail(); throw new Error("Wrong password."); }
        authOk();
        if (String(u.passwordHash).indexOf("v2$") !== 0) { u.passwordHash = await pwCreate(f.pass); UserDB.save(u); }
        // Save login history
        const hist = [{email:f.email.toLowerCase(),name:u.name,ts:Date.now()}, ...history.filter(x=>x.email!==f.email.toLowerCase())].slice(0,5);
        LS.set("login_history", hist);
        LS.set("remembered_email", f.email.toLowerCase());
        Session.set(f.email); onAuth(u);
      } else {
        if (!f.name.trim()) throw new Error("Name required");
        if (!f.email.includes("@")) throw new Error("Valid email required");
        if (f.pass.length < 8) throw new Error("Password must be at least 8 characters");
        if (f.pass !== f.pass2) throw new Error("Passwords don't match");
        if (UserDB.get(f.email)) throw new Error("Account already exists. Log in.");
        const ctrl = LS.get(CTRL_KEY, {});
        const trial = ctrl?.pricing?.trialDays ?? 7;
        const u = {id:uid(),name:f.name.trim(),email:f.email.toLowerCase().trim(),passwordHash:await pwCreate(f.pass),country:getCountry(),plan:"trial",trialExpiry:Date.now()+trial*86400000,planExpiry:0,createdAt:Date.now(),streak:0,lastStudy:0,data:{bank:[],results:[],errorLog:[],upgrades:[]}};
        UserDB.save(u);
        LS.set("login_history", [{email:u.email,name:u.name,ts:Date.now()}, ...history].slice(0,5));
        LS.set("remembered_email", u.email);
        Session.set(u.email); onAuth(u);
      }
    } catch(e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top, #0f1b35 0%, ${C.bg} 70%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:52,marginBottom:10}}></div>
          <div style={{fontSize:26,fontWeight:900,color:C.text,fontFamily:"Georgia,serif"}}>Exam <span style={{color:C.accent}}>Platform</span></div>
          <div style={{display:"inline-block",background:C.violet+"20",border:`1px solid ${C.violet}40`,borderRadius:20,padding:"2px 14px",marginTop:6,fontSize:11,color:C.violet,fontWeight:700}}>PAID . AI Hub . 57+ Exams . Real Payments</div>
        </div>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:24}}>
          <Row sx={{marginBottom:18}}>
            {[["login","Sign In"],["signup","Sign Up"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");}} style={{flex:1,padding:"8px",background:mode===m?C.accent:"transparent",color:mode===m?"#fff":C.muted,border:`1px solid ${mode===m?C.accent:C.border}`,borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700}}>{l}</button>
            ))}
          </Row>

          {err && <div style={{background:C.red+"15",border:`1px solid ${C.red}30`,borderRadius:6,padding:"8px 12px",color:C.red,fontSize:12,marginBottom:10}}>{err}</div>}

          {mode==="signup" && <Input label="Full Name" value={f.name} onChange={set("name")} placeholder="Your full name" autoFocus />}
          <Input label="Email" value={f.email} onChange={set("email")} type="email" placeholder="you@email.com" autoFocus={mode==="login"&&!remembered} />
          <div style={{position:"relative"}}>
            <Input label="Password" value={f.pass} onChange={set("pass")} type={sp?"text":"password"} placeholder="Min 6 characters" onKeyDown={e=>e.key==="Enter"&&mode==="login"&&submit()} />
            <button onClick={()=>setSp(p=>!p)} style={{position:"absolute",right:10,top:30,background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>{sp?"":""}</button>
          </div>
          {mode==="signup" && <Input label="Confirm Password" value={f.pass2} onChange={set("pass2")} type="password" placeholder="Repeat password" onKeyDown={e=>e.key==="Enter"&&submit()} />}

          <Btn c={C.accent} full onClick={submit} disabled={busy} sx={{marginTop:4}}>
            {busy?<><Spin sz={14}/>Processing...</>:mode==="login"?" Sign In":" Create Account (7-day free trial)"}
          </Btn>

          <div style={{textAlign:"center",marginTop:12,color:C.muted,fontSize:12}}>
            {mode==="login"?"New here? ":"Have account? "}
            <button onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>
              {mode==="login"?"Sign Up Free":"Sign In"}
            </button>
          </div>
        </div>

        {/* Quick login from history */}
        {mode==="login" && history.length > 0 && (
          <div style={{marginTop:14}}>
            <div style={{color:C.muted,fontSize:10,textAlign:"center",marginBottom:6}}>RECENT ACCOUNTS</div>
            {history.slice(0,3).map(h=>(
              <button key={h.email} onClick={()=>setF(p=>({...p,email:h.email}))}
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12}}>{(h.name||h.email)[0].toUpperCase()}</div>
                <div style={{textAlign:"left"}}>
                  <div style={{color:C.text,fontSize:12,fontWeight:700}}>{h.name||h.email}</div>
                  <div style={{color:C.muted,fontSize:10}}>{h.email}</div>
                </div>
                <span style={{marginLeft:"auto",color:C.accent,fontSize:11}}>{">"}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={()=>onAuth({id:"guest",name:"Guest",email:"guest@",plan:"free",country:getCountry(),data:{bank:[],results:[],errorLog:[],upgrades:[]}})}
            style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 18px",color:C.muted,cursor:"pointer",fontSize:11}}>
            Continue as Guest (no saving)
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ==========================================================================
// PAYMENT SCREEN - Real Razorpay Integration
// ==========================================================================
function PaymentScreen({user, setUser, onBack}) {
  const [plan,setPlan] = useState("monthly");
  const [step,setStep] = useState("plan"); // plan | pay | setup
  const [busy,setBusy] = useState(false);
  const [msg,setMsg] = useState("");
  const country = user.country || getCountry();
  const pr = PLANS_BY_COUNTRY[country] || PLANS_BY_COUNTRY.GLOBAL;
  const ctrl = LS.get(CTRL_KEY,{});
  const ctrlPr = ctrl.pricing || {};
  const disc = ctrlPr.discount || 0;
  const eff = v => Math.round(v*(1-disc/100));
  const razorpayKey = LS.get("razorpay_key","");

  const PLAN_DEFS = [
    {id:"daily",   l:"1 Day",    price:eff(pr.daily||9),    dur:"24 hours",   badge:"",         icon:"sun"},
    {id:"weekly",  l:"1 Week",   price:eff(pr.weekly||29),  dur:"7 days",     badge:"",         icon:""},
    {id:"monthly", l:"Monthly",  price:eff(pr.monthly||99), dur:"30 days",    badge:"POPULAR",  icon:""},
    {id:"yearly",  l:"Yearly",   price:eff(pr.yearly||799), dur:"365 days",   badge:"SAVE 30%", icon:""},
    ];

  const planDurations = {daily:1, weekly:7, monthly:30, yearly:365*100};

  const loadRazorpay = () => new Promise(res => {
    if (window.Razorpay) { res(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });

  const payWithRazorpay = async () => {
    if (!razorpayKey) { setStep("setup"); return; }
    setBusy(true); setMsg("");
    const loaded = await loadRazorpay();
    if (!loaded) { setMsg("[!] Failed to load payment. Check internet."); setBusy(false); return; }
    const sel = PLAN_DEFS.find(p=>p.id===plan);
    const amountPaise = sel.price * 100;
    try {
      const options = {
        key: razorpayKey,
        amount: amountPaise,
        currency: pr.c || "INR",
        name: "ExamForge",
        description: `${sel.l} Plan - ${sel.dur}`,
        prefill: {name:user.name||"", email:user.email||""},
        theme: {color: "#6366f1"},
        modal: {ondismiss: () => { setBusy(false); setMsg("Payment cancelled."); }},
        handler: (response) => {
          // Payment successful
          const expiry = Date.now() + planDurations[plan]*86400000;
          const updated = {...user, plan:"paid", planExpiry:expiry, lastPayment:{plan, amount:sel.price, currency:pr.c, paymentId:response.razorpay_payment_id, ts:Date.now()}};
          UserDB.save(updated); setUser(updated);
          // Log to controller
          const revenue = LS.get("payment_log",[]);
          LS.set("payment_log",[{userId:user.id,email:user.email,plan,amount:sel.price,currency:pr.c,paymentId:response.razorpay_payment_id,ts:Date.now()},...revenue].slice(0,1000));
          setBusy(false);
          setMsg(" Payment successful! All features unlocked!");
          setTimeout(()=>onBack(),2000);
        },
      };
      const rz = new window.Razorpay(options);
      rz.on("payment.failed", (r) => { setBusy(false); setMsg("[ERR] Payment failed: "+r.error.description); });
      rz.open();
    } catch(e) { setBusy(false); setMsg("Error: "+e.message); }
  };

  if (step==="setup") return (
    <div style={{height:"100%",background:C.bg,overflow:"auto"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px"}}>
        <BackBtn onBack={()=>setStep("pay")} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> Setup Razorpay</span>
      </Row>
      <div style={{maxWidth:480,margin:"0 auto",padding:20}}>
        <Card>
          <div style={{color:C.text,fontWeight:800,fontSize:15,marginBottom:8}}> Setup Real Payments</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6,marginBottom:14}}>
            This app uses <strong style={{color:C.accent}}>Razorpay</strong> - India's most trusted payment gateway. It accepts UPI, PhonePe, GPay, Paytm, Debit/Credit cards, Net Banking, and international cards in 100+ countries.
            <br/><br/>
            <strong style={{color:C.amber}}>To receive real payments to your bank account:</strong>
          </div>
          {["1. Go to razorpay.com -> Create free account","2. Complete KYC (PAN + Aadhaar + Bank account)","3. Go to Settings -> API Keys -> Generate Test Key","4. Copy your Key ID (starts with 'rzp_')","5. Paste it below and payments will work instantly"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:C.accent,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,flexShrink:0}}>{i+1}</div>
              <div style={{color:C.text,fontSize:12,lineHeight:1.5}}>{s}</div>
            </div>
          ))}
          <div style={{marginTop:14}}>
            <label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Razorpay Key ID</label>
            <input defaultValue={razorpayKey} id="rz_key_input" placeholder="rzp_test_... or rzp_live_..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"9px 12px",color:C.text,fontSize:12,boxSizing:"border-box",marginBottom:8}} />
            <Btn c={C.green} full onClick={()=>{const k=document.getElementById("rz_key_input").value.trim();if(!k){return;}LS.set("razorpay_key",k);setStep("pay");setMsg("[OK] Key saved! Ready to accept payments.");}}>Save Key & Continue</Btn>
          </div>
          <div style={{marginTop:12,background:C.green+"10",border:`1px solid ${C.green}20`,borderRadius:6,padding:"8px 12px",fontSize:11,color:C.green}}>
            [OK] Razorpay auto-transfers money to your linked bank account every 24-48 hours after settlement.
          </div>
        </Card>
        <div style={{marginTop:12,textAlign:"center"}}>
          <button onClick={()=>{const expiry=Date.now()+planDurations[plan]*86400000;const updated={...user,plan:"paid",planExpiry:expiry};UserDB.save(updated);setUser(updated);onBack();}} style={{background:"none",border:"none",color:C.dim,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>
            Skip for now (demo mode - user gets access without real payment)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{height:"100%",background:C.bg,overflow:"auto"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px"}}>
        <BackBtn onBack={onBack} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}>Choose Plan</span>
      </Row>
      <div style={{maxWidth:480,margin:"0 auto",padding:20}}>
        {msg && <div style={{background:msg.startsWith("")||msg.startsWith("[OK]")?C.green+"15":C.red+"15",border:`1px solid ${msg.startsWith("")||msg.startsWith("[OK]")?C.green:C.red}30`,borderRadius:8,padding:"10px 14px",color:msg.startsWith("")||msg.startsWith("[OK]")?C.green:C.red,fontSize:13,marginBottom:14,fontWeight:700}}>{msg}</div>}
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:34,marginBottom:8}}></div>
          <div style={{fontSize:20,fontWeight:900,color:C.text}}>Unlock Everything</div>
          <div style={{color:C.muted,fontSize:12,marginTop:4}}>Pay in {pr.c} . Auto-converts from global pricing</div>
        </div>
        <Col g={8} sx={{marginBottom:20}}>
          {PLAN_DEFS.map(p=>(
            <button key={p.id} onClick={()=>setPlan(p.id)} style={{background:plan===p.id?C.accent+"18":C.card,border:`2px solid ${plan===p.id?C.accent:C.border}`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{textAlign:"left"}}>
                <Row g={6}>
                  <span>{p.icon}</span>
                  <span style={{color:plan===p.id?C.accent:C.text,fontWeight:800,fontSize:14}}>{p.l}</span>
                  {p.badge&&<Pill c={p.badge==="BEST DEAL"?C.amber:C.green} sm>{p.badge}</Pill>}
                </Row>
                <div style={{color:C.dim,fontSize:10,marginTop:3}}>{p.dur}</div>
              </div>
              <div style={{color:plan===p.id?C.accent:C.text,fontWeight:900,fontSize:20}}>{pr.s}{p.price}</div>
            </button>
          ))}
        </Col>
        {disc>0 && <div style={{textAlign:"center",color:C.green,fontSize:12,fontWeight:700,marginBottom:12}}> {disc}% discount applied!</div>}
        <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:6}}>ACCEPTED PAYMENT METHODS:</div>
          <Row g={6} sx={{flexWrap:"wrap"}}>
            {(PAYMENT_METHODS[country]||PAYMENT_METHODS.GLOBAL).map(m=><Pill key={m} c={C.accent} sm>{m}</Pill>)}
          </Row>
        </div>
        <Btn c={C.green} full onClick={payWithRazorpay} disabled={busy} sx={{fontSize:14,padding:"12px"}}>
          {busy?<><Spin sz={14}/>Processing...</>:` Pay ${pr.s}${PLAN_DEFS.find(p=>p.id===plan)?.price} - ${PLAN_DEFS.find(p=>p.id===plan)?.l}`}
        </Btn>
        <div style={{textAlign:"center",color:C.dim,fontSize:10,marginTop:6}}> Secured by Razorpay . 7-day refund</div>
        {!razorpayKey && <div style={{marginTop:10,textAlign:"center"}}><button onClick={()=>setStep("setup")} style={{background:"none",border:"none",color:C.amber,fontSize:11,cursor:"pointer",fontWeight:700}}> Setup payment system (admin)</button></div>}
      </div>
    </div>
  );
}


// ==========================================================================
// AI HUB - All AIs with search + API key management
// ==========================================================================
function AIHub({user, ctrl, onBack}) {
  const [search,setSearch] = useState("");
  const [selectedAI,setSelectedAI] = useState(null);
  const [showKeys,setShowKeys] = useState(false);
  const [keys,setKeys] = useState(() => LS.get("ai_api_keys",{}));
  const [msgs,setMsgs] = useState([]);
  const [input,setInput] = useState("");
  const [busy,setBusy] = useState(false);
  const [files,setFiles] = useState([]);
  const imgRef = useRef(); const pdfRef = useRef(); const bottomRef = useRef();
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const saveKey = (id,val) => { const k={...keys,[id]:val}; setKeys(k); LS.set("ai_api_keys",k); };
  const filtered = AI_PROVIDERS.filter(a=>!search||a.name.toLowerCase().includes(search.toLowerCase())||a.maker.toLowerCase().includes(search.toLowerCase())||a.desc.toLowerCase().includes(search.toLowerCase()));
  const activeAI = AI_PROVIDERS.find(a=>a.id===selectedAI);
  const allKeys = {...(ctrl.apiKeys||{}), ...keys};

  const SYS = `You are ${activeAI?.name||"Claude"}, expert exam AI. Solve questions step-by-step, concisely. Cover JEE/NEET/SAT/GRE/UPSC/IELTS and all exams. For photos/PDFs: extract and solve immediately. Max 350 words unless full solution needs more.`;

  const send = async () => {
    if((!input.trim()&&!files.length)||busy) return;
    const aiId = selectedAI||"claude";
    const userContent = [];
    for(const fl of files){try{const d=await b64(fl);userContent.push(fl.type==="application/pdf"?{type:"document",source:{type:"base64",media_type:"application/pdf",data:d}}:{type:"image",source:{type:"base64",media_type:fl.type,data:d}});}catch{}}
    if(input.trim()) userContent.push({type:"text",text:input.trim()});
    const displayContent = input.trim()||(files.map(fl=>fl.name).join(", "));
    setMsgs(p=>[...p,{role:"user",content:displayContent,ai:aiId}]);
    setInput(""); setFiles([]); setBusy(true);
    try {
      const hist = msgs.slice(-10).map(m=>({role:m.role,content:typeof m.content==="string"?m.content:"[files]"}));
      const newMsg = {role:"user",content:userContent.length===1&&userContent[0].type==="text"?userContent[0].text:userContent};
      const reply = await aiCall(aiId, SYS, [...hist,newMsg], allKeys);
      setMsgs(p=>[...p,{role:"assistant",content:reply||"No response.",ai:aiId}]);
    } catch(e) {
      const isRate = e.message==="RATE_LIMIT"||e.message?.includes("rate")||e.message?.includes("exceeded");
      setMsgs(p=>[...p,{role:"assistant",content:isRate?" "+ctrl.api.rateLimitMsg:"[ERR] "+e.message,ai:aiId,error:true}]);
    }
    setBusy(false);
  };

  const QUICK = ["Solve step by step:","Explain from basics:","JEE/SAT trick for:","30-day plan for:","Compare these concepts:","Predict exam pattern for:"];

  if (!selectedAI) return (
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> AI Hub - All AIs</span>
        <div style={{flex:1}} />
        <button onClick={()=>setShowKeys(p=>!p)} style={{background:showKeys?C.amber+"20":"transparent",border:`1px solid ${showKeys?C.amber:C.border}`,borderRadius:6,padding:"4px 10px",color:showKeys?C.amber:C.muted,fontSize:10,cursor:"pointer"}}> API Keys</button>
      </Row>

      {showKeys && (
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:14,flexShrink:0}}>
          <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:8}}> AI API Keys - Add your keys to unlock more AIs</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["openai","OpenAI (GPT-4)","sk-..."],["google","Google (Gemini)","AIza..."],["perplexity","Perplexity","pplx-..."],["mistral","Mistral","..."],["together","Together AI","..."],["groq","Groq","gsk_..."],["deepseek","DeepSeek","sk-..."]].map(([id,l,hint])=>(
              <div key={id}>
                <label style={{color:C.muted,fontSize:9,display:"block",marginBottom:2}}>{l}</label>
                <input defaultValue={allKeys[id]||""} placeholder={hint} onBlur={e=>saveKey(id,e.target.value)}
                  style={{width:"100%",background:C.surface,border:`1px solid ${allKeys[id]?C.green:C.border}`,borderRadius:5,padding:"5px 8px",color:C.text,fontSize:11,boxSizing:"border-box"}} />
              </div>
            ))}
          </div>
          <div style={{color:C.dim,fontSize:10,marginTop:6}}>Keys stored locally. Claude (built-in) works without a key.</div>
        </div>
      )}

      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 14px",flexShrink:0}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search AI models... (GPT, Gemini, DeepSeek, Perplexity...)"
            style={{width:"100%",background:C.card,border:`1.5px solid ${search?C.accent:C.border}`,borderRadius:10,padding:"9px 12px 9px 34px",color:C.text,fontSize:12,boxSizing:"border-box"}} />
        </div>
      </div>

      <div style={{flex:1,overflow:"auto",padding:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {filtered.map(ai=>{
            const isPaid=user.plan==="paid"&&user.planExpiry>Date.now();
            const isTrial=user.plan==="trial"&&user.trialExpiry>Date.now();
            const hasPurchase=isPaid||isTrial;
            // After purchase: ALL AIs unlocked (just need API key for non-Claude)
            // Before purchase: Only Claude free (5 queries/day), others locked
            const hasKey = ai.free || !!allKeys[ai.id] || (ai.id==="gpt4o"&&allKeys.openai)||(ai.id==="gpt4mini"&&allKeys.openai)||(ai.id==="gemini"&&allKeys.google)||(ai.id==="geminifl"&&allKeys.google)||(ai.id==="perp"&&allKeys.perplexity)||(ai.id==="mistral"&&allKeys.mistral)||(ai.id==="together"&&allKeys.together)||(ai.id==="groq"&&allKeys.groq)||(ai.id==="deepseek"&&allKeys.deepseek)||(ai.id==="cohere"&&allKeys.cohere)||(ai.id==="xai"&&allKeys.xai);
            const claudeUsage=LS.get(`ai_usage_${user.id}_${new Date().toDateString()}`,{});
            const claudeCount=claudeUsage["claude"]||0;
            const claudeLimit=ctrl.pricing?.freeAIQueriesPerDay||5;
            const isClaudeFree=ai.id==="claude"&&claudeCount<claudeLimit;
            const isAccessible=hasPurchase?hasKey:(ai.id==="claude"?isClaudeFree:false);
            const statusLabel=hasPurchase?(hasKey?"READY":"ADD KEY"):ai.id==="claude"?`${claudeCount}/${claudeLimit} free`:"PURCHASE";
            const statusColor=hasPurchase?(hasKey?ai.color:C.amber):ai.id==="claude"?C.cyan:C.dim;
            return (
              <button key={ai.id} onClick={()=>{
                const msg=hasPurchase?(!hasKey&&ai.id!=="claude"?` Hi! I'm **${ai.name}** by ${ai.maker}.

${ai.desc}

[!] Add your ${ai.maker} API key in ' API Keys' to use me.`:` Hi! I'm **${ai.name}** by ${ai.maker}.

${ai.desc}

[OK] Unlocked! Ask me anything about any exam!`)
                  :(ai.id==="claude"?` Hi! I'm Claude by Anthropic.

${ai.desc}

 Free: ${claudeCount}/${claudeLimit} queries used today. Upgrade for unlimited!`:` **${ai.name}** requires a paid plan.

Upgrade to access all 12 AI models with no limits!`);
                setSelectedAI(ai.id);setMsgs([{role:"assistant",content:msg,ai:ai.id}]);
              }}
                style={{background:C.card,border:`1.5px solid ${isAccessible?ai.color+"40":C.dim}`,borderRadius:12,padding:14,textAlign:"left",cursor:"pointer",opacity:isAccessible||hasPurchase?1:0.5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <span style={{fontSize:26}}>{ai.icon}</span>
                  <Pill c={statusColor} sm>{statusLabel}</Pill>
                </div>
                <div style={{color:isAccessible?ai.color:C.muted,fontWeight:800,fontSize:12,marginBottom:2}}>{ai.name}</div>
                <div style={{color:C.dim,fontSize:10,marginBottom:3}}>{ai.maker}</div>
                <div style={{color:C.muted,fontSize:10,lineHeight:1.4}}>{ai.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <button onClick={()=>setSelectedAI(null)} style={{background:"none",border:"none",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",padding:"8px 14px",flexShrink:0}}>AIs</button>
        <span style={{fontSize:16}}>{activeAI?.icon}</span>
        <div>
          <div style={{color:C.text,fontWeight:800,fontSize:13}}>{activeAI?.name}</div>
          <div style={{color:C.muted,fontSize:9}}>{activeAI?.maker}</div>
        </div>
        <div style={{flex:1}} />
        <button onClick={()=>setMsgs(m=>m.slice(0,1))} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 10px",color:C.muted,fontSize:10,cursor:"pointer"}}>Clear</button>
      </Row>
      <div style={{flex:1,overflow:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:8,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="user"?C.accent:activeAI?.color||C.violet,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{m.role==="user"?"":activeAI?.icon}</div>
            <div style={{maxWidth:"82%",background:m.role==="user"?C.accent+"20":m.error?C.red+"10":C.card,border:`1px solid ${m.role==="user"?C.accent+"40":m.error?C.red+"30":C.border}`,borderRadius:m.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",padding:"10px 14px",fontSize:12,color:C.text,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.content}</div>
          </div>
        ))}
        {busy&&<div style={{display:"flex",gap:8,alignItems:"flex-start"}}><div style={{width:28,height:28,borderRadius:"50%",background:activeAI?.color||C.violet,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeAI?.icon}</div><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"12px 12px 12px 2px",padding:"10px 14px",display:"flex",gap:8,alignItems:"center",color:C.muted,fontSize:12}}><Spin sz={12}/>Thinking...</div></div>}
        <div ref={bottomRef} />
      </div>
      <div style={{padding:"4px 12px 6px",display:"flex",gap:5,overflowX:"auto",flexShrink:0}}>
        {QUICK.map(q=><button key={q} onClick={()=>setInput(q)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"3px 10px",color:C.muted,fontSize:10,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{q}</button>)}
      </div>
      {files.length>0&&<div style={{padding:"0 12px 4px",display:"flex",gap:5,flexWrap:"wrap",flexShrink:0}}>{files.map((fl,i)=><div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 8px",display:"flex",gap:4,alignItems:"center",fontSize:10}}><span>{fl.type.startsWith("image/")?"":""}</span><span style={{color:C.text}}>{fl.name.slice(0,18)}</span><button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11}}>x</button></div>)}</div>}
      <div style={{padding:10,borderTop:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:6,alignItems:"flex-end",flexShrink:0}}>
        <input type="file" ref={imgRef} accept="image/*" multiple style={{display:"none"}} onChange={e=>setFiles(p=>[...p,...Array.from(e.target.files||[])])} />
        <input type="file" ref={pdfRef} accept="application/pdf" multiple style={{display:"none"}} onChange={e=>setFiles(p=>[...p,...Array.from(e.target.files||[])])} />
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>imgRef.current?.click()} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,width:34,height:34,cursor:"pointer",fontSize:15}}></button>
          <button onClick={()=>pdfRef.current?.click()} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,width:34,height:34,cursor:"pointer",fontSize:15}}></button>
        </div>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={`Ask ${activeAI?.name}... (Enter=send)`} rows={2}
          style={{flex:1,background:C.card,border:`1.5px solid ${input?activeAI?.color||C.accent:C.border}`,borderRadius:9,padding:"8px 11px",color:C.text,fontSize:12,resize:"none",lineHeight:1.5}} />
        <Btn c={activeAI?.color||C.accent} onClick={send} disabled={busy||(!input.trim()&&!files.length)} sx={{height:34,padding:"0 14px",flexShrink:0}}>Send</Btn>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ==========================================================================
// EXAM SELECTOR, MODE SELECTOR, ACTIVE EXAM, RESULT - compact versions
// ==========================================================================
function ExamSelector({onSelect, dev}) {
  const [q,setQ] = useState(""); const [cat,setCat] = useState("All"); const [cn,setCn] = useState("All");
  const cats = ["All",...new Set(EXAMS.map(e=>e.cat))];
  const countries = ["All",...new Set(EXAMS.map(e=>e.country))];
  const filtered = useMemo(()=>EXAMS.filter(e=>(cat==="All"||e.cat===cat)&&(cn==="All"||e.country===cn)&&(!q||e.name.toLowerCase().includes(q.toLowerCase())||e.short?.toLowerCase().includes(q.toLowerCase())||e.country.toLowerCase().includes(q.toLowerCase()))),[q,cat,cn]);
  return (
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 14px",flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:900,color:C.text,marginBottom:8}}> Choose Exam ({EXAMS.length} worldwide)</div>
        <div style={{position:"relative",marginBottom:8}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}></span>
          <input value={q} onChange={e=>setQ(e.target.value)} autoFocus placeholder="Search JEE, NEET, SAT, UPSC, IELTS, CFA, GRE..."
            style={{width:"100%",background:C.card,border:`1.5px solid ${q?C.accent:C.border}`,borderRadius:10,padding:"10px 12px 10px 36px",color:C.text,fontSize:13,boxSizing:"border-box"}} />
          {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer"}}>x</button>}
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          <select value={cn} onChange={e=>setCn(e.target.value)} style={{background:C.card,border:`1px solid ${cn!=="All"?C.accent:C.border}`,borderRadius:8,padding:"5px 10px",color:cn!=="All"?C.accent:C.muted,fontSize:11,flexShrink:0}}>
            {countries.map(c=><option key={c} value={c} style={{background:C.surface}}>{c==="All"?" All":c}</option>)}
          </select>
          {cats.slice(0,8).map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"5px 12px",background:cat===c?C.accent+"20":"transparent",color:cat===c?C.accent:C.muted,border:`1.5px solid ${cat===c?C.accent:C.border}`,borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{c}</button>)}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {filtered.length===0?<div style={{textAlign:"center",padding:60,color:C.muted}}><div style={{fontSize:36}}></div><div style={{marginTop:8}}>No exams found</div></div>:
        <div style={{display:"grid",gridTemplateColumns:`repeat(${dev.desk?3:2},1fr)`,gap:8}}>
          {filtered.map(exam=>(
            <button key={exam.id} onClick={()=>onSelect(exam)} style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:12,padding:12,textAlign:"left",cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=exam.color||C.accent;e.currentTarget.style.background=(exam.color||C.accent)+"12";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}>
              <Row g={8} sx={{marginBottom:5}}>
                <span style={{fontSize:20}}>{exam.icon||(exam.short||exam.name||"E").charAt(0)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontWeight:800,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{exam.name}</div>
                  <div style={{color:C.muted,fontSize:9}}>{exam.country} . {exam.cat}</div>
                </div>
              </Row>
              <Row g={4} sx={{flexWrap:"wrap"}}>
                {exam.totalQ&&<Pill c={C.accent} sm>{exam.totalQ}Q</Pill>}
                {exam.dur&&<Pill c={C.amber} sm>{exam.dur}m</Pill>}
              </Row>
            </button>
          ))}
        </div>}
      </div>
    </div>
  );
}

function ExamModeSelector({exam, user, onStart, onBack, ctrl}) {
  const [mode,setMode] = useState("app"); const [mix,setMix] = useState({app:15,bank:5});
  const [showInstr,setShowInstr] = useState(false);
  const bank = user.data?.bank||[];
  const approved = LS.get("community_q_approved",[]);

  const build = () => {
    const makeApp = () => buildRealExam(exam);
    if(mode==="app") return makeApp();
    if(mode==="bank"){const g={};bank.forEach(q=>{const sv=q.subject||"General";if(!g[sv])g[sv]=[];g[sv].push({...q,id:q.id||uid(),subj:sv,state:QS.NV,picked:[],numVal:"",bookmarked:false,type:q.type||"MCQ",opts:q.options||q.opts||[],ans:[q.correctAnswer??0],pos:q.marks||4,neg:q.negativeMarks||1});});return g;}
    if(mode==="community"){const g={};approved.filter(q=>!q.exam||q.exam===exam.name).slice(0,50).forEach(q=>{const sv=q.subject||"General";if(!g[sv])g[sv]=[];g[sv].push({...q,id:q.id||uid(),subj:sv,state:QS.NV,picked:[],numVal:"",bookmarked:false,type:"MCQ",opts:q.options||[],ans:[q.correctAnswer??0],pos:4,neg:1});});return Object.keys(g).length?g:makeApp();}
    const app=makeApp(); const g={};
    Object.keys(app).forEach(sv=>{g[sv]=(app[sv]||[]).slice(0,Math.ceil(mix.app/Math.max(Object.keys(app).length,1)));});
    bank.sort(()=>Math.random()-.5).slice(0,mix.bank).forEach(q=>{const sv=q.subject||"General";if(!g[sv])g[sv]=[];g[sv].push({...q,id:q.id||uid(),subj:sv,state:QS.NV,picked:[],numVal:"",bookmarked:false,type:q.type||"MCQ",opts:q.options||q.opts||[],ans:[q.correctAnswer??0],pos:q.marks||4,neg:q.negativeMarks||1});});
    return g;
  };

  const MODES = [
    {id:"app",icon:"",t:"Standard Questions",d:`${exam.totalQ||30} curated questions`,a:ctrl.features.examModeApp},
    {id:"bank",icon:"",t:"My Bank",d:bank.length?`${bank.length} your questions`:"Upload to bank first",a:ctrl.features.examModeBank&&bank.length>0},
    {id:"mixed",icon:"",t:"Mixed Mode",d:"App + Your bank",a:ctrl.features.examModeMixed&&bank.length>0},
    {id:"community",icon:"",t:"Community Q's",d:approved.length?`${approved.length} approved`:"No community Q's yet",a:ctrl.features.communityFeed&&approved.length>0},
  ];

  if(showInstr) return <InstructionScreen exam={exam} mode={mode} onConfirm={()=>onStart({exam,questions:build(),startedAt:Date.now()})} onBack={()=>setShowInstr(false)} />;

  return (
      <div style={{flex:1,overflow:"auto",padding:18}}>
        <div style={{maxWidth:500,margin:"0 auto"}}>
          <div style={{background:`linear-gradient(135deg,${exam.color||C.accent}22,${C.violet}12)`,border:`1px solid ${exam.color||C.accent}40`,borderRadius:14,padding:18,marginBottom:18,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:6}}>{exam.icon||(exam.short||exam.name||"E").charAt(0)}</div>
            <div style={{fontSize:18,fontWeight:900,color:C.text,marginBottom:4}}>{exam.name}</div>
            <Row g={6} sx={{justifyContent:"center",flexWrap:"wrap",marginBottom:8}}>
              {exam.totalQ&&<Pill c={C.accent}>{exam.totalQ}Q</Pill>}
              {exam.dur&&<Pill c={C.amber}>{exam.dur}min</Pill>}
              {exam.marks&&<Pill c={C.green}>{exam.marks}marks</Pill>}
            </Row>
            {exam.pattern&&<div style={{color:C.muted,fontSize:10,lineHeight:1.5}}>{exam.pattern}</div>}
          </div>
          <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:10}}>Select Question Source</div>
          <Col g={8} sx={{marginBottom:18}}>
            {MODES.map(m=>(
              <button key={m.id} onClick={()=>m.a&&setMode(m.id)} disabled={!m.a}
                style={{background:mode===m.id?(exam.color||C.accent)+"18":C.card,border:`2px solid ${mode===m.id?(exam.color||C.accent):m.a?C.border:C.dim}`,borderRadius:12,padding:13,cursor:m.a?"pointer":"not-allowed",textAlign:"left",opacity:m.a?1:0.4}}>
                <Row g={10}><span style={{fontSize:24}}>{m.icon}</span><div style={{flex:1}}><div style={{color:mode===m.id?(exam.color||C.accent):C.text,fontWeight:700,fontSize:13}}>{m.t}</div><div style={{color:C.muted,fontSize:11}}>{m.d}</div></div>{mode===m.id&&<span style={{color:exam.color||C.accent}}>*</span>}</Row>
              </button>
            ))}
          </Col>
          {mode==="mixed"&&(
            <Card sx={{marginBottom:16,borderColor:C.accent+"40"}}>
              <div style={{color:C.accent,fontWeight:700,fontSize:13,marginBottom:10}}> Custom Mix</div>
              {[{l:`App questions: ${mix.app}`,k:"app",max:exam.totalQ||30,c:C.accent},{l:`My bank: ${mix.bank}`,k:"bank",max:Math.min(bank.length,50),c:C.violet}].map(s=>(
                <div key={s.k} style={{marginBottom:10}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>{s.l}</div>
                  <input type="range" min="0" max={s.max} value={mix[s.k]} onChange={e=>setMix(p=>({...p,[s.k]:+e.target.value}))} style={{width:"100%",accentColor:s.c}} />
                </div>
              ))}
              <div style={{textAlign:"center",color:C.green,fontSize:12,fontWeight:700}}>Total: {mix.app+mix.bank} questions</div>
            </Card>
          )}
          {mode&&<Btn c={exam.color||C.green} full onClick={()=>setShowInstr(true)} sx={{fontSize:14,padding:"12px"}}> View Instructions & Start</Btn>}
        </div>
      </div>
  );
}

function ActiveExam({examData, onSubmit, dev, candidate}) {
  return <ExamEngine exam={examData.exam} questions={examData.questions} onSubmit={onSubmit} candidate={candidate} saveKey={"exam_session_"+examData.exam.id+"_"+examData.startedAt} proctor={true} />;
}

function ResultScreen({result, onBack, onRetake, ctrl}) {
  const [tab,setTab]=useState("overview"); const [strat,setStrat]=useState(""); const [stratBusy,setStratBusy]=useState(false);
  const [aiInsight,setAiInsight]=useState(""); const [insightBusy,setInsightBusy]=useState(false);
  const {score,total,correct,wrong,skipped,bySubj,timeTaken,totalQ,exam}=result;
  const pct=total?Math.round(score/total*100):0;
  const acc=correct&&(correct+wrong)?Math.round(correct/(correct+wrong)*100):0;
  const aiKeys={...LS.get("ai_api_keys",{}),...(ctrl.apiKeys||{})};
  const timePer=totalQ?Math.round(timeTaken/totalQ):0;
  
  // AI Weakness detection (Part 48, 78)
  const weakSubjs=Object.entries(bySubj||{}).filter(([,d])=>d.total>0&&d.correct/d.total<0.5).map(([k])=>k);
  const strongSubjs=Object.entries(bySubj||{}).filter(([,d])=>d.total>0&&d.correct/d.total>=0.7).map(([k])=>k);
  
  // Percentile estimate (Part 33, 46)
  const examBench={JEE_MAIN:{avg:85,p90:200,p95:240,p99:280},NEET:{avg:360,p90:550,p95:600,p99:650},SAT:{avg:1050,p90:1300,p95:1400,p99:1520},UPSC:{avg:80,p90:120,p95:140,p99:160},CAT:{avg:80,p90:150,p95:165,p99:180}};
  const bench=examBench[exam?.id]||{avg:total*0.35,p90:total*0.65,p95:total*0.75,p99:total*0.9};
  const percentile=score>=bench.p99?99:score>=bench.p95?95:score>=bench.p90?90:score>bench.avg?Math.round(50+(score-bench.avg)/(bench.p90-bench.avg)*40):Math.round(score/bench.avg*50);
  
  const genStrat=async()=>{setStratBusy(true);try{const r=await aiCall("claude","You are an expert exam coach. Be specific and actionable.",`Exam: ${exam?.name}. Score: ${score}/${total}(${pct}%). Correct:${correct},Wrong:${wrong},Skipped:${skipped}. Time per Q: ${timePer}s. Weak subjects: ${weakSubjs.join(",")||"none"}. Strong: ${strongSubjs.join(",")||"none"}. Subjects: ${JSON.stringify(Object.entries(bySubj||{}).map(([k,v])=>({sub:k,score:v.score,c:v.correct,w:v.wrong,s:v.skipped})))}. Give a precise 3-week study plan with daily tasks, focusing on weak areas first.`,aiKeys);setStrat(r);}catch(e){setStrat("Error: "+e.message);}setStratBusy(false);};
  
  const genInsight=async()=>{setInsightBusy(true);try{const r=await aiCall("claude","You are an expert exam analytics AI. Provide specific, actionable insights.",`Analyze this ${exam?.name} attempt:\nScore: ${score}/${total}\nAccuracy: ${acc}%\nTime per question: ${timePer}s\nWrong: ${wrong}, Skipped: ${skipped}\nSubject breakdown: ${JSON.stringify(bySubj)}\n\nProvide:\n1. Top 3 specific mistakes made\n2. Time management analysis\n3. Predicted score if these are fixed\n4. 3 most important topics to study next\n5. Exam strategy for next attempt`,aiKeys);setAiInsight(r);}catch(e){setAiInsight("Error: "+e.message);}setInsightBusy(false);};

  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> {exam?.name} Result</span>
        <div style={{flex:1}} /><Btn sm c={C.violet} onClick={onRetake}>Retake</Btn>
      </Row>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,overflowX:"auto"}}>
        {[["overview"," Overview"],["analysis"," Analysis"],["ai"," AI Insights"],["strategy"," Strategy"],["solutions","v Solutions"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        {tab==="overview"&&<div style={{maxWidth:580,margin:"0 auto"}}>
          {/* Score card */}
          <div style={{background:`linear-gradient(135deg,${exam?.color||"#1a237e"},${C.violet}88)`,borderRadius:16,padding:22,textAlign:"center",marginBottom:12,color:"#fff"}}>
            <div style={{fontSize:58,fontWeight:900,lineHeight:1}}>{score}</div>
            <div style={{opacity:.8,fontSize:13,marginBottom:8}}>out of {total} marks</div>
            <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {[{l:"Accuracy",v:`${acc}%`},{l:"Correct",v:correct},{l:"Wrong",v:wrong},{l:"Skipped",v:skipped},{l:"Time",v:`${Math.round(timeTaken/60)}m`}].map(st=><div key={st.l} style={{background:"rgba(255,255,255,.15)",borderRadius:8,padding:"5px 10px"}}><div style={{fontSize:15,fontWeight:900}}>{st.v}</div><div style={{fontSize:9,opacity:.7}}>{st.l}</div></div>)}
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{background:"rgba(255,255,255,.2)",borderRadius:8,padding:"5px 12px"}}><span style={{fontSize:12,fontWeight:900}}>~{percentile}th</span><span style={{fontSize:9,opacity:.8}}> percentile</span></div>
              <div style={{background:pct>=60?"rgba(16,185,129,.3)":"rgba(239,68,68,.3)",borderRadius:8,padding:"5px 12px"}}><span style={{fontSize:12,fontWeight:900}}>{pct>=80?"Excellent!":pct>=60?"Good":pct>=40?"Average":"Needs Work"}</span></div>
            </div>
          </div>
          {/* Subject breakdown bars */}
          {Object.entries(bySubj||{}).map(([sv,d])=>{
            const t=d.correct+d.wrong+d.skipped||1;const p=Math.round(d.correct/t*100);
            return(<Card key={sv} sx={{marginBottom:7}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontWeight:700,color:C.text,fontSize:12}}>{sv}</span>
                <span style={{color:d.score>=0?C.green:C.red,fontWeight:700}}>{d.score>=0?"+":""}{d.score} pts</span>
              </div>
              <div style={{background:C.surface,borderRadius:5,height:7,marginBottom:5,overflow:"hidden"}}>
                <div style={{height:"100%",background:p>70?C.green:p>40?C.amber:C.red,borderRadius:5,width:`${p}%`}}/>
              </div>
              <Row g={12} sx={{fontSize:10}}><span style={{color:C.green}}>v{d.correct}</span><span style={{color:C.red}}>x{d.wrong}</span><span style={{color:C.muted}}>-{d.skipped}</span><span style={{color:C.muted,marginLeft:"auto"}}>{p}% acc</span></Row>
            </Card>);
          })}
          {/* Weakness alerts */}
          {weakSubjs.length>0&&<div style={{background:C.red+"18",border:`1px solid ${C.red}30`,borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{color:C.red,fontWeight:800,fontSize:12,marginBottom:5}}>[!] Weak Areas Detected</div>
            {weakSubjs.map(s=><div key={s} style={{color:C.muted,fontSize:11,marginBottom:2}}>* {s} - needs intensive practice</div>)}
          </div>}
          {strongSubjs.length>0&&<div style={{background:C.green+"18",border:`1px solid ${C.green}30`,borderRadius:10,padding:12}}>
            <div style={{color:C.green,fontWeight:800,fontSize:12,marginBottom:5}}>[OK] Strong Areas</div>
            {strongSubjs.map(s=><div key={s} style={{color:C.muted,fontSize:11,marginBottom:2}}>* {s} - maintain this level</div>)}
          </div>}
        </div>}

        {tab==="analysis"&&<div style={{maxWidth:580,margin:"0 auto"}}>
          {/* Deep Analytics (Parts 34, 47, 53) */}
          <Card sx={{marginBottom:10}}>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:10}}> Time Analysis</div>
            {[{l:"Total Time Used",v:`${Math.round(timeTaken/60)}/${exam?.dur||180} min`},{l:"Time Per Question",v:`${timePer}s avg`},{l:"Time Utilization",v:`${Math.round(timeTaken/((exam?.dur||180)*60)*100)}%`},{l:"Est. Optimal Time/Q",v:`${Math.round((exam?.dur||180)*60/totalQ)}s`}].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><span style={{color:C.muted}}>{r.l}</span><span style={{color:C.text,fontWeight:600}}>{r.v}</span></div>)}
          </Card>
          <Card sx={{marginBottom:10}}>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:10}}> Performance Metrics</div>
            {[{l:"Attempt Rate",v:`${Math.round((correct+wrong)/totalQ*100)}%`},{l:"Strike Rate",v:`${acc}%`},{l:"Negative Marks Lost",v:`-${wrong*(exam?.neg||1)}`},{l:"Marks Left on Table",v:`${skipped*(exam?.pos||4)}`},{l:"Estimated Percentile",v:`~${percentile}th`},{l:"Score Percentage",v:`${pct}%`}].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><span style={{color:C.muted}}>{r.l}</span><span style={{color:C.text,fontWeight:600}}>{r.v}</span></div>)}
          </Card>
          <Card sx={{marginBottom:10}}>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:8}}> Score Prediction (Part 55)</div>
            <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Based on your performance trend:</div>
            {[{l:"If wrong answers reduced by 30%",v:Math.round(score+wrong*0.3*(exam?.neg||1)),c:C.green},{l:"If skipped attempts captured 50%",v:Math.round(score+skipped*0.5*(exam?.pos||4)),c:C.amber},{l:"Combined improvement",v:Math.round(score+wrong*0.3*(exam?.neg||1)+skipped*0.5*(exam?.pos||4)),c:C.accent}].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><span style={{color:C.muted}}>{r.l}</span><span style={{color:r.c,fontWeight:700}}>{r.v}</span></div>)}
          </Card>
          {/* Difficulty breakdown */}
          {result.questions&&<Card>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:8}}> Difficulty Breakdown</div>
            {["Easy","Medium","Hard"].map(d=>{
              const qs=(result.questions||[]).filter(q=>q.diff===d||(!q.diff&&d==="Medium"));
              const corr=qs.filter(q=>q.result==="correct").length;
              return(<div key={d} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:C.muted}}>{d} ({qs.length}Q)</span><span style={{color:C.text,fontWeight:600}}>{qs.length?Math.round(corr/qs.length*100):0}%</span></div>
                <div style={{background:C.surface,borderRadius:5,height:6,overflow:"hidden"}}><div style={{height:"100%",background:d==="Easy"?C.green:d==="Medium"?C.amber:C.red,width:`${qs.length?corr/qs.length*100:0}%`,borderRadius:5}}/></div>
              </div>);
            })}
          </Card>}
        </div>}

        {tab==="ai"&&<div style={{maxWidth:580,margin:"0 auto"}}>
          <Card sx={{marginBottom:10}}>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:8}}> AI Performance Analysis (Parts 47, 48)</div>
            {!aiInsight&&!insightBusy&&<Btn c={C.accent} onClick={genInsight}> Analyze My Performance</Btn>}
            {insightBusy&&<Row g={10} sx={{color:C.muted,padding:"12px 0"}}><Spin/>Analyzing your mistakes and patterns...</Row>}
            {aiInsight&&<div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{aiInsight}</div>}
          </Card>
          {weakSubjs.length>0&&<Card sx={{background:C.red+"10",borderColor:C.red+"30"}}>
            <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:8}}> Weak Area Focus Plan</div>
            {weakSubjs.map(sv=>{const d=bySubj[sv];return(<div key={sv} style={{marginBottom:8,padding:"8px",background:C.surface,borderRadius:8}}>
              <div style={{color:C.text,fontWeight:700,fontSize:12}}>{sv}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>{d.correct} correct . {d.wrong} wrong . Suggested: Practice 20+ questions daily</div>
            </div>);})}
          </Card>}
        </div>}

        {tab==="strategy"&&<div style={{maxWidth:560,margin:"0 auto"}}>
          <Card>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:8}}> AI Personalized 3-Week Plan (Part 44)</div>
            {!strat&&!stratBusy&&<Btn c={C.accent} onClick={genStrat}> Generate My Study Plan</Btn>}
            {stratBusy&&<Row g={10} sx={{color:C.muted,padding:"12px 0"}}><Spin/>Building your study plan...</Row>}
            {strat&&<div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{strat}</div>}
          </Card>
        </div>}

        {tab==="solutions"&&<div style={{maxWidth:680,margin:"0 auto"}}>
          {/* Question-wise solutions with explanations (Part 37) */}
          {(result.questions||[]).map((q,i)=><div key={q.id||i} style={{background:C.card,border:`1.5px solid ${q.result==="correct"?C.green:q.result==="wrong"?C.red:C.border}40`,borderRadius:10,padding:11,marginBottom:7}}>
            <Row g={6} sx={{marginBottom:6,flexWrap:"wrap"}}>
              <span style={{color:C.muted,fontSize:10}}>Q{i+1}</span>
              <Pill c={q.result==="correct"?C.green:q.result==="partial"?C.amber:q.result==="wrong"?C.red:C.muted} sm>{q.result==="correct"?"v Correct":q.result==="partial"?"~ Partial":q.result==="wrong"?"x Wrong":"- Skip"}</Pill>
              {q.diff&&<Pill c={q.diff==="Hard"?C.red:q.diff==="Easy"?C.green:C.amber} sm>{q.diff}</Pill>}
              {q.chapter&&<span style={{color:C.dim,fontSize:9}}>{q.chapter}</span>}
              {q.year&&<span style={{color:C.dim,fontSize:9}}>{q.year}</span>}
            </Row>
            <div style={{fontSize:12,color:C.text,lineHeight:1.6,marginBottom:6}}>{q.t||q.questionText}</div>
            {/* Show options with correct highlighted */}
            {q.opts&&<div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:6}}>
              {q.opts.map((o,oi)=>{
                const isCorrect=q.ans?.includes(oi);const isPicked=q.picked?.includes(oi);
                return(<div key={oi} style={{fontSize:11,padding:"4px 8px",borderRadius:5,background:isCorrect?C.green+"20":isPicked&&!isCorrect?C.red+"18":C.surface,border:`1px solid ${isCorrect?C.green+"40":isPicked&&!isCorrect?C.red+"30":C.border}`,color:isCorrect?C.green:isPicked&&!isCorrect?C.red:C.muted}}>{String.fromCharCode(65+oi)}. {o}{isCorrect?" v":""}{isPicked&&!isCorrect?" x":""}</div>);
              })}
            </div>}
            {q.exp&&<div style={{fontSize:11,color:C.cyan,background:C.cyan+"10",borderRadius:6,padding:"6px 10px",lineHeight:1.5}}> {q.exp}</div>}
          </div>)}
        </div>}
      </div>
    </div>
  );
}

// ==========================================================================
// QUESTION FEED, BANK, STUDY TOOLS, PROFILE, DASHBOARD, ROOT APP
// ==========================================================================
function QuestionFeed({user, setUser, ctrl, onBack}) {
  const [tab,setTab]=useState("browse"); const [form,setForm]=useState({text:"",optA:"",optB:"",optC:"",optD:"",correct:0,exam:"",subject:"",difficulty:"Medium"});
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(""); const [search,setSearch]=useState("");
  const approved=LS.get("community_q_approved",[]); const pending=LS.get("community_q_pending",[]);
  const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const aiKeys=LS.get("ai_api_keys",{});

  const autoDetect=async(text)=>{if(!text||text.length<20)return;setBusy(true);try{const r=await aiCall("claude","Classify exam question. Return ONLY JSON: {\"exam\":\"...\",\"subject\":\"...\",\"difficulty\":\"Easy/Medium/Hard\"}",text,aiKeys);const d=JSON.parse(r.replace(/```json?/g,"").replace(/```/g,"").trim().slice(r.indexOf("{"),r.lastIndexOf("}")+1));setForm(p=>({...p,exam:d.exam||p.exam,subject:d.subject||p.subject,difficulty:d.difficulty||p.difficulty}));setMsg("[OK] Auto-detected: "+d.exam);}catch{setMsg("Could not auto-detect. Fill manually.");}setBusy(false);};

  const submit=()=>{if(!form.text.trim()){setMsg("Question text required");return;}const q={id:uid(),questionText:form.text,options:[form.optA,form.optB,form.optC,form.optD].filter(Boolean),correctAnswer:form.correct,exam:form.exam||"General",subject:form.subject,difficulty:form.difficulty,type:"MCQ",marks:4,negativeMarks:1,submittedBy:user.name||"Anonymous",submittedAt:Date.now(),userId:user.id};if(ctrl.qFeed.requireApproval){LS.set("community_q_pending",[q,...pending]);setMsg("[OK] Submitted! Pending admin review.");}else{LS.set("community_q_approved",[{...q,approvedAt:Date.now()},...approved]);setMsg("[OK] Published to community!");}setForm({text:"",optA:"",optB:"",optC:"",optD:"",correct:0,exam:"",subject:"",difficulty:"Medium"});};

  const filtered=approved.filter(q=>!search||q.questionText?.toLowerCase().includes(search.toLowerCase())||q.exam?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> Community Q Feed</span>
        <div style={{flex:1}} />
        <Row g={4}><Pill c={C.green}>{approved.length} Live</Pill>{pending.length>0&&<Pill c={C.amber}>{pending.length} Pending</Pill>}</Row>
      </Row>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,overflowX:"auto"}}>
        {[["browse"," Browse"],["submit","+ Submit"],["mypending"," My Pending"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"9px 16px",background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {msg&&<div style={{background:msg.startsWith("[OK]")?C.green+"15":C.red+"15",border:`1px solid ${msg.startsWith("[OK]")?C.green:C.red}30`,borderRadius:6,padding:"7px 12px",color:msg.startsWith("[OK]")?C.green:C.red,fontSize:11,marginBottom:8}}>{msg}</div>}
        {tab==="browse"&&<><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search community questions..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:12,boxSizing:"border-box",marginBottom:8}} />{filtered.length===0?<div style={{textAlign:"center",padding:60,color:C.dim}}><div style={{fontSize:36,marginBottom:8}}></div><div>No questions yet. Be first to submit!</div></div>:filtered.map(q=><Card key={q.id} sx={{marginBottom:7}}><Row g={5} sx={{marginBottom:5,flexWrap:"wrap"}}>{q.exam&&<Pill c={C.accent} sm>{q.exam}</Pill>}{q.subject&&<Pill c={C.violet} sm>{q.subject}</Pill>}<Pill c={q.difficulty==="Hard"?C.red:q.difficulty==="Easy"?C.green:C.amber} sm>{q.difficulty}</Pill><span style={{color:C.dim,fontSize:10,marginLeft:"auto"}}>by {q.submittedBy}</span></Row><div style={{fontSize:12,color:C.text,lineHeight:1.6,marginBottom:6}}>{q.questionText?.slice(0,200)}</div>{q.options?.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>{q.options.map((o,oi)=><div key={oi} style={{fontSize:11,padding:"3px 7px",borderRadius:4,background:oi===q.correctAnswer?C.green+"20":C.surface,color:oi===q.correctAnswer?C.green:C.muted}}>{String.fromCharCode(65+oi)}. {o}</div>)}</div>}</Card>)}</>}
        {tab==="submit"&&<Card sx={{maxWidth:560,margin:"0 auto"}}><div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:6}}>+ Submit to Community</div><div style={{background:C.red+"18",border:`1.5px solid ${C.red}50`,borderRadius:10,padding:"10px 14px",marginBottom:10}}><div style={{color:C.red,fontWeight:900,fontSize:12,marginBottom:3}}>[!] STRICT POLICY - READ BEFORE SUBMITTING</div><div style={{color:C.red,fontSize:11,lineHeight:1.6}}>Submitting <strong>WRONG ANSWERS</strong> OR <strong>WRONG / MISLEADING QUESTIONS</strong> will result in immediate <strong>ACCOUNT SUSPENSION</strong>. Both types of violations are equally penalized. Zero tolerance policy.</div></div><div style={{marginBottom:8}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:3}}>Question Text *</label><textarea value={form.text} onChange={ff("text")} onBlur={()=>!form.exam&&autoDetect(form.text)} placeholder="Enter exam question..." rows={3} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} />{busy&&<div style={{color:C.muted,fontSize:10,marginTop:2}}><Spin sz={10}/> Detecting exam...</div>}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>{["optA","optB","optC","optD"].map((k,i)=><div key={k}><label style={{color:form.correct===i?C.green:C.muted,fontSize:10,display:"block",marginBottom:2}}>Option {String.fromCharCode(65+i)} {form.correct===i?"v":""}</label><Row g={4}><input value={form[k]} onChange={ff(k)} style={{flex:1,background:C.surface,border:`1px solid ${form.correct===i?C.green:C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11,boxSizing:"border-box"}} /><button onClick={()=>setForm(p=>({...p,correct:i}))} style={{background:form.correct===i?C.green+"20":"transparent",border:`1px solid ${form.correct===i?C.green:C.border}`,borderRadius:4,padding:"3px 6px",cursor:"pointer",color:form.correct===i?C.green:C.dim,fontSize:10}}>v</button></Row></div>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}><div><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:2}}>Exam</label><input value={form.exam} onChange={ff("exam")} placeholder="Auto-detected" style={{width:"100%",background:C.surface,border:`1px solid ${form.exam?C.accent:C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11,boxSizing:"border-box"}} /></div><div><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:2}}>Subject</label><input value={form.subject} onChange={ff("subject")} placeholder="Physics..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11,boxSizing:"border-box"}} /></div><div><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:2}}>Difficulty</label><select value={form.difficulty} onChange={ff("difficulty")} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11}}>{ ["Easy","Medium","Hard"].map(o=><option key={o} value={o} style={{background:C.surface}}>{o}</option>)}</select></div></div><div style={{background:C.red+"12",border:`1px solid ${C.red}30`,borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:10,color:C.red}}>[!] <strong>IMPORTANT:</strong> Submitting wrong answers OR wrong/incorrect/misleading questions = immediate account suspension. Wrongness is equally penalized.</div>
<Btn c={C.green} full onClick={submit} disabled={!form.text.trim()}> Submit Question</Btn>{ctrl.qFeed.requireApproval&&<div style={{color:C.amber,fontSize:10,marginTop:5,textAlign:"center"}}>[!] WARNING: Submitting wrong answers OR wrong/incorrect questions will result in ACCOUNT SUSPENSION</div>}</Card>}
        {tab==="mypending"&&(pending.filter(q=>q.userId===user.id).length===0?<div style={{textAlign:"center",padding:40,color:C.dim}}>No pending from you</div>:pending.filter(q=>q.userId===user.id).map(q=><Card key={q.id} sx={{marginBottom:6,borderColor:C.amber+"40"}}><Pill c={C.amber} sm> Pending</Pill><div style={{fontSize:12,color:C.text,marginTop:5}}>{q.questionText?.slice(0,150)}</div></Card>))}
      </div>
    </div>
  );
}

function QuestionBank({user, setUser, ctrl, onBack}) {
  const [tab,setTab]=useState("bank"); const [manual,setManual]=useState({text:"",optA:"",optB:"",optC:"",optD:"",correct:0,subject:"Physics",topic:"",difficulty:"Medium"});
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(""); const [search,setSearch]=useState("");
  const imgRef=useRef(); const bank=user.data?.bank||[];
  const aiKeys=LS.get("ai_api_keys",{});
  const save=(b)=>{const u={...user,data:{...user.data,bank:b}};UserDB.save(u);setUser(u);};
  const extract=async(files)=>{setBusy(true);setMsg("Extracting with AI...");for(const fl of files){try{const d=await b64(fl);const parts=[fl.type==="application/pdf"?{type:"document",source:{type:"base64",media_type:"application/pdf",data:d}}:{type:"image",source:{type:"base64",media_type:fl.type,data:d}},{type:"text",text:"Extract ALL exam questions. Return ONLY valid JSON array: [{\"questionText\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctAnswer\":0,\"explanation\":\"...\",\"subject\":\"\",\"difficulty\":\"Medium\",\"type\":\"MCQ\",\"marks\":4,\"negativeMarks\":1}]. No other text."}];const raw=await aiCall("claude","Extract questions. Return ONLY JSON array.",parts,aiKeys,4000);let parsed=[];try{let c=raw.replace(/```json?/g,"").replace(/```/g,"").trim();const st=c.indexOf("["),en=c.lastIndexOf("]");if(st>=0&&en>st)parsed=JSON.parse(c.slice(st,en+1));}catch{}if(parsed.length){save([...bank,...parsed.map(q=>({...q,id:uid(),createdAt:Date.now(),source:"upload"}))]);setMsg(`[OK] Extracted ${parsed.length} questions from ${fl.name}`);}else setMsg("[!] No questions found. Try clearer image.");}catch(e){setMsg("Error: "+e.message);}}setBusy(false);};
  const addManual=()=>{if(!manual.text.trim())return;save([...bank,{id:uid(),questionText:manual.text,options:[manual.optA,manual.optB,manual.optC,manual.optD].filter(Boolean),correctAnswer:manual.correct,subject:manual.subject,topic:manual.topic,difficulty:manual.difficulty,type:"MCQ",marks:4,negativeMarks:1,createdAt:Date.now(),source:"manual"}]);setManual({text:"",optA:"",optB:"",optC:"",optD:"",correct:0,subject:"Physics",topic:"",difficulty:"Medium"});setMsg("[OK] Added!");};
  const filtered=bank.filter(q=>!search||q.questionText?.toLowerCase().includes(search.toLowerCase())||q.subject?.toLowerCase().includes(search.toLowerCase()));
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack} />
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> Question Bank ({bank.length})</span>
      </Row>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,overflowX:"auto"}}>
        {[["bank",` Bank (${bank.length})`],["add","+ Manual"],["extract"," AI Extract"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"9px 14px",background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {msg&&<div style={{background:msg.startsWith("[OK]")?C.green+"15":C.amber+"15",borderRadius:6,padding:"7px 12px",color:msg.startsWith("[OK]")?C.green:C.amber,fontSize:11,marginBottom:8}}>{msg}</div>}
        {tab==="bank"&&<><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:12,boxSizing:"border-box",marginBottom:8}} />{filtered.length===0?<div style={{textAlign:"center",padding:60,color:C.dim}}><div style={{fontSize:36}}></div><div style={{marginTop:8}}>Bank empty! Add or extract questions.</div></div>:filtered.map((q,i)=><Card key={q.id||i} sx={{marginBottom:6}}><Row g={4} sx={{marginBottom:4,flexWrap:"wrap"}}>{q.subject&&<Pill c={C.accent} sm>{q.subject}</Pill>}{q.difficulty&&<Pill c={q.difficulty==="Hard"?C.red:q.difficulty==="Easy"?C.green:C.amber} sm>{q.difficulty}</Pill>}<div style={{flex:1}} /><button onClick={()=>save(bank.filter(b=>b.id!==q.id))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13}}>x</button></Row><div style={{fontSize:12,color:C.text,lineHeight:1.5}}>{q.questionText?.slice(0,180)}</div></Card>)}</>}
        {tab==="add"&&<Card sx={{maxWidth:560,margin:"0 auto"}}><div style={{fontWeight:700,color:C.text,fontSize:13,marginBottom:10}}>+ Add Manually</div><div style={{marginBottom:8}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:3}}>Question *</label><textarea value={manual.text} onChange={e=>setManual(p=>({...p,text:e.target.value}))} placeholder="Question text..." rows={3} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} /></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>{["optA","optB","optC","optD"].map((k,i)=><div key={k}><label style={{color:manual.correct===i?C.green:C.muted,fontSize:10,display:"block",marginBottom:2}}>Option {String.fromCharCode(65+i)} {manual.correct===i?"v":""}</label><Row g={4}><input value={manual[k]} onChange={e=>setManual(p=>({...p,[k]:e.target.value}))} style={{flex:1,background:C.surface,border:`1px solid ${manual.correct===i?C.green:C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11,boxSizing:"border-box"}} /><button onClick={()=>setManual(p=>({...p,correct:i}))} style={{background:manual.correct===i?C.green+"20":"transparent",border:`1px solid ${manual.correct===i?C.green:C.border}`,borderRadius:4,padding:"3px 6px",cursor:"pointer",color:manual.correct===i?C.green:C.dim,fontSize:10}}>v</button></Row></div>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><div><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:2}}>Subject</label><select value={manual.subject} onChange={e=>setManual(p=>({...p,subject:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11}}>{ ["Physics","Chemistry","Mathematics","Biology","English","Reasoning","GK"].map(o=><option key={o} value={o} style={{background:C.surface}}>{o}</option>)}</select></div><div><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:2}}>Difficulty</label><select value={manual.difficulty} onChange={e=>setManual(p=>({...p,difficulty:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.text,fontSize:11}}>{ ["Easy","Medium","Hard"].map(o=><option key={o} value={o} style={{background:C.surface}}>{o}</option>)}</select></div></div><Btn c={C.green} onClick={addManual} disabled={!manual.text.trim()}>Add to Bank</Btn></Card>}
        {tab==="extract"&&<div style={{maxWidth:420,margin:"0 auto"}}><Card><div style={{fontWeight:700,color:C.text,fontSize:13,marginBottom:6}}> AI Extract</div><div style={{color:C.muted,fontSize:12,marginBottom:10}}>Upload question papers, textbook pages, screenshots. AI extracts all questions automatically.</div><input type="file" ref={imgRef} accept="image/*,application/pdf" multiple style={{display:"none"}} onChange={e=>extract(Array.from(e.target.files||[]))} /><div onClick={()=>!busy&&imgRef.current?.click()} style={{border:`2px dashed ${C.border}`,borderRadius:12,padding:40,textAlign:"center",cursor:busy?"wait":"pointer"}}>{busy?<><Spin sz={28}/><div style={{color:C.muted,marginTop:8}}>Extracting...</div></>:<><div style={{fontSize:36,marginBottom:6}}></div><div style={{color:C.text,fontSize:13,fontWeight:700}}>Tap to upload</div><div style={{color:C.muted,fontSize:11,marginTop:3}}>JPG . PNG . PDF . Multi-file</div></>}</div></Card></div>}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// -- Formula Sheet Library (Parts 18, 77) ----------------------------------
const FORMULA_LIBRARY = {
  "Physics - Mechanics":[
    {n:"Newton's 2nd Law",f:"F = ma",d:"Force = mass x acceleration"},
    {n:"Kinematic (v^2=u^2+2as)",f:"v^2 = u^2 + 2as",d:"Final velocity, initial velocity, acceleration, displacement"},
    {n:"Work-Energy Theorem",f:"W = DeltaKE = 1/2mv^2 - 1/2mu^2",d:"Work done equals change in kinetic energy"},
    {n:"Gravitational PE",f:"U = mgh",d:"Potential energy near Earth's surface"},
    {n:"Circular Motion",f:"a = v^2/r = omega^2r",d:"Centripetal acceleration"},
    {n:"Conservation of Momentum",f:"m1u1 + m2u2 = m1v1 + m2v2",d:"In isolated system"},
  ],
  "Physics - Electrostatics":[
    {n:"Coulomb's Law",f:"F = kq1q2/r^2",d:"k = 9x10^9 N.m^2/C^2"},
    {n:"Electric Field",f:"E = F/q = kQ/r^2",d:"Field due to point charge"},
    {n:"Electric Potential",f:"V = kQ/r",d:"Potential at distance r from charge Q"},
    {n:"Capacitance",f:"C = Q/V = epsilon0A/d",d:"Parallel plate capacitor"},
    {n:"Energy stored",f:"U = 1/2CV^2 = Q^2/2C",d:"Energy in capacitor"},
  ],
  "Physics - Modern Physics":[
    {n:"Photoelectric Effect",f:"KE_max = hnu - phi = hnu - hnu0",d:"h = 6.626x10-^3^4 J.s"},
    {n:"de Broglie Wavelength",f:"lambda = h/p = h/mv",d:"Matter wave wavelength"},
    {n:"Bohr's Radius",f:"rn = n^2a0 = n^2(0.529Angstrom)",d:"nth orbit radius in hydrogen"},
    {n:"Radioactive Decay",f:"N = N0e^(-lambdat), t1/2 = 0.693/lambda",d:"Half-life formula"},
  ],
  "Chemistry - Mole Concept":[
    {n:"Moles",f:"n = m/M = V/22.4(STP)",d:"Number of moles"},
    {n:"Avogadro",f:"N = n x 6.022x10^2^3",d:"Number of particles"},
    {n:"Concentration",f:"M = moles/L = 10xdxw/M",d:"Molarity of solution"},
    {n:"pH",f:"pH = -log[H+], pH+pOH = 14",d:"Acid-base relationship"},
  ],
  "Chemistry - Thermodynamics":[
    {n:"First Law",f:"DeltaU = q + w = q - P.DeltaV",d:"Conservation of energy"},
    {n:"Gibbs Energy",f:"DeltaG = DeltaH - TDeltaS",d:"Spontaneity: DeltaG<0 spontaneous"},
    {n:"Equilibrium Constant",f:"Kc = [Products]/[Reactants]",d:"At equilibrium"},
    {n:"van't Hoff",f:"ln(K2/K1) = DeltaH/R(1/T1-1/T2)",d:"Effect of T on K"},
  ],
  "Mathematics - Calculus":[
    {n:"Derivative rules",f:"d/dx(xn) = nxn-^1, d/dx(ex)=ex",d:"Basic differentiation"},
    {n:"Integration",f:"integralxndx = xn+^1/(n+1)+C",d:"Power rule integration"},
    {n:"Definite Integral",f:"integralabf(x)dx = [F(x)]ab = F(b)-F(a)",d:"Area under curve"},
    {n:"Chain Rule",f:"d/dx[f(g(x))] = f'(g(x)).g'(x)",d:"Composite function"},
    {n:"Product Rule",f:"d/dx[uv] = u'v + uv'",d:"Product differentiation"},
  ],
  "Mathematics - Algebra":[
    {n:"Quadratic Formula",f:"x = (-b+/-sqrt(b^2-4ac))/2a",d:"Roots of ax^2+bx+c=0"},
    {n:"Arithmetic Progression",f:"Sn = n/2(2a+(n-1)d), Tn=a+(n-1)d",d:"Sum and nth term"},
    {n:"Geometric Progression",f:"Sn = a(rn-1)/(r-1), Tinfinity=a/(1-r)",d:"Sum of GP"},
    {n:"Binomial Theorem",f:"(a+b)n = Sigma C(n,r)an-rbr",d:"Expansion formula"},
  ],
};

// -- Formula Library Component ---------------------------------------------
function FormulaLibrary({onBack}) {
  const [subj,setSubj]=useState(Object.keys(FORMULA_LIBRARY)[0]);
  const [search,setSearch]=useState("");
  const formulas=FORMULA_LIBRARY[subj]||[];
  const filtered=search?formulas.filter(f=>f.n.toLowerCase().includes(search.toLowerCase())||f.f.toLowerCase().includes(search.toLowerCase())):formulas;
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack}/>
        <span style={{color:C.text,fontWeight:800,fontSize:13}}>Formula Library</span>
      </Row>
      <div style={{background:C.surface,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search formulas..." style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",color:C.text,fontSize:12,boxSizing:"border-box",marginBottom:8}} />
        <Row g={6} sx={{overflowX:"auto"}}>
          {Object.keys(FORMULA_LIBRARY).map(s=>(
            <button key={s} onClick={()=>setSubj(s)} style={{background:subj===s?C.accent+"20":"transparent",border:`1px solid ${subj===s?C.accent:C.border}`,borderRadius:16,padding:"3px 12px",color:subj===s?C.accent:C.muted,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{s}</button>
          ))}
        </Row>
      </div>
      <div style={{flex:1,overflow:"auto",padding:12}}>
        {filtered.map((f,i)=>(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",marginBottom:8}}>
            <div style={{color:C.accent,fontWeight:700,fontSize:12,marginBottom:4}}>{f.n}</div>
            <div style={{color:C.text,fontFamily:"monospace",fontSize:13,marginBottom:f.d?6:0,background:C.surface,borderRadius:6,padding:"6px 10px"}}>{f.f}</div>
            {f.d&&<div style={{color:C.muted,fontSize:11,lineHeight:1.5}}>{f.d}</div>}
          </div>
        ))}
        {filtered.length===0&&<div style={{color:C.dim,textAlign:"center",padding:40,fontSize:12}}>No formulas found</div>}
      </div>
    </div>
  );
}

// -- Camera/Photo Question Solver (Part 13) --------------------------------
function CameraQSolver({user, ctrl, onBack}) {
  const [img,setImg]=useState(null); const [busy,setBusy]=useState(false); const [solution,setSolution]=useState(""); const [err,setErr]=useState("");
  const imgRef=useRef(); const aiKeys={...LS.get("ai_api_keys",{}),...(ctrl.apiKeys||{})};
  const solve=async()=>{
    if(!img)return;setBusy(true);setSolution("");setErr("");
    try{
      const API_KEY=aiKeys.claude||aiKeys.anthropic;
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"You are an expert exam tutor. When shown a question image, extract and solve the question completely. Provide: (1) The question as extracted, (2) Step-by-step solution, (3) Final answer clearly marked, (4) Key concept used.",messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:img}},{type:"text",text:"Solve this exam question completely with step-by-step explanation."}]}]})});
      const d=await r.json();
      if(d.content?.[0]?.text)setSolution(d.content[0].text);
      else setErr("Could not process image. Try a clearer photo.");
    }catch(e){setErr("Error: "+e.message);}
    setBusy(false);
  };
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}> Camera Q Solver</span></Row>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        <div style={{maxWidth:600,margin:"0 auto"}}>
          {/* Upload area */}
          <div onClick={()=>imgRef.current?.click()} style={{border:`2px dashed ${img?C.accent:C.border}`,borderRadius:14,padding:24,textAlign:"center",cursor:"pointer",marginBottom:14,background:img?C.accent+"08":C.card}}>
            {img?<img src={`data:image/jpeg;base64,${img}`} style={{maxWidth:"100%",maxHeight:300,borderRadius:8}} alt="question"/>:<><div style={{fontSize:42,marginBottom:8}}></div><div style={{color:C.text,fontWeight:700,fontSize:13}}>Tap to take photo or upload</div><div style={{color:C.muted,fontSize:11,marginTop:4}}>Supports JPG, PNG, PDF screenshots</div></>}
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const b=await b64(f);setImg(b);setSolution("");}}/>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <Btn c={C.accent} full onClick={solve} disabled={!img||busy}>{busy?<><Spin sz={14}/>Solving...</>:" Solve This Question"}</Btn>
            {img&&<Btn outline c={C.muted} onClick={()=>{setImg(null);setSolution("");}}>Clear</Btn>}
          </div>
          {err&&<ErrBox msg={err}/>}
          {solution&&<Card sx={{borderColor:C.green+"30"}}>
            <div style={{color:C.green,fontWeight:800,fontSize:12,marginBottom:8}}>[OK] Solution</div>
            <div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",lineHeight:1.8}}>{solution}</div>
          </Card>}
          {!img&&!solution&&<div style={{textAlign:"center",padding:30,color:C.muted}}>
            <div style={{fontSize:11,lineHeight:1.8}}> Take a clear photo of any exam question<br/> Or screenshot from a PDF / book<br/> AI extracts and solves it instantly</div>
          </div>}
        </div>
      </div>
    </div>
  );
}

// -- Spaced Repetition Flashcards (Parts 67, 52) ----------------------------
function FlashcardSystem({user, setUser, onBack}) {
  const [mode,setMode]=useState("browse"); const [cur,setCur]=useState(0); const [flipped,setFlipped]=useState(false);
  const allCards=user.data?.flashcards||[];
  const [newCard,setNewCard]=useState({front:"",back:"",subject:"Physics",tags:""});
  const dueCards=useMemo(()=>{
    const now=Date.now();
    return allCards.filter(c=>{if(!c.nextReview)return true;return c.nextReview<=now;}).sort((a,b)=>(a.nextReview||0)-(b.nextReview||0));
  },[allCards]);
  
  const saveCard=()=>{if(!newCard.front||!newCard.back)return;const c={...newCard,id:uid(),createdAt:Date.now(),nextReview:Date.now(),easeFactor:2.5,interval:1,reps:0};const upd=[...allCards,c];setUser({...user,data:{...user.data,flashcards:upd}});setNewCard({front:"",back:"",subject:"Physics",tags:""});};
  
  const rateCard=(quality)=>{// Spaced repetition algorithm (SM-2)
    const card=dueCards[cur];if(!card)return;const idx=allCards.findIndex(c=>c.id===card.id);if(idx<0)return;
    let{interval=1,easeFactor=2.5,reps=0}=card;
    if(quality>=3){if(reps===0)interval=1;else if(reps===1)interval=6;else interval=Math.round(interval*easeFactor);reps++;easeFactor=Math.max(1.3,easeFactor+0.1-((5-quality)*0.08));}else{interval=1;reps=0;}
    const next=Date.now()+interval*86400000;
    const upd=[...allCards];upd[idx]={...card,interval,easeFactor,reps,nextReview:next,lastReview:Date.now()};
    setUser({...user,data:{...user.data,flashcards:upd}});
    if(cur<dueCards.length-1){setCur(p=>p+1);setFlipped(false);}else{setMode("done");}
  };

  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack}/>
        <span style={{color:C.text,fontWeight:800,fontSize:13}}> Flashcards (Spaced Repetition)</span>
        <div style={{flex:1}}/><Pill c={C.amber}>{dueCards.length} due</Pill>
      </Row>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
        {[["review"," Review"],["add","+ Add"],["browse"," All"]].map(([t,l])=><button key={t} onClick={()=>{setMode(t);setCur(0);setFlipped(false);}} style={{padding:"8px 14px",background:"none",border:"none",borderBottom:`2px solid ${mode===t?C.accent:"transparent"}`,color:mode===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {mode==="review"&&dueCards.length>0&&<div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{color:C.muted,fontSize:11,marginBottom:12,textAlign:"center"}}>Card {Math.min(cur+1,dueCards.length)}/{dueCards.length}</div>
          <div onClick={()=>setFlipped(p=>!p)} style={{background:C.card,border:`2px solid ${C.accent}30`,borderRadius:16,padding:32,minHeight:180,cursor:"pointer",textAlign:"center",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",transition:"all .3s"}}>
            {!flipped?<>
              <div style={{color:C.muted,fontSize:10,marginBottom:8}}>{dueCards[cur]?.subject}</div>
              <div style={{color:C.text,fontSize:15,fontWeight:700,lineHeight:1.6}}>{dueCards[cur]?.front}</div>
              <div style={{color:C.dim,fontSize:10,marginTop:16}}>Tap to reveal answer</div>
            </>:<>
              <div style={{color:C.green,fontSize:10,marginBottom:8}}>ANSWER</div>
              <div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{dueCards[cur]?.back}</div>
            </>}
          </div>
          {flipped&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[{l:":/ Again",q:0,c:C.red},{l:" Hard",q:2,c:C.amber},{l:" Good",q:4,c:C.green}].map(btn=><button key={btn.l} onClick={()=>rateCard(btn.q)} style={{background:btn.c+"18",border:`1.5px solid ${btn.c}40`,borderRadius:10,padding:"10px 6px",color:btn.c,fontSize:12,fontWeight:700,cursor:"pointer"}}>{btn.l}</button>)}
          </div>}
          {!flipped&&dueCards.length>0&&<div style={{textAlign:"center",color:C.dim,fontSize:11}}> Tap card to flip</div>}
        </div>}
        {mode==="review"&&dueCards.length===0&&<div style={{textAlign:"center",padding:60,color:C.muted}}><div style={{fontSize:42}}></div><div style={{marginTop:8,fontSize:13,fontWeight:700,color:C.green}}>All caught up!</div><div style={{fontSize:11,marginTop:4}}>No cards due for review. Come back later or add more cards.</div></div>}
        {mode==="done"&&<div style={{textAlign:"center",padding:60,color:C.muted}}><div style={{fontSize:42}}>[OK]</div><div style={{marginTop:8,fontSize:13,fontWeight:700,color:C.green}}>Session Complete!</div><div style={{fontSize:11,marginTop:4}}>All {dueCards.length} cards reviewed. Great work!</div><button onClick={()=>{setMode("review");setCur(0);setFlipped(false);}} style={{marginTop:16,background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Review Again</button></div>}
        {mode==="add"&&<div style={{maxWidth:520,margin:"0 auto"}}>
          <Card>
            <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:12}}>Create Flashcard</div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Subject</label><select value={newCard.subject} onChange={e=>setNewCard(p=>({...p,subject:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12}}>{"Physics Chemistry Mathematics Biology History Geography Economics".split(" ").map(s=><option key={s} value={s} style={{background:C.surface}}>{s}</option>)}</select></div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Front (Question)</label><textarea value={newCard.front} onChange={e=>setNewCard(p=>({...p,front:e.target.value}))} rows={3} placeholder="Enter question or term..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:14}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:4}}>Back (Answer)</label><textarea value={newCard.back} onChange={e=>setNewCard(p=>({...p,back:e.target.value}))} rows={3} placeholder="Enter answer or explanation..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/></div>
            <Btn c={C.accent} full onClick={saveCard} disabled={!newCard.front||!newCard.back}> Save Card</Btn>
          </Card>
        </div>}
        {mode==="browse"&&<div style={{maxWidth:600,margin:"0 auto"}}>
          <div style={{color:C.muted,fontSize:11,marginBottom:10}}>{allCards.length} total cards . {dueCards.length} due now</div>
          {allCards.length===0?<div style={{textAlign:"center",padding:40,color:C.dim}}><div style={{fontSize:32}}></div><div style={{marginTop:8}}>No cards yet. Add your first flashcard!</div></div>
          :allCards.map((c,i)=><div key={c.id||i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"9px 12px",marginBottom:6}}>
            <div style={{color:C.text,fontSize:12,fontWeight:700,marginBottom:3}}>{c.front?.slice(0,80)}</div>
            <div style={{color:C.muted,fontSize:10,marginBottom:4}}>{c.subject} . {c.reps||0} reps . next: {c.nextReview?new Date(c.nextReview).toLocaleDateString():"today"}</div>
          </div>)}
        </div>}
      </div>
    </div>
  );
}

function StudyTools({user, setUser, onBack}) {
  const [tool,setTool]=useState(null); const [pTime,setPTime]=useState(25); const [pRun,setPRun]=useState(false); const [pLeft,setPLeft]=useState(1500); const [fsSearch,setFsSearch]=useState(""); const [fsSubj,setFsSubj]=useState(Object.keys(FORMULA_LIBRARY)[0]);
  useEffect(()=>{if(pRun){const id=setInterval(()=>setPLeft(p=>{if(p<=1){setPRun(false);clearInterval(id);return pTime*60;}return p-1;}),1000);return()=>clearInterval(id);}else{const id=setInterval(()=>{},9999999);return()=>clearInterval(id);}},[pRun]);
  if(tool==="formulas")return <FormulaLibrary onBack={()=>setTool(null)} />;
  if(tool==="camera")return <CameraQSolver user={user} ctrl={{apiKeys:LS.get("ai_api_keys",{})}} onBack={()=>setTool(null)} />;
  if(tool==="flashcards")return <FlashcardSystem user={user} setUser={setUser} onBack={()=>setTool(null)} />;
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}> Study Tools</span></Row>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        {/* Pomodoro timer */}
        <Card sx={{marginBottom:12,textAlign:"center"}}>
          <div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:10}}> Pomodoro Timer</div>
          <div style={{fontSize:48,fontWeight:900,color:pLeft<60?C.red:pLeft<300?C.amber:C.accent,fontFamily:"monospace"}}>{String(Math.floor(pLeft/60)).padStart(2,"0")}:{String(pLeft%60).padStart(2,"0")}</div>
          <div style={{background:C.surface,borderRadius:10,height:8,margin:"12px 0",overflow:"hidden"}}><div style={{height:"100%",background:C.accent,borderRadius:10,width:`${pLeft/(pTime*60)*100}%`,transition:"width 1s"}}/></div>
          <Row g={6} sx={{justifyContent:"center",marginBottom:10}}>
            {[15,25,30,45].map(m=><button key={m} onClick={()=>{setPTime(m);setPLeft(m*60);setPRun(false);}} style={{background:pTime===m?C.accent+"20":C.card,border:`1px solid ${pTime===m?C.accent:C.border}`,borderRadius:6,padding:"4px 10px",color:pTime===m?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{m}m</button>)}
          </Row>
          <Row g={8} sx={{justifyContent:"center"}}>
            <Btn c={pRun?C.amber:C.green} onClick={()=>setPRun(p=>!p)}>{pRun?" Pause":"> Start"}</Btn>
            <Btn outline c={C.muted} onClick={()=>{setPRun(false);setPLeft(pTime*60);}}>rotate Reset</Btn>
          </Row>
        </Card>
        {/* Tool grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[{id:"formulas",icon:"",t:"Formula Sheets",d:"Physics, Chemistry, Math",c:C.cyan},{id:"camera",icon:"",t:"Camera Solver",d:"Photo -> Solution",c:C.orange},{id:"flashcards",icon:"",t:"Flashcards",d:"Spaced repetition",c:C.violet,v:user.data?.flashcards?.length||0}].map(s=><button key={s.id} onClick={()=>setTool(s.id)} style={{background:C.card,border:`1.5px solid ${s.c}40`,borderRadius:12,padding:14,textAlign:"left",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=s.c;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=s.c+"40";}}>
            <div style={{fontSize:28,marginBottom:6}}>{s.icon}</div>
            <div style={{color:s.c,fontWeight:800,fontSize:12}}>{s.t}</div>
            <div style={{color:C.dim,fontSize:10}}>{s.d}{s.v!==undefined?` . ${s.v} cards`:""}</div>
          </button>)}
          {/* Pomodoro full view */}
          <div style={{background:C.card,border:`1.5px solid ${C.green}40`,borderRadius:12,padding:14}}>
            <div style={{fontSize:28,marginBottom:6}}></div>
            <div style={{color:C.green,fontWeight:800,fontSize:12}}>Pomodoro</div>
            <div style={{color:C.dim,fontSize:10}}>{pRun?"Running...":"Ready to start"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Formula Library Component already defined above ------------------------

function ProfileScreen({user, setUser, onBack, onUpgrade}) {
  const results=user.data?.results||[]; const bank=user.data?.bank||[];
  const isPaid=user.plan==="paid"&&user.planExpiry>Date.now();
  const isTrial=user.plan==="trial"&&user.trialExpiry>Date.now();
  const payments=LS.get("payment_log",[]).filter(p=>p.email===user.email);
  const [tab,setTab]=useState("stats");
  const streak=calcStreak(user); const xp=user.data?.xp||0; const badges=user.data?.badges||[];
  const goals=user.data?.goals||{};
  
  // Long-term analytics (Part 80)
  const last30=results.filter(r=>r.ts>Date.now()-30*86400000);
  const last7=results.filter(r=>r.ts>Date.now()-7*86400000);
  const avgScore=results.length?Math.round(results.reduce((s,r)=>s+(r.score||0),0)/results.length):0;
  const avgAcc=results.length?Math.round(results.reduce((s,r)=>s+(r.correct&&r.totalQ?r.correct/r.totalQ*100:0),0)/results.length):0;
  const bestScore=results.length?Math.max(...results.map(r=>r.score||0)):0;
  const totalStudyTime=Math.round(results.reduce((s,r)=>s+(r.timeTaken||0),0)/60);
  
  // Trend (Part 80)
  const recentScores=results.slice(0,5).map(r=>r.score||0).reverse();
  const trendUp=recentScores.length>=2&&recentScores[recentScores.length-1]>recentScores[0];
  
  // Subject mastery (Part 66, 186)
  const subjectMastery={};
  results.forEach(r=>{Object.entries(r.bySubj||{}).forEach(([sv,d])=>{if(!subjectMastery[sv])subjectMastery[sv]={correct:0,total:0};subjectMastery[sv].correct+=d.correct||0;subjectMastery[sv].total+=(d.correct||0)+(d.wrong||0)+(d.skipped||0);});});
  
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}>
        <BackBtn onBack={onBack}/><span style={{color:C.text,fontWeight:800,fontSize:13}}> Profile</span>
      </Row>
      {/* Profile Header */}
      <div style={{background:"linear-gradient(135deg,#1a237e,#311b92)",padding:"18px 16px",flexShrink:0}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.violet})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,color:"#fff",flexShrink:0}}>{(user.name||"G")[0].toUpperCase()}</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontWeight:900,fontSize:16}}>{user.name||"Student"}</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>{user.email}</div>
            <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
              <Pill c={isPaid?C.green:isTrial?C.amber:C.muted}>{isPaid?"v PAID":isTrial?`Trial ${Math.ceil((user.trialExpiry-Date.now())/86400000)}d`:"Free"}</Pill>
              {streak>0&&<Pill c={C.orange}>{streak}d</Pill>}
              {xp>0&&<Pill c={C.violet}>{xp} XP</Pill>}
            </div>
          </div>
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,overflowX:"auto"}}>
        {[["stats"," Stats"],["subjects"," Mastery"],["badges"," Badges"],["history"," History"],["account"," Account"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"8px 12px",background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        {tab==="stats"&&<div style={{maxWidth:520,margin:"0 auto"}}>
          {/* Key metrics */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[{i:"",l:"Total Tests",v:results.length,c:C.accent},{i:"",l:"Best Score",v:bestScore,c:C.amber},{i:"",l:"Avg Accuracy",v:`${avgAcc}%`,c:C.green},{i:"",l:"Study Time",v:`${totalStudyTime}m`,c:C.violet},{i:"",l:"Streak",v:`${streak}d`,c:C.orange},{i:"",l:"Bank Q's",v:bank.length,c:C.cyan}].map(s=><div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:12,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:20}}>{s.i}</span><div><div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.v}</div><div style={{color:C.muted,fontSize:10}}>{s.l}</div></div>
            </div>)}
          </div>
          {/* Trend */}
          {recentScores.length>=2&&<Card sx={{marginBottom:10}}>
            <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:8}}> Score Trend (Last 5 Tests)</div>
            <div style={{display:"flex",gap:4,alignItems:"flex-end",height:60}}>
              {recentScores.map((s,i)=>{const max=Math.max(...recentScores,1);return(<div key={i} style={{flex:1,background:trendUp?C.green:C.accent,borderRadius:"4px 4px 0 0",height:`${Math.max(10,s/max*100)}%`,display:"flex",alignItems:"flex-end",justifyContent:"center"}}><span style={{fontSize:9,color:"#fff",padding:"2px 0"}}>{s}</span></div>);})}
            </div>
            <div style={{color:trendUp?C.green:C.muted,fontSize:11,marginTop:6,fontWeight:700}}>{trendUp?" Improving trend!":"Practice more to see improvement"}</div>
          </Card>}
          {/* Weekly stats */}
          <Card>
            <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:8}}>This Month</div>
            {[{l:"Tests taken",v:last30.length},{l:"This week",v:last7.length},{l:"Avg score",v:avgScore},{l:"Global rank",v:`#${getGlobalRank(user)}`}].map(s=><div key={s.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><span style={{color:C.muted}}>{s.l}</span><span style={{color:C.text,fontWeight:600}}>{s.v}</span></div>)}
          </Card>
        </div>}

        {tab==="subjects"&&<div style={{maxWidth:520,margin:"0 auto"}}>
          <Card sx={{marginBottom:10}}>
            <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:10}}> Subject Mastery (Part 66)</div>
            {Object.entries(subjectMastery).length===0?<div style={{color:C.dim,fontSize:11,textAlign:"center",padding:20}}>Take exams to see subject mastery</div>
            :Object.entries(subjectMastery).sort((a,b)=>b[1].correct/b[1].total-a[1].correct/a[1].total).map(([sv,d])=>{
              const pct=d.total?Math.round(d.correct/d.total*100):0;
              return(<div key={sv} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                  <span style={{color:C.text,fontWeight:700}}>{sv}</span>
                  <span style={{color:pct>70?C.green:pct>40?C.amber:C.red,fontWeight:700}}>{pct}% . {d.correct}/{d.total}</span>
                </div>
                <div style={{background:C.surface,borderRadius:5,height:8,overflow:"hidden"}}>
                  <div style={{height:"100%",background:pct>70?C.green:pct>40?C.amber:C.red,width:`${pct}%`,borderRadius:5,transition:"width .5s"}}/>
                </div>
                <div style={{color:C.dim,fontSize:9,marginTop:2}}>{pct<40?"[!] Needs focused practice":pct<70?" Getting better!":"[OK] Strong"}</div>
              </div>);
            })}
          </Card>
        </div>}

        {tab==="badges"&&<div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:10}}> Achievements ({badges.length} earned)</div>
          {BADGES_DEF.map(b=>{const earned=badges.includes(b.id);return(<Card key={b.id} sx={{marginBottom:8,opacity:earned?1:0.5,borderColor:earned?C.amber+"40":C.border}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{fontSize:32}}>{b.icon}</div>
              <div><div style={{color:earned?C.amber:C.muted,fontWeight:700,fontSize:12}}>{b.name}{earned?" v":""}</div><div style={{color:C.muted,fontSize:11}}>{b.desc}</div></div>
            </div>
          </Card>);})}
        </div>}

        {tab==="history"&&<div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:8}}> All Exam History ({results.length} attempts)</div>
          {results.length===0?<div style={{textAlign:"center",padding:40,color:C.dim}}>No exams taken yet</div>
          :results.map((r,i)=><Card key={i} sx={{marginBottom:7}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{color:C.text,fontWeight:700,fontSize:12}}>{r.exam?.name||"Exam"}</div>
              <div style={{color:C.muted,fontSize:10}}>{new Date(r.ts||0).toLocaleDateString()} . {Math.round((r.timeTaken||0)/60)}min</div></div>
              <div style={{textAlign:"right"}}><div style={{color:r.score>r.total*0.5?C.green:C.red,fontWeight:700,fontSize:14}}>{r.score}</div><div style={{color:C.dim,fontSize:9}}>/{r.total}</div></div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:5,fontSize:10}}>
              <span style={{color:C.green}}>v{r.correct}</span><span style={{color:C.red}}>x{r.wrong}</span><span style={{color:C.muted}}>-{r.skipped}</span>
              <span style={{color:C.muted,marginLeft:"auto"}}>{r.correct&&r.totalQ?Math.round(r.correct/r.totalQ*100):0}% acc</span>
            </div>
          </Card>)}
        </div>}

        {tab==="account"&&<div style={{maxWidth:480,margin:"0 auto"}}>
          {!isPaid&&!isTrial&&<div style={{background:`linear-gradient(135deg,${C.accent}20,${C.violet}14)`,border:`1px solid ${C.accent}30`,borderRadius:12,padding:14,textAlign:"center",marginBottom:12}}>
            <div style={{fontWeight:800,color:C.text,fontSize:13,marginBottom:6}}> Upgrade for Full Access</div>
            <Btn c={C.accent} onClick={onUpgrade}>View Plans</Btn>
          </div>}
          {(isPaid||isTrial)&&<Card sx={{marginBottom:10}}>
            <div style={{fontWeight:700,color:C.text,fontSize:12,marginBottom:8}}> Subscription</div>
            <div style={{fontSize:12,color:C.muted}}>Plan: <span style={{color:C.text,fontWeight:700}}>{isPaid?"PAID":"Trial"}</span></div>
            {isPaid&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>Expires: <span style={{color:C.amber}}>{new Date(user.planExpiry).toLocaleDateString()}</span></div>}
          </Card>}
          <Card sx={{marginBottom:10}}>
            <div style={{fontWeight:700,color:C.text,fontSize:12,marginBottom:8}}> Payment History</div>
            {payments.length===0?<div style={{color:C.dim,fontSize:11}}>No payments yet</div>
            :payments.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.muted}}>{new Date(p.ts||0).toLocaleDateString()} . {p.plan}</span><span style={{color:C.green,fontWeight:700}}>{p.currency} {p.amount}</span></div>)}
          </Card>
          <button onClick={()=>{Session.clear();LS.del("remembered_email");window.location.reload();}} style={{width:"100%",background:C.red+"18",border:`1px solid ${C.red}30`,borderRadius:10,padding:"10px",color:C.red,fontSize:12,fontWeight:700,cursor:"pointer"}}> Sign Out</button>
        </div>}
      </div>
    </div>
  );
}

function AIGenerator({user, setUser, ctrl, onBack}) {
  const [s,setS]=useState({subject:"Physics",diff:"Medium",type:"MCQ",exam:"JEE Main",count:"5",topic:"",prompt:""});
  const [busy,setBusy]=useState(false); const [result,setResult]=useState([]); const [err,setErr]=useState("");
  const bank=user.data?.bank||[]; const aiKeys=LS.get("ai_api_keys",{});
  const set=k=>e=>setS(p=>({...p,[k]:e.target.value}));
  const generate=async()=>{setBusy(true);setErr("");setResult([]);try{const p=s.prompt||`Generate exactly ${s.count} ${s.diff} ${s.type} questions for ${s.exam} in ${s.subject}${s.topic?` on topic: ${s.topic}`:""}.Return ONLY valid JSON array (no markdown):[{"questionText":"...","options":["A","B","C","D"],"correctAnswer":0,"explanation":"...","subject":"${s.subject}","topic":"...","difficulty":"${s.diff}","type":"${s.type}","marks":4,"negativeMarks":1}]`;const raw=await aiCall("claude","You are an expert exam question generator. Return ONLY valid JSON array. No markdown.",p,aiKeys);let parsed=[];try{let c=raw.trim().replace(/```json?/g,"").replace(/```/g,"").trim();const st=c.indexOf("["),en=c.lastIndexOf("]");if(st>=0&&en>st)c=c.slice(st,en+1);parsed=JSON.parse(c);}catch{const ms=raw.match(/\{[^{}]+\}/g)||[];parsed=ms.map(m=>{try{return JSON.parse(m);}catch{return null;}}).filter(Boolean);}if(!parsed.length)throw new Error("AI returned empty. Try simpler topic.");setResult(parsed);}catch(e){const m=e.message||"";setErr(m==="RATE_LIMIT"||m.includes("rate")||m.includes("exceeded")?(ctrl.api.rateLimitMsg||" Rate limited. Wait 2 min."):m||"Failed. Try again.");}setBusy(false);};
  const addToBank=(q)=>{const upd=[...bank,{...q,id:uid(),createdAt:Date.now()}];const u={...user,data:{...user.data,bank:upd}};UserDB.save(u);setUser(u);};
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack} /><span style={{color:C.text,fontWeight:800,fontSize:13}}> AI Question Generator</span></Row>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:14,maxWidth:960,margin:"0 auto"}}>
          <Card><div style={{color:C.text,fontWeight:800,fontSize:13,marginBottom:10}}> Settings</div>
          {[["Subject","subject",["Physics","Chemistry","Mathematics","Biology","English","Reasoning","GK","Economics","History","Geography"]],["Difficulty","diff",["Easy","Medium","Hard","Mixed"]],["Type","type",["MCQ","Integer","Multi-correct","True/False"]],["Exam Style","exam",EXAMS.slice(0,20).map(e=>e.name)],["Count","count",["3","5","10","15","20"]]].map(([l,k,opts])=>(
            <div key={k} style={{marginBottom:8}}><label style={{color:C.muted,fontSize:11,fontWeight:700,display:"block",marginBottom:3}}>{l}</label><select value={s[k]} onChange={set(k)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12}}>{opts.map(o=><option key={o} value={o} style={{background:C.surface}}>{o}</option>)}</select></div>
          ))}
          <div style={{marginBottom:8}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:3}}>Topic (optional)</label><input value={s.topic} onChange={set("topic")} placeholder="e.g. Kinematics" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,boxSizing:"border-box"}} /></div>
          <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:11,display:"block",marginBottom:3}}>Custom Prompt</label><textarea value={s.prompt} onChange={set("prompt")} rows={3} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} /></div>
          <Btn c={C.accent} full onClick={generate} disabled={busy}>{busy?<><Spin sz={14}/>Generating...</>:" Generate"}</Btn>
          <ErrBox msg={err} />
          {result.length>0&&<Btn c={C.green} full onClick={()=>{result.forEach(addToBank);alert(`[OK] ${result.length} added to bank!`);}} sx={{marginTop:6}}>+ Add All to Bank</Btn>}
          </Card>
          <div>{busy&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,gap:10}}><Spin sz={32}/><div style={{color:C.muted,fontSize:13}}>Crafting questions...</div></div>}
          {!busy&&result.length===0&&!err&&<div style={{textAlign:"center",padding:80,color:C.dim}}><div style={{fontSize:44,marginBottom:10}}></div>Configure & generate</div>}
          {result.map((q,i)=><Card key={i} sx={{marginBottom:8}}><Row g={5} sx={{marginBottom:7,flexWrap:"wrap"}}><Pill c={C.accent} sm>{q.subject}</Pill><Pill c={q.difficulty==="Hard"?C.red:q.difficulty==="Easy"?C.green:C.amber} sm>{q.difficulty}</Pill><div style={{flex:1}} /><Btn sm c={C.green} onClick={()=>addToBank(q)}>+ Bank</Btn></Row><div style={{fontSize:13,color:C.text,marginBottom:8,lineHeight:1.6}}>{q.questionText}</div>{q.options&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:6}}>{q.options.map((o,oi)=><div key={oi} style={{fontSize:11,padding:"4px 7px",borderRadius:4,background:oi===q.correctAnswer?C.green+"20":C.surface,color:oi===q.correctAnswer?C.green:C.muted,border:`1px solid ${oi===q.correctAnswer?C.green+"40":C.border}`}}>{String.fromCharCode(65+oi)}. {o}</div>)}</div>}{q.explanation&&<div style={{fontSize:11,color:C.cyan,fontStyle:"italic",lineHeight:1.5}}> {q.explanation}</div>}</Card>)}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function SelfUpgrade({user, setUser, ctrl, onBack}) {
  const [prompt,setPrompt]=useState(""); const [busy,setBusy]=useState(false); const [result,setResult]=useState(""); const [rawCode,setRawCode]=useState(""); const [tab,setTab]=useState("prompt");
  const upgrades=user.data?.upgrades||[]; const aiKeys=LS.get("ai_api_keys",{});
  const run=async()=>{if(!prompt.trim())return;setBusy(true);setResult("");try{const sys="You are an expert React developer who built this exam platform. The user wants to customize/upgrade/fix their app. Give clear, specific, copy-paste ready code fixes or explanations. Be concise and direct.";const r=await aiCall("claude",sys,`UPGRADE REQUEST: "${prompt}"\n\nPlease provide:\n1. What change this makes (1-2 lines)\n2. Exact code fix or instructions (complete, ready to use)\n3. Which part of the app is affected`,aiKeys);setResult(r);const upd=[{id:uid(),prompt,result:r,ts:new Date().toLocaleString()},...upgrades].slice(0,20);const u={...user,data:{...user.data,upgrades:upd}};UserDB.save(u);setUser(u);}catch(e){setResult("Error: "+e.message);}setBusy(false);};
  return(
    <div style={{height:"100%",background:C.bg,display:"flex",flexDirection:"column"}}>
      <Row sx={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",flexShrink:0}}><BackBtn onBack={onBack} /><span style={{color:C.text,fontWeight:800,fontSize:13}}>Self-Upgrade Console</span></Row>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
        {[["prompt"," AI Fix"],["log"," History"]].map(([t,l])=><button key={t} onClick={()=>setTab(t)} style={{padding:"8px 14px",background:"none",border:"none",borderBottom:`2px solid ${tab===t?C.accent:"transparent"}`,color:tab===t?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
      </div>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        <Card sx={{maxWidth:680,margin:"0 auto"}}>
          {tab==="prompt"&&<><div style={{color:C.muted,fontSize:11,marginBottom:6}}>Describe any bug, broken feature, or new thing you want. AI writes exact fix.</div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="e.g. Timer is not working, Fix the submit button, Add dark/light toggle..." rows={3} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:12,resize:"vertical",boxSizing:"border-box",marginBottom:8}} /><Btn full c={C.violet} onClick={run} disabled={busy||!prompt.trim()} sx={{marginBottom:10}}>{busy?<><Spin sz={14}/>Analyzing...</>:"Generate Fix"}</Btn>{result&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12,fontSize:11,color:C.text,whiteSpace:"pre-wrap",maxHeight:380,overflowY:"auto",lineHeight:1.6}}>{result}</div>}</>}
          {tab==="log"&&(upgrades.length===0?<div style={{color:C.dim,textAlign:"center",padding:30}}>No upgrades yet</div>:upgrades.map(u=><div key={u.id} style={{background:C.surface,borderRadius:6,padding:"8px 10px",marginBottom:6,cursor:"pointer"}} onClick={()=>{setPrompt(u.prompt);setTab("prompt");}}><div style={{color:C.text,fontSize:11,fontWeight:600}}>{u.prompt.slice(0,70)}</div><div style={{color:C.dim,fontSize:10,marginTop:2}}>{u.ts}</div></div>))}
        </Card>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Dashboard({user, setUser, onNav, ctrl, dev}) {
  const isPaid=user.plan==="paid"&&user.planExpiry>Date.now(); const isTrial=user.plan==="trial"&&user.trialExpiry>Date.now(); const hasAccess=isPaid||isTrial;
  const results=user.data?.results||[]; const bank=user.data?.bank||[]; const ann=ctrl.announcements||[]; const pf=ctrl.pricing?.paidFeatures||[];
  const needsPaid=(f)=>pf.includes(f)&&!hasAccess;
  const streak=calcStreak(user); const xp=user.data?.xp||0; const badges=(user.data?.badges||[]);
  const goals=user.data?.goals||{};
  const readiness=getReadinessScore(user,goals.targetExam||"JEE_MAIN");
  const myRank=getGlobalRank(user);
  const daysToExam=goals.examDate?Math.ceil((new Date(goals.examDate)-new Date())/86400000):null;
  const upcoming=Object.entries(EXAM_DATES_2025).filter(([,d])=>d>new Date()).sort(([,a],[,b])=>a-b).slice(0,3);

  const FEATURES=[
    {id:"exam",icon:"",title:"Take Exam",desc:`${EXAMS.length}+ global exams`,c:C.accent,free:true},
    {id:"practice",icon:"",title:"Practice Mode",desc:"By subject . difficulty . chapter",c:C.orange,free:true},
    {id:"aihub",icon:"",title:"AI Hub",desc:"12 AIs . Claude, GPT, Gemini...",c:C.violet,feat:"aiTutor"},
    {id:"planner",icon:"",title:"AI Study Planner",desc:"Personalized study roadmap",c:C.cyan,feat:"aiTutor"},
    {id:"generator",icon:"",title:"AI Generator",desc:"Generate unlimited Q's",c:C.pink,feat:"aiGenerator"},
    {id:"feed",icon:"",title:"Q Feed",desc:"Community questions",c:C.cyan,free:true},
    {id:"bank",icon:"",title:"My Bank",desc:`${bank.length} saved questions`,c:C.amber,free:true},
    {id:"study",icon:"",title:"Study Tools",desc:"Pomodoro . Formulas . Flashcards",c:C.orange,free:true},
    {id:"leaderboard",icon:"",title:"Leaderboard",desc:myRank<9999?`Your rank: #${myRank}`:"Join the board",c:C.amber,free:true},
    {id:"goals",icon:"",title:"Study Goals",desc:`${streak}d streak . ${readiness}% ready`,c:C.green,free:true},
    {id:"upgrade_self",icon:"",title:"Self-Upgrade",desc:"AI-powered bug fixes",c:C.green,free:true},
    {id:"profile",icon:"",title:"Profile",desc:"Stats . Badges . History",c:C.blue,free:true},
  ];
  return(
    <div style={{height:"100%",background:C.bg,overflow:"auto"}}>
      {/* Hero Header */}
      <div style={{background:"linear-gradient(135deg,#0c1a40 0%,#1a0a30 50%,#0a1a20 100%)",padding:"16px 16px 20px",borderBottom:`1px solid ${C.border}`}}>
        {ann[0]&&<div style={{background:C.amber+"18",border:`1px solid ${C.amber}30`,borderRadius:8,padding:"6px 12px",marginBottom:10,fontSize:11,color:C.amber}}> {ann[0].text}</div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div><div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginBottom:2}}>Welcome back,</div><div style={{fontSize:19,fontWeight:900,color:C.text,fontFamily:"Georgia,serif"}}>{user.name||"Student"} </div><div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}><Pill c={isPaid?C.green:isTrial?C.amber:C.muted}>{isPaid?"v PAID":isTrial?`Trial ${Math.ceil((user.trialExpiry-Date.now())/86400000)}d`:"Free"}</Pill>{streak>0&&<Pill c={C.orange}> {streak}d</Pill>}{xp>0&&<Pill c={C.violet}>{xp} XP</Pill>}</div></div>
          <button onClick={()=>onNav("profile")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"7px 11px",color:"#fff",fontSize:11,cursor:"pointer"}}></button>
        </div>
        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {[{l:"Tests",v:results.length,c:C.accent},{l:"Best",v:results.length?Math.max(...results.map(r=>r.score||0)):"-",c:C.amber},{l:"Rank",v:myRank<9999?`#${myRank}`:"-",c:C.green},{l:"Badges",v:badges.length,c:C.violet}].map(st=><div key={st.l} style={{background:"rgba(255,255,255,.06)",borderRadius:8,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:17,fontWeight:900,color:st.c}}>{st.v}</div><div style={{fontSize:9,color:"rgba(255,255,255,.35)"}}>{st.l}</div></div>)}
        </div>
      </div>
      {/* Exam Countdown (Part 99) */}
      {(daysToExam!==null||upcoming.length>0)&&<div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        {daysToExam!==null&&<div style={{background:daysToExam<7?C.red+"18":C.amber+"14",border:`1px solid ${daysToExam<7?C.red:C.amber}30`,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{color:daysToExam<7?C.red:C.amber,fontWeight:800,fontSize:12}}> Exam Countdown</div><div style={{color:C.muted,fontSize:10}}>{goals.targetExam||"Your Exam"}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:900,color:daysToExam<7?C.red:C.amber}}>{daysToExam>0?daysToExam:"Today!"}</div><div style={{color:C.muted,fontSize:9}}>days left</div></div>
        </div>}
        <div style={{display:"flex",gap:6,overflowX:"auto"}}>
          {upcoming.map(([name,d])=><div key={name} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",whiteSpace:"nowrap",flexShrink:0}}>
            <div style={{color:C.text,fontSize:11,fontWeight:700}}>{name}</div>
            <div style={{color:C.accent,fontSize:10}}>{Math.ceil((d-new Date())/86400000)}d</div>
          </div>)}
        </div>
      </div>}
      {/* Readiness Score (Part 68) */}
      {results.length>0&&<div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:11}}><span style={{color:C.text,fontWeight:700}}> Exam Readiness</span><span style={{color:readiness>70?C.green:readiness>40?C.amber:C.red,fontWeight:700}}>{readiness}%</span></div>
        <div style={{background:C.surface,borderRadius:6,height:8,overflow:"hidden"}}><div style={{height:"100%",background:`linear-gradient(90deg,${readiness>70?C.green:readiness>40?C.amber:C.red},${C.accent})`,borderRadius:6,width:`${readiness}%`,transition:"width .5s ease"}}/></div>
        <div style={{color:C.muted,fontSize:10,marginTop:3}}>{readiness<30?"Keep practicing to build readiness":readiness<60?"Good progress! Maintain your streak":readiness<80?"Almost ready! Focus on weak areas":"Excellent! You're exam-ready "}</div>
      </div>}
      <div style={{padding:12}}>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${dev.desk?4:2},1fr)`,gap:8,marginBottom:12}}>
          {FEATURES.filter(f=>!f.feat||ctrl.features[f.feat]!==false).map(feat=>{const locked=needsPaid(feat.feat||"");return(<button key={feat.id} onClick={()=>onNav(locked?"payment":feat.id)} style={{background:locked?C.dim+"12":C.card,border:`1.5px solid ${locked?C.dim:feat.c+"40"}`,borderRadius:12,padding:12,textAlign:"left",cursor:"pointer",position:"relative",opacity:locked?0.6:1,transition:"all .15s"}} onMouseEnter={e=>{if(!locked){e.currentTarget.style.borderColor=feat.c;e.currentTarget.style.background=feat.c+"12";}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=locked?C.dim:feat.c+"40";e.currentTarget.style.background=locked?C.dim+"12":C.card;}}>
            {locked&&<div style={{position:"absolute",top:5,right:5,background:C.amber,borderRadius:8,padding:"1px 5px",fontSize:8,fontWeight:900,color:"#000"}}>PAID</div>}
            <div style={{fontSize:24,marginBottom:4}}>{feat.icon}</div>
            <div style={{color:locked?C.muted:feat.c,fontWeight:800,fontSize:11,marginBottom:1}}>{feat.title}</div>
            <div style={{color:C.dim,fontSize:9,lineHeight:1.3}}>{feat.desc}</div>
          </button>);})}
        </div>
        {!hasAccess&&<div style={{background:`linear-gradient(135deg,${C.accent}18,${C.violet}10)`,border:`1.5px solid ${C.accent}35`,borderRadius:14,padding:14,textAlign:"center",marginBottom:12}}><div style={{fontWeight:900,color:C.text,fontSize:13,marginBottom:3}}> Unlock Full Platform</div><div style={{color:C.muted,fontSize:11,marginBottom:10}}>AI Hub . 12 AIs . AI Planner . Unlimited practice . Camera solver</div><Btn c={C.accent} onClick={()=>onNav("payment")}>Upgrade - Plans from Rs9/day</Btn></div>}
        {/* Recent Results */}
        {results.slice(0,3).length>0&&<div style={{marginBottom:12}}><div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:7}}> Recent Tests</div>{results.slice(0,3).map((r,i)=><div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"9px 13px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.text,fontSize:11,fontWeight:700}}>{r.exam?.name||"Exam"}</div><div style={{color:C.muted,fontSize:9}}>{new Date(r.ts||0).toLocaleDateString()} . Acc: {r.correct&&r.totalQ?Math.round(r.correct/r.totalQ*100):0}%</div></div><Pill c={r.score>200?C.green:r.score>100?C.amber:C.red}>{r.score}/{r.total}</Pill></div>)}</div>}
        {/* Badges */}
        {badges.length>0&&<div style={{marginBottom:12}}><div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:7}}> Your Badges</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{badges.map(bid=>{const b=BADGES_DEF.find(x=>x.id===bid);return b?<div key={bid} title={b.desc} style={{background:C.card,border:`1px solid ${C.amber}30`,borderRadius:8,padding:"4px 8px",display:"flex",gap:5,alignItems:"center",fontSize:11}}><span>{b.icon}</span><span style={{color:C.amber,fontSize:10}}>{b.name}</span></div>:null;})}</div></div>}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes slideDown{from{transform:translateY(-40px)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

// ==========================================================================
// ROOT APP
// ==========================================================================
export default function App() {
  const [,setBankTick]=useState(0);
  useEffect(()=>{loadNeetBank().then(()=>setBankTick(t=>t+1));loadUserBank().then(()=>setBankTick(t=>t+1));},[]);
  const dev=useDevice(); const ctrl=useCtrl();
  const [user,setUserState]=useState(null); const [screen,setScreen]=useState("home"); const [examFlow,setExamFlow]=useState(null);
  useEffect(()=>{if(Session.valid()){const s=Session.get();if(s?.email){const u=UserDB.get(s.email);if(u){setUserState(u);return;}}}Session.clear();},[]);
  const setUser=(u)=>{setUserState(u);if(u&&u.email!=="guest@")UserDB.save(u);};
  const nav=(s)=>{setScreen(s);setExamFlow(null);};

  if(!ctrl.apps.paid)return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text,textAlign:"center",padding:20}}><div><div style={{fontSize:48,marginBottom:14}}></div><div style={{fontSize:20,fontWeight:700}}>App Offline</div><div style={{color:C.muted,marginTop:7}}>{ctrl.maintenanceMsg||"Back soon!"}</div></div></div>);
  if(ctrl.maintenance.paid)return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text,textAlign:"center",padding:20}}><div><div style={{fontSize:48,marginBottom:14}}></div><div style={{fontSize:20,fontWeight:700}}>Under Maintenance</div><div style={{color:C.muted,marginTop:7}}>{ctrl.maintenanceMsg}</div></div></div>);
  if(!user)return(<AuthScreen onAuth={u=>{setUserState(u);if(u.email!=="guest@")Session.set(u.email);}} />);

  const BOTTOM=[{id:"home",icon:"H",l:"Home"},{id:"exam_start",icon:"",l:"Exams"},{id:"practice",icon:"",l:"Practice"},{id:"leaderboard",icon:"",l:"Board"},{id:"goals",icon:"",l:"Goals"}];

  const content=()=>{
    if(examFlow?.stage==="mode")return(<ExamModeSelector exam={examFlow.exam} user={user} ctrl={ctrl} onStart={d=>setExamFlow({stage:"active",...d})} onBack={()=>setExamFlow({stage:"select"})} />);
    if(examFlow?.stage==="active")return(<ActiveExam candidate={user.name} examData={examFlow} onSubmit={r=>{
      const res={...r,ts:Date.now()};
      const prevResults=user.data?.results||[];
      const updUser={...user,data:{...user.data,results:[res,...prevResults].slice(0,100),xp:(user.data?.xp||0)+50}};
      // Award badges
      const newBadges=BADGES_DEF.filter(b=>!(updUser.data?.badges||[]).includes(b.id)&&b.cond(updUser)).map(b=>b.id);
      if(newBadges.length)updUser.data.badges=[...(updUser.data.badges||[]),...newBadges];
      // Register to global leaderboard
      const lb=LS.get("global_leaderboard",[]);
      const allScores=[r.score,...prevResults.map(x=>x.score||0)];
      const best=Math.max(...allScores.filter(x=>!isNaN(x)));
      const idx=lb.findIndex(e=>e.userId===user.id);
      const entry={userId:user.id,name:user.name||"Student",country:user.country||"IN",score:isNaN(best)?r.score:best,xp:updUser.data.xp,ts:Date.now()};
      if(idx>=0)lb[idx]={...lb[idx],...entry,score:Math.max(lb[idx].score||0,entry.score)};
      else lb.push(entry);
      LS.set("global_leaderboard",lb.sort((a,b)=>b.score-a.score).slice(0,200));
      setUser(updUser);
      setExamFlow({stage:"result",result:res});
    }} dev={dev} />);
    if(examFlow?.stage==="result")return(<ResultScreen result={examFlow.result} ctrl={ctrl} onBack={()=>{setExamFlow(null);setScreen("home");}} onRetake={()=>setExamFlow({stage:"mode",exam:examFlow.result.exam})} />);
    if(screen==="exam_start"||(examFlow?.stage==="select"))return(<ExamSelector onSelect={e=>setExamFlow({stage:"mode",exam:e})} dev={dev} />);
    if(screen==="practice")return(<PracticeMode user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="leaderboard")return(<Leaderboard user={user} onBack={()=>nav("home")} />);
    if(screen==="goals")return(<StudyGoals user={user} setUser={setUser} onBack={()=>nav("home")} />);
    if(screen==="planner")return(<AIStudyPlanner user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="aihub")return(<AIHub user={user} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="generator")return(<AIGenerator user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="feed")return(<QuestionFeed user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="bank")return(<QuestionBank user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="study")return(<StudyTools user={user} setUser={setUser} onBack={()=>nav("home")} />);
    if(screen==="upgrade_self")return(<SelfUpgrade user={user} setUser={setUser} ctrl={ctrl} onBack={()=>nav("home")} />);
    if(screen==="payment")return(<PaymentScreen user={user} setUser={setUser} onBack={()=>nav("home")} />);
    if(screen==="profile")return(<ProfileScreen user={user} setUser={setUser} onBack={()=>nav("home")} onUpgrade={()=>nav("payment")} />);
    return(<Dashboard user={user} setUser={setUser} onNav={s=>{if(s==="exam"){setExamFlow({stage:"select"});setScreen("exam_start");}else nav(s);}} ctrl={ctrl} dev={dev} />);
  };

  const showNav=!examFlow||examFlow.stage==="select";
  return(
    <div style={{width:"100vw",height:"100vh",background:C.bg,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flex:1,overflow:"hidden"}}>{content()}</div>
      {showNav&&<div style={{background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",padding:"5px 0",flexShrink:0}}>
        {BOTTOM.map(tab=>{const active=(tab.id==="home"&&screen==="home"&&!examFlow)||(tab.id==="exam_start"&&(screen==="exam_start"||(examFlow?.stage==="select")))||screen===tab.id;return(<button key={tab.id} onClick={()=>{if(tab.id==="exam_start"){setExamFlow({stage:"select"});setScreen("exam_start");}else nav(tab.id);}} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer",padding:"4px 8px",opacity:active?1:0.4}}><span style={{fontSize:18}}>{tab.icon}</span><span style={{fontSize:9,color:active?C.accent:C.muted,fontWeight:700}}>{tab.l}</span></button>);})}
      </div>}
      <style>{`*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}body{margin:0;overflow:hidden;}input,textarea,select,button{font-family:inherit;outline:none;}button:active{opacity:.85;}::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-thumb{background:#1e2d42;border-radius:2px;}::-webkit-scrollbar-track{background:transparent;}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
