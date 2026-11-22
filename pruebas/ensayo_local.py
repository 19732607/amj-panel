"""Ensayo LOCAL en navegador del modo ensayo (tercera revisión, 22/11/2026, punto 1). Panel SIN modificar (sin ganchos de prueba), servicios locales.
Recorre el inicio de sesión real del panel y la llamada a la función con su preflight CORS real (nadie intercepta ni sustituye cabeceras).
Antes, en amj-tecnicos-ios:  deno run --no-lock --allow-net=127.0.0.1,0.0.0.0:8000 --allow-env --allow-read tests/informes/envio/servidor_local.ts
Después:  python3 pruebas/ensayo_local.py"""
import asyncio, functools, hashlib, http.server, json, pathlib, shutil, tempfile, threading, urllib.request
from playwright.async_api import async_playwright
RAIZ = pathlib.Path(__file__).resolve().parent.parent
tmp = pathlib.Path(tempfile.mkdtemp()); shutil.copytree(RAIZ / "beta", tmp / "beta"); (tmp / "ensayo").mkdir()
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8791), functools.partial(H, directory=str(tmp))); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:8791/beta/index.html?entorno=ensayo"; CFG = tmp / "ensayo" / "config.js"
def config(c): CFG.write_text("window.AMJ_ENTORNO=" + json.dumps(c) + ";", encoding="utf-8") if c is not None else (CFG.unlink() if CFG.exists() else None)
ok = lambda c, m: (print("OK ·", m) if c else (_ for _ in ()).throw(AssertionError(m)))
PRUEBAS = {"proyecto": "gktignfhalpwhewhkzya", "url": "https://gktignfhalpwhewhkzya.supabase.co", "clave": "sb_publishable_clave_ficticia_de_prueba"}
estado = lambda: json.loads(urllib.request.urlopen("http://127.0.0.1:54398/prueba/ensayo").read())
async def main():
    async with async_playwright() as p:
        # Sin interceptar nada (interceptar peticiones hace que el navegador no envíe el preflight CORS). Para que nada salga de este ordenador,
        # el navegador arranca sin poder resolver ningún nombre de internet; las peticiones solo se OBSERVAN.
        b = await p.chromium.launch(args=["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--no-proxy-server"])
        async def abre(c):
            config(c); ctx = await b.new_context(viewport={"width": 1300, "height": 950}); pg = await ctx.new_page(); fuera = []
            # Se anota cualquier petición que no vaya a este ordenador (salvo la tipografía pública de la página, que no lleva datos): no debe haber ninguna.
            pg.on("request", lambda r: None if r.url.startswith(("http://127.0.0.1:", "data:", "blob:")) or "fonts.g" in r.url else fuera.append(r.url))
            await pg.goto(URL); await pg.wait_for_selector("#ensayo-banda"); return pg, fuera
        async def detenido(c, texto, caso):
            antes = len(estado()["logins"]); pg, fuera = await abre(c); banda = await pg.inner_text("#ensayo-banda")
            await pg.evaluate("()=>{ for(const i of ['le','lp']){ const x=document.getElementById(i); x.disabled=false; x.value=i==='le'?'admin@amj.test':'clave-ficticia' } document.getElementById('lf').requestSubmit() }"); await pg.wait_for_timeout(400)   # incluso forzando el formulario
            ok("ENSAYO DETENIDO" in banda and texto in banda and await pg.is_hidden("#app") and not fuera and len(estado()["logins"]) == antes, caso + ": el panel se detiene y NO envía credenciales ni ninguna otra petición"); await pg.context.close()
        await detenido(None, "Falta la configuración del ensayo", "sin configuración")
        await detenido({"proyecto": "gktignfhalpwhewhkzya", "url": "https://biwjrbcfupmbpoxnrolt.supabase.co", "clave": "sb_publishable_clave_ficticia_de_prueba"}, "apunta a PRODUCCIÓN", "configuración que apunta a producción")
        await detenido({"proyecto": "biwjrbcfupmbpoxnrolt", "url": "https://biwjrbcfupmbpoxnrolt.supabase.co", "clave": "x" * 30}, "no es la de AMJ-Pruebas", "proyecto que no es AMJ-Pruebas")
        await detenido({"proyecto": "gktignfhalpwhewhkzya", "url": "https://otro-proyecto.supabase.co", "clave": "x" * 30}, "no es la de AMJ-Pruebas", "dirección de otro proyecto con el nombre de AMJ-Pruebas")
        await detenido({"proyecto": "gktignfhalpwhewhkzya", "url": "http://127.0.0.1:54399", "clave": "x" * 30}, "no es la de AMJ-Pruebas", "dirección local sin declarar que son servicios simulados")
        await detenido({**PRUEBAS, "clave": "PEGAR_AQUI_LA_CLAVE_PUBLICA_DE_AMJ_PRUEBAS"}, "Falta la clave pública", "plantilla sin rellenar")
        await detenido({**PRUEBAS, "clave": "sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm"}, "apunta a PRODUCCIÓN", "clave pública de producción")
        pg, fuera = await abre(PRUEBAS); banda = await pg.inner_text("#ensayo-banda")
        ok("ENSAYO · AMJ-Pruebas (gktignfhalpwhewhkzya)" in banda and not fuera and await pg.is_enabled("#le"), "configuración exacta de AMJ-Pruebas: el panel la acepta, lo anuncia y no pide nada hasta que alguien inicia sesión (no se inicia: esta prueba no toca AMJ-Pruebas)"); await pg.context.close()
        # Sin el parámetro, el panel sigue siendo el de producción y no carga ninguna configuración de ensayo.
        config({"proyecto": "gktignfhalpwhewhkzya", "url": "http://127.0.0.1:54399", "clave": "clave-publica-ficticia-0001", "dobles_locales": True})
        ctx = await b.new_context(); pg = await ctx.new_page(); pedidas = []; pg.on("request", lambda r: pedidas.append(r.url)); await pg.goto(URL.split("?")[0]); await pg.wait_for_timeout(300)
        ok(await pg.locator("#ensayo-banda").count() == 0 and not any("ensayo/config.js" in u for u in pedidas) and await pg.evaluate("()=>typeof window.AMJ_ENTORNO") == "undefined", "sin «?entorno=ensayo» no hay modo ensayo ni se lee su configuración: la beta publicada no cambia"); await ctx.close()
        # ---- Recorrido completo con servicios locales: inicio de sesión real del panel y preflight CORS real de la función.
        e0 = estado(); pg, fuera = await abre({"proyecto": "gktignfhalpwhewhkzya", "url": "http://127.0.0.1:54399", "clave": "clave-publica-ficticia-0001", "dobles_locales": True}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e)))
        await pg.fill("#le", "admin@amj.test"); await pg.fill("#lp", "otra-clave"); await pg.click("#lb"); await pg.wait_for_function("document.getElementById('lerr').textContent.length>0")
        ok(await pg.is_hidden("#app") and estado()["logins"][len(e0["logins"]):] == [{"email": "admin@amj.test", "ok": False}], "inicio de sesión real con contraseña incorrecta: el servicio local lo rechaza y el panel no entra")
        await pg.fill("#lp", "clave-ficticia"); await pg.wait_for_selector("#lb:not([disabled])"); await pg.click("#lb"); await pg.wait_for_selector("#app:not([hidden])"); await pg.click('[data-sec="informes"]')
        await pg.fill('.repbar input[type="date"]', "2026-11-19"); await pg.dispatch_event('.repbar input[type="date"]', "change"); await pg.wait_for_selector(".reptb .ck input")
        await pg.check(".reptb th.ck input"); await pg.click(".repbar button:has-text('Enviar por email')")
        for _ in range(8):   # el panel pide esperar mientras termina de comprobar fotos, importes y periodos con el servidor: se vuelve a pulsar, como haría una persona
            await pg.wait_for_timeout(700)
            if await pg.locator("#rpm .rpml input").count(): break
            await pg.click(".repbar button:has-text('Enviar por email')")
        await pg.wait_for_selector("#rpm .rpml input")
        ok(estado()["logins"][-1] == {"email": "admin@amj.test", "ok": True} and "AMJ-901" in await pg.inner_text("#obody .rf"), "inicio de sesión real: el panel entra, carga las órdenes del servicio local y abre el informe diario")
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.click(".rpma .out"); await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')")
        ok(await pg.locator(".rpmv canvas").count() > 0, "el PDF se genera y se ve: " + (await pg.inner_text(".rpms"))[:160])
        F = estado()["funcion"][len(e0["funcion"]):]; pre = [x for x in F if x["metodo"] == "OPTIONS"]
        ok(len(pre) >= 1 and all(x["origen"] == "http://127.0.0.1:8791" and x["estado"] == 204 and x["permite"] == "http://127.0.0.1:8791" for x in pre), "preflight CORS REAL: lo pide el navegador y lo contesta la propia función (204, origen local admitido porque no está en producción) · " + json.dumps(pre[0]))
        ok(any(x["metodo"] == "POST" and x["estado"] == 200 and x["permite"] == "http://127.0.0.1:8791" for x in F) and not fuera, "la petición real llega a la función con la sesión del panel y nada sale de este ordenador")
        huella = "async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('') }"
        descarga = await pg.evaluate(huella); visor = (await pg.inner_text(".rpmf")); paginas = await pg.locator(".rpmv canvas").count()
        await pg.click(".rpma .go"); await pg.click(".rpma .go"); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')||document.querySelector('.rpms.err')")
        cap = json.loads(urllib.request.urlopen("http://127.0.0.1:54398/").read())[-1]
        ok("Enviado" in await pg.inner_text(".rpma .go") and cap["sha256"] == descarga and descarga[:12] in visor and cap["para"] == ["destinatario@prueba.example"], f"huella del visor, de la descarga y del adjunto capturado por el servicio de correo local: {descarga} · {paginas} página(s)")
        fin = estado(); ok(fin["archivos"] == 0 and not errores, "el envío confirmado no deja archivo guardado; sin errores de JavaScript"); await b.close()
asyncio.run(main()); srv.shutdown()
