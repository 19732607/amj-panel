"""Prueba conjunta panel + función (bloques 1 y 2). El panel real habla con la función real, que usa dobles de Supabase y del correo.
Antes, en el repositorio amj-tecnicos-ios:  deno run --no-lock --allow-net=127.0.0.1,0.0.0.0:8000 --allow-env --allow-read tests/informes/envio/servidor_local.ts
Después:  python3 pruebas/integracion.py"""
import asyncio, base64, json, os, urllib.request
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
        async def datos(route): await route.fulfill(json=[] if "amj_order_materials" in route.request.url else [{"id": "m%d" % i, "order_id": i, "object_path": "o/%d.jpg" % i} for i in (1, 2)])
        CTXS = [{"id": i, "mat_informe": {"total": 0, "fuente": "sin_materiales"}} for i in (1, 2)]; PERS = []
        await pg.route("**/rest/v1/rpc/amj_admin_informe_ordenes", lambda r: r.fulfill(json=CTXS))
        await pg.route("**/rest/v1/amj_service_media*", datos); await pg.route("**/rest/v1/amj_order_materials*", datos)
        await pg.goto("http://127.0.0.1:8791/beta/index.html"); await pg.evaluate(PREPARA)
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
        print("OK · informe mensual con cupo (2 / 100, tabla de visitas) y materiales con ticket (9,50 € = 7,85 + 1,65): panel y servidor coinciden y el PDF se sella"); guarda("mensual_con_cupo"); await b.close()
asyncio.run(main()); srv.shutdown()
