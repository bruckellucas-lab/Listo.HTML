# F5 — selección honesta y coordinación manual

Base: `926ab2741b6fd6826c3bdd6bd7b63b90573a4388`.
Rama: `codex/f5-honest-fallback`. Implementación para review; sin merge ni despliegue.

## Criterio exacto

F5 agrega `pickAdequateOptions`; no modifica el comparador ni la fórmula de F2.
Se filtra toda la respuesta antes del límite de tres, para no perder candidatos adecuados
que vengan después de candidatos descartados. Se exige:

- `primaryType` de la respuesta actual pertinente al perfil cerrado, incluyendo las familias
  restaurant del fix F2. Sólo para la admisión F5 de grill, vegan, cafe_brunch y baby_shower,
  se acepta también el tipo `restaurant` genérico. No se infiere tipo de labels ni del nombre.
- Rating numérico finito entre 4 y 5 y al menos 20 reseñas enteras positivas seguras.
  El score bayesiano F2 debe ser calculable; no se completan datos ausentes.
- Id/nombre utilizables, sin duplicados y sin estado CLOSED_PERMANENTLY/CLOSED_TEMPORARILY.
  Se conservan las exclusiones existentes. Un estado no informado no certifica apertura.

Después se aplica el orden F2: zona clara → tipo → calidad. Si sólo quedan 0, 1 o 2,
se devuelven esos candidatos. No se agregan tipos ajenos al filtro, candidatos poco reseñados o
con rating bajo para completar tres. Si falta tipo/rating/reseñas, se ofrece coordinación.
El fallback de ranking antiguo sigue disponible en `pickOptions` para callers históricos;
no se usa para rellenar una búsqueda pública con candidatos sin pertinencia demostrable.

Zona clara orienta el orden. No se exige zona exacta para todo candidato del cliente nuevo:
un lugar de tipo/calidad suficiente puede mostrarse como alternativa fuera de zona o
con zona incierta, siempre con aviso. No se certifican precio, disponibilidad, capacidad,
reservas, dieta segura, eventos privados ni servicios. El criterio no es una garantía de
adecuación comercial; evita un subconjunto concreto de relleno.

## Marcado de zona

`optionZoneNotice` reutiliza la comprobación estricta F2, que compara barrios/componentes
completos y no hace match con una calle como “Av. Belgrano”.

- Sin zona pedida o con coincidencia clara: `outside_zone:false`, `zone_notice:""`.
- Sin coincidencia y con barrio reconocido informado por Google:
  `outside_zone:true`, “Puede quedar fuera de la zona exacta.”
- Sin coincidencia y sin barrio reconocido:
  `outside_zone:true`, “Zona a confirmar.”

La bandera también incluye incertidumbre: no prueba que un lugar esté físicamente afuera.
El aviso no afirma cercanía, distancia ni inventa barrio. Si todas están fuera o inciertas,
todas llevan aviso y se ofrece coordinación. Si hay tres adecuadas locales, las externas
quedan detrás y no desplazan las locales.

## Mensajes y frontend

El endpoint agrega un objeto `fallback` con:

- `message`: “Encontramos 1 opción que encaja con tu pedido.” o
  “Encontramos 2 opciones que encajan mejor con tu pedido.”
- Para cero: “No encontramos opciones suficientemente buenas. Podemos ayudarte
  a coordinarlo manualmente.”
- `outside_zone_message`: “Algunas opciones pueden quedar fuera de la zona exacta.”
- `manual_coordination`: true con menos de tres o si se muestran alternativas externas/inciertas.

El panel deriva esos mismos textos cerrados de la lista en memoria, con test de igualdad
contra el backend. Se agrega aviso por tarjeta, sin razones de ranking F3 ni textos nuevos
sobre precio/disponibilidad/capacidad. Se reutilizan clases existentes: no hay cambios CSS.
Un contenedor de tarjetas conserva sus índices de CSS y disposición, aunque haya aviso arriba.

El título usa “1 forma”, “2 formas” o las “3 formas” anteriores según la cantidad. Con cero:
“Busquemos otra forma.” Durante carga/error usa “Tus opciones para este plan.”
Esto evita prometer tres opciones cuando se muestran menos. No se cambia el render de
restricciones obligatorias ni sus controles F4.

“Coordinar con LISTO” enlaza al WhatsApp público existente, con texto genérico:
“Hola LISTO. Quiero ayuda para coordinar un plan.” El usuario inicia el contacto; no se
precargan prompt, nombres, teléfonos, alergias, comentarios ni datos Google. No se manda
un mensaje automáticamente. No se inventa una opción/selección/inquiry para habilitar ese canal.

## Clientes antiguos

`category=restaurantes/bares/salones` sigue admitido. Para el filtro se mapea internamente a
dinner/bars/venues; no se cambia la query antigua ni los datos de respuesta usados por esos
clientes. `options` sigue siendo un array y los campos anteriores permanecen.

