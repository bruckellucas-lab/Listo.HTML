# F6a — arnés de calidad antes de F1

Sólo tests/fixtures/documentación. Base productiva: 42c4f41. Sin cambios en app.js,
plan-options, plan.js, ranking, Google, guards de costo/privacidad, UX o base de datos.
F0 y su baseline siguen intactos para conservar la comparación histórica de 20 planes.

## Por qué otra línea base

F0 elegía el pool por category|zone: otra consulta podía devolver los mismos resultados
sin que el test detectara la diferencia. F6a llama un mundo sintético con textQuery e
includedType opcional. No recibe las etiquetas relevant del escenario, ni sabe cuáles
lugares quiere mostrar el selector. Query de parrilla/vegano/salón/baby shower/bar cambia
los tipos recuperados. includedType restringe esos tipos; una contradicción devuelve cero.
La zona se obtiene de la consulta; desconocida no se sustituye por una zona inventada.
No hay red, SDKs nuevos, Supabase ni contenido real de Google en los fixtures.

El catálogo reutiliza datos inventados de F0, con registros inventados para 0/1/2 resultados,
pocos candidatos y un vecino fuera de zona. Clona cada respuesta para impedir contaminación
entre tests. Búsqueda reproducible, sin ranking oracle: devuelve candidatos en orden de
catálogo, con máximo simulado. Adecuación se evalúa después usando relevant por escenario,
OPERATIONAL, rating >=4, reseñas >=20, zona y deduplicación de nombres adecuados.
Estos umbrales son etiquetas de evaluación, no cambios de reglas productivas.

## Cobertura

29 escenarios: los 20 originales (incluyen fiesta de 30, asado, cena vegana y baby shower)
y nueve adicionales: cumple de 25; música/deco/torta/fotos; en Marzo como zona inválida;
Google 0, 1 y 2; zona con pocos resultados; fuera de zona; y parrillas adecuadas omitidas.
Un lugar de tipo event_venue no prueba capacidad, música, deco, torta ni fotos: pertinencia
por tipo es aproximada; el arnés no afirma que el lugar satisfaga todas esas necesidades.
La dieta vegan_restaurant es preferencia de búsqueda, nunca garantía dietaria segura.

## Comandos

```sh
node tests/matching/report-f6a.js
node tests/matching/report-f6a.js --write  # snapshot sólo si la medición cambia y se revisa
node --test tests/matching-quality.test.js
npm run check
npm test
```

El reporte JSON contiene resumen, metas y cada escenario con query, includedType, IDs
sintéticos y métricas. No enviar planes reales/sensibles a este script ni guardar resultados
Google para llenar fixtures. No regenerar snapshots para esconder una regresión.

## Línea base F6a del código ACTUAL

| Métrica | Valor |
| --- | ---: |
| Escenarios / opciones | 29 / 74 |
| Pertinencia por tipo | 62,2 % |
| Relleno (mostradas no adecuadas) | 29 |
| Adecuadas recuperadas no mostradas, todas | 62 |
| Adecuadas omitidas de hasta 3 slots | 14 |
| Fuera de zona / sin aviso | 1 / 1 |
| Escenarios con menos de 3 adecuadas recuperadas | 13 |
| Escenarios mostrando menos de 3 | 7 |
| Búsquedas distintas (query + includedType) | 12 |
| Escenarios no vacíos iguales para 20 usuarios | 27 |
| Escenarios vacíos | 2 |
| Pares de planes / pares con lista no vacía idéntica | 406 / 88 |
| Razones / razones sin fuente | 0 / 0 |
| Ratio de razones con fuente | N/A (null: todavía no hay razones) |
| Textos prohibidos en nota actual | 0 |

El contrato futuro también corta claims/razones no verificados en cualquiera de los 20 usuarios simulados.

Metas iniciales explícitas: >=80 % pertinencia, <=10 rellenos y cero fuera de zona sin aviso.
La línea base no cumple las metas; se reporta sin fingir que F6a mejora el producto.
F0 55 %, relleno29/omisiones19 y seis búsquedas no son comparables directamente con esta
batería: cambiaron pools, escenarios y denominadores. Mantener ambos informes separados.
Una búsqueda con cero resultados tiene pertinencia null si toda la batería queda vacía,
no 100 %. Las listas vacías no cuentan como personalización/repetición exitosa.

Omisiones mide el universo recuperado, no todo Google: no puede contar candidatos buenos
que Google no devuelve. missedAll no se compara con la vieja métrica acotada de F0.
missedSlots ayuda a detectar un selector que oculta casi todo para mejorar su precisión.
Mostrar menos de tres está permitido y se mide, pero no prueba por sí solo calidad.

