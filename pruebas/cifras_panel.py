"""Prueba del panel (bloque 3): cifras, periodos y cupo con datos ficticios y el reloj fijado al 21/11/2026 (Europe/Madrid).
Ejecutar:  python3 pruebas/cifras_panel.py"""
exec(open(__file__.replace("cifras_panel.py", "envio_panel.py"), encoding="utf-8").read().split("PREPARA =")[0])
O = lambda i, piso, st, ca, sa=None, fa=None, rep="": dict(id=i, reference=900 + i, revision=1, status=st, service="Fontanería", description=piso + " | Trabajo ficticio %d" % i, address="", locality="Ciudad",
    created_at=ca, started_at=sa, finished_at=fa, technician_name="Nombre Apellido", technician_id="t1", customer_name="", report=rep)
FILAS = [O(1, "HELP-P1", "completed", "2026-10-20T08:00:00Z", "2026-10-20T09:00:00Z", "2026-10-21T08:00:00Z", "Trabajo hecho."),                      # exactamente 24 h: no es «menos de 24 h»
         O(2, "HELP-P1", "completed", "2026-10-20T09:30:00Z", "2026-10-20T10:00:00Z", "2026-10-20T11:00:00Z", "VISITA REALIZADA SIN POSIBILIDAD DE EJECUCIÓN. Sin llaves."),   # misma visita que la 1
         O(3, "HELP-P2", "completed", "2026-10-22T08:00:00Z", "2026-10-22T09:00:00Z", "2026-10-22T09:30:00Z", "No se pudo acceder a la vivienda."),   # sin ejecución con otra redacción; visita sin ningún trabajo
         O(4, "HELP-P3", "cancelled", "2026-10-25T08:00:00Z"),                                                                                      # cancelada el 05/11: abierta al cierre de octubre
         O(5, "HELP-P4", "assigned", "2026-10-28T08:00:00Z"),
         O(6, "ENSO-E1", "assigned", "2026-10-05T08:00:00Z"),                                                                                       # cliente sin cierres en octubre
         O(8, "HELP-P6", "completed", "2026-10-10T08:00:00Z", "2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z", "Trabajo hecho."),                        # cerrada el 15/10, reabierta el 03/11 y cerrada otra vez el 04/11
         O(7, "HELP-P5", "completed", "2026-10-31T21:00:00Z", "2026-10-31T22:30:00Z", "2026-10-31T23:30:00Z", "Trabajo hecho.")]                    # 31/10 23:30 UTC = 01/11 00:30 en Madrid: es de noviembre
PREPARA = "()=>{ __t(`session={access_token:'x',expires_at:Date.now()+9e12}; O=normalize(" + json.dumps(FILAS) + """); computeTags(); RV=[]; O.forEach(o=>{ MED[o.id]=[]; MAT[o.id]=[] }); MAT[1]=[{description:'Material ficticio',quantity:1,unit_price:50,subtotal:50,iva:10.5,total:60.5}]; MAT[2]=[{description:'Otro',quantity:1,unit_price:10,subtotal:10,iva:2.1,total:12.1}]; MAT[3]=[{description:'Otro',quantity:1,unit_price:15.5,subtotal:15.5,iva:3.26,total:18.76}];
  document.querySelectorAll('[hidden]').forEach(e=>e.hidden=false); document.getElementById('nw').hidden=true; document.getElementById('login').style.display='none'; lastOk=1;
  sec='informes'; repPer='mes'; repDay='2026-10-15'; repCl=''; renderSec();`) }"""
