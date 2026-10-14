# BETA-5 — seguimiento de testers y gestión de feedback

Base: `a58d22faa6e3ac2b278d3c710d852d9be544869c`.

Estado: **PREPARACIÓN DOCUMENTAL**. La primera tanda fue invitada por canales privados, pero el
ensayo práctico BETA-4 sigue pendiente. No ampliar testers ni interpretar las invitaciones como
aprobación operativa.

Formulario de feedback preparado:
[Formulario BETA LISTO](https://docs.google.com/forms/d/e/1FAIpQLSfgJU3941ZyGUrffkHAZmK1xOP-q8lZVJ1TjtRaveumwCPf0g/viewform).

Esta guía no contiene nombres, teléfonos, emails ni respuestas reales. No modifica el formulario
ni accede a sus resultados.

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

- El Google Form es la fuente para opiniones declaradas por testers.
- Admin y el registro operativo de BETA-3 son la fuente para pedidos y tiempos de atención.
- GitHub guarda sólo problemas resumidos y redactados, nunca respuestas crudas con PII.
- La relación entre una persona invitada y su ID anónimo vive únicamente en el registro privado
  controlado; no se versiona ni se comparte en tickets.
- Si un comentario abierto contiene nombre, teléfono, email, alergia, diagnóstico, pedido o chat,
  redactarlo antes de clasificarlo. No pegar el original en documentación o tareas.
- El acceso al Form, su hoja de respuestas y cualquier exportación debe limitarse a las personas
  designadas. No descargar copias locales sin un procedimiento acordado.

## Seguimiento de testers

Asignar IDs correlativos no identificables, por ejemplo `T-001`, `T-002`. No derivarlos de
iniciales, nombre, teléfono o email.

| ID anónimo | Invitación enviada | Web probada | Formulario completado | Dispositivo | Flujo probado | Problema detectado | Severidad | Requiere seguimiento | Estado del seguimiento |
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

## Registro de feedback

Cada observación accionable recibe un ID `FB-AAAAMMDD-01`.

| ID feedback | ID tester | Fuente | Categoría | Prioridad | Resumen redactado | Evidencia mínima | Reproducible | Frecuencia | Responsable | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| `FB-...` | `T-... / anónimo` | `[Form/operación/smoke]` | `[categoría]` | `[P0-P3]` | `[sin PII]` | `[pasos/ID técnico autorizado]` | `[sí/no/pendiente]` | `[1/n casos]` | `[iniciales]` | `[nuevo/triage/en curso/resuelto/no se hará]` |

No usar cantidad de comentarios como único criterio de prioridad. Un solo P0 pesa más que muchas
preferencias visuales.

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

| Métrica | Cálculo | Fuente |
|---|---|---|
| Testers invitados | IDs anónimos con invitación enviada en el período | registro privado de testers |
| Testers que probaron | IDs únicos con prueba confirmada; no contar sólo invitación | seguimiento de testers |
| Formularios recibidos | respuestas válidas del período, deduplicadas según regla privada | Google Form |
| Tasa de respuesta entre testers | formularios recibidos / testers que probaron × 100 | seguimiento + Form |
| Tasa sobre invitados | formularios recibidos / testers invitados × 100, como contexto secundario | seguimiento + Form |
| Facilidad promedio | promedio de la pregunta de facilidad en su escala original | Google Form |
| Comprensión del pedido | promedio o distribución de la pregunta correspondiente, sin reinterpretar la escala | Google Form |
| Pertinencia percibida | promedio o distribución de calidad de opciones | Google Form |
| Confianza promedio | promedio de la pregunta de confianza en su escala original | Google Form |
| Intención de avanzar | porcentaje por respuesta o promedio, según el tipo real de pregunta | Google Form |
| Bugs por prioridad | cantidad de IDs de feedback únicos clasificados P0/P1/P2/P3 | registro de feedback |
| Pedidos de prueba | casos marcados explícitamente como prueba | Admin/registro operativo |
| Pedidos reales | casos no marcados como prueba; nunca inferir sólo por nombre | Admin/registro operativo |
| Tiempo a primer contacto | diferencia entre entrada y primer contacto, mediana y máximo en horario de cobertura | registro operativo |

Reglas de cálculo:

- No mezclar respuestas del Form con filas del Admin sin un vínculo anónimo controlado.
- No sumar respuestas múltiples de una persona como testers distintos.
- Si una pregunta admite omisión, informar `n` válido de esa métrica.
- No convertir escalas sin documentar la fórmula.
- No promediar texto libre.
- Diferenciar claramente pedidos reales, pedidos del ensayo y pruebas de testers.
- No afirmar tendencias con una muestra pequeña; describirlas como señales.

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
- Deben definirse acceso, retención y eliminación de respuestas/exportaciones del Form.
- Debe revisarse la base legal/consentimiento para datos sensibles antes de ampliar casos.
- El mapeo privado entre personas e IDs anónimos necesita responsable y acceso restringido.
- El registro debe distinguir pruebas, pedidos reales y casos sólo por WhatsApp.
- Un formulario recibido no garantiza que el flujo operativo haya funcionado.

## Alcance técnico de BETA-5

Sólo documentación. No se ejecutó BETA-4, no se accedió a respuestas reales y no se modificó el
Google Form ni ninguna cuenta externa. Sin cambios en código, `app.js`, `api/`, Admin, Supabase,
Google, matching, ranking, persistencia, propuestas, emails o WhatsApp. Sin SQL, migration,
dependencia ni endpoint nuevo. Sin merge ni deploy.
