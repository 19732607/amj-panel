/* Panel AMJ · Órdenes — versión en vivo.
   Solo lectura. Lee del servidor de producción con la cuenta de administración (RPC amj_admin_orders, la misma
   comprobación de administrador que el resto del panel de la app). No escribe nada en el servidor. */
(function(){
'use strict';
/* ---------- entorno ----------
   PRODUCCIÓN solo desde el panel publicado. Una copia abierta desde este ordenador (localhost) es SIEMPRE una copia de ensayo:
   · sin «?entorno=ensayo» se detiene (nunca usa producción desde local);
   · con el parámetro exige ensayo/config.js con el proyecto EXACTO de AMJ-Pruebas, su dirección exacta y su clave pública, que se
     comprueba contra una referencia independiente de la configuración: la huella SHA-256 escrita aquí abajo;
   · rechaza claves privilegiadas; y los servicios simulados solo valen en un navegador de pruebas automáticas, con dirección y clave fijas.
   Si algo falla, el panel se detiene ANTES de enviar credenciales o cualquier otra petición. */
const PROD={url:'https://biwjrbcfupmbpoxnrolt.supabase.co',clave:'sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm'}, REF_PROD='biwjrbcfupmbpoxnrolt', REF_PRUEBAS='gktignfhalpwhewhkzya';
/* Huella de la clave pública de AMJ-Pruebas. La clave consta en el repositorio del servidor (supabase/pruebas/extremo_a_extremo.mjs y el entorno «staging» de la app). */
const HUELLA_CLAVE_PRUEBAS='21c924873eec27c6bc6dce1053284100f9fa58f0a70af29e6205fcf4b032e7e8';
const DOBLES={url:'http://127.0.0.1:54399',clave:'clave-publica-ficticia-0001'}; /* servicios simulados de las pruebas locales: únicos valores admitidos */
const esLocal=h=>h==='localhost'||h==='127.0.0.1', LOCAL=esLocal(location.hostname), ENSAYO=document.documentElement.dataset.amjModo==='ensayo';
const huellaTexto=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function entornoEnsayo(){ const c=window.AMJ_ENTORNO, NO=' No se envía nada.';
  if(!c||typeof c!=='object') throw new Error('Falta la configuración del ensayo (ensayo/config.js).'+NO);
  if(c.proyecto!==REF_PRUEBAS) throw new Error('La configuración del ensayo no es la de AMJ-Pruebas ('+REF_PRUEBAS+').'+NO);
  const clave=typeof c.clave==='string'?c.clave:''; let u; try{ u=new URL(String(c.url||'')) }catch(e){ throw new Error('La dirección del servidor del ensayo no es válida.'+NO) }
  if(String(c.url).includes(REF_PROD)||clave===PROD.clave) throw new Error('La configuración del ensayo apunta a PRODUCCIÓN.'+NO);
  { let rol=''; if(clave.split('.').length===3){ try{ rol=JSON.parse(atob(clave.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role||'' }catch(e){} }
    if(/^sb_secret_/.test(clave)||/service_role|supabase_admin/.test(rol)||/service_role/.test(clave)) throw new Error('La clave de la configuración es una clave PRIVILEGIADA (de servidor). En el panel solo puede ir la clave pública.'+NO) }
  if(c.dobles_locales===true){ /* solo en las pruebas automáticas de este ordenador */
    if(navigator.webdriver!==true) throw new Error('Los servicios simulados solo se pueden usar en las pruebas automáticas, no en un navegador normal.'+NO);
    if(String(c.url)!==DOBLES.url||clave!==DOBLES.clave) throw new Error('La configuración de servicios simulados no es la de las pruebas locales.'+NO);
    return {url:DOBLES.url,clave:DOBLES.clave,dobles:true,fase:c.fase==='A'||c.fase==='B'?c.fase:null} }
  if(u.origin!=='https://'+REF_PRUEBAS+'.supabase.co'||String(c.url).replace(/\/$/,'')!==u.origin) throw new Error('La dirección del ensayo no es la de AMJ-Pruebas.'+NO);
  if(clave.length<20||/^PEGAR/.test(clave)) throw new Error('Falta la clave pública de AMJ-Pruebas en la configuración del ensayo.'+NO);
  if(await huellaTexto(clave)!==HUELLA_CLAVE_PRUEBAS) throw new Error('La clave pública de la configuración no es la de AMJ-Pruebas.'+NO);
  return {url:u.origin,clave,dobles:false,fase:c.fase==='B'?'B':'A'} } /* fase A (por defecto): el envío debe estar apagado */
let ENT=null, ENT_ERR='', SB='', KEY='';
if(!LOCAL&&!ENSAYO){ ENT=PROD; SB=PROD.url; KEY=PROD.clave }
else if(!LOCAL) ENT_ERR='El modo ensayo solo funciona abierto desde este ordenador (localhost). Aquí no se usa.';
else if(!ENSAYO) ENT_ERR='Esta copia local del panel es solo para el ensayo con AMJ-Pruebas. Ábrela con «?entorno=ensayo». Desde aquí no se usa producción. No se envía nada.';
const entornoListo=ENSAYO&&LOCAL?entornoEnsayo().then(e=>{ ENT=e; SB=e.url; KEY=e.clave }).catch(e=>{ ENT=null; ENT_ERR=e.message||'Entorno no válido' }):Promise.resolve();
const exigeEntorno=()=>{ if(!ENT) throw new Error(ENT_ERR||'Entorno todavía sin comprobar') }; /* delante de TODA petición: sin entorno válido no sale nada */
/* En ensayo, la sesión debe ser de AMJ-Pruebas: el emisor del pase de sesión lo dice. */
const sesionDeEnsayoValida=tok=>{ if(!ENSAYO||(ENT&&ENT.dobles)) return true; try{ return JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).iss==='https://'+REF_PRUEBAS+'.supabase.co/auth/v1' }catch(e){ return false } };
const TZ='Europe/Madrid', POLL=15000, PAGE=100, MAXPAGES=200, STORE='amj.panel.session'+(ENSAYO?'.ensayo':'');
const $=id=>document.getElementById(id);
let session=null, WARN='', TEST=new Set(), T=null, M=null, P=null, RH=null, payT='', sec='ordenes', kpiDays='all', kpiFrom='', kpiTo='', RV=null, CP=null, repCl='', repDay='', repPer='dia', repSel=new Set(), repSelW=new Set(), repView=false, repAuto=false, repMsg='', O=[], prevRev={}, view='all', lastOk=0, timer=null, loading=false;

/* ---------- sesión ---------- */
function storage(){ try{ return localStorage.getItem(STORE)?localStorage:sessionStorage }catch(e){ return null } }
function saveSession(s,remember){ session=s; try{ (remember?localStorage:sessionStorage).setItem(STORE,JSON.stringify(s)); (remember?sessionStorage:localStorage).removeItem(STORE) }catch(e){} }
function loadSession(){ try{ const st=storage(); const v=st&&st.getItem(STORE); return v?JSON.parse(v):null }catch(e){ return null } }
function clearSession(){ session=null; try{ localStorage.removeItem(STORE); sessionStorage.removeItem(STORE) }catch(e){} }
async function auth(path,body){ exigeEntorno();
  const r=await fetch(SB+'/auth/v1/'+path,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(j.error_description||j.msg||'AUTH'),{status:r.status});
  if(j.access_token&&!sesionDeEnsayoValida(j.access_token)) throw new Error('La sesión recibida no es de AMJ-Pruebas. Ensayo detenido.'); return j;
}
function remembered(){ try{ return !!localStorage.getItem(STORE) }catch(e){ return false } }
async function refresh(){
  const j=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
  saveSession({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000,email:session.email},remembered());
}
async function rpc(name,args){ exigeEntorno();
  if(!session) throw new Error('NO_SESSION');
  if(Date.now()>session.expires_at-120000) await refresh();
  let r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(r.status===401){ await refresh(); r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)}); }
  const txt=await r.text(); if(!r.ok){ const e=new Error(/ACCESS_DENIED/.test(txt)?'ACCESS_DENIED':'HTTP '+r.status); e.status=r.status; throw e }
  return JSON.parse(txt);
}

async function authHdr(){ exigeEntorno(); if(!session) throw new Error('NO_SESSION'); if(Date.now()>session.expires_at-120000) await refresh(); return {apikey:KEY,Authorization:'Bearer '+session.access_token} }
async function rest(path){ let r=await fetch(SB+'/rest/v1/'+path,{headers:await authHdr()}); if(r.status===401){ await refresh(); r=await fetch(SB+'/rest/v1/'+path,{headers:await authHdr()}) } if(!r.ok) throw new Error('HTTP '+r.status); return r.json() }
/* fotos y materiales por orden (solo lectura, para los informes) */
const MED={}, MAT={}, THU={}; let repFetching=false;
/* Bloque 3 · histórico de estados (fecha de cancelación) desde la función amj_admin_informe_ordenes. CTX=undefined: sin pedir; null: el servidor no la tiene; objeto: por id de orden. */
let CTX, ctxP=null;
function repCtx(){ if(CTX!==undefined||ctxP) return; ctxP=rpc('amj_admin_informe_ordenes',{}).then(a=>{ CTX={}; (a||[]).forEach(x=>CTX[x.id]=x) }).catch(()=>{ CTX=null }).finally(()=>{ ctxP=null; if(sec==='informes') renderSec() }) }
/* Misma definición que el servidor (vista v_kpi_ordenes): la orden se cerró sin poder ejecutar el trabajo. */
const sinEjecTxt=o=>/^\s*VISITA REALIZADA SIN POSIBILIDAD/i.test(o.report||'')||/no eh podido|no he podido|no fue posible|no se pudo|no ha sido posible/i.test(o.report||'');
/* Fuente: v_kpi_ordenes.sin_ejecucion, que llega con el contexto del servidor; la regla de texto solo se usa mientras ese contexto no ha llegado. */
const sinEjec=o=>{ const x=CTX&&CTX[o.id]; return x&&typeof x.sin_ejecucion==='boolean'?x.sin_ejecucion:sinEjecTxt(o) };
/* Estado de una orden en una fecha de corte (día de Madrid), reconstruido con los eventos del servidor: 'cancelada', 'cerrada' o 'abierta'.
   Cuenta la última de cierre / anulación de cierre / reapertura hasta ese día; una cancelación hasta ese día manda. null = sin historial. */
/* ¿Abierta en la fecha de corte? Con historial del servidor, por eventos; sin él, por el estado de hoy (y el informe lo dice). */
function repAbiertaAl(o,dc){ const e=repEstadoAl(o,dc); if(e) return e==='abierta'; return o.st!=='cancelled'&&(o.st!=='completed'||(o.fa&&dayOf(o.fa)>dc)) }
function repEstadoAl(o,dc){ const x=CTX&&CTX[o.id]; if(!x||!Array.isArray(x.eventos)||!x.eventos.length) return null; const E=x.eventos.filter(e=>dayOf(e.t)<=dc);
  if(E.some(e=>e.a==='cancel')) return 'cancelada'; const u=E.filter(e=>e.a!=='cancel').pop(); return u&&u.a==='finish'?'cerrada':'abierta' }
/* Antes de generar un PDF se vuelven a leer fotos y materiales. Devuelve las órdenes cuyo contenido ha cambiado; lanza error si la lectura falla o queda incompleta. */
async function repRefresh(ids){ const nM={}, nT={}; ids.forEach(id=>{ nM[id]=[]; nT[id]=[] });
  for(let i=0;i<ids.length;i+=40){ const ch=ids.slice(i,i+40), inl='('+ch.join(',')+')';
    const [m,t]=await Promise.all([rest('amj_service_media?select=id,order_id,object_path,content_type,created_at,caption&state=eq.verified&content_type=like.image%2F*&order_id=in.'+inl+'&order=created_at'),
      rest('amj_order_materials?select=order_id,position,description,quantity,unit_price,subtotal,iva,total&order_id=in.'+inl+'&order=position')]);
    if(!Array.isArray(m)||!Array.isArray(t)) throw new Error('respuesta incompleta del servidor');
    m.forEach(x=>{ if(nM[x.order_id]) nM[x.order_id].push(x) }); t.forEach(x=>{ if(nT[x.order_id]) nT[x.order_id].push(x) }) }
  const fm=L=>JSON.stringify((L||[]).map(x=>x.object_path)), ft=L=>JSON.stringify((L||[]).map(x=>[x.description,Number(x.quantity),Number(x.total)]));
  const cambian=ids.filter(id=>fm(MED[id])!==fm(nM[id])||ft(MAT[id])!==ft(nT[id])); cambian.forEach(id=>{ MED[id]=nM[id]; MAT[id]=nT[id] }); return cambian }
