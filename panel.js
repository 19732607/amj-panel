/* Panel AMJ · Órdenes — versión en vivo.
   Solo lectura. Lee del servidor de producción con la cuenta de administración (RPC amj_admin_orders, la misma
   comprobación de administrador que el resto del panel de la app). No escribe nada en el servidor. */
(function(){
'use strict';
const SB='https://biwjrbcfupmbpoxnrolt.supabase.co', KEY='sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm';
const TZ='Europe/Madrid', POLL=15000, PAGE=100, MAXPAGES=5, STORE='amj.panel.session';
const $=id=>document.getElementById(id);
let session=null, O=[], prevRev={}, view='all', lastOk=0, timer=null, loading=false;

/* ---------- sesión ---------- */
function storage(){ try{ return localStorage.getItem(STORE)?localStorage:sessionStorage }catch(e){ return null } }
function saveSession(s,remember){ session=s; try{ (remember?localStorage:sessionStorage).setItem(STORE,JSON.stringify(s)); (remember?sessionStorage:localStorage).removeItem(STORE) }catch(e){} }
function loadSession(){ try{ const st=storage(); const v=st&&st.getItem(STORE); return v?JSON.parse(v):null }catch(e){ return null } }
function clearSession(){ session=null; try{ localStorage.removeItem(STORE); sessionStorage.removeItem(STORE) }catch(e){} }
async function auth(path,body){
  const r=await fetch(SB+'/auth/v1/'+path,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(j.error_description||j.msg||'AUTH'),{status:r.status}); return j;
}
function remembered(){ try{ return !!localStorage.getItem(STORE) }catch(e){ return false } }
async function refresh(){
  const j=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
  saveSession({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000,email:session.email},remembered());
}
async function rpc(name,args){
  if(!session) throw new Error('NO_SESSION');
  if(Date.now()>session.expires_at-120000) await refresh();
  let r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(r.status===401){ await refresh(); r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)}); }
  const txt=await r.text(); if(!r.ok){ const e=new Error(/ACCESS_DENIED/.test(txt)?'ACCESS_DENIED':'HTTP '+r.status); e.status=r.status; throw e }
  return JSON.parse(txt);
}

/* ---------- datos ---------- */
const STATUS={pending_review:['Pendiente de revisión','s-pending','new'],pending_assignment:['Pendiente de asignar','s-pending','new'],
 awaiting_technician:['Esperando al técnico','s-pending','pend'],rejected:['Rechazada: asigna otro','s-pending','pend'],coordinating:['Coordinando visita','s-pending','pend'],
 scheduled:['Visita confirmada','s-active','run'],on_way:['Técnico en camino','s-active','run'],in_progress:['Trabajo en curso','s-active','run'],
 materials_pending_approval:['Materiales por aprobar','s-active','run'],materials_approved:['Materiales aprobados','s-active','run'],materials_rejected:['Materiales rechazados','s-active','run'],
 completed:['Terminada','s-completed','done'],cancelled:['Cancelada','s-cancelled','canc']};
