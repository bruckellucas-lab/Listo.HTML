# S2E — privacidad y retención mínima antes de beta

Documento operativo propuesto, no política pública ni dictamen legal. Base auditada:
`8b95859e5405d9c62864abe9e6f0e2b3935e3b7d`. No se consultaron tablas, permisos, logs,
backups ni consolas de Production. No se ejecutó SQL ni se borraron datos.

## Resultado y único cambio de código

S2B-3/S2C/S2D minimizan recibos, logs y contadores, pero LISTO conserva datos personales
necesarios para coordinar planes y puede recibir salud/religión en campos libres.
No corresponde afirmar que los IDs y hashes son anónimos o que no hay PII en navegador.

El contador local de vistas/misses de `api/proposal.js` retenía IPs como claves. Ahora
usa HMAC con un secreto aleatorio efímero por instancia; no guarda IP literal en esos
mapas. No cambia identidad dentro de la instancia, límites, ventanas, respuestas ni
conteos persistentes. Los headers aún contienen la IP mientras se procesa el request;
no se promete eliminarla de Vercel, de sus logs de acceso ni de proveedores externos.
Tests comprueban huellas, separación entre instancias y acumulación/vencimiento idénticos.

No se borra localStorage después de enviar: rompería Mis planes y recuperación. No se
purga automáticamente ningún recibo: puede volver a crear solicitudes tras un replay.
No cambia diseño, modelo comercial, Google compliance, proveedores, pagos ni estados.

## Inventario comprobado en código/esquema versionado

| Ubicación | Datos | Clasificación / necesidad |
| --- | --- | --- |
| event_requests | Texto original, tipo, personas, zona, presupuesto, necesidades y dietary_requirements con detalle de alergia | Plan operativo; texto libre puede identificar personas y contener datos sensibles de salud/religión |
| plan_selections | IDs de pedido/lugar, estado y timestamps; provider_name nuevo vacío | Vínculo operativo; se asocia a una persona mediante inquiry; no es anónimo |
| plan_inquiries | Nombre, teléfono, email opcional, fecha/hora, notes, estados, canal/timestamps de contacto y notificación | PII directa y posible PII sensible en notes; coordinación |
| provider_quotes | Montos, moneda, condiciones, includes, depósito, disponibilidad, fechas, internal_notes e IDs | Datos comerciales; texto libre puede contener PII del usuario/proveedor/personal |
| plan_proposals | Código público, vínculos, estado, responded_at, user_comment, conteos/fechas de visitas | Link de acceso por posesión y respuesta comercial; comentario puede ser sensible; no IP en la fila |
| plan_bookings | Vínculos, montos/comisión, fechas, aceptación, canal, acceptance_note, internal_notes y estados | Registro comercial; notas pueden identificar personas; posibles obligaciones legales/fiscales |
| providers / provider_dietary_attributes | place_id, origen/estado/timestamps, evidencia/certificador/URLs/notas propias | Registro de proveedor y evidencia; notas/certificador pueden contener contactos; no se modifica en S2E |
| listo_recovery_operations | operation_id, kind, scope_id, payload_hash, result, created_at | Recibos técnicos vinculables; resultado mínimo, ver detalle siguiente |
| api_rate_limits | scope, key_hash HMAC, window_start, hits, expires_at | Uso/seguridad; huellas de IP normalizada o claves opacas según scope, sin IP literal ni contenido Google |
| Mapas en memoria de APIs | Contadores locales de rate-limit y vistas/misses; huellas | Metadatos efímeros por instancia; ventana lógica no garantiza borrado inmediato de claves inactivas |
| Backups g1b2 | Copias de campos Google antiguos y vínculos | Material temporal; existencia/permisos reales pendientes de verificación externa |
| Vercel / Supabase backups / Resend / buzón interno | Logs, snapshots y copias de avisos según proveedor/configuración | Copias fuera de las tablas principales; la eliminación debe tratarse también ahí |

No deberían guardarse API keys, secretos, cookies, tokens Turnstile/option_token, payloads
completos de servicios externos ni nuevas copias de contenido Google. Una policy pública,
un grant o una vista puede abrir lecturas aunque el frontend no tenga credenciales: revisar
configuración real (S2A previamente verificado por el usuario, no revalidado aquí).
`SUPABASE.md` conserva instrucciones históricas: no reejecutarlas como setup de producción;
las migrations posteriores cierran accesos. El estado efectivo requiere inspección externa.

## Recibos S2B-3: mínimos, pero no anónimos

