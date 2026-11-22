"""Ensayo LOCAL en navegador del panel de ensayo (cuarta revisión, 22/11/2026, puntos 1 y 2). Panel SIN modificar y SIN ganchos de prueba.
No se intercepta ninguna petición: el navegador (Chromium) arranca sin poder resolver nombres de internet y todas las peticiones solo se observan.
La prueba arranca ella misma los servicios locales (función Edge real con dobles de Supabase y del correo) desde el repositorio del servidor.
Uso:  AMJ_SERVIDOR=/ruta/a/amj-tecnicos-ios python3 pruebas/ensayo_local.py      (por defecto, ../amj-tecnicos-ios)"""
import asyncio, base64, functools, hashlib, http.server, json, os, pathlib, re, shutil, subprocess, tempfile, threading, time, urllib.request
from playwright.async_api import async_playwright
RAIZ = pathlib.Path(__file__).resolve().parent.parent; SERV = pathlib.Path(os.environ.get("AMJ_SERVIDOR", RAIZ.parent / "amj-tecnicos-ios"))
tmp = pathlib.Path(tempfile.mkdtemp()); shutil.copytree(RAIZ / "beta", tmp / "beta"); (tmp / "ensayo").mkdir()
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8791), functools.partial(H, directory=str(tmp))); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8791/beta/index.html"; URL = BASE + "?entorno=ensayo"; CFG = tmp / "ensayo" / "config.js"
def config(c): CFG.write_text("window.AMJ_ENTORNO=" + json.dumps(c) + ";", encoding="utf-8") if c is not None else (CFG.unlink() if CFG.exists() else None)
ok = lambda c, m: (print("OK ·", m) if c else (_ for _ in ()).throw(AssertionError(m)))
REF = "gktignfhalpwhewhkzya"; PRUEBAS_URL = "https://" + REF + ".supabase.co"; DOBLES = {"proyecto": REF, "url": "http://127.0.0.1:54399", "clave": "clave-publica-ficticia-0001", "dobles_locales": True}
jwt = lambda p: "x." + base64.urlsafe_b64encode(json.dumps(p).encode()).decode().rstrip("=") + ".y"
# La clave pública verdadera de AMJ-Pruebas consta en el repositorio del servidor; aquí solo se lee de ese archivo local (no se pide a ningún servicio).
m = re.search(r"const APIKEY = '(sb_publishable_[^']+)'", (SERV / "supabase" / "pruebas" / "extremo_a_extremo.mjs").read_text(encoding="utf-8")); CLAVE_PRUEBAS = m.group(1)
def lee(u): return json.loads(urllib.request.urlopen(u).read())
estado = lambda: lee("http://127.0.0.1:54398/prueba/ensayo"); capturados = lambda: lee("http://127.0.0.1:54398/")
def servicios(entorno, guion="servidor_local.ts"):
    pr = subprocess.Popen(["npx", "deno", "run", "--no-lock", "--allow-net=127.0.0.1,0.0.0.0:8000", "--allow-env", "--allow-read", "tests/informes/envio/" + guion], cwd=SERV, env={**os.environ, **entorno}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    puerto = 8001 if "DENO_SERVE_ADDRESS" in entorno else 8000
    for _ in range(60):
        try: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%d/" % puerto, method="OPTIONS")); return pr
        except Exception: time.sleep(0.5)
    raise RuntimeError("los servicios locales no arrancan")
def para(pr):
    os.killpg(pr.pid, 15); pr.wait()
    for _ in range(40):      # esperar a que los puertos queden libres de verdad antes de arrancar otra variante
        try: urllib.request.urlopen("http://127.0.0.1:54398/", timeout=0.5); time.sleep(0.25)
        except Exception: break
    time.sleep(0.5)
HUELLA_DESCARGA = "async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('') }"

async def main():
    async with async_playwright() as p:
        ARGS = ["--host-resolver-rules=MAP panel.publicado.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--no-proxy-server"]
        b = await p.chromium.launch(args=ARGS)
        async def abre(c, url=URL, navegador=None):
            config(c); ctx = await (navegador or b).new_context(viewport={"width": 1300, "height": 950}); pg = await ctx.new_page(); fuera = []; cuerpos = []
            # TODA petición que no vaya a este ordenador se anota, también la tipografía: en una copia local no debe haber ninguna.
            pg.on("request", lambda r: (cuerpos.append(r.post_data or ""), None if r.url.startswith(("http://127.0.0.1:", "data:", "blob:")) else fuera.append(r.url)))
            await pg.goto(url); return pg, fuera, cuerpos
        pr = servicios({})
        # ---- 1. Casos en que la copia local debe DETENERSE antes del inicio de sesión: cero peticiones externas (tipografía incluida) y cero credenciales.
        async def detenido(c, texto, caso, url=URL, navegador=None):
            antes = len(estado()["logins"]); pg, fuera, cuerpos = await abre(c, url, navegador); await pg.wait_for_selector("#ensayo-banda.alto"); banda = await pg.inner_text("#ensayo-banda"); bloqueado = await pg.is_disabled("#le") and await pg.is_disabled("#lb")
            await pg.evaluate("()=>{ for(const i of ['le','lp','lb']){ const x=document.getElementById(i); x.disabled=false } document.getElementById('le').value='admin@amj.test'; document.getElementById('lp').value='clave-ficticia'; document.getElementById('lf').requestSubmit() }"); await pg.wait_for_timeout(500)   # incluso forzando el formulario
            ok("PANEL DETENIDO" in banda and texto in banda and bloqueado and await pg.is_hidden("#app") and fuera == [] and len(estado()["logins"]) == antes and not any("clave-ficticia" in x for x in cuerpos),
               caso + ": se detiene con el formulario bloqueado · peticiones externas: %d · credenciales transmitidas: 0" % len(fuera)); await pg.context.close()
        await detenido(DOBLES, "solo para el ensayo", "URL SIN «?entorno=ensayo» (con una configuración válida al lado)", url=BASE)
        await detenido(None, "Falta la configuración del ensayo", "configuración AUSENTE")
        await detenido({"proyecto": "biwjrbcfupmbpoxnrolt", "url": PRUEBAS_URL, "clave": CLAVE_PRUEBAS}, "no es la de AMJ-Pruebas", "PROYECTO incorrecto")
        await detenido({"proyecto": REF, "url": PRUEBAS_URL, "clave": "sb_publishable_clave_de_otro_proyecto_0001"}, "no es la de AMJ-Pruebas", "CLAVE AJENA con la URL correcta")
        await detenido({"proyecto": REF, "url": PRUEBAS_URL, "clave": "sb_publishable_ywkQpKdfMksufdqWkv-fyA_OtcxTXEm"}, "apunta a PRODUCCIÓN", "clave pública de producción con la URL de AMJ-Pruebas")
        await detenido({"proyecto": REF, "url": "https://biwjrbcfupmbpoxnrolt.supabase.co", "clave": CLAVE_PRUEBAS}, "apunta a PRODUCCIÓN", "URL de producción")
        await detenido({"proyecto": REF, "url": "https://otro-proyecto.supabase.co", "clave": CLAVE_PRUEBAS}, "no es la de AMJ-Pruebas", "URL de otro proyecto")
        await detenido({"proyecto": REF, "url": PRUEBAS_URL, "clave": "sb_" + "secret_" + "clave_de_servidor_ficticia_0001"}, "clave PRIVILEGIADA", "clave privilegiada (secreta)")
        await detenido({"proyecto": REF, "url": PRUEBAS_URL, "clave": jwt({"ref": REF, "role": "service_role"})}, "clave PRIVILEGIADA", "clave privilegiada (rol de servicio)")
        await detenido({"proyecto": REF, "url": PRUEBAS_URL, "clave": "PEGAR_AQUI_LA_CLAVE_PUBLICA_DE_AMJ_PRUEBAS"}, "Falta la clave pública", "plantilla sin rellenar")
        await detenido({**DOBLES, "url": "http://127.0.0.1:9999"}, "no es la de las pruebas locales", "servicios simulados con otra dirección")
        await detenido({**DOBLES, "clave": CLAVE_PRUEBAS}, "no es la de las pruebas locales", "servicios simulados con otra clave")
        b2 = await p.chromium.launch(args=ARGS + ["--disable-blink-features=AutomationControlled"])   # un navegador «normal»: no se declara como de pruebas automáticas
        await detenido(DOBLES, "solo se pueden usar en las pruebas automáticas", "servicios simulados fuera del entorno de pruebas automáticas", navegador=b2); await b2.close()
        # ---- 2. Configuración exacta de AMJ-Pruebas (clave comprobada con la huella independiente): aceptada; no se inicia sesión (esta prueba no toca AMJ-Pruebas).
        pg, fuera, _ = await abre({"proyecto": REF, "url": PRUEBAS_URL, "clave": CLAVE_PRUEBAS}); await pg.wait_for_selector("#ensayo-banda.ok"); banda = await pg.inner_text("#ensayo-banda")
        ok("ENSAYO · AMJ-Pruebas (" + REF + ")" in banda and "fase A: envío apagado" in banda and fuera == [] and await pg.is_enabled("#le"), "configuración exacta de AMJ-Pruebas con su clave pública verdadera: aceptada, fase A por defecto, y ninguna petición antes de iniciar sesión"); await pg.context.close()
        # ---- 3. El panel PUBLICADO (otro nombre de máquina) no cambia: producción, sin banda, con su tipografía; y no admite el modo ensayo.
        pg, fuera, _ = await abre(DOBLES, url="http://panel.publicado.test:8791/beta/index.html"); await pg.wait_for_timeout(500)
        ok(await pg.locator("#ensayo-banda").count() == 0 and await pg.is_enabled("#le") and any("fonts.googleapis.com" in u for u in fuera) and await pg.evaluate("()=>typeof window.AMJ_ENTORNO") == "undefined", "panel publicado (no es localhost): se comporta como siempre, sin modo ensayo ni configuración de ensayo"); await pg.context.close()
        pg, fuera, _ = await abre(DOBLES, url="http://panel.publicado.test:8791/beta/index.html?entorno=ensayo"); await pg.wait_for_selector("#ensayo-banda.alto")
        ok("solo funciona abierto desde este ordenador" in await pg.inner_text("#ensayo-banda") and await pg.is_disabled("#lb"), "el modo ensayo no se puede usar desde una dirección publicada"); await pg.context.close()
        # ---- 4. Recorrido válido con servicios locales: inicio de sesión por el formulario y preflight OPTIONS real (nadie lo intercepta).
        async def hasta_el_pdf(fase):
            pg, fuera, _ = await abre({**DOBLES, "fase": fase}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e))); await pg.wait_for_selector("#ensayo-banda.ok")
            await pg.fill("#le", "admin@amj.test"); await pg.fill("#lp", "otra-clave"); await pg.click("#lb"); await pg.wait_for_function("document.getElementById('lerr').textContent.length>0"); mal = await pg.is_hidden("#app")
            await pg.fill("#lp", "clave-ficticia"); await pg.wait_for_selector("#lb:not([disabled])"); await pg.click("#lb"); await pg.wait_for_selector("#app:not([hidden])"); await pg.click('[data-sec="informes"]')
            await pg.fill('.repbar input[type="date"]', "2026-11-19"); await pg.dispatch_event('.repbar input[type="date"]', "change"); await pg.wait_for_selector(".reptb .ck input")
            await pg.check(".reptb th.ck input"); await pg.click(".repbar button:has-text('Enviar por email')")
            for _ in range(8):   # el panel pide esperar mientras termina de comprobar fotos, importes y periodos: se vuelve a pulsar, como haría una persona
                await pg.wait_for_timeout(700)
                if await pg.locator("#rpm .rpml input").count(): break
                await pg.click(".repbar button:has-text('Enviar por email')")
            await pg.wait_for_selector(".rpmg.ok, .rpmg.alto"); puerta = await pg.inner_text(".rpmg")
            await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.click(".rpma .out"); await pg.wait_for_function("document.querySelector('.rpmv canvas')||document.querySelector('.rpms.err')")
            return pg, fuera, errores, mal, puerta
        e0 = estado(); pg, fuera, errores, mal, puerta = await hasta_el_pdf("B")
        L = estado()["logins"][len(e0["logins"]):]; F = estado()["funcion"][len(e0["funcion"]):]; pre = [x for x in F if x["metodo"] == "OPTIONS"]
        ok(mal and L == [{"email": "admin@amj.test", "ok": False}, {"email": "admin@amj.test", "ok": True}] and "AMJ-901" in await pg.inner_text("#obody .rf"), "inicio de sesión por el formulario: contraseña incorrecta rechazada; con la correcta el panel entra y abre el informe")
        ok(len(pre) >= 1 and all(x["origen"] == "http://127.0.0.1:8791" and x["estado"] == 204 and x["permite"] == "http://127.0.0.1:8791" for x in pre) and fuera == [], "preflight OPTIONS REAL, sin interceptar: lo pide el navegador y lo contesta la propia función · " + json.dumps(pre[0] if pre else {}))
        ok("envío real: ENCENDIDO" in puerta and "solo destinatarios ficticios: sí" in puerta and await pg.locator(".rpmv canvas").count() > 0, "lectura del estado de la función antes de enviar (aquí, servicios locales con el capturador): " + puerta[:90])
        visor = await pg.get_attribute(".rpmv", "data-sha256"); descarga = await pg.evaluate(HUELLA_DESCARGA); n0 = len(capturados())
        await pg.click(".rpma .go"); await pg.click(".rpma .go"); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')||document.querySelector('.rpms.err')")
        cap = capturados(); adjunto = cap[-1]["sha256"]
        ok(len(cap) == n0 + 1 and len(visor) == 64 and visor == descarga == adjunto and cap[-1]["para"] == ["destinatario@prueba.example"] and not errores,
           "PDF único · SHA-256 completo de los bytes entregados a PDF.js, de la descarga y del adjunto del capturador local:\n     PDF.js    %s\n     descarga  %s\n     adjunto   %s" % (visor, descarga, adjunto)); await pg.context.close(); para(pr)
        # ---- 5. FASE A: la función arranca con el envío apagado. El panel lo lee antes de enviar y el resultado se compara con el estado anterior.
        pr = servicios({"AMJ_LOCAL_ENVIO": "0"}); antes = estado(); c0 = len(capturados()); pg, fuera, errores, mal, puerta = await hasta_el_pdf("A")
        await pg.wait_for_selector(".rpma .bv, .rpma .out:not([disabled])")   # el PDF ha terminado de dibujarse
        ok("fase A: envío apagado" in await pg.inner_text("#ensayo-banda") and "envío real: apagado" in puerta and "solo destinatarios ficticios: sí" in puerta and await pg.is_enabled(".rpma .go"), "fase A · antes de pulsar «Enviar», la función desplegada dice: envío real apagado y solo ficticios; solo entonces se puede seguir")
        visor = await pg.get_attribute(".rpmv", "data-sha256"); descarga = await pg.evaluate(HUELLA_DESCARGA)
        await pg.click(".rpma .go"); await pg.click(".rpma .go"); await pg.wait_for_function("document.querySelector('.rpms').textContent.includes('deshabilitado')"); despues = estado()
        F = despues["funcion"][len(antes["funcion"]):]; ult = [x for x in F if x["metodo"] == "POST"][-1]
        ok(ult["estado"] == 423 and len(capturados()) == c0 and despues["reservas"] == antes["reservas"] == 0 and despues["archivos"] == antes["archivos"] == 0 and visor == descarga and len(visor) == 64 and not errores and fuera == [],
           "fase A · «Enviar» devuelve 423 · antes/después: llamadas al proveedor %d/%d, reservas %d/%d, archivos guardados %d/%d · visor = descarga = %s" % (c0, len(capturados()), antes["reservas"], despues["reservas"], antes["archivos"], despues["archivos"], visor)); await pg.context.close(); para(pr)
        # ---- 6. La misma función, arrancada como en PRODUCCIÓN, no admite el origen local: el navegador bloquea la petición en el preflight.
        pr = servicios({"DENO_SERVE_ADDRESS": "tcp:127.0.0.1:8001"}, "produccion_simulada.ts")
        r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8001/", method="OPTIONS", headers={"Origin": "http://127.0.0.1:8791", "Access-Control-Request-Method": "POST"})); permite = r.headers["Access-Control-Allow-Origin"]
        ctx = await b.new_context(); pg = await ctx.new_page(); await pg.goto("http://127.0.0.1:8791/beta/vendor/"); 
        res = await pg.evaluate("async()=>{ try{ const r=await fetch('http://127.0.0.1:8001/',{method:'POST',headers:{authorization:'Bearer x',apikey:'k','content-type':'application/json'},body:'{}'}); return 'RESPUESTA '+r.status }catch(e){ return 'BLOQUEADA: '+e.message } }")
        ok(permite == "https://19732607.github.io" and res.startswith("BLOQUEADA"), "producción sigue excluyendo localhost: la función responde al preflight con «%s» y el navegador bloquea la petición desde el origen local (%s)" % (permite, res)); await ctx.close(); para(pr)
        await b.close()
asyncio.run(main()); srv.shutdown()