## Adaptadores y guardianes futuros

`quality.run()` usa chooseCategory real extraído por F0, buildQuery real, toProviderRows y
pickOptions reales. La nota de honestidad se extrae de PRICE_NOTE en app.js. No se renderiza
el DOM completo: no confundir la nota/editorial de tarjeta con nombre o dirección del lugar.
20 ejecuciones del selector por escenario permiten medir orden/variedad sin aleatoriedad
obligatoria ni prometer que dos usuarios iguales deban recibir resultados diferentes.

`quality.run(adapter)` admite request/pick/evidence sin cambiar producción. El test de
sensibilidad sustituye sólo query de parrillas: cambia candidatos y mejora pertinencia,
aun usando el selector real. Otros tests prueban variedad, aviso de zona y selección corta;
son controles de sensibilidad, NO implementación alternativa aprobada de matching.

Para F1 usar `quality.run(adapter, {futureContract: true})`: valida perfiles IDs cerrados,
plantillas cerradas de query, includedType cerrado, zonas resueltas y costKey=perfil|zona
normalizada. Es contrato TEST-ONLY inicial; adaptar plantillas y tipos tras revisar F1.
Hoy producción usa category|zona para search_repeat. Ese comportamiento se conserva.
El arnés exige que el futuro adaptador use perfil|zona; F1 deberá conectarlo también al
guard real de S2D y agregar prueba de endpoint. Un dato simulado de costKey no demuestra
por sí solo alineación de la ruta productiva. Nunca ampliar topes en esta tarea.

Los guardianes rechazan original_prompt/notas/alergias/contactos en el request futuro;
el adapter sólo proyecta campos cerrados. Tests con centinelas demuestran que la query
actual no consume esos campos. No se imprime el escenario completo en logs del arnés.
Una zona inválida exige resolución/fallback explícito futuro, no perfil derivado de texto
libre. Las zonas cerradas aquí son fixtures; F1 deberá definir su validación real.

`guardians.issues(card, evidence, today)` detecta afirmaciones editoriales prohibidas de
precio, disponibilidad, capacidad, reservas y seguridad/certificación dietaria, también
en razones. Evidencia necesita id, lugar, campo, valor exacto, fuente permitida, verificación
y fecha válida/vigente. No basta anexar verified=true al claim; debe existir en el registry
independiente que suministra la prueba. Un certificado de otro lugar, fecha vencida, fuente
inadecuada o capacidad con otro valor falla. Google live sólo puede fundamentar razones
limitadas de zona/tipo/rating; no certificar dieta segura ni precios/capacidad.
El registry es sintético: NO constituye verificación legal/comercial en producción.

Estas expresiones son pruebas de regresión, no comprensión completa del español. F3 deberá
usar plantillas cerradas y fuentes verificadas con binding de valores, e incorporar su
renderer real al arnés. F4 seguridad dietaria sigue pendiente de review propia; F6a no
habilita afirmaciones ni modifica bloqueo de requisitos fuertes. 0 razones no significa
100 % de razones con fuente: la métrica queda N/A.

## Compliance y alcance

Siguen ejecutándose guardianes de no persistir Google/ranking/fotos, allowlist providers,
no-store, no endpoints nuevos, firmas y atribuciones, logs privados y cost guards. F6a
verifica presencia de esos contratos y cambios de intención query/costo; la evidencia
funcional de endpoints está en las suites G/S2B/S2C/S2D/S2E ya existentes, no sólo regex.
No cambia almacenamiento del navegador ni obliga a guardar ranking o perfiles productivos.

## Uso en F1 y límites de la medición

1. Reproducir F0 y F6a antes de implementar, mantener snapshots de base.
2. Adaptar el constructor real de query/perfil de F1 al contrato futuro sin consumir PII.
3. Comparar por escenario y global; mantener ranking fijo para aislar cambios de query.
4. Verificar pérdidas de zona, omisiones, pocos resultados, presupuesto search_repeat y
   ausencia de afirmaciones no fundamentadas; repetir las suites de compliance/seguridad.
5. Separar cambios de query, ranking y UI en etapas y reviews distintas. No desplegar
   por una subida de pertinencia sintética solamente.

Riesgos: catálogo pequeño y sesgado; etiquetas subjetivas por tipo; no modela geografía,
latencia/costo ni disponibilidad real; no valida aceptación de todos los includedType por
Google real. Ampliar fixtures independientes/casos difíciles antes de optimizar F1; revisar
fuentes/API aplicables sin capturar contenido Google. Las metas son orientación inicial,
no prueba de eficacia con usuarios reales. No se ejecutó SQL ni se tocó código productivo.
