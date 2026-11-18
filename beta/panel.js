/* Panel AMJ · Órdenes — versión en vivo.
   Solo lectura. Lee del servidor de producción con la cuenta de administración (RPC amj_admin_orders, la misma
   comprobación de administrador que el resto del panel de la app). No escribe nada en el servidor. */
(function(){
'use strict';
const SB='https://biwjrbcfupmbpoxnrolt.supabase.co', KEY='sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm';
const TZ='Europe/Madrid', POLL=15000, PAGE=100, MAXPAGES=5, STORE='amj.panel.session';
const $=id=>document.getElementById(id);
let session=null, T=null, M=null, sec='ordenes', kpiDays=30, O=[], prevRev={}, view='all', lastOk=0, timer=null, loading=false;

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
      ca:r.created_at,sa:r.started_at,fa:r.finished_at,tc:r.technician_name||'',tid:r.technician_id||'',cust:r.customer_name||'',cl,min,test,report:r.report||'',
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
    const grp=(STATUS[o.st]||[])[2];
    if(grp==='new'&&now-new Date(o.ca)>30*60000) o.tags.push(['wait','Sin técnico desde hace '+ago(o.ca)]);
    if(o.st==='rejected') o.tags.push(['wait','Rechazada: asigna otro técnico']);
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
    prevRev={}; fresh.forEach(o=>prevRev[o.id]=o.rev); O=fresh; computeTags();
    try{ T=await rpc('amj_admin_technicians',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e }
    try{ M=await rpc('amj_admin_materials_pending',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e }
    lastOk=Date.now(); $('err').hidden=true; render(changed); fillFilters(); renderSec();
  }catch(e){
    if(e.message==='ACCESS_DENIED'){ showErr('Esta cuenta no es de administración. Entra con la cuenta de administrador de AMJ.'); logout(); }
    else if(e.status===400||e.message==='NO_SESSION'){ logout(); }
    else showErr('Sin conexión con el servidor. Reintentando… (los datos de abajo pueden no estar al día)');
  }finally{ loading=false; liveLabel(); }
}
function showErr(m){ const e=$('err'); e.textContent=m; e.hidden=false }
function liveLabel(){ const s=Math.round((Date.now()-lastOk)/1000);
  [['live','livet'],['live2','livet2']].forEach(([a,b])=>{ $(a).className='live'+(!lastOk?' off':(s>60?' stale':'')); $(b).textContent=!lastOk?'Sin datos':(s<20?'En vivo · al día':'Actualizado hace '+(s<60?s+' s':Math.round(s/60)+' min')) }) }

/* ---------- pantalla ---------- */
const fmtT=s=>s?new Date(s).toLocaleString('es-ES',{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const dur=m=>m===null?'—':(m>=60?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'):m+' min');
const grp=o=>(STATUS[o.st]||[])[2];
const has=(o,k)=>o.tags.some(t=>t[0]===k);
const VIEWS=[['ACTIVAS',[['new','Sin técnico',o=>grp(o)==='new'],['pend','Esperando al técnico',o=>grp(o)==='pend'],['run','En curso',o=>grp(o)==='run']]],
 ['CERRADAS',[['done','Terminadas',o=>o.st==='completed'],['canc','Canceladas',o=>o.st==='cancelled']]],
 ['SEGUIMIENTO',[['alert','Con aviso',o=>o.tags.some(t=>t[0]!=='test')&&o.st!=='cancelled'],['piso','Varias en un piso',o=>has(o,'piso')],['long','Horas largas',o=>has(o,'long')],['dup','Duplicadas',o=>has(o,'dup')]]],
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

/* ---------- secciones (solo datos reales del servidor; nada inventado) ---------- */
const real=()=>O.filter(o=>!o.test);
const daysAgo=s=>s?(Date.now()-new Date(s))/864e5:Infinity;
const fmtD=s=>s?new Date(s).toLocaleDateString('es-ES',{timeZone:TZ,day:'2-digit',month:'2-digit'}):'—';
const clName=c=>c==='HELP'?'HELPHOUSING':c;
function kpis(list){ const w=el('div','kp'); list.forEach(([v,l])=>{ const k=el('div','k'); k.append(el('b',null,v),el('span',null,l)); w.append(k) }); return w }
function card(title,head,rows,emptyTxt){ const c=el('div','card'); c.append(el('h3',null,title));
  const tb=el('table'), th=el('tr'); head.forEach(h=>th.append(el('th',null,h))); const thead=el('thead'); thead.append(th); tb.append(thead);
  const body=el('tbody'); if(!rows.length){ const tr=el('tr'),td=el('td','empty',emptyTxt||'Sin datos'); td.colSpan=head.length; tr.append(td); body.append(tr) }
  rows.forEach(r=>{ const tr=el('tr'); if(r.onclick){ tr.className='r'; tr.onclick=r.onclick } (r.cells||r).forEach(v=>{ const td=el('td'); if(v instanceof Node) td.append(v); else td.textContent=v==null?'—':v; tr.append(td) }); body.append(tr) });
  tb.append(body); c.append(tb); return c }
const badge=(txt,cls)=>el('span','b '+cls,txt);
const statusBadge=o=>{ const s=STATUS[o.st]||[o.st,'s-active']; return badge(s[0],s[1]) };
const src=t=>el('div','src',t);
const RANGE='Datos de las órdenes cargadas (últimos 45 días), sin órdenes de prueba.';

const SECS={
 hoy:['Hoy por zona',()=>{ const today=todayStr();
   const L=real().filter(o=>o.st!=='cancelled'&&(o.day===today||dayOf(o.appt)===today||dayOf(o.sa)===today||dayOf(o.fa)===today||['on_way','in_progress'].includes(o.st)));
   const out=[kpis([[L.length,'órdenes de hoy'],[L.filter(o=>['on_way','in_progress'].includes(o.st)).length,'en camino o trabajando'],[L.filter(o=>o.st==='completed').length,'terminadas hoy'],[L.filter(o=>grp(o)==='new').length,'sin técnico']]),
     src('El mapa necesita las coordenadas de cada orden, que hoy el servidor no da al panel. Mientras tanto, las órdenes de hoy agrupadas por localidad.')];
   const byLoc={}; L.forEach(o=>{ const k=o.loc||'(sin localidad)'; (byLoc[k]=byLoc[k]||[]).push(o) });
   if(!L.length) out.push(card('Hoy',['Orden'],[], 'No hay órdenes para hoy.'));
   Object.keys(byLoc).sort().forEach(k=>out.push(card(k+' · '+byLoc[k].length,['Orden','Trabajo','Estado','Técnico','Cita'],
     byLoc[k].map(o=>({cells:['AMJ-'+o.ref+' · '+clName(o.cl),o.work+(o.piso?' ('+o.piso+')':''),statusBadge(o),o.tc||'Sin asignar',fmtT(o.appt)],onclick:()=>openDr(o)})))));
   return out }],
 tecnicos:['Técnicos',()=>{ const R=real(), list=(T||[]).filter(t=>!/prueba|NO ASIGNAR/i.test(t.name));
   const rows=list.map(t=>{ const mine=R.filter(o=>o.tid===t.id), done30=mine.filter(o=>o.st==='completed'&&daysAgo(o.fa)<=30);
     const mins=done30.reduce((a,o)=>a+(o.min||0),0), last=mine.filter(o=>o.fa).sort((a,b)=>new Date(b.fa)-new Date(a.fa))[0], now=mine.find(o=>o.st==='in_progress');
     const nm=el('div'); nm.append(el('div','t1',t.name),el('div','t2',t.email||'')); return [nm,badge(t.available?'Disponible':'No disponible',t.available?'ok':'no'),t.open_orders,now?'AMJ-'+now.ref+' · '+ago(now.sa):'—',done30.length,dur(mins||null),last?fmtD(last.fa):'—'] });
   return [kpis([[list.length,'técnicos aprobados'],[list.filter(t=>t.available).length,'disponibles ahora'],[list.reduce((a,t)=>a+Number(t.open_orders||0),0),'órdenes abiertas asignadas'],[R.filter(o=>o.st==='in_progress').length,'trabajando ahora']]),
     src('Técnicos aprobados en el servidor (sin cuentas de prueba ni de revisión de Google Play). Horas = cronómetro de la app en órdenes terminadas los últimos 30 días (sin los ajustes de horas que hace AMJ).'),
     card('Equipo',['Técnico','Estado','Abiertas','Trabajando ahora','Terminadas 30 días','Horas 30 días','Último trabajo'],rows,T?'No hay técnicos aprobados.':'Cargando…')] }],
 clientes:['Clientes e inmuebles',()=>{ const R=real().filter(o=>o.st!=='cancelled'), byCl={};
   R.forEach(o=>{ (byCl[o.cl]=byCl[o.cl]||[]).push(o) });
   const out=[kpis(Object.keys(byCl).sort().map(c=>[byCl[c].length,'órdenes '+clName(c)])),src(RANGE)];
   Object.keys(byCl).sort().forEach(c=>{ const byP={}; byCl[c].forEach(o=>{ const k=o.piso||o.ad||'(sin piso)'; (byP[k]=byP[k]||[]).push(o) });
     const rows=Object.keys(byP).map(k=>{ const L=byP[k], last=L.map(o=>o.fa||o.ca).sort().pop();
       return {n:L.length,cells:[k,L.length,L.filter(o=>o.st==='completed').length,L.filter(o=>o.st!=='completed').length,dur(L.reduce((a,o)=>a+(o.min||0),0)||null),fmtD(last)]} }).sort((a,b)=>b.n-a.n);
     out.push(card(clName(c)+' · '+Object.keys(byP).length+' inmuebles',['Piso / dirección','Órdenes','Terminadas','Abiertas','Horas','Última'],rows)) });
   return out }],
 pagos:['Pagos a técnicos',()=>[ (()=>{ const n=el('div','banner'); n.textContent='Esta sección necesita dos datos que el panel todavía no puede leer: (1) las horas a pagar de cada orden con los ajustes de AMJ y la tarifa de cada técnico, que están en el servidor pero sin lectura para el panel, y (2) qué está ya pagado, que está en Airtable (Liquidaciones de técnicos). Para mostrarlo con datos reales hace falta una consulta de solo lectura nueva en el servidor, y eso necesita tu permiso. Hasta entonces no se muestra ninguna cifra, para no enseñarte importes inventados.'; return n })() ]],
 materiales:['Materiales y tickets',()=>{ const rc=(M&&M.receipts)||[], od=(M&&M.orders)||[];
   return [kpis([[rc.length,'tickets por revisar'],[od.length,'órdenes con materiales pendientes de AMJ']]),
     src('Datos en vivo del servidor: tickets que la IA no pudo validar y órdenes terminadas cuyos materiales esperan decisión de AMJ. La revisión se hace en la app.'),
     card('Tickets por revisar',['Orden','Técnico','Proveedor','Fecha ticket','Total','Motivo'],rc.map(r=>['AMJ-'+r.reference,r.technician||'—',r.vendor_name||'—',r.receipt_date?fmtD(r.receipt_date):'—',r.total!=null?Number(r.total).toFixed(2)+' €':'—',(r.issues||[]).join(', ')||'—']),'No hay tickets pendientes de revisar.'),
     card('Órdenes con materiales pendientes de AMJ',['Orden','Técnico','Terminada','Motivo'],od.map(x=>['AMJ-'+x.reference,x.technician||'—',fmtD(x.finished_at),({NO_RECEIPT:'Sin ticket',NO_QUOTE:'Sin presupuesto de materiales',EXCEEDS_QUOTE:'Ticket supera lo presupuestado',RECEIPTS_PENDING:'Ticket por revisar'})[(x.materials_state||{}).reason]||(x.materials_state||{}).reason||'—']),'No hay órdenes pendientes.'),
     src('El histórico de tickets aprobados y rechazados no está disponible para el panel (necesita una consulta de solo lectura nueva en el servidor).')] }],
 kpi:['KPI',()=>{ const R=real().filter(o=>daysAgo(o.ca)<=kpiDays), done=R.filter(o=>o.st==='completed'), canc=R.filter(o=>o.st==='cancelled');
   const mins=done.filter(o=>o.min!==null).map(o=>o.min), avg=mins.length?Math.round(mins.reduce((a,b)=>a+b,0)/mins.length):null;
   const waits=done.filter(o=>o.sa).map(o=>(new Date(o.sa)-new Date(o.ca))/36e5).sort((a,b)=>a-b), med=waits.length?waits[Math.floor(waits.length/2)]:null;
   const seg=el('div','seg'); [[7,'7 días'],[30,'30 días'],[45,'45 días']].forEach(([d,l])=>{ const b=el('button',kpiDays===d?'on':'',l); b.onclick=()=>{kpiDays=d;renderSec()}; seg.append(b) });
   const group=(key,label)=>{ const g={}; R.filter(o=>o.st!=='cancelled').forEach(o=>{ const k=key(o)||'—'; g[k]=g[k]||{n:0,d:0,m:0}; g[k].n++; if(o.st==='completed'){g[k].d++; g[k].m+=o.min||0} });
     const max=Math.max(1,...Object.values(g).map(x=>x.n));
     return card(label,[(s=>s[0].toUpperCase()+s.slice(1))(label.replace('Por ','')),'Órdenes','','Terminadas','Horas'],Object.entries(g).sort((a,b)=>b[1].n-a[1].n).map(([k,x])=>{ const b=el('div','bar'); b.style.width=Math.round(100*x.n/max)+'%'; return [k==='HELP'?'HELPHOUSING':k,x.n,b,x.d,dur(x.m||null)] })) };
   return [seg,kpis([[R.length,'órdenes creadas'],[done.length,'terminadas'],[canc.length,'canceladas'],[done.length+canc.length?Math.round(100*done.length/(done.length+canc.length))+' %':'—','terminadas sobre cerradas'],[dur(avg),'tiempo medio de trabajo'],[med===null?'—':(med<24?med.toFixed(1)+' h':(med/24).toFixed(1)+' días'),'mediana: de creada a empezada']]),
     src('Órdenes creadas en los últimos '+kpiDays+' días, sin pruebas. Tiempo de trabajo = cronómetro de la app.'),
     group(o=>o.cl,'Por cliente'),group(o=>o.tc||'Sin asignar','Por técnico'),group(o=>o.sv,'Por servicio')] }],
 alertas:['Alertas',()=>{ const A=real().filter(o=>o.st!=='cancelled'&&o.tags.some(t=>t[0]!=='test'));
   const by={}; A.forEach(o=>o.tags.filter(t=>t[0]!=='test').forEach(t=>{ const k=t[0]; (by[k]=by[k]||[]).push([o,t[1]]) }));
   const names={wait:'Sin técnico o rechazadas',long:'Horas largas',piso:'Varias órdenes en un piso el mismo día',dup:'Duplicadas'};
   const out=[kpis(Object.keys(names).map(k=>[(by[k]||[]).length,names[k].toLowerCase()])),src('Avisos calculados con las órdenes reales cargadas. No hay avisos por la hora de la cita (la hora es orientativa).')];
   Object.keys(names).forEach(k=>{ if(by[k]) out.push(card(names[k],['Orden','Trabajo','Técnico','Aviso'],by[k].map(([o,l])=>({cells:['AMJ-'+o.ref+' · '+clName(o.cl),o.work,o.tc||'Sin asignar',l],onclick:()=>openDr(o)})))) });
   if(!A.length) out.push(card('Alertas',['Orden'],[],'No hay alertas ahora mismo.'));
   return out }]
};
function renderSec(){
  const n=real().filter(o=>o.st!=='cancelled'&&o.tags.some(t=>t[0]!=='test')).length; $('alertn').textContent=n?String(n):'';
  const isO=sec==='ordenes'; $('sec-ordenes').hidden=!isO; $('sec-other').hidden=isO; if(isO) return;
  const [title,fn]=SECS[sec]; $('otitle').textContent=title; const b=$('obody'); b.innerHTML='';
  if(!lastOk){ b.append(el('div','empty','Cargando datos del servidor…')); return }
  fn().forEach(x=>b.append(x));
}

/* ---------- arranque ---------- */
function start(){ $('login').hidden=true; $('app').hidden=false; load(); clearInterval(timer); timer=setInterval(()=>{ load(); liveLabel() },POLL) }
function logout(){ clearSession(); clearInterval(timer); O=[]; prevRev={}; lastOk=0; $('app').hidden=true; $('login').hidden=false }
$('lf').addEventListener('submit',async e=>{ e.preventDefault(); $('lerr').textContent=''; $('lb').disabled=true;
  try{ const em=$('le').value.trim().toLowerCase(); const j=await auth('token?grant_type=password',{email:em,password:$('lp').value});
    saveSession({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000,email:em},$('lr').checked); $('lp').value=''; start() }
  catch(err){ $('lerr').textContent=err.status===400?'Correo o contraseña incorrectos.':'No se pudo conectar. Inténtalo de nuevo.' }
  finally{ $('lb').disabled=false } });
$('logout').onclick=logout; $('logout2').onclick=logout;
document.querySelectorAll('.nav[data-sec]').forEach(n=>n.onclick=()=>{ sec=n.dataset.sec; document.querySelectorAll('.nav[data-sec]').forEach(x=>x.classList.toggle('on',x===n)); renderSec() }); $('sh').onclick=closeDr;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDr() });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&session) load() });
['q','fc','ft','fs','fd','fp'].forEach(id=>$(id).addEventListener('input',()=>render()));
session=loadSession(); if(session) start();
})();
