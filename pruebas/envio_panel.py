"""Prueba del panel (bloque 1): el PDF que se ve, el que se descarga y el que se envía son el mismo archivo.
Datos ficticios; la función del servidor se simula en el navegador. Ejecutar:  python3 pruebas/envio_panel.py
Necesita Playwright para Python con Chromium."""
import asyncio, base64, functools, hashlib, http.server, json, pathlib, shutil, tempfile, threading
from playwright.async_api import async_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PDF = (RAIZ / "pruebas" / "ficticio.pdf").read_bytes(); SHA = hashlib.sha256(PDF).hexdigest()
tmp = pathlib.Path(tempfile.mkdtemp()); shutil.copytree(RAIZ / "beta", tmp / "beta")
js = (tmp / "beta" / "panel.js").read_text(encoding="utf-8"); i = js.rindex("session=ENT?loadSession()")
(tmp / "beta" / "panel.js").write_text(js[:i] + "window.__t=c=>eval(c);\n" + js[i:], encoding="utf-8")   # gancho solo para la prueba
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8791), functools.partial(H, directory=str(tmp))); threading.Thread(target=srv.serve_forever, daemon=True).start()

PREPARA = """()=>{ __t(`session={access_token:'x',expires_at:Date.now()+9e9};
  O=normalize([1,2].map(i=>({id:i,reference:900+i,revision:1,status:'completed',service:'Fontanería',description:'FICT-P'+i+' | Trabajo ficticio '+i,address:'',locality:'Ciudad',
    created_at:'2026-11-18T09:00:00Z',started_at:'2026-11-19T09:00:00Z',finished_at:'2026-11-19T10:00:00Z',technician_name:'Nombre Apellido',technician_id:'t1',customer_name:'FICT',report:'Informe ficticio.'})));
  computeTags(); RV=[]; PERS=[]; CTX={}; [1,2].forEach(i=>{ CTX[i]={id:i,mat_informe:{total:0,fuente:'sin_materiales'}}; MED[i]=[{id:'m'+i,object_path:'o/'+i+'.jpg'}]; THU['m'+i]='data:image/gif;base64,R0lGODlhAQABAAAAACw='; MAT[i]=[] });
  document.querySelectorAll('[hidden]').forEach(e=>e.hidden=false); document.getElementById('nw').hidden=true; document.getElementById('login').style.display='none'; lastOk=1;
  sec='informes'; repPer='dia'; repDay='2026-11-19'; repCl=''; repSel=new Set([1,2]); repView=true; renderSec(); repSendOpen();`) }"""
