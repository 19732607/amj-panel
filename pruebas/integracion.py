"""Prueba conjunta panel + función. El panel real habla con la función real, que usa dobles de Supabase y del correo.
OJO: esta prueba intercepta las peticiones del panel y pone ella las cabeceras CORS; sirve para comprobar el CONTENIDO (panel = servidor),
no el inicio de sesión ni el CORS. Eso lo prueba pruebas/ensayo_local.py, sin interceptar nada.
Antes, en el repositorio amj-tecnicos-ios:  deno run --no-lock --allow-net=127.0.0.1,0.0.0.0:8000 --allow-env --allow-read tests/informes/envio/servidor_local.ts
Después:  python3 pruebas/integracion.py"""
import asyncio, base64, json, os, re, urllib.parse, urllib.request
CASOS = os.environ.get("AMJ_GUARDAR_CASOS")   # carpeta donde guardar, como casos para las pruebas del servidor, los informes reales que genera el panel
exec(open(__file__.replace("integracion.py", "envio_panel.py"), encoding="utf-8").read().split("ok = lambda")[0])
TOKEN = "x" * 12 + "." + base64.b64encode(json.dumps({"sub": "admin-1"}).encode()).decode() + "." + "y" * 12
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 950}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e)))
        ULT = {}
        def guarda(nombre):
            if not CASOS: return
            caso = dict(ULT["pdf"]); caso["modelo"] = json.loads(urllib.request.urlopen("http://127.0.0.1:54398/prueba/modelo").read()); caso["hoy"] = caso["informe"]["corte"] if caso["informe"]["corte"] < caso["informe"]["hasta"] else "2026-11-30"
            open(os.path.join(CASOS, nombre + ".json"), "w", encoding="utf-8").write(json.dumps(caso, ensure_ascii=False, indent=1))
        async def a_local(route):
            if route.request.method == "OPTIONS": return await route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"})
            try:
                c = json.loads(route.request.post_data)
                if c.get("accion") == "pdf": ULT["pdf"] = {"informe": c["informe"], "docs": c["docs"]}
            except Exception: pass
            r = urllib.request.Request("http://127.0.0.1:8000/", data=route.request.post_data.encode(), headers={"Authorization": "Bearer " + TOKEN, "apikey": "pk", "Content-Type": "application/json"}, method="POST")
            try: x = urllib.request.urlopen(r); st, body = x.status, x.read()
            except urllib.error.HTTPError as e: st, body = e.code, e.read()
            await route.fulfill(status=st, body=body, headers={"content-type": "application/json", "Access-Control-Allow-Origin": "*"})
        await pg.route("**/functions/v1/amj-informes-enviar", a_local)
        async def datos(route):
            u = route.request.url; ids = [i for i in (1, 2, 3) if re.search(r"in\.\(([\d,]*,)?%d(,[\d,]*)?\)" % i, urllib.parse.unquote(u))]
            await route.fulfill(json=[] if "amj_order_materials" in u else [{"id": "m%d" % i, "order_id": i, "object_path": "o/%d.jpg" % i} for i in ids])
        CTXS = [{"id": i, "mat_informe": {"total": 0, "fuente": "sin_materiales"}} for i in (1, 2)]; PERS = []
        await pg.route("**/rest/v1/rpc/amj_admin_informe_ordenes", lambda r: r.fulfill(json=CTXS))
        await pg.route("**/rest/v1/amj_service_media*", datos); await pg.route("**/rest/v1/amj_order_materials*", datos)
        await pg.goto("http://127.0.0.1:8791/beta/index.html?entorno=ensayo"); await pg.wait_for_selector("#ensayo-banda.ok"); await pg.evaluate(PREPARA)
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click(); await pg.wait_for_selector(".rpmv canvas")
        vista = await pg.evaluate("async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('') }")
        fotos = await pg.inner_text(".rpmf"); paginas = await pg.locator(".rpmv canvas").count()
        e = pg.locator(".rpma .go"); await e.click(); await e.click(); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')")
        cap = json.loads(urllib.request.urlopen("http://127.0.0.1:54398/").read())[-1]
        print("vista previa y descarga :", vista); print("adjunto capturado       :", cap["sha256"], "·", cap["archivo"], "·", cap["para"]); print("fotos:", fotos.split("\\n")[0], "· páginas en el visor:", paginas)
        assert vista == cap["sha256"] and not errores, (vista, cap, errores); assert "Cliente comprobado por el servidor: Cliente Ficticio" in fotos, fotos; print("OK · panel y función integrados: el adjunto es el archivo revisado y el cliente lo comprueba el servidor")
        # Segunda revisión: el informe MENSUAL real del panel (todos sus recuadros, detalle y fotos) pasa la comprobación completa del servidor,
        # y un recuadro alterado en el navegador hace que el servidor se niegue a sellarlo.
        await pg.route("**/rest/v1/rpc/amj_admin_informe_periodos", lambda r: r.fulfill(json=PERS))
        await pg.evaluate("()=>__t(`repSendClose(); repPer='mes'; repDay='2026-11-19'; repCl='FICT'; repSelW=new Set(['FICT']); repView=true; renderSec()`)"); await pg.wait_for_timeout(600); await pg.evaluate("()=>__t('repSendOpen()')")
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click()
        await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')"); est = await pg.inner_text(".rpms")
        rec = await pg.evaluate("()=>[...document.querySelectorAll('#obody .rf-kp > div')].map(d=>d.querySelector('b').textContent+' | '+d.querySelector('span').textContent)")
        assert await pg.locator(".rpmv canvas").count() > 0, (est, rec); print("OK · informe mensual del panel aceptado entero por el servidor ·", len(rec), "recuadros recalculados:", "; ".join(rec)); guarda("mensual_sin_cupo")
        for clave, nombre in (("sem", "semanal"), ("qui", "quincenal")):
            await pg.evaluate("c=>__t(`repSendClose(); repPer='${c}'; repDay='2026-11-19'; repCl='FICT'; repSelW=new Set(['FICT']); repView=true; renderSec()`)", clave); await pg.wait_for_timeout(500); await pg.evaluate("()=>__t('repSendOpen()')")
            await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click()
            await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')"); est = await pg.inner_text(".rpms")
            assert await pg.locator(".rpmv canvas").count() > 0, (nombre, est); print("OK · informe", nombre, "del panel aceptado entero por el servidor (cabecera, periodo, textos, tablas y fotos)")
        await pg.evaluate("()=>__t(`repSendClose(); repPer='mes'; repDay='2026-11-19'; repView=true; renderSec()`)"); await pg.wait_for_timeout(500)
        await pg.evaluate("()=>{ __t('repSendClose()'); const d=[...document.querySelectorAll('#obody .rf-kp > div')].find(d=>d.textContent.includes('menos de 48 h')); d.querySelector('b').textContent='50 %'; __t('repSendOpen()') }")
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click(); await pg.wait_for_function("document.querySelector('.rpms.err')"); est = await pg.inner_text(".rpms")
        assert "no coincide con los datos del servidor" in est and await pg.locator(".rpmv canvas").count() == 0, est; print("OK · recuadro alterado en el navegador: el servidor no sella el PDF ·", est[:150])
        # Con cupo contractual y materiales con ticket: el panel (periodos e inmuebles del servidor) y el modelo del servidor deben dar lo mismo.
        MAT2 = {"total": 9.5, "base": 7.85, "iva": 1.65, "fuente": "ticket"}
        CTXS[:] = [{"id": 1, "inmueble": "P1", "mat_informe": {"total": 0, "fuente": "sin_materiales"}}, {"id": 2, "inmueble": "P2", "mat_informe": MAT2}]; PERS[:] = [{"cliente": "FICT", "desde": "2026-11-01", "hasta": "2026-11-30", "cupo": 100}]
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:54398/prueba", data=json.dumps({"mats": {"902": MAT2}, "cupos": [{"desde": "2026-11-01", "hasta": "2026-11-30", "cupo": 100, "consumidos": 2, "disponibles": 98,
            "visitas": [{"dia": "2026-11-19", "inmueble": "P1", "refs": [901]}, {"dia": "2026-11-19", "inmueble": "P2", "refs": [902]}], "pendientes_clasificar": []}]}).encode(), method="POST"))
        await pg.evaluate("()=>__t(`repSendClose(); PERS=undefined; persP=null; CTX=undefined; ctxP=null; renderSec()`)"); await pg.wait_for_timeout(1200); await pg.evaluate("()=>__t('renderSec(); repSendOpen()')")
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click()
        await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')"); est = await pg.inner_text(".rpms"); t = await pg.inner_text("#obody")
        assert await pg.locator(".rpmv canvas").count() > 0 and "2 / 100" in t and "Cupo del periodo: 100. Saldo disponible al" in t and "9,50 €" in t, (est, t[:1500])
        print("OK · informe mensual con cupo (2 / 100, tabla de visitas) y materiales con ticket (9,50 € = 7,85 + 1,65): panel y servidor coinciden y el PDF se sella"); guarda("mensual_con_cupo")
        # ---- Cuarta revisión, punto 5 · recorrido completo del HISTÓRICO: una orden cerrada el 20/10 y CANCELADA el 08/11. El informe de octubre
        #      (corte 31/10) debe generarse entero, con su cupo, y el servidor debe aceptarlo. El modelo «del servidor» está escrito aquí a mano
        #      (lo que devuelve amj_informes_modelo para ese caso, comprobado en PostgreSQL local con la orden 921): no sale del panel.
        def modelo_oct(cancelada_antes):
            orden = {"ref": 995, "codigo": "FICT-P3", "direccion": "", "trabajo": "Trabajo del histórico", "informe": "Informe ficticio.", "inmueble": "P3", "alta": "2026-10-19T09:00:00Z", "inicio": "2026-10-20T09:00:00Z", "cierre": "2026-10-20T10:00:00Z",
                     "servicio": "Fontanería", "ciudad": "Ciudad", "tecnico": "Nombre", "mat_lineas": [], "reabierta_despues": False, "sin_ejecucion": False, "mat": {"total": 0, "fuente": "sin_materiales"}, "fotos": ["o/3.jpg"]}
            n = 0 if cancelada_antes else 1
            return {"cliente": "FICTICIO", "cliente_prefijo": "FICT", "cliente_nombre": "Cliente Ficticio", "con_cupo": True, "cerradas": [] if cancelada_antes else [orden], "abiertas": [], "recibidas": n,
                    "recibidas_ordenes": [] if cancelada_antes else [{"ref": 995, "dia": "2026-10-19", "servicio": "Fontanería", "ciudad": "Ciudad", "cerrada": True}], "empezadas": [] if cancelada_antes else ["2026-10-20"],
                    "cupos": [{"desde": "2026-10-19", "hasta": "2026-10-31", "cupo": 42, "consumidos": n, "disponibles": 42 - n, "visitas": [] if cancelada_antes else [{"dia": "2026-10-20", "inmueble": "P3", "refs": [995]}], "pendientes_clasificar": []}]}
        fija = lambda m: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:54398/prueba", data=json.dumps({"modelo": m}).encode(), method="POST"))
        PERS[:] = [{"cliente": "FICT", "desde": "2026-10-19", "hasta": "2026-10-31", "cupo": 42}, {"cliente": "FICT", "desde": "2026-11-01", "hasta": "2026-11-30", "cupo": 100}]
        async def octubre(cancelacion):
            CTXS[:] = [{"id": 1, "inmueble": "P1", "mat_informe": {"total": 0, "fuente": "sin_materiales"}}, {"id": 2, "inmueble": "P2", "mat_informe": {"total": 0, "fuente": "sin_materiales"}},
                       {"id": 3, "inmueble": "P3", "sin_ejecucion": False, "eventos": [{"a": "finish", "t": "2026-10-20T10:00:00Z"}, {"a": "cancel", "t": cancelacion}], "mat_informe": {"total": 0, "fuente": "sin_materiales"}}]
            await pg.evaluate("""()=>__t(`repSendClose(); if(!O.some(o=>o.ref===995)){ O=O.concat(normalize([{id:3,reference:995,revision:1,status:'cancelled',service:'Fontanería',description:'FICT-P3 | Trabajo del histórico',address:'',locality:'Ciudad',
              created_at:'2026-10-19T09:00:00Z',started_at:'2026-10-20T09:00:00Z',finished_at:'2026-10-20T10:00:00Z',technician_name:'Nombre Apellido',technician_id:'t1',customer_name:'FICT',report:'Informe ficticio.'}])); computeTags() }
              MED[3]=[{id:'m3',object_path:'o/3.jpg'}]; THU.m3='data:image/gif;base64,R0lGODlhAQABAAAAACw='; MAT[3]=[]; PERS=undefined; persP=null; CTX=undefined; ctxP=null; repPer='mes'; repDay='2026-10-15'; repCl='FICT'; repSelW=new Set(['FICT']); repView=true; renderSec()`)""")
            await pg.wait_for_timeout(1200); await pg.evaluate("()=>__t(`repSelW=new Set(['FICT']); repView=true; renderSec(); repSendOpen()`)")
            if not await pg.locator("#obody .rf").count(): return "", await pg.inner_text("#obody"), 0          # el panel no tiene informe que ofrecer
            await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click()
            await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')"); return await pg.inner_text(".rpms"), await pg.inner_text("#obody .rf"), await pg.locator(".rpmv canvas").count()
        fija(modelo_oct(False)); est, t, lienzos = await octubre("2026-11-08T09:00:00Z")
        assert lienzos > 0 and "1 orden de trabajo finalizada en octubre de 2026" in t and "AMJ-995 · FICT-P3" in t and "1 / 42" in t and "20/10\tAMJ-995\t1" in t and "ancelad" not in t, (est, t[:1200])
        print("OK · histórico: orden cerrada el 20/10 y cancelada el 08/11 → el informe de octubre se genera ENTERO (detalle, foto, aviso de cupo 1 / 42) y el servidor lo sella · " + est[:60])
        fija(modelo_oct(True)); est, t, lienzos = await octubre("2026-10-25T09:00:00Z")
        assert lienzos == 0 and "AMJ-995" not in t and "FICT-P3" not in t, (est, t[:1200])
        print("OK · la misma orden cancelada ANTES del corte (25/10): el panel no la ofrece en el informe de octubre (el servidor tampoco la daría por cerrada: caso comprobado en Deno y en PostgreSQL)")
        fija(None); await b.close()
asyncio.run(main()); srv.shutdown()
