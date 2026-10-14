# BETA-2 — legal mínimo y privacidad para beta

Base: `d12bbeb6d62efbefeac81712a37117ad7571baa9`.
Rama: `codex/beta2-legal-privacy`.

## Alcance

Se agregan textos mínimos y prudentes para una beta privada. No constituyen asesoramiento
legal ni una política definitiva. Deben recibir revisión profesional antes de un lanzamiento
público o de ampliar sustancialmente usuarios, proveedores, países o tratamientos de datos.

La implementación es estática y no bloqueante:

- `privacidad.html`: aviso sobre datos ingresados, finalidad, restricciones sensibles,
  WhatsApp/Meta, Google Maps y otros operadores, conservación provisional y canal para pedir
  acceso, corrección o eliminación.
- `terminos.html`: reemplaza el aviso parcial anterior por términos mínimos sobre el rol de
  LISTO, interés versus reserva, ausencia de garantías, restricciones fuertes, Google Maps,
  comunicaciones externas y límites de la beta.
- Footer público: links visibles “Privacidad” y “Términos beta”.
- Formulario “Quiero avanzar”: aviso corto junto al envío, con links que abren las páginas
  estáticas en otra pestaña. No se agregó checkbox obligatorio: el flujo ya expresa la acción
  de contacto y bloquearlo habría cambiado validación, recuperación y UX sin resolver por sí
  solo la definición legal pendiente.

## Qué cubren los textos

- Datos que el usuario puede ingresar: plan, zona, invitados, fecha/hora, presupuesto,
  necesidades, restricciones, nombre y contacto, email y comentarios.
- Guardado del texto del pedido, los datos del plan y sus restricciones cuando el usuario
  busca opciones, aunque no elija avanzar.
- Copia del último plan y sus restricciones en el navegador para poder retomarlo, junto con
  la forma de borrarla eliminando los datos del sitio.
- Finalidades: interpretar y armar opciones, registrar la elección, coordinar, contactar,
  detectar errores y mejorar la beta.
- LISTO no vende datos ni los usa para publicidad de terceros.
- Restricciones alimentarias/de salud son sensibles y se coordinan manualmente. Google no
  verifica aptitud alimentaria; la confirmación final corresponde al proveedor.
- WhatsApp es externo, operado por Meta; abrir el link no envía por sí solo y el usuario
  decide qué información agregar y enviar.
- Algunas comunicaciones pueden hacerse por WhatsApp o email.
- LISTO es asistente/intermediario, no proveedor final. Elegir o avanzar expresa interés,
  no una reserva, pago o aceptación confirmada.
- No se garantizan disponibilidad, precio final, capacidad, horarios ni condiciones.
- Fotos, ratings, reseñas, dirección y mapas pueden provenir de Google Maps y cambiar o ser
  imprecisos; se preservan links a términos y privacidad de Google.
- La beta puede contener errores, interrupciones y disponibilidad limitada.

## Canal de privacidad

No existe un email público configurado en el repositorio. Para no inventar una identidad o
dirección legal, el aviso usa el WhatsApp público ya publicado por LISTO. El mensaje prearmado
es genérico: “Hola LISTO. Quiero hacer una consulta sobre mis datos.” No incorpora pedido,
identificador, contacto ni información de salud. El equipo puede pedir el dato mínimo necesario
para identificar el pedido antes de atender la solicitud.

## Pruebas y privacidad técnica

Los tests comprueban:

- links visibles y destinos existentes en footer y formulario;
- aviso no bloqueante, sin checkbox ni nuevo `required`;
- ideas legales mínimas sobre rol, garantías, reserva, dieta, WhatsApp, Google y eliminación;
- URL genérica del canal de privacidad, único parámetro `text`, seguridad de nueva pestaña y
  ausencia de datos sensibles/identificadores;
- páginas sin JavaScript, formularios, storage, tracking, llamadas externas programáticas o
  secretos.

La suite completa mantiene búsqueda, 0/1/2 opciones, option_token, selección, Quiero avanzar,
replay sin duplicados, WhatsApp sensible BETA-1, Google compliance y baseline F5. No se cambia
ningún request a Google, endpoint, esquema, log, allowlist ni almacenamiento.

Validación de la rama:

- `npm run check`: sintaxis OK y 12/12 funciones Vercel;
- `npm test`: 321 aprobados, 0 fallidos y 3 omitidos de integración Postgres;
- revisión visual local en Chromium de home, privacidad y términos, en desktop y mobile, sin
  overflow horizontal ni errores de ejecución.

## Pendientes antes de lanzamiento público

- revisión legal profesional y determinación de la entidad/responsable de los datos;
- domicilio/jurisdicción, canal formal de contacto y procedimiento de derechos;
- plazos finales de retención por tabla/tipo de dato y ejecución operativa de eliminación;
- acceso del equipo, seguridad y conservación de chats de WhatsApp;
- base legal/consentimiento aplicable para datos sensibles y comunicaciones;
- inventario contractual de encargados/subencargados y transferencias internacionales;
- términos para proveedores, verificación y manejo de evidencia futura;
- acuerdo comercial, cancelaciones, responsabilidades y proceso de reclamos;
- versión final de privacidad/cookies si se incorpora analítica, tracking o cuentas.

## Límites de esta implementación

Los textos describen la beta actual según el código y la información disponible. No garantizan
cumplimiento legal en una jurisdicción ni reemplazan asesoramiento. La política de conservación
queda explícitamente provisional. WhatsApp y Google siguen siendo servicios externos sujetos
a sus políticas. El usuario puede decidir compartir más información fuera del texto prearmado.

Sin SQL, migration, dependencias, endpoints, cookies, tracking, cuenta o pago. Sin cambios en
admin, propuestas, emails, estados, providers, matching, ranking, cantidad, Google request,
rate limits, option_token, selección, inquiry o persistencia. Sin merge ni deploy manual.
