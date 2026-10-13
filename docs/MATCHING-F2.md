# F2 — ranking interno con señales disponibles

Base publicada: `a35378d680883e30cd29cd52b8d6e8f57eecc9b2`.
Rama: `codex/f2-ranking-scoring`. No SQL, migration, dependencias ni endpoints nuevos.

## Alcance y conexión al endpoint

`api/_lib/plan.js` recibe un quinto argumento opcional en `pickOptions`:
`{profile, placesById}`. El endpoint pasa el perfil ya validado y su mapa de la respuesta
Google actual. Ese cambio de una línea es necesario: las filas convertidas no contienen
el `primaryType` original y una etiqueta traducida no sirve como señal de tipo.

No se modifica la consulta ni su máscara (ya pedía `primaryType`). No se agrega `includedType`,
semilla, campo público, texto visual, log, cache ni escritura. `providers` sigue escribiendo
sólo los cuatro campos mínimos existentes. Los scores y tipos se usan en memoria y no se
incluyen en el JSON de las opciones. El perfil y los presupuestos S2D permanecen iguales.
No se toca `app.js`, admin, propuestas, emails, estados comerciales ni Supabase.

## Orden y fallback

Primero se excluyen cerrados, ids inválidos/vacíos, nombres vacíos y duplicados por id/nombre
como antes. Entre candidatos utilizables:

1. Coincidencia clara de zona, primero.
2. `primaryType` pertinente según el catálogo y las familias descritas abajo, primero.
3. Calidad ajustada por reseñas, mayor primero.
4. Ante igualdad, más reseñas; al final, orden original Google.

El orden es por prioridades, no una suma de puntos de unidades distintas. Un lugar local
no pertinente puede quedar antes que uno pertinente fuera de zona: se evita desplazar una
opción local por otra distante. Esto no certifica que las opciones sean ideales ni adecuadas
para capacidad, dieta, privacidad o servicios. El fix de review amplía la pertinencia sin cambiar ninguna consulta F1.
Dinner admite `restaurant`, cualquier `*_restaurant` y `steak_house`; romantic admite
`restaurant`, cualquier `*_restaurant` y `wine_bar`. Corporate incluye `event_venue`,
`convention_center` y `banquet_hall`. Los demás perfiles mantienen sus tipos explícitos.

Si no hay perfil válido, no hay datos de tipo o ningún candidato utilizable coincide con
los tipos del perfil, se conserva el ranking anterior (zona, umbral 20 reseñas, rating,
cantidad de reseñas, orden Google). Las categorías antiguas usan ese fallback.
También se aplica la comprobación más estricta de zona en el fallback.
Un match presente sólo en una fila cerrada/descartada no activa el scoring.

No se eliminan opciones por score ni por ausencia de pertinencia. Se siguen devolviendo
hasta tres candidatos únicos utilizables, incluso si sólo hay opciones fuera de zona.
La política de mostrar menos por calidad queda fuera de F2.

## Fórmula de calidad

`Q = (v × r + 50 × 4,0) / (v + 50)`

`r` es el rating informado por Google; `v`, la cantidad informada de reseñas.
4,0 es un prior fijo de diseño y 50 su peso, no un promedio real inferido de Google.

Ejemplo, con ambos lugares pertinentes y en la misma zona:

- 4,9 con 5 reseñas: Q ≈ 4,082.
- 4,6 con 2000 reseñas: Q ≈ 4,585.

La segunda opción gana, sin cambiar ni presentar al usuario su rating original.
Rating ausente/no finito/fuera de 0..5 o reseñas ausentes/no enteras seguras/no positivas
producen score desconocido (`null`). Dentro de la misma zona/tipo, un score conocido precede
al desconocido. No se inventan ratings ni reseñas para completar la respuesta.

Este ajuste opera dentro de cada grupo zona/tipo. Un tipo pertinente con pocas reseñas
puede preceder a uno no pertinente muy reseñado; no es un umbral de calidad obligatorio.
En el fallback sin tipos se conserva la fórmula/orden anterior, por compatibilidad.

## Coincidencia geográfica

Se normalizan acentos, espacios, sufijos admitidos y alias Capital/CABA.
El barrio estructurado informado por Google tiene prioridad: si contradice la zona buscada,
no se rescata por encontrar esa palabra en una dirección.

Se acepta barrio exacto, o subzona explícita conocida: Palermo incluye Viejo/Soho/Hollywood/
Chico/Las Cañitas; Belgrano incluye R/C. La relación es direccional: Palermo Soho no se
confirma con un genérico Palermo. Capital/CABA admite barrios oficiales y alias de CABA,
no localidades GBA.

Sin barrio estructurado se comparan componentes completos de la dirección separados por
coma, omitiendo el primer componente de calle y quitando un código postal al comienzo.
`Av. Palermo 1500, Belgrano, CABA` no coincide con Palermo.
`Gorriti 123, C1414 Palermo, CABA` sí. `SuperPalermo`, `Palermoide` y `Palermo Bar` no.

No se usa geocoding, coordenadas, distancia ni expansión a localidades vecinas.
Direcciones sin componentes claros pueden perder la coincidencia; este comportamiento es
conservador. Alias como Once/Abasto/Barrio Norte conservan su identidad: no se adivina una
correspondencia más amplia con barrios oficiales. El aviso visual de fuera de zona queda en F5.

## Variedad

