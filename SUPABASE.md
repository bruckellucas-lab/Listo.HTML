# Conectar LISTO con Supabase

Cuando alguien toca **BUSCAR OPCIONES**, LISTO guarda el pedido en la tabla `event_requests`:
`original_prompt`, `event_type`, `guests`, `zone`, `budget`, `needs`, `dietary_requirements` y `status = 'new'`.

Desde **P1A (octubre 2026)** el navegador **ya no escribe en Supabase**: la web manda el pedido a `/api/event-request` (Vercel), que lo valida y lo guarda con la clave secreta (`SUPABASE_SECRET_KEY`). La web no tiene ninguna clave de Supabase (se eliminó `config.js`).

Los cambios nuevos de la base se versionan en [`supabase/migrations/`](supabase/migrations/README.md).

---

## Historia · Cómo se guardaba antes (hasta P1A)

Antes, el navegador escribía directo en `event_requests` con la clave pública (publishable) y esta policy:

```sql
-- (HISTÓRICO, no volver a correr)
create policy "La web puede crear pedidos"
  on public.event_requests for insert to anon
  with check (status = 'new' and original_prompt is not null and char_length(original_prompt) between 8 and 2000);
grant insert on table public.event_requests to anon;
```

Esa escritura pública se cierra con la migration `supabase/migrations/20261005120100_p1a_close_event_requests_anon_insert.sql`, **recién cuando P1A ya funciona en producción** (ver el orden en `supabase/migrations/README.md`).

## Probar

1. Abrí tu web, escribí un plan, tocá **ARMAR MI PLAN** y después **BUSCAR OPCIONES**.
2. Abajo tiene que aparecer: **"Listo: guardamos tu pedido."**
3. En Supabase, entrá a **Table Editor → event_requests**: vas a ver la fila nueva con `status = new`.

Si no se guarda, en Vercel → **Logs** buscá `[event-request]` o `[rate-limit]`: dice el paso y el código del error (nunca el contenido del pedido ni la IP).

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

---

## Paso 8 · Contacto con el proveedor y cotizaciones (/admin)

En el detalle de cada solicitud del panel:

- **Proveedor:** datos del lugar, Maps, website y si ya lo contactaste (cuándo y por dónde).
- **Contacto:**
  - **Preparar contacto →** arma un mensaje con datos reales del pedido: tipo de plan, personas, fecha, horario, zona y necesidades. Sin presupuesto ni datos del usuario.
  - **Copiar mensaje** lo copia. LISTO no envía nada.
  - **Marcar como contactado** guarda la fecha y el canal. Si la solicitud estaba en Nueva, pasa a Contactando proveedor.
- **Cotización:** se carga a mano, con los datos que te pasó el proveedor. Al guardarla, la solicitud pasa a **Cotizado**, salvo que esté en Confirmado, Cancelado o Completado. **Confirmado sigue siendo manual.**
- **Historial:** cada cotización nueva se agrega; las anteriores no se borran.

Cada acción actualiza `updated_at`. No se envían emails ni WhatsApp.

### SQL (correr una vez)

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
-- Contacto con el proveedor (en la solicitud)
alter table public.plan_inquiries
  add column if not exists provider_contacted_at timestamptz,
  add column if not exists provider_contact_channel text;

alter table public.plan_inquiries
  drop constraint if exists plan_inquiries_contact_channel_check;
alter table public.plan_inquiries
  add constraint plan_inquiries_contact_channel_check
  check (provider_contact_channel is null
         or provider_contact_channel in ('whatsapp','phone','email','instagram','other'));

-- Cotizaciones (con historial)
create table if not exists public.provider_quotes (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  plan_inquiry_id   uuid        not null references public.plan_inquiries(id) on delete cascade,
  received_at       timestamptz not null default now(),
  total_price       numeric(14,2) check (total_price is null or total_price >= 0),
  price_per_person  numeric(14,2) check (price_per_person is null or price_per_person >= 0),
  currency          text        not null default 'ARS' check (currency in ('ARS','USD')),
  includes          text,
  conditions        text,
  deposit           text,
  availability      text        not null default 'pending' check (availability in ('yes','no','pending')),
  valid_until       date,
  internal_notes    text,
  constraint provider_quotes_has_price check (total_price is not null or price_per_person is not null)
);

create index if not exists provider_quotes_by_inquiry
  on public.provider_quotes (plan_inquiry_id, received_at desc);

