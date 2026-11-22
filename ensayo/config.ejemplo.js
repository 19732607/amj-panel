/* Configuración del ENSAYO del Panel AMJ contra AMJ-Pruebas. Copiar a ensayo/config.js (ese archivo NO se sube al repositorio) y poner la clave.
   Se abre con:  http://localhost:8791/beta/index.html?entorno=ensayo   (sirviendo esta carpeta en local; ver ENSAYO_AMJ_PRUEBAS_INFORMES.md)
   El panel se detiene, antes de enviar credenciales o cualquier petición, si:
     · la página no se abre desde localhost, o se abre sin «?entorno=ensayo»;
     · el proyecto no es exactamente gktignfhalpwhewhkzya o la dirección no es la de ese proyecto;
     · la clave no es la clave pública de AMJ-Pruebas (se comprueba con una huella escrita en el propio panel), es la de producción o es una clave de servidor.
   La clave pública de AMJ-Pruebas está en el repositorio del servidor: supabase/pruebas/extremo_a_extremo.mjs (constante APIKEY).
   fase: 'A' (por defecto) = ensayo técnico; el panel solo deja pulsar «Enviar» si la función desplegada dice que el envío real está apagado
   y que solo admite destinatarios ficticios. 'B' = ensayo de envío, con otra autorización. */
window.AMJ_ENTORNO = {
  proyecto: 'gktignfhalpwhewhkzya',
  url: 'https://gktignfhalpwhewhkzya.supabase.co',
  clave: 'PEGAR_AQUI_LA_CLAVE_PUBLICA_DE_AMJ_PRUEBAS',
  fase: 'A'
};