const dayOf=s=>s?new Date(s).toLocaleDateString('sv-SE',{timeZone:TZ}):'';
const todayStr=()=>new Date().toLocaleDateString('sv-SE',{timeZone:TZ});
function normalize(rows){
  return rows.map(r=>{
    const ds=(r.description||'').replace(/\s+/g,' ').trim(); const i=ds.indexOf(' | ');
    const piso=i>0?ds.slice(0,i):''; const work=i>0?ds.slice(i+3):ds;
    const pre=piso.split('-')[0].toUpperCase(); const cl=pre==='ENSO'||pre==='HELP'?pre:(r.customer_name||'Otro');
    const appt=r.confirmed_time||r.proposed_time||(r.preferred_date&&r.preferred_time?r.preferred_date+'T'+r.preferred_time+':00':null);
    const min=r.started_at&&r.finished_at?Math.round((new Date(r.finished_at)-new Date(r.started_at))/60000):null;
    const test=/PRUEBA|NO EJECUTAR|prueba autom/i.test(ds)||/^calle de prueba/i.test(r.address||'');
    return {id:r.id,ref:r.reference,rev:r.revision,st:r.status,sv:r.service||'',piso,work,ad:r.address||'',loc:r.locality||'',ct:r.confirmed_time,appt,
      ca:r.created_at,sa:r.started_at,fa:r.finished_at,tc:r.technician_name||'',cust:r.customer_name||'',cl,min,test,report:r.report||'',
      day:dayOf(r.confirmed_time||r.created_at)};
  });
}
function computeTags(){
  const now=Date.now(), byPiso={};
  O.forEach(o=>{ if(o.st!=='cancelled'&&o.piso){ (byPiso[o.piso+o.day]=byPiso[o.piso+o.day]||[]).push(o) } });
  O.forEach(o=>{ o.tags=[];
    if(o.test) o.tags.push(['test','Prueba']);
    const g=byPiso[o.piso+o.day]; if(g&&g.length>1&&o.st!=='cancelled') o.tags.push(['piso',g.length+' órdenes en este piso el mismo día']);
    if(o.min!==null&&o.min>=120) o.tags.push(['long','Más de 2 h de trabajo']);
    if(o.st==='cancelled'&&o.piso&&O.some(p=>p.piso===o.piso&&p.ref!==o.ref&&p.st!=='cancelled'&&Math.abs(new Date(p.ca)-new Date(o.ca))<864e5)) o.tags.push(['dup','Duplicada']);
    if(o.ct&&o.sa){ const late=(new Date(o.sa)-new Date(o.ct))/60000; if(late>=180) o.tags.push(['late','Empezó '+Math.round(late/60)+' h después de la cita']) }
    const grp=(STATUS[o.st]||[])[2];
    if(grp==='new'&&now-new Date(o.ca)>30*60000) o.tags.push(['wait','Sin técnico desde hace '+ago(o.ca)]);
    if(o.st==='rejected') o.tags.push(['wait','Rechazada: asigna otro técnico']);
    if(['awaiting_technician','coordinating','scheduled'].includes(o.st)&&o.ct&&now>new Date(o.ct).getTime()+30*60000) o.tags.push(['late','Cita pasada y sin empezar']);
    if(o.st==='in_progress'&&o.sa&&now-new Date(o.sa)>3*3600000) o.tags.push(['long','En curso desde hace '+ago(o.sa)+' (¿app abierta?)']);
  });
}
function ago(s){ const m=Math.round((Date.now()-new Date(s))/60000); return m<60?m+' min':(m<1440?Math.floor(m/60)+' h':Math.floor(m/1440)+' días') }
async function load(){
  if(loading||document.hidden) return; loading=true;
  try{
    let all=[], before=null;
    for(let p=0;p<MAXPAGES;p++){ const rows=await rpc('amj_admin_orders',{p_filter:'todas',p_before:before,p_limit:PAGE}); all=all.concat(rows);
      if(rows.length<PAGE) break; before=rows[rows.length-1].reference;
      const oldest=rows[rows.length-1].created_at; if(Date.now()-new Date(oldest)>45*864e5) break; }
    const fresh=normalize(all), changed=new Set();
    if(O.length) fresh.forEach(o=>{ if(prevRev[o.id]!==o.rev) changed.add(o.id) });
    prevRev={}; fresh.forEach(o=>prevRev[o.id]=o.rev); O=fresh; computeTags(); lastOk=Date.now(); $('err').hidden=true; render(changed); fillFilters();
  }catch(e){
    if(e.message==='ACCESS_DENIED'){ showErr('Esta cuenta no es de administración. Entra con la cuenta de administrador de AMJ.'); logout(); }
    else if(e.status===400||e.message==='NO_SESSION'){ logout(); }
    else showErr('Sin conexión con el servidor. Reintentando… (los datos de abajo pueden no estar al día)');
  }finally{ loading=false; liveLabel(); }
}
function showErr(m){ const e=$('err'); e.textContent=m; e.hidden=false }
function liveLabel(){ const l=$('live'), s=Math.round((Date.now()-lastOk)/1000);
  l.className='live'+(!lastOk?' off':(s>60?' stale':'')); $('livet').textContent=!lastOk?'Sin datos':(s<20?'En vivo · al día':'Actualizado hace '+(s<60?s+' s':Math.round(s/60)+' min')) }