Los clientes que mandan category pueden ignorar las nuevas banderas, por lo que sólo reciben
candidatos con coincidencia clara de zona, si pidieron zona. Así no se les muestra una opción
externa sin aviso visual. Pueden recibir menos de tres/cero sin romper; un JS viejo conserva
su mensaje y botón anterior de ajustar el plan. Para ver el nuevo CTA manual debe cargar el JS
actual. Sin zona pedida no se restringe por ubicación.

## Costos, privacidad y compliance

No hay segunda búsqueda. Se hace una llamada Google por intento admitido, con el mismo
profile/category, query, FieldMask, idioma es, región AR y máximo 20. Todos los contadores
S2D y sus topes permanecen intactos; un fallo del presupuesto persistente frena antes de Google.
No se implementa cache, fallback abierto ni recuperación por otra consulta.

`providers-store`, option_token, selección e inquiry no cambian. El guardado existente puede
registrar los ids mínimos de candidatos que luego se filtran; sólo escribe google_place_id,
source, provider_status y last_verified_at, sin datos Google. No se guarda ranking, score,
fotos, avisos ni resultados. Los nuevos datos de opción permanecen sólo en memoria del cliente;
`savePlan` conserva su allowlist anterior. Las fotos y atribuciones siguen como antes.
La respuesta continúa `Cache-Control:no-store`. No se agregan logs ni envíos de PII a Google.

## Línea base sintética

Ejecutar `node tests/matching/f5.js`.
Snapshot: `tests/fixtures/matching/baseline-f5.json`.
Se compara contra F2 publicado, con los mismos 29 escenarios, consultas, pools y oracle.
Los snapshots históricos F6a/F1/F2 permanecen intactos y reproducibles en sus modos anteriores.

| Métrica | F2 | F5 |
| --- | ---: | ---: |
| Opciones mostradas | 70 | 68 |
| Promedio por escenario | 2,414 | 2,345 |
| Pertinencia | 90,0 % | 89,7 % |
| Relleno según oracle | 10 | 8 |
| Adecuadas omitidas hasta 3 slots | 8 | 8 |
| Adecuadas omitidas, todas las devueltas | 58 | 58 |
| Fuera de zona | 1 | 1 |
| Fuera de zona sin aviso | 1 | 0 |
| Escenarios mostrando menos de 3 | 9 | 11 |
| Escenarios vacíos | 2 | 2 |
| Búsquedas distintas | 20 | 20 |
| Textos/claims sin fuente | 0 | 0 |

La pertinencia NO mejora: cae 0,3 puntos porcentuales al retirar dos event_venue pertinentes
por tipo pero con sólo 12 reseñas, en corporativo y multi-servicio. El denominador cambia.
Se documenta la caída y no se ajusta el oracle para disimularla.

Relleno no baja a cero: el oracle puede pedir tipos más específicos que la metadata productiva,
y cuenta una alternativa externa avisada como no adecuada. Un caso queda fuera de zona con aviso,
no se elimina para fingir recuperación geográfica perfecta. No se hizo una búsqueda real.
La media baja; mostrar menos aquí es intencional y no implica que no existan opciones reales.

## Pruebas y límites

`npm run check`: OK, 12/12 funciones. `npm test`: 296 aprobados, 0 fallidos,
3 omitidos de Postgres (299 total). No se ejecutó SQL.

Se agregan tests para 0/1/2 adecuadas, filtro antes del límite, duplicados/cerrados/faltantes,
fuera de zona y Av. Belgrano, cliente viejo, mensajes y título, privacidad del link manual,
una llamada Google, firmas válidas, no-store y writes mínimos de providers.
Handlers reales de selección/inquiry se prueban con listas 1/2 y RPC stateful simulada:
replay devuelve already_applied, sin segunda creación ni segundo aviso. No es una prueba nueva
contra Postgres/producción; no se modificaron las RPC S2B anteriores.

Pruebas de Google compliance y fotos ahora tienen primaryType real en sus fixtures normales,
porque F5 ya no supone pertinencia a partir de labels. Sus assertions de firma/atribución/
no-store/persistencia siguen. El test de endpoint F2 espera dos adecuadas en vez de incluir
la opción de cinco reseñas; los tests del scoring/ranking F2 y su snapshot se mantienen.

QA local en Chromium, usando HTML/CSS reales y fixtures de opciones en memoria:
desktop 1366 px con dos opciones/aviso y mobile 390 px con cero y una opción/aviso.
Se verificaron cantidad/título/CTA, texto genérico del link, ausencia de overflow horizontal
y errores de JS en esas pantallas; se inspeccionaron capturas. No cambió diseño general.
No se abrieron contactos WhatsApp ni se llamaron servicios productivos. El flujo completo
Turnstile/Google/selección/inquiry en Preview sigue pendiente de smoke real.

