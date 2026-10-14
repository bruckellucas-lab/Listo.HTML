# BETA-4 — ensayo operativo pre-beta

Base: `d4f85277a69cd45df06195369d740363c0d298e4`.

Estado inicial: **PENDIENTE DE EJECUCIÓN MANUAL AUTORIZADA**.

Este documento prepara el ensayo. No declara BETA-4 aprobada. Los pasos prácticos de
“Quiero avanzar”, cambios de estado, cotizaciones y propuestas escriben datos y pueden disparar
servicios externos. Como esta tarea prohíbe tocar Supabase, emails y WhatsApp, esos pasos no se
ejecutan desde este cambio documental.

El equipo puede hacer primero el ensayo de mesa sin escrituras. Para aprobar BETA-4 debe completar
después el recorrido práctico en un entorno autorizado para datos sintéticos, sin SQL ni edición
manual de Supabase, y llenar el acta al final de este documento.

## Objetivo

Validar que el equipo puede manejar tres casos simulados de punta a punta usando la guía
[BETA-3](./BETA-3-OPERACION-MANUAL.md):

1. un pedido normal desde búsqueda hasta coordinación;
2. un caso sensible que entra sólo por WhatsApp y no por Admin;
3. un usuario que no responde.

El ensayo debe demostrar que:

- el flujo normal llega a Admin y conserva un próximo paso;
- el caso sensible se registra fuera de Admin sin PII innecesaria;
- la falta de respuesta no provoca un cierre técnico prematuro;
- cada caso tiene responsable, suplente, vencimiento y traspaso;
- nadie promete reserva, precio final, disponibilidad, capacidad o aptitud dietaria;
- el equipo distingue estado técnico de etiqueta operativa;
- los pedidos sobre datos personales se escalan al responsable designado;
- no se necesita SQL, editar Supabase ni inventar funcionalidad para operar.

## Modalidades y límite de este documento

### Ensayo de mesa

Se puede ejecutar sin tocar sistemas externos. Dos integrantes representan usuario, operador y
proveedor; leen pantallas ya conocidas y recorren decisiones, mensajes, estados esperados y
traspaso. Sirve para encontrar dudas de proceso, pero **no alcanza para aprobar BETA-4**.

### Ensayo práctico

Es obligatorio para aprobar. Antes de empezarlo, el responsable debe autorizar por escrito:

- entorno y URL exactos;
- uso de datos sintéticos;
- cuentas, teléfono y email de prueba controlados por el equipo;
- presupuesto externo permitido para Google, Resend y Vercel;
- tratamiento posterior de los registros sintéticos sin borrado manual ni SQL;
- quién puede entrar al Admin y al WhatsApp oficial.

Si Preview usa la misma base que Production, no asumir que es un entorno aislado. Si no existe un
entorno autorizado o un procedimiento para los registros sintéticos, ejecutar sólo el ensayo de
mesa y mantener la decisión final en **BLOQUEAR / PENDIENTE**.

No contactar lugares reales durante el ensayo: una persona del equipo representa al proveedor.
No usar nombres, teléfonos, emails, alergias o diagnósticos de personas reales.

## Referencias obligatorias

- [BETA-1 — privacidad de WhatsApp sensible](./BETA-1-WHATSAPP-PRIVACY.md)
- [BETA-2 — legal y privacidad](./BETA-2-LEGAL-PRIVACY.md)
- [BETA-3 — operación manual](./BETA-3-OPERACION-MANUAL.md)

Ante una contradicción, detener el ensayo y registrarla como bloqueo. No resolverla modificando
datos o improvisando una regla durante la prueba.

## Ficha previa y roles

Completar antes de empezar. No inventar nombres en este documento versionado; usar el runbook
privado para datos reales del equipo.

| Campo | Completar |
|---|---|
| Fecha y hora de inicio | `[AAAA-MM-DD HH:mm ART]` |
| Entorno y URL autorizados | `[completar]` |
| Responsable de guardia | `[iniciales]` |
| Suplente | `[iniciales]` |
| Horario de cobertura | `[días y horas ART]` |
| WhatsApp oficial | `+54 11 5806 5840` |
| Responsable del WhatsApp | `[iniciales]` |
| Registro operativo: herramienta/ubicación privada | `[completar]` |
| Administrador de accesos al registro | `[iniciales]` |
| Personas autorizadas a verlo | `[iniciales/roles]` |
| Canal de escalamiento operativo | `[completar]` |
| Responsable de datos/privacidad | `[iniciales]` |
| Responsable comercial | `[iniciales]` |
| Teléfono/email sintéticos autorizados | `[referencia privada, no copiarlos aquí]` |
| Responsable de registros sintéticos posteriores | `[iniciales]` |

