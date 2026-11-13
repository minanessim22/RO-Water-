/* Panorama Factory Station — Shift Log · app logic */
if(window.top!==window.self){document.documentElement.style.display="none";try{window.top.location=window.self.location}catch(e){}}
window.addEventListener("error",function(e){var b=document.getElementById("boot");if(b){b.hidden=false;b.className="card msg err";b.textContent="Page error: "+e.message}});
const TZ="Africa/Cairo";
const CFG={URL:"https://vzammutcdmznmbmpguxt.supabase.co",KEY:"sb_publishable_8Hyhyge9UVkPByP6tD_Xcg_UL7DPVTZ"};
let session=null;
async function api(method,path,body,retry=true,prefer){
 const h={apikey:CFG.KEY,"Content-Type":"application/json"};
 if(session)h.Authorization="Bearer "+session.access;else if(CFG.KEY.indexOf("eyJ")===0)h.Authorization="Bearer "+CFG.KEY;
 if(method!=="GET")h.Prefer=prefer||"return=minimal";
 let r;
 try{r=await fetch(CFG.URL+"/rest/v1/"+path,{method,headers:h,body:body?JSON.stringify(body):undefined})}
 catch(e){const er=new Error("network");er.net=true;throw er}
 if(r.status===401&&session&&retry&&await refresh()===true)return api(method,path,body,false,prefer);
 if(!r.ok){const er=new Error(await r.text());er.status=r.status;throw er}
 return method==="GET"?r.json():null;
}
function uuid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)})}
function setSession(j){session={access:j.access_token,refresh:j.refresh_token};try{localStorage.setItem("plantlog_sess",JSON.stringify(session))}catch(e){}}
function clearSession(){session=null;try{localStorage.removeItem("plantlog_sess")}catch(e){}}
async function authCall(type,body){
 return fetch(CFG.URL+"/auth/v1/token?grant_type="+type,{method:"POST",headers:{apikey:CFG.KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function refresh(){
 if(!session)return false;
 try{const r=await authCall("refresh_token",{refresh_token:session.refresh});if(!r.ok){clearSession();return false}setSession(await r.json());return true}catch(e){return null}
}
function qLoad(){try{queue=JSON.parse(localStorage.getItem("plantlog_queue")||"[]")}catch(e){queue=[]}}
function qSave(){try{localStorage.setItem("plantlog_queue",JSON.stringify(queue))}catch(e){}}
function merge(){
 const ids=new Set(queue.map(q=>q.id));
 items=serverRows.filter(r=>!ids.has(r.id)).concat(queue.map(q=>({id:q.id,ts:q.ts,type:q.type,f:q.f,msg:q.msg,pending:true})));
}
function qAdd(entry){queue.push({id:entry.id,ts:entry.ts,type:entry.type,f:entry.f,msg:entry.msg});qSave();merge();setConn(false,connText(false))}
function writeCache(){try{localStorage.setItem("plantlog_cache",JSON.stringify({role:role,rows:serverRows,limits:limits,ts:hasTs}))}catch(e){}}
function readCache(){try{return JSON.parse(localStorage.getItem("plantlog_cache")||"null")}catch(e){return null}}
async function syncQueue(){
 if(!queue.length||!session||syncing)return;
 syncing=true;
 try{
  for(const q of queue.slice()){
   try{await api("POST","log",{id:q.id,ts:q.ts,type:q.type,f:q.f,msg:q.msg});queue=queue.filter(x=>x.id!==q.id);qSave()}
   catch(e){if(e.net)break;if(e.status===409){queue=queue.filter(x=>x.id!==q.id);qSave()}}
  }
 }finally{syncing=false}
}
function connText(online){
 const n=queue.length;
 if(online)return n?"Live \u2014 "+n+" not synced yet":"Live";
 return "Offline \u2014 showing saved data"+(n?", "+n+" waiting to sync":"");
}
async function load(){
 try{
  await syncQueue();
  if(isMe())await tsSync();
  const res=await Promise.all([api("GET","log?select=*&order=ts.asc"),api("GET","app_settings?select=value&key=eq.limits").catch(()=>null)]);
  serverRows=res[0];
  if(res[1])limits=(res[1][0]&&res[1][0].value)||{};
  merge();writeCache();setConn(true,connText(true));draw();
 }catch(e){
  merge();setConn(false,e.net?connText(false):"Connection problem");
  if(!session){stopPoll();show("login")}
  draw();
 }
}
function lim(type,v){const L=limits[type];if(!L||typeof v!=="number")return null;if(L.min!=null&&v<L.min)return{k:"low",b:L.min};if(L.max!=null&&v>L.max)return{k:"high",b:L.max};return null}
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
let cur="ts", items=[], db=null, canWrite=false, offline=false, editing=null, pend=null, selDay=undefined, serverRows=[], queue=[], limits={}, syncing=false, outConfirm=false, whenTouched=false, viewToday=true, tsRows=[], tsMonth="", tsQ={};

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

const ICO={
 drop:'<svg viewBox="0 0 24 24"><path d="M12 3l6 6.3a8 8 0 1 1-12 0z"/></svg>',
 flow:'<svg viewBox="0 0 24 24"><path d="M4 8h13m0 0l-4-4m4 4l-4 4M20 16H7m0 0l4-4m-4 4l4 4"/></svg>',
 tank:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v13c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-13"/></svg>',
 clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
 play:'<svg viewBox="0 0 24 24"><path d="M8 5.5l10 6.5-10 6.5z"/></svg>',
 stop:'<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>',
 note:'<svg viewBox="0 0 24 24"><path d="M5 19l1-4 9.5-9.5 3 3L9 18z"/></svg>'
};
const GROUPS=[["Transfer",["ts","te"]],["RO system",["rs","rp"]],["Measurements",["pt","ft","rt"]],["Other",["nt"]]];
const KIND={ts:"start",rs:"start",te:"stop",rp:"stop",pt:"meas",ft:"meas",rt:"meas",nt:"note"};
const KICO={start:"play",stop:"stop",meas:"drop",note:"note"};
function drawForm(){
 document.getElementById("chips").innerHTML=GROUPS.map(([g,ks])=>{const arr=ks.filter(k=>!editing||k===cur);if(!arr.length)return "";return `<div class="cgrp"><span class="cgl">${g}</span><div class="cgb">${arr.map(k=>`<button type="button" class="chip ${KIND[k]}${k===cur?" sel":""}" data-k="${k}">${TYPES[k].label}</button>`).join("")}</div></div>`}).join("");
 document.getElementById("fields").innerHTML=TYPES[cur].f.map(([id,lb,ty])=>`<label>${lb}</label><input id="f_${id}" type="${ty}" value="${editing&&editing.f&&editing.f[id]!=null?esc(editing.f[id]):""}" ${ty==="number"?'inputmode="decimal" step="any"':""}>`).join("");
 document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{cur=b.dataset.k;drawForm()});
}

function drawStatus(){
 const last=t=>items.filter(e=>t.includes(e.type)).sort((a,b)=>b.ts-a.ts)[0];
 const ro=last(["rs","rp"]),tr=last(["ts","te"]),pt=last(["pt"]),ft=last(["ft"]),rt=last(["rt"]),any=items.slice().sort((a,b)=>b.ts-a.ts)[0];
 const roOn=ro&&ro.type==="rs",trOn=tr&&tr.type==="ts";
 const lc=(t,e)=>{const L=limits[t];if(!e||!L||(L.min==null&&L.max==null))return "";return lim(t,e.f.v)?"bad":"on"};
 const ls=(t,e)=>{const r=e?lim(t,e.f.v):null;return r?(r.k==="high"?" · above max":" · below min"):""};
 const card=(h,v,cls,s,ic)=>`<div class="st ${cls}"><div class="st-h"><i class="ico">${ICO[ic]}</i><b>${h}</b><i class="sdot ${cls}"></i></div><span class="${cls}">${esc(v)}</span><small>${esc(s)}</small></div>`;
 document.getElementById("status").innerHTML=
  card("RO system",ro?(roOn?"Running":"Stopped"):"—",roOn?"on":"offc",ro?`since ${tOf(ro.ts)}${roOn&&ro.f.l!=null?` · LTDS ${ro.f.l}`:""}`:"no data","drop")+
  card("Transfer",tr?(trOn?"In progress":"Idle"):"—",trOn?"on":"offc",tr?`since ${tOf(tr.ts)}${trOn&&tr.f.vol?` · ${fmt(tr.f.vol)} L`:""}`:"no data","flow")+
  card("Prep tank",pt?`${pt.f.v} ppm`:"—",lc("pt",pt),pt?`measured ${tOf(pt.ts)}${ls("pt",pt)}`:"no data","tank")+
  card("Feed tank",ft?`${ft.f.v} ppm`:"—",lc("ft",ft),ft?`measured ${tOf(ft.ts)}${ls("ft",ft)}`:"no data","tank")+
  card("RO tank",rt?`${rt.f.v} ppm`:"—",lc("rt",rt),rt?`measured ${tOf(rt.ts)}${ls("rt",rt)}`:"no data","tank")+
  card("Last update",any?tOf(any.ts):"—","",any?dayOf(any.ts):"no data","clock");
}

function limFlag(e){
 if(!["pt","ft","rt"].includes(e.type)||!e.f)return null;
 const r=lim(e.type,e.f.v);return r?(r.k==="high"?"above max "+r.b:"below min "+r.b):null;
}
function who(s){return String(s).split("@")[0]}
function rowHtml(e){
 const fl=limFlag(e),meta=[],k=KIND[e.type]||"note";
 if(e.pending)meta.push("\u23f3 Waiting to sync");
 else{if(e.created_by)meta.push("by "+who(e.created_by));if(e.edited_by)meta.push("edited by "+who(e.edited_by))}
 const btns=canWrite?`<button class="x" data-edit="${esc(e.id)}" title="Edit">\u270e</button><button class="x" data-del="${esc(e.id)}" title="Delete">\u2715</button>`:"";
 return `<div class="ev k-${k}${e.pending?" pending":""}${fl?" out":""}"><i class="eico">${ICO[KICO[k]]}</i><div class="ebody"><time>${tOf(e.ts)}</time><p>${esc(e.msg)}${fl?` <span class="flag">\u26a0 ${esc(fl)}</span>`:""}</p>${meta.length?`<small class="meta">${esc(meta.join(" \u00b7 "))}</small>`:""}</div>${btns}</div>`;
}
function drawLog(){
 const el=document.getElementById("log");
 const vis=items.filter(e=>selDay==="all"||dateISO(e.ts)===selDay);
 if(!vis.length){el.innerHTML='<div class="empty">'+(selDay===dateISO(Date.now())?'No entries today yet':'No entries on this day')+'</div>';return}
 const days={};vis.slice().sort((a,b)=>a.ts-b.ts).forEach(e=>{(days[dayOf(e.ts)]=days[dayOf(e.ts)]||[]).push(e)});
 el.innerHTML=Object.keys(days).reverse().map(d=>`<div class="day"><h2>${d}<span class="cnt">${days[d].length}</span></h2><button class="sec" data-copy="${d}">Copy for WhatsApp</button></div><div class="card">${days[d].map(rowHtml).join("")}</div>`).join("");
 el.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copyDay(b.dataset.copy,b));
 el.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>del(b.dataset.del,b));
 el.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function draw(){drawStatus();drawDays();drawLog();drawChart()}

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
 if(pend!==id){pend=id;btn.textContent="Delete?";btn.style.color="var(--warn)";setTimeout(()=>{if(pend===id){pend=null;btn.textContent="\u2715";btn.style.color=""}},3000);return}
 pend=null;
 const e=items.find(x=>x.id===id);
 if(e&&e.pending){queue=queue.filter(x=>x.id!==id);qSave();merge();draw();return}
 try{await api("DELETE","log?id=eq."+encodeURIComponent(id));await load()}
 catch(er){document.getElementById("formErr").textContent=er.net?"No connection. Deleting needs internet.":"Could not delete."}
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
 const entry={id:uuid(),ts,type:cur,f,msg:build(cur,f,ts)};
 if(!editing&&(KIND[cur]==="start"||KIND[cur]==="stop")&&!(await confirmEntry(entry)))return;
 goDay(dateISO(ts));
 try{
  if(editing){
   const ed=editing;
   if(ed.pending){const q=queue.find(x=>x.id===ed.id);if(q){q.ts=ts;q.type=cur;q.f=f;q.msg=entry.msg;qSave()}merge()}
   else{
    await api("PATCH","log?id=eq."+encodeURIComponent(ed.id),{ts,type:cur,f,msg:entry.msg});
    serverRows=serverRows.map(e=>e.id===ed.id?{...e,ts,type:cur,f,msg:entry.msg}:e);merge();
   }
   await recalc();
   if(!ed.pending)await load();
   endEdit();draw();
  }else{
   try{await api("POST","log",entry);await load()}
   catch(e){if(e.net){qAdd(entry);draw()}else throw e}
   drawForm();whenTouched=false;syncWhen(true);
  }
 }catch(e){err.textContent=e.net?"No connection. Editing needs internet.":"Could not save."}
};

async function recalc(){
 for(const e of items){
  if(e.type!=="te"&&e.type!=="rp")continue;
  const m=build(e.type,e.f||{},e.ts);
  if(m===e.msg)continue;
  e.msg=m;
  if(e.pending){const q=queue.find(x=>x.id===e.id);if(q){q.msg=m;qSave()}}
  else{try{await api("PATCH","log?id=eq."+encodeURIComponent(e.id),{msg:m})}catch(er){if(er.net)break}}
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
 whenTouched=false;syncWhen(true);
}
document.getElementById("cancel").onclick=endEdit;
function dayKeys(){return [...new Set(items.map(e=>dateISO(e.ts)))].sort().reverse()}
function goDay(d){viewToday=(d===dateISO(Date.now()));selDay=d;draw()}
function drawDays(){
 const today=dateISO(Date.now());
 if(viewToday)selDay=today;
 else if(selDay!=="all"&&!dayKeys().includes(selDay)){viewToday=true;selDay=today}
 let txt;
 if(selDay==="all")txt="All days ("+items.length+")";
 else{const n=items.filter(e=>dateISO(e.ts)===selDay).length;const d=items.find(e=>dateISO(e.ts)===selDay);txt=(selDay===today?"Today":(d?dayOf(d.ts):selDay))+" ("+n+")"}
 $("histLabel").textContent=txt;
}
function openHist(){
 const today=dateISO(Date.now()),cnt={},lab={};
 items.forEach(e=>{const k=dateISO(e.ts);cnt[k]=(cnt[k]||0)+1;lab[k]=dayOf(e.ts)});
 const row=(d,l,n)=>'<button class="histrow'+(selDay===d?" active":"")+'" data-day="'+d+'"><span>'+esc(l)+'</span><span class="n">'+n+'</span></button>';
 let h=row(today,"Today",cnt[today]||0)+row("all","All days",items.length);
 h+=dayKeys().filter(k=>k!==today).map(k=>row(k,lab[k],cnt[k])).join("");
 $("histList").innerHTML=h;
 $("histList").querySelectorAll(".histrow").forEach(b=>{b.onclick=()=>{goDay(b.dataset.day);closeHist()}});
 $("histModal").hidden=false;
}
function closeHist(){$("histModal").hidden=true}
document.getElementById("histBtn").onclick=openHist;
document.getElementById("histClose").onclick=closeHist;
document.getElementById("histModal").onclick=e=>{if(e.target===document.getElementById("histModal"))closeHist()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeHist()});
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
 if(v==="time"&&!isMe())v="main";
 $("mainView").hidden=v!=="main";$("calcView").hidden=v!=="calc";$("timeView").hidden=v!=="time";
 if(v==="time"){(async()=>{tsMonth=curMonth();await tsLoad();tsFill(dateISO(Date.now()));scrollTo(0,0)})()}
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
function xlSync(){
 const boxes=[...document.querySelectorAll(".xlDay")];
 $("xlAll").checked=boxes.length>0&&boxes.every(b=>b.checked);
 $("xlMsg").textContent="";
}
function openXl(){
 const keys=dayKeys();
 if(!keys.length){$("xlList").innerHTML='<div class="empty">No entries yet</div>';$("xlAll").checked=false}
 else{
  const cnt={},lab={};items.forEach(e=>{const k=dateISO(e.ts);cnt[k]=(cnt[k]||0)+1;lab[k]=dayOf(e.ts)});
  $("xlList").innerHTML=keys.map(k=>'<label class="chk"><input type="checkbox" class="xlDay" value="'+k+'"'+((selDay==="all"||selDay===k)?" checked":"")+'><span>'+lab[k]+'</span><span class="n">'+cnt[k]+'</span></label>').join("");
  xlSync();
 }
 $("xlModal").hidden=false;
}
function closeXl(){$("xlModal").hidden=true}
$("xlBtn").onclick=openXl;
$("xlClose").onclick=closeXl;
$("xlModal").onclick=e=>{if(e.target===$("xlModal"))closeXl()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeXl()});
$("xlAll").onchange=()=>{document.querySelectorAll(".xlDay").forEach(b=>b.checked=$("xlAll").checked);$("xlMsg").textContent=""};
$("xlList").onchange=xlSync;
$("xlGo").onclick=async()=>{
 const keys=[...document.querySelectorAll(".xlDay:checked")].map(b=>b.value);
 if(!keys.length){$("xlMsg").textContent="Select at least one day";return}
 closeXl();await exportXlsx(keys);
};
["cFeed","cRo","cTar","cVol"].forEach(id=>$(id).oninput=calc);
const LKEYS=[["pt","Prep tank"],["ft","Feed tank"],["rt","RO tank"]];
function openLim(){
 $("limRows").innerHTML=LKEYS.map(([k,n])=>{const L=limits[k]||{};const nv=x=>(x!=null&&x!==""&&isFinite(Number(x)))?Number(x):"";const a=nv(L.min),b=nv(L.max);
  return '<div class="limrow"><b>'+n+'</b><div class="row"><div><label>Min (ppm)</label><input id="lmin_'+k+'" inputmode="decimal" value="'+a+'"></div><div><label>Max (ppm)</label><input id="lmax_'+k+'" inputmode="decimal" value="'+b+'"></div></div></div>'}).join("");
 $("limMsg").textContent="";$("limModal").hidden=false;
}
function closeLim(){$("limModal").hidden=true}
$("limBtn").onclick=openLim;
$("limClose").onclick=closeLim;
$("limModal").onclick=e=>{if(e.target===$("limModal"))closeLim()};
$("limGo").onclick=async()=>{
 const nl={};
 for(const [k] of LKEYS){
  const a=num($("lmin_"+k).value),b=num($("lmax_"+k).value);
  if(!isNaN(a)&&!isNaN(b)&&a>b){$("limMsg").textContent="Min must be lower than Max";return}
  nl[k]={min:isNaN(a)?null:a,max:isNaN(b)?null:b};
 }
 try{
  await api("POST","app_settings?on_conflict=key",{key:"limits",value:nl},true,"resolution=merge-duplicates,return=minimal");
  limits=nl;writeCache();closeLim();draw();
 }catch(e){$("limMsg").textContent=e.net?"No connection.":"Could not save. Make sure the settings table was created in Supabase."}
};
function confirmEntry(entry){
 return new Promise(res=>{
  const m=document.getElementById("cfModal"),go=document.getElementById("cfGo"),no=document.getElementById("cfNo");
  document.getElementById("cfTitle").textContent="Confirm "+TYPES[entry.type].label;
  document.getElementById("cfBody").textContent=tOf(entry.ts)+" \u00b7 "+entry.msg;
  go.className="main "+KIND[entry.type];
  const done=v=>{m.hidden=true;go.onclick=no.onclick=m.onclick=null;res(v)};
  go.onclick=()=>done(true);no.onclick=()=>done(false);
  m.onclick=e=>{if(e.target===m)done(false)};
  m.hidden=false;
 });
}
document.addEventListener("keydown",e=>{const m=document.getElementById("cfModal");if(e.key==="Escape"&&m&&!m.hidden)document.getElementById("cfNo").click()});
let chartRange="7",chartOff={},rzT;
const TIP0="Tap a point to see its value";
function dlab(ts){return new Date(ts).toLocaleDateString("en-US",{timeZone:TZ,month:"short",day:"numeric"})+" "+tOf(ts)}
function robustRange(vals,extra){
 const v=vals.slice().sort((a,b)=>a-b),n=v.length;
 let lo=v[0],hi=v[n-1];
 if(n>=6){
  const q=p=>v[Math.floor((n-1)*p)],q1=q(.25),q3=q(.75),iqr=Math.max(q3-q1,Math.abs(q3)*0.05,1);
  const inn=v.filter(x=>x>=q1-3*iqr&&x<=q3+3*iqr);
  if(inn.length&&inn.length<n){lo=inn[0];hi=inn[inn.length-1]}
 }
 extra.forEach(x=>{lo=Math.min(lo,x);hi=Math.max(hi,x)});
 const minSpan=Math.max(10,hi*0.2);
 if(hi-lo<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2}
 const pad=(hi-lo)*0.12;
 return {lo:Math.max(0,lo-pad),hi:hi+pad};
}
function drawChart(){
 const S=[["pt","Prep tank","#19BDEB"],["ft","Feed tank","#F5A524"],["rt","RO tank","#00B8B0"]];
 const from=chartRange==="all"?0:Date.now()-(+chartRange)*86400000;
 const pts={};S.forEach(([k])=>{pts[k]=items.filter(e=>e.type===k&&e.f&&typeof e.f.v==="number"&&e.ts>=from).sort((a,b)=>a.ts-b.ts)});
 $("legend").innerHTML=S.map(([k,n])=>{const a=pts[k],e=a[a.length-1];return '<button type="button" class="lgi'+(chartOff[k]?" off":"")+(a.length?"":" none")+'" data-k="'+k+'"><i class="dot-'+k+'"></i>'+n+(e?" <b>"+e.f.v+"</b> ppm":" <em>no data</em>")+"</button>"}).join("");
 const vis=S.filter(([k])=>pts[k].length&&!chartOff[k]);
 const total=vis.reduce((s,[k])=>s+pts[k].length,0);
 $("chartSub").textContent=(chartRange==="all"?"All days":"Last "+chartRange+" days")+" \u00b7 "+total+(total===1?" reading":" readings");
 $("chartNote").textContent="";
 if(total<2){$("chart").innerHTML='<div class="empty">Not enough TDS readings in this range</div>';$("chartTip").hidden=true;return}
 $("chartTip").hidden=false;
 const hasLow=vis.some(([k])=>k!=="ft");
 const grp=k=>(k==="ft"&&hasLow)?"R":"L";
 const vals={L:[],R:[]},extra={L:[],R:[]};
 vis.forEach(([k])=>{const g=grp(k);pts[k].forEach(e=>vals[g].push(e.f.v));const L=limits[k]||{};[L.min,L.max].forEach(x=>{if(x!=null&&x!==""&&isFinite(+x))extra[g].push(+x)})});
 const rg={L:vals.L.length?robustRange(vals.L,extra.L):null,R:vals.R.length?robustRange(vals.R,extra.R):null};
 const W=Math.max(280,Math.min(760,$("chart").clientWidth||360)),H=Math.round(Math.max(200,Math.min(320,W*0.62)));
 const l=38,r=rg.R?44:12,t=18,b=26;
 const all=[].concat(...vis.map(([k])=>pts[k]));
 let t0=Math.min(...all.map(e=>e.ts)),t1=Math.max(...all.map(e=>e.ts));
 if(t1-t0<3600000){t0-=1800000;t1+=1800000}
 const X=ts=>l+(ts-t0)/(t1-t0)*(W-l-r);
 const Y=(g,v)=>{const s=rg[g],c=Math.min(Math.max(v,s.lo),s.hi);return t+(1-(c-s.lo)/(s.hi-s.lo))*(H-t-b)};
 let g='<text x="2" y="11">ppm</text>';
 if(rg.R)g+='<text x="'+(W-r+5)+'" y="11" fill="#F5A524" class="ax">Feed</text>';
 for(let i=0;i<=4;i++){
  const y=t+(1-i/4)*(H-t-b);
  g+='<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y+'" y2="'+y+'" class="grid"/><text x="'+(l-6)+'" y="'+(y+4)+'" text-anchor="end">'+Math.round(rg.L.lo+(rg.L.hi-rg.L.lo)*i/4)+"</text>";
  if(rg.R)g+='<text x="'+(W-r+5)+'" y="'+(y+4)+'" fill="#F5A524" class="ax">'+Math.round(rg.R.lo+(rg.R.hi-rg.R.lo)*i/4)+"</text>";
 }
 const span=t1-t0;
 for(let i=0;i<=3;i++){const ts=t0+span*i/3;g+='<text x="'+X(ts)+'" y="'+(H-8)+'" text-anchor="'+(i===0?"start":i===3?"end":"middle")+'">'+(span<=36*3600000?tOf(ts):new Date(ts).toLocaleDateString("en-US",{timeZone:TZ,month:"short",day:"numeric"}))+"</text>"}
 let s="",ext=0;
 vis.forEach(([k,n,c])=>{
  const gr=grp(k),sc=rg[gr],L=limits[k]||{};
  [L.min,L.max].forEach(x=>{if(x!=null&&x!==""&&isFinite(+x))s+='<line x1="'+l+'" x2="'+(W-r)+'" y1="'+Y(gr,+x)+'" y2="'+Y(gr,+x)+'" stroke="'+c+'" stroke-dasharray="5 4" opacity=".55"/>'});
  const inn=pts[k].filter(e=>e.f.v>=sc.lo&&e.f.v<=sc.hi);
  if(inn.length>1)s+='<polyline fill="none" stroke="'+c+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="'+inn.map(e=>X(e.ts).toFixed(1)+","+Y(gr,e.f.v).toFixed(1)).join(" ")+'"/>';
  pts[k].forEach(e=>{
   const out=e.f.v<sc.lo||e.f.v>sc.hi,bad=lim(k,e.f.v),cx=X(e.ts).toFixed(1),cy=Y(gr,e.f.v).toFixed(1),tip=n+" \u00b7 "+e.f.v+" ppm \u00b7 "+dlab(e.ts);
   if(out)ext++;
   s+='<circle class="pt-dot'+(out?" xt":"")+'" cx="'+cx+'" cy="'+cy+'" r="'+(out?5.5:4)+'" fill="'+(out?"none":bad?"#FF6B7A":c)+'" stroke="'+(out||bad?"#FF6B7A":"#10283A")+'" stroke-width="'+(out?2:1.5)+'"/><circle class="hit" cx="'+cx+'" cy="'+cy+'" r="13" data-tip="'+esc(tip)+'"><title>'+esc(tip)+"</title></circle>";
  });
 });
 if(ext)$("chartNote").textContent=ext+" reading"+(ext>1?"s":"")+" outside the chart scale (hollow red ring) \u2014 tap it to see the value";
 $("chart").innerHTML='<svg viewBox="0 0 '+W+" "+H+'" class="chart" role="img" aria-label="TDS trend">'+g+s+"</svg>";
}
$("chart").onclick=e=>{const c=e.target.closest(".hit");if(c)$("chartTip").textContent=c.dataset.tip};
$("chartRange").onclick=e=>{const b=e.target.closest("button");if(!b)return;chartRange=b.dataset.r;$("chartRange").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));$("chartTip").textContent=TIP0;drawChart()};
$("legend").onclick=e=>{const b=e.target.closest(".lgi");if(!b||b.classList.contains("none"))return;chartOff[b.dataset.k]=!chartOff[b.dataset.k];$("chartTip").textContent=TIP0;drawChart()};
window.addEventListener("resize",()=>{clearTimeout(rzT);rzT=setTimeout(drawChart,150)});
if("serviceWorker" in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(()=>{})});
function syncWhen(force){
 if(editing)return;
 const w=$("when");
 if(!force&&whenTouched)return;
 if(!force&&document.activeElement===w)return;
 const v=inputVal(Date.now());if(w.value!==v)w.value=v;
}
let hasTs=false;
function jwt(){try{const p=session.access.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(atob(p+"=".repeat((4-p.length%4)%4)))}catch(e){return {}}}
function isMe(){return !!session&&hasTs}
function toMin(t){if(!t)return null;const a=t.split(":");return (+a[0])*60+(+a[1])}
function spanMin(a,b){const x=toMin(a),y=toMin(b);if(x==null||y==null)return null;let d=y-x;if(d<0)d+=1440;return d}
function sdiff(a,b){const x=toMin(a),y=toMin(b);if(x==null||y==null)return null;return (((y-x+720)%1440)+1440)%1440-720}
function hm(m){if(m==null)return "\u2014";const s=m<0?"-":"";m=Math.abs(m);return s+Math.floor(m/60)+"h "+String(m%60).padStart(2,"0")+"m"}
function tsCalc(r){
 const w=spanMin(r.check_in,r.check_out),s=spanMin(r.sched_from,r.sched_to);
 return {w:w,s:s,diff:(w!=null&&s!=null)?w-s:null,late:sdiff(r.sched_from,r.check_in),early:sdiff(r.check_out,r.sched_to)};
}
function nowHM(){return inputVal(Date.now()).slice(11)}
function curMonth(){return dateISO(Date.now()).slice(0,7)}
function nextMonth(m){let a=m.split("-").map(Number),y=a[0],mo=a[1]+1;if(mo>12){mo=1;y++}return y+"-"+String(mo).padStart(2,"0")}
function prevMonth(m){let a=m.split("-").map(Number),y=a[0],mo=a[1]-1;if(mo<1){mo=12;y--}return y+"-"+String(mo).padStart(2,"0")}
function mlabel(m){return new Date(m+"-15T12:00:00Z").toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})}
function dlabel(d){return new Date(d+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"})}
function tsErrText(e,what){
 let m="";try{const o=JSON.parse(e.message);m=o.message||o.code||""}catch(x){m=String(e.message||"").slice(0,100)}
 const hint=e.status===404?" \u2014 the timesheet table is missing":(e.status===401||e.status===403)?" \u2014 the permission policy is missing or blocking you":"";
 return what+" ("+(e.status||"?")+(m?": "+m:"")+")"+hint;
}
function tsQSave(){try{localStorage.setItem("plantlog_tsq",JSON.stringify(tsQ))}catch(e){}}
function tsUpsert(rec){return api("POST","timesheet?on_conflict=user_id,day",rec,true,"resolution=merge-duplicates,return=minimal")}
async function tsSync(){
 if(!isMe())return;
 for(const d of Object.keys(tsQ)){
  try{await tsUpsert(tsQ[d]);delete tsQ[d];tsQSave()}catch(e){if(e.net)break}
 }
}
function tsAll(){
 const map={};tsRows.forEach(r=>{map[r.day]=r});
 Object.keys(tsQ).forEach(d=>{if(d.slice(0,7)===tsMonth)map[d]=Object.assign({},tsQ[d],{pending:true})});
 return Object.values(map).sort((a,b)=>a.day<b.day?-1:1);
}
async function tsLoad(){
 const m=tsMonth;
 try{
  await tsSync();
  tsRows=await api("GET","timesheet?select=*&day=gte."+m+"-01&day=lt."+nextMonth(m)+"-01&order=day.asc");
  $("tsNet").textContent="";
 }catch(e){
  $("tsNet").textContent=e.net?"Offline \u2014 showing saved days only":tsErrText(e,"Could not load the timesheet");
 }
 tsDraw();
}
function tsForm(){return {check_in:$("tsIn").value||null,check_out:$("tsOut").value||null,sched_from:$("tsSf").value||null,sched_to:$("tsSt").value||null}}
function tsResult(){
 const c=tsCalc(tsForm()),p=[];
 if(c.w!=null)p.push("<b>Worked: "+hm(c.w)+"</b>");else if($("tsIn").value&&!$("tsOut").value)p.push("No leaving time yet");
 if(c.s!=null)p.push("Shift: "+hm(c.s));
 if(c.diff!=null)p.push(c.diff>=0?"Extra: +"+hm(c.diff):"Short: "+hm(c.diff));
 if(c.late!=null&&$("tsIn").value)p.push(c.late>0?"Arrived "+hm(c.late)+" late":c.late<0?"Arrived "+hm(-c.late)+" early":"Arrived on time");
 if(c.early!=null&&$("tsOut").value)p.push(c.early>0?"Left "+hm(c.early)+" before shift end":c.early<0?"Stayed "+hm(-c.early)+" after shift end":"Left at shift end");
 $("tsRes").innerHTML=p.join("<br>");
}
function tsFill(day){
 const r=tsAll().find(x=>x.day===day)||{};
 let sc={};try{sc=JSON.parse(localStorage.getItem("plantlog_sched")||"{}")||{}}catch(e){}
 $("tsDay").value=day;
 $("tsIn").value=r.check_in||"";$("tsOut").value=r.check_out||"";
 $("tsSf").value=r.sched_from||sc.from||"";$("tsSt").value=r.sched_to||sc.to||"";
 $("tsBonus").value=r.bonus!=null?r.bonus:"";$("tsBN").value=r.bonus_note||"";$("tsNote").value=r.note||"";
 $("tsDel").hidden=!r.day;$("tsErr").textContent="";$("tsOk").textContent="";
 tsResult();
}
function tsDraw(){
 $("tsMonthLbl").textContent=mlabel(tsMonth);
 const rows=tsAll();let W=0,S=0,Wd=0,B=0,D=0;
 const html=rows.map(r=>{
  const c=tsCalc(r);
  if(c.w!=null){W+=c.w;D++}
  if(c.w!=null&&c.s!=null){S+=c.s;Wd+=c.w}
  if(r.bonus)B+=Number(r.bonus);
  return '<div class="tsrow" data-day="'+esc(r.day)+'"><div class="d">'+esc(dlabel(r.day))+(r.pending?" \u23f3":"")+'</div><div class="t">'+esc(r.check_in||"\u2014")+" \u2192 "+esc(r.check_out||"\u2014")+'</div><div class="w">'+hm(c.w)+'</div><div class="b">'+(r.bonus?esc("+"+r.bonus):"")+'</div></div>';
 }).join("");
 $("tsList").innerHTML=html||'<div class="empty">No days recorded in this month</div>';
 $("tsTotal").innerHTML=rows.length?"<b>"+D+" days \u00b7 "+hm(W)+"</b>"+(S?" \u00b7 shifts "+hm(S)+" \u00b7 difference "+(Wd-S>=0?"+":"")+hm(Wd-S):"")+(B?" \u00b7 bonus "+B:""):"";
 $("tsList").querySelectorAll(".tsrow").forEach(el=>{el.onclick=()=>tsFill(el.dataset.day)});
}
["tsIn","tsOut","tsSf","tsSt"].forEach(id=>{$(id).oninput=tsResult});
$("tsInNow").onclick=()=>{$("tsIn").value=nowHM();tsResult()};
$("tsOutNow").onclick=()=>{$("tsOut").value=nowHM();tsResult()};
$("tsBtn").onclick=()=>setView("time");
$("tsBack").onclick=()=>setView("main");
$("tsDay").onchange=async()=>{const d=$("tsDay").value;if(!d)return;if(d.slice(0,7)!==tsMonth){tsMonth=d.slice(0,7);await tsLoad()}tsFill(d)};
$("tsPrev").onclick=()=>{tsMonth=prevMonth(tsMonth);tsLoad()};
$("tsNext").onclick=()=>{tsMonth=nextMonth(tsMonth);tsLoad()};
$("tsSave").onclick=async()=>{
 const err=$("tsErr"),ok=$("tsOk");err.textContent="";ok.textContent="";
 const day=$("tsDay").value;if(!day){err.textContent="Pick a date";return}
 const b=num($("tsBonus").value);
 const rec={user_id:jwt().sub,day:day,check_in:$("tsIn").value||null,check_out:$("tsOut").value||null,sched_from:$("tsSf").value||null,sched_to:$("tsSt").value||null,bonus:isNaN(b)?null:b,bonus_note:$("tsBN").value.trim()||null,note:$("tsNote").value.trim()||null};
 try{localStorage.setItem("plantlog_sched",JSON.stringify({from:rec.sched_from,to:rec.sched_to}))}catch(e){}
 try{await tsUpsert(rec);delete tsQ[day];tsQSave();ok.textContent="Saved \u2713"}
 catch(e){
  if(e.net){tsQ[day]=rec;tsQSave();ok.textContent="Saved on this device \u2014 will sync when you are online"}
  else{err.textContent=tsErrText(e,"Could not save");return}
 }
 tsMonth=day.slice(0,7);await tsLoad();$("tsDel").hidden=!tsAll().some(x=>x.day===day);
};
let tsDelT=false;
$("tsDel").onclick=async()=>{
 const day=$("tsDay").value;
 if(!tsDelT){tsDelT=true;$("tsDel").textContent="Tap again to delete";setTimeout(()=>{tsDelT=false;$("tsDel").textContent="Delete this day"},3000);return}
 tsDelT=false;$("tsDel").textContent="Delete this day";
 delete tsQ[day];tsQSave();
 try{await api("DELETE","timesheet?day=eq."+encodeURIComponent(day));await tsLoad();tsFill(day)}
 catch(e){$("tsErr").textContent=e.net?"No connection. Deleting needs internet.":tsErrText(e,"Could not delete")}
};
$("tsXl").onclick=()=>exportTs();
async function exportTs(){
 const rows=tsAll();if(!rows.length)return;
 let W=0,B=0;
 const out=rows.map(r=>{
  const c=tsCalc(r);if(c.w!=null)W+=c.w;if(r.bonus)B+=Number(r.bonus);
  return {"Date":r.day,"Arrived":r.check_in||"","Left":r.check_out||"","Shift from":r.sched_from||"","Shift to":r.sched_to||"","Worked":c.w!=null?hm(c.w):"","Worked (hours)":c.w!=null?Math.round(c.w/6)/10:"","Shift":c.s!=null?hm(c.s):"","Difference":c.diff!=null?hm(c.diff):"","Bonus":r.bonus!=null?r.bonus:"","Bonus note":r.bonus_note||"","Note":r.note||""};
 });
 out.push({"Date":"TOTAL","Arrived":"","Left":"","Shift from":"","Shift to":"","Worked":hm(W),"Worked (hours)":Math.round(W/6)/10,"Shift":"","Difference":"","Bonus":B,"Bonus note":"","Note":""});
 const base="timesheet-"+tsMonth;
 if(typeof XLSX!=="undefined"){
  const ws=XLSX.utils.json_to_sheet(out);
  ws["!cols"]=Object.keys(out[0]).map(k=>({wch:k==="Note"||k==="Bonus note"?24:14}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Timesheet");
  const arr=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  await saveFile(base+".xlsx",new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 }else{
  const cols=Object.keys(out[0]);
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const csv=String.fromCharCode(65279)+[cols.map(q).join(",")].concat(out.map(r=>cols.map(c=>q(r[c])).join(","))).join(String.fromCharCode(10));
  await saveFile(base+".csv",new Blob([csv],{type:"text/csv"}));
 }
}
async function saveFile(name,blob){
 let dl=null;try{dl=await claude.use("downloads")}catch(e){}
 if(dl){try{await dl.save({filename:name,data:blob})}catch(e){}return}
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function dateISO(ts){return inputVal(ts).slice(0,10)}
async function exportXlsx(keys){
 const set=new Set(keys);
 const list=items.filter(e=>set.has(dateISO(e.ts))).sort((a,b)=>a.ts-b.ts);
 if(!list.length)return;
 const N={ts:"Transfer Start",te:"Transfer End",rs:"RO Start",rp:"RO Stop",pt:"Prep Tank TDS",ft:"Feed Tank TDS",rt:"RO Tank TDS",nt:"Note"};
 const rows=list.map(e=>{
  const f=e.f||{};
  const s=e.type==="te"?lastBefore("ts",e.ts):e.type==="rp"?lastBefore("rs",e.ts):null;
  return {"Date":dateISO(e.ts),"Time":tOf(e.ts),"Event":N[e.type]||e.type,"Volume (L)":f.vol??"","TDS (ppm)":f.tds??f.v??"","HTDS (ppm)":f.h??"","LTDS (ppm)":f.l??"","HTDS temp (°C)":f.ht??"","LTDS temp (°C)":f.lt??"","Duration (min)":s?Math.round((e.ts-s.ts)/60000):"","Note":f.why||f.txt||"","Message":e.msg};
 });
 const ks=[...set].sort();
 const base="plant-log-"+(ks.length===dayKeys().length?"all":ks.length===1?ks[0]:ks[0]+"_to_"+ks[ks.length-1]);
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
async function loadRole(){
 hasTs=false;
 try{
  let r;
  try{r=await api("GET","user_roles?select=role,timesheet")}
  catch(e){if(e.net)throw e;r=await api("GET","user_roles?select=role")}
  role=r&&r[0]?r[0].role:null;
  hasTs=!!(r&&r[0]&&r[0].timesheet);
 }catch(e){role=null}
}
function applyAuth(){
 canWrite=role==="editor";
 $("formCard").hidden=!canWrite;$("calcBtn").hidden=!canWrite;$("limBtn").hidden=!canWrite;
 $("roleBadge").textContent=canWrite?"Editor":"Viewer";
 $("tsBtn").hidden=!isMe();
 if(!canWrite||(!isMe()&&!$("timeView").hidden))setView("main");
 draw();
}
function stopPoll(){if(pollT){clearInterval(pollT);pollT=null}}
function signOut(msg){
 if(session){try{fetch(CFG.URL+"/auth/v1/logout?scope=local",{method:"POST",headers:{apikey:CFG.KEY,Authorization:"Bearer "+session.access}}).catch(()=>{})}catch(e){}}
 clearSession();role=null;hasTs=false;serverRows=[];limits={};merge();canWrite=false;stopPoll();
 try{localStorage.removeItem("plantlog_cache")}catch(e){}
 show("login");$("loginErr").textContent=msg||"";
}
async function enter(){
 await loadRole();
 if(role!=="viewer"&&role!=="editor"){signOut(role?"Your account has not been approved yet. Please contact the administrator.":"Could not verify your access. Check your connection and try again.");return}
 applyAuth();show("app");await load();stopPoll();pollT=setInterval(load,10000);
}
async function init(){
 var bt=document.getElementById("boot");if(bt)bt.hidden=true;
 drawForm();whenTouched=false;syncWhen(true);draw();
 $("when").addEventListener("input",()=>{whenTouched=true});
 setInterval(()=>syncWhen(),10000);
 setInterval(()=>{if(viewToday&&selDay!==dateISO(Date.now()))draw()},30000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncWhen()});
 window.addEventListener("focus",()=>syncWhen());
 window.addEventListener("pageshow",()=>syncWhen());
 try{tsQ=JSON.parse(localStorage.getItem("plantlog_tsq")||"{}")}catch(e){tsQ={}}
 $("loginBtn").onclick=async()=>{
  const er=$("loginErr");er.textContent="";
  try{
   const r=await authCall("password",{email:$("em").value.trim(),password:$("pw").value});
   if(!r.ok){er.textContent="Wrong email or password";return}
   setSession(await r.json());$("pw").value="";await enter();
  }catch(e){er.textContent="No connection. Try again."}
 };
 $("pw").onkeydown=e=>{if(e.key==="Enter")$("loginBtn").click()};
 $("logout").onclick=e=>{
  e.preventDefault();
  if(queue.length&&!outConfirm){outConfirm=true;$("logout").textContent=queue.length+" unsynced will be lost \u2014 tap again";setTimeout(()=>{outConfirm=false;$("logout").textContent="Log out"},4000);return}
  outConfirm=false;$("logout").textContent="Log out";
  queue=[];qSave();signOut("");
 };
 window.addEventListener("online",()=>{if(session)load()});
 db=true;qLoad();merge();
 try{session=JSON.parse(localStorage.getItem("plantlog_sess")||"null")}catch(e){session=null}
 if(!session){show("login");return}
 const ok=await refresh();
 if(ok===true){await enter();return}
 if(ok===null){
  const c=readCache();
  if(c&&c.role){role=c.role;hasTs=!!c.ts;serverRows=c.rows||[];limits=c.limits||{};merge();applyAuth();show("app");setConn(false,connText(false));stopPoll();pollT=setInterval(load,10000);return}
  show("login");$("loginErr").textContent="No connection. Try again when you are online.";return;
 }
 clearSession();show("login");
}
init();
