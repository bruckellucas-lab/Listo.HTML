# S2D — abuso económico y consumo externo

## Auditoría

- **plan-options:** GET público llama Text Search y escribe filas mínimas de providers.
  Ya valida categorías y tiene 30 búsquedas/10 minutos por visitante. Su fallback en
  memoria no es compartido entre funciones. Faltaban topes totales y freno a ráfagas iguales.
- **place-photo:** firma HMAC, anchos permitidos y vencimiento de una hora ya protegen
  contra inventar/modificar enlaces. Copiar una URL válida permitía repetirla durante
  esa hora y cada GET/HEAD podía pedir el URI a Google. Faltaban límites de uso.
- **proposal GET:** ya limita aperturas/misses en memoria y Place Details de forma
  persistente (20/10 min por visitante y 200/h total); falla cerrado con fallback honesto.
  Se agrega presupuesto diario de Details. GET sigue funcionando cuando no puede pedir Google.
- **admin-providers detalle:** autenticado, un Place Details por apertura, pero sin
  límite económico. Se agregan límites propios; lista y edición de atributos no cambian.
- **plan-inquiry:** 8 envíos/10 min por visitante + Turnstile antes de guardar. S2B-3
  recupera operaciones y no repite emails por replay/contenido idéntico. Datos diferentes
  pueden legítimamente actualizar y avisar; faltaba presupuesto total de emails.
- **proposal POST:** 10 respuestas/10 min, PATCH condicionado e idempotencia; sólo el
  ganador avisa. No llama Google. Se agrega el mismo presupuesto global de emails.
- **event-request / plan-selection:** 20 y 40/10 min, persistentes/fail closed; no llaman
  Google ni Resend. S2C limita JSON y logs; no necesitan otro cambio aquí.
- **admin-login/admin-proposals/admin-bookings/admin-inquiries/admin-quotes:** autenticación,
  límites de ingreso, JSON y transacciones existentes. Generar propuesta no envía email.
  Listas/métricas pueden consumir Supabase, pero están autenticadas y no llaman Google.
  `fetchPlacePhotos` es un helper sin caller de producción; no se agrega un flujo nuevo.

## Cambios y valores iniciales para beta

| Consumo | Por visitante/firma | Total compartido |
| --- | --- | --- |
| Text Search | 30/10 min existente; misma categoría/zona normalizada, 2/10 s | 200/h, 1000/día |
| Foto GET | 120/10 min por visitante; 20/h por firma, independiente de IP | 1000/h, 4000/día |
| Details de propuesta GET | 20/10 min existente | 200/h existente, 600/día |
| Details de admin | 60/10 min | 120/h, 400/día |
| Emails de inquiry + respuesta de propuesta | límites públicos existentes + dedupe S2B-3 | 60/h, 200/día, sumando ambos tipos |

Valores conservadores para beta, no promesa de un presupuesto monetario. Fotos permiten
varias galerías de seis fotos y reaperturas; el mismo link admite recargas normales.
Búsquedas iguales admiten un reintento inmediato. Admin admite seis aperturas por minuto
promedio y picos controlados; el fallback conserva el link a Maps y no bloquea operaciones.
Revisar métricas/cuotas reales antes de aumentar estos valores o abrir una beta masiva.

Todos los topes nuevos se consultan ANTES del servicio externo y fallan cerrado si no
pueden contarse. Se reutiliza `listo_rate_limit_hit` con dbScope existente (plan_options,
plan_inquiry o proposal_response), pero con huella distinta para cada contador.
La RPC ya acepta ventanas 10..86400 s y máximos 1..10000. No hay SQL/migration, cambios de
índices, tablas, permisos, lógica comercial o dependencias. La concurrencia se resuelve
con el contador atómico existente, no con caché en memoria.

La clave para búsquedas iguales combina categoría/zona propias del pedido e IP
normalizada, sólo dentro de la HMAC. Para fotos se utiliza la firma opaca validada, no
el photo name. Sólo se guarda la huella de uso en api_rate_limits, nunca referencias,
URLs, respuestas ni imágenes Google. No se registra IP ni texto/firma. Los namespaces
separados no mezclan conteos de aceptar/rechazar, fotos, búsqueda, admin o emails.

