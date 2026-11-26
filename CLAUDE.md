# Panel AMJ · Órdenes
Página estática publicada con GitHub Pages (rama main, carpeta raíz). Código fuente de referencia: repo 19732607/amj-tecnicos-ios, `herramientas/panel-web/`. El estado del proyecto está en `ESTADO.md` de amj-tecnicos-ios (rama claude/focused-gates-w26gnc). Solo lectura, con una excepción: no añadir escrituras al servidor sin permiso de Antonio.

Escritura autorizada por Antonio el 26/11/2026 (de momento solo en `beta/`): en «Pagos a técnicos», el botón
«Anotar» llama a `public.amj_record_technician_bank_transfer`, que SOLO anota en el servidor una transferencia
que Antonio ya ha hecho en el banco. No mueve dinero. Cualquier otra escritura sigue necesitando su permiso.
