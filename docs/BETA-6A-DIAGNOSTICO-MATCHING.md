# BETA-6A — diagnóstico de matching real

Base revisada: `cd79a7f17a7e95198ad346b71739f079cf86c3e5`.

Estado: **DIAGNÓSTICO DOCUMENTAL**. No cambia el matching y no valida todavía el resultado real.
No se hicieron llamadas a Google Places ni búsquedas productivas durante esta tarea.

## Resumen ejecutivo

El hallazgo de BETA-4 es una señal válida, pero todavía no alcanza para confirmar un defecto: no
se conservaron los nombres, tipos ni posiciones de las opciones consideradas poco pertinentes.
No deben reconstruirse ni inventarse.

Para el pedido descrito, el código actual debería:

1. detectar `Cumpleaños`, 6 personas, Palermo, presupuesto total de $300.000, comida/cena y deco;
2. elegir el perfil cerrado `dinner`;
3. pedir al servidor únicamente `profile=dinner` y `zone=Palermo`;
4. buscar en Google `restaurantes en palermo, Buenos Aires`;
5. admitir restaurantes con tipo y señales mínimas, y ordenarlos por zona, tipo y calidad de
   reseñas.

Esto explica una limitación comprobada por código: cumpleaños, seis personas, presupuesto y
“buena ambientación” no diferencian resultados dentro de `dinner`. LISTO tampoco recibe precios,
capacidad ni una señal verificable de ambiente desde Google. Por lo tanto, un restaurante puede
superar los filtros técnicos y seguir pareciendo poco apropiado para una cena de cumpleaños.

La conclusión correcta por ahora es: **hay una brecha de personalización plausible y demostrable
en el código, pero no está demostrado qué capa produjo las opciones objetadas en BETA-4**.

## Límites de la evidencia

### Confirmado

- El código y los tests muestran cómo se clasifica este perfil y qué datos llegan al endpoint.
- La consulta, filtros, fórmula y presentación están versionados y pueden auditarse sin red.
- El presupuesto es un total del plan y se conserva como número; no participa del matching.
- “Ambientación” se detecta como necesidad `deco`, pero no modifica la búsqueda `dinner`.
- Google no entrega en este request precio, capacidad, disponibilidad ni una propiedad de
  “buena ambientación”.
- F5 no rellena hasta tres con candidatos que fallen sus mínimos; muestra 0, 1, 2 o 3.

### No confirmado

- Cuáles fueron las opciones observadas en BETA-4, su orden, tipo o zona.
- Si la evaluación negativa se debió al lugar, a una foto, al estilo, al presupuesto, a la zona o
  a una expectativa no visible para LISTO.
- Qué respuesta exacta devolvió Google en ese momento ni si hoy devolvería la misma.
- Si una consulta alternativa mejoraría resultados reales sin introducir otras regresiones.
- Precio, capacidad, disponibilidad, posibilidad de festejar cumpleaños o calidad del ambiente de
  ningún lugar.

## Mapa del flujo actual