async function repEnsure(ids){
  const miss=ids.filter(id=>!(id in MED)); if(!miss.length||repFetching) return; repFetching=true;
  try{ for(let i=0;i<miss.length;i+=40){ const ch=miss.slice(i,i+40), inl='('+ch.join(',')+')';
      const [m,t]=await Promise.all([rest('amj_service_media?select=id,order_id,object_path,content_type,created_at,caption&state=eq.verified&content_type=like.image%2F*&order_id=in.'+inl+'&order=created_at'),
        rest('amj_order_materials?select=order_id,position,description,quantity,unit_price,subtotal,iva,total&order_id=in.'+inl+'&order=position')]);
      ch.forEach(id=>{ MED[id]=[]; MAT[id]=[] }); m.forEach(x=>MED[x.order_id].push(x)); t.forEach(x=>MAT[x.order_id].push(x)) }
  }catch(e){ console.warn('informes: fotos/materiales',e); repMsg='No se han podido cargar las fotos o los materiales de algunas órdenes ('+(e.message||'error de conexión')+'). El informe está incompleto: recarga la página antes de verlo o enviarlo.' } finally{ repFetching=false }
  if(sec==='informes') renderSec();
}
function repThumb(m){ const a=el('a','rth'); a.href='#'; a.title=m.caption||''; const im=el('img'); im.alt='Foto'; a.append(im);
  const set=u=>{ im.src=u; a.onclick=e=>{ e.preventDefault(); window.open(u,'_blank') } };
  if(typeof THU[m.id]==='string') set(THU[m.id]);
  else { (THU[m.id]=THU[m.id]||(async()=>{ const h=await authHdr(); const path=m.object_path.split('/').map(encodeURIComponent).join('/');
      let r=await fetch(SB+'/storage/v1/render/image/authenticated/amj-service-media/'+path+'?width=600&resize=contain&quality=70',{headers:h});
      if(!r.ok) r=await fetch(SB+'/functions/v1/amj-service-media?file='+encodeURIComponent(m.id),{headers:h});
      if(!r.ok) throw new Error('foto '+r.status); const u=URL.createObjectURL(await r.blob()); THU[m.id]=u; return u })())
      .then(u=>{ if(typeof u==='string') set(u) }).catch(()=>{ delete THU[m.id]; a.classList.add('err') }) }
  return a }
function repPhotos(o){ const L=MED[o.id]; const w=el('div','rph'); if(L===undefined){ w.append(el('span','muted','Cargando fotos…')); return w }
  if(!L.length){ w.append(el('span','muted','Sin fotos')); return w } L.forEach(m=>w.append(repThumb(m))); return w }
/* Cupo de avisos de HELPHOUSING por periodo contractual (contrato firmado el 16/10/2026).
   Fuente: Airtable «Periodos contractuales» (base de producción), contrastada el 21/11/2026. Fuera de estos periodos no se computa cupo. */
/* Segunda revisión (22/11/2026): una sola fuente. Los periodos contractuales los da el servidor (amj_admin_informe_periodos), el inmueble de
   cada orden es el de su ficha (contexto del servidor) y las órdenes cerradas de un periodo se deciden con los eventos hasta la fecha de corte. */
let PERS, persP=null;
function repPers(){ if(PERS!==undefined||persP) return; persP=rpc('amj_admin_informe_periodos',{}).then(a=>{ PERS=Array.isArray(a)?a:null }).catch(()=>{ PERS=null }).finally(()=>{ persP=null; if(sec==='informes') renderSec() }) }
const repCodigoCli=cl=>({HELP:'HELPHOUSING'})[cl]||cl;
const repPeriodos=cl=>(PERS||[]).filter(p=>p.cliente===repCodigoCli(cl)).map(p=>[p.desde,p.hasta,Number(p.cupo)]);
const repInm=o=>{ const x=CTX&&CTX[o.id]; return x&&x.inmueble!=null&&String(x.inmueble).trim()?String(x.inmueble).trim():'' };   /* '' = inmueble sin identificar en la ficha */
const repCuentaInmuebles=ordenes=>new Set(ordenes.map(repInm).filter(Boolean)).size;
const repGrupoInmueble=o=>repInm(o)||'Sin inmueble identificado';
/* Cliente de una orden EN LOS INFORMES: el de su ficha en el servidor (CTX.cliente); el prefijo de la descripción solo mientras el contexto no ha llegado. */
const repCli=o=>{ const x=CTX&&CTX[o.id]; return x&&x.cliente?({HELPHOUSING:'HELP'})[x.cliente]||x.cliente:o.cl };
/* ¿Cancelada en esa fecha? Con historial, por el evento de cancelación hasta ese día; sin historial, por el estado de hoy. */
const repNoCancAl=(o,d)=>{ const e=repEstadoAl(o,d); return e?e!=='cancelada':!['cancelled','canceled','rejected'].includes(o.st) };
/* Cierre vigente en la fecha de corte: {t} si la orden estaba cerrada ese día; null si no. Sin historial del servidor, el cierre de hoy. */
function repCierreAl(o,dc){ const x=CTX&&CTX[o.id]; if(!x||!Array.isArray(x.eventos)||!x.eventos.length) return o.st==='completed'&&o.fa&&dayOf(o.fa)<=dc?{t:o.fa}:null;
  if(repEstadoAl(o,dc)!=='cerrada') return null; const F=x.eventos.filter(e=>e.a==='finish'), enC=F.filter(e=>dayOf(e.t)<=dc).pop(), ult=F[F.length-1]; return {t:enC===ult&&o.fa?o.fa:enC.t,anulado:enC!==ult} }