Según `20261009180000_s2b3_recovery.sql`, columnas exactas: operation_id, kind, scope_id,
payload_hash, result y created_at. Resultado inquiry: inquiry_id, selection_id, updated.
Resultado comercial: item (id, status, updated_at, provider_contacted_at/channel), booking_id
y booking_updated_at. No se copian nombres, teléfonos, emails, notas, formularios, montos
completos, claves ni datos Google al resultado.

`payload_hash` es MD5 de intención/payload canonicalizado (incluye datos personales en
su entrada), no HMAC ni cifrado; sirve para igualdad, no confidencialidad. IDs vinculan a
filas con PII y un hash puede facilitar correlación/pruebas de valores conocidos. Considerar
recibos datos técnicos seudonimizados y mantenerlos restringidos, no exportarlos como anónimos.
RLS/revokes/service_role están versionados; permisos efectivos de Production NO VERIFICADOS
por esta auditoría (el usuario confirmó los de S2B-3 antes de publicación).

**No recomendar DELETE por fecha todavía.** Si se borra un recibo de inquiry y la solicitud
original se cerró, el mismo operation_id puede crear una inquiry nueva: la RPC no tiene un
contrato de expiración de operaciones. Tampoco existe una expiración comercial ligada al
sessionStorage de un navegador particular. Borrar storage no prueba que no habrá replay.

Política futura sugerida: revisar volumen mensualmente; objetivo a evaluar de 90 días
tras cierre/resolución comercial, sólo después de diseñar rechazo seguro de operaciones
viejas o tombstones mínimos y probar replays tardíos/concurrencia. Hasta entonces conservar
recibos protegidos, sin cleanup automático/manual por edad. Esa mejora necesita tarea
separada; no se cambia la RPC ni se define aquí una promesa de borrado a los 90 días.

## Navegador

- `app.js` guarda `listo:last-plan` en localStorage: text, data (incluidas restricciones/
  detalles de alergia), requestId/requestSig, selected/place_id, selectedAt, selectionId e
  inquiries (marcas por pedido/lugar). Sin vencimiento automático. El texto original también
  queda dentro de requestSig, que contiene el pedido serializado: puede repetir datos sensibles.
- Los campos explícitos de formulario de inquiry (nombre/teléfono/email/notes) no se copian
  al storage de LISTO. Eso NO garantiza ausencia de PII: text/data pueden incluirlos si se
  escribieron en el pedido. Autocompletado/password manager/historial dependen del navegador.
- Opciones Google quedan sólo en memoria; scrubStoredPlan elimina options/optionsAt de
  planes antiguos. No borra otros campos propios ni audita cualquier copia/export antiguo.
- `recovery.js` guarda `listo-recovery-v1` en sessionStorage: scope con IDs, SHA-256 de la
  intención y UUID. Máximo 100 contextos, sin formularios o tokens literales. El hash puede
  derivar de contactos/notas: seudónimo, no anonimización. En memoria si storage falla.
- Admin/propuesta no guardan por sí mismos contactos/comentarios en Web Storage; datos de
  detalle/formulario pueden permanecer en DOM/memoria mientras la página esté abierta.
  Cookie admin: 12 horas, HttpOnly/Secure/SameSite=Strict según código; no Web Storage.

No limpiar al cerrar modal ni tras éxito: se perderían Mis planes/IDs de recuperación.
Recomendar dispositivo personal, cerrar sesión admin y limpiar datos del sitio en equipos
compartidos después de comprobar que las operaciones están guardadas. Quitar sólo las claves
propias mencionadas elimina copia local, no Supabase ni emails; pierde recuperación local.
TTL de borradores/acción de borrado visible requiere decisión de producto y revisión de UX,
no se incorpora aquí. El usuario no debe recibir una promesa de limpieza que el código no cumple.

## Emails y logs

`notify.js`: Quiero avanzar envía nombre/WhatsApp (incluido wa.me), tipo, fecha/hora,
personas/zona y lugar/Maps al buzón interno configurado; pide el lugar a Google en ese momento.
No replica email del usuario, notes, original_prompt ni restricciones alimentarias.
Respuesta de propuesta envía nombre/WhatsApp, datos de plan/cotización y comentario de rechazo
(en HTML y texto); usa Lugar elegido + Maps, sin llamar Google. Comentario libre puede incluir
salud/religión u otra PII. Escape HTML protege formato, no privacidad. No hay envío al proveedor
ni al usuario implementado por estas funciones; generar propuesta/login no manda email.