| Etapa | Implementación actual | Evidencia |
|---|---|---|
| Texto inicial | Normaliza el texto y detecta tipo, invitados, presupuesto, zona, necesidades y dieta. El primer tipo que coincide gana. | `app.js`, `detectType`, `detectGuests`, `detectBudget`, `detectZone`, `detectNeeds`, `interpret` (líneas 15–171). |
| Revisión humana | Los datos detectados se muestran en campos editables y se vuelven a leer antes de buscar. | `app.js`, `fillDetails` y `readDetails` (líneas 411–420 y 613–621). |
| Restricciones fuertes | Si existe una restricción obligatoria, no se buscan opciones automáticas. | `app.js`, `runSearch` (líneas 815–830). |
| Perfil | El navegador convierte datos estructurados en un ID cerrado. Cumpleaños chico con comida y sin necesidad de lugar usa `dinner`. | `app.js`, `chooseProfile` (líneas 750–770); `tests/matching-profiles.test.js`, test O1. |
| Request de opciones | El navegador envía sólo perfil y zona. No envía prompt, invitados, presupuesto, cumpleaños, deco ni comentarios. | `app.js`, `runSearch` (líneas 834–839). |
| Validación y costo | El servidor valida perfil/zona y aplica límites antes de Google. La clave de repetición es `perfil|zona`. | `api/plan-options.js` (líneas 36–61); `api/_lib/rate-limit.js` (líneas 29–57). |
| Consulta Google | El servidor arma una frase cerrada y pide hasta 20 resultados en español/región AR. Para `dinner|palermo`: `restaurantes en palermo, Buenos Aires`. | `api/_lib/plan.js`, `PROFILES` y `buildProfileQuery` (líneas 69–107); `api/_lib/google-places.js`, `searchText` (líneas 31–63). |
| Datos disponibles | Se piden ID, nombre, dirección/componentes, ubicación, tipo principal, estado, Maps, web, rating, cantidad de reseñas y fotos. No precio, capacidad, horarios, disponibilidad ni reseñas textuales. | `api/_lib/google-places.js`, `FIELD_MASK` (líneas 10–29). |
| Conversión | La respuesta se transforma en memoria y se excluyen cerrados permanentes; no se inventan faltantes. | `api/_lib/google-places.js`, `toProviderRow` y `toProviderRows` (líneas 65–121). |
| Persistencia | Antes del filtro se intenta guardar sólo la fila mínima permitida del proveedor; el resultado visible completo no se guarda. | `api/plan-options.js` (líneas 69–85) y guardianes G/F6B. |
| Admisión F5 | `dinner` admite `restaurant`, cualquier `*_restaurant` y `steak_house`; exige rating ≥4, al menos 20 reseñas y score calculable. Puede admitir una alternativa fuera de zona con aviso. | `api/_lib/plan.js`, `pertinentType`, `adequateType`, `pickAdequateOptions` (líneas 146–224). |
| Ranking F2 | Ordena por coincidencia de zona, tipo pertinente, score bayesiano, reseñas y finalmente orden original de Google. | `api/_lib/plan.js`, `qualityScore` y `pickOptions` (líneas 138–203). |
| Cantidad/fallback | Devuelve como máximo tres; si quedan menos, no agrega relleno y ofrece coordinación manual. | `api/_lib/plan.js`, `optionsFeedback` (líneas 230–238); `docs/MATCHING-F5.md`. |
| Tarjeta | Muestra una foto, nombre, tipo visible, zona/dirección corta, rating/reseñas, razón cerrada, atribución, Maps/web y “Precio y disponibilidad a confirmar”. | `app.js`, `photoHTML`, `reasonForCard`, `renderOptions` (líneas 1006–1145). |

## Derivación esperada del caso BETA-4

Pedido de referencia, sin agregar datos: cena de cumpleaños, 6 personas, Palermo, presupuesto
total $300.000 y buena ambientación.

| Dato | Interpretación esperada | Efecto real en las opciones |
|---|---|---|
| Cena de cumpleaños | `detectType` encuentra primero `Cumpleaños`; `detectNeeds` encuentra comida/cena. | La rama de cumpleaños chico elige `dinner`, no salón. |
| 6 personas | `guests=6`. | Evita el umbral de celebración de 15, pero después no participa en búsqueda, filtro o ranking. |
| Palermo | Zona cerrada válida. | Forma la consulta y prioriza coincidencia geográfica. |
| $300.000 | `budget=300000` si el texto/campo conserva ese total. | Sólo se muestra y guarda como dato del plan; no llega a `/api/plan-options`. |
| Buena ambientación | La palabra “ambientación” activa `deco`. “Lindo” por sí solo no es una señal cerrada. | Una sola necesidad `deco` no cambia `dinner` y no llega a Google ni al ranking. |

### Presupuesto

El código interpreta `$300.000` como 300000 y el formulario vuelve a leer únicamente dígitos.
No existe conversión productiva a presupuesto por persona. Dividir 300000 entre 6 daría una
referencia aritmética de 50000 por persona, pero **no demuestra el costo de ningún lugar** y no se
usa para aceptar, descartar u ordenar opciones.

Esto es deliberadamente honesto: el FieldMask no pide precios y las tarjetas dicen “Precio y
disponibilidad a confirmar”. El riesgo no es una comparación monetaria incorrecta, sino que la
persona puede esperar que el presupuesto haya personalizado resultados cuando hoy no lo hace.

### Preferencias blandas

