# Migrations de Supabase (LISTO)

Desde el **5 de octubre de 2026 (P1A)** los cambios nuevos de la base se guardan acá, como archivos SQL con fecha.

- Las tablas anteriores (`event_requests`, `providers`, `plan_selections`, `plan_inquiries`, `provider_quotes`, `plan_proposals`, `plan_bookings`, `provider_dietary_attributes`) **ya existían antes** de este sistema: se crearon con los pasos de `SUPABASE.md`. No hay migrations de ellas y no hay que inventarlas.
- El nombre de cada archivo empieza con la fecha y hora (`AAAAMMDDHHMMSS_`), así queda claro el orden.
- **Se corren a mano**, una por vez y en orden, en Supabase → **SQL Editor** → pegar el archivo → **Run**. Primero en el proyecto que use el Preview (si es el mismo que producción, se corre una sola vez) y se verifica antes de pasar a producción.
- Cada archivo trae, al final, consultas de verificación de **sólo lectura**.
- **Nunca se edita una migration que ya se corrió.** Si hay que cambiar algo, se crea una migration nueva con fecha posterior.

## Estado

| Archivo | Qué hace | Cuándo correrla | ¿Corrida? |
|---|---|---|---|
| `20261005120000_p1a_rate_limits.sql` | Límite de pedidos persistente (tabla `api_rate_limits` + función `listo_rate_limit_hit`). Aditiva. | **Antes** de probar el Preview de P1A. | Pendiente |
| `20261005120100_p1a_close_event_requests_anon_insert.sql` | Cierra el INSERT público de `event_requests`. | **Después** de que P1A esté en Production y funcionando. | Pendiente |
