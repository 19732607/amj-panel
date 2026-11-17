# Panel AMJ · Órdenes (web, solo lectura)

- Página estática: `index.html` + `panel.js`. Sin compilación, sin servidor propio.
- Acceso: correo y contraseña de la cuenta de **administración** de la app (mismo login que la app).
- Datos: RPC de producción `public.amj_admin_orders('todas', p_before, 100)`; el servidor rechaza a quien no es administrador (`ACCESS_DENIED`, comprobado 17/11/2026 con cuenta admin y con cuenta de técnico).
- Actualización: consulta cada 15 s mientras la pestaña está visible (no hay Realtime en el servidor; activarlo sería un cambio de servidor y requiere permiso de Antonio).
- No escribe nada en el servidor. Las acciones (asignar, cancelar, ajustar horas) siguen en la app.
- Sesión: en la pestaña; «Recordarme en este equipo» la guarda en el navegador.
- Avisos calculados en el navegador: sin técnico >30 min, rechazada, cita pasada sin empezar, en curso >3 h, más de 2 h de trabajo, empezó ≥3 h tarde, varias órdenes en un piso el mismo día, duplicada cancelada. Órdenes de prueba ocultas por defecto (texto «PRUEBA»/«NO EJECUTAR»).
- Pruebas: simulación completa con navegador (login correcto/incorrecto, filtros, avisos, refresco y resaltado de cambios, cierre de ficha, móvil).