No se agrega caché de contenido Google. Se mantienen firmas, atribución y `no-store`.
HEAD valida el enlace y devuelve 204 sin Google. `Sec-Fetch-Site: cross-site` bloquea
hotlinking casual en navegadores; ausencia del header no rompe clientes compatibles.

Si falla/vence un presupuesto de email DESPUÉS de guardar, se responde éxito con warning.
Inquiry intenta marcar la fila exacta con notification_status=failed sin Google/Resend;
si también falla ese PATCH, la operación principal sigue guardada y el warning permanece.
Un replay no consume presupuesto de email ni intenta avisar otra vez. No hay outbox ni
reenvío automático. Si Resend falla, el intento consume presupuesto y no se induce otro INSERT.
Los Details de emails están acotados por su presupuesto de envío: en el peor caso el
fallback de contexto existente puede hacer dos llamadas Google por intento de email.

## Fallback, riesgo residual y qué puede esperar

La búsqueda conserva el fallback local de su límite por visitante, pero sus presupuestos
nuevos requieren Supabase: si cae, no busca en Google y devuelve 503 humano. Esto cambia
la disponibilidad para proteger costos. Admin/propuesta GET conservan respuesta 200 con
aviso y Maps cuando no pueden pedir Details. Fotos se muestran con el placeholder existente.

Ventanas fijas: cerca de un cambio de ventana puede haber ráfagas de hasta dos ventanas;
los topes no son límites rodantes ni exactos de facturación. Se cuentan intentos, incluyendo
fallos; consultas fallidas pueden consumir presupuesto y no se reembolsan. Cambiar IP
no evade los topes compartidos, pero un atacante distribuido puede agotarlos y afectar
usuarios legítimos. Rotar firma/obtener otra búsqueda no evita topes globales de fotos.

Sec-Fetch-Site es defensa auxiliar: bots pueden omitirlo/forjarlo. Firma no equivale a
identidad: enlaces compartidos siguen utilizables dentro de cuotas y vigencia. No se
promete entrega de emails exactamente una vez si Resend recibe y se pierde su respuesta.
Los requests rechazados aún pueden consumir invocaciones Vercel y RPC de Supabase; estos
controles no son protección completa contra DDoS. Añaden RPCs/latencia a consultas válidas.

Antes de beta: revisar cuotas duras de Google por SKU, restricciones de clave, límites
operativos de Resend/Vercel/Supabase y alertas; alertas de presupuesto no son un corte de
facturación. No se cambiaron configuraciones externas durante esta tarea. Son necesarios
para contener abuso que no llega a los guards o utiliza credenciales fuera de LISTO.
S2E cubre retención/limpieza histórica de contadores y datos; no se cambia aquí. F1 puede
revisar frecuencia de búsquedas/experiencia con datos de uso, sin introducir caché Google.

## Pruebas y smoke pendiente en Preview

`npm run check` y `npm test`. Transportes simulados: búsqueda normal/repetida/global/día,
fotos copiadas, firma inválida/vencida, hotlinking/HEAD, llamadas simultáneas, scopes/HMAC,
Supabase caído, admin normal/fallback, budgets de email y replay sin envío repetido.
Regresiones S2B/S2C y Google compliance se mantienen. No se ejecuta SQL ni servicios reales.

1. Buscar y refrescar una vez; ráfaga idéntica: 429 humano y Retry-After. Otra zona funciona
   si quedan cuotas. Fallo de escritura providers no impide mostrar opciones con límites sanos.
2. Abrir tarjetas/galería/propuesta en desktop y mobile: fotos firmadas normales y no-store.
   HEAD no pide Google. No probar el tope global agotando Production: hacerlo en prueba.
3. Simular contador no disponible en entorno de prueba: no Google; propuesta/admin muestran
   fallback con Maps, fotos placeholder y búsqueda 503.
4. Quiero avanzar y responder propuesta: éxito; replay no segundo email. Budget/Resend
   fallido: guardado + warning, sin duplicar; revisar notification_status en inquiry.
5. Login, lista y acciones comerciales del panel; detalle de lugar normal o fallback.
   Validar counters separados, sin contenido Google ni datos sensibles en logs.

Publicación/Preview y validación real pendientes de revisión independiente. Sin merge,
SQL remoto ni deploy de Production desde esta rama.
