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

El Admin es la fuente de verdad para el estado comercial, cotizaciones, propuestas y reservas.
Mientras no exista asignación y seguimiento dentro del producto, usar un registro operativo
interno controlado con sólo estos campos:

- `inquiry_id`;
- iniciales del responsable;
- etiqueta operativa;
- fecha y hora del próximo paso;
- fecha y hora de la última acción;
- motivo de cierre, si corresponde.

No copiar allí nombres, teléfonos, emails, prompt, comentarios, restricciones ni detalles de
salud. Esos datos se consultan en el Admin. Debe haber una sola fila por `inquiry_id` y un solo
responsable activo.

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

## Flujo de atención

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

### 4. Contacto al proveedor

Revisar y editar siempre el mensaje preparado por Admin antes de enviarlo. No enviar nombre,
teléfono, email, comentario libre ni otros datos personales del usuario. Para restricciones,
compartir sólo el dato mínimo necesario para que el proveedor explique condiciones y medidas;
nunca presentar a LISTO como certificador.

Después del envío real, usar **Marcar como contactado** y elegir el canal correcto. No marcarlo
antes. La solicitud pasa de `inquiry_requested` a `provider_contacted` si todavía estaba nueva.

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
- `cancelled`: el usuario canceló, el caso se perdió o no fue viable. Registrar el motivo en el
  registro operativo hasta contar con motivos de cierre estructurados.
- Si hay una reserva confirmada, cancelar desde el flujo de reserva/solicitud y respetar las
  protecciones de comisión. Nunca corregir estados directamente en Supabase.
- `completed` y `cancelled` son terminales y no se reabren.

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
| usuario no respondió | `cancelled` | `perdido_sin_respuesta` |
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
- Cierre sin respuesta: a las 72 horas; puede adelantarse a 48 horas si la fecha del plan es
  próxima, dejando constancia del motivo.
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
- No cerrar acuerdos comerciales ambiguos en nombre de LISTO.
- No usar “garantizado”, “seguro”, “apto”, “el mejor” o equivalentes sin respaldo permitido.
- No cambiar estados ni corregir filas directamente en Supabase.
- No marcar `confirmed` sólo porque el usuario aceptó una propuesta.

## Rutina del equipo

Al abrir el turno:

1. revisar **Nueva** y solicitudes con próximo paso vencido;
2. asignar todo lo no asignado;
3. priorizar por fecha del plan y antigüedad, no por tamaño económico;
4. comprobar propuestas aceptadas todavía sin reserva confirmada.

Al cerrar el turno:

1. ninguna solicitud abierta debe quedar sin responsable ni próximo paso;
2. verificar que cada contacto real tenga su señal técnica correspondiente cuando exista;
3. entregar al suplente los casos urgentes sólo por `inquiry_id`;
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
- retención y eliminación operativa de registros auxiliares y chats.

Hasta entonces, la guía y el registro mínimo cubren la coordinación de una beta cerrada, pero no
son adecuados para escalar sin responsables, trazabilidad y controles de acceso adicionales.

## Alcance técnico de BETA-3

Sólo documentación. Sin cambios en UI, Admin, APIs, estados, matching, ranking, cantidad,
Google request, persistencia, Supabase, emails, WhatsApp, pagos o proveedores. Sin SQL,
migration, dependencia ni endpoint nuevo.