- `cumpleaños`: decide entre `dinner`, `bars` o `celebration`; dentro de `dinner` no distingue una
  cena cotidiana de una celebración chica.
- `buena ambientación`: `ambientación` queda como `deco`, pero no hay una señal permitida que
  pruebe estética, clima, ruido, iluminación o aptitud para festejos.
- `lindo`: no pertenece al catálogo de necesidades ni debe inferirse desde rating o foto.
- La foto puede influir mucho en la percepción, pero es la primera foto disponible de Google, no
  una prueba de ambiente ni de identidad perfecta del local.

## Hipótesis priorizadas

“Evidencia alta” significa confirmada por el código, no que explique por sí sola el incidente.

| ID | Hipótesis | Evidencia actual | Riesgo | Cómo distinguirla |
|---|---|---|---|---|
| H1 | Se pierde intención específica al reducir el pedido a `dinner|palermo`. | Alta: invitados, presupuesto, cumpleaños y deco no llegan al endpoint. | Alto: todos los pedidos con ese perfil/zona comparten consulta y criterio. | Confirmar en Network que el request contiene sólo `profile=dinner&zone=Palermo`; comparar evaluación de cada tarjeta con la intención omitida. |
| H2 | La familia admisible de `dinner` es demasiado amplia para “cumpleaños con ambiente”. | Alta: cualquier `*_restaurant` y `steak_house` puede pasar. | Alto: un tipo gastronómico válido puede ser subjetivamente inadecuado para festejar. | Registrar `tipo visible` y separar “restaurante válido” de “apropiado para el festejo”. |
| H3 | El ranking premia zona y calidad de reseñas, no atmósfera, grupo chico ni presupuesto. | Alta: comparador y FieldMask no contienen esas señales. | Alto: opciones populares pueden desplazar otras más afines no observables. | Ver si los rechazos tienen zona/tipo correctos pero fallan sólo por estilo, precio supuesto o ocasión. |
| H4 | La consulta textual genérica de Google recupera un universo demasiado amplio. | Media: la frase es genérica; no tenemos la respuesta real. | Medio/alto. | Reproducir una vez y clasificar los resultados devueltos; no inferir candidatos que Google no mostró. |
| H5 | Una opción externa o con zona incierta fue percibida como mala. | Media/baja: el código lo permite con aviso, pero no conocemos las tarjetas. | Medio. | Registrar zona general y si apareció el aviso. No usar calle/dirección completa. |
| H6 | Metadata ausente o imprecisa de Google alteró filtro/ranking/presentación. | Posible: el sistema depende de primaryType, zona, rating y reseñas actuales. | Medio. | Comparar tarjeta con Maps en el momento, sin exportar la respuesta ni guardar contenido completo. |
| H7 | Una foto poco representativa hizo parecer inadecuada una opción pertinente. | Riesgo ya documentado en F6B; sin evidencia del caso. | Medio para confianza, bajo para ranking. | Evaluar por separado “lugar” y “foto”; no rechazar el matching sólo por la imagen. |
| H8 | F5 introdujo relleno. | Evidencia contraria: exige tipo/calidad y permite menos de tres. | Bajo. | Si una tarjeta pasó, revisar qué criterio objetivo cumplió; puede ser admisión amplia, no relleno técnico. |

## Clasificación de una opción observada

Usar tres resultados, no un sí/no forzado:

- **Pertinente:** tipo de lugar y zona sirven claramente para una cena; no implica precio,
  disponibilidad, capacidad ni ambiente confirmados.
- **Incierta:** parece posible, pero la tarjeta/Maps no da evidencia suficiente sobre el motivo de
  duda. Presupuesto o ambientación sin fuente pertenecen normalmente aquí.
- **No pertinente:** contradice un dato observable del pedido, por ejemplo tipo ajeno o zona no
  aceptable. Documentar el dato, no una impresión general.

Códigos sugeridos para el motivo: `TIPO`, `ZONA`, `OCASION`, `AMBIENTE_NO_VERIFICABLE`,
`PRESUPUESTO_NO_VERIFICABLE`, `FOTO`, `DATOS_INSUFICIENTES`, `OTRO_REDACTADO`.

## Protocolo manual con resultados reales

### Antes de ejecutar