/* Informes con el formato que AMJ envía al cliente (vista «Ver»). Diario: órdenes marcadas. Semanal: informe completo de la semana de un cliente. */
function repFmt(L,d0,d1,WK,QN,MS,CL){ const addD0=(d,n)=>{ const x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.toLocaleDateString('sv-SE') }; const PW=MS?'mes':QN?'quincena':'semana', DELA=MS?'del mes':'de la '+PW;
  /* fechas escritas con tabla propia (no con el idioma del navegador): el servidor las recompone igual, letra a letra */
  const MESL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'], MESC=['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
  const fd=(d,o)=>{ const dd=o.day==='2-digit'?d.slice(8,10):o.day?String(+d.slice(8,10)):'', mm=o.month==='long'?MESL[+d.slice(5,7)-1]:o.month==='short'?MESC[+d.slice(5,7)-1]:''; return [dd,mm,o.year?d.slice(0,4):''].filter(Boolean).join(o.month==='long'?' de ':' ') }, cap1=t=>t?t.charAt(0).toUpperCase()+t.slice(1).toLowerCase():'', dm=d=>d.slice(8,10)+'/'+d.slice(5,7);
  const cls=CL?[CL]:[...new Set(L.map(o=>repCli(o)))], one=cls.length===1, cname=cls.map(clName).join(' + '), city=[...new Set(L.map(o=>cap1(o.loc)).filter(Boolean))].join(' / ');
  const code=o=>(o.piso||o.ad||'—').replace(/^(ENSO|HELP)-/,''), dlong=fd(d1,{day:'numeric',month:'long',year:'numeric'});
  const per=MS?fd(d1,{month:'long',year:'numeric'}):(QN?(d0.slice(8)==='01'?'1.ª':'2.ª')+' quincena de '+fd(d1,{month:'long'})+' · ':'')+(!WK?dlong:'del '+fd(d0,d0.slice(0,7)===d1.slice(0,7)?{day:'numeric'}:{day:'numeric',month:'long'})+' al '+dlong);
  const dc=d1>todayStr()?todayStr():d1, live=WK&&dc<d1;
  const H=t=>el('h2','rf-h2',t), table=(heads,cl)=>{ const tb=el('table','rf-tb'+(cl?' '+cl:'')), hr=el('tr'); heads.forEach(h=>hr.append(el('th',null,h))); const th=el('thead'); th.append(hr); const bd=el('tbody'); tb.append(th,bd); return [tb,bd] };
  const row=(bd,cells,cl)=>{ const r=el('tr',cl||null); cells.forEach(c=>{ if(c instanceof Node) r.append(c); else r.append(el('td',null,c)) }); bd.append(r); return r };
  const td=(t,c)=>el('td',c||null,t);
  const doc=el('div','rf');
  const top=el('div','rf-top'); const lg=document.querySelector('.brand img'); if(lg){ const im=el('img'); im.src=lg.src; im.alt='AMJ'; top.append(im) }
  const tr=el('div','rf-tr'); tr.append(el('b',null,(cname+(city?' · '+city:'')).toUpperCase()),el('span',null,MS?'Informe mensual · '+per:WK?'Servicio '+dm(d0)+' – '+dm(d1)+' · '+d1.slice(0,4):'Informe diario · '+fd(d1,{day:'numeric',month:'short',year:'numeric'}))); top.append(tr); doc.append(top);
  doc.append(el('h1','rf-h1',MS?'Informe mensual de servicio':WK?'Informe de servicio':'Informe diario de servicio'),el('div','rf-sub',[cname,city,per].filter(Boolean).join(' · ')));
  const identificadas=L.filter(repInm), sinInmueble=L.length-identificadas.length;
  const contextoListo=L.every(o=>CTX&&CTX[o.id]), pisos=repCuentaInmuebles(L);
  const etiquetaInmuebles=sinInmueble?(pisos===1?'inmueble identificado':'inmuebles identificados'):(pisos===1?'inmueble atendido':'inmuebles atendidos');
  const loaded=L.every(o=>o.id in MED), mload=L.every(o=>o.id in MAT)&&repMatListo(L), nf=L.reduce((a,o)=>a+(MED[o.id]||[]).length,0);
  const sumM=(arr,f)=>arr.reduce((a,m)=>a+Number(m[f]||0),0), allM=L.flatMap(o=>repMat(o)||[]);
  const perErr=one&&PERS===null, perCarga=one&&PERS===undefined; /* null = la consulta de periodos contractuales FALLÓ; undefined = aún cargando */
  const PERI=one?repPeriodos(cls[0]):[], help=PERI.length>0, vkey=o=>repInm(o)+'|'+dayOf(o.sa);
  const hAll=help?real().filter(o=>repCli(o)===cls[0]&&o.sa&&!['rejected','draft'].includes(o.st)):[]; /* la cancelación se mira en la fecha de cada periodo (abajo) */
  /* periodos contractuales que toca el informe (hasta la fecha de corte); cada uno con sus visitas y su saldo */
  const pers=PERI.filter(p=>p[0]<=dc&&p[1]>=d0).map(([a,b,tot])=>{ const upto=dc<b?dc:b, from=d0>a?d0:a, T=hAll.filter(o=>dayOf(o.sa)>=a&&dayOf(o.sa)<=upto&&repNoCancAl(o,upto)), V=T.filter(repInm) /* sin inmueble en la ficha: pendiente de clasificar, no consume aviso */; return {a,b,tot,upto,from,V,sinInm:T.filter(o=>!repInm(o)),n:new Set(V.map(vkey)).size,inR:V.filter(o=>dayOf(o.sa)>=from)} });
  const PM=pers.slice().reverse().find(p=>p.inR.length)||pers[pers.length-1]||null;
  const intro=el('p','rf-intro'); intro.append(el('b',null,L.length+(L.length===1?' orden de trabajo finalizada ':' órdenes de trabajo finalizadas ')+(MS?'en '+per:WK?per.replace(/^.* · /,''):'el '+dlong)+'.'),document.createTextNode(' Se detallan las intervenciones por inmueble, el informe del técnico'+(WK?', las fotografías y los materiales.':' y las fotografías de cada trabajo.'))); doc.append(intro);
  if(live) doc.append(el('p','rf-live','Periodo en curso: datos hasta el '+dm(dc)+'. El periodo termina el '+dm(d1)+'.'));
  const box=el('div','rf-kp'); const k=(v,t)=>{ const d=el('div'); d.append(el('b',null,v),el('span',null,t)); box.append(d) };
  k(String(L.length),L.length===1?'orden finalizada':'órdenes finalizadas');
  if(PM){ k(PM.n+' / '+PM.tot,'avisos consumidos'+(pers.length>1?' (periodo '+dm(PM.a)+' – '+dm(PM.b)+')':'')); k(String(Math.max(PM.tot-PM.n,0)),'avisos disponibles al '+dm(PM.upto)) } else k(contextoListo?String(pisos):'…',etiquetaInmuebles);
  if(WK) k(mload?eur2(sumM(allM,'total')):'…','materiales, IVA incluido'); else k(loaded?String(nf):'…','fotografías'); doc.append(box);
  if(contextoListo&&sinInmueble) doc.append(el('p','rf-note',sinInmueble===1?'1 orden sin inmueble identificado.':sinInmueble+' órdenes sin inmueble identificado.'));
  if(one){ doc.append(H('Cómo trabajamos cada aviso')); const st=el('div','rf-steps');
    ['Aviso de '+cname,'Orden en la app con el código del piso','Asignación de técnico y cita','Trabajo en el inmueble','Cierre con informe y fotos',help?'Aviso computado e informe al cliente':'Informe al cliente'].forEach((t,i)=>{ const d=el('div'); d.append(el('b',null,String(i+1)),el('span',null,t)); st.append(d) }); doc.append(st) }
  if(MS){ /* KPI del mes */
    const inP=s=>s&&dayOf(s)>=d0&&dayOf(s)<=dc, mine=real().filter(o=>cls.includes(repCli(o))&&repNoCancAl(o,dc)), rec=real().filter(o=>cls.includes(repCli(o))&&inP(o.ca)&&(repEstadoAl(o,dc)?repEstadoAl(o,dc)!=='cancelada':o.st!=='cancelled')); /* recibidas: no canceladas en la fecha de corte */ /* las canceladas son gestión interna de AMJ: no entran en el informe del cliente */
    /* Abiertas en la fecha de corte. Una orden cancelada DESPUÉS del corte estaba abierta ese día: solo se sabe con el histórico del servidor. */
    const hist=!!CTX, cerrado=dc<todayStr();
    const opn=real().filter(o=>cls.includes(repCli(o))&&dayOf(o.ca)<=dc&&repAbiertaAl(o,dc));
    const hrs=(a,b)=>(new Date(b)-new Date(a))/36e5, avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null, fH=h=>h===null?'—':(h<24?h.toFixed(1).replace('.',',')+' h':(h/24).toFixed(1).replace('.',',')+' días');
    const tA=avg(L.filter(o=>o.sa).map(o=>hrs(o.ca,o.sa))), tR=avg(L.map(o=>hrs(o.ca,o.fa))), tW=avg(L.filter(o=>o.min!=null).map(o=>o.min));
    const d24=L.filter(o=>hrs(o.ca,o.fa)<24).length, d48=L.filter(o=>hrs(o.ca,o.fa)<48).length, /* «menos de»: el límite exacto no entra */ pct=(a,b)=>b?Math.round(a/b*100)+' %':'—';
    const nov=L.filter(sinEjec).length, porInmueble=new Map(), visitas=new Map();
    for(const o of identificadas){
      const id=repInm(o);
      porInmueble.set(id,(porInmueble.get(id)||0)+1);
      if(!o.sa) continue;
      const clave=vkey(o);
      if(!visitas.has(clave)) visitas.set(clave,[]);
      visitas.get(clave).push(o);
    }
    const rep2=[...porInmueble.values()].filter(n=>n>1).length;
    const gruposVisitas=[...visitas.values()], visSin=gruposVisitas.filter(v=>v.every(sinEjec)).length;
    /* Regla de Antonio (21/11/2026): las valoraciones quedan fuera de cualquier informe a clientes. */
    doc.append(H('Indicadores del mes (KPI)')); const g=el('div','rf-kp rf-kpi'); const kk=(v,t)=>{ const d=el('div'); d.append(el('b',null,String(v)),el('span',null,t)); g.append(d) };
    kk(rec.length,'órdenes recibidas'); kk(L.length,'órdenes finalizadas'); kk(opn.length,(live?'abiertas a fecha de '+dm(dc):'abiertas al cierre del mes')+(cerrado&&!hist?' (según el estado de hoy)':''));
    kk(fH(tA),'tiempo medio hasta el inicio del trabajo (desde el alta de la orden)'); kk(fH(tR),'tiempo medio hasta el cierre (desde el alta de la orden)'); kk(pct(d24,L.length),'cerradas en menos de 24 h desde el alta'); kk(pct(d48,L.length),'cerradas en menos de 48 h desde el alta');
    /* retirado (22/11): el tiempo de cronómetro no tiene fuente fiable en el servidor */ kk(contextoListo?pisos:'…',sinInmueble?'inmuebles identificados':'inmuebles atendidos'); kk(contextoListo?rep2:'…','inmuebles con más de una orden'); kk(nov,'órdenes sin posibilidad de ejecución'); kk(contextoListo?visSin:'…','visitas en las que no se pudo hacer ningún trabajo');
    kk(pct(L.filter(o=>(MED[o.id]||[]).length).length,L.length),'órdenes con fotografías'); kk(pct(L.filter(o=>o.report).length,L.length),'órdenes con informe del técnico'); kk(mload?eur2(sumM(allM,'total')):'…','materiales, IVA incluido');
    const offH=rec.filter(o=>{ const d=new Date(o.ca), h=Number(d.toLocaleString('en-GB',{timeZone:TZ,hour:'2-digit',hour12:false})), wd=d.toLocaleDateString('en-GB',{timeZone:TZ,weekday:'short'}); return h<8||h>=20||wd==='Sat'||wd==='Sun' }).length, mins=L.reduce((a,o)=>a+(o.min||0),0);
    /* retirado (22/11): «fuera de horario» mide la hora de alta, no la del aviso */ kk(contextoListo?gruposVisitas.filter(v=>v.length>1).length:'…','visitas con varias órdenes en el mismo inmueble'); /* retirados (22/11): indicadores basados en el cronómetro */
    doc.append(g,el('p','rf-note','Tiempos calculados sobre las órdenes finalizadas en el mes. Se cuentan desde el alta de la orden en la app, que no siempre coincide con la hora en que el cliente dio el aviso.'+(cerrado&&!hist?' Las órdenes abiertas se calculan con el estado de hoy: no se dispone del histórico de estados en la fecha de cierre.':'')));
    /* gráficos, como en el panel KPI */
    const days={}; days[d0]={c:0,a:0,r:0,x:0}; days[dc]=days[dc]||{c:0,a:0,r:0,x:0}; const add=(s,k)=>{ if(inP(s)) (days[dayOf(s)]=days[dayOf(s)]||{c:0,a:0,r:0,x:0})[k]++ };
    rec.forEach(o=>add(o.ca,'c')); mine.forEach(o=>add(o.sa,'a')); L.forEach(o=>add(o.fa,'r')); /* recibidas, empezadas y resueltas con el estado en la fecha de corte: «resueltas» son las mismas órdenes del detalle */
    const lc=lineChart('Flujo de órdenes del mes',days,[['c','Recibidas','#13385f'],['a','Atendidas (empezadas)','#1b8fd9'],['r','Resueltas','#16a36a']]); lc.classList.add('rf-ch'); doc.append(lc);
    { const SER=[['c','Recibidas','#13385f'],['a','Atendidas (empezadas)','#1b8fd9'],['r','Resueltas','#16a36a']], ks=[]; for(let a=d0;a<=dc;a=addD0(a,1)) ks.push(a); lc._m={t:'line',title:'Flujo de órdenes del mes',labels:ks.map(k=>fd(k,{day:'2-digit',month:'short'})),series:SER.map(([k,n,c])=>({n,c,v:ks.map(d=>(days[d]||{})[k]||0)}))} }
    const cnt=(list,key)=>{ const m={}; list.forEach(o=>{ const k=key(o)||'—'; m[k]=(m[k]||0)+1 }); return Object.entries(m).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)) };
    const DN=[['Por tipo de trabajo',cnt(rec,o=>o.sv)],['Por estado en la fecha de corte',cnt(rec,o=>repCierreAl(o,dc)?'Finalizada':'Abierta')],['Por ciudad',cnt(rec,o=>cap1(o.loc))]]; const dg=el('div','rf-dn'); DN.forEach(([t,e])=>dg.append(donut(t,e))); dg._m={t:'donuts',items:DN.map(([title,entries])=>({title,entries}))}; doc.append(dg);
    /* evolución por semana */
    doc.append(H('Evolución por semana')); const [tw,bw]=table(['Semana','Recibidas','Finalizadas','Inmuebles','Materiales']); const addD=(d,n)=>{ const x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.toLocaleDateString('sv-SE') };
    for(let a=d0;a<=dc;){ const wd=(new Date(a+'T12:00:00').getDay()+6)%7; let b=addD(a,6-wd); if(b>dc) b=dc; const F=L.filter(o=>dayOf(o.fa)>=a&&dayOf(o.fa)<=b);
      row(bw,[dm(a)+' – '+dm(b),String(rec.filter(o=>dayOf(o.ca)>=a&&dayOf(o.ca)<=b).length),String(F.length),F.every(o=>CTX&&CTX[o.id])?String(repCuentaInmuebles(F)):'…',mload?eur2(sumM(F.flatMap(o=>repMat(o)||[]),'total')):'…']); a=addD(b,1) }
    row(bw,['Total',String(rec.length),String(L.length),contextoListo?String(pisos):'…',mload?eur2(sumM(allM,'total')):'…'],'tot'); doc.append(tw);
  }
  if(WK&&L.length){ /* órdenes por inmueble y tipo de trabajo */
    doc.append(H('Órdenes por inmueble · '+per)); const cnt=Object.create(null); L.forEach(o=>{ const c=repGrupoInmueble(o); cnt[c]=(cnt[c]||0)+1 }); const mx=Math.max(...Object.values(cnt)); const bars=el('div','rf-bars');
    Object.keys(cnt).sort().forEach(c=>{ const r=el('div'), bar=el('i'), f=el('u'); f.style.width=Math.round(cnt[c]/mx*100)+'%'; bar.append(f); r.append(el('span',null,c),bar,el('em',null,String(cnt[c]))); bars.append(r) }); doc.append(bars);
    doc.append(H('Tipo de trabajo')); const [t1,b1]=table(['Tipo de trabajo','Registros','Órdenes']); const sv={}; L.forEach(o=>{ const s=o.sv||'Sin clasificar'; (sv[s]=sv[s]||[]).push('AMJ-'+o.ref) });
    Object.keys(sv).sort((x,y)=>sv[y].length-sv[x].length||(x<y?-1:x>y?1:0)).forEach(s=>row(b1,[s,String(sv[s].length),sv[s].join(', ')])); doc.append(t1) }
  if(WK&&help){ /* cupo: un bloque por periodo contractual que toque el informe */
    if(!pers.length) doc.append(el('p','rf-note','Periodo sin cupo contractual: no se computan avisos.'));
    pers.forEach(P=>{ const disp=Math.max(P.tot-P.n,0), fin=!live||P.upto<dc;
      doc.append(H('Visitas y saldo del cupo · periodo '+dm(P.a)+' – '+dm(P.b)));
      doc.append(el('p','rf-intro',(fin?'Al cierre del ':'A fecha de ')+dm(P.upto)+': '+P.n+' avisos consumidos de '+P.tot+' y '+disp+' disponibles. Cupo: 1 inmueble + día de inicio = 1 aviso.'+(P.sinInm.length?' Pendientes de clasificar (sin inmueble identificado, no consumen aviso): '+P.sinInm.map(o=>'AMJ-'+o.ref).join(', ')+'.':'')));
      const g={}; P.inR.forEach(o=>{ (g[vkey(o)]=g[vkey(o)]||[]).push(o) }); const kv=a=>dayOf(a[0].sa)+'|'+repInm(a[0]), multi=Object.values(g).filter(a=>a.length>1).sort((a,b)=>kv(a)<kv(b)?-1:kv(a)>kv(b)?1:0);
      if(multi.length){ const lista=a=>{ const r=a.map(o=>'AMJ-'+o.ref).sort(); return r.length>1?r.slice(0,-1).join(', ')+' y '+r[r.length-1]:r[0] };
        const q=el('p','rf-intro'); q.append(el('b',null,P.inR.length+' órdenes atendidas en '+Object.keys(g).length+' visitas. '),document.createTextNode('Varias órdenes en un mismo inmueble y día cuentan como 1 aviso: '+multi.map(a=>repInm(a[0])+' el '+dm(dayOf(a[0].sa))+' ('+lista(a)+')').join('; ')+'.')); doc.append(q) }
      const [t2,b2]=table(['Fecha','Órdenes / visitas','Avisos consumidos']); const byD={}; P.inR.forEach(o=>{ const d=dayOf(o.sa); (byD[d]=byD[d]||[]).push(o) });
      Object.keys(byD).sort().forEach(d=>row(b2,[dm(d),byD[d].sort((x,y)=>x.ref-y.ref).map(o=>'AMJ-'+o.ref).join(', '),String(new Set(byD[d].map(vkey)).size)]));
      if(P.from>P.a) row(b2,['Hasta '+dm(new Date(new Date(P.from+'T12:00:00')-864e5).toLocaleDateString('sv-SE')),'Saldo anterior del periodo',String(new Set(P.V.filter(o=>dayOf(o.sa)<P.from).map(vkey)).size)]);
      row(b2,['Total','Cupo del periodo: '+P.tot+'. Saldo disponible al '+dm(P.upto)+': '+disp,String(P.n)],'tot'); doc.append(t2) }) }
  doc.append(H(WK?'Detalle de las incidencias':'Detalle de las intervenciones'));
  const [tb,bd]=table((WK?['Fecha']:[]).concat(['Orden / inmueble','Incidencia y actuación','Estado']),'det');
  L.forEach(o=>{ const c=el('td'); const nov=sinEjec(o);
    c.append(el('b',null,(o.work||'(sin descripción)').replace(/\.?$/,'. ')),document.createTextNode(o.report||'El técnico no escribió informe.')); c.style.whiteSpace='pre-wrap';
    row(bd,(WK?[td(dm(dayOf(o.fa)),'nwr')]:[]).concat([td('AMJ-'+o.ref+' · '+code(o)+(one?'':' · '+clName(repCli(o))),'nwr'),c,td(nov?'Sin posibilidad de ejecución':'Finalizada')])) });
  if(!L.length){ const e=td('No hay órdenes finalizadas en el periodo.'); e.colSpan=WK?4:3; row(bd,[e]) }
  doc.append(tb);
  if(L.length) doc.append(H('Fotos de las intervenciones'));
  L.forEach(o=>{ const g=el('div','rf-og'); g.append(el('div','rf-oh',(WK?dm(dayOf(o.fa))+' · ':'')+'AMJ-'+o.ref+' · '+(o.work||'').replace(/\.$/,'')+' · '+code(o))); const w=repPhotos(o); w.className='rf-ph'; g.append(w); g._m={id:o.id}; doc.append(g) });
  if(WK){ /* materiales */
    if((QN||MS)&&mload){ const withM=L.filter(o=>repMat(o).length), tot=sumM(allM,'total'), oT=o=>sumM(repMat(o),'total');
      doc.append(H('Informe de materiales')); const p=el('p','rf-intro'); p.append(el('b',null,eur2(tot)+' en materiales en '+withM.length+' de las '+L.length+' órdenes finalizadas.'),document.createTextNode(' La base es la del ticket de compra o, si no lo hay, la del importe autorizado por AMJ, y el IVA es el 21 % que la ley obliga a repercutir.')); doc.append(p);
      const bx=el('div','rf-kp'); const kk=(v,t)=>{ const d=el('div'); d.append(el('b',null,v),el('span',null,t)); bx.append(d) };
      { /* la etiqueta sale de la FUENTE registrada en el servidor: ticket aprobado o importe autorizado por AMJ */
        const tD=allM.filter(m=>m.fuente==='ticket'), au=allM.filter(m=>m.fuente!=='ticket');
        const partes=[tD.length?'con ticket: base '+eur2(sumM(tD,'subtotal'))+' · IVA '+eur2(sumM(tD,'iva')):'',au.length?'autorizado por AMJ sin ticket: base '+eur2(sumM(au,'subtotal'))+' · IVA '+eur2(sumM(au,'iva')):''].filter(Boolean);
        kk(eur2(tot),'total materiales, IVA incluido'+(partes.length?' ('+partes.join('; ')+')':'')) } kk(withM.length+' / '+L.length,'órdenes con materiales'+(L.length?' ('+Math.round(withM.length/L.length*100)+' %)':''));
      kk(withM.length?eur2(tot/withM.length):'—','gasto medio por orden con materiales'); kk(L.length?eur2(tot/L.length):'—','gasto medio por orden finalizada'); doc.append(bx);
      const spend=(title,keyf)=>{ const g=Object.create(null); withM.forEach(o=>{ const k=keyf(o); (g[k]=g[k]||{n:0,t:0}); g[k].n++; g[k].t+=oT(o) }); const ks=Object.keys(g).sort((x,y)=>g[y].t-g[x].t||(x<y?-1:x>y?1:0)); if(!ks.length) return; const mx=g[ks[0]].t||1;
        doc.append(H(title)); const w=el('div','rf-sp'); ks.forEach(k=>{ const r=el('div'), bar=el('i'), f=el('u'); f.style.width=Math.round(g[k].t/mx*100)+'%'; bar.append(f); r.append(el('span',null,k),el('small',null,g[k].n+(g[k].n===1?' orden':' órdenes')),bar,el('b',null,eur2(g[k].t)),el('em',null,(tot?Math.round(g[k].t/tot*100):0)+' %')); w.append(r) }); doc.append(w) };
      spend('Gasto por tipo de trabajo',o=>o.sv||'Sin clasificar'); spend('Gasto por inmueble',repGrupoInmueble);
      if(withM.length){ doc.append(H('Por técnico')); const [t5,b5]=table(['Técnico','Órdenes con material','Total']); const g={}; withM.forEach(o=>{ const k=(o.tc||'—').trim().split(/\s+/)[0]; /* ante el cliente, solo el nombre de pila */ (g[k]=g[k]||{n:0,t:0}); g[k].n++; g[k].t+=oT(o) });
        Object.keys(g).sort((x,y)=>g[y].t-g[x].t||(x<y?-1:x>y?1:0)).forEach(k=>row(b5,[k,String(g[k].n),eur2(g[k].t)])); row(b5,['Total',String(withM.length),eur2(tot)],'tot'); doc.append(t5) } }
    doc.append(H('Relación detallada de materiales'),el('p','rf-intro','Materiales de cada orden. La base es la del ticket de compra o, si no lo hay, la del importe autorizado por AMJ, y sobre ella se repercute el 21 % de IVA.'));
    const [t3,b3]=table(['Fecha','Orden / inmueble','Trabajo y material','Base','IVA','Total'],'mat'); const withM=L.filter(o=>repMat(o).length);
    if(!mload){ const e=td('Cargando materiales…'); e.colSpan=6; row(b3,[e]) } else if(!withM.length){ const e=td((MS?'Este mes':'Esta '+PW)+' no se han declarado materiales.'); e.colSpan=6; row(b3,[e]) }
    withM.forEach(o=>{ const M=repMat(o); M.forEach((m,i)=>{ const c=el('td'); if(!i) c.append(el('b',null,(o.work||'').replace(/\.$/,'')),el('br')); c.append(document.createTextNode((m.description||'—')+(m.fuente==='ticket'?' (ticket)':' (autorizado por AMJ, sin ticket)')));
        row(b3,[td(i?'':dm(dayOf(o.fa)),'nwr'),td(i?'':'AMJ-'+o.ref+' · '+code(o),'nwr'),c,td(m.subtotal==null?'—':eur2(m.subtotal),'r'),td(m.iva==null?'—':eur2(m.iva),'r'),td(eur2(m.total),'r')]) });
      if(M.length>1) row(b3,['','','Subtotal AMJ-'+o.ref,td(eur2(sumM(M,'subtotal')),'r'),td(eur2(sumM(M,'iva')),'r'),td(eur2(sumM(M,'total')),'r')],'sub') });
    if(mload&&withM.length){ row(b3,['','','Total '+DELA,td(eur2(sumM(allM,'subtotal')),'r'),td(eur2(sumM(allM,'iva')),'r'),td(eur2(sumM(allM,'total')),'r')],'tot') }
    doc.append(t3);
    const open=real().filter(o=>cls.includes(repCli(o))&&dayOf(o.ca)<=dc&&repAbiertaAl(o,dc)); /* mismo criterio que el KPI «abiertas» */
    if(open.length){ doc.append(H(live?'Órdenes abiertas a fecha de '+dm(dc):'Órdenes abiertas al cierre '+DELA)); const [t4,b4]=table(['Orden / inmueble','Trabajo','Estado']); open.sort((x,y)=>x.ref-y.ref).forEach(o=>{ /* estado: en un informe en curso, el de hoy; en uno cerrado, «abierta en esa fecha» y, si se terminó después, cuándo (primer cierre posterior al corte) */
      const x=CTX&&CTX[o.id], ev=x&&Array.isArray(x.eventos)&&x.eventos.length?x.eventos:null, des=ev?(ev.filter(e=>e.a==='finish'&&dayOf(e.t)>dc)[0]||{}).t:(o.st==='completed'?o.fa:null);
      row(b4,[td('AMJ-'+o.ref+' · '+code(o),'nwr'),o.work,des?'Terminada después, el '+dm(dayOf(des)):live?(o.st==='rejected'?'Pendiente de asignar':(STATUS[o.st]||[o.st])[0]):'Abierta en esa fecha']) }); doc.append(t4) } }
  const ft=el('div','rf-ft'); ft.append(el('span',null,'amjmaintenance.es · Informe para '+cname),el('span',null,'ASSET MAINTENANCE · JUST IN TIME')); doc.append(ft);
  if(perErr||perCarga){ const w=el('div','rf-aviso',perErr?'No se han podido leer los periodos contractuales en el servidor, así que no se sabe si este cliente tiene cupo. El informe NO se puede enviar así: recarga el panel y, si se repite, avisa.':'Comprobando los periodos contractuales en el servidor…'); doc.insertBefore(w,doc.firstChild) }
  doc._rep={bloqueo:perErr?'No se han podido leer los periodos contractuales en el servidor: no se sabe si el cliente tiene cupo. No se puede enviar el informe. Recarga el panel.':perCarga?'Todavía se están comprobando los periodos contractuales. Espera unos segundos y vuelve a pulsar «Enviar por email».':'',cl:cls.join('+'),cname,one,tipo:MS?'mensual':QN?'quincenal':WK?'semanal':'diario',d0,d1,per:MS?per:WK?per.replace(/^.* · /,''):dlong,ids:L.map(o=>o.id),refs:L.map(o=>o.ref),mat:WK,dc};
  return doc }
