# S2C — límites JSON y logs privados

## Auditoría breve

Diez de las doce funciones leen body JSON. `plan-options` y `place-photo` sólo usan GET.
Los lectores compartido y duplicados aceptaban objetos/strings preparseados sin aplicar
su límite. En streams medían caracteres, destruían la conexión al superar el límite y
podían quedar pendientes. `event-request` verificaba el body objeto y Content-Length,
pero heredaba el problema del stream. Arrays/primitivos no se rechazaban uniformemente.

Logs peligrosos: `err.message` en admin, búsquedas, fotos, email y respuesta pública;
Supabase puede incluir valores rechazados en el error y Resend puede devolver información
sensible. Turnstile imprimía códigos externos sin whitelist y rate-limit concatenaba
códigos externos. No se comprobó una filtración histórica en Production: el riesgo se
reproduce mediante errores simulados con PII/secrets, no inspeccionando logs reales.

Los catches ya daban mayormente mensajes fijos al cliente. Las RPC comerciales devolvían
sus mensajes sin filtrarlos y los fallos de configuración/schema mostraban nombres de
infraestructura, tablas o instrucciones de SQL. Se corrigen ambos límites de exposición.

## Implementación

Todas las escrituras usan `http.readJson` con límite UTF-8 y lista cerrada de campos.
Cuenta objetos preparseados, strings, Buffer y streams; no confía sólo en Content-Length.
Cuerpos inválidos, vacíos, arrays, null, primitivas, UTF-8 inválido, campos desconocidos,
objetos donde se espera un escalar, profundidad excesiva o campos largos: 400 seguro.
Exceso de bytes: 413. Content-Type no JSON: 415. Auth/rate-limit mantienen su orden.
Los campos textuales se limitan según formularios/validadores; no se guardan truncados
cuando exceden ese límite. Los validadores comerciales siguen revisando valores.

| Función | Métodos con JSON | Bytes máximos |
| --- | --- | ---: |
| event-request | POST | 32000 |
| plan-selection | POST | 4000 |
| plan-inquiry | POST | 8000 |
| proposal | POST | 6000 |
| admin-login | POST | 2000 |
| admin-inquiries | PATCH | 1000 |
| admin-proposals | POST | 2000 |
| admin-bookings | POST/PATCH | 20000 |
| admin-quotes | POST | 32000 |
| admin-providers | POST/DELETE | 16000 |

Se elevan los límites nominales de reservas, cotizaciones y atributos para admitir los
máximos textuales del formulario aun con Unicode. No cambian montos, estados, transiciones,
matching, queries de Google ni flujos comerciales.

`private-log.error` recibe contexto fijo y error. Sólo emite contexto, HTTP numérico
válido, códigos SQL/PostgREST permitidos, configuración ausente o timeout. No serializa
message, stack, step, name arbitrario, headers, payload, respuesta externa, IP ni huellas.
Las llamadas usan etiquetas literales. `rpc-error` conserva sólo mensajes comerciales
fijos de las RPC versionadas; cualquier mensaje nuevo/desconocido usa un fallback seguro.
Un cambio futuro de mensajes RPC debe actualizar esa lista para conservar su detalle.
`sendJson` traduce errores de schema/configuración a un mensaje humano sin instrucciones SQL.

Las integraciones todavía pueden construir errores con respuestas externas en memoria
para reconocer conflictos o incompatibilidades; no se imprimen ni se envían al cliente.
No se modifican RPC, tablas, índices, permisos, retención ni contenido de los emails.
No hay migration, dependencias o endpoints nuevos. No se publica desde esta rama.

## Validación y límites pendientes

Tests con transportes simulados: 400/413 en todas las escrituras, preparseado/stream,
UTF-8 y chunks, cierre/aborto/error, una sola respuesta, campos enormes/desconocidos,
PII/secrets en errores de Supabase/Google/Resend/Turnstile y logs, éxito con warning tras
fallo de email y cotización larga con Unicode. Las regresiones S2B/G siguen vigentes.
Las pruebas no invocan servicios reales ni SQL remoto.

Vercel puede rechazar un body antes de ejecutar la función con su propia respuesta;
este código controla sólo requests que llegan al handler. El body preparseado ya fue
asignado por la plataforma; aquí se impide que continúe hacia la lógica/escrituras.
La función no retiene chunks nuevos tras 413; responde sin destruir el socket para poder
entregar el error. Streams interrumpidos resuelven, aunque un cliente desconectado no
puede recibir esa respuesta.

S2E: retención de logs/datos/backups/recibos existentes y eliminación de registros
históricos; este cambio no inspecciona ni borra esos datos. No se toca S2D.

## Smoke recomendado en Preview

1. Buscar, elegir, enviar Quiero avanzar; confirmar que reenvíos recuperan la solicitud.
2. Login y acciones de panel: contacto, cotización, propuesta, reserva, cancelación/completar.
3. Aceptar/rechazar propuesta y repetir la misma respuesta.
4. Enviar JSON truncado, array y body grande a endpoints de prueba: 400/413 sin datos
   técnicos ni escrituras comerciales. Los intentos pueden consumir el rate limit.
5. Enviar un error externo simulado sólo en prueba con datos centinela: logs con contexto
   y códigos, sin centinelas. Resend fallido conserva éxito + warning, sin pedir otro INSERT.
6. Confirmar 12 funciones y ausencia de cambios visuales. SQL/deploy sólo por proceso
   separado y aprobado; S2C no necesita SQL.