No comenzar si falta operador, suplente, registro, responsable de datos o canal de escalamiento.

## Reglas de evidencia

- Usar sólo `inquiry_id`, `WA-...` o `DATA-...` en el acta.
- No pegar nombres, teléfonos, emails, prompt, comentarios, restricciones o texto completo de
  chats.
- No adjuntar capturas del Admin con PII. Si una captura es imprescindible, redactarla antes y
  guardarla sólo en el espacio privado autorizado, no en Git.
- Registrar hora, acción, resultado observable y próximo paso; no copiar payloads ni logs.
- No cambiar filas directamente, no ejecutar SQL y no borrar registros para “limpiar” la prueba.
- Un fallo no se corrige durante el ensayo: se documenta, se decide si bloquea y luego se abre una
  tarea separada.

## Preflight

- [ ] Los roles y accesos de la ficha previa están completos.
- [ ] El registro operativo existe en un único espacio controlado y sin PII.
- [ ] El equipo puede abrir Home, Privacidad y Términos beta.
- [ ] Los links **Privacidad** y **Términos beta** funcionan.
- [ ] El aviso de “Quiero avanzar” sigue visible y no promete reserva ni pago.
- [ ] El responsable puede entrar al Admin sin compartir credenciales por chat.
- [ ] El WhatsApp oficial es el único canal; nadie usará teléfonos personales.
- [ ] La persona que representa al proveedor sabe que no debe contactar un lugar real.
- [ ] Los datos sintéticos están aprobados y no pertenecen a una persona real.
- [ ] Se sabe si el entorno escribe en Production; si la respuesta es incierta, no ejecutar el
      recorrido práctico.
- [ ] Todos leyeron las reglas de reserva, precio, restricciones y datos personales de BETA-3.
- [ ] Se acordó en qué momento de cada caso se hará el traspaso al suplente.

## Caso 1 — flujo normal

Pedido sintético:

> Cena para 6 en Palermo, viernes a la noche, presupuesto medio, algo lindo para cumpleaños.

No usar una fecha relativa en la ejecución: elegir una fecha futura concreta dentro del rango
permitido y registrarla sólo en el sistema autorizado.

### Guion

| Paso | Acción | Resultado esperado | Evidencia mínima |
|---|---|---|---|
| 1 | Buscar el pedido en la web | Aparecen opciones honestas; cantidad puede ser 0, 1, 2 o 3 según resultados | cantidad y hora, sin nombres de lugares |
| 2 | Revisar una opción | No afirma precio, disponibilidad, capacidad ni reserva | `OK` o descripción del claim indebido |
| 3 | Elegir una opción | La elección queda activa sin error técnico | hora y `OK` |
| 4 | Abrir “Quiero avanzar” | Se ven aviso legal y links de privacidad/términos | `OK` |
| 5 | Enviar datos sintéticos autorizados | Se muestra éxito; un reintento no duplica la solicitud | un único `inquiry_id` |
| 6 | Abrir Admin y filtrar Nueva | La solicitud aparece con datos coherentes | `inquiry_id` y estado técnico |
| 7 | Crear fila auxiliar | Tiene responsable, suplente, etiqueta, próximo paso y vencimiento | `inquiry_id`, etiqueta y hora |
| 8 | Contactar al usuario con plantilla | No se repite información innecesaria ni se promete reserva | hora y plantilla usada |
| 9 | Preparar contacto al proveedor | El mensaje no incluye contacto del usuario; se revisa antes de enviar | hora y `OK` |
| 10 | Simular respuesta escrita del proveedor | Incluye precio/moneda, condiciones, disponibilidad y vigencia ficticias | resumen no identificable |
| 11 | Registrar contacto y cotización | Estado técnico coincide con `provider_contacted`/`quoted` según el paso | estado e ID técnico |
| 12 | Generar propuesta simulada | La propuesta usa la cotización vigente y no equivale a reserva | ID/estado de propuesta |
| 13 | Simular respuesta del usuario | Queda `esperando_usuario` o aceptación pendiente de proveedor | etiqueta operativa |
| 14 | Hacer traspaso al suplente | El suplente puede explicar situación y próximo paso sólo con IDs | iniciales y hora |
| 15 | Cerrar la simulación | Si se prueba confirmación, exige respuesta escrita del proveedor y booking; si no, queda próximo paso | estado final y vencimiento |