/* ---------- envío de informes por email (función amj-informes-enviar: PDF adjunto) ---------- */
const REP_COPIA='antonio@amjmaintenance.es';
function repModel(d){
  const tx=e=>(e?e.textContent:'').replace(/(\d) ★/g,'$1 / 5').replace(/(★+)(☆*)/g,(m,a,b)=>a.length+' / '+(a.length+b.length)).trim(), B=[], out={r1:tx(d.querySelector('.rf-tr b')),r2:tx(d.querySelector('.rf-tr span')),foot:tx(d.querySelector('.rf-ft span')),blocks:B};
  for(const e of d.children){ const c=e.classList;
    if(c.contains('rf-h1')) B.push({t:'h1',x:tx(e)}); else if(c.contains('rf-sub')) B.push({t:'sub',x:tx(e)}); else if(c.contains('rf-h2')) B.push({t:'h2',x:tx(e)});
    else if(c.contains('rf-live')) B.push({t:'live',x:tx(e)}); else if(c.contains('rf-note')) B.push({t:'note',x:tx(e)});
    else if(c.contains('rf-intro')){ const b=e.querySelector('b'); B.push({t:'p',b:b?tx(b):'',x:[...e.childNodes].filter(n=>n!==b).map(n=>n.textContent).join('').trim()}) }
    else if(c.contains('rf-kp')) B.push({t:'tiles',cols:c.contains('rf-kpi')?4:0,items:[...e.children].map(k=>[tx(k.querySelector('b')),tx(k.querySelector('span'))])});
    else if(c.contains('rf-steps')) B.push({t:'steps',items:[...e.children].map(k=>tx(k.querySelector('span')))});
    else if(c.contains('rf-bars')) B.push({t:'bars',items:[...e.children].map(k=>[tx(k.querySelector('span')),Number(tx(k.querySelector('em')))||0])});
    else if(c.contains('rf-sp')) B.push({t:'spend',items:[...e.children].map(k=>({k:tx(k.querySelector('span')),s:tx(k.querySelector('small')),a:tx(k.querySelector('b')),p:tx(k.querySelector('em')),f:(parseFloat(k.querySelector('u').style.width)||0)/100}))});
    else if(e.tagName==='TABLE'){ const ths=[...e.querySelectorAll('thead th')]; let w=ths.map(h=>h.getBoundingClientRect().width); if(!w.every(x=>x>0)) w=ths.map(()=>1);
      const right=ths.map((h,i)=>c.contains('mat')&&i>=3);
      B.push({t:'table',head:ths.map(tx),w,right,rows:[...e.querySelectorAll('tbody tr')].map(r=>{ const tds=[...r.children]; if(tds.length===1&&tds[0].colSpan>1) return {span:true,c:[tx(tds[0])]};
        return {k:r.className||'',c:tds.map(td=>{ const b=td.querySelector('b'); if(!b) return tx(td); const rest=[...td.childNodes].filter(n=>n!==b).map(n=>n.nodeName==='BR'?'\n':n.textContent).join(''); return {b:tx(b),x:rest.replace(/(\d) ★/g,'$1 / 5')} })} })}) }
    else if(c.contains('rf-og')) B.push({t:'photos',title:tx(e.querySelector('.rf-oh')),paths:(MED[e._m.id]||[]).map(m=>m.object_path)});
    else if(e._m&&(e._m.t==='line'||e._m.t==='donuts')) B.push(e._m);
  }
  return out }
function repLogo(){ const im=document.querySelector('.brand img'); if(!im||!im.naturalWidth) return ''; try{ const s=Math.min(1,640/im.naturalWidth), cv=document.createElement('canvas'); cv.width=Math.round(im.naturalWidth*s); cv.height=Math.round(im.naturalHeight*s); const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,cv.width,cv.height); x.drawImage(im,0,0,cv.width,cv.height); return cv.toDataURL('image/jpeg',.92) }catch(e){ return '' } }
/* Visor propio (PDF.js): no depende del visor del navegador ni de extensiones como Adobe Acrobat */
let pdfjsP=null;
const repVend=f=>new URL('vendor/'+f,document.baseURI).href;
function repPdfJs(){ return pdfjsP||(pdfjsP=import(repVend('pdf.min.mjs')).then(L=>{ L.GlobalWorkerOptions.workerSrc=repVend('pdf.worker.min.mjs'); return L }).catch(()=>{ pdfjsP=null; throw new Error('no se pudo cargar el visor') })) }
async function repPdfView(bytes,host){ host.textContent='Abriendo el PDF…'; const datos=bytes.slice(0), h=await repSha(datos); /* huella de los bytes EXACTOS que se entregan al visor */
  const L=await repPdfJs(), pdf=await L.getDocument({data:datos,standardFontDataUrl:repVend('standard_fonts/'),isEvalSupported:false}).promise; host.textContent=''; host.dataset.sha256=h;
  const wCss=Math.min(host.clientWidth-24,900), dpr=Math.min(window.devicePixelRatio||1,2);
  for(let n=1;n<=pdf.numPages;n++){ const pg=await pdf.getPage(n), v0=pg.getViewport({scale:1}), vp=pg.getViewport({scale:wCss/v0.width*dpr}), cv=document.createElement('canvas'); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height); cv.style.width=wCss+'px'; cv.className='rpmp'; host.append(cv); await pg.render({canvas:cv,canvasContext:cv.getContext('2d'),viewport:vp}).promise } }
