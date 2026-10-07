# Matching inteligente — F0: línea base y controles

Fecha: 7 de octubre de 2026 · Rama: `claude/matching-f0` · Sin cambios en el matching.

## Qué incluye F0

1. **Escenarios sintéticos** (`tests/fixtures/matching/`): 20 pedidos típicos y un "mundo" de lugares **inventados** con la forma de una respuesta de Google Places. No hay datos reales de Google ni coordenadas en el repositorio.
2. **Medición reproducible** (`tests/matching/`): pasa cada escenario por el código **real** de hoy (`chooseCategory` de `app.js` → `plan.buildQuery` → Google simulado → `toProviderRows` → `plan.pickOptions`) y calcula pertinencia, zona, relleno y repetición.
   - Ver la tabla: `node tests/matching/report.js`
   - Regenerar la línea base (sólo si cambia el algoritmo a propósito): `node tests/matching/report.js --write`
3. **Control de requisitos obligatorios** en `/api/plan-selection` y `/api/plan-inquiry` (`api/_lib/requirements.js`).

## Línea base del matching actual

| Métrica | Valor |
|---|---|
| Escenarios | 20 |
| Opciones mostradas | 60 |
| Pertinencia (tipo de lugar acorde al plan) | 55 % |
| Dentro de la zona pedida | 95 % |
| Mostradas que no eran adecuadas (relleno) | 29 |
| Adecuadas disponibles que no se mostraron | 19 |
| Escenarios con menos de 3 adecuadas | 7 |
| Escenarios donde todas las personas ven lo mismo | 20 de 20 |
| Pares de planes distintos con la misma búsqueda | 46 |
| …que reciben exactamente los mismos 3 | 46 |
| Búsquedas distintas a Google para 20 planes | 6 |
### Por escenario

| Escenarios | 20 |
| Opciones mostradas | 60 |
| Pertinencia (tipo de lugar acorde al plan) | 55 % |
| Dentro de la zona pedida | 95 % |
| Mostradas que no eran adecuadas (relleno) | 29 |
| Adecuadas disponibles que no se mostraron | 19 |
| Escenarios con menos de 3 adecuadas | 7 |
| Escenarios donde todas las personas ven lo mismo | 20 de 20 |
| Pares de planes distintos con la misma búsqueda | 46 |
| …que reciben exactamente los mismos 3 | 46 |
| Búsquedas distintas a Google para 20 planes | 6 |

| Escenario | Categoría | Pertinentes | En zona | Adecuadas disp. | Relleno | Omitidas |
|---|---|---|---|---|---|---|
| cena-pareja-palermo | restaurantes | 3/3 | 3/3 | 10 | 0 | 0 |
| aniversario-palermo | restaurantes | 2/3 | 3/3 | 5 | 1 | 1 |
| asado-12-palermo | restaurantes | 0/3 | 3/3 | 2 | 3 | 2 |
| cumple-15-palermo | restaurantes | 1/3 | 3/3 | 7 | 2 | 2 |
| juntada-6-palermo | restaurantes | 1/3 | 3/3 | 5 | 2 | 2 |
| reunion-4-palermo | restaurantes | 1/3 | 3/3 | 3 | 2 | 2 |
| cena-vegana-palermo | restaurantes | 0/3 | 3/3 | 1 | 3 | 1 |
| baby-shower-palermo | restaurantes | 0/3 | 3/3 | 2 | 3 | 2 |
| after-8-palermo | bares | 2/3 | 3/3 | 6 | 1 | 1 |
| despedida-10-palermo | bares | 2/3 | 3/3 | 6 | 1 | 1 |
| tragos-6-palermo | bares | 2/3 | 3/3 | 6 | 1 | 1 |
| fiesta-30-palermo | restaurantes | 0/3 | 3/3 | 1 | 3 | 1 |
| casamiento-120-palermo | salones | 2/3 | 3/3 | 3 | 1 | 1 |
| corporativo-50-palermo | salones | 2/3 | 3/3 | 4 | 1 | 1 |
| cumple-45-palermo | salones | 2/3 | 3/3 | 3 | 1 | 1 |
| graduacion-25-palermo | salones | 3/3 | 3/3 | 4 | 0 | 0 |
| cena-4-caballito | restaurantes | 3/3 | 2/3 | 2 | 1 | 0 |
| asado-10-caballito | restaurantes | 1/3 | 2/3 | 1 | 2 | 0 |
| cena-6-nunez | restaurantes | 3/3 | 2/3 | 2 | 1 | 0 |
| cena-sin-zona | restaurantes | 3/3 | — | 4 | 0 | 0 |

### Cómo leerla

- **Pertinencia 55 %**: casi la mitad de lo que se muestra no corresponde al tipo de plan. Un asado, una cena vegana, un baby shower o una fiesta de 30 reciben 0 lugares pertinentes.
- **Repetición**: el orden es fijo. Todas las personas ven lo mismo y **46 de 46** pares de planes distintos con la misma búsqueda reciben exactamente los mismos 3 lugares. 20 planes distintos generan sólo 6 búsquedas distintas.
- **Relleno**: siempre se muestran 3. En 7 escenarios había menos de 3 opciones adecuadas, y se completó con lugares no pertinentes o de otro barrio (Caballito y Núñez: 1 de 3 fuera de la zona).
- **Omitidas**: 19 opciones adecuadas disponibles no se mostraron porque ganó un lugar mejor puntuado pero menos pertinente.

**Definiciones** (en `tests/matching/harness.js`):
- **Pertinente:** el tipo de lugar de Google está entre los tipos de referencia del escenario. Son etiquetas para medir, no reglas del producto.
- **Adecuada:** abierta, pertinente, en la zona pedida, con 20 reseñas o más y rating de 4,0 o más.
- **Repetición:** se simulan 20 personas por escenario.

**Límites:** son datos sintéticos. Sirven para comparar algoritmos, no para estimar porcentajes de producción.

## Control de requisitos obligatorios (hueco corregido)

Antes, `/api/plan-selection` sólo verificaba que existieran el pedido y el lugar. La web no ofrece opciones cuando hay requisitos obligatorios, pero la API aceptaba una elección armada a mano.

Ahora el servidor lee el pedido **guardado** (`event_requests.dietary_requirements`) antes de escribir nada:

- `null`, `[]` o sólo preferencias → sigue igual que antes.
- **Kosher, halal, celiaquía, alergias** (siempre) o cualquier requisito marcado obligatorio → **409**: "lo coordinamos personalmente… WhatsApp". Es la derivación manual que ya existía. No se guarda la elección ni la solicitud y no se manda el email. El mensaje no incluye el detalle de la alergia.
- Si el pedido **no se puede verificar** (falta la columna, Supabase no responde o el dato está mal formado) → **503** y no se guarda nada.
- En "Quiero avanzar" el control corre **después de Turnstile** y antes de cualquier escritura. Turnstile sigue igual.
- Lo que mande el navegador no cuenta: la verdad es el pedido guardado por el servidor.

## Pendiente antes de F1

- **Etapa G (cumplimiento de Google):** verificar con el texto oficial vigente qué se puede guardar y cachear, y la atribución. No se asume que la caché y el almacenamiento actuales cumplan.
- **Barrios de CABA:** el dataset oficial (CC-BY-2.5-AR) no se pudo descargar desde este entorno porque la red lo bloquea. No se inventaron coordenadas.
