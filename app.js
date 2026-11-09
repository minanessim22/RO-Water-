/* Panorama Factory Station — Shift Log · app logic */
const TZ="Africa/Cairo";
const CFG={URL:"https://vzammutcdmznmbmpguxt.supabase.co",KEY:"sb_publishable_8Hyhyge9UVkPByP6tD_Xcg_UL7DPVTZ"};
let session=null;
async function api(method,path,body,retry=true){
 const h={apikey:CFG.KEY,"Content-Type":"application/json"};
 if(session)h.Authorization="Bearer "+session.access;else if(CFG.KEY.indexOf("eyJ")===0)h.Authorization="Bearer "+CFG.KEY;
 if(method!=="GET")h.Prefer="return=minimal";
 const r=await fetch(CFG.URL+"/rest/v1/"+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
 if(r.status===401&&session&&retry&&await refresh())return api(method,path,body,false);
 if(!r.ok)throw new Error(await r.text());
 return method==="GET"?r.json():null;
}
function setSession(j){session={access:j.access_token,refresh:j.refresh_token};try{localStorage.setItem("plantlog_sess",JSON.stringify(session))}catch(e){}}
function clearSession(){session=null;try{localStorage.removeItem("plantlog_sess")}catch(e){}}
async function authCall(type,body){
 return fetch(CFG.URL+"/auth/v1/token?grant_type="+type,{method:"POST",headers:{apikey:CFG.KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function refresh(){
 if(!session)return false;
 try{const r=await authCall("refresh_token",{refresh_token:session.refresh});if(!r.ok){clearSession();return false}setSession(await r.json());return true}catch(e){return false}
}
async function load(){
 try{items=await api("GET","log?select=*&order=ts.asc");setConn(true,"Live");draw()}catch(e){setConn(false,"Connection problem");if(!session){stopPoll();show("login")}}
}
const TYPES={
 ts:{label:"Transfer Start",f:[["vol","Volume (L)","number"],["tds","TDS (ppm)","number"]]},
 te:{label:"Transfer End",f:[]},
 rs:{label:"RO Start",f:[["h","HTDS (ppm)","number"],["l","LTDS (ppm)","number"],["ht","HTDS water temp (°C) — optional","number"],["lt","LTDS water temp (°C) — optional","number"]]},
 rp:{label:"RO Stop",f:[["why","Reason (optional)","text"]]},
 pt:{label:"Prep Tank TDS",f:[["v","TDS (ppm)","number"]]},
 ft:{label:"Feed Tank TDS",f:[["v","TDS (ppm)","number"]]},
 rt:{label:"RO Tank TDS",f:[["v","TDS (ppm)","number"]]},
 nt:{label:"Note",f:[["txt","Note","text"]]}
};
let cur="ts", items=[], db=null, canWrite=false, offline=false, editing=null, pend=null, selDay=undefined;

function parts(ts,opt){const o={};new Intl.DateTimeFormat("en-US",{timeZone:TZ,hourCycle:"h23",...opt}).formatToParts(new Date(ts)).forEach(p=>o[p.type]=p.value);return o}
function tOf(ts){return new Date(ts).toLocaleTimeString("en-US",{timeZone:TZ,hour:"2-digit",minute:"2-digit"})}
function dayOf(ts){return new Date(ts).toLocaleDateString("en-US",{timeZone:TZ,weekday:"long",month:"short",day:"numeric",year:"numeric"})}
function inputVal(ts){const p=parts(ts,{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
function fromInput(s){const g=Date.parse(s+":00Z");const p=parts(g,{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});const loc=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const off=loc-g;return g-off}
const fmt=n=>Number(n).toLocaleString("en-US");

function lastBefore(type,ts){let r=null;for(const e of items){if(e.type===type&&e.ts<ts&&(!r||e.ts>r.ts))r=e}return r}
function build(type,f,ts){
 if(type==="ts")return `Transfer Started: Prep Tank ➔ FPT (Volume: ${fmt(f.vol)} L, ${f.tds} ppm TDS).`;
 if(type==="te"){const s=lastBefore("ts",ts);const d=s?Math.round((ts-s.ts)/60000):null;return `Transfer Completed: Prep Tank ➔ FPT stopped${d!=null?` (${d} min duration)`:""}.`}
 if(type==="rs"){const t=v=>v!=null?" ("+v+" °C)":"";return `RO System Started: HTDS at ${f.h} ppm${t(f.ht)}, LTDS at ${f.l} ppm${t(f.lt)}.`}
 if(type==="rp"){const s=lastBefore("rs",ts);const d=s?Math.round((ts-s.ts)/60000):null;return `RO System Stopped${f.why?`: ${f.why}`:""}${d!=null?` (${d} min runtime)`:""}.`}
 if(type==="pt")return `Preparation Tank measured at ${f.v} ppm TDS.`;
 if(type==="ft")return `Feed Tank measured at ${f.v} ppm TDS.`;
 if(type==="rt")return `RO Tank measured at ${f.v} ppm TDS.`;
 return f.txt
}

function drawForm(){
 document.getElementById("chips").innerHTML=Object.entries(TYPES).filter(([k])=>!editing||k===cur).map(([k,t])=>`<button class="chip ${k===cur?"sel":""}" data-k="${k}">${t.label}</button>`).join("");
 document.getElementById("fields").innerHTML=TYPES[cur].f.map(([id,lb,ty])=>`<label>${lb}</label><input id="f_${id}" type="${ty}" value="${editing&&editing.f&&editing.f[id]!=null?esc(editing.f[id]):""}" ${ty==="number"?'inputmode="decimal" step="any"':""}>`).join("");
 document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{cur=b.dataset.k;drawForm()});
}

function drawStatus(){
 const last=t=>items.filter(e=>t.includes(e.type)).sort((a,b)=>b.ts-a.ts)[0];
 const ro=last(["rs","rp"]),tr=last(["ts","te"]),pt=last(["pt"]),ft=last(["ft"]),rt=last(["rt"]),any=items.slice().sort((a,b)=>b.ts-a.ts)[0];
 const roOn=ro&&ro.type==="rs",trOn=tr&&tr.type==="ts";
 const card=(h,v,cls,s)=>`<div class="st"><b>${h}</b><span class="${cls}">${v}</span><small>${s}</small></div>`;
 document.getElementById("status").innerHTML=
  card("RO system",ro?(roOn?"Running":"Stopped"):"—",roOn?"on":"offc",ro?`since ${tOf(ro.ts)}${roOn&&ro.f.l!=null?` · LTDS ${ro.f.l}`:""}`:"no data")+
  card("Transfer",tr?(trOn?"In progress":"Idle"):"—",trOn?"on":"offc",tr?`since ${tOf(tr.ts)}${trOn&&tr.f.vol?` · ${fmt(tr.f.vol)} L`:""}`:"no data")+
  card("Prep tank",pt?`${pt.f.v} ppm`:"—","",pt?`measured ${tOf(pt.ts)}`:"no data")+
  card("Feed tank",ft?`${ft.f.v} ppm`:"—","",ft?`measured ${tOf(ft.ts)}`:"no data")+
  card("RO tank",rt?`${rt.f.v} ppm`:"—","",rt?`measured ${tOf(rt.ts)}`:"no data")+
  card("Last update",any?tOf(any.ts):"—","",any?dayOf(any.ts):"no data");
}

function drawLog(){
 const el=document.getElementById("log");
 const vis=items.filter(e=>selDay==="all"||dateISO(e.ts)===selDay);
 if(!vis.length){el.innerHTML='<div class="empty">No entries yet</div>';return}
 const days={};vis.slice().sort((a,b)=>a.ts-b.ts).forEach(e=>{(days[dayOf(e.ts)]=days[dayOf(e.ts)]||[]).push(e)});
 el.innerHTML=Object.keys(days).reverse().map(d=>`<div class="day"><h2>${d}</h2><span><button class="sec" data-copy="${d}">Copy for WhatsApp</button> <button class="sec" data-xl="${d}">Excel</button></span></div><div class="card">${days[d].map(e=>`<div class="ev"><time>${tOf(e.ts)}</time><p>${esc(e.msg)}</p>${canWrite?`<button class="x" data-edit="${e.id}" title="Edit">✎</button><button class="x" data-del="${e.id}" title="Delete">✕</button>`:""}</div>`).join("")}</div>`).join("");
 el.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copyDay(b.dataset.copy,b));
 el.querySelectorAll("[data-xl]").forEach(b=>b.onclick=()=>exportXlsx(b.dataset.xl));
 el.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>del(b.dataset.del,b));
 el.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function draw(){drawStatus();drawDays();drawLog();if(offline){try{localStorage.setItem("plantlog",JSON.stringify(items))}catch(e){}}}

async function copyDay(d,btn){
 const list=items.filter(e=>dayOf(e.ts)===d).sort((a,b)=>a.ts-b.ts);
 const text="محطة مصنع بانوراما\n"+d+"\n\n"+list.map(e=>`${tOf(e.ts)} — ${e.msg}`).join("\n\n");
 let ok=false;
 try{await navigator.clipboard.writeText(text);ok=true}catch(e){
  try{const t=document.createElement("textarea");t.value=text;document.body.appendChild(t);t.select();ok=document.execCommand("copy");t.remove()}catch(e2){}
 }
 btn.textContent=ok?"Copied ✓":"Copy failed";setTimeout(()=>btn.textContent="Copy for WhatsApp",1800);
}

async function del(id,btn){
 if(pend!==id){pend=id;btn.textContent="Delete?";btn.style.color="var(--warn)";setTimeout(()=>{if(pend===id){pend=null;btn.textContent="✕";btn.style.color=""}},3000);return}
 pend=null;
 try{ if(db&&!offline){await api("DELETE","log?id=eq."+id);await load()} else {items=items.filter(e=>e.id!==id);draw()} }catch(e){document.getElementById("formErr").textContent="Could not delete."}
}

document.getElementById("add").onclick=async()=>{
 const err=document.getElementById("formErr");err.textContent="";
 const f={};
 for(const [id,lb,ty] of TYPES[cur].f){
  const v=document.getElementById("f_"+id).value.trim();
  const optional=["why","ht","lt"].includes(id);
  if(!v&&!optional){err.textContent=`Enter: ${lb}`;return}
  if(v)f[id]=ty==="number"?Number(v):v;
 }
 const wv=document.getElementById("when").value;
 if(!wv){err.textContent="Pick a time";return}
 const ts=fromInput(wv);
 const entry={ts,type:cur,f,msg:build(cur,f,ts)};
 selDay=dateISO(ts);
 try{
  if(editing){
   const id=editing.id;
   items=items.map(e=>e.id===id?{...entry,id}:e);
   if(db&&!offline)await api("PATCH","log?id=eq."+id,entry);
   await recalc();if(db&&!offline)await load();
   endEdit();draw();
  }else{
   if(db&&!offline){await api("POST","log",entry);await load()}
   else{items.push({...entry,id:"l"+Date.now()});draw()}
   drawForm();document.getElementById("when").value=inputVal(Date.now());
  }
 }catch(e){err.textContent="Could not save. Check your connection."}
};

async function recalc(){
 for(const e of items){
  if(e.type!=="te"&&e.type!=="rp")continue;
  const m=build(e.type,e.f||{},e.ts);
  if(m!==e.msg){e.msg=m;if(db&&!offline)await api("PATCH","log?id=eq."+e.id,{msg:m})}
 }
}
function startEdit(id){
 const e=items.find(x=>x.id===id);if(!e)return;
 editing=e;cur=e.type;drawForm();
 document.getElementById("when").value=inputVal(e.ts);
 document.getElementById("add").textContent="Save changes";
 document.getElementById("cancel").hidden=false;
 document.getElementById("formErr").textContent="";
 scrollTo({top:0,behavior:"smooth"});
}
function endEdit(){
 editing=null;document.getElementById("add").textContent="Add entry";
 document.getElementById("cancel").hidden=true;drawForm();
 document.getElementById("when").value=inputVal(Date.now());
}
document.getElementById("cancel").onclick=endEdit;
function dayKeys(){return [...new Set(items.map(e=>dateISO(e.ts)))].sort().reverse()}
function drawDays(){
 const keys=dayKeys();
 if(selDay===undefined&&keys.length)selDay=keys[0];
 if(selDay!=="all"&&!keys.includes(selDay))selDay=keys[0]||"all";
 const cnt={},lab={};items.forEach(e=>{const k=dateISO(e.ts);cnt[k]=(cnt[k]||0)+1;lab[k]=dayOf(e.ts)});
 const sel=document.getElementById("daySel");
 sel.innerHTML='<option value="all">All days ('+items.length+')</option>'+keys.map(k=>'<option value="'+k+'">'+lab[k]+' ('+cnt[k]+')</option>').join("");
 sel.value=selDay;
}
function stepDay(d){
 const keys=dayKeys();if(!keys.length)return;
 let i=keys.indexOf(selDay);
 if(i<0)i=0;else i=Math.min(keys.length-1,Math.max(0,i+d));
 selDay=keys[i];drawDays();drawLog();
}
document.getElementById("daySel").onchange=e=>{selDay=e.target.value;drawLog()};
document.getElementById("dOlder").onclick=()=>stepDay(1);
document.getElementById("dNewer").onclick=()=>stepDay(-1);
function num(v){v=String(v==null?"":v).replace(/[\u0660-\u0669]/g,d=>"\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)).replace(/[\u066b,]/g,".").trim();const n=parseFloat(v);return isFinite(n)?n:NaN}
const f2=n=>(Math.round(n*100)/100).toLocaleString("en-US",{maximumFractionDigits:2});
const $=id=>document.getElementById(id);
function calc(){
 const fd=num($("cFeed").value),ro=num($("cRo").value),t=num($("cTar").value),V=Math.round(num($("cVol").value));
 $("cRatio").textContent="\u2014";$("cLiters").textContent="\u2014";
 $("cRatioSub").textContent="";$("cLitersSub").textContent="";$("cRatioSub").className="msg";
 if(isNaN(fd)||isNaN(ro)||isNaN(t))return;
 if(fd<=ro){$("cRatioSub").textContent="Feed TDS must be higher than RO TDS";$("cRatioSub").className="msg err";return}
 if(t<ro||t>fd){$("cRatioSub").textContent="Target must be between "+f2(ro)+" and "+f2(fd)+" ppm";$("cRatioSub").className="msg err";return}
 const x=(t-ro)/(fd-ro);
 $("cRatio").textContent=x===0?"RO only":x===1?"Feed only":f2((1-x)/x)+" : 1";
 $("cRatioSub").textContent="RO "+f2((1-x)*100)+"%  \u2014  Feed "+f2(x*100)+"%";
 if(isNaN(V)||V<=0)return;
 const fl=Math.round(V*x),rl=V-fl;
 $("cLiters").textContent=fmt(rl)+" L RO + "+fmt(fl)+" L Feed";
 $("cLitersSub").textContent="Expected mix \u2248 "+f2((rl*ro+fl*fd)/V)+" ppm TDS";
}
function lastVal(t){const e=items.filter(x=>x.type===t).sort((a,b)=>b.ts-a.ts)[0];return e&&e.f&&e.f.v!=null?e.f.v:null}
function setView(v){
 if(v==="calc"&&!canWrite)v="main";
 $("mainView").hidden=v==="calc";$("calcView").hidden=v!=="calc";
 if(v==="calc"){
  const fv=lastVal("ft"),rv=lastVal("rt");let used=false;
  if(!$("cFeed").value&&fv!=null){$("cFeed").value=fv;used=true}
  if(!$("cRo").value&&rv!=null){$("cRo").value=rv;used=true}
  $("cHint").textContent=used?"Feed and RO TDS were filled from the latest log entries. You can change them.":"";
  calc();scrollTo(0,0);
 }
}
$("calcBtn").onclick=()=>setView("calc");
$("calcBack").onclick=()=>setView("main");
["cFeed","cRo","cTar","cVol"].forEach(id=>$(id).oninput=calc);
document.getElementById("expAll").onclick=()=>exportXlsx(null);
async function saveFile(name,blob){
 let dl=null;try{dl=await claude.use("downloads")}catch(e){}
 if(dl){try{await dl.save({filename:name,data:blob})}catch(e){}return}
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function dateISO(ts){return inputVal(ts).slice(0,10)}
async function exportXlsx(day){
 const list=items.filter(e=>!day||dayOf(e.ts)===day).sort((a,b)=>a.ts-b.ts);
 if(!list.length)return;
 const N={ts:"Transfer Start",te:"Transfer End",rs:"RO Start",rp:"RO Stop",pt:"Prep Tank TDS",ft:"Feed Tank TDS",rt:"RO Tank TDS",nt:"Note"};
 const rows=list.map(e=>{
  const f=e.f||{};
  const s=e.type==="te"?lastBefore("ts",e.ts):e.type==="rp"?lastBefore("rs",e.ts):null;
  return {"Date":dateISO(e.ts),"Time":tOf(e.ts),"Event":N[e.type]||e.type,"Volume (L)":f.vol??"","TDS (ppm)":f.tds??f.v??"","HTDS (ppm)":f.h??"","LTDS (ppm)":f.l??"","HTDS temp (°C)":f.ht??"","LTDS temp (°C)":f.lt??"","Duration (min)":s?Math.round((e.ts-s.ts)/60000):"","Note":f.why||f.txt||"","Message":e.msg};
 });
 const base="plant-log-"+(day?dateISO(list[0].ts):"all");
 if(typeof XLSX!=="undefined"){
  const ws=XLSX.utils.json_to_sheet(rows);
  ws["!cols"]=Object.keys(rows[0]).map(k=>({wch:k==="Message"?70:k==="Note"?24:16}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Log");
  const arr=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  await saveFile(base+".xlsx",new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 }else{
  const cols=Object.keys(rows[0]);
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const nl=String.fromCharCode(10);
  const csv=String.fromCharCode(65279)+[cols.map(q).join(",")].concat(rows.map(r=>cols.map(c=>q(r[c])).join(","))).join(nl);
  await saveFile(base+".csv",new Blob([csv],{type:"text/csv"}));
 }
}
function setConn(live,txt){document.getElementById("dot").className="dot"+(live?" live":"");document.getElementById("conn").textContent=txt}

let pollT=null,role=null;
function show(v){$("loginView").hidden=v!=="login";$("appView").hidden=v!=="app";$("who").hidden=v!=="app"}
async function loadRole(){try{const r=await api("GET","user_roles?select=role");role=r&&r[0]?r[0].role:null}catch(e){role=null}}
function applyAuth(){
 canWrite=role==="editor";
 $("formCard").hidden=!canWrite;$("calcBtn").hidden=!canWrite;
 $("roleBadge").textContent=canWrite?"Editor":"Viewer";
 if(!canWrite)setView("main");
 draw();
}
function stopPoll(){if(pollT){clearInterval(pollT);pollT=null}}
function signOut(msg){clearSession();role=null;items=[];canWrite=false;stopPoll();show("login");$("loginErr").textContent=msg||""}
async function enter(){
 await loadRole();
 if(role!=="viewer"&&role!=="editor"){signOut(role?"Your account has not been approved yet. Please contact the administrator.":"Could not verify your access. Check your connection and try again.");return}
 applyAuth();show("app");await load();stopPoll();pollT=setInterval(load,10000);
}
async function init(){
 drawForm();$("when").value=inputVal(Date.now());draw();
 $("loginBtn").onclick=async()=>{
  const er=$("loginErr");er.textContent="";
  try{
   const r=await authCall("password",{email:$("em").value.trim(),password:$("pw").value});
   if(!r.ok){er.textContent="Wrong email or password";return}
   setSession(await r.json());$("pw").value="";await enter();
  }catch(e){er.textContent="No connection. Try again."}
 };
 $("pw").onkeydown=e=>{if(e.key==="Enter")$("loginBtn").click()};
 $("logout").onclick=e=>{e.preventDefault();signOut("")};
 db=true;
 try{session=JSON.parse(localStorage.getItem("plantlog_sess")||"null")}catch(e){session=null}
 if(session&&await refresh())await enter();else{clearSession();show("login")}
}
init();
