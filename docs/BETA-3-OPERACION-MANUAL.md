# BETA-3 — operación manual interna

Base: `1e30028b2035e60dd9a949d56cf249f76f6b76a7`.

Esta guía organiza la atención de la beta cerrada. Es interna: no promete públicamente tiempos,
disponibilidad, precio, capacidad ni aptitud alimentaria. LISTO coordina; no reserva, cobra ni
confirma condiciones automáticamente.

## Regla de operación

Cada turno debe tener un **operador de guardia** y un **suplente** identificados en el calendario
interno. El operador de guardia toma cada solicitud nueva, mantiene un único próximo paso y hace
el traspaso al terminar su turno. El suplente interviene si el operador no está disponible o si
un plazo interno está por vencer.

El Admin es la fuente de verdad para el estado comercial, cotizaciones, propuestas y reservas
que nacen en el flujo web. Mientras no exista asignación y seguimiento dentro del producto,
usar un registro operativo interno controlado con sólo estos campos:

- `inquiry_id` si existe, o ID operativo propio;
- iniciales del responsable;
- etiqueta operativa;
- fecha y hora del próximo paso;
- fecha y hora de la última acción;
- motivo de cierre, si corresponde.

No copiar allí nombres, teléfonos, emails, prompt, comentarios, restricciones ni detalles de
salud. Los datos de solicitudes web se consultan en el Admin. Debe haber una sola fila por caso
y un solo responsable activo.

Antes de abrir la beta, el responsable de operación debe designar **un único espacio controlado**
para este registro, documentar su ubicación en el runbook privado y otorgar acceso sólo al
operador de guardia, su suplente y el responsable de datos/operación. No usar archivos personales,
planillas públicas ni copias locales sin control. También debe definir quién administra y revoca
los accesos. Registrar el nombre y la ubicación exacta de ese espacio en el runbook privado es
condición previa para abrir la beta; esta guía no inventa una herramienta que todavía no fue
designada.

El único canal autorizado para conversar con usuarios es el WhatsApp oficial de LISTO
**+54 11 5806 5840**. No usar teléfonos personales. Antes de cada turno debe estar definido quién
tiene acceso al canal y quién recibe el traspaso.

## Qué permite hoy el Admin

La revisión de `admin/index.html`, `api/admin-inquiries.js` y los helpers comerciales confirma
que el panel ya permite:

- ver hasta las 500 solicitudes más recientes y filtrar por estado;
- buscar por nombre, email o teléfono;
- revisar pedido original, fecha, zona, cantidad, presupuesto, necesidades y restricciones;
- abrir WhatsApp del usuario;
- pedir en el momento los datos actuales del lugar y abrirlo en Google Maps;
- preparar y copiar un mensaje para el proveedor; LISTO no lo envía automáticamente;
- registrar contacto al proveedor y su canal;
- guardar cotizaciones y notas internas asociadas a cada cotización;
- generar propuestas y ver si fueron abiertas, aceptadas o rechazadas;
- registrar una aceptación manual o por propuesta y confirmar una reserva;
- registrar cancelación, finalización y estado de comisión;
- ver un historial técnico del pedido.

No existe hoy un campo general para responsable, contacto al usuario, próximo seguimiento,
etiqueta operativa o motivo de cierre. `plan_inquiries.notes` es el comentario del usuario y no
debe reutilizarse. Las notas de cotización o reserva deben contener sólo contexto de esa
operación. No se agrega UI ni persistencia en BETA-3.

## Entradas por WhatsApp sin solicitud en Admin

Hay dos salidas manuales que pueden abrir directamente el WhatsApp oficial con un mensaje
genérico:

- **Pedile a LISTO que lo busque**, ante requisitos especiales;
- **Coordinar con LISTO**, cuando hay pocas opciones.

Abrir o enviar esos mensajes no crea necesariamente una solicitud web. El caso puede no tener
`inquiry_id`, no aparecer como **Nueva** en Admin y no contar con cotización, propuesta, booking
ni historial técnico. No esperar a que aparezca en el panel.

Al recibirlo:

1. Crear un ID operativo diario correlativo, por ejemplo `WA-AAAAMMDD-01`.
2. Registrar sólo ID, responsable, fecha/hora, canal, tipo de caso (`requisito_especial` o
   `pocas_opciones`), próximo paso, vencimiento interno y estado operativo.
