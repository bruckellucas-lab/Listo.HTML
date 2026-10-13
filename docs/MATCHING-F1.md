# F1 — perfiles cerrados de búsqueda

Base: `4a25396280341305857d8bdc0834518082db7f7b`. Rama: `codex/f1-matching-profiles`.

## Cambio productivo

El navegador decide un id cerrado usando tipo, necesidades, invitados y selección veggie.
El servidor valida ese id y construye la consulta con una frase fija y una zona conocida.
No interpola prompt, alergias, notas, presupuesto ni contactos. Tampoco usa parámetros
`textQuery` o `includedType` enviados por el cliente. No cambia el ranking, estados,
selección, solicitudes, admin, emails, límites de costos ni persistencia.

| Perfil | Detectado en el panel | Frase fija de búsqueda |
| --- | --- | --- |
| grill | Asado/parrilla | parrillas |
| baby_shower | Baby shower | lugares para baby shower |
| corporate | Corporativo | salones para eventos corporativos |
| after_office | After office | bares para after office |
| romantic | Cena romántica/aniversario | restaurantes para cena romantica |
| cafe_brunch | Café/brunch/merienda | cafes y brunch |
| vegan | Selección vegana/vegetariana o tipo explícito | restaurantes veganos |
| multi_service | Dos o más necesidades entre música, deco, torta y fotos | salones para eventos |
| celebration | Cumple/fiesta con menos de 40 invitados | salones para celebraciones |
| venues | Categoría previa salones, incluidos eventos grandes | salones para eventos |
| bars | Categoría previa bares | bares |
| dinner | Resto de planes | restaurantes |

Las reglas se evalúan en ese orden. El número de invitados orienta el tipo de búsqueda,
no garantiza capacidad. La preferencia veggie orienta la consulta, no certifica dieta segura.
El bloqueo de restricciones obligatorias anterior a la búsqueda permanece intacto (F4 no cambia).
Un pedido de varios servicios sigue buscando un lugar; no promete que brinde esos servicios.

`primaryTypes` son metadata interna para etapas futuras; no se usan para ordenar ni filtrar
las tarjetas en F1. No se usa `includedType`: mantenemos la consulta textual sin introducir
filtros de tipo que puedan excluir lugares útiles antes de medirlos en Google real.
No hay fallback automático a otra consulta: no se multiplican llamadas por búsqueda.

Ejemplo: `grill` + ` PÁLERMO ` → `parrillas en palermo, Buenos Aires`.
La zona vacía busca en Buenos Aires. Se admiten todos los barrios/localidades del catálogo
actual del frontend, incluyendo Rosario, Córdoba y otras ciudades. Fuera de Buenos Aires
no se agrega ese sufijo. Las zonas desconocidas, datos de contacto o tipos no-string reciben
400 humano antes de contadores/Google; no se truncarán a una zona reconocida.
Esto restringe zonas escritas manualmente que antes pasaban sin validación de catálogo.

Sin `profile` se aceptan `restaurantes`, `bares` y `salones`, conservando sus frases anteriores.
Si `profile` está presente pero es inválido/vacío, se rechaza; no cae a la categoría.
La validación de zona se aplica también a clientes antiguos para evitar texto libre a Google.

## Costos, privacidad y compliance

`search_repeat` usa `profile|zona normalizada` en búsquedas nuevas y `category|zona normalizada`
en clientes antiguos. Sólo la HMAC, con IP y scope como antes, llega al contador persistente.
Tests interceptan la RPC real: tercera búsqueda idéntica devuelve 429 antes de Google,
variaciones de acentos/espacios comparten clave y un perfil distinto tiene otra clave.
No cambian 2/10 segundos, 200/hora ni 1000/día. Sin contador persistente no se llama a Google.

Los alias antiguos y perfiles con consultas equivalentes pueden consumir contadores de repetición
separados. Los topes globales y diarios siguen compartidos; no es un límite global contra atacantes
distribuidos. La diversidad de perfiles puede aumentar el consumo normal, sin aumentar los topes.