No marcar `confirmed` sólo para completar la prueba. La variante `confirmado_manual` se ensaya
únicamente si el entorno está autorizado y se simularon aceptación del usuario y confirmación
escrita del proveedor.

### Criterios del caso 1

- [ ] No se prometió reserva.
- [ ] No se presentó precio final sin respuesta del proveedor.
- [ ] No se expuso PII al proveedor o al registro auxiliar.
- [ ] Estado técnico y etiqueta operativa no se contradicen.
- [ ] Reintentar “Quiero avanzar” no creó otra inquiry.
- [ ] Quedaron responsable y próximo paso claros.
- [ ] El traspaso funcionó sin explicar el caso por fuera del registro controlado.

Resultado del caso 1: `[OK / REPETIR / BLOQUEAR / PENDIENTE]`.

## Caso 2 — requisito sensible por WhatsApp

Pedido sintético, elegir uno:

> Cena para 4 en Belgrano, una persona celíaca.

> Cena para 4 en Belgrano, alergia a maní.

Usar una descripción ficticia y mínima. No usar la condición de una persona real.

### Guion

| Paso | Acción | Resultado esperado | Evidencia mínima |
|---|---|---|---|
| 1 | Buscar el pedido | No aparecen tarjetas automáticas | `0 opciones automáticas` |
| 2 | Revisar pantalla sensible | Explica coordinación manual sin afirmar aptitud | `OK` o claim indebido |
| 3 | Abrir WhatsApp sin enviar | El texto prearmado es el mensaje genérico de BETA-1 | texto esperado/no esperado, sin URL completa |
| 4 | Simular mensaje desde una cuenta controlada | Llega al WhatsApp oficial, no al Admin | hora y canal |
| 5 | Crear ID operativo | Formato `WA-AAAAMMDD-01`; no hay `inquiry_id` inventado | ID WA |
| 6 | Completar registro auxiliar | Sólo tipo de caso, responsable, suplente, próximo paso, vencimiento y estado | campos completos `sí/no` |
| 7 | Pedir información mínima | Sólo fecha, zona, cantidad, presupuesto y restricción si son necesarios | plantilla usada |
| 8 | Simular consulta al proveedor | No incluye identidad; pide condiciones y confirmación escrita | hora y `OK` |
| 9 | Simular respuesta insuficiente | El equipo no presenta el lugar como seguro/apto/certificado | decisión registrada |
| 10 | Simular respuesta concreta | Se comunica con cautela y se indica qué debe confirmar el proveedor | plantilla usada |
| 11 | Hacer traspaso al suplente | El caso sensible conserva responsable y próximo paso | iniciales y hora |
| 12 | Dejar estado operativo | Queda etiqueta y vencimiento; no se crea reserva/propuesta falsa en Admin | estado operativo |

No pedir al usuario que quite la restricción para entrar al flujo web. Hasta que exista una
conversión técnica segura, mantener el caso fuerte por WhatsApp. Si se vincula después con un
pedido web creado por el usuario, conservar la restricción en `WA-...` e incluirla en la consulta
al proveedor, sin copiar el detalle al registro auxiliar.

### Criterios del caso 2

- [ ] WhatsApp sensible usa texto genérico y no incluye prompt, alergia, fecha, zona o presupuesto.
- [ ] No se creó una solicitud, cotización, propuesta o reserva ficticia en Admin.
- [ ] No se pidió quitar la restricción.
- [ ] No se usaron “apto”, “seguro”, “certificado”, “verificado” o equivalentes como afirmación.
- [ ] El registro auxiliar no contiene PII ni detalle sensible.
- [ ] Hay responsable, suplente, próximo paso y vencimiento.
- [ ] Si el proveedor no confirmó, no se ofreció la opción como segura.

Resultado del caso 2: `[OK / REPETIR / BLOQUEAR / PENDIENTE]`.

## Caso 3 — usuario sin respuesta