3. No copiar nombre completo, teléfono completo, diagnóstico, texto completo del chat ni detalles
   sensibles en el registro auxiliar.
4. Asignar responsable y suplente de inmediato. Estos casos entran en el mismo SLA interno y en
   el traspaso de turno; por su posible sensibilidad nunca deben quedar sin responsable.

Pedir sólo lo mínimo que cambie la coordinación: fecha, zona, cantidad, presupuesto y la
restricción concreta únicamente si hace falta. No pedir diagnósticos ni documentación médica.
Usar la plantilla **Restricción sensible** y permitir que el usuario decida qué información
imprescindible compartir.

Si el caso continúa por WhatsApp, toda la coordinación es manual y queda fuera de los flujos de
cotización, propuesta y reserva del Admin. No confirmar disponibilidad, precio, capacidad ni
condiciones sin respuesta escrita del proveedor. Si el equipo decide llevarlo al flujo web,
pedir al usuario que cargue un pedido nuevo desde LISTO. No inventar una solicitud en Admin ni
escribir directamente en Supabase; una conversión asistida queda como mejora futura.

No pedir al usuario que quite la restricción para entrar al flujo web. Si el caso se convierte o
se vincula con un pedido web, el responsable mantiene la restricción en el caso `WA-...` y la
incluye en la consulta al proveedor. Hasta que exista una conversión técnica segura, los casos
con restricción fuerte se coordinan sólo por WhatsApp.

## Pedidos sobre datos personales

El mensaje genérico de **Consultar por mis datos** sólo puede ser atendido por el responsable
designado de datos/operación. El operador de guardia debe acusar recibo y escalar; no resolver,
exportar ni borrar por su cuenta.

Procedimiento:

1. Crear un ID correlativo, por ejemplo `DATA-AAAAMMDD-01`.
2. Registrar sólo ID operativo, tipo (`acceso`, `correccion` o `eliminacion`), canal, fecha,
   responsable, estado y próximo paso. No copiar el mensaje completo ni PII o datos sensibles al
   registro auxiliar.
3. Pedir por el canal directo el mínimo necesario para localizar el pedido: teléfono usado,
   email usado, fecha aproximada o código si existe. No pedir restricciones ni otros datos que
   no sean necesarios para identificarlo.
4. Escalar la identificación y el pedido al responsable designado, que define la verificación y
   la respuesta técnica/legal.
5. Acusar recibo dentro de 1 día hábil. Resolver o informar estado dentro de 5 días hábiles,
   salvo que una revisión legal o técnica requiera más tiempo. Son objetivos internos, no una
   promesa ni sustituyen plazos legales aplicables.

Acuse sugerido:

> Recibimos tu consulta sobre datos personales y la derivamos a la persona responsable. Vamos a
> responderte o informarte el estado dentro de nuestro plazo interno. Para proteger tus datos,
> puede que necesitemos verificar información mínima del pedido.

El operador no debe borrar ni editar filas, tocar Supabase manualmente, prometer eliminación
inmediata, enviar capturas del Admin con PII ni compartir resultados antes de que la identidad y
el alcance hayan sido revisados por el responsable.

## Flujo de atención en Admin

### 1. Entrada y asignación

1. Al comenzar el turno, abrir Admin y filtrar **Nueva**.
2. Tomar la solicitud más antigua sin responsable.
3. Copiar sólo su `inquiry_id` al registro operativo, asignar responsable y próximo paso.
4. Comprobar si existe otra solicitud abierta que parezca el mismo pedido antes de contactar.
   No borrar ni fusionar datos manualmente; operar la más reciente y anotar los otros IDs como
   posible duplicado, sin copiar PII.
5. Si el aviso inicial por email figura como fallido, no asumir que el pedido falló: la solicitud
   puede estar guardada y debe atenderse igual.

### 2. Revisión

Confirmar que están claros fecha, horario aproximado, zona, cantidad, presupuesto, estilo,
necesidades y restricciones. Distinguir:

- **información suficiente:** se puede contactar al usuario o al proveedor;
- **requiere información:** falta un dato que cambia la consulta;
- **restricción sensible:** alergia, celiaquía, kosher, halal u otra condición obligatoria;
- **posible no viable:** fecha vencida/inmediata, presupuesto incompatible o pedido fuera del
  alcance. No declararlo imposible sin una revisión humana.

