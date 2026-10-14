# F6B — cierre de matching y checklist beta

Base revisada: `667530e0ef6dbf7a92a1c26c30cab4cf17f43d67`.
Rama: `codex/f6b-final-matching-closure`.

## Resultado y alcance

Sin regresiones detectadas en la suite F1/F2/F5/F3/F4A. Cierre técnico de F para una beta
controlada; F4B queda diferido. Esto no sustituye smoke real, revisión legal ni preparación
de la operación manual. No se probó Google, Supabase, Resend ni producción en esta tarea.

Sólo se agregan dos tests de regresión, una assertion al test bayesiano existente y este
documento. No se modifica código productivo, fixtures, snapshots, UX, matching, ranking,
cantidades, request Google, persistencia, endpoints ni topes. No hay SQL, migration ni dependencias.

## Invariantes y evidencia

| Etapa | Invariantes comprobados | Tests |
| --- | --- | --- |
| F1 | Perfiles cerrados; consultas armadas en servidor; 48 barrios CABA, alias principales, localidades y sufijos admitidos; basura rechazada sin Google. Cliente antiguo `category=restaurantes/bares/salones` sigue funcionando. | `matching-profiles.test.js`: F1, B1, O1 y O2. |
| F1/F5 zonas | Palermo y sub-barrios; Belgrano R/C y barrio padre; categoría antigua Palermo y Palermo Soho conserva opciones locales. Av. Belgrano no prueba barrio Belgrano, ni una calle prueba Palermo. Hermanos no se confunden. | `matching-ranking.test.js`, `matching-fallback.test.js`: geografía y Z1. |
| F2 | Zona clara → tipo pertinente → calidad bayesiana; 4,9/5 no supera 4,6/1000 ni 4,6/2000. Dinner admite `*_restaurant` y steak_house; romantic admite `*_restaurant` y wine_bar; corporate admite banquet_hall. No se modifica el rating mostrado ni se guarda score. | `matching-ranking.test.js`: ranking, familias, A/B/C/D, sin mutación y endpoint. |
| F5 | 0/1/2/3 sin completar con descartados; filtro antes del top tres; externos/inciertos llevan aviso. Cliente antiguo no recibe externos si pidió zona, porque puede ignorar las banderas nuevas. | `matching-fallback.test.js`: filtro, endpoint, externos, cliente antiguo y renderer. |
| F5 flujo/costos | Una búsqueda Google por intento admitido, sin segunda búsqueda. Tokens válidos con 1/2 opciones, selección y Quiero avanzar con replay sin segunda inquiry/email. WhatsApp del fallback usa texto genérico sin PII. | `matching-fallback.test.js`, `matching-profiles.test.js`, `cost-abuse.test.js`, `recovery.test.js`. |
| F3 | Razones cerradas por dato actual de tipo/zona; no se usan prompt, comentarios, alergias, contactos, rating, invitados o presupuesto para redactarlas. Lista blanca exacta en frontend; metadata `verified` no es badge visible ni verificación de proveedor. | `reasons-honesty.test.js`, nuevo `matching-closure.test.js`. |
| F3 geografía | Admitir Palermo para Soho en F5 no autoriza afirmar “En Palermo Soho” en F3. La razón expresa incertidumbre cuando el dato sólo demuestra el barrio padre. | `reasons-honesty.test.js`: padre/sub-barrio y fuente de zona. |
| F4A | Bloqueos de dieta/salud, privado/exclusivo, ideal/recomendación/mejor/popular, barato/accesible/precio, disponibilidad, reservas, capacidad y certificación. Las etiquetas actuales y las dos políticas de confirmación siguen pasando. | `reasons-honesty.test.js`, `matching/reason-guardians.js`. |
| G/S | no-store; Google request actual sin texto libre del usuario; firma de opciones/fotos y atribuciones; providers sólo tiene escritura de google_place_id y datos LISTO. No se guardan reasons, ranking, score, resultados ni fotos. | `google-compliance.test.js`, `google-g1b.test.js`, `photos.test.js`, `matching-quality.test.js`, tests de endpoint F1/F2/F3/F5 y `security.test.js`. |
| S2D/S2E | search_repeat alineado a perfil/categoría y zona normalizada; topes intactos; fallo de presupuesto persistente corta antes de Google; logs privados y allowlists de memoria/persistencia se mantienen. | `matching-profiles.test.js`, `cost-abuse.test.js`, `json-private-logs.test.js`, `privacy-memory.test.js`, `security.test.js`. |

No se duplicaron las pruebas existentes. Se agregaron sólo estos huecos:

1. Ejecutar `runSearch` real del frontend junto con su transformación real de restricciones:
   kosher, halal, celiaquía, alergia, gluten por celiaquía y preferencias marcadas obligatorias.
   Debe cortar antes de calcular perfil, preparar la búsqueda o llamar fetch; descarta opciones
   cacheadas, conserva la derivación a render y termina el estado de carga.
2. Ejecutar la lista blanca visible real contra código/fuente/flag falsos, strings en lugar
   de booleanos, ausencia de flag, cambios de mayúsculas, sufijos y HTML. Etiquetas permitidas
   siguen pasando; no se renderiza metadata `verified`.
3. El test bayesiano existente ahora comprueba también exactamente 4,6 con 1000 reseñas,
   además del caso previo con 2000.

Los tests existentes de requirements y renderer comprueban el otro lado del corte: coordinación
con restricciones fuertes y bloqueo backend de selección/inquiry, sin solicitud ni email.
La RPC se simula en tests de flujo; no se afirmaron carreras reales de Postgres en esta tarea.

## Métricas sintéticas finales F2 → F5

Mismos 29 escenarios, mundo y oracle. Snapshots históricos intactos.

| Métrica | F2 | F5 final, también tras F3/F4A/F6B |
| --- | ---: | ---: |
| Opciones mostradas | 70 | 68 |
| Pertinencia | 90,0 % | 89,7 % |
| Relleno según oracle | 10 | 8 |
| Adecuadas omitidas hasta tres slots | 8 | 8 |
| Adecuadas omitidas entre todas las disponibles | 58 | 58 |
| Fuera de zona | 1 | 1 |
| Fuera de zona sin aviso | 1 | 0 |
| Escenarios con menos de tres adecuadas disponibles | 10 | 10 |
| Escenarios mostrando menos de tres | 9 | 11 |
| Escenarios vacíos | 2 | 2 |
| Búsquedas distintas | 20 | 20 |
| Planes idénticos entre usuarios del mismo escenario | 27 | 27 |
| Promedio de opciones por escenario | 2,414 | 2,345 |

Se cumplen las metas sintéticas iniciales: pertinencia ≥80 %, relleno ≤10 y cero externos
sin aviso. No equivale a esa calidad en Google real. F5 retira dos event_venue con 12 reseñas,
por eso cae 0,3 puntos la pertinencia; no se ajusta el oracle para ocultarlo. Hay relleno y
omisiones residuales, y el matching no personaliza entre usuarios con el mismo perfil/zona.

El reporte histórico F5 conserva reasons vacías; sus contadores de razones en cero no miden
el render F3. La suite F3 recorre por separado las 68 opciones y contrasta cada razón con
tipo/zona sintéticos, sin claims peligrosos. F4A añade familias prohibidas y variantes normalizadas.

Reproducir reportes con `node tests/matching/f2.js` y `node tests/matching/f5.js`.
La suite exige igualdad exacta con ambos snapshots, no sólo estos agregados.

## F4B diferido y seguro

No se implementan dieta verificada ni un flujo nuevo de proveedores verificados. Los helpers
alimentarios históricos no habilitan recomendaciones automáticas ni constituyen el producto F4B.
Google aporta tipo/ubicación, nunca acredita dieta, alergias, certificaciones ni seguridad.

Hoy cualquier restricción fuerte confirmada deriva a coordinación manual, con cero opciones
automáticas en el flujo normal. El backend también rechaza selección/inquiry para un pedido
guardado con restricciones fuertes. El endpoint genérico de búsqueda no recibe ni consulta
restricciones de un pedido: ese corte está en frontend y al intentar guardar selección/inquiry.
El flag `verified:true` de una reason sólo respalda ese dato Google actual.

No mostrar sin TACC, kosher, apto, vegano seguro, alérgenos o sin lactosa como propiedades
comprobadas del lugar. Las etiquetas de requisitos del usuario y la pantalla manual existentes
pueden nombrar esas restricciones; no son certificaciones de un proveedor.

F4B necesita decisión de producto/proveedores, fuentes de evidencia, atributos realmente
verificados y vigentes, responsables de revisión y manejo de vencimientos. Puede requerir
SQL/admin en una etapa propia. No se agregan aquí tablas, atributos, badges ni excepciones.

## LISTO puede hacer en beta

- Buscar opciones reales en Google y ordenar por zona, tipo y señales de reseñas.
- Mostrar menos de tres cuando faltan candidatos con señales suficientes.
- Avisar alternativas fuera de zona o con ubicación incierta.
- Explicar con razones seguras y fuente, sin certificar calidad o aptitud.
- Derivar restricciones fuertes a coordinación manual.
- Recibir inquiry y permitir seguimiento/coordinación manual.