Antes de beta: limitar acceso al buzón interno, MFA, sin reenvíos automáticos amplios ni
exportaciones indiscriminadas. Minimizar comentarios sensibles desde operación. Considerar
como siguiente ajuste aprobado sustituir comentario de rechazo por link al panel; no se cambia
ahora el modelo de avisos. No adjuntar dumps, tokens, claves o logs a emails de soporte.

S2C filtra logs nuevos propios; no limpia logs anteriores, logs de plataforma, log drains,
exports o snapshots. Revisar externamente Vercel: retención/config actual del plan,
accesos/equipo, destinos de logs y cualquier export. Si hay exposición de secretos, rotar
la credencial con procedimiento coordinado, no asumir que borrando el log desaparece.
No copiar logs con PII al repo, a tickets públicos o a este chat. Revisar sólo evidencia
mínima redactada y registrar resultado sin datos personales.

## Política mínima sugerida (pendiente de aprobación operativa/legal)

| Datos | Criterio propuesto |
| --- | --- |
| Solicitudes abiertas y vínculos | Conservar mientras se coordina el plan; revisar inactividad a los 90 días, sin cambiar estados automáticamente |
| Solicitudes cerradas sin reserva/obligación/reclamo | Revisión manual 90 días después de última actividad; evaluar minimización/eliminación del conjunto vinculado, no DELETE aislado |
| Reservas/cotizaciones/propuestas con obligaciones o reclamos | Conservar para operar/auditar; legal/contabilidad debe fijar plazo y base, sin inventar años fiscales ni purgar por estado completed |
| Borradores de pedido sin operación comercial | Revisar después de 90 días; texto/alergias pueden ser sensibles incluso sin inquiry; verificar vínculos antes de borrar |
| Comentarios/notas sensibles | Pedir sólo lo necesario; limitar accesos y revisar su eliminación antes que los registros comerciales cuando sea compatible/legal |
| Recibos S2B-3 | Revisión mensual; no purgar hasta tener expiración/rechazo seguro de replays tardíos |
| api_rate_limits | Mantener ventanas activas; expires_at = fin de ventana + 1 h. Cleanup probabilístico existente, no garantía de plazo máximo sin tráfico |
| Backups g1b2 | Ya terminó su fin temporal; recomendar eliminar tras verificaciones de la sección siguiente, sin crear otra copia innecesaria |
| Emails internos/Resend | Revisar a los 90 días tras resolución; eliminar/copiar menos según obligaciones y casos abiertos; incluir enviados, papelera, reenvíos/exports y retención de Resend |
| Logs técnicos | Objetivo a evaluar: 30 días si el plan/config y necesidades de seguridad lo permiten; verificar duración real y evitar exports permanentes |
| Backups/PITR de Supabase | Inventariar retención/accesos reales; un borrado de tabla no borra inmediatamente snapshots. Respetar ventanas del proveedor y obligaciones legales |

Los 30/90 días son objetivos de revisión propuestos, no tareas automáticas, plazos legales
ni garantías de eliminación. No afirmar cumplimiento legal a partir de esta tabla.
Foreign keys incluyen CASCADE y RESTRICT; borrar un pedido/selección puede afectar inquiries,
propuestas/cotizaciones o chocar con bookings. No proponer purga comercial masiva aquí.

## SQL recomendado para revisión humana — NO ejecutado

Estos bloques son instrucciones separadas, no migration ni paso necesario para desplegar
el pequeño cambio de código. Revisarlos en el contexto real antes de autorizar ejecución.
No exponen filas de contactos/notas. No asumir permisos por leer este documento.

### 1. Verificación de backups y tabla técnica (sólo lectura)

```sql
with names(table_name) as (
  values ('g1b2_backup_providers'), ('g1b2_backup_plan_selections'),
         ('listo_recovery_operations'), ('api_rate_limits')
)
select names.table_name, c.oid is not null as existe, c.relrowsecurity as rls,
       case when c.oid is not null then has_table_privilege('anon', c.oid,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') end as anon_tiene_algun_permiso,
       case when c.oid is not null then has_table_privilege('authenticated', c.oid,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') end as auth_tiene_algun_permiso
from names left join pg_class c on c.oid = to_regclass('public.' || names.table_name);

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname='public' and tablename in
  ('g1b2_backup_providers','g1b2_backup_plan_selections','listo_recovery_operations','api_rate_limits');
```

Para tablas existentes se espera RLS=true y ningún permiso anon/authenticated; revisar
policies, roles privilegiados/grants heredados, vistas y accesos indirectos. RLS no bloquea
al owner/service_role con bypass. Si se detecta exposición, resolver con revisión separada.
Verificar también anon/auth sin EXECUTE de listo_recover_commercial/listo_save_inquiry,
y service_role con EXECUTE, con consultas ya versionadas en S2B3.md.