### 3. Primer contacto al usuario

Contactar desde el canal operativo autorizado. Confirmar que se habla con la persona correcta
antes de repetir datos del pedido. Pedir sólo la información faltante, no todo el formulario de
nuevo. Registrar `contactado_usuario` y el próximo paso en el registro operativo; hoy este hecho
no tiene campo propio en Admin.

Usar exclusivamente el WhatsApp oficial de LISTO. No trasladar la conversación a un número
personal aunque el usuario o proveedor lo proponga.

### 4. Contacto al proveedor

Revisar y editar siempre el mensaje preparado por Admin antes de enviarlo. No enviar nombre,
teléfono, email, comentario libre ni otros datos personales del usuario. Para restricciones,
compartir sólo el dato mínimo necesario para que el proveedor explique condiciones y medidas;
nunca presentar a LISTO como certificador.

Después del envío real, usar **Marcar como contactado** y elegir el canal correcto. No marcarlo
antes. La solicitud pasa de `inquiry_requested` a `provider_contacted` si todavía estaba nueva.

Si el proveedor pregunta por comisión, exclusividad, alta, pagos o condiciones comerciales de
LISTO, no negociar ni improvisar una respuesta. Escalar al responsable comercial y mantener la
consulta del usuario separada de esa conversación.

### 5. Espera y cotización

Guardar la respuesta verificable del proveedor en la cotización: moneda, precio, qué incluye,
qué no incluye, seña, vigencia, disponibilidad y condiciones. Usar notas internas sólo para
contexto operativo de esa cotización, sin datos sensibles innecesarios.

Guardar una cotización pasa normalmente la solicitud a `quoted`. Si el proveedor no confirma
disponibilidad, no redactar la propuesta como confirmada.

### 6. Propuesta al usuario

Generar la propuesta desde la cotización vigente. Revisar que precio, moneda, condiciones,
vigencia y lugar coincidan con la respuesta recibida. Una propuesta `proposal_sent` significa
**enviada**, no reservada.

La respuesta pública puede quedar como:

- `proposal_accepted`: el usuario aceptó avanzar; todavía falta confirmación del lugar;
- `proposal_declined`: pidió otra opción;
- `proposal_replaced`: una propuesta posterior reemplazó el link anterior.

Una aceptación no habilita a prometer reserva. Si pide alternativa, conservar la respuesta,
buscar otra cotización y generar una propuesta nueva desde el Admin.

### 7. Confirmación

Confirmar una reserva sólo cuando el proveedor haya confirmado explícitamente disponibilidad,
precio final y condiciones, y el usuario haya aceptado por el link o por un canal registrado.
Usar **Confirmar reserva**: eso crea el registro comercial y lleva la solicitud a `confirmed`.
No cambiarla manualmente a Confirmado sin reserva; el Admin lo impide en el flujo normal.

### 8. Seguimiento y cierre

- `completed`: el servicio ocurrió o el equipo verificó que el caso terminó correctamente.
- `cancelled`: el usuario canceló o el caso no fue viable. Registrar el motivo en el registro
  operativo hasta contar con motivos de cierre estructurados.
- Si el usuario no responde, marcar primero `perdido_sin_respuesta` sólo en el registro operativo
  y mantener el estado técnico vigente hasta la fecha del plan. Así puede retomarse sin intentar
  reabrir un estado terminal. En la fecha del plan o después, cerrar técnicamente como
  `cancelled` si siguió sin respuesta.
- Si hay una reserva confirmada, cancelar desde el flujo de reserva/solicitud y respetar las
  protecciones de comisión. Nunca corregir estados directamente en Supabase.
- `completed` y `cancelled` son terminales y no se reabren.

Si el usuario vuelve después de un cierre técnico, no reabrir ni alterar la fila: pedir un pedido
nuevo desde la web y vincular ambos IDs sólo en el registro auxiliar, sin copiar PII.

Al cerrar, eliminar recordatorios operativos que ya no correspondan, pero conservar el ID y el
motivo mínimo según la política interna vigente.

## Estados técnicos y etiquetas operativas

No crear ni escribir estados nuevos. Para la beta, usar esta correspondencia:

