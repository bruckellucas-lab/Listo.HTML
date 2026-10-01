# Conectar LISTO con Supabase

Cuando alguien toca **BUSCAR OPCIONES**, LISTO guarda el pedido en la tabla `event_requests`:
`original_prompt`, `event_type`, `guests`, `zone`, `budget`, `needs` y `status = 'new'`.

Hay que hacer 3 cosas, una sola vez.

---

## Paso 1 · Darle permiso a la web para crear pedidos (Row Level Security)

Supabase bloquea por defecto todo lo que llega desde una web pública. Hay que permitir **solamente crear pedidos nuevos** (la web no va a poder leer, cambiar ni borrar nada).

1. Entrá a [supabase.com](https://supabase.com) y abrí tu proyecto.
2. En el menú de la izquierda, tocá **SQL Editor**.
3. Tocá **New query** (o el botón **+**).
4. Copiá y pegá **todo** este bloque:

```sql
-- 1) Activar la seguridad por filas (si ya estaba activada, no pasa nada)
alter table public.event_requests enable row level security;

-- 2) Permitir que la web SOLO cree pedidos nuevos
drop policy if exists "La web puede crear pedidos" on public.event_requests;
create policy "La web puede crear pedidos"
  on public.event_requests
  for insert
  to anon
  with check (
    status = 'new'
    and original_prompt is not null
    and char_length(original_prompt) between 8 and 2000
  );

-- 3) Dar permiso de inserción al rol público de la web
grant insert on table public.event_requests to anon;
```

5. Tocá **Run** (abajo a la derecha). Tiene que decir **Success. No rows returned**.

> No agregamos ningún permiso de lectura a propósito: nadie desde la web puede ver los pedidos de otros. Vos los ves igual desde el panel de Supabase.

---

## Paso 2 · Copiar los dos datos de Supabase

Necesitás **2 datos**. Los dos están en el panel de Supabase:

| Dato | Dónde está | Cómo se ve |
|---|---|---|
| **Project URL** | Botón **Connect** arriba de todo, o ⚙️ **Project Settings → Data API** | `https://abcdefghijk.supabase.co` |
| **Publishable key** (clave pública) | ⚙️ **Project Settings → API Keys** | `sb_publishable_...` |

Si en **API Keys** no ves una "Publishable key", abrí la pestaña **Legacy API Keys** y copiá la que dice **`anon` `public`** (empieza con `eyJ...`). Sirve igual.

⛔ **No copies nunca** la **`service_role`** ni la **Secret key** (`sb_secret_...`). Son privadas. Igual, si por error la pegás, LISTO se niega a usarla y no manda nada.

---

## Paso 3 · Pegar los datos en `config.js`

1. En GitHub, abrí el repositorio.
2. Arriba a la izquierda, en el selector de rama, elegí la rama que publica GitHub Pages.
3. Abrí el archivo **`config.js`**.
4. Tocá el ícono del **lápiz** (Edit this file).
5. Reemplazá:
   - `PEGAR_ACA_PROJECT_URL` por tu **Project URL**
   - `PEGAR_ACA_PUBLISHABLE_KEY` por tu **Publishable key**

   Tiene que quedar así (con tus datos, **entre comillas**):

   ```js
   window.LISTO_CONFIG = {
     supabaseUrl: "https://abcdefghijk.supabase.co",
     supabaseKey: "sb_publishable_xxxxxxxxxxxx"
   };
   ```

6. Tocá **Commit changes…** y de nuevo **Commit changes**.
7. Esperá 1 o 2 minutos a que GitHub Pages se actualice.

---

## Probar

1. Abrí tu web, escribí un plan, tocá **ARMAR MI PLAN** y después **BUSCAR OPCIONES**.
2. Abajo tiene que aparecer: **"Listo: guardamos tu pedido."**
3. En Supabase, entrá a **Table Editor → event_requests**: vas a ver la fila nueva con `status = new`.

## Si aparece un error

| Mensaje en la web | Qué hacer |
|---|---|
| "El guardado todavía no está activado…" | Falta el Paso 3 (o quedó algún `PEGAR_ACA`). |
| "…falta darle permiso a la web…" | Falta el Paso 1, o no dijo *Success*. Repetilo. |
| "…la clave de Supabase no es válida" | Revisá que copiaste la clave completa, sin espacios. |
| "…no encontramos la tabla event_requests" | Revisá que la tabla se llame exactamente `event_requests` y esté en el esquema `public`. |
| "…algún dato no coincide con las columnas" | Revisá los tipos de columna (ver abajo). |
| "No pudimos conectarnos con la base de datos…" | Revisá el Project URL en `config.js`. |

### Tipos de columna recomendados

| Columna | Tipo |
|---|---|
| `original_prompt`, `event_type`, `zone`, `status` | `text` |
| `guests` | `int4` / `int8` |
| `budget` | `int8` o `numeric` |
| `needs` | `text[]` (lista) o `jsonb`. Si es `text`, LISTO lo guarda como "Lugar, Comida, Bebida". |

---

## Paso 4 · Guardar "Elegir esta opción" (tabla plan_selections)

Cuando el usuario toca **Elegir esta opción**, LISTO guarda qué pedido eligió qué lugar, cuándo y en qué estado. Por ahora **no reserva ni cobra nada**.

**Cómo se vincula con el pedido, sin agregar columnas a `event_requests`:** al guardar el pedido, la web le asigna su `id` UUID (un número aleatorio imposible de adivinar). Así la web conoce el `id` sin necesidad de leer la tabla, que sigue cerrada al público.

### Crear la tabla

1. En Supabase, abrí **SQL Editor** → **New query**.
2. Pegá todo este bloque y tocá **Run**. Tiene que decir **Success**.

```sql
create table if not exists public.plan_selections (
  id                        uuid        primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  event_request_id          uuid        not null references public.event_requests(id) on delete cascade,
  provider_google_place_id  text        not null references public.providers(google_place_id),
  provider_name             text        not null,
  status                    text        not null default 'interested'
                                        check (status in ('interested', 'replaced'))
);

-- Un pedido puede tener una sola elección activa (evita duplicados por doble clic).
create unique index if not exists plan_selections_one_active
  on public.plan_selections (event_request_id)
  where status = 'interested';

-- Cerrada al público: solo el servidor de Vercel (con la clave secreta) puede leer y escribir.
alter table public.plan_selections enable row level security;
```

| Columna | Tipo | Valor por defecto | Para qué sirve |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | Identificador de la elección |
| `created_at` | timestamptz | `now()` | Cuándo eligió |
| `updated_at` | timestamptz | `now()` | Cuándo cambió el estado por última vez |
| `event_request_id` | uuid | — | Qué pedido (apunta a `event_requests.id`) |
| `provider_google_place_id` | text | — | Qué lugar (apunta a `providers.google_place_id`) |
| `provider_name` | text | — | Nombre del lugar en ese momento |
| `status` | text | `'interested'` | `interested` = elección activa · `replaced` = la cambió por otra |

> Si el usuario cambia de opción, la anterior queda como `replaced` y se guarda la nueva como `interested`. Así queda el historial completo.

### Ver las elecciones con el pedido y el lugar

En **SQL Editor** podés correr esto para ver todo junto:

```sql
select s.created_at, s.status, s.provider_name, r.original_prompt, r.event_type, r.guests, r.zone
from public.plan_selections s
join public.event_requests r on r.id = s.event_request_id
order by s.created_at desc;
```

---

## Paso 5 · "Quiero avanzar" (tabla plan_inquiries)

Cuando el usuario ya eligió un lugar y toca **Quiero avanzar**, deja sus datos de contacto para que LISTO consulte disponibilidad y condiciones. **No es una reserva.**

**Cómo se vinculan las tablas** (sin repetir datos):

```
event_requests  (el pedido: tipo, personas, zona, presupuesto, necesidades)
   ↑ event_request_id
plan_selections (qué lugar eligió y cuándo)
   ↑ plan_selection_id
plan_inquiries  (datos de contacto para avanzar + estado)
```

### Crear la tabla

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
create table if not exists public.plan_inquiries (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  plan_selection_id  uuid        not null references public.plan_selections(id) on delete cascade,
  contact_name       text        not null,
  contact_phone      text        not null,
  contact_email      text,
  event_date         date        not null,
  approximate_time   text        not null,
  notes              text,
  status             text        not null default 'inquiry_requested'
);

-- Una sola solicitud abierta por elección (un doble envío actualiza en vez de duplicar).
create unique index if not exists plan_inquiries_one_open
  on public.plan_inquiries (plan_selection_id)
  where status = 'inquiry_requested';

-- Datos personales: cerrada al público. Solo el servidor de Vercel puede leer y escribir.
alter table public.plan_inquiries enable row level security;
```

| Columna | Tipo | Valor por defecto | Qué guarda |
|---|---|---|---|
| `id` | uuid | se genera solo | identificador de la solicitud |
| `created_at` / `updated_at` | timestamptz | ahora | cuándo se envió y cuándo se actualizó |
| `plan_selection_id` | uuid | — | qué elección (de ahí salen el lugar y el pedido) |
| `contact_name` | text | — | nombre |
| `contact_phone` | text | — | WhatsApp |
| `contact_email` | text | vacío | email (opcional) |
| `event_date` | date | — | fecha del plan |
| `approximate_time` | text | — | horario aproximado (ej. `21:00`) |
| `notes` | text | vacío | comentario (opcional) |
| `status` | text | `inquiry_requested` | estado de la solicitud |

`status` no tiene lista cerrada a propósito: más adelante podrá pasar a estados como `contacting`, `quoted`, `confirmed` o `cancelled` sin cambiar la tabla.

### Ver las solicitudes con todo el contexto

```sql
select i.created_at, i.status, i.contact_name, i.contact_phone, i.contact_email,
       i.event_date, i.approximate_time, i.notes,
       s.provider_name, r.event_type, r.guests, r.zone, r.budget, r.needs, r.original_prompt
from public.plan_inquiries i
join public.plan_selections s on s.id = i.plan_selection_id
join public.event_requests  r on r.id = s.event_request_id
order by i.created_at desc;
```

---

## Paso 6 · Aviso por email de cada "Quiero avanzar" (Resend)

Cada vez que se guarda una solicitud, LISTO intenta mandar un email a **listoeventoss@gmail.com** con todos los datos y un botón **ABRIR WHATSAPP**. Ese botón abre una conversación con el teléfono del usuario; LISTO no manda nada por WhatsApp. Si el email falla, la solicitud no se pierde y el usuario igual ve la confirmación.

### Agregar las columnas

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
alter table public.plan_inquiries
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notified_at timestamptz;

alter table public.plan_inquiries
  drop constraint if exists plan_inquiries_notification_status_check;

alter table public.plan_inquiries
  add constraint plan_inquiries_notification_status_check
  check (notification_status in ('pending', 'sent', 'failed'));
```

| `notification_status` | Significa |
|---|---|
| `pending` | se guardó la solicitud y todavía no se intentó o terminó de enviar el email |
| `sent` | el email salió bien (`notified_at` = cuándo) |
| `failed` | el email falló (`notified_at` vacío). El motivo se ve en los registros de Vercel (**Logs**), no en Supabase |

> Las solicitudes que ya existían antes de correr esto van a figurar como `pending`.

### Ver las solicitudes cuyo email falló

```sql
select created_at, contact_name, contact_phone, event_date, approximate_time
from public.plan_inquiries
where notification_status <> 'sent'
order by created_at desc;
```

### Resend (resumen)

1. **Crear la cuenta** en [resend.com](https://resend.com) **con listoeventoss@gmail.com**. Sin dominio propio, Resend solo entrega emails a esa dirección.
2. **Crear la clave:** **API Keys** → **Create API Key**, con permiso **Sending access**. Copiá la clave que empieza con `re_`.
3. **Cargarla en Vercel:** **Settings → Environment Variables** → `RESEND_API_KEY` = la clave, para **Production** y **Preview**. Después hacé **Redeploy**.
4. **Remitente:** en la etapa de prueba sale desde `LISTO <onboarding@resend.dev>`. Si el primer email llega a **Spam**, marcalo como "No es spam".

---

## Paso 7 · Panel interno /admin

En **/admin** se ven y gestionan todas las solicitudes de "Quiero avanzar", sin entrar a Supabase. El panel está protegido con contraseña, y los datos y los cambios de estado pasan siempre por Vercel: Supabase sigue cerrado al público.

### Estados

| Estado (interno) | En el panel | ¿Cuenta como "abierta"? |
|---|---|---|
| `inquiry_requested` | Nueva | sí |
| `provider_contacted` | Contactando proveedor | sí |
| `quoted` | Cotizado | sí |
| `confirmed` | Confirmado | sí |
| `cancelled` | Cancelado | no |
| `completed` | Completado | no |

- **Si está abierta y el usuario reenvía "Quiero avanzar":** se actualizan sus datos en esa misma solicitud, sin crear otra y sin cambiar el estado.
- **Si está cerrada:** el reenvío crea una solicitud nueva.
- **Fecha de cambio:** cada cambio de estado desde el panel actualiza `updated_at`.
- **Sin avisos automáticos:** cambiar un estado no manda emails ni WhatsApp.

### SQL (correr una vez)

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
alter table public.plan_inquiries
  drop constraint if exists plan_inquiries_status_check;

alter table public.plan_inquiries
  add constraint plan_inquiries_status_check
  check (status in ('inquiry_requested','provider_contacted','quoted','confirmed','cancelled','completed'));

drop index if exists plan_inquiries_one_open;

create unique index plan_inquiries_one_open
  on public.plan_inquiries (plan_selection_id)
  where status in ('inquiry_requested','provider_contacted','quoted','confirmed');
```

### Variable en Vercel

**Settings → Environment Variables** → `ADMIN_PASSWORD` = una contraseña de **16 caracteres o más**, para **Production** y **Preview**. Después hacé **Redeploy**.

- Al entrar, el navegador recibe un pase que dura **12 horas** y que la página no puede leer.
- Si cambiás `ADMIN_PASSWORD`, todos los pases anteriores dejan de valer.
- Después de 8 intentos fallidos seguidos, el ingreso se bloquea 15 minutos.
