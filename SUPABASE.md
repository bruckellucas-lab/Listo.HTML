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