ok = lambda c, m: (print("OK ·", m) if c else (_ for _ in ()).throw(AssertionError(m)))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 950}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e)))
        llamadas, modo, pend, retoma = [], {"enviar": "ok", "ficticios": False}, [], []
        async def funcion(route):
            cuerpo = json.loads(route.request.post_data)
            # envíos sin confirmar guardados en el servidor (segunda revisión, punto 4)
            if cuerpo["accion"] == "registro": return await route.fulfill(json={"ok": True, "envios": [{"clave": "k1", "cliente": "FICT", "tipo": "diario", "desde": "2026-11-19", "hasta": "2026-11-19", "destinatarios": ["destinatario@prueba.example"], "estado": "incierto",
                "detalle": None, "ciclo": 1, "sha256": SHA, "creado_at": "2026-11-19T17:00:00Z", "guardado_at": "2026-11-19T17:00:01Z", "archivo_borrado_at": "2026-11-20T16:30:00Z", "sin_confirmar_caducado": True}]})
            if cuerpo["accion"] == "pendientes": return await route.fulfill(json={"ok": True, "envio_real": True, "envios": pend})
            if cuerpo["accion"] in ("recuperar", "reintentar"):
                retoma.append(cuerpo); e = next(x for x in pend if x["clave"] == cuerpo["clave"])
                if cuerpo["accion"] == "recuperar": return await route.fulfill(json={"ok": True, "archivo": e["archivo"], "bytes": len(PDF), "sha256": SHA, "clave": e["clave"], "pdf_b64": base64.b64encode(PDF).decode()})
                pend.clear(); return await route.fulfill(json={"ok": True, "enviado": True, "recuperado": True, "para": e["para"], "proveedor": "correo-1", "archivo": e["archivo"], "bytes": len(PDF), "sha256": SHA, "clave": e["clave"]})
            llamadas.append(cuerpo)
            if cuerpo["accion"] == "pdf":
                return await route.fulfill(json={"ok": True, "enviado": False, "paginas": 1, "bytes": len(PDF), "archivo": "Informe_ficticio.pdf", "sha256": SHA, "caduca": 9e15, "sello": "SELLO.FICTICIO", "cliente": {"codigo": "FICTICIO", "nombre": "Cliente Ficticio"}, "ordenes_por_prefijo": [902], "destinatarios": {"autorizados": ["destinatario@prueba.example"], "solo_ficticios": modo["ficticios"]},
                    "fotos": {"solicitadas": 2, "incluidas": 1, "faltan": 1, "detalle": [{"titulo": "AMJ-902 · Trabajo ficticio 2 · P2", "n": 1}]}, "pdf_b64": base64.b64encode(PDF).decode()})
            m = modo["enviar"]
            if m == "incierto": return await route.fulfill(status=504, json={"error": "sin respuesta", "codigo": "RESULTADO_INCIERTO"})
            if m == "distinto": return await route.fulfill(status=409, json={"error": "El PDF que se intenta enviar no es el que se revisó. Pulsa otra vez «Ver el PDF que se enviará», revísalo y vuelve a enviar.", "codigo": "PDF_DISTINTO"})
            return await route.fulfill(json={"ok": True, "enviado": True, "para": cuerpo["para"], "proveedor": "correo-1", "archivo": "Informe_ficticio.pdf", "bytes": len(PDF), "sha256": SHA, "clave": "k"})
        await pg.route("**/functions/v1/amj-informes-enviar", funcion)
        fuente = {"modo": "igual"}
        async def datos(route):                                                    # lectura de fotos y materiales (se repite antes de cada PDF)
            if fuente["modo"] == "falla": return await route.fulfill(status=500, json={"message": "caída"})
            if "amj_order_materials" in route.request.url: return await route.fulfill(json=[])
            return await route.fulfill(json=[{"id": "m%d" % i, "order_id": i, "object_path": "o/%d.jpg" % i} for i in (1, 2)] + ([{"id": "m9", "order_id": 2, "object_path": "o/9.jpg"}] if fuente["modo"] == "cambia" else []))
        ctx = {"modo": "igual"}
        async def contexto(route):
            if ctx["modo"] == "falla": return await route.fulfill(status=500, json={"message": "caída"})
            await route.fulfill(json=[{"id": 1, "mat_informe": {"total": 0, "fuente": "sin_materiales"}}, {"id": 2, "mat_informe": {"total": 9.5, "fuente": "autorizado"} if ctx["modo"] == "cambia" else {"total": 0, "fuente": "sin_materiales"}}])
        await pg.route("**/rest/v1/rpc/amj_admin_informe_ordenes", contexto)
        await pg.route("**/rest/v1/amj_service_media*", datos); await pg.route("**/rest/v1/amj_order_materials*", datos)
        await pg.goto("http://127.0.0.1:8791/beta/index.html"); await pg.evaluate(PREPARA)
        estado = lambda: pg.inner_text(".rpms"); enviar = pg.locator(".rpma .go"); ver = pg.locator(".rpma .out").first
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example")
        await enviar.click(); ok("Primero pulsa" in await estado() and not llamadas, "no deja enviar sin haber generado y revisado el PDF")
        fuente["modo"] = "falla"; await ver.click(); await pg.wait_for_function("document.querySelector('.rpms').textContent.includes('No se han podido releer')")
        ok(not llamadas, "bloque 2 · si no se pueden releer fotos y materiales, no se genera el PDF")
        fuente["modo"] = "igual"; ctx["modo"] = "falla"; await ver.click(); await pg.wait_for_function("document.querySelector('.rpms').textContent.includes('importes de materiales')")
        ok(not llamadas, "revisión · si el servidor no confirma los importes de materiales, no se genera el PDF")
        ctx["modo"] = "cambia"; await ver.click(); await pg.wait_for_function("!document.getElementById('rpm')")
        ok(not llamadas and "El importe de materiales de AMJ-902 ha cambiado" in await pg.inner_text("#obody"), "revisión · importe actualizado después de abrir el panel: se actualiza el informe y hay que revisarlo antes de sellar")
        await pg.evaluate("()=>__t('repSendOpen()')"); await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example")   # el contexto ya no cambia más
        fuente["modo"] = "cambia"; await ver.click(); await pg.wait_for_function("!document.getElementById('rpm')")
        ok(not llamadas and "AMJ-902 han cambiado" in await pg.inner_text("#obody") and await pg.evaluate("()=>__t('MED[2].length')") == 2, "bloque 2 · si una foto cambió, se actualiza el informe y se pide revisarlo antes de generar")
        await pg.evaluate("()=>__t('repSendOpen()')"); await pg.fill(".rpml input >> nth=0", "intruso@otro.example"); await ver.click(); await pg.wait_for_selector(".rpmv canvas")
        i0 = llamadas[0]["informe"]; ok(i0["cliente"] == "FICT" and i0["refs"] == [901, 902] and i0["tipo"] == "diario" and i0["desde"] == i0["hasta"] == i0["corte"] == "2026-11-19", "bloque 2 · el panel envía cliente, periodo, corte y órdenes para que el servidor los compruebe")
        f = await pg.inner_text(".rpmf"); ok("Cliente comprobado por el servidor: Cliente Ficticio" in f and "sin ficha de cliente): AMJ-902" in f and "Destinatarios autorizados de este cliente: destinatario@prueba.example" in f, "bloque 2 · se muestran el cliente comprobado, las órdenes identificadas por prefijo y los destinatarios autorizados")
        await enviar.click(); ok("No están autorizados para este cliente: intruso@otro.example" in await estado() and len(llamadas) == 1, "bloque 2 · un destinatario no autorizado no llega a enviarse")
        await pg.click(".rpmd a"); ok(await pg.input_value(".rpml input >> nth=0") == "destinatario@prueba.example", "bloque 2 · «Usar estos» rellena los destinatarios autorizados")
        ok(len(llamadas) == 1 and llamadas[0]["accion"] == "pdf", "«Ver» genera el PDF una vez")
        descarga = await pg.evaluate("async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [a.download,[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')] }")
        ok(descarga == ["Informe_ficticio.pdf", SHA], "la descarga es el mismo archivo que la vista previa (misma huella)")
        ok("2 solicitadas" in f and "1 incluidas" in f and "1 no se ha podido cargar" in f and "AMJ-902" in f and SHA[:12] in f, "aviso de fotos solicitadas, incluidas y ausentes, visible antes de confirmar")
        await enviar.click(); ok("faltan 1 fotos" in await estado() and len(llamadas) == 1, "la confirmación recuerda las fotos que faltan y aún no envía")
        await pg.fill(".rpml input >> nth=1", "Asunto cambiado"); ok("Enviar ahora" in await enviar.inner_text(), "cambiar el asunto obliga a confirmar otra vez")
        modo["enviar"] = "incierto"; await enviar.click(); await enviar.click(); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Reintentar')")
        ok("No se sabe si el correo ha salido" in await estado(), "respuesta perdida: se muestra como resultado incierto")
        modo["enviar"] = "ok"; await enviar.click(); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')")
        e1, e2 = llamadas[1], llamadas[2]
        ok(e1["copia"] == "antonio@amjmaintenance.es", "con envío real, la copia a AMJ queda marcada al comprobar el PDF")
        ok(e1 == e2, "el reintento envía exactamente la misma petición")
        ok(hashlib.sha256(base64.b64decode(e2["pdf_b64"])).hexdigest() == SHA and e2["sello"] == "SELLO.FICTICIO" and "docs" not in e2, "al enviar viajan los bytes revisados y su sello; no se vuelve a generar el informe")
        ok(SHA[:12] in await estado(), "el mensaje final muestra la huella del adjunto")
        await pg.evaluate("()=>__t('repSendOpen()')"); await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await ver.click(); await pg.wait_for_selector(".rpmv canvas")
        modo["enviar"] = "distinto"; await enviar.click(); await enviar.click(); await pg.wait_for_function("document.querySelector('.rpms').textContent.includes('No se envió')")
        ok(await pg.locator(".rpmv").count() == 0 and "Ver el PDF que se enviará" in await estado(), "si el servidor rechaza el archivo, se retira la vista previa y se explica cómo seguir")
        # --- Segunda revisión, punto 4: en la versión de pruebas (solo ficticios) no hay copia por defecto a un correo real.
        modo["ficticios"] = True; modo["enviar"] = "ok"; n0 = len(llamadas)
        await pg.evaluate("()=>__t('repSendOpen()')"); await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example")
        ok(not await pg.is_checked(".rpmk input"), "revisión 2 · la copia no viene marcada antes de saber el modo del servidor")
        await ver.click(); await pg.wait_for_selector(".rpmv canvas")
        ok(not await pg.is_checked(".rpmk input") and await pg.is_disabled(".rpmk input") and "no se envía nada a correos reales" in await pg.inner_text(".rpmk"), "revisión 2 · modo ficticio: la copia a un correo real queda desmarcada y bloqueada")
        await enviar.click(); await enviar.click(); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')")
        ok(llamadas[-1]["accion"] == "enviar" and llamadas[-1]["copia"] == "" and len(llamadas) == n0 + 2, "revisión 2 · modo ficticio: la petición de envío viaja sin copia")
        # --- Cierre y reapertura del panel: el envío sin confirmar y su PDF se recuperan del servidor, sin nada guardado en el navegador.
        pend.append({"clave": "amj-informe-ficticia", "cliente": "FICT", "tipo": "diario", "desde": "2026-11-19", "hasta": "2026-11-19", "para": ["destinatario@prueba.example"], "copia": "", "asunto": "Informe diario ficticio",
                     "archivo": "Informe_ficticio.pdf", "sha256": SHA, "bytes": len(PDF), "estado": "incierto", "creado": "2026-11-19T17:00:00Z", "caducado": False})
        await pg.reload(); await pg.evaluate(PREPARA); await pg.evaluate("()=>__t('repSendClose()')"); await pg.wait_for_selector(".reppend")
        ok("Hay 1 envío de informe sin confirmar" in await pg.inner_text(".reppend") and await pg.evaluate("()=>__t('repLibera.length')") == 0, "revisión 2 · tras recargar el panel se avisa del envío sin confirmar (dato del servidor)")
        await pg.click(".reppend button"); t = await pg.inner_text("#rpm")
        ok("Informe diario ficticio" in t and "destinatario@prueba.example" in t and "sin respuesta: no se sabe si salió" in t and SHA[:12] in t, "revisión 2 · se ven destinatario, asunto, estado y huella del envío guardado")
        await pg.wait_for_selector("#repreg table"); r = await pg.inner_text("#repreg")
        ok("Sin confirmar (caducado)" in r and "retirado el" in r and SHA[:12] in r and "destinatario@prueba.example" in r, "revisión 3 · registro de envíos para conciliar: estado, destinatario, huella y qué pasó con el PDF guardado")
        await pg.click(".rpma .out"); await pg.wait_for_selector(".rpmv canvas")
        descarga = await pg.evaluate("async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [a.download,[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')] }")
        ok(descarga == ["Informe_ficticio.pdf", SHA] and retoma[-1] == {"accion": "recuperar", "clave": "amj-informe-ficticia"}, "revisión 2 · el PDF recuperado es el sellado (misma huella en visor y descarga)")
        await pg.click(".rpma .go"); ok("Confirmar" in await pg.inner_text(".rpma .go") and len(retoma) == 1, "revisión 2 · reintentar pide confirmación")
        await pg.click(".rpma .go"); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')")
        ok(retoma[-1] == {"accion": "reintentar", "clave": "amj-informe-ficticia"} and len(llamadas) == n0 + 2, "revisión 2 · el reintento manda solo la referencia del envío: el servidor usa su PDF guardado; no se genera ni se sube otro")
        await pg.click(".rpmh button"); await pg.wait_for_function("!document.querySelector('.reppend')"); ok(True, "revisión 2 · confirmado el envío, el aviso desaparece")
        await pg.evaluate("()=>__t('repSendOpen()')")
        await pg.evaluate("()=>__t('logout()')"); ok(await pg.locator("#rpm").count() == 0 and await pg.evaluate("()=>__t('repLibera.length+Object.keys(MED).length+Object.keys(MAT).length')") == 0, "al cerrar sesión se cierra la ventana y se liberan archivos, fotos y materiales")
        ok(not errores, "sin errores de JavaScript"); await b.close()
asyncio.run(main()); srv.shutdown()
