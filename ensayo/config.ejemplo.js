/* Configuración del ENSAYO del Panel AMJ contra AMJ-Pruebas. Copiar a ensayo/config.js (ese archivo NO se sube al repositorio) y rellenar la clave.
   Se abre con:  http://localhost:8791/beta/index.html?entorno=ensayo   (sirviendo esta carpeta en local; ver ENSAYO_AMJ_PRUEBAS_INFORMES.md)
   El panel se niega a funcionar si el proyecto no es exactamente gktignfhalpwhewhkzya, si la dirección no es la de ese proyecto,
   si la clave es la de producción o si la página no se abre desde localhost. */
window.AMJ_ENTORNO = {
  proyecto: 'gktignfhalpwhewhkzya',
  url: 'https://gktignfhalpwhewhkzya.supabase.co',
  clave: 'PEGAR_AQUI_LA_CLAVE_PUBLICA_DE_AMJ_PRUEBAS'   /* la «publishable key» de AMJ-Pruebas; no es un secreto, pero no es la de producción */
};