## Riesgos y smoke recomendado

- El umbral 4/20 y la ausencia de tipo/datos pueden excluir lugares útiles o nuevos.
  No se dice que sean malos, sólo que no hay señales suficientes para mostrarlos automáticamente.
- Tipos pertinentes no prueban seguridad dietaria, capacidad ni servicios. F4 permanece separado.
- Barrio desconocido puede llevar aviso incluso cuando el lugar sí está en zona. No se infiere distancia.
- El canal manual requiere que el usuario use WhatsApp y luego aporte detalles voluntariamente.
- Clientes viejos ven su UI anterior; sin aviso soportado se ocultan alternativas no locales.

En Preview, antes de publicar:
1. Probar planes/zona con 0, 1, 2 y 3 opciones y confirmar títulos, mensajes y ajuste del plan.
2. Revisar aviso por tarjeta y aviso general de fuera de zona; no debe decir “cerca” ni distancia.
3. Probar “Coordinar con LISTO”: link al número existente, texto genérico, sin envío automático.
4. Elegir una opción en listas 1/2, enviar “Quiero avanzar”, volver y reenviar: una sola inquiry/aviso.
5. Revisar fotos/atribuciones, zonas válidas/invalidas, rate limits y cliente antiguo con category.
6. Confirmar que una restricción obligatoria mantiene la coordinación existente, sin resultados automáticos.

Sin migration, SQL, dependencias, endpoints nuevos, merge ni deploy. No se toca admin,
propuestas, emails, estados comerciales, Supabase, F3 ni la lógica de restricciones F4.

## Archivos de esta implementación

- `api/_lib/plan.js`, `api/plan-options.js`, `app.js`.
- `tests/matching-fallback.test.js`, `tests/matching/f5.js`, `tests/fixtures/matching/baseline-f5.json`.
- Fixtures/expectativas de regresión: `tests/google-compliance.test.js`, `tests/google-g1b.test.js`,
  `tests/photos.test.js`, `tests/matching-ranking.test.js`.
- `docs/MATCHING-F5.md`.

## Fix posterior a review: Z1, Z2 y copy N3

Z1: se usa la relación inversa del catálogo ZONE_CHILDREN. Padre Palermo admite pedidos en
Soho/Hollywood/Viejo/Chico/Las Cañitas; padre Belgrano admite R/C. Así la menor precisión
Google no produce aviso externo ni vacía al cliente category. Esto no garantiza la ubicación
exacta dentro del sub-barrio; no se cruza automáticamente entre sub-barrios hermanos.
Las subcadenas de calles y barrios distintos continúan sin coincidir.

Z2: un restaurant genérico de la respuesta de una consulta grill/vegan/cafe_brunch/baby_shower
puede pasar el filtro F5 con las mismas señales de calidad. No se cambia pertinentType ni el
comparador F2: cuando hay tipos específicos, quedan por encima del genérico dentro de la
misma zona. Si sólo hay genéricos y no coincidencias específicas, F2 conserva su fallback.
No se amplía a todos los *_restaurant en esos perfiles ni a hotel/hospital/otros tipos ajenos.
El tipo genérico no prueba parrilla, dieta vegana, brunch o aptitud para baby shower.

N3: singular sin “mejor”; mensaje cero sin “en esa zona”, tanto en API como panel.
Se hace genérico para todos los ceros sin cambiar firma del endpoint ni sus llamadas.

Los tests Z1/Z2 fallaron antes del fix y pasan después: familias completas, clientes nuevos/
antiguos, caso genérico grill por endpoint, prioridad específica, rechazo de tipos ajenos,
umbral intacto, una sola búsqueda y firmas válidas. Los snapshots F5 y F2/F1/F6a siguen
reproducibles. La línea base F5 no cambia: el mundo sintético F6a filtra por familia de tipo
según la query y no modela restaurantes genéricos devueltos a consultas parrilla/vegan ni
las siete relaciones padre/sub-barrio. Esos casos nuevos están cubiertos por tests aparte;
no se alteraron fixtures para forzar una mejora numérica.

Riesgo residual importante: 20 reseñas sigue siendo un corte rígido, especialmente para
salones/corporativo/baby shower; puede excluir opciones útiles o nuevas. No se flexibiliza en
este fix. También permanecen la incertidumbre del sub-barrio y la especialidad no confirmada
de restaurant genérico. Confirmar esto en Preview antes de publicar, sin asumir disponibilidad,
capacidad, dieta segura o servicios. El flujo de restricciones obligatorias no cambia.

Archivos del fix: api/_lib/plan.js, app.js, tests/matching-fallback.test.js,
tests/matching-ranking.test.js (expectativa geográfica padre), docs/MATCHING-F5.md.
No se modifican endpoints, consultas, Google requests, persistencia, costos ni fórmulas F2.