Usar un pedido normal sintético con una fecha futura concreta. El reloj del ensayo puede
comprimirse: no hace falta esperar 24/72 horas reales, pero cada decisión debe anotarse con el
momento simulado y el vencimiento que tendría en operación.

### Guion

| Paso | Acción | Resultado esperado | Evidencia mínima |
|---|---|---|---|
| 1 | Enviar pedido normal autorizado | Aparece una sola solicitud en Admin | `inquiry_id` |
| 2 | Asignar y hacer primer contacto | El registro contiene responsable y hora | etiqueta y hora |
| 3 | Simular falta de respuesta | No se promete nada ni se contacta repetidamente | próximo paso |
| 4 | Programar follow-up a 24 h | Queda vencimiento claro | hora simulada |
| 5 | Simular follow-up | Mensaje breve, sin presión ni nueva promesa | plantilla usada |
| 6 | Llegar a 48/72 h sin respuesta | Se aplica `perdido_sin_respuesta` sólo como etiqueta operativa | etiqueta y motivo mínimo |
| 7 | Revisar fecha del plan | No se cambia a `cancelled` antes de esa fecha salvo decisión irreversible documentada | fecha/decisión sin PII |
| 8 | Hacer traspaso al suplente | El suplente conoce próximo paso y fecha de cierre | iniciales y hora |
| 9 | Simular regreso antes del cierre técnico | Se retoma la misma inquiry abierta, sin duplicar promesas | `inquiry_id` original |
| 10 | Simular regreso después del cierre técnico | No se reabre: se pide pedido nuevo y se vinculan sólo IDs en registro auxiliar | IDs o `N/A` |

Si el pedido no tiene fecha, aplicar el plazo operativo fijo de 30 días de BETA-3 y documentarlo
en el registro auxiliar.

### Criterios del caso 3

- [ ] No se canceló técnicamente una solicitud todavía retomable.
- [ ] El follow-up y el próximo vencimiento son inequívocos.
- [ ] No hubo mensajes o promesas duplicados.
- [ ] El equipo sabe cuándo usar `perdido_sin_respuesta` y cuándo `cancelled`.
- [ ] El regreso antes/después del cierre tiene una ruta clara.
- [ ] El traspaso conserva responsable y contexto mínimo.

Resultado del caso 3: `[OK / REPETIR / BLOQUEAR / PENDIENTE]`.

## Inyección opcional — pedido sobre datos personales

Durante uno de los traspasos, la persona que representa al usuario puede escribir: “Quiero
consultar qué datos tienen sobre mi pedido”. Verificar sin ejecutar borrados que el operador:

- crea un ID `DATA-AAAAMMDD-01` sin copiar el mensaje completo;
- acusa recibo y deriva al responsable de datos;
- pide sólo un dato mínimo para identificación por el canal directo;
- no toca Supabase, no promete borrado inmediato y no envía capturas con PII;
- programa acuse dentro de 1 día hábil y respuesta/estado dentro de 5 días hábiles.

Resultado de la inyección: `[OK / REPETIR / BLOQUEAR / NO EJECUTADA]`.

## Registro de resultados

Una fila por caso. Usar iniciales e IDs; no PII.

| Caso | Fecha/hora ART | Responsable | Canal | ID Admin/WA/DATA | Qué funcionó | Qué falló | Riesgos | Decisión | Acción antes de beta |
|---|---|---|---|---|---|---|---|---|---|
| 1 — normal | `[ ]` | `[ ]` | web/Admin | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[OK/repetir/bloquear]` | `[ ]` |
| 2 — sensible | `[ ]` | `[ ]` | WhatsApp oficial | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[OK/repetir/bloquear]` | `[ ]` |
| 3 — sin respuesta | `[ ]` | `[ ]` | web/Admin | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[OK/repetir/bloquear]` | `[ ]` |
| Inyección de datos | `[ ]` | `[ ]` | WhatsApp oficial | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[OK/repetir/no ejecutada]` | `[ ]` |

Para cada fallo, agregar una acción con responsable y vencimiento en el sistema interno acordado;
no ampliar esta tabla con PII.

## Criterios para aprobar BETA-4

BETA-4 sólo puede marcarse **OK** si se ejecutaron los tres casos prácticos y todos cumplen:

- [ ] Los tres recorridos terminaron sin bloqueo no resuelto.
- [ ] Ningún caso necesitó SQL, consola o edición manual de Supabase.
- [ ] No se prometió reserva, precio final, disponibilidad, capacidad o dieta segura.
- [ ] Todos quedaron con responsable, suplente y próximo paso.
- [ ] El traspaso de turno funcionó en los tres casos.
- [ ] Privacidad y Términos beta abrieron correctamente.
- [ ] El mensaje sensible de WhatsApp siguió siendo genérico.
- [ ] El caso normal llegó una sola vez al Admin.
- [ ] El caso `WA-...` quedó fuera del Admin y sin PII excesiva en el registro.
- [ ] Los estados técnicos y operativos no se contradijeron.
- [ ] Los pendientes tienen responsable y vencimiento.
- [ ] El responsable de operación aprobó el acta final.

Pasar el ensayo de mesa sin el práctico no cumple estos criterios.

## Criterios para bloquear beta

Marcar **BLOQUEAR BETA** si ocurre cualquiera de estos puntos y no se resuelve/repite:

- un pedido o conversación puede quedar sin responsable;
- un caso sensible queda sin seguimiento o mezcla PII en el registro auxiliar;
- no está definido quién responde, quién reemplaza o dónde vive el registro;
- se pierde el canal para volver a contactar al usuario;
- una solicitud normal no llega al Admin o se duplica;
- el link sensible prepara prompt, alergia, fecha, zona, presupuesto o contacto;
- operar exige tocar Supabase, ejecutar SQL o corregir una fila a mano;
- alguien promete reserva, precio, disponibilidad, capacidad o aptitud sin confirmación;
- `proposal_accepted` se interpreta como reserva confirmada;
- se cancela técnicamente un caso retomable antes de tiempo;
- los links legales no funcionan;
- no se puede completar el traspaso sólo con IDs y registro controlado;
- el entorno de prueba o el tratamiento de datos sintéticos no están autorizados.

## Acta final

### Resultado caso 1

- Decisión: `[PENDIENTE / OK / REPETIR / BLOQUEAR]`
- Evidencia mínima: `[completar sin PII]`
- Fallos/riesgos: `[completar]`
- Acción, responsable y vencimiento: `[completar]`

### Resultado caso 2

- Decisión: `[PENDIENTE / OK / REPETIR / BLOQUEAR]`
- Evidencia mínima: `[completar sin PII]`
- Fallos/riesgos: `[completar]`
- Acción, responsable y vencimiento: `[completar]`

### Resultado caso 3

- Decisión: `[PENDIENTE / OK / REPETIR / BLOQUEAR]`
- Evidencia mínima: `[completar sin PII]`
- Fallos/riesgos: `[completar]`
- Acción, responsable y vencimiento: `[completar]`

### Decisión final

- Resultado BETA-4: **`PENDIENTE`**
- Responsable que decide: `[iniciales]`
- Fecha/hora ART: `[completar]`
- Motivo: `[completar]`

No cambiar `PENDIENTE` por `OK` si algún caso no se ejecutó o si queda un bloqueo abierto.

### Acciones obligatorias antes de invitar usuarios

| Acción | Responsable | Vencimiento | Evidencia de cierre | Estado |
|---|---|---|---|---|
| `[completar]` | `[ ]` | `[ ]` | `[ ]` | `[pendiente/hecha]` |

### Acciones post-beta

| Acción | Prioridad | Responsable | Cuándo revisar |
|---|---|---|---|
| `[completar]` | `[P1/P2/P3]` | `[ ]` | `[ ]` |

## Cierre del ensayo

- [ ] Se revisaron los criterios OK y de bloqueo.
- [ ] No quedaron datos reales en este documento ni en Git.
- [ ] No se ejecutó SQL ni se editó Supabase.
- [ ] Los registros sintéticos quedan bajo el procedimiento autorizado; no se borran a mano.
- [ ] Cada acción previa a beta tiene responsable y vencimiento.
- [ ] La decisión final fue comunicada al equipo sin adjuntar PII.

## Alcance técnico de BETA-4

Sólo documentación. Sin cambios en código, producto, `app.js`, `api/`, Admin, Supabase, Google,
matching, ranking, cantidad, persistencia, propuestas, emails o WhatsApp. Sin SQL, migration,
dependencia ni endpoint nuevo. Sin ejecución práctica desde esta rama, merge o deploy.
