# CO-2a — bandeja administrativa segura y paginada

Base de revisión: `560180847b386847bf6f94a77328206c9606d80c`.
Alcance: Admin y lecturas de inquiries, sin SQL, migration, dependencia ni endpoint nuevo.
Este documento describe código local para revisión; no acredita publicación ni configuración externa.

## Contrato de lectura

Todas las lecturas siguen exigiendo la sesión administrativa existente. Respuestas `no-store`.

- `GET /api/admin-inquiries?status=open`: abiertas (incluye confirmed), valor predeterminado.
- `status=all`: todas. Los seis estados comerciales conservan sus filtros de presentación anteriores.
- `status=proposal_accepted`: propuesta vigente aceptada en una inquiry previa a confirmed.
- `cursor=...`: siguiente página, hasta 50 filas, ligada al mismo estado/búsqueda.
- `GET /api/admin-inquiries?id=UUID`: detalle de una sola inquiry, o 404.
- Búsqueda: encabezado `X-Listo-Search` con `encodeURIComponent(texto)`, máximo 120 caracteres.
  No se persiste en navegador ni se agrega a la URL del Admin o al cursor en texto claro.
  La búsqueda sí se traduce a filtros en la URL de la petición de servidor a PostgREST;
  no registrar esas URLs ni headers de búsqueda en logs. No es un secreto frente al proveedor de datos.

La búsqueda se aplica en servidor sobre nombre/email sin distinción de mayúsculas y con
variantes de acentos latinos; sobre teléfono ignora separadores si hay tres o más dígitos.
También admite el UUID completo. Los caracteres especiales se tratan como texto literal,
no como expresiones regulares ni sintaxis PostgREST suministrada por el usuario.

El listado devuelve sólo ID, creación, estado comercial/mostrado, estado del aviso de email,
fecha/hora del plan e iniciales (máximo dos). No devuelve nombre completo, teléfono, email,
WhatsApp, prompt, comentarios, restricciones, relaciones, notas, propuestas públicas ni
cotizaciones/reservas individuales. La selección de contact_name en el servidor se utiliza
solamente para producir las iniciales. Las iniciales y los IDs siguen siendo datos vinculables.

El detalle conserva el contexto y los indicadores de disponibilidad de esquema previos.
WhatsApp y cambios comerciales ahora se abren desde ese detalle. Los contratos de escritura,
IDs de recuperación y RPC S2B no cambian.

El listado es un contrato reducido deliberadamente: el Admin se migra en el mismo cambio.
No existe un modo legacy que vuelva a exponer el listado completo. No se identificaron otros
consumidores de ese GET dentro del repositorio.

## Paginación y contadores

Orden estable: `created_at DESC, id DESC`. El cursor lleva el último par exacto (incluidos
microsegundos), el límite temporal de ingreso, filtro y huella de búsqueda, firmado con HMAC
usando la configuración administrativa existente. No lleva contactos. No usa OFFSET.

Cada petición aplica estado/búsqueda antes de construir la página. Para Abiertas/Todas y estados
sin presentación derivada, PostgREST filtra antes del límite; `Prefer: count=exact` / HEAD obtiene
el total completo sin cursor. El conteo de la página permite continuar incluso si el servidor
aplica un límite de filas menor al solicitado.

`total` es el total real de la consulta sin cursor; `count` son las filas de esta respuesta.
`has_more` / `next_cursor` indican continuación. La UI distingue total consultado y filas cargadas,
con la hora de consulta. Los filtros no muestran contadores calculados sobre una página parcial.
Si el conteo no está disponible, el listado falla explícitamente: no inventa un total.

“Propuesta aceptada” sigue siendo una presentación derivada de la propuesta más reciente no
reemplazada, con desempate por ID. Para conservar la semántica anterior de Nueva/Contactando/
Cotizado (que excluyen esa presentación), esos filtros recorren en servidor metadatos mínimos
`id,created_at,status,propuesta-vigente.status`, por bloques y sin tope global. Después de resolver
clasificación y total, se pagina y se obtienen los datos mínimos de las filas seleccionadas.
No se aplica un límite de 500 antes de resolver el filtro derivado. No se cargan contactos de
todo ese universo para efectuar la clasificación.

**Costo pendiente de medir en Preview:** los filtros derivados requieren lecturas proporcionales
al universo candidato, y count=exact tiene costo de consulta. Sin cambiar esquema no hay un
predicado directo de PostgREST para “estado de la última propuesta”. Una futura optimización
con SQL/RPC necesitaría autorización aparte. Un fallo de lectura no devuelve páginas o totales
parciales como completos. La ausencia del esquema de propuestas se informa explícitamente al
pedir aceptadas; el listado básico conserva la degradación del esquema anterior.

Las métricas de reservas son globales, por moneda y separadas de los filtros de inquiries.
También se recorren por cursor para no sumar sólo las primeras filas del límite de PostgREST.
Un fallo de métricas oculta sus valores; no publica una suma parcial. Se recalculan al iniciar
una consulta/actualización, no al cargar cada página adicional.

## Concurrencia y límites

La paginación no mantiene una transacción entre pedidos HTTP. El límite temporal excluye ingresos
posteriores; inserciones por encima del cursor y borrados no desplazan el siguiente tramo.
Los estados, propuestas y contactos siguen siendo datos vivos. Cambios concurrentes de pertenencia
al filtro o cargas retroactivas pueden requerir Actualizar; no se promete un snapshot transaccional.

El Admin deduplica IDs, descarta respuestas tardías de filtros/detalles anteriores, permite reintentar
una página sin perder lo cargado y reinicia el cursor al cambiar filtro/búsqueda. Al detectar un
cambio comercial desde un detalle, marca la bandeja para actualizar y bloquea continuar con ese
cursor. No sustituye el estado esperado ni la recuperación S2B de las escrituras.

El detalle sólo se retiene mientras está seleccionado; cierre/salida limpia su DOM y referencia.
Los objetos completos nunca se fusionan con la colección mínima de bandeja. La contraseña
compartida y sus limitaciones de atribución individual permanecen sin cambios.

## Validación reproducible

- `node --test tests/admin-inbox.test.js tests/admin-inbox-ui.test.js`: fixtures sintéticos de
  más de 500 inquiries, filtros, propuestas vigentes, búsquedas, conteos exactos, empates,
  microsegundos, cambios concurrentes, límites reducidos de servidor, autenticación, errores,
  minimización y control de respuestas tardías.
- `npm run check`: sintaxis y 12/12 funciones.
- `npm test`: incluye regresiones de cotizaciones, propuestas, reservas, comisiones, S2B y privacidad.

El transporte de prueba interpreta filtros, proyección, orden, límites y Content-Range;
no es una conexión ni una validación contra Supabase desplegado.

Smoke manual con Chromium y transporte sintético (sin llamadas reales), desktop 1440×1000 y
móvil 390×844:

1. Abrir bandeja: 50 cargadas, total 115 abiertas sobre 620 inquiries.
2. Fallar la siguiente página, reintentar y llegar a 115 sin duplicados.
3. Abrir la inquiry más antigua: detalle completo, WhatsApp y formularios comerciales disponibles.
4. Cerrar detalle: su contenido se limpia.
5. Filtrar completadas: total 505; buscar un contacto y comprobar resultado vacío.
6. Volver a abiertas con la misma búsqueda: encontrar la inquiry antigua por nombre con acento.
7. Comprobar búsqueda fuera de la URL, sin errores JavaScript ni desborde horizontal.

No se consultaron datos reales ni se probaron servicios externos. Preview, integración con
PostgREST real y revisión independiente de Claude quedan pendientes antes de publicar.
