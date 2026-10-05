# LISTO

Tenés el plan. Nosotros hacemos el resto.

Escribís lo que querés hacer (una cena, un cumpleaños, una juntada, una noche) y LISTO lo ordena y te muestra tres formas de hacerlo.

> Versión beta: las 3 opciones son lugares reales de Google Maps. Precio y disponibilidad siempre a confirmar: LISTO todavía no reserva ni cobra.

## Archivos

- `index.html`: el contenido de las tres pantallas (inicio, "esto entendimos" y opciones).
- `styles.css`: el diseño editorial (tipografía Anton + Inter, paleta carbón/crema/madera, adaptación a celular).
- `app.js`: la lógica. Interpreta el texto, deja editar cada dato tocándolo y muestra 3 lugares reales (con fotos, Maps, compartir y elegir).
- `event-request.js`: al tocar "Buscar opciones", manda el pedido a `/api/event-request`. La web no tiene ninguna clave de Supabase.
- `api/event-request.js`: valida el pedido y lo guarda en `event_requests` desde Vercel (clave secreta).

Para activar el guardado en Supabase, seguí la guía paso a paso: [SUPABASE.md](SUPABASE.md).

### Google Places

- `api/plan-options.js`: función pública de Vercel que usa la web. Busca restaurantes, bares o salones en la zona pedida, elige 3, guarda los proveedores sin duplicar y devuelve fotos con links firmados.

- `api/place-photo.js`: muestra cada foto de Google con un link firmado que vence (la clave de Google nunca llega al navegador).
- `api/_lib/`: la lógica de Google Places y del guardado sin duplicados.

Guía paso a paso: [GOOGLE-PLACES.md](GOOGLE-PLACES.md).

### Panel interno

- `admin/index.html`: panel en **/admin** para gestionar las solicitudes de "Quiero avanzar" (protegido con `ADMIN_PASSWORD`).
- `api/admin-login.js` y `api/admin-inquiries.js`: ingreso y datos del panel (todo pasa por Vercel).

Guía: [SUPABASE.md](SUPABASE.md), Paso 7.

### Propuesta para el usuario

- `propuesta/index.html`: la página privada **/propuesta/CÓDIGO** que ve el usuario (aceptar o pedir otra opción).
- `api/proposal.js` (pública) y `api/admin-proposals.js` (panel): leen y guardan las propuestas desde Vercel.
- `vercel.json`: hace que `/propuesta/CÓDIGO` abra esa página.

Guía: [SUPABASE.md](SUPABASE.md), Paso 9.

### Reserva confirmada y comisión

- `api/admin-bookings.js`: CONFIRMAR RESERVA, comisión (facturada / pagada / exenta) y cancelación, desde /admin.
- `api/_lib/bookings.js`: validaciones y cálculo de la comisión (siempre en el servidor).

Guía: [SUPABASE.md](SUPABASE.md), Paso 10.

Las fotos son de [Unsplash](https://unsplash.com) (uso libre) y se cargan directamente desde su servidor.
Para cambiar una foto, buscá en los archivos el código que empieza con `photo-` y reemplazalo por el de otra imagen de Unsplash.

### Pruebas automáticas

- `tests/`: pruebas sin dependencias (sólo Node 18 o más nuevo). No llaman a Google, Supabase ni Resend.
- `npm run check`: revisa la sintaxis de todos los archivos y que `/api` no pase de **12 funciones** (el límite de Vercel Hobby; con 13 el deploy falla).
- `npm test`: corre las pruebas (lugares, propuestas, reservas y comisión, restricciones alimentarias, guardado de pedidos, límite de pedidos, firma de fotos, email interno y controles de seguridad).
- `supabase/migrations/`: cambios de la base versionados desde P1A (se corren a mano; ver su README).
- `.github/workflows/test.yml`: GitHub corre ambos controles en cada push y pull request. No publica nada.

### Seguridad

- Las claves privadas viven sólo en Vercel. La web nunca las ve.
- Los pedidos que guardan o cambian datos tienen que llegar como JSON (si no, responden 415).
- El navegador no escribe en Supabase: todo pasa por `/api` (Vercel).
- Límite de pedidos por visitante **persistente** en Supabase (`api/_lib/rate-limit.js` + migration `supabase/migrations/20261005120000_p1a_rate_limits.sql`). Se guarda una huella HMAC, nunca la IP. Necesita `RATE_LIMIT_SECRET` en Vercel.
- Las fotos se firman con `PHOTO_SIGNING_SECRET` (sólo para eso).
- El email interno de cada solicitud lleva sólo lo necesario para reaccionar; el resto se ve en /admin.
- Pendiente P1B: Cloudflare Turnstile (anti-robots) en los formularios públicos.
- `vercel.json` agrega a todas las páginas: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (nadie puede meter LISTO dentro de otra página) y `Permissions-Policy` (sin cámara, micrófono ni ubicación).
- Pendiente a futuro: una Content-Security-Policy estricta. Hoy no se activa porque la web usa scripts y estilos dentro del HTML y fotos/tipografías externas; activarla sin preparar eso rompería la página.

## Verla online con GitHub Pages (gratis)

1. En GitHub, entrá al repositorio y andá a **Settings** → **Pages**.
2. En **Source** elegí **Deploy from a branch**.
3. En **Branch** elegí la rama donde están estos archivos y la carpeta **/ (root)**. Tocá **Save**.
4. Esperá 1 o 2 minutos: arriba vas a ver el link, con esta forma:
   `https://<tu-usuario>.github.io/<nombre-del-repo>/`
