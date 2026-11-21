/* Panel AMJ · Órdenes — versión en vivo.
   Solo lectura. Lee del servidor de producción con la cuenta de administración (RPC amj_admin_orders, la misma
   comprobación de administrador que el resto del panel de la app). No escribe nada en el servidor. */
(function(){
'use strict';
const SB='https://biwjrbcfupmbpoxnrolt.supabase.co', KEY='sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm';
const TZ='Europe/Madrid', POLL=15000, PAGE=100, MAXPAGES=200, STORE='amj.panel.session';
const $=id=>document.getElementById(id);
let session=null, WARN='', TEST=new Set(), T=null, M=null, P=null, RH=null, payT='', sec='ordenes', kpiDays='all', kpiFrom='', kpiTo='', RV=null, CP=null, O=[], prevRev={}, view='all', lastOk=0, timer=null, loading=false;

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
    const test=TEST.has(r.id)||/PRUEBA|NO EJECUTAR|prueba autom/i.test(ds)||/^calle de prueba/i.test(r.address||'')||/prueba|NO ASIGNAR/i.test(r.technician_name||'');
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
    TEST=new Set(await rpc('amj_admin_test_orders',{})); /* obligatoria: si falla, falla toda la carga y no se muestran cifras nuevas */
    let all=[], before=null;
    let complete=false;
    for(let p=0;p<MAXPAGES;p++){ const rows=await rpc('amj_admin_orders',{p_filter:'todas',p_before:before,p_limit:PAGE}); all=all.concat(rows);
      if(rows.length<PAGE){ complete=true; break } before=rows[rows.length-1].reference;
    }
    WARN=complete?'':'ATENCIÓN: hay más de '+(MAXPAGES*PAGE)+' órdenes y el panel no las ha cargado todas. Las cifras están incompletas: avisa a soporte.';
    const fresh=normalize(all), changed=new Set();
    if(O.length) fresh.forEach(o=>{ if(prevRev[o.id]!==o.rev) changed.add(o.id) });
    prevRev={}; fresh.forEach(o=>prevRev[o.id]=o.rev); O=fresh; computeTags();
    try{ T=await rpc('amj_admin_technicians',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e }
    try{ M=await rpc('amj_admin_materials_pending',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e }
    try{ RV=await rpc('amj_admin_reviews',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e }
    if(sec==='clientes'||CP===null){ try{ CP=await rpc('amj_client_properties',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e } }
    if(sec==='pagos'||P===null){ try{ P=await rpc('amj_admin_payouts',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e } }
    if(sec==='materiales'||RH===null){ try{ RH=await rpc('amj_admin_receipts_history',{p_days:60}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e } }
    lastOk=Date.now(); if(WARN) showErr(WARN); else $('err').hidden=true; render(changed); fillFilters(); renderSec();
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

/* ---------- gráficos (SVG propio, sin librerías externas) ---------- */
const PAL=['#13385f','#1bb3d9','#16a36a','#e0a100','#d33','#7b5cd6','#0b7593','#b0581b','#556070','#c2185b'];
const NS='http://www.w3.org/2000/svg';
function sv(tag,attrs,txt){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(txt!=null) e.textContent=txt; return e }
function chartCard(title){ const c=el('div','card'); c.style.marginTop='14px'; c.append(el('h3',null,title)); const b=el('div'); b.style.padding='12px 14px'; c.append(b); return [c,b] }
function legend(items){ const l=el('div'); l.style.cssText='display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:6px'; items.forEach(([n,c])=>{ const s=el('span'); s.innerHTML=''; const d=el('span'); d.style.cssText='display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;background:'+c; s.append(d,n); l.append(s) }); return l }
function lineChart(title,days,series){
  const [c,b]=chartCard(title); const keys=Object.keys(days).sort();
  if(!keys.length){ b.append(el('div','empty','Sin datos en el periodo.')); return c }
  // rellenar días sin datos
  const all=[]; for(let d=new Date(keys[0]+'T12:00:00Z'); d<=new Date(keys[keys.length-1]+'T12:00:00Z'); d=new Date(d.getTime()+864e5)) all.push(d.toISOString().slice(0,10));
  const W=1000,H=240,L=34,Bm=26,T=10, max=Math.max(1,...all.map(k=>Math.max(...series.map(([s])=>(days[k]||{})[s]||0))));
  const x=i=>L+(all.length===1?0:(i*(W-L-10)/(all.length-1))), y=v=>T+(H-T-Bm)*(1-v/max);
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`,width:'100%',style:'display:block'});
  for(let g=0;g<=4;g++){ const v=Math.round(max*g/4); svg.append(sv('line',{x1:L,x2:W-10,y1:y(v),y2:y(v),stroke:'#e3e8ef'}), sv('text',{x:L-6,y:y(v)+4,'text-anchor':'end','font-size':10,fill:'#6b7686'},v)) }
  const step=Math.max(1,Math.ceil(all.length/14)); all.forEach((k,i)=>{ if(i%step===0) svg.append(sv('text',{x:x(i),y:H-8,'text-anchor':'middle','font-size':10,fill:'#6b7686'},new Date(k+'T12:00:00Z').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}))) });
  series.forEach(([s,,col])=>{ svg.append(sv('polyline',{points:all.map((k,i)=>x(i)+','+y((days[k]||{})[s]||0)).join(' '),fill:'none',stroke:col,'stroke-width':2,'stroke-linejoin':'round'})) });
  all.forEach((k,i)=>{ const r=sv('rect',{x:x(i)-(W/all.length)/2,y:T,width:W/all.length,height:H-T-Bm,fill:'transparent'}); r.append(sv('title',{},new Date(k+'T12:00:00Z').toLocaleDateString('es-ES')+' · '+series.map(([s,n])=>n+': '+((days[k]||{})[s]||0)).join(' · '))); svg.append(r) });
  b.append(legend(series.map(([,n,col])=>[n,col])),svg); return c }
function donut(title,entries){
  const [c,b]=chartCard(title); c.style.marginTop='0'; const tot=entries.reduce((a,[,v])=>a+v,0);
  if(!tot){ b.append(el('div','empty','Sin datos en el periodo.')); return c }
  const svg=sv('svg',{viewBox:'0 0 200 200',width:'180',height:'180',style:'display:block;margin:0 auto'}); let a0=-Math.PI/2;
  entries.forEach(([k,v],i)=>{ const a1=a0+2*Math.PI*v/tot, large=a1-a0>Math.PI?1:0, R=90,r=58;
    const p=(ang,rad)=>[100+rad*Math.cos(ang),100+rad*Math.sin(ang)];
    const [x0,y0]=p(a0,R),[x1,y1]=p(a1,R),[x2,y2]=p(a1,r),[x3,y3]=p(a0,r);
    const path=entries.length===1?`M100 10 A90 90 0 1 1 99.99 10 L99.99 42 A58 58 0 1 0 100 42 Z`:`M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
    const s=sv('path',{d:path,fill:PAL[i%PAL.length],stroke:'#fff','stroke-width':2}); s.append(sv('title',{},k+': '+v)); svg.append(s); a0=a1 });
  svg.append(sv('text',{x:100,y:100,'text-anchor':'middle','font-size':30,'font-weight':700,fill:'#1b2533'},tot),sv('text',{x:100,y:120,'text-anchor':'middle','font-size':11,fill:'#6b7686'},'órdenes'));
  const lg=el('div'); lg.style.cssText='margin-top:10px;font-size:12.5px';
  entries.forEach(([k,v],i)=>{ const r=el('div'); r.style.cssText='display:flex;justify-content:space-between;padding:3px 0'; const n=el('span'); const d=el('span'); d.style.cssText='display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:'+PAL[i%PAL.length]; n.append(d,k); r.append(n,el('span',null,v+' · '+Math.round(100*v/tot)+' %')); lg.append(r) });
  b.append(svg,lg); return c }
function barChart(title,byT){
  const [c,b]=chartCard(title); const rows=Object.entries(byT).sort((a,b)=>(b[1].a+b[1].r+b[1].x)-(a[1].a+a[1].r+a[1].x));
  if(!rows.length){ b.append(el('div','empty','Sin datos en el periodo.')); return c }
  const max=Math.max(...rows.map(([,g])=>g.a+g.r+g.x)); b.append(legend([['Activas','#e0a100'],['Resueltas','#16a36a'],['Canceladas','#d33']]));
  rows.forEach(([k,g])=>{ const r=el('div'); r.style.cssText='display:grid;grid-template-columns:170px 1fr 170px;gap:10px;align-items:center;padding:5px 0;font-size:13px';
    const bar=el('div'); bar.style.cssText='display:flex;height:16px;border-radius:4px;overflow:hidden;background:#f0f3f7';
    [['a','#e0a100'],['r','#16a36a'],['x','#d33']].forEach(([s,col])=>{ if(g[s]){ const p=el('div'); p.style.cssText=`width:${100*g[s]/max}%;background:${col}`; p.title=g[s]; bar.append(p) } });
    r.append(el('span',null,k),bar,el('span',null,g.r+' resueltas · '+g.a+' activas · '+g.x+' canc. · '+(g.m?dur(g.m):'0 h'))); b.append(r) });
  return c }

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
const eur=v=>Number(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const RANGE='Todas las órdenes reales del servidor, sin órdenes de prueba.';

const SECS={
 hoy:['Hoy por zona',()=>{ const today=todayStr();
   const L=real().filter(o=>o.st!=='cancelled'&&(o.day===today||dayOf(o.ca)===today||dayOf(o.appt)===today||dayOf(o.sa)===today||dayOf(o.fa)===today||['on_way','in_progress'].includes(o.st)));
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
 clientes:['Clientes e inmuebles',()=>{ const R=real().filter(o=>o.st!=='cancelled');
   const city=v=>{ v=(v||'').trim(); return v?v.toLowerCase().replace(/(^|[\s-])\S/g,m=>m.toUpperCase()):'(sin ciudad)' };
   const G={}, idx={}, grpOf=(cl,ci)=>{ const k=cl+'|'+ci; return G[k]=G[k]||{cl,ci,props:{}} };
   (CP||[]).forEach(a=>{ const code=a.client_code+'-'+a.code, ci=city(a.locality); const p={code,ad:a.address||'',ci,L:[]}; grpOf(a.client_code,ci).props[code]=p; idx[code.toUpperCase()]=p });
   R.forEach(o=>{ const k=(o.piso||o.ad||'(sin piso)'); let p=idx[k.toUpperCase()];
     if(!p){ const ci=city(o.loc); p={code:o.piso||'',ad:o.piso?(o.ad||''):k,ci,L:[]}; grpOf(o.cl,ci).props[k]=p; idx[k.toUpperCase()]=p }
     p.L.push(o) });
   const byCl={}; R.forEach(o=>{ byCl[o.cl]=(byCl[o.cl]||0)+1 });
   const out=[kpis(Object.keys(byCl).sort().map(c=>[byCl[c],'órdenes '+clName(c)]).concat([[Object.keys(idx).length,'inmuebles en total']])),
     src(RANGE+' Inmuebles: listado de pisos de cada cliente guardado en el servidor; aparecen todos, también los que todavía no tienen órdenes.'+(CP===null?' (Cargando el listado de inmuebles…)':''))];
   Object.values(G).sort((x,y)=>clName(x.cl).localeCompare(clName(y.cl))||x.ci.localeCompare(y.ci)).forEach(g=>{
     const P_=Object.values(g.props), conOrd=P_.filter(p=>p.L.length).length;
     const rows=P_.map(p=>{ const L=p.L, last=L.map(o=>o.fa||o.ca).sort().pop();
       return {n:L.length,c:p.code||p.ad,cells:[p.code||'—',p.ad||'—',p.ci,L.length,L.filter(o=>o.st==='completed').length,L.filter(o=>o.st!=='completed').length,L.length?dur(L.reduce((a,o)=>a+(o.min||0),0)||null):'—',L.length?fmtD(last):'—']} })
       .sort((a,b)=>b.n-a.n||a.c.localeCompare(b.c));
     out.push(card(clName(g.cl)+' · '+g.ci+' · '+P_.length+(P_.length===1?' inmueble':' inmuebles')+' · '+conOrd+' con órdenes',['Piso','Dirección','Ciudad','Órdenes','Terminadas','Abiertas','Horas','Última'],rows)) });
   return out }],
 pagos:['Pagos a técnicos',()=>{
   if(!P) return [el('div','empty','Cargando pagos…')];
   const rows=P.filter(x=>!/prueba|NO ASIGNAR/i.test(x.technician||'')).map(x=>{ const lt=x.labor_total==null?null:Number(x.labor_total), mt=x.materials_total==null?null:Number(x.materials_total);
     const lp=Number(x.labor_paid||0), mp=Number(x.materials_paid||0);
     return {...x, lt, mt, lp, mp, gen:(lt||0)+(mt||0), paid:lp+mp, pend:Math.max((lt||0)-lp,0)+Math.max((mt||0)-mp,0)} });
   const byT={}; rows.forEach(r=>{ const k=r.technician||'(sin técnico)'; const g=byT[k]=byT[k]||{n:0,gen:0,paid:0,pend:0,mpend:0,last:null}; g.n++; g.gen+=r.gen; g.paid+=r.paid; g.pend+=r.pend; if(r.mt===null&&r.materials_needs_amj) g.mpend++; if(r.last_paid_at&&(!g.last||r.last_paid_at>g.last)) g.last=r.last_paid_at });
   const tot=rows.reduce((a,r)=>({gen:a.gen+r.gen,paid:a.paid+r.paid,pend:a.pend+r.pend}),{gen:0,paid:0,pend:0});
   const sel=el('select'); sel.style.cssText='border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit;margin-bottom:12px';
   sel.add(new Option('Todos los técnicos','')); Object.keys(byT).sort().forEach(k=>sel.add(new Option(k,k))); sel.value=payT; sel.onchange=()=>{payT=sel.value;renderSec()};
   const detail=rows.filter(r=>!payT||r.technician===payT);
   return [kpis([[eur(tot.gen),'generado (IVA incluido)'],[eur(tot.paid),'pagado'],[eur(tot.pend),'pendiente de pagar'],[rows.filter(r=>r.pend>0.004).length,'órdenes con importe pendiente']]),
     src('Órdenes terminadas (sin pruebas). Mano de obra = horas de la orden, ya con los ajustes de AMJ, por la tarifa del técnico con IVA. Materiales = importe aceptado + 21 %. Pagado = pagos registrados en el servidor (coinciden con las órdenes marcadas como PAGADO en Airtable).'),
     card('Por técnico',['Técnico','Órdenes','Generado','Pagado','Pendiente','Materiales por revisar','Último pago'],
       Object.entries(byT).sort((a,b)=>b[1].pend-a[1].pend).map(([k,g])=>({cells:[k,g.n,eur(g.gen),eur(g.paid),eur(g.pend),g.mpend||'—',g.last?fmtD(g.last):'—'],onclick:()=>{payT=k;renderSec()}}))),
     sel,
     card('Detalle por orden'+(payT?' · '+payT:''),['Fecha','Orden','Técnico','Horas','Mano de obra','Materiales','Total','Pagado','Estado'],
       detail.map(r=>[fmtD(r.finished_at),'AMJ-'+r.reference+(r.adjusted?' · horas ajustadas':'')+(r.invoiced?' · facturada':''),r.technician||'—',r.billable_minutes!=null?dur(r.billable_minutes):'—',r.lt===null?'Sin tarifa':eur(r.lt),
         r.mt===null?(r.materials_needs_amj?'Por revisar':'—'):eur(r.mt),eur(r.gen),eur(r.paid),
         (r.gen<=0.004?badge('Sin importe','no'):badge(r.pend<=0.004?'Pagado':(r.paid>0?'Pago parcial':'Pendiente'),r.pend<=0.004?'ok':'s-pending'))]),'No hay órdenes.')] }],
 materiales:['Materiales y tickets',()=>{ const rc=((M&&M.receipts)||[]).filter(r=>!TEST.has(r.order_id)), od=((M&&M.orders)||[]).filter(x=>!TEST.has(x.id));
   return [kpis([[rc.length,'tickets por revisar'],[od.length,'órdenes con materiales pendientes de AMJ']]),
     src('Datos en vivo del servidor: tickets que la IA no pudo validar y órdenes terminadas cuyos materiales esperan decisión de AMJ. La revisión se hace en la app.'),
     card('Tickets por revisar',['Orden','Técnico','Proveedor','Fecha ticket','Total','Motivo'],rc.map(r=>['AMJ-'+r.reference,r.technician||'—',r.vendor_name||'—',r.receipt_date?fmtD(r.receipt_date):'—',r.total!=null?Number(r.total).toFixed(2)+' €':'—',(r.issues||[]).join(', ')||'—']),'No hay tickets pendientes de revisar.'),
     card('Órdenes con materiales pendientes de AMJ',['Orden','Técnico','Terminada','Motivo'],od.map(x=>['AMJ-'+x.reference,x.technician||'—',fmtD(x.finished_at),({NO_RECEIPT:'Sin ticket',NO_QUOTE:'Sin presupuesto de materiales',EXCEEDS_QUOTE:'Ticket supera lo presupuestado',RECEIPTS_PENDING:'Ticket por revisar'})[(x.materials_state||{}).reason]||(x.materials_state||{}).reason||'—']),'No hay órdenes pendientes.'),
     card('Histórico de tickets (60 días)',['Orden','Técnico','Proveedor','Fecha ticket','Total ticket','Aceptado','Estado'],(RH||[]).map(r=>['AMJ-'+r.reference,r.technician||'—',r.vendor_name||'—',r.receipt_date?fmtD(r.receipt_date):'—',r.total!=null?eur(r.total):'—',r.accepted_total!=null?eur(r.accepted_total):'—',badge(({approved:'Aprobado',validated:'Validado',rejected:'Rechazado',withdrawn:'Retirado',pending_review:'Por revisar'})[r.status]||r.status,r.status==='approved'||r.status==='validated'?'ok':(r.status==='pending_review'?'s-pending':'no'))]),RH?'No hay tickets en los últimos 60 días.':'Cargando…')] }],
 kpi:['KPI',()=>{
   /* Todo en una sola página: sin pestañas ni clics para ver información relacionada. */
   const now=Date.now(), DAY=864e5;
   const inPer=s=>{ if(!s) return false; const t=new Date(s).getTime(); if(kpiDays==='custom'){ const a=kpiFrom?new Date(kpiFrom).getTime():-Infinity, b=kpiTo?new Date(kpiTo).getTime()+DAY:Infinity; return t>=a&&t<b } return kpiDays==='all'||now-t<=kpiDays*DAY };
   const R=real(), P_=R.filter(o=>inPer(o.ca)), done=P_.filter(o=>o.st==='completed'), canc=P_.filter(o=>o.st==='cancelled');
   const hrs=(a,b)=>(new Date(b)-new Date(a))/36e5, avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
   const fmtH=h=>h===null?'—':(h<24?h.toFixed(1)+' h':(h/24).toFixed(1)+' d');
   const tAt=avg(done.filter(o=>o.sa).map(o=>hrs(o.ca,o.sa))), tRes=avg(done.filter(o=>o.fa).map(o=>hrs(o.ca,o.fa)));
   const RVp=(RV||[]).filter(r=>inPer(r.created_at)), stars=avg(RVp.map(r=>Number(r.stars)));
   const open=R.filter(o=>!['completed','cancelled'].includes(o.st));
   const openDays=open.reduce((a,o)=>a+(now-new Date(o.ca))/DAY,0);
   const offHours=P_.filter(o=>{ const d=new Date(o.ca), h=Number(d.toLocaleString('en-GB',{timeZone:TZ,hour:'2-digit',hour12:false})), wd=d.toLocaleDateString('en-GB',{timeZone:TZ,weekday:'short'}); return h<8||h>=20||wd==='Sat'||wd==='Sun' });
   const sec=(t)=>{ const h=el('div',null,t); h.style.cssText='font-weight:700;font-size:13px;margin:14px 0 8px;color:var(--navy)'; return h };
   // selector de periodo
   const seg=el('div','seg'); [['all','Todo'],[30,'Últimos 30 días'],[90,'Últimos 90 días'],['custom','Personalizado']].forEach(([d,l])=>{ const b=el('button',kpiDays===d?'on':'',l); b.onclick=()=>{kpiDays=d;renderSec()}; seg.append(b) });
   if(kpiDays==='custom'){ ['kpiFrom','kpiTo'].forEach((k,i)=>{ const inp=el('input'); inp.type='date'; inp.value=(i?kpiTo:kpiFrom)||''; inp.style.cssText='border:1px solid var(--line);border-radius:9px;padding:6px 8px;font:inherit'; inp.onchange=()=>{ if(i) kpiTo=inp.value; else kpiFrom=inp.value; renderSec() }; seg.append(inp) }) }
   const out=[seg,
     sec('En el periodo'),kpis([[P_.length,'órdenes en el periodo'],[done.length+(P_.length?' ('+Math.round(100*done.length/P_.length)+' %)':''),'resueltas'],[canc.length,'canceladas'],[fmtH(tAt),'t. medio hasta empezar'],[fmtH(tRes),'t. medio hasta terminar'],[stars===null?'—':stars.toFixed(1)+' ★ ('+RVp.length+')','valoración media']]),
     sec('Ahora mismo'),kpis([[open.length,'activas'],[open.filter(o=>grp(o)==='new').length,'sin técnico'],[open.filter(o=>grp(o)==='pend').length,'esperando al técnico'],[open.filter(o=>['on_way','in_progress'].includes(o.st)).length,'en camino o trabajando'],[open.filter(o=>o.tags.some(t=>t[0]!=='test')).length,'activas con aviso'],[openDays.toFixed(1)+' d','total días sin resolver'],[open.length?(openDays/open.length).toFixed(1)+' d':'—','media días por orden abierta']]),
     sec('Seguimiento'),kpis([[offHours.length,'creadas fuera de horario (antes de 8, después de 20 o fin de semana)'],[P_.filter(o=>has(o,'piso')).length,'varias órdenes en un piso el mismo día'],[P_.filter(o=>has(o,'long')).length,'más de 2 h de trabajo'],[P_.filter(o=>has(o,'dup')).length,'duplicadas canceladas'],[done.reduce((a,o)=>a+(o.min||0),0)?dur(done.reduce((a,o)=>a+(o.min||0),0)):'—','horas de trabajo (cronómetro)']])];
   // flujo temporal
   const days={}; const add=(s,k)=>{ if(!s) return; const d=dayOf(s); if(!inPer(s)) return; (days[d]=days[d]||{c:0,a:0,r:0,x:0})[k]++ };
   R.forEach(o=>{ add(o.ca,'c'); add(o.sa,'a'); if(o.st==='completed') add(o.fa,'r'); if(o.st==='cancelled') add(o.ca,'x') });
   out.push(lineChart('Flujo temporal de órdenes',days,[['c','Creadas','#13385f'],['a','Atendidas (empezadas)','#1b8fd9'],['r','Resueltas','#16a36a'],['x','Canceladas (día de creación)','#d33']]));
   // donuts
   const cnt=(list,key)=>{ const m={}; list.forEach(o=>{ const k=key(o)||'—'; m[k]=(m[k]||0)+1 }); return Object.entries(m).sort((a,b)=>b[1]-a[1]) };
   const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1).toLowerCase():s;
   const grid=el('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;margin-top:14px';
   grid.append(donut('Por estado (activas ahora)',cnt(open,o=>(STATUS[o.st]||[o.st])[0])),donut('Por cliente',cnt(P_,o=>clName(o.cl))),donut('Por ciudad',cnt(P_,o=>cap(o.loc))),donut('Por servicio',cnt(P_,o=>o.sv)));
   out.push(grid);
   // carga por técnico
   const byT={}; P_.forEach(o=>{ const k=o.tc||'Sin asignar'; const g=byT[k]=byT[k]||{a:0,r:0,x:0,m:0}; if(o.st==='completed'){g.r++; g.m+=o.min||0} else if(o.st==='cancelled') g.x++; else g.a++ });
   out.push(barChart('Carga por técnico (órdenes del periodo)',byT));
   // valoraciones
   out.push(card('Valoraciones del periodo',['Orden','Cliente','Técnico','Valoración','Fecha','Comentario'],RVp.map(r=>['AMJ-'+r.reference,r.customer||'—',r.technician||'—','★'.repeat(Number(r.stars))+'☆'.repeat(5-Number(r.stars)),fmtD(r.created_at),r.comment||'—']),RV?'No hay valoraciones en el periodo.':'Cargando…'));
   out.push(src('Datos reales del servidor, sin órdenes de prueba. «Hasta empezar» = de creada a iniciada; «hasta terminar» = de creada a finalizada. Severidad, prioridad, subcategoría, reabiertas y pool no existen en AMJ y no se muestran.'));
   return out }],
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
  if(WARN) b.append(el('div','banner',WARN));
  fn().forEach(x=>b.append(x));
}

/* ---------- Nueva orden (MAQUETA: no escribe nada en el servidor) ---------- */
const NW={};
function nwCity(v){ v=(v||'').trim(); return v?v.toLowerCase().replace(/(^|[\s-])\S/g,m=>m.toUpperCase()):'' }
function nwOpen(){ $('nw').hidden=false; nwForm() }
function nwClose(){ $('nw').hidden=true }
function nwField(label,node,full){ const l=el('label',full?'full':null,label); l.append(node); return l }
function nwForm(){
  const b=$('nwbody'), f=$('nwfoot'); b.innerHTML=''; f.innerHTML='';
  const g=el('div','nwc'); b.append(g);
  const props=(CP||[]).map(a=>({cl:a.client_code,code:a.client_code+'-'+a.code,ad:a.address||'',ci:nwCity(a.locality)}));
  const clients=[...new Set(props.map(p=>p.cl))].sort();
  /* 1. Piso */
  g.append(el('div','nwh3','1 · Piso'));
  const sc=el('select'); sc.append(new Option('Elige cliente','')); clients.forEach(c=>sc.append(new Option(clName(c),c))); sc.append(new Option('Otro cliente / particular','OTRO'));
  const sci=el('select'); sci.append(new Option('Todas las ciudades',''));
  g.append(nwField('Cliente',sc),nwField('Ciudad',sci));
  const pi=el('input'); pi.placeholder='Escribe el código o la calle'; pi.autocomplete='off'; const pk=el('div','pk'), dl=el('div','sug'); dl.hidden=true; pk.append(pi,dl);
  const pw=nwField('Piso',pk,true); g.append(pw);
  const ad=el('input'); ad.placeholder='Dirección completa'; const adci=el('input'); adci.placeholder='Ciudad';
  const adw=nwField('Dirección (otro cliente)',ad,true), adcw=nwField('Ciudad (otro cliente)',adci); adw.hidden=adcw.hidden=true; g.append(adw,adcw);
  const info=el('div','pinfo'); info.hidden=true; g.append(info);
  const dup=el('div','warn'); g.append(dup);
  /* 2. Trabajo */
  g.append(el('div','nwh3','2 · Trabajo'));
  const sv=el('select'); sv.append(new Option('Elige servicio',''));
  [...new Set(['Fontanería','Electricidad','Pintura','Climatización','Cerrajería','Reparación general','Presupuesto trabajos especializados'].concat(real().map(o=>o.sv).filter(Boolean)))].sort((a,b)=>a.localeCompare(b)).forEach(x=>sv.append(new Option(x,x)));
  const urg=el('select'); ['Normal','Urgente'].forEach(x=>urg.append(new Option(x,x)));
  const ds=el('textarea'); ds.placeholder='Qué hay que hacer (lo verá el técnico en la app)';
  const fd=el('input'); fd.type='date'; fd.value=todayStr(); const ft=el('input'); ft.type='time';
  const cn=el('input'); cn.placeholder='Nombre (opcional)'; const ph=el('input'); ph.type='tel'; ph.placeholder='Teléfono (opcional)';
  const ac=el('input'); ac.placeholder='Llaves, portero, código… (opcional)';
  g.append(nwField('Servicio',sv),nwField('Prioridad',urg),nwField('Descripción',ds,true),nwField('Fecha preferida',fd),nwField('Hora preferida',ft),
    nwField('Persona de contacto',cn),nwField('Teléfono de contacto',ph),nwField('Acceso al piso',ac,true));
  /* Fotos */
  g.append(el('div','nwh3','Fotos'));
  NW.photos=NW.photos||[]; NW.photos=[];
  const zone=el('div','ph'); zone.tabIndex=0;
  const zt=el('div',null,'Lo más rápido: en WhatsApp (u otra app) haz clic derecho en la foto → «Copiar imagen». Después haz clic derecho dentro de este recuadro → «Pegar» (o pulsa Ctrl + V). Puedes pegar una detrás de otra, hasta 20. Desde una carpeta del ordenador también puedes arrastrarlas. En el móvil usa «Añadir fotos».');
  const fi=el('input'); fi.type='file'; fi.accept='image/*'; fi.multiple=true; fi.hidden=true;
  const pb=el('button','pb','📷 Añadir fotos'); pb.type='button'; pb.onclick=e=>{ e.preventDefault(); fi.click() };
  const pp=el('button','pb','📋 Pegar foto'); pp.type='button'; pp.style.marginLeft='8px';
  const zm=el('div','src'); zm.style.margin='8px 0 0';
  /* recuadro editable para que el clic derecho muestre «Pegar»; no deja escribir texto */
  zone.contentEditable='true'; [zt,pb,pp,zm].forEach(x=>x.contentEditable='false');
  zone.addEventListener('beforeinput',e=>e.preventDefault()); zone.addEventListener('drop',e=>e.preventDefault());
  const thumbs=el('div','thumbs'); thumbs.contentEditable='false';
  zone.append(zt,pb,pp,zm,thumbs); g.append(zone,fi);
  function addFiles(files,why){ let n=0; [...files].filter(f=>f&&/^image\//.test(f.type)).forEach(f=>{ if(NW.photos.length>=20) return; NW.photos.push({f,url:URL.createObjectURL(f)}); n++ }); drawThumbs();
    zm.textContent=n?('✔ '+(n===1?'Foto añadida':n+' fotos añadidas')+'. Llevas '+NW.photos.length+' de 20.'+(NW.photos.length<20?' Puedes pegar otra.':' Has llegado al máximo.')):(NW.photos.length>=20?'Has llegado al máximo de 20 fotos.':(why||'Lo que has pegado no es una foto. Copia la imagen (no el texto) y vuelve a pegar.')) }
  NW.addFiles=addFiles;
  function drawThumbs(){ thumbs.innerHTML=''; NW.photos.forEach((ph,i)=>{ const t=el('div','th'), im=el('img'); im.src=ph.url; const x=el('button',null,'×'); x.type='button'; x.onclick=()=>{ URL.revokeObjectURL(ph.url); NW.photos.splice(i,1); drawThumbs(); zm.textContent='Llevas '+NW.photos.length+' de 20.' }; t.append(im,x); thumbs.append(t) }) }
  fi.onchange=()=>{ addFiles(fi.files); fi.value='' };
  pp.onclick=async e=>{ e.preventDefault();
    try{ const items=await navigator.clipboard.read(), files=[];
      for(const it of items){ const tp=it.types.find(t=>/^image\//.test(t)); if(tp){ const bl=await it.getType(tp); files.push(new File([bl],'foto.'+tp.split('/')[1],{type:tp})) } }
      addFiles(files,'En el portapapeles no hay ninguna foto. En la foto: clic derecho → «Copiar imagen», y vuelve a pulsar «Pegar foto» o Ctrl + V.') }catch(err){ zm.textContent=err&&err.name==='NotAllowedError'?'Chrome no tiene permiso para leer el portapapeles. Usa Ctrl + V (funciona siempre), o pulsa el candado 🔒 junto a la dirección → «Portapapeles» → Permitir.':'No se ha podido leer el portapapeles. Usa Ctrl + V o «Añadir fotos».' } };
  NW.zone=zone;
  /* 3. Técnico */
  g.append(el('div','nwh3','3 · Técnico'));
  const ck=el('input'); ck.type='checkbox'; const ckl=el('label','chk'); ckl.append(ck,document.createTextNode(' Asignar ya a un técnico')); g.append(ckl);
  const st=el('select'); const stw=nwField('Técnico',st,true); stw.hidden=true; g.append(stw);
  const stn=el('div','src full','Mientras sea maqueta, la ciudad de cada técnico sale de las órdenes que ya ha hecho. Al conectarlo se usará la ciudad de su alta en la app.'); stn.hidden=true; g.append(stn);
  let sel=null;
  const curCity=()=>sc.value==='OTRO'?nwCity(adci.value):(sel?sel.ci:sci.value);
  function fillCities(){ const cs=[...new Set(props.filter(p=>!sc.value||p.cl===sc.value).map(p=>p.ci))].sort(); sci.innerHTML=''; sci.append(new Option('Todas las ciudades','')); cs.forEach(c=>sci.append(new Option(c,c))) }
  function fillPisos(){ dl.innerHTML=''; const q=pi.value.trim().toLowerCase();
    const L=props.filter(p=>(!sc.value||p.cl===sc.value)&&(!sci.value||p.ci===sci.value)&&(!q||sel&&pi.value===sel.code+' — '+sel.ad||(p.code+' '+p.ad).toLowerCase().includes(q)));
    if(!L.length){ dl.append(el('i',null,'Ningún piso coincide')); return }
    L.forEach(p=>{ const it=el('div'); it.append(el('b',null,(clName(p.cl))+' · '+p.code),document.createTextNode(' — '+p.ad+' '),el('i',null,'('+p.ci+')'));
      it.onmousedown=e=>{ e.preventDefault(); pi.value=p.code+' — '+p.ad; dl.hidden=true; showPiso() }; dl.append(it) }) }
  function fillTecs(){ const ci=curCity(); st.innerHTML=''; st.append(new Option('Elige técnico',''));
    const cities={}; real().forEach(o=>{ if(o.tid&&o.loc) (cities[o.tid]=cities[o.tid]||new Set()).add(nwCity(o.loc)) });
    const list=(T||[]).filter(t=>!/prueba|NO ASIGNAR|revisi/i.test(t.name||''));
    const lab=t=>t.name+' · '+(t.available?'disponible':'no disponible')+' · '+t.open_orders+' abiertas';
    const here=list.filter(t=>ci&&cities[t.id]&&cities[t.id].has(ci)), rest=list.filter(t=>!here.includes(t));
    if(here.length){ const og=el('optgroup'); og.label='Técnicos de '+ci; here.forEach(t=>og.append(new Option(lab(t),t.id))); st.append(og) }
    if(rest.length){ const og=el('optgroup'); og.label=here.length?'Otras ciudades':(ci?'Sin trabajos aún en '+ci:'Todos los técnicos'); rest.forEach(t=>og.append(new Option(lab(t),t.id))); st.append(og) } }
  function showPiso(){ const v=pi.value.split(' — ')[0].trim().toUpperCase(); sel=props.find(p=>p.code.toUpperCase()===v)||null;
    info.innerHTML=''; info.hidden=!sel; dup.textContent='';
    if(sel){ [['Cliente · código',clName(sel.cl)+' · '+sel.code,1],['Dirección',sel.ad],['Ciudad',sel.ci]].forEach(([k,v,bold])=>{ const d=el('div'); d.append(el('span',null,k),bold?el('b',null,v):document.createTextNode(v)); info.append(d) });
      const open=real().filter(o=>o.piso.toUpperCase()===sel.code.toUpperCase()&&!['completed','cancelled'].includes(o.st));
      if(open.length) dup.textContent='Atención: este piso ya tiene '+open.length+' orden(es) abierta(s): '+open.map(o=>'AMJ-'+o.ref+' ('+(STATUS[o.st]||[o.st])[0]+')').join(', ')+'. Revisa que no sea un duplicado.' }
    fillTecs(); check() }
  function check(){ const okP=sc.value==='OTRO'?(ad.value.trim()&&adci.value.trim()):!!sel; const okT=!ck.checked||!!st.value;
    go.disabled=!(okP&&sv.value&&ds.value.trim()&&okT); go.textContent=ck.checked?'Crear y asignar':'Crear sin asignar' }
  sc.onchange=()=>{ const o=sc.value==='OTRO'; adw.hidden=adcw.hidden=!o; pw.hidden=!o?false:true; sci.parentNode.hidden=o; pi.value=''; fillCities(); fillPisos(); showPiso() };
  sci.onchange=()=>{ pi.value=''; fillPisos(); showPiso() };
  pi.oninput=()=>{ dl.hidden=false; fillPisos(); showPiso() }; pi.onfocus=()=>{ fillPisos(); dl.hidden=false }; pi.onblur=()=>setTimeout(()=>{ dl.hidden=true },150); adci.oninput=()=>{ fillTecs(); check() }; ad.oninput=check;
  ck.onchange=()=>{ stw.hidden=stn.hidden=!ck.checked; fillTecs(); check() };
  [sv,ds,st].forEach(x=>{ x.oninput=check; x.onchange=check });
  const cancel=el('button',null,'Cancelar'); cancel.onclick=nwClose;
  const go=el('button','go','Crear sin asignar'); go.disabled=true;
  go.onclick=()=>{ const tec=ck.checked?(T||[]).find(t=>t.id===st.value):null;
    NW.data={cl:sc.value==='OTRO'?'Otro cliente':clName(sc.value),piso:sel?sel.code:'',ad:sel?sel.ad:ad.value.trim(),ci:sel?sel.ci:nwCity(adci.value),sv:sv.value,urg:urg.value,ds:ds.value.trim(),fd:fd.value,ft:ft.value,cn:cn.value.trim(),ph:ph.value.trim(),ac:ac.value.trim(),tec};
    nwSummary() };
  f.append(cancel,go); NW.form=g; NW.foot=[cancel,go]; fillCities(); fillPisos(); check();
}
function nwSummary(){
  const d=NW.data, b=$('nwbody'), f=$('nwfoot'); NW.form.hidden=true; NW.foot.forEach(x=>x.hidden=true);
  const g=el('div','nwc'); b.append(g); const mine=[g]; g.append(el('div','nwh3','Revisa la orden antes de enviarla'));
  const sm=el('div','sum'); const line=(k,v,strong)=>{ if(!v) return; const r=el('div'); r.append(el('b',null,k+': '),strong?el('b',null,v):document.createTextNode(v)); sm.append(r) };
  line('Cliente · piso',d.cl+(d.piso?' · '+d.piso:''),1); line('Dirección',d.ad); line('Ciudad',d.ci); line('Servicio',d.sv+(d.urg==='Urgente'?' · URGENTE':'')); line('Descripción',d.ds);
  line('Fecha y hora preferidas',(d.fd?d.fd.split('-').reverse().join('/'):'')+(d.ft?' a las '+d.ft:'')); line('Contacto',[d.cn,d.ph].filter(Boolean).join(' · ')); line('Acceso',d.ac);
  line('Técnico',d.tec?d.tec.name+' (le llegará la orden a la app)':'Sin asignar: quedará «Pendiente de asignar»'); g.append(sm);
  if(NW.photos.length){ sm.append(el('div',null,'Fotos: '+NW.photos.length)); const th=el('div','thumbs'); NW.photos.forEach(ph=>{ const t=el('div','th'), im=el('img'); im.src=ph.url; t.append(im); th.append(t) }); g.append(th) }
  const back=el('button',null,'← Corregir'); back.onclick=()=>{ mine.forEach(x=>x.remove()); NW.form.hidden=false; NW.foot.forEach(x=>x.hidden=false) };
  const go=el('button','go',d.tec?'Confirmar y enviar a '+d.tec.name.split(' ')[0]:'Confirmar y crear');
  go.onclick=()=>{ b.innerHTML=''; f.innerHTML=''; const g2=el('div','nwc'); b.append(g2);
    g2.append(el('div','sum','✔ MAQUETA: así terminaría. En la versión conectada aquí verías «AMJ-nnn creada'+(d.tec?' y enviada a '+d.tec.name:'')+'», la orden aparecería en la lista en menos de 15 segundos'+(d.tec?' y al técnico le llegaría el aviso a la app.':'.')+' Ahora no se ha enviado nada.'));
    const c=el('button','go','Cerrar'); c.onclick=nwClose; const n=el('button',null,'Otra orden'); n.onclick=nwForm; f.append(n,c) };
  mine.push(back,go); f.append(back,go);
}

/* ---------- arranque ---------- */
function start(){ $('login').hidden=true; $('app').hidden=false; $('fab').hidden=false; load(); clearInterval(timer); timer=setInterval(()=>{ load(); liveLabel() },POLL) }
function logout(){ clearSession(); clearInterval(timer); O=[]; prevRev={}; lastOk=0; $('app').hidden=true; $('login').hidden=false; $('fab').hidden=true; nwClose() }
$('lf').addEventListener('submit',async e=>{ e.preventDefault(); $('lerr').textContent=''; $('lb').disabled=true;
  try{ const em=$('le').value.trim().toLowerCase(); const j=await auth('token?grant_type=password',{email:em,password:$('lp').value});
    saveSession({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000,email:em},$('lr').checked); $('lp').value=''; start() }
  catch(err){ $('lerr').textContent=err.status===400?'Correo o contraseña incorrectos.':'No se pudo conectar. Inténtalo de nuevo.' }
  finally{ $('lb').disabled=false } });
$('logout').onclick=logout; $('logout2').onclick=logout;
document.querySelectorAll('.nav[data-sec]').forEach(n=>n.onclick=()=>{ sec=n.dataset.sec; if(sec==='pagos'||sec==='materiales') load(); document.querySelectorAll('.nav[data-sec]').forEach(x=>x.classList.toggle('on',x===n)); renderSec() }); $('sh').onclick=closeDr;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDr() });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&session) load() });
['q','fc','ft','fs','fd','fp'].forEach(id=>$(id).addEventListener('input',()=>render()));
document.addEventListener('paste',e=>{ if($('nw').hidden||!NW.addFiles) return;
  const files=[...(e.clipboardData&&e.clipboardData.items||[])].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean);
  const inText=e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA');
  if(files.length){ e.preventDefault(); NW.addFiles(files) } else if(!inText){ NW.addFiles([]) } },true);
/* arrastrar y soltar fotos en cualquier parte de la ventana de nueva orden */
document.addEventListener('dragover',e=>{ if($('nw').hidden||!NW.zone) return; e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect='copy'; NW.zone.classList.add('drag') },true);
document.addEventListener('dragleave',e=>{ if(NW.zone&&!e.relatedTarget) NW.zone.classList.remove('drag') },true);
document.addEventListener('drop',async e=>{ if($('nw').hidden||!NW.addFiles) return; e.preventDefault(); NW.zone.classList.remove('drag');
  const dt=e.dataTransfer; let files=[...(dt&&dt.files||[])].filter(f=>/^image\//.test(f.type));
  if(!files.length&&dt){ const urls=new Set(); (dt.getData('text/uri-list')||'').split(/\r?\n/).forEach(u=>{ if(u&&!u.startsWith('#')) urls.add(u.trim()) });
    const h=dt.getData('text/html')||''; (h.match(/<img[^>]+src="([^"]+)"/gi)||[]).forEach(m=>urls.add(m.replace(/.*src="([^"]+)".*/i,'$1').replace(/&amp;/g,'&')));
    for(const u of urls){ try{ const r=await fetch(u); const bl=await r.blob(); if(/^image\//.test(bl.type)) files.push(new File([bl],'foto.'+bl.type.split('/')[1],{type:bl.type})) }catch(err){} } }
  NW.addFiles(files,'Esa aplicación no deja arrastrar la foto al navegador (WhatsApp lo bloquea). Haz clic derecho en la foto → «Copiar imagen» y luego clic derecho en el recuadro de fotos → «Pegar».') },true);
$('fab').onclick=nwOpen; $('nwx').onclick=nwClose; $('nw').onclick=e=>{ if(e.target===$('nw')) nwClose() };
session=loadSession(); if(session) start();
})();