| Necesidad operativa | Estado técnico / señal actual | Registro operativo |
|---|---|---|
| nuevo | `inquiry_requested` | `nuevo` |
| usuario contactado | no existe como evento técnico | `contactado_usuario` |
| falta información | mantener estado técnico vigente | `requiere_info` |
| proveedor contactado / esperando respuesta | `provider_contacted` | `esperando_proveedor` |
| cotización recibida | `quoted` + cotización | `cotizado` |
| propuesta enviada / esperando usuario | `quoted` + `proposal_sent` | `esperando_usuario` |
| usuario pidió alternativa | `proposal_declined` | `requiere_alternativa` |
| usuario aceptó | `proposal_accepted`, todavía no `confirmed` | `aceptado_pendiente_proveedor` |
| reserva confirmada manualmente | `confirmed` + booking activo | `confirmado_manual` |
| servicio finalizado | `completed` | `completado` |
| usuario canceló | `cancelled` | `cancelado_usuario` |
| usuario no respondió antes de la fecha | mantener estado técnico vigente | `perdido_sin_respuesta` |
| usuario no volvió y pasó la fecha | `cancelled` | `perdido_sin_respuesta` |
| pedido no viable | `cancelled` | `no_viable` |

Los estados actuales alcanzan para una beta cerrada, pero agrupan motivos distintos dentro de
`cancelled` y no registran contacto al usuario ni próximos pasos. Las etiquetas operativas son
temporales; no deben enviarse como `status` a ninguna API.

Transiciones comerciales vigentes:

- `inquiry_requested` → `provider_contacted`, `quoted`, `confirmed` mediante reserva, o
  `cancelled`;
- `provider_contacted` → `quoted`, `confirmed` mediante reserva, o `cancelled`;
- `quoted` → `confirmed` mediante reserva, o `cancelled`;
- `confirmed` → `completed` o `cancelled`;
- `completed` y `cancelled` no vuelven atrás.

## Tiempos internos sugeridos

Estos tiempos son objetivos internos, no promesas públicas. Antes de abrir la beta, el equipo
debe definir por escrito días y horario de cobertura.

- Primer contacto: dentro de 2 horas hábiles desde el ingreso.
- Fuera de cobertura: próximo turno hábil.
- Usuario sin respuesta: primer seguimiento a las 24 horas.
- Cierre operativo sin respuesta: a las 72 horas; puede adelantarse a 48 horas si la fecha del
  plan es próxima. Usar `perdido_sin_respuesta`, pero no pasar a `cancelled` antes de la fecha del
  plan salvo cancelación explícita u otra razón irreversible documentada.
- Si el pedido no tiene fecha del plan, usar un plazo operativo fijo de 30 días para
  seguimiento/cierre, documentado en el registro auxiliar.
- Proveedor sin respuesta: seguimiento a las 4–6 horas hábiles; si ya terminó el turno, al día
  hábil siguiente.
- Propuesta enviada: seguimiento a las 24 horas o antes si vence la cotización.
- Cambio urgente de precio/disponibilidad: avisar al usuario antes de cualquier aceptación y
  reemplazar la propuesta; no editar el significado de una propuesta ya aceptada.

Cada solicitud abierta debe terminar el turno con responsable, etiqueta y próximo paso. El
suplente revisa los vencidos al inicio y al cierre de cada turno.

## Plantillas para el usuario

Reemplazar sólo los campos entre corchetes. No copiar el prompt completo por defecto.

### Primer contacto

> Hola, soy [nombre] de LISTO. Vimos tu pedido para [tipo de plan]. Te ayudamos a coordinarlo.
> Antes de consultar, ¿te puedo confirmar unas preguntas rápidas?

### Falta información

> Para consultar bien nos falta confirmar [dato imprescindible: zona / fecha / cantidad /
> presupuesto / estilo]. ¿Qué opción preferís?

Preguntar únicamente los datos que realmente falten.

### Restricción sensible

> Este pedido incluye un requisito que coordinamos manualmente. Podemos consultar las
> condiciones al lugar, pero la preparación y las medidas necesarias deben ser confirmadas
> directamente por el proveedor. Para minimizar datos, ¿qué información imprescindible querés
> que consultemos?

No pedir diagnósticos, documentación médica ni detalles que no cambien la consulta.

### Propuesta lista

