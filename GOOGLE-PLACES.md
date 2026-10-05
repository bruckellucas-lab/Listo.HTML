# LISTO · Google Places → Vercel → Supabase

La búsqueda de lugares la hace `api/plan-options.js`, una función que corre en los servidores de Vercel: busca en Google Places, guarda en `providers` (sin duplicar) y devuelve las 3 opciones con fotos.

> La página de prueba `prueba-google.html` y sus funciones `api/places-search.js` y `api/place-photos.js` se eliminaron (octubre 2026): eran sólo de prueba y Vercel Hobby permite como máximo 12 funciones.

Las claves de Google y la clave secreta de Supabase viven **solo en Vercel**. Nunca aparecen en la web ni en GitHub.

---

## Paso 1 · Google Cloud: activar la API

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google.
2. Arriba a la izquierda, en el selector de proyectos, tocá **Nuevo proyecto**. Nombre: `LISTO`. Tocá **Crear** y asegurate de que quede seleccionado.
3. **Facturación**: menú ☰ → **Facturación** → vinculá una cuenta de facturación (tarjeta). Google Places no funciona sin esto, aunque tiene un uso gratuito mensual.
4. Menú ☰ → **APIs y servicios** → **Biblioteca**.
5. Buscá **Places API (New)** y tocá **Habilitar**.
   - ⚠️ Tiene que ser la que dice **(New)**. La otra, "Places API" a secas, es la versión vieja y no la usamos.

## Paso 2 · Google Cloud: crear la clave

1. Menú ☰ → **APIs y servicios** → **Credenciales**.
2. Tocá **+ Crear credenciales** → **Clave de API**.
3. Aparece una clave que empieza con `AIza...`. **Copiala** y guardala un momento (la vas a pegar en Vercel en el Paso 5).

## Paso 3 · Google Cloud: restringir la clave

Todavía en **Credenciales**, tocá el nombre de la clave nueva (o **Editar clave de API**):

1. **Nombre**: `LISTO servidor Vercel`.
2. **Restricciones de aplicaciones**: dejá **Ninguna**.
   - Por qué: la clave la usa el servidor de Vercel, no el navegador. Por eso "sitios web" no aplica, y las direcciones IP de Vercel cambian, así que tampoco sirve restringir por IP. La clave queda protegida porque **solo existe dentro de Vercel**.
3. **Restricciones de API**: elegí **Restringir clave** y marcá **únicamente Places API (New)**.
4. Tocá **Guardar**.

Límites de gasto, muy recomendados:

5. Menú ☰ → **APIs y servicios** → **Places API (New)** → pestaña **Cuotas y límites del sistema**.
   - Buscá la cuota de **Text Search** por día (por ejemplo "SearchTextRequest per day"), tocá el lápiz ✏️ y poné **100**. Alcanza de sobra para probar y te protege de sorpresas.
6. Menú ☰ → **Facturación** → **Presupuestos y alertas** → **Crear presupuesto**. Poné un monto chico (por ejemplo USD 10) para que te avise por mail.

> **Costo:** para traer rating, cantidad de reseñas y sitio web, Google cobra la búsqueda como *Text Search Enterprise*. Pedimos solo los campos necesarios (nada de fotos, horarios, precios ni reseñas) y hasta 20 resultados por búsqueda. Google da un uso gratuito mensual por tipo de consulta; los valores actuales están en la página de precios de Google Maps Platform.

---

## Paso 4 · Supabase: preparar la tabla providers

### 4a. Evitar duplicados y cerrar la tabla al público

1. En Supabase, abrí tu proyecto → **SQL Editor** → **New query**.
2. Pegá y tocá **Run**:

```sql
-- Un mismo lugar de Google no puede guardarse dos veces
create unique index if not exists providers_google_place_id_key
  on public.providers (google_place_id);

-- La tabla queda cerrada para la web pública: solo el servidor (con la clave secreta) puede escribir
alter table public.providers enable row level security;
```

Tiene que decir **Success**. No hay que crear ninguna "policy" para `providers`: así, nadie desde el navegador puede leerla ni cambiarla.

### 4b. Copiar la clave secreta (solo para Vercel)

1. ⚙️ **Project Settings** → **API Keys**.
2. En **Secret keys**, copiá la clave que empieza con `sb_secret_...`. Si no hay ninguna, tocá **Add new secret key**.
   - Si tu proyecto solo muestra **Legacy API Keys**, copiá la **`service_role`**.
3. ⛔ Esta clave **solo se pega en Vercel**. **Nunca** en `config.js`, en GitHub ni en ningún archivo de la web.