Los backups fueron propuestos en G1B-2 con RLS y revokes, pero no existe creación de esos
backups en las migrations del repo. NO VERIFICADO aquí: existencia actual, permisos efectivos,
contenido real y ausencia de otras copias. Según el SQL histórico comunicado por el usuario,
backup_providers incluye campos viejos Google (nombre/dirección/rating/web/Maps/coordenadas,
etc.), place_id y backed_up_at; backup_plan_selections conserva id/provider_name/backed_up_at.
No presuponer que están vacíos por haberse limpiado providers/plan_selections.

### 2. Retirar backups temporales, condicionado a revisión

Recomiendo retirarlos ahora si G fue probado y no hay rollback pendiente, en vez de dejarlos
indefinidamente. Responsable debe verificar: sin consumidor/job externo, sin dependencias,
sin datos propios de LISTO agregados después, y entender que DROP no limpia snapshots.
Revisar conteos/fechas/columnas en privado sin exportar contenido Google ni crear otro backup.
No restaurar esos datos antiguos en tablas activas para deshacer una limpieza ya aprobada.

```sql
-- Sólo después de verificación y autorización específicas. NO CASCADE.
begin;
drop table public.g1b2_backup_plan_selections;
drop table public.g1b2_backup_providers;
commit;
```

DROP sin CASCADE falla ante dependencias y la transacción evita retirada parcial. No es
una verificación completa de jobs/SQL dinámico externos. Si falta una tabla o hay dependencia,
ROLLBACK y revisar; no sustituir por CASCADE ni continuar a ciegas.

### 3. Contadores vencidos (opcional, no recibos)

El cleanup existente borra hasta 500 vencidos en ~2% de llamadas. Si hay atraso/sin tráfico,
un operador puede revisar `count(*) where expires_at < now()` y programar una tarea aparte.
No se agrega cron/endpoint. Este lote propuesto toca sólo ventanas vencidas:

```sql
with batch as (
  select scope, key_hash, window_start from public.api_rate_limits
  where expires_at < now() order by expires_at limit 500 for update skip locked
), removed as (
  delete from public.api_rate_limits r using batch b
  where r.scope=b.scope and r.key_hash=b.key_hash and r.window_start=b.window_start
    and r.expires_at < now()
  returning 1
)
select count(*) as borrados from removed;
```

No ejecutar DELETE de listo_recovery_operations, pedidos, selecciones, inquiries, propuestas,
cotizaciones o bookings como parte de S2E. Para recibos, sólo inventariar count/edad por kind
sin payloads/resultados. Cualquier borrado posterior debe contemplar idempotencia y vínculos.

## Qué debe revisar un humano y qué queda para legal

Antes de beta: registrar responsable, finalidades y acceso mínimo; verificar RLS/grants/RPC
reales y backups; acordar objetivos de revisión; revisar logs históricos Vercel y copias;
MFA/accessos en Resend/buzón/Supabase/Vercel; cuotas/retención externa Google Cloud y demás
proveedores; preparar atención de solicitudes de acceso/corrección/supresión con identidad
verificada y tratamiento de backups. No permitir un borrado anónimo sólo por conocer UUID.
Si resta alguna verificación externa, S2E técnico no equivale a privacidad completa para beta.

Legal: política pública propia (terminos.html hoy avisa que sigue pendiente), identidad y
contacto del responsable, bases/finalidades, datos de salud/religión, consentimiento o base
aplicable, transferencias/proveedores/subencargados, plazos, derechos, menores y obligaciones
fiscales/comerciales. Confirmar requisitos aplicables en Argentina y otras jurisdicciones
si se amplía la beta. Revisar que descripción pública refleje la coordinación y confirmación
manual real. Este documento no sustituye esa revisión ni garantiza cumplimiento de Google.

## Validación y smoke recomendado

Ejecutar npm run check y npm test; sin SQL ni servicios reales. Tests nuevos del contador
local + regresiones S2B/S2C/S2D/G. Antes de publicar: en Preview abrir propuesta varias veces,
respuesta repetida sin segundo email; búsqueda/fotos/admin y Quiero avanzar con recovery.
Inspeccionar storage de un plan de prueba sin datos reales: no opciones/tokens/formulario
inquiry literal; sí text/dietary propios, IDs y huellas. No compartir screenshots con PII.
Verificaciones externas anteriores son checklist separado, no pruebas ya realizadas.

Sin migration, endpoints, dependencias, SQL ejecutado, merge ni deploy en esta tarea.