-- Cerrada al público: solo Vercel (con la clave secreta) lee y escribe
alter table public.provider_quotes enable row level security;
```

> Si el panel se publica antes de correr este SQL, la lista sigue funcionando y muestra un aviso. Contacto y cotizaciones quedan bloqueados hasta correrlo.

---

## Paso 9 · Propuesta para el usuario (/propuesta/CÓDIGO)

Desde el detalle de una solicitud en /admin, dentro de **Cotización**:

- **Generar propuesta →** crea un link privado como `https://tu-sitio/propuesta/Ab3dE9xYz2Qk`. El código tiene 12 caracteres al azar y no sale de ningún dato interno.
- **Copiar link** y **Abrir propuesta**. Mandás el link vos, por WhatsApp. LISTO no lo envía solo.
- En el panel se ve:
  - el estado: **Enviada**, **Aceptada**, **Pidió otra opción** o **Reemplazada**;
  - cuántas veces la abrió el usuario, y la primera y la última vez;
  - el comentario del usuario, si dejó uno.

  Tus aperturas desde el panel no se cuentan.
- Si cargás una cotización nueva y generás otra propuesta, el link anterior pasa a **Reemplazada** y deja de mostrar los datos viejos.

Qué ve el usuario:

- el lugar, con foto, dirección y "Ver en Maps";
- su plan: fecha, horario, personas y zona;
- el precio, qué incluye, las condiciones, la seña, la disponibilidad y la validez.

Puede tocar **ACEPTAR PROPUESTA →** o **QUIERO OTRA OPCIÓN** (con un comentario opcional). En los dos casos llega un email a listoeventoss@gmail.com. Si el email falla, la respuesta queda guardada igual.

- Si la cotización venció (`valid_until` ya pasó), no se puede aceptar. El servidor también lo controla.
- Aceptar **no** confirma la reserva: la solicitud no cambia de estado. **Confirmado** lo seguís marcando vos, cuando el lugar confirma.

### SQL (correr una vez)

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
create table if not exists public.plan_proposals (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  public_code        text        not null unique check (public_code ~ '^[A-Za-z0-9]{12}$'),
  plan_inquiry_id    uuid        not null,
  provider_quote_id  uuid        not null,
  status             text        not null default 'proposal_sent'
                     check (status in ('proposal_sent','proposal_accepted','proposal_declined','proposal_replaced')),
  first_viewed_at    timestamptz,
  last_viewed_at     timestamptz,
  view_count         integer     not null default 0,
  responded_at       timestamptz,
  user_comment       text        check (user_comment is null or char_length(user_comment) <= 1000),
  constraint plan_proposals_plan_inquiry_id_fkey
    foreign key (plan_inquiry_id) references public.plan_inquiries(id) on delete cascade,
  constraint plan_proposals_provider_quote_id_fkey
    foreign key (provider_quote_id) references public.provider_quotes(id) on delete cascade
);

-- Una sola propuesta "Enviada" por solicitud
create unique index if not exists plan_proposals_one_open
  on public.plan_proposals (plan_inquiry_id) where status = 'proposal_sent';

create index if not exists plan_proposals_by_inquiry
  on public.plan_proposals (plan_inquiry_id, created_at desc);