async function repCall(body){ const r=await fetch(SB+'/functions/v1/amj-informes-enviar',{method:'POST',headers:{...(await authHdr()),'Content-Type':'application/json'},body:JSON.stringify(body)}); let j={}; try{ j=await r.json() }catch(e){} if(!r.ok||!j.ok){ const er=new Error(j.error||('HTTP '+r.status)); er.codigo=j.codigo||''; er.http=r.status; er.j=j; throw er } return j }
const repSha=async u=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',u))].map(x=>x.toString(16).padStart(2,'0')).join('');
let repLibera=[]; /* archivos (direcciones blob) de la ventana de envío, para liberarlos al cerrarla */
function repSendClose(){ const o=$('rpm'); if(o) o.remove(); repLibera.forEach(u=>{ try{ URL.revokeObjectURL(u) }catch(e){} }); repLibera=[] }
/* Envíos sin confirmar (segunda revisión, punto 4): el servidor guarda el envío y su PDF sellado; al recargar o reabrir el panel se pueden ver y retomar. */
let PEND, pendP;
function repPend(force){ if(force){ pendP=null } if(pendP) return pendP; return pendP=repCall({accion:'pendientes'}).then(j=>{ const a=j.envios||[], antes=(PEND||[]).length; PEND=a; if(a.length!==antes&&sec==='informes'&&!$('rpm')) renderSec() }).catch(()=>{ PEND=PEND||[] }) }
function repPendOpen(){ repSendClose(); const fdl=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  const ov=el('div','rpm'); ov.id='rpm'; const box=el('div','rpmb'); ov.append(box); const hd=el('div','rpmh'); const x=el('button','out','✕ Cerrar'); x.onclick=()=>{ repSendClose(); if(sec==='informes') renderSec() }; hd.append(el('h3',null,'Envíos sin confirmar'),x); box.append(hd);
  box.append(el('div','rpmw','Estos envíos se pidieron y no llegó la confirmación del servicio de correo. Se guardó el PDF exacto de cada uno. «Reintentar el mismo envío» usa ese mismo PDF y la misma referencia: si el correo ya había salido, no se duplica.'));
  (PEND||[]).forEach(e=>{ const card=el('div','rpmc'); card.dataset.clave=e.clave; card.append(el('h4',null,'Informe '+e.tipo+' · '+clName(e.cliente)+' · '+(e.desde===e.hasta?fdl(e.desde):fdl(e.desde)+' – '+fdl(e.hasta))));
    const dato=(a,b)=>{ const d=el('div','rpmh2'); d.append(el('b',null,a+': '),document.createTextNode(b)); card.append(d) };
    dato('Para',e.para.join(', ')+(e.copia?' · copia a '+e.copia:'')); dato('Asunto',e.asunto); dato('Pedido el',new Date(e.creado).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}));
    dato('Estado',e.caducado?'caducado (más de 23 horas)':e.estado==='pendiente'?'en curso en el servicio de correo':'sin respuesta: no se sabe si salió'); dato('Archivo',e.archivo+' · '+(e.bytes/1048576).toFixed(1).replace('.',',')+' MB · huella '+e.sha256.slice(0,12)+'…');
    const st=el('div','rpms'), say=(t,k)=>{ st.textContent=t; st.className='rpms'+(k?' '+k:'') };
    if(e.caducado){ say('Han pasado más de 23 horas: el PDF guardado se ha eliminado y ya no se puede garantizar que un reintento no se duplique. Comprueba en la copia de AMJ si llegó; para enviarlo de nuevo, genera el informe y cambia el asunto.','err'); card.append(st); box.append(card); return }
    const bar=el('div','rpma'), bv=el('button','out','📄 Ver el PDF guardado'), bs=el('button','go','↻ Reintentar el mismo envío'), fot=el('div','rpmf'), busy=b=>{ bv.disabled=bs.disabled=b }; bar.append(bv,bs); card.append(bar,fot,st);
    bv.onclick=async()=>{ busy(true); say('Recuperando el PDF guardado…');
      try{ const j=await repCall({accion:'recuperar',clave:e.clave}); const bin=atob(j.pdf_b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
        if(await repSha(u)!==e.sha256||u.length!==e.bytes) throw new Error('el archivo recuperado no coincide con el registrado');
        const url=URL.createObjectURL(new Blob([u],{type:'application/pdf'})); repLibera.push(url); fot.textContent=''; const dl=el('a','rpmlk','Descargar este PDF'); dl.href=url; dl.download=e.archivo; fot.append(dl);
        say('Este es el PDF que se adjuntó en el intento (huella '+e.sha256.slice(0,12)+'…).','ok'); const old=card.querySelector('.rpmv'); if(old) old.remove(); const host=el('div','rpmv'); card.append(host); box.classList.add('wide');
        try{ await repPdfView(u,host) }catch(e2){ host.textContent='No se pudo mostrar aquí el PDF ('+e2.message+'). Usa «Descargar este PDF».' } }
      catch(er){ say('No se pudo recuperar el PDF: '+er.message,'err') } finally{ busy(false) } };
    bs.onclick=async()=>{ if(bs.dataset.ok!=='1'){ bs.dataset.ok='1'; bs.textContent='↻ Confirmar: reintentar el envío a '+e.para.join(', '); say('Pulsa otra vez para confirmar. Se usará el mismo PDF y la misma referencia de envío.'); return }
      busy(true); say('Reintentando…');
      try{ const j=await repCall({accion:'reintentar',clave:e.clave}); say((j.ya_enviado?'Ya constaba como enviado: no se ha repetido. ':'Enviado a '+j.para.join(', ')+'. ')+'Adjunto '+j.archivo+' (huella '+j.sha256.slice(0,12)+'…).','ok'); bs.textContent='✓ Enviado'; bv.disabled=false; repPend(true) }
      catch(er){ busy(false); bs.dataset.ok=''; bs.textContent='↻ Reintentar el mismo envío'; say((er.codigo==='ENVIO_DESHABILITADO'?'Versión de pruebas: el envío real está apagado. El envío guardado y su PDF son correctos. ':'')+er.message,'err'); if(['ENVIO_NO_ENCONTRADO','ENVIO_INCIERTO_ANTIGUO','PDF_NO_DISPONIBLE'].includes(er.codigo)){ bs.disabled=true; repPend(true) } } };
    box.append(card) });
  if(!(PEND||[]).length) box.append(el('div','rpmh2','No hay ningún envío sin confirmar.'));
  /* Registro de envíos (30 días), para conciliar: qué se pidió, en qué quedó y qué pasó con el PDF guardado. Lo sirve el servidor; aquí solo se lee. */
  const reg=el('div','rpmc'); reg.id='repreg'; reg.append(el('h4',null,'Registro de envíos de informes · últimos 30 días'),el('div','rpmh2','Cargando…')); box.append(reg);
  repCall({accion:'registro'}).then(j=>{ reg.lastChild.remove(); const E=j.envios||[]; if(!E.length){ reg.append(el('div','rpmh2','Sin envíos registrados.')); return }
    const tb=el('table','rf-tb'), hr=el('tr'); ['Pedido','Cliente e informe','Para','Estado','PDF guardado','Huella'].forEach(h=>hr.append(el('th',null,h))); const th=el('thead'); th.append(hr); const bd=el('tbody'); tb.append(th,bd);
    const EST={enviado:'Enviado',rechazado:'No enviado',pendiente:'En curso',incierto:'Sin confirmar'}, f=t=>t?new Date(t).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}):'—';
    E.forEach(e=>{ const r=el('tr'); [f(e.creado_at),clName(({HELPHOUSING:'HELP'})[e.cliente]||e.cliente)+' · '+e.tipo+' · '+fdl(e.desde)+(e.hasta!==e.desde?' – '+fdl(e.hasta):''),(e.destinatarios||[]).join(', '),
      (e.sin_confirmar_caducado?'Sin confirmar (caducado)':EST[e.estado]||e.estado)+(e.ciclo>1?' · intento '+e.ciclo:'')+(e.detalle?' · '+e.detalle:''),e.guardado_at?(e.archivo_borrado_at?'retirado el '+f(e.archivo_borrado_at):'guardado'):'—',(e.sha256||'').slice(0,12)+'…'].forEach(c=>r.append(el('td',null,c))); bd.append(r) }); reg.append(tb) })
    .catch(er=>{ reg.lastChild.textContent='No se pudo leer el registro: '+er.message });
  document.body.append(ov) }
