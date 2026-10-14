# F4A — guardianes de honestidad antes de F4

Base: `305268005cfbf1fcc57e60a0c4d132dc3e8aa50d`.
Rama: `codex/f4a-honesty-guardians`.

## Alcance

Sólo se amplían el guard de tests F3 y sus casos de regresión. No se implementa F4,
no se cambia ninguna etiqueta permitida ni se modifica código productivo.
El render, matching, ranking, cantidades, Google request, persistencia y topes siguen iguales.

## Claims bloqueados

Se conservan los bloqueos F3 y se amplían estas familias:

| Familia | Ejemplos bloqueados | Riesgo |
| --- | --- | --- |
| Recomendación/calidad | ideal, recomendado/a/s, el/la mejor, mejor de, popular, muy popular, top, favorito/a/s, garantizado | Presentar una recomendación o garantía que los datos de Google no demuestran. |
| Privado/exclusivo | privado/a/s, salón/espacio/evento privado, exclusivo/a/s | Prometer un espacio privado o exclusividad sin confirmación del lugar. |
| Dieta/salud | vegano/a/s, vegan, vegetariano/a/s, lactosa, alérgico/a/s, alergia/s, seguro/a/s | Confundir categoría o preferencia con preparación segura o cumplimiento dietario. |
| Precio | barato/a/s, económico/a/s, accesible, buen precio | Prometer un precio o valoración económica sin cotización. |

Siguen bloqueados apto/a/s, TACC, celíaco/a/s, gluten (incluidos gluten-free y libre de
gluten), kosher, halal, certificado, verificado/verificar, disponible, disponibilidad,
formas de reserva, capacidad, hasta/entran/para X personas, precio desde, desde $,
importes $, ARS, por persona y confirmado.

## Regex y excepciones

La regex se divide en familias para poder revisar su alcance. Antes sólo detectaba
“ideal para tu grupo” y “evento privado”; ahora detecta las palabras ideal y privado
por sí solas, con sus variantes. Los otros patrones agregan dieta, seguridad y precio.
Se mantiene la normalización F3: mayúsculas, acentos, puntuación y caracteres invisibles.
Los límites de palabra evitan capturar partes de las etiquetas actuales.

“Confirmar” sigue permitido. La excepción de disponibilidad sigue siendo exclusivamente
“Precio y disponibilidad a confirmar”. Agregar un claim peligroso antes o después de una
frase segura continúa fallando. `source: google_maps` y `verified: true` tampoco habilitan claims.

Se prueban explícitamente las nueve etiquetas actuales pedidas y todo el catálogo cerrado
de zonas. “Preferencias alimentarias a confirmar” sigue permitida: expresa incertidumbre,
sin afirmar dieta ni seguridad. Los códigos, fuentes y etiquetas F3 no cambian.

## Validación

- Antes de ampliar el guard, los nuevos tests fallaron en ideal, privado, vegano y accesible.
- Cinco tests nuevos: cuatro familias con frases explícitas, mayúsculas, acentos descompuestos,
  guiones, caracteres invisibles, claims mezclados y fuente/flag sin prueba; uno de etiquetas seguras.
- Los tests F3 existentes conservan los bloqueos de reserva, disponibilidad, capacidad y precio.
- El test de endpoint F3 sigue verificando la misma Google request, una llamada, no-store,
  option_token y escritura de sólo los campos mínimos de providers.
- La comparación exacta con baseline F5 pasa: 29 escenarios, 68 opciones, pertinencia 89,7 %,
  relleno 8, omitidas hasta tres 8 y fuera de zona sin aviso 0. Orden y cantidad no cambian.
- `npm run check`: OK, 12/12 funciones.
- `npm test`: 309 aprobados, 0 fallidos, 3 omitidos de integración Postgres (312 total).
  No se ejecutó SQL para esos tests omitidos.

No hay migration, dependencia, endpoint, cambio de Supabase ni de provider storage.
No se necesita QA visual nueva: no se modificó el código que ejecuta el navegador.

## Qué queda para F4 y límites

F4 debe definir restricciones fuertes, evidencia permitida y verificación de proveedores en
su propia revisión. F4A no crea certificaciones, estados de verificación ni nuevas razones visibles.
No debe reutilizarse el flag de fuente Google como acreditación dietaria o de seguridad.

Este guard vive en tests; no es un filtro de producción ni censura nombres/comentarios de Google.
Cubre las familias y variantes probadas, no cualquier posible paráfrasis del lenguaje.
La validación cerrada de razones F3 sigue siendo necesaria además del filtro textual.