-- Cerrada al público: solo Vercel (con la clave secreta) lee y escribe
alter table public.plan_proposals enable row level security;
```

> Si el panel se publica antes de correr este SQL, todo sigue funcionando y en Cotización aparece un aviso. Generar propuestas queda bloqueado hasta correrlo.

---

## Paso 10 · Reserva confirmada y comisión (/admin)

"Propuesta aceptada" **no** es "Reserva confirmada". La reserva pasa a **Confirmado** solo cuando vos la confirmás desde /admin, después de que el lugar aceptó.

En el detalle de cada solicitud:

- **RESERVA → CONFIRMAR RESERVA →** abre un formulario con:
  - cómo aceptó el usuario:
    - **desde el link**: tocó "Aceptar propuesta";
    - **manual**: aceptó por WhatsApp, teléfono, email u otro canal. El canal y una nota ("Aceptó por WhatsApp el 02/10.") son obligatorios;
  - el monto final y la moneda;
  - el tipo de comisión: **porcentaje** (hasta 30%) o **monto fijo**;
  - la fecha de confirmación y la fecha estimada de cobro (opcional);
  - las notas internas.

  El panel muestra cuánto cobra LISTO antes de guardar (por ejemplo, 8% de $ 500.000 = $ 40.000). El servidor vuelve a hacer el cálculo y Supabase lo controla. Al confirmar, se crea el registro y la solicitud pasa a **Confirmado**.
- **COMISIÓN:** botones **Marcar como facturada**, **Marcar como pagada** (con fecha de cobro) y **Marcar como exenta**. Pagada y exenta son estados finales: si hubo un error, se corrige a mano en Supabase.
- **Cancelar reserva:** la solicitud pasa a Cancelado y la comisión pendiente o facturada queda exenta. Si la comisión ya está pagada, no se puede cancelar.
- **Confirmado:** solo se marca con CONFIRMAR RESERVA, nunca desde el selector de estado. Mientras haya una reserva activa, la solicitud solo puede estar en Confirmado, Completado o Cancelado.
- **Arriba de la lista:** se ven las reservas confirmadas, el valor total, la comisión pendiente y la cobrada, separadas por moneda (ARS y USD nunca se suman entre sí).

No se mueve dinero ni se mandan emails: solo se registra la operación. Nada de esto se muestra en la web pública.

### SQL (correr una vez)

En **SQL Editor** → **New query**, pegá todo y tocá **Run**:

```sql
create table if not exists public.plan_bookings (
  id                        uuid          primary key default gen_random_uuid(),
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),
  plan_inquiry_id           uuid          not null,
  provider_quote_id         uuid          not null,
  plan_proposal_id          uuid,
  provider_google_place_id  text          not null,

  -- Cómo aceptó el usuario
  acceptance_source         text          not null
                            check (acceptance_source in ('proposal_link','manual')),
  acceptance_channel        text
                            check (acceptance_channel is null
                                   or acceptance_channel in ('whatsapp','phone','email','other')),
  acceptance_note           text          check (acceptance_note is null or char_length(acceptance_note) <= 500),

  -- Reserva
  booking_status            text          not null default 'confirmed'
                            check (booking_status in ('confirmed','cancelled')),
  confirmed_at              timestamptz   not null,
  cancelled_at              timestamptz,
  final_total_amount        numeric(14,2) not null check (final_total_amount > 0),
  currency                  text          not null check (currency in ('ARS','USD')),

  -- Comisión
  commission_type           text          not null check (commission_type in ('percentage','fixed')),
  commission_rate           numeric(5,2),
  commission_amount         numeric(14,2) not null check (commission_amount >= 0),
  commission_status         text          not null default 'pending'
                            check (commission_status in ('pending','invoiced','paid','waived')),
  commission_due_date       date,
  commission_invoiced_at    timestamptz,
  commission_paid_at        timestamptz,
  internal_notes            text,

  -- Vínculos (con nombre explícito; nunca se borran en cascada)
  constraint plan_bookings_plan_inquiry_id_fkey
    foreign key (plan_inquiry_id) references public.plan_inquiries(id) on delete restrict,
  constraint plan_bookings_provider_quote_id_fkey
    foreign key (provider_quote_id) references public.provider_quotes(id) on delete restrict,
  constraint plan_bookings_plan_proposal_id_fkey
    foreign key (plan_proposal_id) references public.plan_proposals(id) on delete restrict,
  constraint plan_bookings_provider_fkey
    foreign key (provider_google_place_id) references public.providers(google_place_id),

  -- Aceptación: por link (con propuesta) o manual (con canal y nota obligatorios)
  constraint plan_bookings_acceptance_ok check (
    (acceptance_source = 'proposal_link' and plan_proposal_id is not null
       and acceptance_channel is null)
    or (acceptance_source = 'manual' and acceptance_channel is not null
       and acceptance_note is not null and char_length(btrim(acceptance_note)) >= 5)
  ),

  -- Comisión: porcentaje entre 0 y 30 con cálculo exacto, o monto fijo no mayor al total
  constraint plan_bookings_commission_ok check (
    (commission_type = 'percentage' and commission_rate > 0 and commission_rate <= 30
       and commission_amount = round(final_total_amount * commission_rate / 100, 2))
    or (commission_type = 'fixed' and commission_rate is null
       and commission_amount <= final_total_amount)
  ),

  -- Facturada: siempre con fecha de facturación
  constraint plan_bookings_invoiced_has_date
    check (commission_status <> 'invoiced' or commission_invoiced_at is not null),

  -- Pagada: siempre con fecha de cobro y solo con reserva confirmada
  constraint plan_bookings_paid_has_date
    check ((commission_status = 'paid') = (commission_paid_at is not null)),
  constraint plan_bookings_paid_needs_booking
    check (commission_status <> 'paid' or booking_status = 'confirmed')
);

-- Nunca dos reservas confirmadas para la misma solicitud
create unique index if not exists plan_bookings_one_active
  on public.plan_bookings (plan_inquiry_id) where booking_status = 'confirmed';

create index if not exists plan_bookings_by_commission
  on public.plan_bookings (commission_status, confirmed_at desc);

-- Cerrada al público: solo Vercel (con la clave secreta) lee y escribe
alter table public.plan_bookings enable row level security;
```

> Si el panel se publica antes de correr este SQL, todo sigue funcionando como antes y la sección Reserva muestra un aviso. Mientras tanto no se puede pasar ninguna solicitud a Confirmado.