> Ya tenemos una propuesta para tu plan: [link]. Revisá lugar, precio y condiciones. La
> disponibilidad y el precio final se confirman con el lugar antes de reservar; abrir o aceptar
> la propuesta no genera un pago automático.

### Seguimiento

> ¿Querés que avancemos con esta opción o preferís que busquemos otra? Si cambió algún dato del
> plan, decime cuál antes de volver a consultar.

### Cierre sin respuesta

> Como no recibimos respuesta, vamos a cerrar este pedido por ahora. Si querés retomarlo más
> adelante, escribinos y revisamos nuevamente disponibilidad y condiciones.

### No viable

> Revisamos el pedido y por ahora no encontramos una opción que podamos presentar de forma
> responsable con esas condiciones. Si querés, podemos revisar [cambio concreto posible] sin
> prometer disponibilidad.

## Plantillas para el proveedor

### Consulta inicial

> Hola, te escribimos de LISTO. Tenemos una consulta para [tipo de plan], el [fecha] a las
> [hora], para [cantidad] personas. ¿Tienen disponibilidad? ¿Podrían indicarnos propuesta y
> precio aproximado para el grupo?

No incluir datos de contacto del usuario.

### Consulta por restricción

> Una persona del grupo indicó [restricción mínima necesaria]. ¿Pueden confirmar por escrito si
> pueden contemplarla, bajo qué condiciones y qué medidas aplican? No necesitamos datos
> personales del usuario.

Para alergias o celiaquía, preguntar también por preparación y contaminación cruzada. Una
respuesta comercial no equivale por sí sola a certificación.

### Pedido de cotización

> ¿Nos confirman, por favor: precio total y moneda; qué incluye y qué no; disponibilidad para
> fecha/horario/cantidad; seña; vigencia de la cotización; política de cambios o cancelación;
> menú o servicio ofrecido; y cualquier límite de capacidad u horario?

### Confirmación final

> Queremos confirmar el pedido coordinado por LISTO para [fecha], [hora], [cantidad]
> y [servicio acordado]. ¿Confirman disponibilidad, importe final, seña, condiciones de
> cancelación y próximos pasos?

Compartir nombre o teléfono del usuario sólo si el proveedor lo necesita para ejecutar una
reserva ya aceptada y el usuario fue informado. Nunca enviar comentarios libres o restricciones
no necesarias.

## Checklist por solicitud

- [ ] Asignar responsable y próximo paso.
- [ ] Revisar fecha, horario, zona, cantidad, presupuesto y necesidades.
- [ ] Identificar restricciones y si alguna es sensible/obligatoria.
- [ ] Revisar opción elegida y datos actuales del lugar.
- [ ] Verificar posibles duplicados sin borrar ni fusionar filas.
- [ ] Contactar al usuario y pedir sólo faltantes.
- [ ] Revisar/editar el mensaje antes de contactar al proveedor.
- [ ] Registrar el contacto al proveedor sólo después de enviarlo.
- [ ] Guardar respuesta y cotización con fecha, moneda y condiciones.
- [ ] Verificar vigencia antes de generar la propuesta.
- [ ] Enviar propuesta y fijar seguimiento.
- [ ] Distinguir aceptación del usuario de confirmación del proveedor.
- [ ] Confirmar reserva únicamente con evidencia de ambas partes.
- [ ] Actualizar estado técnico y etiqueta operativa.
- [ ] Cerrar con motivo mínimo y retirar recordatorios vencidos.

## Riesgos y respuesta

| Riesgo | Respuesta operativa |
|---|---|
| proveedor no responde | follow-up; consultar alternativa sólo con el usuario informado; no inventar disponibilidad |
| usuario no responde | follow-up a 24 h y cierre interno a 48/72 h según urgencia |
| cambia el precio | avisar antes de aceptar; guardar nueva cotización y reemplazar propuesta |
| cambia la disponibilidad | detener confirmación, avisar y ofrecer revisión; no reutilizar una aceptación como reserva |
| restricción no confirmada | no avanzar como segura; pedir respuesta explícita y derivar la decisión al usuario/proveedor |
| foto o lugar no coincide | verificar Maps/datos actuales; no usar la foto como prueba del servicio |
| pedido imposible | explicar el límite honestamente y registrar `no_viable` fuera del estado técnico |
| posible duplicado | comparar IDs y contexto; operar uno, no enviar mensajes repetidos ni borrar filas |
| promesa por WhatsApp | corregir por escrito de inmediato y registrar condiciones verificables en cotización/propuesta |
| datos sensibles en chats | minimizar, no reenviar identidad, limitar acceso y seguir la política de conservación |
| entrada sólo por WhatsApp | crear ID `WA-...`, asignar responsable y no esperar que aparezca en Admin |
| pedido sobre datos personales | crear ID `DATA-...`, acusar recibo y escalar al responsable designado |
| proveedor plantea comisión | separar la consulta del usuario y escalar; el operador no negocia |
| pestaña vieja/conflicto | recargar Admin; no repetir a ciegas ni editar Supabase |
| email o servicio externo falla | comprobar el estado guardado antes de reintentar para evitar avisos duplicados |