function repSendOpen(){
  const docs=[...document.querySelectorAll('#obody .rf')].filter(d=>d._rep); if(!docs.length) return;
  { const bl=docs.map(d=>d._rep.bloqueo).find(Boolean); if(bl){ repMsg=bl; renderSec(); return } }
  if(!CTX||docs.some(d=>!d._rep.ids.every(id=>CTX[id]&&CTX[id].mat_informe))){ repMsg=CTX===undefined?'Todavía se están comprobando los importes con el servidor. Espera unos segundos y vuelve a pulsar «Enviar por email».':'No se puede enviar: el servidor no ha dado el importe de materiales de todas las órdenes del informe.'; renderSec(); return }
  if(docs.some(d=>!d._rep.ids.every(id=>id in MED&&id in MAT))){ repMsg='Todavía se están cargando las fotos y los materiales. Espera unos segundos y vuelve a pulsar «Enviar por email».'; renderSec(); return }
  repSendClose();
  const ov=el('div','rpm'); ov.id='rpm'; const box=el('div','rpmb'); ov.append(box); const hd=el('div','rpmh'); const x=el('button','out','✕ Cerrar'); x.onclick=repSendClose; hd.append(el('h3',null,'Enviar por email'),x); box.append(hd);
  const logo=repLogo(), fdl=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  docs.forEach(d=>{ const R=d._rep, model=repModel(d), card=el('div','rpmc'), nombre='Informe '+R.tipo+' de servicio '+R.cname;
    const perTxt=R.tipo==='diario'?'del '+R.per:R.tipo==='mensual'?'de '+R.per:R.per, archivo='Informe_'+R.tipo+'_'+R.cl.replace(/\+/g,'-')+'_'+R.d0+(R.d1!==R.d0?'_'+R.d1:'');
    card.append(el('h4',null,nombre+' · '+(R.tipo==='diario'?fdl(R.d0):R.per)));
    if(!R.one){ card.append(el('div','rpmw','Este informe mezcla órdenes de varios clientes. Vuelve atrás y marca solo las de un cliente para poder enviarlo.')); box.append(card); return }
    const KEY2='amj.panel.repto.'+R.cl; let saved=''; try{ saved=localStorage.getItem(KEY2)||'' }catch(e){}
    const fld=(lab,inp)=>{ const l=el('label','rpml'); l.append(el('span',null,lab),inp); card.append(l); return inp };
    const to=fld('Para (correo del cliente; varios separados por coma)',el('input')); to.type='text'; to.value=saved; to.placeholder='nombre@cliente.com'; to.autocomplete='off';
    const su=fld('Asunto',el('input')); su.type='text'; su.value=nombre+' · '+(R.tipo==='diario'?fdl(R.d0):R.per);
    const tx=fld('Texto del correo',el('textarea')); tx.rows=9; tx.value='Buenas tardes,\n\nAdjuntamos el informe '+R.tipo+' de servicio de '+R.cname+' '+perTxt+'.\n\nEn el PDF encontrará el detalle de las intervenciones por inmueble, con el informe del técnico y las fotografías de cada trabajo'+(R.mat?', y la relación de materiales':'')+'.\n\nQuedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nAntonio Martins Junior\nAMJ Maintenance · Asset maintenance, just in time';
    const cc=el('input'); cc.type='checkbox'; cc.checked=false; /* la copia a AMJ se marca sola al comprobar el PDF, salvo en la versión de pruebas (solo destinatarios ficticios) */ const ccl=el('label','rpmk'), cct=el('span',null,' Enviarme una copia a '+REP_COPIA); ccl.append(cc,cct); card.append(ccl);
    const st=el('div','rpms'), bar=el('div','rpma'), bv=el('button','out','📄 Ver el PDF que se enviará'), bs=el('button','go','✉ Enviar ahora'); bar.append(bv,bs); card.append(bar,st);
    const base=()=>({docs:[model],logo,archivo,informe:{cliente:R.cl,tipo:R.tipo,desde:R.d0,hasta:R.d1,corte:R.dc,refs:R.refs}}), say=(t,k)=>{ st.textContent=t; st.className='rpms'+(k?' '+k:'') }, busy=b=>{ bv.disabled=b; bs.disabled=b||!gate.ok };
    /* ENSAYO: antes de poder pulsar «Enviar» se lee de la función desplegada (lectura sin efectos) si el envío real está apagado.
       Fase A: solo se sigue con envío real = no y solo ficticios = sí. Sin respuesta, o con un valor inesperado, no se puede enviar. */
    const conPuerta=!!(ENSAYO&&ENT&&ENT.fase), gate={ok:!conPuerta}, gl=el('div','rpmg'); if(conPuerta) card.insertBefore(gl,bar);
    const compruebaApagado=async()=>{ if(!conPuerta) return true; gate.ok=false; bs.disabled=true; gl.className='rpmg'; gl.textContent='Comprobando en la función desplegada si el envío real está apagado…';
      try{ const j=await repCall({accion:'estado'}); if(typeof j.envio_real!=='boolean'||typeof j.solo_ficticios!=='boolean') throw new Error('la función no ha dicho con claridad si el envío está apagado');
        const bien=ENT.fase==='A'?(j.envio_real===false&&j.solo_ficticios===true):j.solo_ficticios===true;
        gl.textContent='Función desplegada · envío real: '+(j.envio_real?'ENCENDIDO':'apagado')+' · solo destinatarios ficticios: '+(j.solo_ficticios?'sí':'NO')+(bien?'':' · FASE '+ENT.fase+' DETENIDA: '+(ENT.fase==='A'?'el envío debe estar apagado y admitir solo destinatarios ficticios.':'solo se admiten destinatarios ficticios.')+' No se puede pulsar «Enviar».');
        gl.classList.add(bien?'ok':'alto'); gate.ok=bien }
      catch(e){ gl.textContent='No se ha podido comprobar en la función desplegada si el envío está apagado ('+(e.message||'sin respuesta')+'). No se puede pulsar «Enviar».'; gl.classList.add('alto'); gate.ok=false }
      bs.disabled=!gate.ok; return gate.ok };
    compruebaApagado();
    /* Un solo PDF: el que se genera en «Ver» es el que se ve, se descarga y se adjunta. `prev` guarda esos bytes y el sello del servidor. */
    let prev=null, incierto=false; const fot=el('div','rpmf'); card.insertBefore(fot,st);
    const pintaFotos=()=>{ fot.textContent=''; fot.className='rpmf'; if(!prev) return; const f=prev.fotos;
      fot.append(el('b',null,'Fotos: '),document.createTextNode(f.solicitadas+' solicitadas · '+f.incluidas+' incluidas en el PDF · '+f.faltan+(f.faltan===1?' no se ha podido cargar':' no se han podido cargar')+'.'));
      if(f.plazo_agotado) fot.append(el('div',null,'El servidor agotó el tiempo de carga de las fotos: las que faltan no han entrado. Vuelve a generar el PDF o envía un periodo más corto.'));
      if(f.faltan){ fot.classList.add('warn'); fot.append(el('div',null,'Faltan en: '+f.detalle.map(d=>d.titulo.split(' · ')[0]+' ('+d.n+')').join(', ')+'. Si las necesitas, cierra, espera y vuelve a generar el PDF.')) }
      if(prev.cliente) fot.append(el('div',null,'Cliente comprobado por el servidor: '+prev.cliente.nombre+' · '+R.refs.length+(R.refs.length===1?' orden':' órdenes')+', todas suyas.'));
      if((prev.prefijo||[]).length){ fot.classList.add('warn'); fot.append(el('div',null,'Órdenes identificadas solo por el código del inmueble (sin ficha de cliente): '+prev.prefijo.map(r=>'AMJ-'+r).join(', ')+'.')) }
      const D=prev.dest; if(D){ const dd=el('div','rpmd'); if(D.solo_ficticios){ cc.checked=false; cc.disabled=true; cct.textContent=' Sin copia: en la versión de pruebas no se envía nada a correos reales ('+REP_COPIA+').' } else if(!cc.dataset.t){ cc.checked=true }
        if(D.solo_ficticios) dd.textContent='Versión de pruebas: solo se admiten destinatarios ficticios (por ejemplo, nombre@prueba.example).';
        else if(!D.autorizados.length){ fot.classList.add('warn'); dd.textContent='Este cliente no tiene destinatarios autorizados. Hay que darlos de alta antes de poder enviar.' }
        else { dd.append(document.createTextNode('Destinatarios autorizados de este cliente: '+D.autorizados.join(', ')+'. ')); const u=el('a','rpmlk','Usar estos'); u.href='#'; u.onclick=ev=>{ ev.preventDefault(); to.value=D.autorizados.join(', '); reinicia() }; dd.append(u) }
        fot.append(dd) }
      const dl=el('a','rpmlk','Descargar este PDF'); dl.href=prev.url; dl.download=prev.archivo; fot.append(dl); /* fijo junto a los datos del archivo: los mensajes de estado no lo borran */
      fot.append(el('div','rpmh2','Archivo: '+prev.archivo+' · '+prev.paginas+(prev.paginas===1?' página':' páginas')+' · '+(prev.bytes.length/1048576).toFixed(1).replace('.',',')+' MB · huella '+prev.sha.slice(0,12)+'…')); fot.lastChild.title='SHA-256 completo: '+prev.sha; fot.lastChild.dataset.sha256=prev.sha };
    const reinicia=()=>{ if(bs.dataset.ok==='1'&&!bs.disabled){ bs.dataset.ok=''; bs.textContent='✉ Enviar ahora' } if(incierto){ incierto=false; say('Has cambiado los datos del envío: ya no es un reintento del anterior. Tendrás que confirmarlo de nuevo.') } };
    bv.onclick=async()=>{ busy(true); say('Comprobando fotos y materiales…'); prev=null; pintaFotos(); reinicia();
      try{ let cambian; try{ cambian=await repRefresh(R.ids) }catch(e0){ say('No se han podido releer las fotos y los materiales ('+(e0.message||'error de conexión')+'). No se genera el PDF con datos sin comprobar: vuelve a intentarlo.','err'); return }
        let camM; try{ camM=await repCtxReload(R.ids) }catch(e0){ say('No se han podido comprobar los importes de materiales con el servidor ('+(e0.message||'error de conexión')+'). No se genera el PDF.','err'); return }
        if(camM.length){ const refs=camM.map(id=>'AMJ-'+R.refs[R.ids.indexOf(id)]).join(', '); repSendClose(); repMsg='El importe de materiales de '+refs+' ha cambiado en el servidor desde que abriste el informe. Se ha actualizado: revísalo y vuelve a pulsar «Enviar por email».'; renderSec(); return }
        if(cambian.length){ const refs=cambian.map(id=>'AMJ-'+R.refs[R.ids.indexOf(id)]).join(', '); repSendClose(); repMsg='Las fotos o los materiales de '+refs+' han cambiado desde que abriste el informe. Se ha actualizado: revísalo y vuelve a pulsar «Enviar por email».'; renderSec(); return }
        say('Generando el PDF… (puede tardar si hay muchas fotos)'); const j=await repCall({...base(),accion:'pdf'}); const bin=atob(j.pdf_b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
        const sha=await repSha(u); if(sha!==j.sha256||u.length!==j.bytes) throw new Error('el archivo recibido no coincide con el generado por el servidor; vuelve a intentarlo');
        const url=URL.createObjectURL(new Blob([u],{type:'application/pdf'})); repLibera.push(url);
        prev={bytes:u,b64:j.pdf_b64,sha,sello:j.sello,caduca:j.caduca,cliente:j.cliente,prefijo:j.ordenes_por_prefijo,dest:j.destinatarios,fotos:j.fotos,paginas:j.paginas,archivo:j.archivo||(archivo+'.pdf'),url}; pintaFotos();
        say('PDF listo. Es el archivo que se adjuntará: revísalo antes de enviar. ','ok');
        const old=card.querySelector('.rpmv'); if(old) old.remove(); const host=el('div','rpmv'); card.append(host); box.classList.add('wide'); host.scrollIntoView({behavior:'smooth',block:'nearest'});
        try{ await repPdfView(u,host); if(host.dataset.sha256!==sha) throw new Error('el visor ha recibido un archivo distinto del sellado') }catch(e2){ host.textContent='No se pudo mostrar aquí el PDF ('+e2.message+'). Usa «Descargar este PDF».' } }
      catch(e){ const J=e.j||{}, L2=(t,a)=>a&&a.length?' '+t+': '+a.map(r=>'AMJ-'+r).join(', ')+'.':'';
        say('No se pudo generar el PDF: '+e.message+(e.codigo==='CLIENTE_NO_COINCIDE'?L2('De otro cliente',J.ordenes_ajenas)+L2('De prueba',J.ordenes_de_prueba)+L2('Canceladas',J.ordenes_canceladas)+L2('No encontradas',J.ordenes_no_encontradas)+(J.fotos_ajenas?' Fotos que no son de estas órdenes: '+J.fotos_ajenas+'.':''):''),'err') } finally{ busy(false) } };
    bs.onclick=async()=>{ const para=to.value.split(/[,;\s]+/).map(v=>v.trim()).filter(Boolean); if(!para.length||!para.every(v=>/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v))){ say('Escribe un correo de destinatario válido.','err'); to.focus(); return }
      if(para.length>5){ say('Demasiados destinatarios ('+para.length+'). El máximo es 5.','err'); return }
      if(!su.value.trim()||!tx.value.trim()){ say('Faltan el asunto o el texto.','err'); return }
      if(!prev){ say('Primero pulsa «Ver el PDF que se enviará» y revísalo: se envía exactamente ese archivo.','err'); return }
      if(prev.dest){ const A=prev.dest.autorizados.map(v=>v.toLowerCase()), fuera=prev.dest.solo_ficticios?para.filter(v=>!/\.(example|test|invalid)$/i.test(v)):para.filter(v=>!A.includes(v.toLowerCase()));
        if(fuera.length){ say(prev.dest.solo_ficticios?'Versión de pruebas: solo destinatarios ficticios (nombre@prueba.example). No vale: '+fuera.join(', ')+'.':A.length?'No están autorizados para este cliente: '+fuera.join(', ')+'. Autorizados: '+prev.dest.autorizados.join(', ')+'.':'Este cliente no tiene destinatarios autorizados.','err'); return } }
      if(Date.now()>prev.caduca&&!incierto){ prev=null; pintaFotos(); const v=card.querySelector('.rpmv'); if(v) v.remove(); say('La vista previa ha caducado (30 minutos). Pulsa otra vez «Ver el PDF que se enviará», revísalo y vuelve a enviar.','err'); return }
      if(bs.dataset.ok!=='1'&&!incierto){ bs.dataset.ok='1'; bs.textContent='✉ Confirmar: enviar a '+para.join(', '); say('Pulsa otra vez para confirmar el envío a '+para.join(', ')+(prev.fotos.faltan?'. Atención: en el PDF faltan '+prev.fotos.faltan+' fotos.':'.')); return }
      busy(true); say('Enviando…'); if(!(await compruebaApagado())){ busy(false); say('Envío detenido: la función desplegada no confirma el estado exigido para este ensayo.','err'); return }
      try{ const j=await repCall({accion:'enviar',sello:prev.sello,pdf_b64:prev.b64,para,copia:cc.checked?REP_COPIA:'',asunto:su.value.trim(),texto:tx.value.trim()}); try{ localStorage.setItem(KEY2,para.join(', ')) }catch(e){}
        if(j.registro_pendiente){ incierto=true; repPend(true); busy(false); bs.dataset.ok='1'; bs.textContent='↻ Reintentar el mismo envío'; say(j.aviso||'El correo ha salido, pero no ha quedado anotado. Pulsa «Reintentar el mismo envío»: no se enviará otra vez.','err'); return }
        incierto=false; repPend(true); say('Enviado a '+j.para.join(', ')+(cc.checked?' · copia a '+REP_COPIA:'')+' · adjunto '+j.archivo+' (huella '+j.sha256.slice(0,12)+'…).','ok'); bs.textContent='✓ Enviado'; bv.disabled=false; [to,su,tx,cc].forEach(i=>i.disabled=true) }
      catch(e){ busy(false);
        if(e.codigo==='RESULTADO_INCIERTO'||(!e.http&&!e.codigo)){ incierto=true; repPend(true); bs.dataset.ok='1'; bs.textContent='↻ Reintentar el mismo envío'; say('No se sabe si el correo ha salido: no llegó la respuesta. Pulsa «Reintentar el mismo envío» sin cambiar nada; si ya había salido, no se duplicará.','err') }
        else if(e.codigo==='ENVIO_DESHABILITADO'){ bs.dataset.ok=''; bs.textContent='✉ Enviar ahora'; say('Versión de pruebas: el envío real está deshabilitado. El PDF y los datos del envío se han comprobado y son correctos (huella '+(e.j.sha256||'').slice(0,12)+'…).') }
        else if(e.codigo==='EN_CURSO'){ incierto=true; repPend(true); bs.dataset.ok='1'; bs.textContent='↻ Reintentar el mismo envío'; say(e.message,'err') }
        else if(['ENVIO_PENDIENTE_OTRO_PDF','YA_ENVIADO_OTRO_PDF','ENVIO_INCIERTO_ANTIGUO'].includes(e.codigo)){ bs.dataset.ok=''; bs.textContent='✉ Enviar ahora'; say('No se envió: '+e.message,'err') }
        else { if(e.http===409){ prev=null; pintaFotos(); const v=card.querySelector('.rpmv'); if(v) v.remove() } bs.dataset.ok=''; bs.textContent='✉ Enviar ahora'; say('No se envió: '+e.message,'err') } } };
    to.oninput=su.oninput=tx.oninput=reinicia; cc.onchange=()=>{ cc.dataset.t='1'; reinicia() }; /* cualquier cambio en destinatario, asunto, texto o copia exige confirmar otra vez */
    box.append(card) });
  document.body.append(ov) }