Tipos de columna recomendados para `providers`:

| Columna | Tipo |
|---|---|
| name, category, address, zone, google_place_id, website, maps_url, source, provider_status | `text` |
| latitude, longitude, rating | `float8` (o `numeric`) |
| review_count | `int4` (o `int8`) |
| last_verified_at | `timestamptz` |

---

## Paso 5 · Vercel: pegar las claves

1. Entrá a [vercel.com](https://vercel.com) → tu proyecto de LISTO → **Settings** → **Environment Variables**.
2. Agregá estas 4 variables, una por una (**Key** = nombre exacto, **Value** = el dato):

| Key (nombre exacto) | Value (qué pegar) |
|---|---|
| `GOOGLE_PLACES_API_KEY` | La clave de Google (`AIza...`) del Paso 2 |
| `SUPABASE_URL` | Tu Project URL, por ejemplo `https://exofavwtifiqaeyvybpc.supabase.co` |
| `SUPABASE_SECRET_KEY` | La clave secreta `sb_secret_...` del Paso 4b |
| `PHOTO_SIGNING_SECRET` | Secreto aleatorio largo para firmar fotos (**32 caracteres o más**, generado al azar; no lo reutilices en otra variable) |

3. En **Environments** dejá marcados **Production** y **Preview**. Si aparece la opción **Sensitive**, activala.
4. Tocá **Save** en cada una.
5. **Importante:** las variables se aplican solo a publicaciones nuevas. Andá a **Deployments** → en la más reciente tocá **⋯** → **Redeploy** → **Redeploy**.

`PHOTO_SIGNING_SECRET` se usa **sólo** para firmar los links de las fotos (ver "Fotos reales de Google Places"). Si falta, la búsqueda funciona igual pero las opciones salen sin foto (con el placeholder de LISTO), y `/api/place-photo` rechaza los links.

> `LISTO_ADMIN_TOKEN` ya no se usa (antes firmaba las fotos). Desde P1A se puede borrar de Vercel, una vez que P1A esté en producción.

---

## Paso 6 · Probar "cena en Palermo"

1. Abrí tu dirección de Vercel (la web de LISTO).
2. Escribí, por ejemplo, **cena para 6 en Palermo** y tocá **Buscar opciones**.
3. Tienen que aparecer 3 lugares reales, con fotos y link a Maps. Tocá **Maps** en alguno para verificar que es real.
4. En Supabase → **Table Editor** → **providers** vas a ver esas filas con `source = google` y `provider_status = discovered`. Si repetís la búsqueda, **no se duplican**.

---

## Qué se guarda (y qué no)

- **Se guarda:** nombre, categoría (la que informa Google), dirección, barrio (solo si Google lo informa), latitud, longitud, `google_place_id`, rating, cantidad de reseñas, sitio web, link de Maps, `source = google`, `last_verified_at` (fecha y hora de la búsqueda) y `provider_status = discovered`.
- **No se guarda:** precios, disponibilidad ni capacidad. Tampoco se pide nada de eso a Google.
- **No se inventan datos:** si Google no informa un dato (por ejemplo, el sitio web), queda vacío.
- **Lugares cerrados:** los cerrados definitivamente no se guardan.
- **Si el lugar ya existía:** se actualizan sus datos, pero **no se toca** `provider_status`. Si vos lo cambiaste a mano, por ejemplo a "verified", se respeta. Tampoco se borra un dato que ya tenías si Google esta vez no lo trae.

## Si aparece un error

| Mensaje | Qué hacer |
|---|---|
| ✗ en alguna variable | Cargala en Vercel (Paso 5) y hacé **Redeploy**. |
| "Google rechazó la clave…" | Revisá que **Places API (New)** esté habilitada, que la facturación esté activa y que la clave tenga permitida esa API (Pasos 1 y 3). |
| "Se alcanzó el límite de búsquedas…" | Llegaste a la cuota diaria del Paso 3. Esperá o subila. |
| "Falta la regla que evita duplicados…" | Corré el SQL del Paso 4a. |
| "Supabase rechazó la clave…" | En `SUPABASE_SECRET_KEY` tiene que ir la **secreta** (`sb_secret_...` o `service_role`), no la pública. |
| "Una columna de providers no coincide…" | Revisá que los nombres de columna sean exactamente los de la lista. |
| No aparecen opciones | La web tiene que abrirse desde tu dirección de Vercel, no desde GitHub Pages ni desde tu computadora. |

---

# Fotos reales de Google Places

## Cómo funciona

1. **La búsqueda trae las referencias de fotos** (campo `places.photos`). No cambia el costo de la búsqueda: ya se cobraba como *Text Search Enterprise* por pedir rating y sitio web.
2. **Por cada foto, el servidor arma un link propio y firmado**: `/api/place-photo?name=…&w=…&exp=…&sig=…`.
   - La firma usa `PHOTO_SIGNING_SECRET` (sólo para esto; nunca llega al navegador).
   - Vence en **1 hora**.
   - Nadie puede cambiarle el tamaño ni usarlo para otra foto.
3. **Cuando el navegador muestra la foto**, `/api/place-photo` le pide a Google la imagen (*Place Photos New*, con la clave en el servidor) y redirige a la URL temporal de Google. Esa URL **no contiene la clave**.
4. **Nada de esto se guarda en Supabase.** Solo queda el `google_place_id`. Las fotos se resuelven en el momento, porque las referencias y las URLs de Google pueden vencer y Google no permite guardarlas.
5. **Propuesta para el usuario:** `/api/proposal` toma el `google_place_id` guardado, le pide a Google **solo el campo `photos`** y devuelve **1 foto** firmada, con su autor.

## Atribuciones (lo que pide Google)

- Debajo de cada foto se muestra **"Foto: _Autor_ · Google Maps"**, con link al perfil del autor cuando Google lo informa.
- Si Google no informa autor, se muestra **"Foto: Google Maps"**.
- La lista de resultados indica **"Datos y fotos: Google Maps"**.

## Si no hay fotos

Se muestra un **placeholder de LISTO** (fondo madera oscuro con "LISTO · Sin fotos en Google"). Nunca se usa otra imagen ni se inventa una foto. Si una foto falla al cargar, se ve "Foto no disponible".

## Costo de las fotos

| Acción | Consulta a Google | Costo aproximado |
|---|---|---|
| Buscar (con referencias de fotos) | 1 *Text Search* (igual que antes) | sin cambio |
| Mostrar 1 foto | 1 *Place Details Photos* | ~USD 7 cada 1.000, con **1.000 gratis por mes** |
| Abrir una propuesta (/propuesta/CÓDIGO) | 1 *Place Details* (solo `photos`) + 1 por cada foto que se vea | según la tabla de precios de Google |

Medidas para no gastar de más:

- **Fotos solo cuando se ven:** las fotos se cargan recién cuando aparecen en pantalla.
- **Tope de fotos:** como máximo 6 fotos por lugar.
- **Tamaños fijos:** 480 px en la lista y 1200 px en la galería.
- **Sin pagar dos veces la misma foto:** el navegador recuerda cada foto 30 minutos.
- **Links protegidos:** firmados y con vencimiento, así nadie los usa para gastar tu cuota.

**Recomendado:** en Google Cloud → **APIs y servicios** → **Places API (New)** → **Cuotas**, limitá también las consultas de fotos por día (por ejemplo, **"GetPhotoMedia per day" = 300**).

## Probar las fotos

1. En la web de LISTO buscá, por ejemplo, **cena en Palermo**.
2. Cada opción tiene que mostrar una **foto real** con su autor debajo. Si el lugar no tiene fotos, aparece el placeholder de LISTO.
3. Abrí una propuesta (/propuesta/CÓDIGO): muestra una foto del lugar con su autor.
4. Probalo también en el celular.

---

# Lugares reales en la web principal

La web usa `/api/plan-options?category=…&zone=…`, una función pública que no pide contraseña pero está acotada:

- **Sin búsquedas libres:** solo acepta `restaurantes`, `bares` o `salones`, más una zona escrita con letras.
- **Cómo se elige la categoría:**
  - tragos sin comida, after office o despedida → **bares**;
  - más de 40 personas o eventos grandes (casamiento, 15, corporativo…) → **salones**;
  - todo lo demás → **restaurantes**.
- **Cómo elige los 3 lugares:**
  - excluye lugares cerrados (definitiva o temporalmente) y repetidos;
  - prioriza los que están en la zona pedida;
  - después, los que tienen rating y al menos 20 reseñas.
- **Providers:** cada búsqueda guarda y actualiza los lugares en `providers`, sin duplicar.
- **Costo:** cada búsqueda nueva es 1 *Text Search*. La misma búsqueda repetida en los 10 minutos siguientes sale de la caché de Vercel y no vuelve a llamar a Google. Además, cada visitante puede hacer como máximo unas 30 búsquedas cada 10 minutos.
- **"Elegir esta opción"** por ahora queda registrado solo en el navegador del usuario. Para guardarlo en Supabase hace falta una tabla nueva, pendiente de aprobación.