## Qué no hacer en beta

- No prometer reserva sin confirmación explícita del proveedor.
- No prometer precio final, disponibilidad, horario o capacidad sin evidencia vigente.
- No afirmar que una opción es segura, apta, certificada o verificada para una restricción si no
  existe evidencia permitida y revisión correspondiente.
- No aceptar pagos, señas o transferencias por fuera de una decisión formal del producto.
- No pedir diagnósticos ni datos sensibles innecesarios.
- No enviar al proveedor más datos personales que los necesarios para ejecutar una reserva.
- No copiar PII ni restricciones al registro operativo auxiliar.
- No usar teléfonos personales para hablar con usuarios o proveedores.
- No borrar datos, exportarlos o enviar capturas del Admin ante un pedido de privacidad.
- No negociar comisiones ni condiciones comerciales con proveedores.
- No cerrar acuerdos comerciales ambiguos en nombre de LISTO.
- No usar “garantizado”, “seguro”, “apto”, “el mejor” o equivalentes sin respaldo permitido.
- No cambiar estados ni corregir filas directamente en Supabase.
- No marcar `confirmed` sólo porque el usuario aceptó una propuesta.

## Rutina del equipo

Al abrir el turno:

1. revisar **Nueva**, el WhatsApp oficial y casos con próximo paso vencido;
2. asignar todo lo no asignado, incluidos `WA-...` y `DATA-...`;
3. priorizar por fecha del plan y antigüedad, no por tamaño económico;
4. comprobar propuestas aceptadas todavía sin reserva confirmada.

Al cerrar el turno:

1. ninguna solicitud o conversación abierta debe quedar sin responsable ni próximo paso;
2. verificar que cada contacto real tenga su señal técnica correspondiente cuando exista;
3. entregar al suplente los casos urgentes sólo por `inquiry_id` o ID operativo;
4. cerrar accesos y no dejar exportaciones o chats abiertos en equipos compartidos.

Una vez por semana: revisar solicitudes abiertas antiguas, motivos de cancelación, duplicados,
fallos de aviso y casos sensibles para mejorar el proceso sin copiar PII a reportes.

## Mejoras técnicas futuras

No son parte de BETA-3. Antes de ampliar volumen conviene evaluar, con diseño y migration propios:

- responsable y traspaso por solicitud;
- fecha de último contacto al usuario y próximo seguimiento;
- etiqueta operativa y motivo de cierre estructurados;
- notas internas generales separadas del comentario del usuario;
- recordatorios y vista de vencidos;
- paginación cuando acercarse al límite actual de 500 filas;
- auditoría por operador y roles individuales en lugar de una única sesión compartida;
- revisión específica del mensaje preparado para proveedor en casos sensibles;
- conversión asistida y trazable de conversaciones WhatsApp al flujo web/Admin;
- procedimiento técnico/legal aprobado para acceso, corrección y eliminación de datos;
- términos para proveedores y acuerdo comercial sobre comisión, pagos y responsabilidades;
- retención y eliminación operativa de registros auxiliares y chats.

Hasta entonces, la guía y el registro mínimo cubren la coordinación de una beta cerrada, pero no
son adecuados para escalar sin responsables, trazabilidad y controles de acceso adicionales.

## Alcance técnico de BETA-3

Sólo documentación. Sin cambios en UI, Admin, APIs, estados, matching, ranking, cantidad,
Google request, persistencia, Supabase, emails, WhatsApp, pagos o proveedores. Sin SQL,
migration, dependencia ni endpoint nuevo.
