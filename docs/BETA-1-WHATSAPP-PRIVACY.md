# BETA-1 — privacidad del enlace WhatsApp sensible

Base: `6cbc688dcd2799ca9ddba3505ed6dea87c069b9c`.
Rama: `codex/beta1-whatsapp-sensitive-privacy`.

## Qué se corrige y por qué

`renderSensitive` incluía el texto completo del pedido y los requisitos en el parámetro
`text` de WhatsApp. Eso podía trasladar alergias, datos de salud y contactos a la URL y al
texto preparado del canal externo. No había envío automático, pero abrir el link ya exponía
ese contexto innecesariamente.

Se sustituye esa concatenación por una frase fija:

> Hola LISTO. Quiero ayuda para coordinar un plan con requisitos especiales.

El link no incluye prompt, alergias/detalles médicos, celiaquía, sin TACC, gluten, kosher,
halal, lactosa, preferencias obligatorias, invitados, fecha, zona, presupuesto, contactos
ni comentarios. El número público de LISTO y la navegación del botón se mantienen.
No se agregan identificadores de pedido, tracking ni otros parámetros.

La explicación del requisito sigue visible localmente en LISTO, escapada como antes.
No se modifican la detección de restricciones, las opciones automáticas ni el bloqueo backend.
La coordinación manual sigue disponible. El usuario puede escribir detalles en WhatsApp
cuando decida compartirlos; LISTO no los precarga ni envía mensajes automáticamente.

## Revisión de enlaces

Se revisaron los generadores `wa.me`, WhatsApp y sus llamadas en la web y APIs:

| Generador | Comportamiento |
| --- | --- |
| `renderSensitive` | Único link de WhatsApp visible con requisitos fuertes; ahora texto fijo genérico. |
| `optionsFeedbackHTML` (F5) | Ya usa “Hola LISTO. Quiero ayuda para coordinar un plan.”; no se cambia. |
| `renderOptions` → `shareText` | Compartir tarjeta de opción; el corte de requisitos fuertes ocurre antes de renderizar tarjetas, incluso si hay opciones cacheadas. No es una salida del flujo sensible. |
| Contacto admin/email | Enlaces de contacto existentes sin texto del pedido; fuera del cambio, sin modificar admin ni emails. |

`runSearch` sigue cortando antes de buscar cuando hay restricciones fuertes. `renderOptions`
sigue derivando a `renderSensitive`, sin tarjetas, elegir, Quiero avanzar ni compartir opciones.
Google no acredita dieta. F4B y proveedores verificados permanecen diferidos.

## Tests y alcance de la evidencia

Cinco tests nuevos ejecutan el renderer real y la transformación real de restricciones,
con DOM simulado y datos exclusivamente sintéticos:

1. Celiaquía directa y gluten por celiaquía: cero tarjetas, salida manual y URL genérica.
2. Alergia: maní, frutos secos, texto acentuado y detalle con signos/HTML; nunca en el link.
3. Kosher, halal y combinación de varias restricciones: idéntico mensaje fijo.
4. Vegano, vegetariano, lactosa y menú infantil obligatorios, con fecha/zona/presupuesto y
   contactos en el estado: sin esos datos en el link.
5. Fallback F5: mantiene su mensaje original con 0/1/2 opciones y alternativas fuera de zona.

Se comprueba URL decodificada, host/protocolo/número, único parámetro `text`, ausencia de
fragmentos, `target`/`rel`, ausencia de tarjetas cacheadas y estado intacto tras renderizar.
Los tests fallaron antes del fix en los cuatro grupos sensibles; F5 ya pasaba.

La suite existente comprueba búsqueda normal, Google request cerrado/no-store, option_token,
selección, Quiero avanzar/replay sin duplicados, S2B/S2C/S2D/S2E y baseline F5 sin cambios.
No se repiten esas pruebas con copias nuevas de sus fixtures.

`npm run check`: OK, 92 archivos/bloques, 12/12 funciones.
`npm test`: 316 aprobados, 0 fallidos, 3 omitidos de integración Postgres (319 total).
APIs externas simuladas. No se ejecutó SQL ni se llamaron servicios reales.

QA local en Chromium con HTML/CSS reales y funciones del renderer, inyectadas con un plan
sintético de alergia: desktop 1366×900 y mobile 390×844. En ambas pantallas se verificaron
botón visible, click interceptado para no abrir el canal externo, URL exacta genérica,
cero tarjetas, ausencia de overflow horizontal y cero errores JS. Capturas inspeccionadas.
No se ejecutó el arranque completo de la app ni se abrió WhatsApp; no es smoke de Preview.

## Qué queda para legal y privacidad

- WhatsApp continúa siendo un canal externo, sujeto a sus propias políticas y tratamiento
  de datos. El mensaje genérico menciona requisitos especiales sin especificar cuáles.
- El usuario decide qué escribir y enviar. Si agrega información sensible manualmente,
  esa información pasa al canal externo por su decisión.
- Revisar aviso de privacidad, comunicación del uso de WhatsApp, consentimiento/base legal,
  acceso del equipo, conservación y atención de solicitudes de privacidad antes de beta.
- Este fix minimiza el enlace saliente; no elimina datos ya guardados ni cambia retención,
  la explicación local del requisito o el tratamiento existente de pedidos.
- Abrir WhatsApp no se considera probado contra el servicio externo en esta tarea. El smoke
  en Preview debe confirmar que el navegador/app lo abre con sólo el texto fijo.

## Smoke recomendado en Preview

1. Plan sintético con celiaquía, otro con alergia y otro kosher/halal: coordinación sin tarjetas.
2. Copiar el enlace sensible y revisar el parámetro `text`: debe ser exclusivamente la frase fija.
3. Abrirlo voluntariamente con datos de prueba: ningún dato del plan debe aparecer preparado;
   no hace falta enviar el mensaje. Probar desktop y mobile.
4. Caso F5 con pocas opciones: mensaje genérico anterior intacto.
5. Plan normal: buscar, elegir y Quiero avanzar; volver y reintentar sin duplicar.

Sin cambios en Google request, matching, ranking, cantidad, persistencia, logs, provider storage,
admin, propuestas, emails ni estados. Sin SQL, migration, dependencias ni endpoints nuevos.
No hay merge ni despliegue manual. Sólo `app.js`, tests nuevos y este documento.