/* Bloque 4 · Aviso interno (no forma parte del informe ni del PDF): lo declarado por el técnico frente al justificante de compra.
   Importe declarado = líneas de material de la orden. Coste acreditado = justificantes aprobados. El importe a facturar lo decide AMJ. */
/* Materiales del informe de cliente empresa (decisiones de Antonio, 21, 22 y 27/11/2026). Fuente única: mat_informe, que calcula el servidor.
   Al cliente se le cobra la BASE del documento (la del ticket aprobado o, sin ticket, la de lo autorizado por AMJ), que es el coste base de
   AMJ, y AMJ le suma el 21 % en la factura porque es lo que dice la ley del IVA. La base la da el servidor en base_cobro; sin ese dato NO se
   muestra ningún importe (nunca lo declarado) y el informe no se puede enviar. Un material sin ticket aprobado ni autorización no entra. */
/* Antes de sellar un PDF se vuelve a pedir el contexto al servidor: devuelve las órdenes cuyo importe de materiales ha cambiado. Lanza error si no llega. */
async function repCtxReload(ids){ const a=await rpc('amj_admin_informe_ordenes',{}); if(!Array.isArray(a)) throw new Error('respuesta incompleta del servidor'); const N={}; a.forEach(x=>N[x.id]=x);
  const f=x=>JSON.stringify(x&&x.mat_informe||null); if(ids.some(id=>!N[id]||!N[id].mat_informe)) throw new Error('falta el importe de materiales de alguna orden'); const cambian=ids.filter(id=>f(CTX&&CTX[id])!==f(N[id])); CTX=N; return cambian }
function repMat(o){ const x=CTX&&CTX[o.id], mi=x&&x.mat_informe; if(!mi||mi.fuente==='pendiente'||mi.fuente==='sin_materiales') return [];
  const b=Math.round(Number(mi.base_cobro||0)*100)/100; if(!(b>0)) return []; const iva=Math.round(b*21)/100, D=MAT[o.id]||[];
  return [{description:D.map(m=>(m.description||'—')+(Number(m.quantity||1)!==1?' × '+Number(m.quantity):'')).sort().join('; ')||'Materiales',quantity:1,subtotal:b,iva:iva,total:Math.round((b+iva)*100)/100,fuente:mi.fuente}] }
const repMatListo=L=>!!CTX&&L.every(o=>CTX[o.id]&&CTX[o.id].mat_informe);
function repMatCheck(L){ const box=el('div','repmsg repmat');
  if(!repMatListo(L)){ if(!L.some(o=>(MAT[o.id]||[]).length)&&CTX!==null) return null; box.textContent=CTX===undefined?'Materiales: comprobando importes…':'Materiales: el servidor no ha dado el importe de materiales de todas las órdenes. El informe no muestra materiales y no se puede enviar.'; return box }
  const conM=L.filter(o=>(MAT[o.id]||[]).length||repMat(o).length); if(!conM.length) return null;
  const F={ticket:'ticket aprobado',autorizado:'autorizado por AMJ sin ticket',pendiente:'sin ticket aprobado ni autorización'}, filas=[];
  conM.forEach(o=>{ const decl=(MAT[o.id]||[]).reduce((a,m)=>a+Number(m.total||0),0), mi=CTX[o.id].mat_informe, R=repMat(o), cli=R.length?Number(R[0].total):0;
    if(!(cli>0)) filas.push('AMJ-'+o.ref+': declarado '+eur2(decl)+' · '+(F[mi.fuente]||mi.fuente)+' · NO entra en el informe');
    else if(Math.abs(decl-cli)>=0.01) filas.push('AMJ-'+o.ref+': en el informe '+eur2(cli)+' ('+(F[mi.fuente]||mi.fuente)+') · declarado por el técnico '+eur2(decl)) });
  box.append(el('b',null,'Materiales (este aviso no sale en el informe): '),document.createTextNode('al cliente se le cobra la base del ticket aprobado o, sin ticket, la de lo autorizado por AMJ, más el 21 % de IVA.'+(filas.length?' Diferencias con lo declarado por el técnico:':' Coincide con lo declarado en todas las órdenes.')));
  if(filas.length){ const ul=el('ul'); filas.forEach(f=>ul.append(el('li',null,f))); box.append(ul) } else box.classList.add('ok'); return box }
