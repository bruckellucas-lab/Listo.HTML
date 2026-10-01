# LISTO — Reglas del Proyecto

## Perfil del Proyecto

Nombre: LISTO

Claim:
"Tenés el plan. Nosotros hacemos el resto."

LISTO es una plataforma para organizar planes, cenas, cumpleaños, eventos y experiencias a partir de un pedido en lenguaje natural.

## Infraestructura actual

- GitHub: repositorio principal del proyecto
- Vercel: hosting y backend/serverless
- Supabase: base de datos
- Google Places API (New): búsqueda de lugares reales y fotos
- Frontend actual: HTML, CSS y JavaScript

No introducir frameworks, librerías o paquetes nuevos salvo que sean realmente necesarios.

## Reglas para Claude Code

1. El usuario dirige el producto pero no es programador.

Explicá los cambios de forma simple, clara y en español.

No asumas conocimientos técnicos.

2. No instalar librerías, frameworks ni paquetes nuevos sin explicar primero por qué serían necesarios.

3. No cambiar el diseño actual de LISTO salvo que el usuario lo pida explícitamente.

Mantener:
- estética editorial
- modo oscuro
- tipografía actual
- paleta actual
- animaciones
- estructura visual
- responsive

4. No inventar datos.

LISTO nunca debe inventar:
- proveedores
- precios
- disponibilidad
- capacidad
- ratings
- direcciones
- servicios
- fotos

Si un dato no está confirmado, mostrar algo como:

"Precio y disponibilidad a confirmar"

o

"Cotización requerida"

5. Seguridad.

Nunca exponer en el frontend:

- GOOGLE_PLACES_API_KEY
- SUPABASE_SECRET_KEY
- service_role keys
- tokens privados

Las integraciones sensibles deben ejecutarse desde el backend de Vercel.

6. Google Places.

Usar Places API (New).

Evitar llamadas innecesarias para reducir costos.

No guardar URLs temporales de fotos como datos permanentes.

Evitar duplicados de providers usando google_place_id.

7. Supabase.

No romper las tablas existentes:

- event_requests
- providers

Antes de modificar estructura de base de datos, explicar qué se va a cambiar.

8. Producción.

La rama principal de producción es:

main

Antes de pasar cambios a main:

- verificar que la web funcione
- verificar que Vercel pueda desplegar
- verificar que Supabase siga funcionando
- verificar Google Places si fue modificado

9. Cambios pequeños y controlados.

Evitar reescribir archivos completos cuando solo hace falta modificar una parte.

No eliminar funcionalidades existentes sin aprobación.

10. Manejo de errores.

Si ocurre un error:

- explicar en una frase simple qué pasó;
- identificar la causa;
- corregirlo;
- volver a probar.

11. Antes de terminar una tarea:

- probar desktop;
- probar mobile cuando haya cambios visuales;
- verificar que no haya errores en consola;
- verificar que las APIs modificadas funcionen;
- confirmar qué archivos cambiaron;
- confirmar si los cambios llegaron a main.

12. Prioridad principal:

Mantener LISTO estable mientras se agregan funcionalidades nuevas.