1. Requiere autorización escrita para el entorno elegido. Preview y Production pueden compartir
   base; asumir que el flujo normal escribe un `event_request` real.
2. Usar únicamente datos sintéticos y comenzar el prompt con `PRUEBA BETA6A`.
3. No incluir nombres, contactos, comentarios personales, alergias ni datos de un evento real.
4. No ejecutar si el presupuesto externo de Google/fotos o la operación de guardia no están
   confirmados.
5. Preparar un registro privado y temporal; no usar GitHub para resultados Google.

### Ejecución canónica

1. Abrir LISTO en una ventana nueva del navegador y anotar fecha/hora ART, entorno, versión/SHA,
   dispositivo y navegador.
2. Ingresar un texto sintético equivalente a: `PRUEBA BETA6A. Cena de cumpleaños para 6 personas
   en Palermo. Presupuesto total $300.000. Busco buena ambientación.`
3. En la pantalla editable, verificar y registrar solamente:
   - tipo mostrado;
   - 6 personas;
   - Palermo;
   - presupuesto total $300.000;
   - necesidades detectadas de cena/comida y deco.
4. Corregir únicamente un error de extracción visible; registrar antes y después. No agregar
   preferencias nuevas para “ayudar” al resultado.
5. Abrir DevTools antes de buscar. Confirmar que el request visible es
   `/api/plan-options?profile=dinner&zone=Palermo` (normalización equivalente aceptable). No
   exportar HAR, JSON, headers, tokens ni IDs.
6. Dejar terminar una sola búsqueda y una carga normal de fotos. No recargar ni repetir por
   curiosidad: una búsqueda llama Google una vez y cada foto visible puede generar una consulta
   adicional.
7. Registrar cada tarjeta en orden con la tabla mínima inferior. No copiar dirección completa,
   rating/reseñas, URL, foto, autor, place ID ni payload.
8. Abrir Maps o el sitio oficial sólo si hace falta distinguir tipo/zona del lugar. Mantener la
   atribución visible y no copiar contenido adicional.
9. No tocar “Elegir” ni “Quiero avanzar”: no son necesarios para diagnosticar el ranking.
10. Como buscar guarda el pedido, identificarlo operativamente por el marcador `PRUEBA BETA6A` y
    cerrarlo desde Admin según el protocolo BETA-4, con motivo `ensayo`; no borrar filas ni usar SQL.

### Repetición controlada

- Una segunda corrida idéntica sólo se justifica si la primera falló técnicamente o si se acordó
  medir variación temporal. Esperar más de 10 segundos y registrar que es repetición.
- No hacer una tercera búsqueda inmediata: `search_repeat` admite 2 por 10 segundos, y existen
  topes compartidos por hora/día.
- No cambiar al mismo tiempo prompt, zona y preferencias. Una comparación posterior debe variar
  una sola dimensión y contar con autorización de costo propia.
- Si aparece 429, error de costo o Google, detenerse; no intentar evadir el límite.

## Tabla mínima de resultados

Esta tabla vive en el registro privado y temporal del diagnóstico, no en el repositorio. El nombre
público se usa sólo para poder discutir la opción durante la revisión inmediata. Definir su
retención/borrado antes de ejecutar.

| Corrida | Posición | Nombre público observado | Tipo visible | Zona general | Aviso de zona | Evaluación | Código de motivo | Explicación breve sin datos Google adicionales | ¿Foto influyó? |
|---|---:|---|---|---|---|---|---|---|---|
| `B6A-01` | `1` | `[nombre mostrado]` | `[tipo mostrado]` | `[Palermo/otra/incierta]` | `[no/fuera/incierta]` | `[pertinente/incierta/no pertinente]` | `[código]` | `[máx. una frase]` | `[sí/no]` |

No registrar identidad del tester, dirección, coordenadas, contacto, Maps URL, website, place ID,
rating, cantidad de reseñas, fotos, capturas, payloads ni comentarios libres del usuario.

## Google, atribución, cuotas y almacenamiento

- La prueba debe mostrar `Google Maps` y las atribuciones de foto existentes; no recortar ni
  reutilizar imágenes fuera del producto.
