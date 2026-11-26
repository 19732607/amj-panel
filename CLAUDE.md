# Panel AMJ · Órdenes
Página estática publicada con GitHub Pages (rama main, carpeta raíz). Código fuente de referencia: repo 19732607/amj-tecnicos-ios, `herramientas/panel-web/`. El estado del proyecto está en `ESTADO.md` de amj-tecnicos-ios (rama claude/focused-gates-w26gnc). Solo lectura, con una excepción: no añadir escrituras al servidor sin permiso de Antonio.

Escritura autorizada por Antonio el 26/11/2026 (de momento solo en `beta/`): en «Pagos a técnicos», el botón
«Anotar» llama a `public.amj_record_technician_bank_transfer`, que SOLO anota en el servidor una transferencia
que Antonio ya ha hecho en el banco. No mueve dinero.

Segunda escritura autorizada por Antonio el 26/11/2026 («OK INGRESOS», también solo en `beta/` de momento): la sección
«Ingresos y resultado» anota cuotas fijas e ingresos extra con `amj_admin_ingreso_fijo_guardar`, `amj_admin_ingreso_fijo_mes`,
`amj_admin_ingreso_extra_guardar` y `amj_admin_ingreso_anular`, y lee con `amj_admin_ingresos`. Reglas suyas: extra es todo lo
facturado fuera de una cuota, a cualquier cliente; los materiales no son extras y van aparte; importes sin IVA; nada se borra,
se anula con motivo. Cualquier otra escritura sigue necesitando su permiso.
