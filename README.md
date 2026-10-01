# LISTO

Tenés el plan. Nosotros hacemos el resto.

Escribís lo que querés hacer (una cena, un cumpleaños, una juntada, una noche) y LISTO lo ordena y te muestra tres formas de hacerlo.

> Versión beta: las 3 opciones son lugares reales de Google Maps. Precio y disponibilidad siempre a confirmar: LISTO todavía no reserva ni cobra.

## Archivos

- `index.html`: el contenido de las tres pantallas (inicio, "esto entendimos" y opciones).
- `styles.css`: el diseño editorial (tipografía Anton + Inter, paleta carbón/crema/madera, adaptación a celular).
- `app.js`: la lógica. Interpreta el texto, deja editar cada dato tocándolo y muestra 3 lugares reales (con fotos, Maps, compartir y elegir).
- `config.js`: **el único archivo donde se pegan los datos de Supabase** (Project URL y clave pública).
- `supabase.js`: guarda cada pedido en la tabla `event_requests` al tocar "Buscar opciones".

Para activar el guardado en Supabase, seguí la guía paso a paso: [SUPABASE.md](SUPABASE.md).

### Google Places

- `api/plan-options.js`: función pública de Vercel que usa la web. Busca restaurantes, bares o salones en la zona pedida, elige 3, guarda los proveedores sin duplicar y devuelve fotos con links firmados.

- `api/places-search.js`: función de Vercel (servidor) que busca lugares reales en Google Places y los guarda en la tabla `providers`.
- `api/_lib/`: la lógica de Google Places y del guardado sin duplicados.
- `prueba-google.html`: página interna para probar la búsqueda (protegida con contraseña).

Guía paso a paso: [GOOGLE-PLACES.md](GOOGLE-PLACES.md).

Las fotos son de [Unsplash](https://unsplash.com) (uso libre) y se cargan directamente desde su servidor.
Para cambiar una foto, buscá en los archivos el código que empieza con `photo-` y reemplazalo por el de otra imagen de Unsplash.

## Verla online con GitHub Pages (gratis)

1. En GitHub, entrá al repositorio y andá a **Settings** → **Pages**.
2. En **Source** elegí **Deploy from a branch**.
3. En **Branch** elegí la rama donde están estos archivos y la carpeta **/ (root)**. Tocá **Save**.
4. Esperá 1 o 2 minutos: arriba vas a ver el link, con esta forma:
   `https://<tu-usuario>.github.io/<nombre-del-repo>/`