- La respuesta lleva `Cache-Control: no-store`. Los resultados completos, ranking, razones y fotos
  quedan en memoria y no deben copiarse a Supabase, GitHub, fixtures o documentación.
- La aplicación conserva sólo el `google_place_id` y datos propios mínimos según el contrato G.
  Este protocolo no agrega otra persistencia.
- Los nombres públicos de la tabla son contenido observado para una revisión operativa acotada.
  Mantener el registro privado, mínimo y temporal; confirmar retención y términos aplicables antes
  de ejecutar. Si no puede acordarse, usar revisión en vivo sin conservar nombres.
- Una búsqueda admitida consume una llamada Text Search. Las fotos pueden consumir llamadas
  adicionales al cargarse. No hay segunda búsqueda automática.
- Límites actuales relevantes: 30 búsquedas por visitante/10 minutos, repetición 2/10 s,
  búsquedas compartidas 200/hora y 1000/día; fotos además tienen límites por visitante, firma,
  hora y día. No son presupuesto disponible: pueden estar parcialmente consumidos.
- No enviar el prompt libre, presupuesto, invitados ni preferencias a Google. El protocolo sólo
  inspecciona el request cerrado que ya genera LISTO.

## Hasta tres mejoras posibles, no autorizadas

### 1. Perfil/consulta cerrada para cena de celebración chica — prioridad potencial alta

Evaluar una variante cerrada, por ejemplo una intención `birthday_dinner`, únicamente si la prueba
confirma que `dinner` recupera restaurantes válidos pero repetidamente ajenos a la ocasión. Debe
probarse primero con comparación controlada, privacidad, costo, nueva clave `search_repeat` y
regresiones del arnés. No debe usar el prompt libre ni prometer que un lugar acepta cumpleaños.

### 2. Criterio de ranking medible para intención de ocasión — prioridad potencial media

Antes de sumar señales, definir una fuente permitida. No inferir ambiente desde foto, nombre o
rating. Una mejora sólo sería aceptable si usa campos actuales con semántica demostrable o una
fuente propia verificada y si mejora pertinencia real sin excluir restaurantes útiles. Invitados y
presupuesto no pueden convertirse en claims de capacidad o precio.

### 3. Explicar la incertidumbre de ambientación/presupuesto — prioridad potencial media

Si las opciones son gastronómica y geográficamente válidas, pero la frustración viene de creer que
LISTO ya comprobó ambiente o presupuesto, el arreglo correcto puede ser de explicación y
coordinación, no de ranking. Cualquier copy futuro debe conservar “a confirmar” y pasar los
guardianes F3/F4A. No se implementa aquí.

## Criterios para decidir si se modifica el matching

Modificar sólo si una reproducción documentada permite responder qué falla:

1. **Clasificación:** el perfil enviado no es `dinner` pese a que la pantalla muestra cumpleaños
   chico + comida, o cambia de manera inesperada al editar.
2. **Recuperación Google:** una proporción relevante de lo devuelto contradice tipo o zona, no sólo
   una preferencia de ambiente sin fuente.
3. **Filtro/ranking:** candidatos observables menos pertinentes desplazan de manera reproducible a
   otros pertinentes dentro de la misma respuesta.
4. **Presentación:** el lugar es razonable, pero foto o copy induce una conclusión no sostenida.

No modificar todavía cuando:

- sólo existe el recuerdo general “algunas no eran apropiadas”;
- el rechazo depende de precio, capacidad o ambiente no verificados;
- una única corrida cambia al repetir por variación de Google;
- no puede aislarse si la causa fue lugar, zona, foto o expectativa;
- la propuesta requiere enviar texto libre a Google, almacenar contenido Google o relajar costos.

Evidencia mínima para abrir una implementación: una corrida canónica completa, tabla redactada,
criterio acordado de pertinencia, al menos dos rechazos reproducibles con el mismo motivo objetivo
o un solo fallo grave y objetivo, y una hipótesis que pueda probarse contra el resultado actual.

## Alcance de BETA-6A

Sólo análisis y documentación. Sin cambios en código, tests, snapshots, matching, consultas,
ranking, filtros, tarjetas, Google request, costos, persistencia, APIs, Supabase, Admin o Vercel.
Sin llamadas reales a Google, SQL, migration, dependencia, endpoint, merge ni deploy.
