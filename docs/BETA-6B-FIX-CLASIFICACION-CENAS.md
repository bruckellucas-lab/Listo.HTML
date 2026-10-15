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
- La negación de alquiler abarca el verbo y su objeto: “no quiero alquilar un salón” no cuenta como
  intención afirmativa.
- `salón no` sólo expresa rechazo cuando cierra la cláusula o continúa con una fórmula de rechazo.
  Frases como “salón no muy grande” y “salón no tan caro” siguen siendo pedidos afirmativos.
- Un pedido afirmativo puede usar `salón`, `salones` o `espacio privado` con redacciones variadas;
  no necesita un verbo exacto inmediatamente antes de la mención.
- Un salón explícito para un cumpleaños sigue usando `celebration`; para un plan genérico usa
  `venues`.
- Un evento realmente multiservicio conserva `multi_service`.
- El prompt sólo se inspecciona localmente para producir el ID cerrado del perfil. No se agrega al
  request de Google ni se incorpora al backend.

## Diferencias deseadas contra `main`

La columna “Main” corresponde exclusivamente a
`a04af77743f2a53d1b3ee05116ebf83c8fb25430`; no compara contra commits intermedios de BETA-6B.

| Pedido | Main | BETA-6B |
|---|---|---|
| Cena de cumpleaños para 6 en un lugar lindo con ambientación | `celebration` | `dinner` |
| Cena de cumpleaños para 6 con torta y ambientación | `multi_service` | `dinner` |
| Cena de cumpleaños para 6 con fotos y decoración | `multi_service` | `dinner` |
| Alquilar un salón para 6 | `dinner` | `venues` |
| Alquilar un espacio para una cena de 10 | `dinner` | `venues` |

## Regresiones intermedias restauradas

Estos comportamientos ya eran correctos en `main`. Una versión intermedia de BETA-6B los cambió;
los fixes B1–B4 restauran el perfil de `main` y los fijan en la matriz automática.

| Caso | Main | Versión intermedia | BETA-6B final |
|---|---|---|---|
| Campo editado a Cena o `Lugar` desmarcado | `dinner` | `venues` | `dinner` |
| Negación o contexto gastronómico con salón | `dinner` | `venues` | `dinner` |
| Pedido afirmativo de salón para cumpleaños chico | `celebration` | `dinner` | `celebration` |
| “No quiero alquilar un salón; quiero restaurante” | `dinner` | `venues` | `dinner` |

La matriz diferencial contiene 42 casos sintéticos: las cinco diferencias autorizadas de la
primera tabla y 37 escenarios que deben coincidir con `main`. En un checkout con el commit base,
el test carga y ejecuta el `app.js` real de ambos commits. En un checkout superficial sin ese
objeto Git, compara contra un snapshot de salidas; no mantiene una segunda implementación del
clasificador.

## Tests

Los tests usan las funciones reales de detección y clasificación extraídas de `app.js`. Cubren:

- cenas pequeñas simples y con menciones ambiguas/accesorias;
- los cinco escenarios de edición de tipo/necesidades de B1;
- las siete negaciones o referencias gastronómicas de B2 y sus cuatro controles positivos;
- las nueve redacciones afirmativas de salón de B3;
- la negación de alquiler de B4 y su control afirmativo;
- salón explícito, celebración grande y evento multiservicio;
- perfiles de bar, asado, aniversario y corporativo;
- preferencia vegana y el corte previo de todas las restricciones obligatorias;
- baselines, privacidad, request cerrado a Google, option token y almacenamiento mínimo.

## Límites y riesgos conocidos

- Sin cantidad de invitados no se presume que el evento sea pequeño.
- La detección explícita depende de palabras cerradas. Frases inusuales pueden seguir siendo
  ambiguas, especialmente negaciones, correcciones o coordinaciones con una redacción no cubierta.
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
