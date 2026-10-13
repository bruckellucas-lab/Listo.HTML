# F3 — razones con fuente y guardianes de honestidad

Base: `98e4600463185eb79656714b6c3ceb0c193f83bb`.
Rama: `codex/f3-reasons-honesty`. Implementación para revisión; sin merge/despliegue.

## Objetivo y alcance

Agregar una ayuda breve en cada tarjeta, sin cambiar consultas, ranking, filtro F5 ni cantidades.
El endpoint agrega únicamente `reasons` a cada opción. La generación lee primaryType y ubicación
de la respuesta Google actual. No consulta Supabase ni otros servicios para crear razones.
No usa texto libre, nombre del lugar, rating/reseñas, presupuesto, invitados, fechas o contactos.

Archivos productivos: `api/_lib/plan.js`, una línea en `api/plan-options.js` y `app.js`.
No hay cambios de CSS/HTML, admin, propuestas, emails, estados, F4 ni endpoints nuevos.

## Estructura y fuentes

```json
{
  "code": "profile_type",
  "label": "Restaurante · Datos de Google Maps",
  "source": "google_maps",
  "verified": true
}
```

Campos cerrados: code, label, source, verified. Fuentes: google_maps o listo_policy.
`verified:true` sólo indica que el dato que sostiene la etiqueta está en esa respuesta Google;
NO significa proveedor verificado por LISTO, certificación, seguridad dietaria ni disponibilidad.
Las políticas de confirmación/uncertidumbre tienen verified:false.
No se muestra la palabra verified/verificado ni un badge de certificación.

| code | label permitida | source | verified |
| --- | --- | --- | --- |
| profile_type | Parrilla / Restaurante / Bar / Café / Salón / espacio / Lugar para eventos, seguidos de “· Datos de Google Maps” | google_maps | true |
| zone_match | “En [zona del catálogo] · Datos de Google Maps” | google_maps | true |
| zone_uncertain | Zona a confirmar | listo_policy | false |
| manual_confirmation | Precio y disponibilidad a confirmar | listo_policy | false |
| dietary_unverified | Preferencias alimentarias a confirmar | listo_policy | false |

La tabla de labels de zona se construye al cargar el módulo a partir del catálogo geográfico
cerrado F1. En una búsqueda se hace lookup por clave validada; no se interpola texto arbitrario
ni se envía la zona libre de un usuario a una label.

### Tipo

- steak_house/barbecue_restaurant → Parrilla.
- restaurant o *_restaurant → Restaurante, incluidos vegan/vegetarian_restaurant.
- bar/pub/cocktail_bar/wine_bar → Bar.
- cafe → Café.
- banquet_hall/wedding_venue → Salón / espacio.
- event_venue/convention_center → Lugar para eventos.
- Tipo no reconocido → no se inventa una razón de tipo.

El perfil de búsqueda no permite inventar especialidad. Un restaurant genérico que aparece
para grill conserva “Restaurante”, y uno que aparece para vegan no afirma dieta segura.
No se usa el label traducido libre de Google para construir reasons.

### Zona

Se exige una prueba compatible en el barrio estructurado o componentes completos de la
formattedAddress actual (sin componente de calle ni subcadenas flojas).
No se rescata un barrio contradictorio con texto suelto en la dirección.
Sin zona pedida, no se genera reason de zona. Fuera/incierta → Zona a confirmar.

F5 puede admitir un barrio padre para recuperar opciones. F3 NO convierte esa menor precisión
en una afirmación de sub-barrio exacto: Google “Palermo” para un pedido “Palermo Soho” genera
zone_uncertain. Google “Palermo Soho” para un pedido amplio “Palermo” puede sostener En Palermo.
Esto no cambia `zoneMatches`, los avisos ni la selección F5; sólo evita una razón demasiado precisa.

### Preferencias y confirmación

El backend incluye la política de precio/disponibilidad pendientes. No lee cotizaciones ni
propiedades reservable/capacity/availability para redactarla.

El frontend crea dietary_unverified localmente cuando `softPreferences()` tiene elementos,
sin enviar esa preferencia a Google ni añadir parámetros al endpoint. No usa detalles médicos
ni labels libres. El guard de restricciones fuertes sigue antes del render: deriva como antes
y no muestra tarjetas ni reasons automáticas. Los controles backend F4 existentes no cambian.

## Una línea visible

El panel elige:
1. Preferencias alimentarias a confirmar, si hay preferencia blanda.
2. Razón de tipo con fuente Google, si la etiqueta/código/fuente/flag están en la allowlist.
3. Zona a confirmar o política de precio pendiente, si falta una razón de tipo válida.
4. Sin línea nueva cuando un backend antiguo no entrega reasons o entrega un formato desconocido.

Se agrega un solo párrafo `card-reason`, usando la clase existente card-desc y escapado HTML.
Las razones de zona quedan disponibles en la estructura de respuesta; no se acumulan badges
ni varias líneas de reasons. La atribución y avisos fuera de zona F5 existentes se conservan.
La whitelist del frontend evita renderizar labels arbitrarias, fuentes inconsistentes y HTML.

## Guardianes estrictos F3

`tests/matching/reason-guardians.js` valida texto, estructura y prueba independiente de origen.
Una etiqueta permitida de Parrilla no pasa si el primaryType real es restaurant. Una etiqueta de
zona no pasa sin la ubicación esperada. Fuente/verified por sí solos no son evidencia suficiente.
Se rechazan campos extra, fuentes ajenas y políticas marcadas como datos confirmados.

El guard textual normaliza mayúsculas, acentos, puntuación y caracteres invisibles. Bloquea:

- apto/apta, TACC/sin TACC, celíaco/celiaco, gluten free/gluten-free, kosher, halal;
- certificado, verificado/verificar, recomendado, garantizado, confirmado;
- disponible y cualquier disponibilidad afirmada;
- reserva confirmada, reservá, reservar ahora, acepta reservas y otras formas de reserva;
- evento(s) privado(s), capacidad, hasta/entran/para X personas;
- precio desde, desde $, importes $, ARS, por persona, ideal para tu grupo.

“Confirmar” está permitido. La única excepción para disponibilidad es la frase completa
“Precio y disponibilidad a confirmar”. Agregar un claim peligroso a esa frase sigue fallando.
El formato cerrado impide aceptar otras frases aunque una variante escape a una regex.
Los fixtures F3 sólo contienen etiquetas permitidas y datos sintéticos, no claims prohibidos.

El guard histórico F6a de evidence para contratos futuros F4 sigue separado. No habilita
claims F3: el nuevo guard F3 los prohíbe aunque venga verified=true. No se cambia el oracle
histórico ni se transforma una certificación futura en una razón actual.

## Compliance, privacidad y costos

Reasons existen sólo en el JSON no-store y la memoria actual del navegador.
No se agregan campos Google a providers ni se guardan razones, ranking, resultados o fotos.
`providers-store` y `savePlan` mantienen sus allowlists. No hay nuevos logs ni PII en labels.
No se guardan originales, alergias, notas o fechas en reasons; no se usan en la Google query.
Fotos firmadas, atribuciones, option_token y su expiración permanecen iguales.
No cambian idioma es, región AR, FieldMask, máximo 20, cantidad de llamadas ni topes S2D.
No hay nueva llamada, cache, dependencia, variable o migration.

## Validación

`npm run check`: OK, 12/12 funciones.
`npm test`: 304 aprobados, 0 fallidos, 3 omitidos de Postgres (307 total).
No se ejecutó SQL ni se usaron servicios productivos.

Tests nuevos:
- Seis clases de lugar con etiqueta/fuente exactas y política pendiente.
- Zona exacta, padre/sub-barrio, dirección sin barrio y Av. Palermo, zona ajena/no pedida.
- Todos los claims pedidos, variantes mayúsculas/acentos/guiones/invisibles y claims mezclados.
- Fuente/tipo/zona/flag falsos, extras y labels HTML no renderizadas.
- Preferencia blanda local; celiaquía/kosher/alergias, 20/50/120 invitados, budget/fecha/hora
  no se convierten en aptitud, capacidad, precio o disponibilidad.
- Rating y reseñas no cambian ninguna razón ni producen “popular/recomendado/mejor”.
- Renderer real: una línea, 0/1/2, guard de restricciones fuertes y backend antiguo.
- Endpoint real con servicios simulados: reasons válidas, misma Google query, una llamada,
  no-store, token válido y sólo los cuatro campos mínimos en provider writes.
- Todas las 68 opciones sintéticas F5 pasan el guard de fuente y textos F3.
- Suite completa: selección/inquiry/replay, firmas/fotos/atribuciones, G/S2D/S2E/F1/F2/F5.

QA local Chromium con HTML/CSS reales y fixtures: desktop 1366 px con dos opciones y aviso,
mobile 390 px con 0/1/2 y preferencias blandas. Una reason por tarjeta, sin overflow horizontal
ni errores JS en esas pantallas; capturas inspeccionadas. No es un smoke de Google/producción.

## Métricas y riesgos

No se modifica baseline: F5 sigue reproducible y mantiene 68 opciones, pertinencia 89,7 %,
relleno 8, omitidas hasta tres 8 y fuera de zona sin aviso 0. F3 no selecciona ni reordena.
El test recorre las 68 opciones y verifica todas sus razones contra el dato Google sintético.
Eso comprueba el contrato, no que Google sea infalible ni que un lugar cumpla requisitos.

- PrimaryType y ubicación pueden ser imprecisos; la fuente se explica, no se certifica calidad.
- Barrio padre no demuestra el sub-barrio exacto; se evita esa afirmación en reasons.
- Restaurant genérico no prueba parrilla/veggie/brunch; tampoco capacidad ni servicios de evento.
- El corte F5 de 20 reseñas permanece, con el riesgo para salones/corporativo/baby shower.
- verified es metadata de dato/fuente, no acreditación. No debe reutilizarse como badge de aprobación.
- Backend viejo sin reasons funciona; frontend viejo ignora el campo adicional.
- Guardianes cubren las etiquetas nuevas, no censuran nombres/textos Google existentes ni el
  flujo F4 previo. No se amplían certificaciones, fuentes persistentes o verificación alimentaria.

## Smoke recomendado en Preview

1. Cena, asado, bar, café y evento: una línea genérica con Datos de Google Maps y datos reales.
2. Generic restaurant en consulta de parrilla/vegan: no afirmar especialidad/dieta segura.
3. Preferencia suave: Preferencias alimentarias a confirmar; fuerte: coordinación como antes.
4. Palermo Soho con Google Palermo: no inventar exactitud del sub-barrio en la estructura de reason.
5. Listas 0/1/2, fuera de zona, fotos/atribución y mobile; UI antigua no debe romper.
6. Elegir opción, Quiero avanzar, volver/reintentar: una sola solicitud/aviso.

## Archivos

api/_lib/plan.js, api/plan-options.js, app.js, docs/MATCHING-F3.md,
tests/reasons-honesty.test.js, tests/matching/reason-guardians.js,
tests/fixtures/matching/f3/reasons.json, tests/matching-fallback.test.js,
tests/matching-ranking.test.js. Los dos últimos sólo adaptan helpers/expectativa al campo nuevo.