Pendiente. `/api/plan-options` no transporta un identificador estable de evento/pedido.
No se agregó un parámetro, almacenamiento, uso de PII ni aleatoriedad para resolverlo.
Ante empate exacto se conserva el orden Google, determinista para la misma respuesta.
Esto no garantiza el mismo orden si Google cambia la respuesta de una recarga.
La cantidad de escenarios idénticos entre usuarios sintéticos sigue siendo 27.

## Medición sintética reproducible

Ejecutar `node tests/matching/f2.js`; snapshot `tests/fixtures/matching/baseline-f2.json`.
F2 compara contra el snapshot F1 publicado, sin reescribirlo. Usa las mismas consultas,
los mismos 29 escenarios, pools, ratings y tipos. El adaptador utiliza el `pickOptions`
productivo con perfil y mapa de lugares, igual al endpoint.

Se agregó un hook de picker y dos exports al adaptador F1 para reutilizar el mundo sintético,
sin duplicar consultas ni clasificación. Sin ese hook, F1 sigue en modo legacy: su snapshot
y los de F0/F6a son históricos, no la predicción del endpoint actualizado.

| Métrica | F1 publicado | F2 |
| --- | ---: | ---: |
| Opciones mostradas | 70 | 70 |
| Pertinencia | 87,1 % | 90,0 % |
| Relleno | 10 | 10 |
| Adecuadas omitidas hasta 3 slots | 8 | 8 |
| Adecuadas omitidas, todas las devueltas | 58 | 58 |
| Fuera de zona / sin aviso | 1 / 1 | 1 / 1 |
| Búsquedas distintas | 20 | 20 |
| Pares de planes con listas idénticas no vacías | 26 | 18 |
| Textos/claims sin fuente | 0 | 0 |

No mejoran todos los escenarios:

- `aniversario-palermo`: luego del fix vuelve al resultado F1: pertinencia 1, relleno 2
  y omisiones hasta tres 2. Antes del fix daba pertinencia 0 y omisiones 3. Aceptar todas las
  cocinas elimina la exclusión de francés, sin certificar que sea apropiado para un aniversario.
- `corporativo-50-palermo`: relleno 0→1 y omisiones hasta tres 0→1.
  Un `event_venue` con 12 reseñas entra por tipo sobre otro tipo no corporativo más reseñado;
  el oracle cuenta como adecuada sólo una opción con al menos 20 reseñas y rating >=4.

Son tradeoffs explícitos, no pruebas de que los restaurantes genéricos sean románticos ni
que un salón poco reseñado sea confiable. La metadata se amplió por el caso real de review; el oracle y los fixtures no se cambiaron.
El total mejora, pero requiere review y medición real antes de publicar.
Las adecuadas disponibles se cuentan en cada respuesta, no en todo Google. No se hizo una
búsqueda real ni un smoke en producción. Sigue pendiente la meta cero fuera de zona sin aviso.

## Pruebas

- Tipos reales frente a labels engañosos; mejores pertinentes por calidad.
- Fallback sin tipos, sin match, perfil inválido y match sólo en cerrados.
- Zonas exactas/alias/subzonas, subcadenas peligrosas, calles y contradicciones.
- 4,9/5 contra 4,6/2000; faltantes y valores inválidos; no mutación ni datos inventados.
- Determinismo para la misma respuesta, dedupe/cerrados y hasta tres candidatos.
- Endpoint real con Google/Supabase simulados: orden F2, cliente antiguo, firmas válidas,
  `no-store`, query es/AR/20 intacta y escritura mínima sin score/tipo/ranking.
- Snapshot F2 y metas; queries e includedType idénticos a F1.
- Suite completa G/S2D/S2E/F1/selección/inquiry y flujos comerciales anteriores.

`npm run check`: OK, 12/12 funciones. `npm test`: 285 aprobados, 0 fallidos,
3 omitidos de Postgres (288 total). No se ejecutó SQL ni se usaron servicios externos reales.

## Smoke recomendado en Preview

1. Comparar asado, cena de dos, cumple chico con comida/tragos, cumple de 30 con lugar y baby shower.
2. Verificar que lugares de tipo pertinente en zona precedan a otros de rating alto pero tipo distinto.
3. Revisar un lugar con pocas reseñas frente a uno con muchas; confirmar ratings originales sin textos nuevos.
4. Probar barrio/sufijos/alias F1 y una búsqueda con pocos resultados; revisar manualmente zona real.
5. Recargar, elegir opción firmada y enviar “Quiero avanzar”; verificar que no se duplique la solicitud.
6. Verificar clientes viejos con `category` y rate limits actuales; restricciones obligatorias siguen coordinadas.

No tocar todavía F3 razones, F4 restricciones, F5 avisos/menos de tres ni variedad por pedido.

## Fix obligatorio posterior a review

El caso A/B/C/D (restaurant 4,1/30; sushi 4,8/900; pizza 4,7/2000; steak 4,6/3000)
se reprodujo con test fallando antes del cambio. Ahora el top tres es B/C/D: sushi, pizza,
steak, todos pertinentes y ordenados por la fórmula bayesiana. Se agregaron tests de familias,
exclusión de tipos ajenos, wine_bar romántico y banquet_hall corporativo.

Contra F2 inicial: pertinencia 91,4 %→90,0 %, relleno 9→10 y omisiones hasta tres 7→8.
Son cifras sintéticas; la corrección semántica amplía cocinas legítimas y el oracle de algunos
escenarios no considera todas ellas pertinentes. Se versiona el snapshot completo sin maquillar
esa diferencia. Contra F1 se mantiene la mejora de pertinencia y no empeoran las metas agregadas
restantes. No hay cambios en consultas, zona, fórmula, fallback, endpoints, UX ni persistencia.
