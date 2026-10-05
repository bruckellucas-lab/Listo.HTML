-- =========================================================
-- LISTO · P1A · Migration 2 de 2 — Cerrar la escritura pública de event_requests
--
-- ⚠️ CORRER RECIÉN DESPUÉS de que P1A esté en Production y se haya comprobado que
--    "Buscar opciones" guarda el pedido a través de /api/event-request.
--    Si se corre antes, la web que está publicada hoy (que escribe directo desde el
--    navegador) deja de poder guardar pedidos.
--
-- Qué hace:
--   - borra la policy "La web puede crear pedidos" (INSERT para anon);
--   - quita el permiso INSERT de anon y authenticated sobre event_requests.
-- Qué NO hace:
--   - no borra datos, columnas ni tablas;
--   - no desactiva RLS (sigue activado: sin policies, el público no puede nada);
--   - no toca al backend: Vercel usa la clave secreta (service_role), que no depende de policies.
-- =========================================================

drop policy if exists "La web puede crear pedidos" on public.event_requests;
revoke insert on table public.event_requests from anon, authenticated;

-- Verificación (sólo lectura), después de correrla:
--   select policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = 'event_requests';  -- sin filas para anon
--   select has_table_privilege('anon', 'public.event_requests', 'insert');   -- false
--   select relrowsecurity from pg_class where oid = 'public.event_requests'::regclass;  -- true
--
-- Para volver atrás (sólo si hiciera falta, por ejemplo si se revierte P1A):
--   grant insert on table public.event_requests to anon;
--   create policy "La web puede crear pedidos" on public.event_requests for insert to anon
--     with check (status = 'new' and original_prompt is not null and char_length(original_prompt) between 8 and 2000);
