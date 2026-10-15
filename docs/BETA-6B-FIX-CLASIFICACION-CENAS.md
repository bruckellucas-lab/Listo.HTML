# BETA-6B — clasificación de cenas pequeñas

## Problema

`detectType` prioriza `Cumpleaños` sobre `Cena`. Por eso una cena de cumpleaños pequeña podía
perder la protección que ya tenían los planes cuyo tipo era literalmente `Cena`: la necesidad
genérica `lugar` podía forzar `celebration`, y dos menciones accesorias entre ambientación, torta,
fotos o música podían forzar `multi_service`.

`lugar` no distingue por sí solo entre “un lugar lindo para cenar” y una solicitud de alquiler de
salón. Al mismo tiempo, un pedido explícito de salón para un grupo pequeño podía terminar en
`dinner`.

## Regla nueva

- Un cumpleaños con comida y entre 1 y 14 invitados conserva intención de cena aunque también
  mencione lugar, ambientación, torta, fotos o música.
- Esa protección no se aplica cuando el texto pide explícitamente salón, espacio privado o
  alquiler de un lugar/espacio.
- Los campos revisados tienen prioridad: si el usuario cambia el tipo o quita `Lugar`, la mención
  contradictoria del texto inicial deja de decidir el perfil.
- `sin salón`, `no quiero salón`, `salón no` y “no hace falta alquilar” no son pedidos de espacio.
  Tampoco lo son alquilar una mesa dentro de un lugar ni un restaurante que tiene salón privado.
- Un salón explícito para un cumpleaños sigue usando `celebration`; para un plan genérico usa
  `venues`.
- Un evento realmente multiservicio conserva `multi_service`.
- El prompt sólo se inspecciona localmente para producir el ID cerrado del perfil. No se agrega al
  request de Google ni se incorpora al backend.

## Ejemplos

| Pedido | Antes | Ahora |
|---|---|---|
| Cena de cumpleaños para 6 en un lugar lindo con ambientación | `celebration` | `dinner` |
| Cena de cumpleaños para 6 con torta y ambientación | `multi_service` | `dinner` |
| Cena de cumpleaños para 6 con fotos y decoración | `multi_service` | `dinner` |
| Alquilar un salón para 6 | `dinner` | `venues` |
| No quiero salón; quiero restaurante para cenar 6 | `venues` | `dinner` |
| Alquilar una mesa en un lugar lindo para cenar 6 | `venues` | `dinner` |
| Pedido con salón, luego tipo editado a Cena | `venues` | `dinner` |
| Cumpleaños para 30 con salón | `celebration` | `celebration` |
| Evento con lugar, música, fotografía y catering | `multi_service` | `multi_service` |

## Tests

Los tests usan las funciones reales de detección y clasificación extraídas de `app.js`. Cubren:

- cenas pequeñas simples y con menciones ambiguas/accesorias;
- los cinco escenarios de edición de tipo/necesidades de B1;
- las siete negaciones o referencias gastronómicas de B2 y sus cuatro controles positivos;
- salón explícito, celebración grande y evento multiservicio;
- perfiles de bar, asado, aniversario y corporativo;
- preferencia vegana y el corte previo de todas las restricciones obligatorias;
- baselines, privacidad, request cerrado a Google, option token y almacenamiento mínimo.

## Límites y riesgos conocidos

- Sin cantidad de invitados no se presume que el evento sea pequeño.
- La detección explícita depende de palabras cerradas. Frases inusuales pueden seguir siendo
  ambiguas, especialmente negaciones o correcciones con una redacción no cubierta.
- Seleccionar simultáneamente `Lugar` y `Comida` en una cena pequeña no conserva información sobre
  si `Lugar` fue detectado o elegido manualmente. BETA-6B prioriza la intención gastronómica salvo
  que el texto sea explícito.
- No se agrega un historial de edición: se compara el estado actual con la extracción original.
  Si ambos coinciden, se conserva un pedido positivo de salón; si el tipo cambió o `Lugar` fue
  quitado, prevalece la revisión del usuario.
- No se modificaron consultas, filtros, ranking, familias de tipos, umbrales ni cantidad de
  resultados.

## Fuera de alcance

BETA-6B no corrige ni afirma:

- precios ni uso del presupuesto como filtro;
- ambiente, estética o aptitud para festejos verificables;
- la amplitud de los tipos de restaurante admitidos;
- calidad o variación de resultados reales de Google Places.

No se hicieron búsquedas Google reales ni se usaron datos de testers.