## Inventario de cosas que LISTO NO promete todavía

Disponibilidad, precio final, reserva confirmada al elegir o enviar inquiry, capacidad real,
aptitud dietaria, kosher/sin TACC/alergias, proveedor verificado, espacio/evento privado,
fotos perfectas ni pago integrado. Elegir una opción o pedir avanzar expresa interés;
la confirmación comercial posterior exige su proceso existente, no la búsqueda automática.

## Pendientes no bloqueantes y riesgos para beta

- Fotos Google: pueden ser imprecisas o no representar bien el local; no se garantiza coincidencia.
- Copy plural: sigue “Encontramos 2 opciones que encajan mejor con tu pedido”. El singular ya
  no dice “mejor”. No se aplica copy nuevo aquí.
- Romántica: `fast_food_restaurant` pertenece a la familia admitida `*_restaurant` y puede
  pasar el filtro. Confirmado con candidato sintético; no se promete ambiente romántico.
- Alias menores: Paternal, Pompeya y Belgrano R. siguen rechazados. Funcionan La Paternal,
  Nueva Pompeya y Belgrano R. Se revisarán en una tanda acotada, sin ampliar a texto libre.
- Umbral rating ≥4 y ≥20 reseñas: puede excluir opciones útiles/nuevas, especialmente
  salones, corporativo y baby shower. Medir con resultados reales antes de flexibilizarlo.
- Tipo restaurant genérico no prueba parrilla, brunch ni dieta; los avisos no confirman servicios.
- Fuera de zona incluye incertidumbre, y barrio padre no demuestra sub-barrio exacto.
- F4A es un guard de tests, no un filtro semántico universal ni censura de nombres Google.
- F4B, base real/relación con proveedores y operación de verificación quedan pendientes.
- Legal mínimo: comprobar textos vigentes, consentimiento y canales de contacto antes de abrir
  beta; no se hizo una revisión legal en F6B.
- Operación manual: responsable, horarios, seguimiento de inquiries y explicación de límites.
- WhatsApp F5 de fallback es genérico. La derivación dietaria existente `renderSensitive` arma
  un link con el pedido y requisitos, incluidos detalles de alergia si existen. No se envía
  automáticamente, pero al abrirlo se comparte ese contexto con WhatsApp. No afirmar que todos
  los links manuales carecen de información sensible; revisión de privacidad fuera de F6B.
- Los presupuestos S2D pueden generar latencia o cortar servicios al agotarse; no se alteran.

## Checklist previo a beta y smoke recomendado

- [x] Checks locales y guardianes pasan; sólo tests/docs modificados.
- [x] Snapshots F2/F5, ranking, consultas y persistencia sin cambios.
- [x] F4B diferido explícitamente; restricciones fuertes mantienen coordinación.
- [ ] Confirmar Actions/Preview del nuevo commit externamente cuando esté disponible.
- [ ] Smoke real desktop/mobile: cena, asado, bar, corporativo y preferencia veggie.
- [ ] Palermo Soho con dato Palermo y Belgrano R con dato Belgrano: sin falso aviso externo;
      no inventar precisión del sub-barrio en reasons.
- [ ] Revisar listas 0/1/2/3 cuando ocurran, avisos y link de fallback genérico.
- [ ] Elegir y Quiero avanzar; volver sin cambiar opción y reenviar: misma inquiry, sin avisos duplicados.
- [ ] Restricción obligatoria: coordinación, cero opciones automáticas; fotos y atribución visibles
      en búsquedas sin restricción fuerte, sin badge de proveedor verificado.
- [ ] Comprobar legal mínimo y disponibilidad de operación manual.

## Validación ejecutada y archivos

`npm run check`: OK, 91 archivos/bloques y 12/12 funciones.
`npm test`: 311 aprobados, 0 fallidos, 3 omitidos de integración Postgres (314 total).
No se corrieron esos tests Postgres, SQL ni servicios externos. Los tests de API usan fetch
simulado; los de frontend ejecutan funciones reales con DOM/dependencias simulados.
Sin QA visual nueva porque no cambió UX. No es una prueba del sitio desplegado.

Archivos: `tests/matching-closure.test.js`, `tests/matching-ranking.test.js`,
`docs/MATCHING-F6B.md`. Sin cambios en fixtures ni en archivos productivos.
Sin migration, SQL, dependencias nuevas, endpoints nuevos, merge ni despliegue manual.
