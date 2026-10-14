# BETA-5 — seguimiento de testers y gestión de feedback

Base: `a58d22faa6e3ac2b278d3c710d852d9be544869c`.

Estado: **PREPARACIÓN DOCUMENTAL**. La primera tanda fue invitada por canales privados, pero el
ensayo práctico BETA-4 sigue pendiente. No ampliar testers ni interpretar las invitaciones como
aprobación operativa.

Formulario de feedback preparado:
[Formulario BETA LISTO](https://docs.google.com/forms/d/e/1FAIpQLSfgJU3941ZyGUrffkHAZmK1xOP-q8lZVJ1TjtRaveumwCPf0g/viewform).

Esta guía no contiene nombres de testers, emails ni respuestas reales. El Form publicado pide
`Nombre` y puede recibir opiniones o texto libre: por eso el Form y su hoja vinculada son registros
privados con datos personales, no registros anónimos. Esta guía no modifica el formulario ni
accede a sus resultados.

## Objetivo de la beta

La beta cerrada busca validar con evidencia:

1. si las personas entienden qué hace LISTO;
2. si pueden expresar un pedido fácilmente;
3. si las opciones resultan pertinentes;
4. si entienden que LISTO no reserva automáticamente;
5. si confían en tocar “Quiero avanzar”;
6. si el flujo funciona en celular y computadora;
7. si aparecen errores técnicos o confusiones repetidas;
8. si la coordinación manual aporta utilidad real.

No busca medir crecimiento, monetización o demanda masiva. Una sugerencia aislada tampoco valida
una nueva funcionalidad.

## Privacidad y fuentes de verdad

- El Google Form y su hoja de respuestas son la fuente privada para opiniones declaradas por
  testers. Sólo pueden acceder el responsable de beta y las personas expresamente autorizadas.
- El nombre pedido por el Form se usa exclusivamente para identificar o deduplicar respuestas y
  marcar “Formulario completado” en el seguimiento privado.
- La pregunta `Nombre` se mantiene temporalmente porque el formulario ya fue enviado a ocho
  testers. Antes de ampliar la beta se debe revisar si se reemplaza por un código `T-...` o se hace
  opcional. Esta decisión no autoriza modificar ahora el Google Form.
- Admin y el registro operativo de BETA-3 son la fuente para pedidos y tiempos de atención.
- Los códigos `T-...` son seudónimos, no una anonimización irreversible. La relación entre una
  persona y su código vive únicamente en el registro privado controlado.
- El seguimiento de testers y cualquier tabla de feedback que vincule una respuesta con `T-...`
  son privados: no se versionan ni se copian a documentación, issues o reportes públicos.
- GitHub guarda únicamente códigos `FB-...` y resúmenes redactados. No debe contener valores reales
  de `T-...`, `inquiry_id`, `WA-...`, `DATA-...` ni otro identificador que permita vincular el
  resumen con una persona o caso.
- Los nombres nunca se copian a GitHub, documentación, issues ni reportes.
- Si un comentario abierto contiene nombre, teléfono, email, alergia, diagnóstico, pedido o chat,
  redactarlo antes de clasificarlo. No pegar el original en documentación o tareas.
- El acceso al Form, su hoja de respuestas y cualquier exportación debe limitarse a las personas
  designadas. No descargar copias locales sin un procedimiento acordado.
- La política pendiente de retención y borrado debe abarcar el Form, su hoja vinculada, las
  exportaciones y todas sus copias. No borrar respuestas automáticamente mientras esa política no
  esté definida.

## Seguimiento de testers

Este seguimiento es privado. Asignar seudónimos correlativos, por ejemplo `T-001`, `T-002`, sin
derivarlos de iniciales, nombre, teléfono o email. No copiar la tabla al repositorio.

| Seudónimo | Invitación enviada | Web probada | Formulario completado | Dispositivo | Flujo probado | Problema detectado | Severidad | Requiere seguimiento | Estado del seguimiento |
|---|---|---|---|---|---|---|---|---|---|
| `T-___` | `[sí/no + fecha]` | `[sí/no + fecha]` | `[sí/no + fecha]` | `[celular/computadora/ambos]` | `[búsqueda/elección/avanzar/WhatsApp]` | `[código o resumen sin PII]` | `[P0/P1/P2/P3/N/A]` | `[sí/no]` | `[nuevo/contactado/resuelto/no reproducido]` |

Reglas:

- Una fila por tester, no una fila por respuesta.
- Usar fechas, no capturas, como evidencia de invitación/prueba/formulario.
- “Problema detectado” contiene un código como `FB-012` o una frase neutra; no texto crudo.
- Si hay varios problemas, registrar sus códigos separados y gestionarlos en la tabla de feedback.
- “Web probada” requiere confirmación del tester o evidencia operativa, no sólo link enviado.
- “Formulario completado” se marca desde el Form, sin copiar la respuesta.
- No registrar nombres, teléfonos, emails, ubicación precisa, restricciones ni datos sensibles.
- Clasificar cada caso privado como `ensayo BETA4`, `tester` o `real no tester`. Un pedido de un
  tester puede ser real y debe atenderse como tal; no cambiar el nombre de contacto en Admin ni
  modificar la base de datos para etiquetarlo.
- Para métricas cuenta una respuesta válida por tester. Si envía varias, prevalece la más reciente
  y las anteriores se marcan como duplicadas en el registro privado, sin borrarlas automáticamente.

## Registro de feedback

Cada observación accionable recibe un ID `FB-AAAAMMDD-01`. La tabla detallada que vincula el
feedback con un tester o caso vive sólo en el registro privado.

| ID feedback | ID tester | Fuente | Categoría | Prioridad | Resumen redactado | Evidencia mínima | Reproducible | Frecuencia | Responsable | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| `FB-...` | `T-... / anónimo` | `[Form/operación/smoke]` | `[categoría]` | `[P0-P3]` | `[sin PII]` | `[pasos/ID técnico autorizado]` | `[sí/no/pendiente]` | `[1/n casos]` | `[iniciales]` | `[nuevo/triage/en curso/resuelto/no se hará]` |

No usar cantidad de comentarios como único criterio de prioridad. Un solo P0 pesa más que muchas
preferencias visuales.

Si hace falta abrir una tarea en GitHub, trasladar sólo `FB-...`, categoría, prioridad, resumen
redactado y pasos sintéticos. No trasladar la columna `ID tester`, IDs técnicos reales, capturas,
respuestas textuales ni enlaces a filas del Form, Admin o registro operativo.

## Ruta urgente hacia la operación BETA-3

- Canal oficial para asuntos urgentes o pedidos sin respuesta: WhatsApp LISTO
  **+54 11 5806 5840**.
- El Form es para feedback y **no es un canal de atención urgente**. Se recomienda incluir esta
  advertencia de forma visible en el Form y en futuras invitaciones; no se afirma que ya esté
  incorporada ni se modifica el Form desde esta tarea.
- Responsable o suplente revisa el Form al menos una vez por cada turno de guardia efectiva. No se
  espera al triage semanal cuando aparece un incidente urgente.
- Si el feedback revela un pedido sin atender, abrir o recuperar el caso BETA-3 usando el
  `inquiry_id` del Admin o un código `WA-AAAAMMDD-XX`. Verificar primero si ya existe para evitar
  duplicados. Registrar en el sistema privado responsable, siguiente acción y vencimiento interno.
- Si se pide acceso, corrección o eliminación de datos personales, derivar inmediatamente al
  responsable designado como caso privado `DATA-AAAAMMDD-XX`.
- Ante un P0, avisar al responsable de beta dentro del mismo turno, decidir si corresponde pausar
  el flujo afectado o toda la beta, y registrar de forma privada la decisión, hora y responsable.
- Ninguno de esos identificadores operativos ni la PII asociada se copia al registro de feedback
  de GitHub.

## Clasificación del feedback

### 1. Bug técnico

Algo no funciona según el flujo diseñado: botón sin respuesta, error de API, formulario que no
envía, solicitud que no aparece o estado incoherente.

### 2. Matching

Las opciones no corresponden con tipo de plan o zona, se omite una opción claramente adecuada o
se presenta relleno como pertinente. Una preferencia personal sin relación con el pedido no basta.

### 3. UX

El usuario no entiende un paso, una acción no se descubre o el flujo exige esfuerzo evitable.
Ejemplo: no encuentra cómo volver o no sabe qué hacer después de elegir.

### 4. Confianza

No queda claro quién responde, qué ocurre después, si ya existe una reserva o de dónde salen los
datos del lugar.

### 5. Diseño

Problema visual o de presentación: legibilidad, jerarquía, espaciado, recorte o comportamiento
responsive sin pérdida funcional.

### 6. Producto

Solicitud de una capacidad inexistente. Se documenta, pero no se convierte automáticamente en
trabajo: primero se valida frecuencia, valor, riesgo y compatibilidad con el alcance.

### 7. Operación

Problema de contacto, cobertura, tiempos, traspaso, coordinación manual, proveedor o registro
interno.

### 8. Privacidad / seguridad

Exposición de datos, acceso indebido, datos sensibles en URLs/mensajes, promesa peligrosa,
suplantación, falta de responsable o tratamiento incorrecto de un pedido de datos.

Si una observación encaja en varias categorías, elegir la de mayor riesgo como principal y anotar
una secundaria sin duplicar el problema.

## Prioridad de problemas

### P0 — crítico

Riesgo de datos o seguridad, pérdida de pedidos, falta total de responsable o información falsa
peligrosa. Detener el flujo afectado y evaluar pausar toda la beta.

Ejemplos LISTO:

- WhatsApp sensible incluye alergia, prompt o contacto en el mensaje prearmado;
- un pedido guardado desaparece o queda asignado a nadie;
- alguien puede acceder al Admin sin autenticación;
- se afirma que un lugar es seguro para una alergia sin evidencia;
- una operación se guarda pero el equipo la repite y crea consecuencias comerciales duplicadas.

### P1 — alto

Impide completar un flujo importante o afecta repetidamente a usuarios. Resolver antes de ampliar
la beta.

Ejemplos:

- “Quiero avanzar” falla de forma reproducible para pedidos normales;
- Admin no muestra solicitudes válidas;
- mobile impide elegir o enviar;
- matching claramente incorrecto en varios pedidos simples;
- usuarios creen repetidamente que aceptar una propuesta ya reservó.

### P2 — medio

Fricción significativa con alternativa segura y conocida.

Ejemplos:

- mensaje poco claro que obliga a preguntar qué sigue;
- filtro o búsqueda del Admin dificulta operar, pero el caso se encuentra;
- una tarjeta tiene un dato visual confuso sin crear una promesa falsa;
- un paso requiere recargar pero conserva la operación.

### P3 — bajo

Detalle visual, texto, estilo o mejora menor sin impacto relevante en seguridad o finalización.

Ejemplos:

- espaciado mejorable;
- preferencia de color;
- copy que podría ser más elegante pero se entiende;
- sugerencia aislada de animación o personalización.

La severidad describe impacto, no esfuerzo. Un arreglo pequeño puede ser P0 y una idea costosa
puede ser P3.

## Métricas de beta

No completar esta sección sin respuestas o registros reales. Publicar siempre período, fuente,
denominador y cantidad de valores faltantes.

La vista pública observada muestra 13 preguntas, no 10. Antes de calcular resultados se debe
confirmar en el editor del Form la cantidad, el texto, el tipo y la obligatoriedad de cada pregunta.
El mapeo observado, sujeto a esa confirmación, es:

| Pregunta observada | Tratamiento |
|---|---|
| P3 Facilidad | Escala 1–5; informar promedio o distribución y `n` válido. |
| P4 Comprensión | Distribución categórica; no calcular promedio. |
| P5 Pertinencia | Distribución categórica; no interpretar que midió “opciones mostradas” por separado. |
| P6 Confianza | Escala 1–10; informar promedio o distribución y `n` válido. |
| P7 Intención | Distribución `Sí / Tal vez / No`. |
| P8 Fricciones | Distribución de respuestas; texto libre sólo en la fuente privada. |
| P11 Eficiencia comparada | Escala 1–5; informar promedio o distribución y `n` válido. |
| P9, P10 y P12 | Señales exploratorias de producto, no autorización para desarrollar funciones. |

“Testers que probaron” y dispositivo salen del seguimiento privado, no del Form. Para todas las
preguntas se informa el `n` válido y no se fabrican respuestas para completar faltantes.

| Métrica | Cálculo | Fuente |
|---|---|---|
| Testers invitados | seudónimos con invitación enviada en el período | registro privado de testers |
| Testers que probaron | IDs únicos con prueba confirmada; no contar sólo invitación | seguimiento de testers |
| Formularios recibidos | respuestas válidas del período, deduplicadas según regla privada | Google Form |
| Tasa de respuesta entre testers | formularios recibidos / testers que probaron × 100 | seguimiento + Form |
| Tasa sobre invitados | formularios recibidos / testers invitados × 100, como contexto secundario | seguimiento + Form |
| Facilidad | promedio o distribución de P3 en escala 1–5, con `n` válido | Google Form |
| Comprensión del pedido | distribución categórica de P4; sin promedio | Google Form |
| Pertinencia percibida | distribución categórica de P5; sin inferir una pregunta separada sobre cantidad | Google Form |
| Confianza | promedio o distribución de P6 en escala 1–10, con `n` válido | Google Form |
| Intención de avanzar | distribución y porcentaje de P7: `Sí / Tal vez / No` | Google Form |
| Fricciones | distribución de P8; comentarios abiertos sólo en fuente privada | Google Form |
| Eficiencia comparada | promedio o distribución de P11 en escala 1–5, con `n` válido | Google Form |
| Bugs por prioridad | cantidad de IDs de feedback únicos clasificados P0/P1/P2/P3 | registro de feedback |
| Pedidos de prueba | casos marcados explícitamente como prueba | Admin/registro operativo |
| Pedidos reales | casos no marcados como prueba; nunca inferir sólo por nombre | Admin/registro operativo |
| Tiempo a primer contacto | diferencia entre entrada y primer contacto, mediana y máximo en horario de cobertura | registro operativo |

Reglas de cálculo:

- No mezclar respuestas del Form con filas del Admin sin un vínculo anónimo controlado.
- No sumar respuestas múltiples de una persona como testers distintos.
- Para las métricas, conservar sólo la respuesta válida más reciente de cada tester; marcar las
  anteriores como duplicadas en el registro privado sin borrarlas automáticamente.
- Si una pregunta admite omisión, informar `n` válido de esa métrica.
- No convertir escalas sin documentar la fórmula.
- No promediar texto libre.
- Diferenciar claramente pedidos reales, pedidos del ensayo y pruebas de testers.
- No afirmar tendencias con una muestra pequeña; describirlas como señales.
- Como el link publicado puede recibir respuestas de terceros, validar cada respuesta contra el
  registro privado antes de incluirla. Cerrar el Form al terminar la tanda; esta tarea sólo
  documenta el control y no cambia su configuración.

Las respuestas de P9, P10 y P12 pueden sugerir chat, división de gastos u otras capacidades. Son
señales exploratorias: ninguna justifica por sí sola diseñar o desarrollar una función nueva.

Plantilla de reporte:

| Período | Invitados | Probaron | Formularios | Tasa probó→Form | Facilidad (n) | Pertinencia (n) | Confianza (n) | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `[desde–hasta]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

## Reglas de priorización

Orden general:

1. privacidad y seguridad;
2. pedidos perdidos, duplicados con consecuencias o flujo roto;
3. matching claramente incorrecto y repetido;
4. falta de claridad sobre reservas, precios, disponibilidad o quién responde;
5. fricciones frecuentes de UX;
6. diseño y detalles visuales;
7. funcionalidades nuevas.

Para decidir dentro del mismo nivel, comparar:

- impacto y posibilidad de daño;
- cantidad de personas/casos afectados;
- reproducibilidad y calidad de la evidencia;
- existencia de alternativa segura;
- probabilidad de repetición;
- riesgo de introducir una regresión.

No elevar prioridad porque una persona lo pide con insistencia. No construir una feature sólo
porque apareció una vez. Una idea de producto requiere problema repetido, beneficio claro y
revisión de seguridad, privacidad, operación y costo.

Un P0 abierto impide ampliar la beta. Los P1 del flujo principal deben resolverse o contar con una
decisión explícita de pausa antes de sumar testers.

## Ciclo de mejora

1. **Recibir:** conservar la respuesta original sólo en la fuente autorizada.
2. **Clasificar:** crear `FB-...`, categoría y prioridad provisional.
3. **Revisar evidencia:** reproducir sin PII y distinguir opinión de fallo verificable.
4. **Agrupar:** unir observaciones con la misma causa; no inflar frecuencia con duplicados.
5. **Priorizar:** aplicar riesgo, frecuencia, alternativa y alcance.
6. **Crear una tarea pequeña:** un problema, alcance y criterios de aceptación para Codex o
   Claude; no incluir respuestas crudas ni datos de testers.
7. **Revisar:** revisión independiente, especialmente en P0/P1.
8. **Probar:** tests automáticos y smoke proporcional al cambio.
9. **Publicar:** sólo con aprobación y proceso controlado.
10. **Cerrar el ciclo:** actualizar `FB-...` como resuelto, no reproducido, diferido o no se hará;
    registrar versión/SHA y verificar si el tester puede confirmar sin revelar su identidad.

Trabajar en tandas pequeñas. No mezclar matching, diseño, operación y privacidad en un mismo
cambio salvo que una causa inseparable lo exija.

## Ritmo sugerido

- Diario durante la tanda: revisar P0/P1, solicitudes sin responsable y feedback nuevo.
- Dos veces por semana: agrupar duplicados y revisar prioridades.
- Al cerrar la primera tanda: elaborar el resumen final sin PII.
- Antes de cada ampliación: ejecutar el checklist siguiente y decidir continuar, pausar o repetir.

La ventana prevista es de 08:00 a 00:00 (hora Argentina), sujeta a confirmar cobertura efectiva.
No comunicarla al tester si guardia y suplente no pueden sostenerla.

## Checklist antes de ampliar testers

- [ ] Ensayo práctico BETA-4 completado y acta final `OK`.
- [ ] Guardia y suplente operativos durante el horario confirmado.
- [ ] Registro operativo activo, privado y con accesos controlados.
- [ ] Acceso al WhatsApp oficial limitado a responsables autorizados.
- [ ] Pendientes legales y consentimiento aplicable a datos sensibles evaluados.
- [ ] Ningún P0 abierto.
- [ ] P1 del flujo principal resueltos o beta pausada para resolverlos.
- [ ] Pedidos de la tanda registrados, asignados y atendidos.
- [ ] Respuestas recopiladas sin copiar PII al repositorio.
- [ ] Cantidad, tipo y obligatoriedad de las preguntas confirmados en el editor del Form.
- [ ] Respuestas de terceros o duplicadas excluidas de las métricas mediante el registro privado.
- [ ] Advertencia “el Form no es atención urgente” preparada para futuras invitaciones y Form.
- [ ] Problemas clasificados, agrupados y con responsable.
- [ ] Pruebas y pedidos reales están diferenciados.
- [ ] No se confundieron aceptaciones con reservas confirmadas.
- [ ] El equipo tiene capacidad para la cantidad adicional de testers.
- [ ] Existe decisión escrita del responsable de beta.

Las invitaciones iniciales ya enviadas no demuestran que BETA-4 esté aprobado y no habilitan una
segunda tanda.

## Plantilla de resultado de la primera tanda

### Alcance

- Período: `[AAAA-MM-DD — AAAA-MM-DD]`
- Testers invitados: `[cantidad]`
- Testers que probaron: `[cantidad]`
- Formularios válidos: `[cantidad]`
- Dispositivos cubiertos: `[celular/computadora/ambos]`

### Qué funcionó

- `[evidencia agregada, sin nombres ni citas identificables]`

### Qué falló

- `[ID FB + resumen redactado + frecuencia]`

### Tres problemas principales

1. `[FB-... — categoría — prioridad — evidencia]`
2. `[FB-... — categoría — prioridad — evidencia]`
3. `[FB-... — categoría — prioridad — evidencia]`

### Mejoras prioritarias

| Acción | Prioridad | Responsable | Criterio de cierre | Estado |
|---|---|---|---|---|
| `[ ]` | `[P0-P3]` | `[iniciales]` | `[ ]` | `[pendiente/en curso/hecha]` |

### Riesgos abiertos

- `[riesgo — alcance — mitigación temporal — decisión]`

### Decisión

Elegir una sola:

- `[ ]` Continuar limitada con la misma cohorte.
- `[ ]` Pausar hasta resolver bloqueos.
- `[ ]` Ampliar sólo después de cumplir los requisitos indicados.

Responsable y fecha: `[iniciales — AAAA-MM-DD HH:mm ART]`.

No marcar “ampliar” con BETA-4 pendiente, un P0 abierto, P1 crítico del flujo sin resolver o sin
cobertura operativa real.

## Riesgos pendientes antes de ampliar

- El ensayo práctico BETA-4 continúa pendiente.
- La cobertura horaria prevista debe confirmarse con guardia y suplente efectivos.
- La advertencia de atención urgente todavía no fue incorporada al Form ni a invitaciones futuras.
- El mapeo de 13 preguntas observado debe confirmarse dentro del editor del Form.
- El enlace público exige validar respuestas y cerrar el Form al terminar la tanda.
- Deben definirse acceso, retención y eliminación de respuestas/exportaciones del Form.
- Debe revisarse si `Nombre` se reemplaza por un código o pasa a ser opcional antes de ampliar.
- Debe revisarse la base legal/consentimiento para datos sensibles antes de ampliar casos.
- El mapeo privado entre personas e IDs anónimos necesita responsable y acceso restringido.
- El registro debe distinguir pruebas, pedidos reales y casos sólo por WhatsApp.
- Un formulario recibido no garantiza que el flujo operativo haya funcionado.

## Alcance técnico de BETA-5

Sólo documentación. No se ejecutó BETA-4, no se accedió a respuestas reales y no se modificó el
Google Form ni ninguna cuenta externa. Sin cambios en código, `app.js`, `api/`, Admin, Supabase,
Google, matching, ranking, persistencia, propuestas, emails o WhatsApp. Sin SQL, migration,
dependencia ni endpoint nuevo. Sin merge ni deploy.