/* ---------- pantalla ---------- */
const fmtT=s=>s?new Date(s).toLocaleString('es-ES',{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const dur=m=>m===null?'—':(m>=60?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'):m+' min');
const grp=o=>(STATUS[o.st]||[])[2];
const has=(o,k)=>o.tags.some(t=>t[0]===k);
const VIEWS=[['ACTIVAS',[['new','Sin técnico',o=>grp(o)==='new'],['pend','Esperando al técnico',o=>grp(o)==='pend'],['run','En curso',o=>grp(o)==='run']]],
 ['CERRADAS',[['done','Terminadas',o=>o.st==='completed'],['canc','Canceladas',o=>o.st==='cancelled']]],
 ['SEGUIMIENTO',[['alert','Con aviso',o=>o.tags.some(t=>t[0]!=='test')&&o.st!=='cancelled'],['piso','Varias en un piso',o=>has(o,'piso')],['long','Horas largas',o=>has(o,'long')],['late','Retrasos',o=>has(o,'late')],['dup','Duplicadas',o=>has(o,'dup')]]],
 ['',[['all','Todas',()=>true]]]];
const VF={}; VIEWS.forEach(g=>g[1].forEach(v=>VF[v[0]]=v[2]));
const visible=o=>$('fp').checked||!o.test;
function fillFilters(){ [['ft',O.map(o=>o.tc).filter(Boolean)],['fs',O.map(o=>o.sv).filter(Boolean)],['fc',O.map(o=>o.cl)]].forEach(([id,vals])=>{
  const sel=$(id), cur=sel.value, first=sel.options[0].text; sel.innerHTML=''; sel.add(new Option(first,''));
  [...new Set(vals)].sort().forEach(v=>sel.add(new Option(v==='HELP'?'HELPHOUSING':v,v))); sel.value=cur }) }
function filtered(){ const q=$('q').value.toLowerCase(), fd=$('fd').value, today=todayStr();
  return O.filter(o=>visible(o)&&VF[view](o)
   &&(!q||['AMJ-'+o.ref,o.piso,o.work,o.ad,o.tc,o.sv,o.cust].join(' ').toLowerCase().includes(q))
   &&(!$('fc').value||o.cl===$('fc').value)&&(!$('ft').value||o.tc===$('ft').value)&&(!$('fs').value||o.sv===$('fs').value)
   &&(!fd||(fd==='today'?o.day===today:(new Date(today)-new Date(o.day))/864e5<Number(fd)))) }
function el(tag,cls,text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e }
function render(changed){
  const base=O.filter(visible), cnt=k=>base.filter(VF[k]).length;
  const chips=$('chips'); chips.innerHTML='';
  [['new','sin técnico','c-new'],['pend','esperando técnico','c-pend'],['run','en curso','c-run'],['done','terminadas','c-done'],['alert','con aviso','c-alert']].forEach(([k,l,c])=>{
    const e=el('div','chip '+c); e.append(el('b',null,cnt(k)),l); e.onclick=()=>{view=k;render()}; chips.append(e) });
  const vw=$('views'); vw.innerHTML='';
  VIEWS.forEach(([h,vs])=>{ if(h) vw.append(el('h4',null,h)); vs.forEach(([k,l])=>{ const e=el('div','v'+(view===k?' on':''),l); e.append(el('span',null,cnt(k))); e.onclick=()=>{view=k;render()}; vw.append(e) }) });
  const tb=$('tb'); tb.innerHTML=''; const rows=filtered();
  if(!rows.length){ const tr=el('tr'), td=el('td','empty',lastOk?'No hay órdenes en esta vista ahora mismo.':'Cargando órdenes…'); td.colSpan=6; tr.append(td); tb.append(tr) }
  rows.forEach(o=>{ const tr=el('tr','r'+(changed&&changed.has(o.id)?' flash':'')); tr.onclick=()=>openDr(o);
    const c=()=>{ const td=el('td'); tr.append(td); return td };
    let td=c(); td.append(el('div','ref','AMJ-'+o.ref), el('span','cl cl-'+(o.cl==='ENSO'||o.cl==='HELP'?o.cl:'X'), o.cl==='HELP'?'HELPHOUSING':o.cl));
    td=c(); td.append(el('div','t1',o.work||'(sin descripción)'), el('div','t2',[o.piso,o.sv,o.ad].filter(Boolean).join(' · ')));
    if(o.tags.length){ const tg=el('div','tags'); o.tags.forEach(([k,l])=>tg.append(el('span','tag tg-'+k,l))); td.append(tg) }
    const s=STATUS[o.st]||[o.st,'s-active']; c().append(el('span','b '+s[1],s[0]));
    c().textContent=o.tc||'Sin asignar'; c().textContent=fmtT(o.appt); c().textContent=o.st==='in_progress'&&o.sa?'En curso · '+ago(o.sa):dur(o.min);
    tb.append(tr) });
}
function openDr(o){ const d=$('dr'); d.innerHTML=''; const h=el('div','dh');
  const x=el('button','x','×'); x.setAttribute('aria-label','Cerrar'); x.onclick=closeDr;
  const t=el('div',null,'AMJ-'+o.ref+(o.piso?' · '+o.piso:'')); t.style.cssText='font-size:12px;opacity:.8';
  const w=el('div',null,o.work||'(sin descripción)'); w.style.cssText='font-size:18px;font-weight:700;margin-top:4px'; h.append(x,t,w);
  const c=el('div','dc');
  [['Estado',(STATUS[o.st]||[o.st])[0]],['Cliente',o.cust||o.cl],['Servicio',o.sv],['Dirección',o.ad],['Técnico',o.tc||'Sin asignar'],['Creada',fmtT(o.ca)],['Cita',fmtT(o.appt)],['Inicio',fmtT(o.sa)],['Fin',fmtT(o.fa)],['Tiempo de trabajo',dur(o.min)]]
   .forEach(([k,v])=>{ const r=el('div','row'); r.append(el('span',null,k),el('span',null,v)); c.append(r) });
  if(o.tags.length){ const tg=el('div','tags'); tg.style.marginTop='12px'; o.tags.forEach(([k,l])=>tg.append(el('span','tag tg-'+k,l))); c.append(tg) }
  if(o.report){ const r=el('div','note'); r.style.whiteSpace='pre-wrap'; r.textContent='Informe del técnico:\n'+o.report; c.append(r) }
  c.append(el('div','note','Próximamente: fotos, materiales con tickets e importe a pagar. Las acciones (asignar, cancelar, ajustar horas) se hacen de momento desde la app.'));
  d.append(h,c); d.classList.add('open'); $('sh').classList.add('on') }
function closeDr(){ $('dr').classList.remove('open'); $('sh').classList.remove('on') }

/* ---------- arranque ---------- */
function start(){ $('login').hidden=true; $('app').hidden=false; load(); clearInterval(timer); timer=setInterval(()=>{ load(); liveLabel() },POLL) }
function logout(){ clearSession(); clearInterval(timer); O=[]; prevRev={}; lastOk=0; $('app').hidden=true; $('login').hidden=false }
$('lf').addEventListener('submit',async e=>{ e.preventDefault(); $('lerr').textContent=''; $('lb').disabled=true;
  try{ const em=$('le').value.trim().toLowerCase(); const j=await auth('token?grant_type=password',{email:em,password:$('lp').value});
    saveSession({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000,email:em},$('lr').checked); $('lp').value=''; start() }
  catch(err){ $('lerr').textContent=err.status===400?'Correo o contraseña incorrectos.':'No se pudo conectar. Inténtalo de nuevo.' }
  finally{ $('lb').disabled=false } });
$('logout').onclick=logout; $('sh').onclick=closeDr;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDr() });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&session) load() });
['q','fc','ft','fs','fd','fp'].forEach(id=>$(id).addEventListener('input',()=>render()));
session=loadSession(); if(session) start();
})();
