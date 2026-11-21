"""Prueba conjunta panel + función (bloques 1 y 2). El panel real habla con la función real, que usa dobles de Supabase y del correo.
Antes, en el repositorio amj-tecnicos-ios:  deno run --no-lock --allow-net=127.0.0.1,0.0.0.0:8000 --allow-env --allow-read tests/informes/envio/servidor_local.ts
Después:  python3 pruebas/integracion.py"""
import asyncio, base64, json, urllib.request
exec(open(__file__.replace("integracion.py", "envio_panel.py"), encoding="utf-8").read().split("ok = lambda")[0])
TOKEN = "x" * 12 + "." + base64.b64encode(json.dumps({"sub": "admin-1"}).encode()).decode() + "." + "y" * 12
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 950}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e)))
        async def a_local(route):
            if route.request.method == "OPTIONS": return await route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"})
            r = urllib.request.Request("http://127.0.0.1:8000/", data=route.request.post_data.encode(), headers={"Authorization": "Bearer " + TOKEN, "apikey": "pk", "Content-Type": "application/json"}, method="POST")
            try: x = urllib.request.urlopen(r); st, body = x.status, x.read()
            except urllib.error.HTTPError as e: st, body = e.code, e.read()
            await route.fulfill(status=st, body=body, headers={"content-type": "application/json", "Access-Control-Allow-Origin": "*"})
        await pg.route("**/functions/v1/amj-informes-enviar", a_local)
        async def datos(route): await route.fulfill(json=[] if "amj_order_materials" in route.request.url else [{"id": "m%d" % i, "order_id": i, "object_path": "o/%d.jpg" % i} for i in (1, 2)])
        await pg.route("**/rest/v1/amj_service_media*", datos); await pg.route("**/rest/v1/amj_order_materials*", datos)
        await pg.goto("http://127.0.0.1:8791/beta/index.html"); await pg.evaluate(PREPARA)
        await pg.fill(".rpml input >> nth=0", "destinatario@prueba.example"); await pg.locator(".rpma .out").first.click(); await pg.wait_for_selector(".rpmv canvas")
        vista = await pg.evaluate("async()=>{ const a=document.querySelector('.rpmf a[download]'); const u=new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const h=await crypto.subtle.digest('SHA-256',u); return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('') }")
        fotos = await pg.inner_text(".rpmf"); paginas = await pg.locator(".rpmv canvas").count()
        e = pg.locator(".rpma .go"); await e.click(); await e.click(); await pg.wait_for_function("document.querySelector('.rpma .go').textContent.includes('Enviado')")
        cap = json.loads(urllib.request.urlopen("http://127.0.0.1:54398/").read())[-1]
        print("vista previa y descarga :", vista); print("adjunto capturado       :", cap["sha256"], "·", cap["archivo"], "·", cap["para"]); print("fotos:", fotos.split("\\n")[0], "· páginas en el visor:", paginas)
        assert vista == cap["sha256"] and not errores, (vista, cap, errores); assert "Cliente comprobado por el servidor: Cliente Ficticio" in fotos, fotos; print("OK · panel y función integrados: el adjunto es el archivo revisado y el cliente lo comprueba el servidor"); await b.close()
asyncio.run(main()); srv.shutdown()