ok = lambda c, m: (print("OK ·", m) if c else (_ for _ in ()).throw(AssertionError(m)))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1300, "height": 950}); errores = []; pg.on("pageerror", lambda e: errores.append(str(e)))
        await pg.clock.set_fixed_time("2026-11-21T12:00:00Z"); hist = {"hay": False}
        async def contexto(route):
            if not hist["hay"]: return await route.fulfill(status=404, json={"code": "PGRST202"})
            S = {"total": 0, "fuente": "sin_materiales"}
            await route.fulfill(json=[{"id": 1, "mat_informe": {"total": 50, "base": 45.45, "iva": 4.55, "fuente": "ticket"}},          # ticket con IVA del 10 %
                {"id": 2, "sin_ejecucion": True, "mat_informe": {"total": 12.1, "fuente": "autorizado"}},                                                   # autorizado por AMJ, sin ticket: solo total
                {"id": 3, "sin_ejecucion": False, "mat_informe": {"total": 15.5, "base": 12.81, "iva": 2.69, "fuente": "ticket"}},                           # ticket aprobado + autorización de 18,76: manda el ticket (caso AMJ-289)
                {"id": 4, "ref": 904, "eventos": [{"a": "cancel", "t": "2026-11-05T10:00:00Z"}], "mat_informe": S}, {"id": 5, "eventos": [], "mat_informe": S}, {"id": 6, "eventos": [], "mat_informe": S},
                {"id": 7, "eventos": [{"a": "finish", "t": "2026-10-31T23:30:00Z"}], "mat_informe": S},
                {"id": 8, "eventos": [{"a": "finish", "t": "2026-10-15T10:00:00Z"}, {"a": "admin_voided_finish", "t": "2026-11-03T09:00:00Z"}, {"a": "admin_reopen", "t": "2026-11-03T09:00:00Z"}, {"a": "finish", "t": "2026-11-04T10:00:00Z"}], "mat_informe": S}])
        await pg.route("**/rest/v1/rpc/amj_admin_informe_ordenes", contexto)
        await pg.goto("http://127.0.0.1:8791/beta/index.html"); await pg.evaluate(PREPARA); await pg.wait_for_function("()=>__t('CTX')===null")
        lista = await pg.inner_text(".reptb"); ok("HELPHOUSING3" in lista and "ENSO0" in lista, "un cliente sin cierres en el periodo también se puede consultar (ENSO, 0 órdenes)")
        ver = lambda cl: pg.evaluate("c=>{ __t(`repSelW=new Set(['${c}']); repView=true; renderSec()`); return document.querySelector('#obody .rf').innerText }", cl)
        kpi = lambda t, etq: next(x for x in t.replace("\n\n", "\n").split("\n") if etq in x) if etq in t else ""
        val = lambda t, etq: (lambda L: L[L.index(next(x for x in L if etq in x)) - 1])([x.strip() for x in t.split("\n") if x.strip()])
        t = await ver("HELP")
        ok(val(t, "órdenes finalizadas") == "3" and "AMJ-907 · P5\tTrabajo ficticio 7\tTerminada después, el 01/11" in t, "corte en Europe/Madrid: la orden cerrada el 01/11 a las 00:30 (hora de Madrid) no es una finalizada de octubre; figura como abierta al cierre")
        ok(val(t, "cerradas en menos de 24 h desde el alta") == "67 %", "«menos de 24 h» excluye el límite exacto (24 h justas no cuenta)")
        ok(val(t, "órdenes sin posibilidad de ejecución") == "2" and val(t, "visitas en las que no se pudo hacer ningún trabajo") == "1", "sin ejecución: 2 órdenes (también con otra redacción) pero solo 1 visita sin ningún trabajo")
        ok(val(t, "avisos consumidos") == "3 / 42" and "P1 el 20/10 (AMJ-901 y AMJ-902)" in t and "4 órdenes atendidas en 3 visitas" in t, "cupo por visitas y día real de inicio: 4 órdenes empezadas en el periodo, 3 avisos de 42 (la empezada el 31/10 cuenta en octubre)")
        ok("no muestra materiales y no se puede enviar" in await pg.inner_text(".repmat") and "60,50" not in t and "18,76" not in t and "Informe de materiales" not in t, "revisión · contexto incompleto: el informe no muestra ningún importe de materiales (nunca lo declarado) y avisa de que no se puede enviar")
        await pg.evaluate("()=>__t('repSendOpen()')"); ok(await pg.locator("#rpm").count() == 0 and "No se puede enviar" in await pg.inner_text("#obody"), "revisión · sin contexto del servidor no se abre el envío")
        ok(val(t, "abiertas al cierre del mes (según el estado de hoy)") == "3" and "AMJ-908 · P6\tTrabajo ficticio 8\tTerminada después, el 04/11" in t and "no se dispone del histórico de estados" in t, "sin histórico en el servidor, se dice que las abiertas son según el estado de hoy")
        ok("desde el alta de la orden" in t and "del aviso al" not in t and "avisos creados fuera de horario" not in t and "Por estado a fecha de hoy" in t and "registrado por el técnico" in t, "los tiempos se etiquetan «desde el alta» y el de trabajo como registrado por el técnico")
        ok(t.count("Sin posibilidad de ejecución") == 2 and "★" not in t and "Nombre Apellido" not in t and "Apellido" not in t, "detalle: estado de las dos órdenes sin ejecución; sin valoraciones ni apellidos de técnicos")
        hist["hay"] = True; await pg.evaluate("()=>{ __t('CTX=undefined; repCtx()') }"); await pg.wait_for_function("()=>{ const c=__t('CTX'); return c&&c[4] }"); t = await ver("HELP")
        ok("AMJ-908" not in t, "revisión 4 · reapertura: la orden cerrada el 15/10 y reabierta el 03/11 estaba cerrada en el corte del 31/10 y no figura como abierta")
        ok(val(t, "órdenes sin posibilidad de ejecución") == "1" and val(t, "visitas en las que no se pudo hacer ningún trabajo") == "0", "revisión 4 · «sin ejecución» sale del dato del servidor (v_kpi_ordenes), no del texto del informe")
        ok(val(t, "abiertas al cierre del mes") == "3" and "según el estado de hoy" not in t, "con el histórico del servidor, la orden cancelada después del cierre cuenta como abierta en esa fecha"); ok("AMJ-904 · P3\tTrabajo ficticio 4\tAbierta en esa fecha" in t and "ancelad" not in t, "esa orden aparece en la lista de abiertas sin mencionar la cancelación (regla: las canceladas no se muestran al cliente)")
        aviso = await pg.inner_text(".repmat"); doc = await pg.inner_text("#obody .rf")
        ok(val(doc, "materiales, IVA incluido") == "77,60 €" and "con ticket: base 58,26 € · IVA 7,24 €; autorizado sin ticket: 12,10 €" in doc and "60,50" not in doc and "18,76" not in doc, "revisión · total del ticket o autorizado: 50,00 + 12,10 + 15,50 = 77,60 €; base e IVA solo de los tickets (incluido uno al 10 %)")
        ok("12,81 €\t2,69 €\t15,50 €" in doc and "—\t—\t12,10 €" in doc and "45,45 €\t4,55 €\t50,00 €" in doc, "revisión · ticket aprobado que convive con una autorización: manda el ticket (15,50 €); el autorizado sin ticket va sin base ni IVA")
        ok("AMJ-901: en el informe 50,00 € (ticket aprobado) · declarado por el técnico 60,50 €" in aviso and "AMJ-903: en el informe 15,50 € (ticket aprobado) · declarado por el técnico 18,76 €" in aviso and "AMJ-902" not in aviso, "revisión · aviso interno con las diferencias respecto a lo declarado")
        ok("sin recargo" not in doc and "precio de compra" not in doc and "declarad" not in doc, "bloque 4 · el informe no afirma «sin recargo» ni menciona importes declarados")
        await pg.evaluate("()=>{ __t(`CTX[2].mat_informe={total:null,fuente:'pendiente'}; renderSec()`) }"); aviso = await pg.inner_text(".repmat"); doc = await pg.inner_text("#obody .rf")
        ok("AMJ-902: declarado 12,10 € · sin ticket aprobado ni autorización · NO entra en el informe" in aviso and val(doc, "materiales, IVA incluido") == "65,50 €", "revisión · material sin ticket aprobado ni autorización: no entra en el informe y el aviso interno lo dice")
        t = await ver("ENSO"); ok("0 órdenes de trabajo finalizadas" in t and "No hay órdenes finalizadas en el periodo." in t and val(t, "órdenes recibidas") == "1", "informe a cero de un cliente sin cierres: se genera con sus recibidas y abiertas")
        await pg.evaluate("()=>__t(`repDay='2026-11-10'; repSelW=new Set(['HELP']); repView=true; renderSec()`)"); t = await pg.inner_text("#obody .rf")
        ok("AMJ-907" in t and "Periodo en curso: datos hasta el 21/11" in t and val(t, "avisos consumidos") == "1 / 100", "noviembre en curso: corte el 21/11; la orden cerrada el 01/11 (Madrid) es de noviembre y su aviso, del periodo en que empezó; la reabierta cuenta por su inicio vigente (04/11)")
        ok(not errores, "sin errores de JavaScript: " + "; ".join(errores)); await b.close()
asyncio.run(main()); srv.shutdown()
