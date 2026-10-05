-- =========================================================
-- LISTO · P1A · Migration 1 de 2 — Límite de pedidos persistente
-- Correr ANTES de publicar el backend de P1A (Preview o Production).
-- Es aditiva: no toca ninguna tabla existente. La web actual no la usa.
--
-- Qué crea:
--   - tabla public.api_rate_limits: un contador por (acción, visitante, ventana de tiempo).
--     El visitante es una huella HMAC-SHA256 (64 caracteres hex) calculada en Vercel
--     con RATE_LIMIT_SECRET. Acá NUNCA llega ni se guarda la IP.
--   - función public.listo_rate_limit_hit(...): suma 1 de forma atómica y dice si se pasó.
-- Quién puede usarlas: sólo el backend (service_role / clave secreta). anon y authenticated, nada.
-- =========================================================

create table if not exists public.api_rate_limits (
  scope        text        not null,
  key_hash     text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  expires_at   timestamptz not null,
  constraint api_rate_limits_pkey primary key (scope, key_hash, window_start),
  constraint api_rate_limits_scope_ok check (scope in
    ('event_request', 'plan_options', 'plan_selection', 'plan_inquiry', 'proposal_response', 'admin_login')),
  -- Sólo huellas: 64 caracteres hexadecimales. Una IP (con puntos o ":") no entra.
  constraint api_rate_limits_key_is_hash check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limits_hits_ok check (hits >= 0)
);

create index if not exists api_rate_limits_expires_idx on public.api_rate_limits (expires_at);

comment on table public.api_rate_limits is
  'LISTO: límite de pedidos por visitante. key_hash = HMAC (sin IPs). Sólo backend. Las filas vencidas se borran solas.';

-- Cerrada al público: RLS activado y sin policies; sin permisos para anon/authenticated.
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.listo_rate_limit_hit(
  p_scope text,
  p_key text,
  p_window_seconds integer,
  p_max integer
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_hits  integer;
begin
  if p_scope is null or p_scope not in
     ('event_request', 'plan_options', 'plan_selection', 'plan_inquiry', 'proposal_response', 'admin_login') then
    raise exception 'scope no válido' using errcode = '22023';
  end if;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'clave no válida (tiene que ser una huella)' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'ventana no válida' using errcode = '22023';
  end if;
  if p_max is null or p_max < 1 or p_max > 10000 then
    raise exception 'máximo no válido' using errcode = '22023';
  end if;

  -- Ventana fija (por ejemplo, bloques de 10 minutos).
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_end   := v_start + make_interval(secs => p_window_seconds);

  -- Atómico: si dos pedidos llegan juntos, Postgres los suma uno detrás del otro sobre la misma fila.
  insert into public.api_rate_limits as r (scope, key_hash, window_start, hits, expires_at)
  values (p_scope, p_key, v_start, 1, v_end + interval '1 hour')
  on conflict on constraint api_rate_limits_pkey
  do update set hits = least(r.hits + 1, 1000000)
  returning r.hits into v_hits;

  -- Limpieza: de vez en cuando borra filas vencidas (de a poco, sin trabar nada).
  if random() < 0.02 then
    delete from public.api_rate_limits
    where ctid in (select ctid from public.api_rate_limits where expires_at < now() limit 500);
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_max,
    'hits', v_hits,
    'retry_after', greatest(1, ceil(extract(epoch from (v_end - now())))::integer)
  );
end;
$$;

revoke all on function public.listo_rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.listo_rate_limit_hit(text, text, integer, integer) to service_role;

-- Verificación (sólo lectura), después de correrla:
--   select to_regclass('public.api_rate_limits');                                       -- api_rate_limits
--   select has_function_privilege('anon', 'public.listo_rate_limit_hit(text,text,integer,integer)', 'execute');  -- false
--   select has_table_privilege('anon', 'public.api_rate_limits', 'select');              -- false
--   select relrowsecurity from pg_class where oid = 'public.api_rate_limits'::regclass;  -- true