Se conservan `es`, `AR`, máximo 20 resultados, `no-store`, atribuciones, fotos firmadas y
`option_token`. Un test de resultado no vacío verifica el token y el POST mínimo de providers:
únicamente `google_place_id`, `source`, `provider_status`, `last_verified_at`.
No se guardan resultados, ranking, fotos ni nombres Google. No se agregan logs ni textos de tarjeta.

## Medición sintética reproducible

Ejecutar `node tests/matching/f1.js`. Snapshot: `tests/fixtures/matching/baseline-f1.json`.
Se extrae `chooseProfile` real del panel y se usan los constructores y ranking productivos.
Se compara con la categoría previa, sin cambiar escenarios, tipos, ratings ni pools F6a.
El adaptador representa la nota explícita “preferencia vegana” del fixture como el campo
`diet.on.vegan` y nivel suave que usa el panel; no usa las etiquetas de pertinencia para decidir
perfiles. Antes y después reciben ese mismo dato. También renombra seis barrios ficticios a localidades válidas para que el contrato
cerrado no requiera aceptar zonas inventadas en producción. El escenario `en Marzo` representa
rechazo sin búsqueda (request vacío en el simulador); el endpoint verifica el 400 por separado.
El arnés F6a original y su snapshot se conservan sin cambios de métricas.

| Métrica (29 escenarios) | Antes | F1 |
| --- | ---: | ---: |
| Opciones mostradas | 74 | 70 |
| Pertinencia | 62,2 % | 88,6 % |
| Relleno | 29 | 9 |
| Adecuadas omitidas, hasta 3 slots | 14 | 7 |
| Adecuadas omitidas, todas las devueltas | 62 | 57 |
| Fuera de zona sin aviso | 1 | 1 |
| Escenarios con menos de 3 adecuadas disponibles | 13 | 10 |
| Escenarios mostrando menos de 3 | 7 | 9 |
| Búsquedas distintas | 12 | 20 |
| Pares de planes con listas idénticas no vacías | 88 | 27 |
| Escenarios no vacíos idénticos entre usuarios | 27 | 27 |
| Claims/textos sin fuente | 0 | 0 |

Meta de omisiones de esta etapa: no empeorar slots omitidos contra la base (14); F1 da 7.
Se cumplen pertinencia >=80 % y relleno <=10, pero NO cero fuera de zona sin aviso.
No se introducen razones visuales. La falta de personalización dentro del mismo plan persiste.

Estos números son sintéticos: el mundo responde por familias de términos, no predice Google.
No demuestra mejoras reales en romantic/corporate/cafe_brunch, cuyas consultas más específicas
pueden conservar la misma familia sintética o no tener resultados. Las adecuadas disponibles
se miden en el conjunto devuelto por cada consulta, no en todo el universo de Google.
El rechazo de una zona inválida no demuestra calidad de recuperación geográfica.
Las metas pendientes necesitan etapas posteriores de ranking/zona, fuera de F1.

## Validación y smoke recomendado

`npm run check`: 12/12 funciones. `npm test`: 268 aprobados, 0 fallidos, 3 omitidos (271 en total).
Tres tests Postgres siguen omitidos por falta de `LISTO_TEST_DATABASE_URL`; no se ejecuta SQL.
No migration, dependencias, endpoints nuevos ni despliegue.

En Preview, antes de aprobar publicación:
1. Crear asado, cena, baby shower, cumple de 25 y plan con música/deco/torta/fotos en Palermo.
   Verificar `profile` enviado y, con inspección autorizada del request, consultas cerradas.
2. Probar preferencia vegana sin afirmar certificaciones; verificar que una restricción obligatoria
   conserva el flujo de coordinación anterior.
3. Probar Rosario y una zona desconocida. La primera busca sin sufijo Buenos Aires;
   la segunda muestra mensaje humano sin llamada facturable.
4. Repetir una búsqueda tres veces en menos de diez segundos: tercera limitada. Esperar y reintentar.
5. Elegir opción firmada y enviar “Quiero avanzar”; volver y reenviar sin duplicar solicitud.
6. Verificar fotos/atribuciones y clientes antiguos con `category=restaurantes`.

No se probaron Google real ni producción. Mantener pendientes los guardianes F3 de honestidad,
ranking F2 y restricciones fuertes F4. No reformatear F6a completo en este cambio.