const eur2=v=>Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
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
let VIG=null; /* avisos abiertos de la vigilancia del servidor (amj_admin_vigilancia); null = no se ha podido leer */
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
    try{ VIG=await rpc('amj_admin_vigilancia',{}) }catch(e){ if(e.message==='ACCESS_DENIED') throw e; VIG=null }
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
 informes:['Informes',()=>{ if(!repDay) repDay=todayStr();
   const MS=repPer==='mes', QN=repPer==='qui', WK=repPer==='sem'||QN||MS, PW=MS?'mes':QN?'quincena':'semana', DELA=MS?'del mes':'de la '+PW, ADJ=MS?'mensual':QN?'quincenal':'semanal';
   const ctl=el('div','repctl');
   const seg=el('div','seg'); [['dia','Diario'],['sem','Semanal'],['qui','Quincenal'],['mes','Mensual'],['tot','Total']].forEach(([k,t])=>{ const on=k!=='tot'; const b=el('button',repPer===k?'on':null,t+(on?'':' · por definir')); b.disabled=!on; b.onclick=()=>{ repPer=k; renderSec() }; seg.append(b) });
   const scl=el('select'); scl.append(new Option('Todos los clientes',''));
   [...new Set(real().map(o=>repCli(o)))].sort((x,y)=>clName(x).localeCompare(clName(y))).forEach(c=>scl.append(new Option(clName(c),c))); scl.value=repCl; scl.onchange=()=>{ repCl=scl.value; renderSec() };
   const dIn=el('input'); dIn.type='date'; dIn.value=repDay; dIn.max=todayStr(); dIn.onchange=()=>{ if(dIn.value){ repDay=dIn.value; renderSec() } };
   const addD=(d,n)=>{ const x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.toLocaleDateString('sv-SE') };
   const mv=n=>{ let v=addD(repDay,n); if(MS){ const a=repDay.slice(0,8); v=n<0?addD(a+'01',-1).slice(0,8)+'01':addD(a+'28',4).slice(0,8)+'01'; if(v.slice(0,7)===todayStr().slice(0,7)) v=todayStr() } if(QN){ const dd=+repDay.slice(8), a=repDay.slice(0,8); v=n<0?addD(a+(dd<=15?'01':'16'),-1):(dd<=15?a+'16':addD(a+'28',4).slice(0,8)+'01') } if(v<=todayStr()||n<0){ repDay=v>todayStr()?todayStr():v; renderSec() } };
   const st=WK?7:1, prev=el('button','out',MS?'◀ Mes anterior':QN?'◀ Quincena anterior':WK?'◀ Semana anterior':'◀ Día anterior'), next=el('button','out',MS?'Mes siguiente ▶':QN?'Quincena siguiente ▶':WK?'Semana siguiente ▶':'Día siguiente ▶'); prev.onclick=()=>mv(-st); next.onclick=()=>mv(st); prev.style.marginLeft=next.style.marginLeft='0';
   const pr=el('button','out','🖨 Imprimir / PDF'); pr.onclick=()=>window.print();
   const bVer=el('button','out'), bEnv=el('button','out'), bBack=el('button','out','◀ Volver a seleccionar'); bVer.style.marginLeft=bEnv.style.marginLeft=bBack.style.marginLeft='0';
   let selN=()=>0; const updSel=()=>{ const n=selN(); bVer.textContent='👁 Ver ('+n+')'; bEnv.textContent='✉ Enviar por email ('+n+')'; bVer.disabled=bEnv.disabled=!n };
   bVer.onclick=()=>{ repView=true; repMsg=''; renderSec() }; bBack.onclick=()=>{ repView=false; repMsg=''; renderSec() };
   bEnv.onclick=()=>{ repMsg=''; if(!repView){ repView=true; repAuto=true; renderSec(); return } repSendOpen() };
   if(repAuto){ repAuto=false; setTimeout(repSendOpen,0) }
   const row=el('div','repbar'); if(repView) row.append(bBack,bEnv); else row.append(scl,prev,dIn,next,bVer,bEnv); ctl.append(seg,row); if(repMsg) ctl.append(el('div','repmsg',repMsg));
   repPend(); if(PEND&&PEND.length){ const pb=el('div','repmsg reppend'), b=el('button','out','Ver y retomar'); b.onclick=repPendOpen; pb.append(document.createTextNode((PEND.length===1?'Hay 1 envío de informe sin confirmar. ':'Hay '+PEND.length+' envíos de informes sin confirmar. ')),b); ctl.append(pb) }
   { const lr=el('a','rpmlk','Registro de envíos'); lr.href='#'; lr.id='represg'; lr.onclick=ev=>{ ev.preventDefault(); repPendOpen() }; row.append(lr) }
   /* periodo */
   let d0=repDay, d1=repDay; if(WK){ const wd=(new Date(repDay+'T12:00:00').getDay()+6)%7; d0=addD(repDay,-wd); d1=addD(d0,6) }
   if(MS){ const a=repDay.slice(0,8); d0=a+'01'; d1=addD(addD(a+'28',4).slice(0,8)+'01',-1) }
   if(QN){ const a=repDay.slice(0,8); if(+repDay.slice(8)<=15){ d0=a+'01'; d1=a+'15' } else { d0=a+'16'; d1=addD(addD(a+'28',4).slice(0,8)+'01',-1) } }
   const fd=(d,o)=>new Date(d+'T12:00:00').toLocaleDateString('es-ES',o);
   const per=MS?(m=>m.charAt(0).toUpperCase()+m.slice(1))(fd(d1,{month:'long',year:'numeric'})):WK?((QN?(d0.slice(8)==='01'?'1.ª':'2.ª')+' quincena · del ':'Semana del ')+fd(d0,{day:'numeric',month:'long'})+' al '+fd(d1,{day:'numeric',month:'long',year:'numeric'})):(()=>{ const f=fd(repDay,{weekday:'long',day:'numeric',month:'long',year:'numeric'}); return f.charAt(0).toUpperCase()+f.slice(1) })();
   const dcL=d1>todayStr()?todayStr():d1, LA=real().filter(o=>{ if(repCl&&repCli(o)!==repCl) return false; const c=repCierreAl(o,dcL); return !!c&&repEstadoAl(o,dcL)!=='cancelada'&&dayOf(c.t)>=d0&&dayOf(c.t)<=dcL }).map(o=>{ const c=repCierreAl(o,dcL); return c.t===o.fa?o:Object.assign({},o,{fa:c.t}) }).sort((x,y)=>new Date(x.fa)-new Date(y.fa)||x.ref-y.ref);
   /* también los clientes con actividad anterior aunque no tengan cierres en el periodo: su informe (a cero) debe poder consultarse */
   const wcl=[...new Set((WK?real().filter(o=>(repCli(o)==='HELP'||repCli(o)==='ENSO')&&o.st!=='cancelled'&&dayOf(o.ca)<=d1&&(!repCl||repCli(o)===repCl)):LA).map(o=>repCli(o)).concat(LA.map(o=>repCli(o))))].sort((x,y)=>clName(x).localeCompare(clName(y)));
   selN=()=>WK?wcl.filter(c=>repSelW.has(c)).length:LA.filter(o=>repSel.has(o.id)).length;
   if(repView&&!selN()) repView=false;
   const L=repView?LA.filter(o=>repSel.has(o.id)):LA, SEL=!repView; updSel();
   const wrap=docs=>{ const w=el('div','repdoc rfw'); docs.forEach(d=>w.append(d)); return w };
   if(WK){ repEnsure(LA.map(o=>o.id)); repCtx(); repPers();
     if(repView){ const sel=wcl.filter(c=>repSelW.has(c)), chk=repMatCheck(LA.filter(o=>sel.includes(repCli(o)))); return [ctl].concat(chk?[chk]:[],[src('Así lo verá el cliente: el informe completo '+DELA+'.'),wrap(wcl.filter(c=>repSelW.has(c)).map(c=>repFmt(LA.filter(o=>repCli(o)===c),d0,d1,true,QN,MS,c)))]) }
     const card=el('div','repdoc'); card.append(el('h3','reph3','Informe '+ADJ+' · '+per));
     const tb=el('table','reptb sel wk'), hr=el('tr'); ['','Cliente','Órdenes finalizadas','Inmuebles identificados','Materiales con IVA'].forEach((h,i)=>hr.append(el('th',i?null:'ck',h))); const th=el('thead'); th.append(hr); const bd=el('tbody');
     if(!wcl.length){ const r=el('tr'), e=el('td','empty','No hay órdenes terminadas '+(MS?'este mes':'esta '+PW)+'.'); e.colSpan=5; r.append(e); bd.append(r) }
     wcl.forEach(c=>{ const G=LA.filter(o=>repCli(o)===c), r=el('tr'), k=el('td','ck'), ck=el('input'); ck.type='checkbox'; ck.checked=repSelW.has(c); ck.onchange=()=>{ ck.checked?repSelW.add(c):repSelW.delete(c); updSel() }; k.append(ck);
       r.append(k,el('td','b',clName(c)),el('td',null,String(G.length)),el('td',null,G.every(o=>CTX&&CTX[o.id])?String(repCuentaInmuebles(G)):'…'),el('td',null,G.every(o=>o.id in MAT)?eur2(G.reduce((a,o)=>a+repMat(o).reduce((x,m)=>x+Number(m.total||0),0),0)):'…')); bd.append(r) });
     tb.append(th,bd); card.append(tb);
     return [ctl,src('Informe '+ADJ+' completo de cada cliente, con todos los trabajos '+DELA+(MS?' y sus KPI':'')+'. Marca la casilla del cliente y pulsa «Ver» para verlo como lo recibirá, o «Enviar por email».'),card] }
   if(repView){ repEnsure(L.map(o=>o.id)); repCtx(); repPers(); const cs=new Set(L.map(o=>repCli(o))); const out=[ctl]; if(cs.size>1) out.push(el('div','repmsg','Has marcado órdenes de '+cs.size+' clientes distintos: para enviar, marca solo las de un cliente.')); out.push(src('Así lo verá el cliente: solo las órdenes que has marcado.'),wrap([repFmt(L,repDay,repDay,false)])); return out }
   repEnsure(L.map(o=>o.id));
   const doc=el('div','repdoc'); const hd=el('div','rephd'); const lg=document.querySelector('.brand img'); if(lg){ const im=el('img'); im.src=lg.src; im.alt='AMJ'; hd.append(im) }
   const tt=el('div'); tt.append(el('h2',null,(WK?'Informe semanal':'Informe diario')+(repCl?' · '+clName(repCl):'')),el('div','repsub',per+' · '+L.length+(L.length===1?' orden terminada':' órdenes terminadas')+(SEL?' · marca las que quieres ver y enviar':''))); hd.append(tt); doc.append(hd);
   const loaded=L.every(o=>o.id in MAT);
   const matTot=L.reduce((a,o)=>a+(MAT[o.id]||[]).reduce((x,m)=>x+Number(m.total||0),0),0);
   if(WK){ /* resumen */
     const vis=new Set(L.filter(o=>repInm(o)&&o.sa).map(o=>repInm(o)+'|'+dayOf(o.sa))).size;
     const box=el('div','repkp'); const k=(v,t)=>{ const d=el('div'); d.append(el('b',null,v),el('span',null,t)); box.append(d) };
     k(String(L.length),'órdenes terminadas'); k(String(vis),'visitas (piso + día)'); k(loaded?eur2(matTot):'…','materiales declarados por el técnico');
     if(repCl==='HELP'){ const m0=d1.slice(0,8)+'01'; const mv2=new Set(real().filter(o=>repCli(o)==='HELP'&&o.st!=='cancelled'&&o.sa&&dayOf(o.sa)>=m0&&dayOf(o.sa)<=d1&&repInm(o)).map(o=>repInm(o)+'|'+dayOf(o.sa))).size;
       k(mv2+' / 100','cupo del mes consumido al '+fd(d1,{day:'2-digit',month:'2-digit'})); k(String(Math.max(100-mv2,0)),'avisos disponibles') }
     doc.append(box); if(repCl==='HELP') doc.append(el('div','repnote','Cupo: 1 inmueble + día de inicio = 1 aviso (mismo criterio que el control de avisos).')) }
   /* tabla de órdenes */
   doc.append(el('h3','reph3',WK?'Órdenes terminadas':'Intervenciones'));
   const tb=el('table','reptb'+(SEL?' sel':'')), thr=el('tr'); const cks=[]; if(SEL){ const h=el('th','ck'), all=el('input'); all.type='checkbox'; all.title='Marcar todas'; all.checked=L.length>0&&L.every(o=>repSel.has(o.id)); all.onchange=()=>{ L.forEach(o=>all.checked?repSel.add(o.id):repSel.delete(o.id)); cks.forEach(c=>c.checked=all.checked); updSel() }; h.append(all); thr.append(h) } (WK?['Fecha','Orden','Cliente','Código piso','Informe técnico y fotos']:['Orden','Cliente','Código piso','Informe técnico y fotos']).forEach(h=>thr.append(el('th',null,h))); const th=el('thead'); th.append(thr); tb.append(th); const bd=el('tbody');
   if(!L.length){ const tr=el('tr'), td=el('td','empty',WK?'No hay órdenes terminadas esta semana.':'No hay órdenes terminadas este día.'); td.colSpan=(WK?5:4)+(SEL?1:0); tr.append(td); bd.append(tr) }
   L.forEach(o=>{ const tr=el('tr'); const r=el('td'); const tx=el('div',o.report?null:'muted',o.report||'(El técnico no escribió informe)'); tx.style.whiteSpace='pre-wrap'; r.append(tx,repPhotos(o));
     if(SEL){ const c=el('td','ck'), ck=el('input'); ck.type='checkbox'; ck.checked=repSel.has(o.id); ck.onchange=()=>{ ck.checked?repSel.add(o.id):repSel.delete(o.id); updSel() }; cks.push(ck); c.append(ck); tr.append(c) }
     if(WK) tr.append(el('td','nwr',fd(dayOf(o.fa),{day:'2-digit',month:'2-digit'})));
     tr.append(el('td','b','AMJ-'+o.ref),el('td',null,clName(repCli(o))),el('td','b',o.piso||o.ad||'—'),r); bd.append(tr) });
   tb.append(bd); doc.append(tb);
   /* materiales (semanal) */
   if(WK){ doc.append(el('h3','reph3','Materiales declarados por el técnico en la app'));
     const mt=el('table','reptb mat'), mh=el('tr'); ['Orden','Material','Cant.','Precio unid.','Base','IVA','Total'].forEach(h=>mh.append(el('th',null,h))); const mth=el('thead'); mth.append(mh); mt.append(mth); const mb=el('tbody');
     const withM=L.filter(o=>(MAT[o.id]||[]).length);
     if(!loaded){ const tr=el('tr'),td=el('td','empty','Cargando materiales…'); td.colSpan=7; tr.append(td); mb.append(tr) }
     else if(!withM.length){ const tr=el('tr'),td=el('td','empty','Esta semana no se han declarado materiales.'); td.colSpan=7; tr.append(td); mb.append(tr) }
     withM.forEach(o=>{ const M=MAT[o.id]; M.forEach((m,i)=>{ const tr=el('tr'); tr.append(el('td','b',i?'':'AMJ-'+o.ref+' · '+(o.piso||'')),el('td',null,m.description||'—'),el('td','r',String(Number(m.quantity||0))),el('td','r',eur2(m.unit_price)),el('td','r',eur2(m.subtotal)),el('td','r',eur2(m.iva)),el('td','r',eur2(m.total))); mb.append(tr) });
       const s=el('tr','sub'); const c=el('td',null,'Subtotal AMJ-'+o.ref); c.colSpan=4; s.append(c,el('td','r',eur2(M.reduce((a,m)=>a+Number(m.subtotal||0),0))),el('td','r',eur2(M.reduce((a,m)=>a+Number(m.iva||0),0))),el('td','r',eur2(M.reduce((a,m)=>a+Number(m.total||0),0)))); mb.append(s) });
     if(loaded&&withM.length){ const all=withM.flatMap(o=>MAT[o.id]); const t=el('tr','tot'); const c=el('td',null,'TOTAL MATERIALES DE LA SEMANA'); c.colSpan=4; t.append(c,el('td','r',eur2(all.reduce((a,m)=>a+Number(m.subtotal||0),0))),el('td','r',eur2(all.reduce((a,m)=>a+Number(m.iva||0),0))),el('td','r',eur2(all.reduce((a,m)=>a+Number(m.total||0),0)))); mb.append(t) }
     mt.append(mb); doc.append(mt, el('div','repnote','Materiales declarados por los técnicos.'));
     /* abiertas */
     const open=real().filter(o=>!['completed','cancelled'].includes(o.st)&&(!repCl||repCli(o)===repCl)&&dayOf(o.ca)<=d1);
     if(open.length){ doc.append(el('h3','reph3','Órdenes abiertas al cierre de la semana')); const ot=el('table','reptb'), oh=el('tr'); ['Orden','Código piso','Trabajo','Estado'].forEach(h=>oh.append(el('th',null,h))); const oth=el('thead'); oth.append(oh); ot.append(oth); const ob=el('tbody');
       open.forEach(o=>{ const tr=el('tr'); tr.append(el('td','b','AMJ-'+o.ref),el('td','b',o.piso||o.ad||'—'),el('td',null,o.work),el('td',null,(STATUS[o.st]||[o.st])[0])); ob.append(tr) }); ot.append(ob); doc.append(ot) } }
   doc.append(el('div','repft','ASSET MAINTENANCE · JUST IN TIME'));
   return [ctl,src(repView?'Así lo verá el cliente: solo las órdenes que has marcado.':'MAQUETA con datos reales (solo lectura): órdenes reales terminadas en el periodo, sin pruebas. Marca con la casilla las órdenes que quieres ver y enviar. Las fotos son las verificadas de cada orden; pulsa una para verla en grande.'),doc] }],
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
   /* 27/11/2026 · la vigilancia del servidor (asignaciones sin aceptar, borradores de factura parados, etc.) se ve aquí: el correo está apagado por decisión de Antonio */
   out.push(Array.isArray(VIG)?card('Vigilancia del servidor',['Desde','Aviso'],VIG.map(a=>[fmtD(a.desde),a.detalle||a.clave]),'El servidor no tiene avisos abiertos.'):card('Vigilancia del servidor',['Aviso'],[],'No se ha podido leer la vigilancia del servidor. Recarga la página.'));
   Object.keys(names).forEach(k=>{ if(by[k]) out.push(card(names[k],['Orden','Trabajo','Técnico','Aviso'],by[k].map(([o,l])=>({cells:['AMJ-'+o.ref+' · '+clName(o.cl),o.work,o.tc||'Sin asignar',l],onclick:()=>openDr(o)})))) });
   if(!A.length) out.push(card('Alertas de órdenes',['Orden'],[],'No hay alertas de órdenes ahora mismo.'));
   return out }]
};
function renderSec(){
  const n=real().filter(o=>o.st!=='cancelled'&&o.tags.some(t=>t[0]!=='test')).length+(Array.isArray(VIG)?VIG.length:0); $('alertn').textContent=n?String(n):'';
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
function logout(){ clearSession(); clearInterval(timer); O=[]; prevRev={}; lastOk=0; $('app').hidden=true; $('login').hidden=false; $('fab').hidden=true; nwClose(); repSendClose(); /* al salir se cierra la ventana del informe y se liberan sus archivos */ repSel=new Set(); repSelW=new Set(); repView=false; CTX=undefined; PERS=undefined; PEND=undefined; pendP=null; for(const k in MED) delete MED[k]; for(const k in MAT) delete MAT[k]; for(const k in THU){ try{ if(typeof THU[k]==='string'&&THU[k].startsWith('blob:')) URL.revokeObjectURL(THU[k]) }catch(e){} delete THU[k] } }
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
$('fab').onclick=nwOpen; $('newo').onclick=nwOpen; $('nwx').onclick=nwClose; $('nw').onclick=e=>{ if(e.target===$('nw')) nwClose() };
/* Hasta que el entorno esté comprobado, el formulario de entrada queda bloqueado y no se lee ninguna sesión guardada. */
const bloqueaEntrada=b=>['le','lp','lb'].forEach(i=>{ const x=$(i); if(x) x.disabled=b });
if(ENSAYO||LOCAL) bloqueaEntrada(true);
entornoListo.then(()=>{
  if(ENSAYO||LOCAL){ const b=el('div','ensayo-banda'+(ENT?' ok':' alto'),ENT?'ENSAYO · AMJ-Pruebas ('+(ENT.dobles?'servicios simulados en este ordenador':REF_PRUEBAS)+')'+(ENT.fase?' · fase '+ENT.fase+(ENT.fase==='A'?': envío apagado':''):'')+' · no es producción':'PANEL DETENIDO · '+ENT_ERR); b.id='ensayo-banda'; document.body.prepend(b);
    if(ENT) bloqueaEntrada(false); else $('lerr').textContent=ENT_ERR }
  session=ENT?loadSession():null; if(session) start() });
})();
