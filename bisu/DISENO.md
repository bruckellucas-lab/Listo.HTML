# Bisú Studio — Costeo y precios

Herramienta interna para responder en menos de un minuto:
**"¿Cuánto me cuesta realmente fabricar esta prenda y a cuánto la tengo que vender para no perder rentabilidad?"**
— y entender exactamente por qué.

Se abre en **/bisu/**. Es independiente de LISTO: no usa sus APIs, ni Supabase, ni Google Places.

---

## 1. Análisis de los requerimientos

El pedido tiene tres capas:

1. **Costeo** (puntos 2 a 6): cuánto cuesta hacer una unidad hoy.
2. **Precio** (7 a 12): cuánto hay que cobrar para que, después de inflación, comisiones y financiación, quede el margen buscado.
3. **Decisión** (13 a 17): qué pasa si hago descuentos, si vendo mayorista, si fabrico X unidades, si cambian los costos.

Todo gira alrededor de una idea: **separar lo que cuesta, lo que se publica y lo que efectivamente entra a Bisú**. La mayoría de los errores de precio en Argentina vienen de mezclar esos tres números.

## 2. Arquitectura

Sin frameworks ni librerías (HTML + CSS + JavaScript con módulos nativos).

| Capa | Archivo | Qué hace |
|---|---|---|
| Aritmética | `js/decimal.js` | Números decimales exactos (sin errores de punto flotante). |
| Lógica financiera | `js/finance.js` | Fórmulas puras e independientes (`calculateFabricCost()`, `calculateRequiredRetailPrice()`, etc.). No sabe nada de la pantalla. |
| Motor de cálculo | `js/pricing.js` | Junta las fórmulas para una prenda y arma el resultado completo + el "Ver cálculo" paso a paso. |
| Datos | `js/model.js` | Forma de una prenda y de la configuración, valores iniciales, migraciones. |
| Configuración y guardado | `js/storage.js` | Guarda configuración, prendas y borrador en el navegador. Exportar / importar copia de seguridad. |
| Formato | `js/format.js` | Cómo se muestran pesos, porcentajes y fechas (formato argentino) y cómo se leen los números que se tipean. |
| Interfaz | `js/app.js`, `index.html`, `styles.css` | Pantallas, pasos, tooltips. No contiene fórmulas. |
| Tests | `tests/*.test.js` | Verifican las fórmulas con ejemplos conocidos. Se corren con `node --test` (Node ya trae el runner). |

**Dónde se guardan los datos:** en el navegador (`localStorage`). Es simple, gratis y no requiere tocar Supabase.
Limitación: los datos viven en *esa* computadora y *ese* navegador. Por eso hay botones de **Exportar / Importar copia** en Configuración.
Siguiente paso natural: guardar prendas en Supabase con una tabla nueva (`bisu_products`) — se haría solo con tu aprobación, porque implica cambiar la base de datos.

## 3. Modelo de datos

```
Configuración general (una sola)
├── inflationMonthly            % inflación mensual estimada
├── monthsToReplacement         meses hasta reponer
├── priceBasis                  "replacement" (recomendado) | "current"
├── marginRetail                margen objetivo estándar Bisú (%)
├── scenarioConservative / scenarioPremium   (%)
├── marginWholesale / retailerMargin         (%)
├── fixedCosts { alquiler, luz, gas, sueldos, cargas, contador, software, logística, mantenimiento, otros }
├── monthlyUnits                prendas producidas por mes
├── paymentMethods [ { nombre, % pasarela, % banco, % financiación, % otros, cargo fijo $, días de acreditación } ]
├── referenceMethodId           medio de pago con el que se fija el precio publicado
├── wholesaleMethodId           medio de pago de las ventas mayoristas
├── taxes [ { nombre, %, activo, aplica a mayorista } ]
└── rounding { modo, múltiplo, terminación }  (+ uno para mayorista)

Prenda
├── name, sku, category, date, units
├── fabrics   [ { nombre, $/metro, consumo m, % desperdicio } ]
├── trims     [ { nombre, cantidad, $ unitario } ]   (avíos)
├── packaging [ { nombre, cantidad, $ unitario } ]
├── labor     { corte, confección, terminaciones, plancha }
├── processes { lavado, bordado, estampado, otros }
├── fixedOverride       gasto fijo manual por prenda (vacío = automático)
├── settings            copia de la configuración general al crearla (editable por prenda)
├── publishPrice        precio que vas a publicar (vacío = recomendado)
└── snapshot            último cálculo guardado (para las alertas de costo)
```

Cada prenda **copia** la configuración al crearse. Así, si cambiás la configuración general, las prendas viejas no cambian en silencio; cada una tiene el botón "Traer configuración actual".

Todos los montos se guardan como texto decimal (`"12000"`, `"1.4"`) para no perder precisión.

## 4. Fórmulas

Notación: porcentajes como fracción (8% = 0,08).

### Costo
| Concepto | Fórmula |
|---|---|
| Consumo ajustado | `consumo × (1 + desperdicio)` |
| Costo de tela | `consumo ajustado × precio por metro` (sumado si hay varias telas) |
| Avíos / packaging | `Σ cantidad × precio unitario` |
| Mano de obra | `corte + confección + terminaciones + plancha` |
| Procesos | `lavado + bordado + estampado + otros` |
| Gasto fijo por prenda | `gastos fijos mensuales ÷ prendas por mes` (o el valor manual) |
| **Costo actual (C)** | `tela + avíos + mano de obra + procesos + packaging + gasto fijo` |
| Costo del lote | `C × unidades` |
| **Costo de reposición (Cr)** | `C × (1 + inflación mensual)^meses` (inflación compuesta) |
| Costo base (Cb) | `Cr` (recomendado) o `C`, según elijas |

### Margen y markup
| Concepto | Fórmula |
|---|---|
| Margen sobre venta | `(precio − costo) ÷ precio` |
| Markup | `(precio − costo) ÷ costo` |
| Precio para un margen m | `costo ÷ (1 − m)` |
| Conversión | `markup = m ÷ (1 − m)` · `m = markup ÷ (1 + markup)` |

### Comisiones, impuestos y financiación
Todas las comisiones porcentuales se cobran **sobre el precio publicado**, entonces se suman en una tasa total:

`r = % pasarela + % banco + % financiación + % otros + Σ impuestos/comisiones activos`

| Concepto | Fórmula |
|---|---|
| Neto recibido | `N = P × (1 − r) − cargo fijo` |
| **Precio necesario para recibir N** | `P = (N + cargo fijo) ÷ (1 − r)` |
| Neto objetivo | `N* = Cb ÷ (1 − m)` |
| **Precio mínimo** | `(Cb + cargo fijo) ÷ (1 − r)` — el neto cubre exactamente el costo |
| **Precio objetivo** | `(N* + cargo fijo) ÷ (1 − r)` |
| **Precio recomendado** | precio objetivo redondeado comercialmente (por defecto, **siempre hacia arriba**) |
| Margen real | `(N − Cb) ÷ N` (sobre lo que efectivamente cobra Bisú) |

### Decisiones
| Concepto | Fórmula |
|---|---|
| Precio con descuento d | `P × (1 − d)` → se recalculan comisiones sobre ese precio |
| **Descuento máximo** | `1 − [(Cb + cargo fijo) ÷ (1 − r)] ÷ P` |
| Precio mayorista | `(Cb ÷ (1 − m mayorista) + cargo fijo) ÷ (1 − r mayorista)` |
| Precio minorista sugerido (retailer) | `mayorista ÷ (1 − margen del retailer)` |
| Inversión del lote | `C × unidades` |
| Unidades para recuperar la inversión | `⌈ inversión ÷ neto por unidad ⌉` |
| Variación de costo | `(costo nuevo − costo anterior) ÷ costo anterior` |
| Precio para mantener el margen | precio objetivo con el costo nuevo y el margen que tenías |
| Redondeo comercial | menor valor `≥ x` que termina en la terminación elegida (ej. múltiplo 10.000 + terminación 9.000: 283.746 → 289.000) |

## 5. Margen vs. markup (explicado simple)

Las dos miden la ganancia, pero **contra cosas distintas**:

- **Margen**: qué parte *del precio* es ganancia. "De cada $100 que cobro, $60 son ganancia" → margen 60%.
- **Markup**: cuánto le *agrego al costo*. "Al costo le sumo 150%" → markup 150%.

Con un costo de $60.000:

| Querés… | Cálculo | Precio | Ganancia | Margen | Markup |
|---|---|---|---|---|---|
| Margen 60% | 60.000 ÷ (1 − 0,60) | **$150.000** | $90.000 | 60% | 150% |
| Costo × 1,60 (error común) | 60.000 × 1,60 | $96.000 | $36.000 | **37,5%** | 60% |

Multiplicar por 1,60 da un markup de 60%, que es un margen de apenas 37,5%. La herramienta muestra siempre los dos.

## 6. Errores conceptuales detectados en el planteo (y cómo se resolvieron)

1. **"Mercado Pago" y "gateway" aparecen dos veces** (en medios de pago, punto 9, y en impuestos/comisiones, punto 10). Si se cargan en los dos lados, se descuentan dos veces.
   → Las comisiones de cobro van **en cada medio de pago**. La sección de impuestos/comisiones es para cargos que se aplican a *todas* las ventas (Tiendanube, ingresos brutos). Mercado Pago y gateway quedan en esa lista pero desactivados y con un aviso.

2. **Packaging aparece dos veces** (como avío en el punto 3 y como línea propia en el punto 6).
   → Packaging tiene su propia sección; no se carga como avío.

3. **"Sueldos" en gastos fijos puede duplicar la mano de obra.** Si las costureras cobran sueldo y además cargás "confección" por prenda, el mismo costo entra dos veces.
   → Aviso en la pantalla: en gastos fijos van los sueldos que *no* cargaste por prenda.

4. **Con qué margen se mide.** En tu ejemplo del punto 21 el margen se aplica primero (precio antes de comisiones) y después se agregan las comisiones. Eso significa que el 60% se mide **sobre lo que cobra Bisú** (neto), no sobre el precio publicado. Es lo correcto para no perder margen, y es lo que se implementó. La herramienta además muestra el margen medido sobre el precio publicado, que siempre es menor.
   Los números de tu ejemplo están bien (47.200 ÷ 0,40 = 118.000 y 118.000 ÷ 0,92 = 128.261). Lo importante es que "precio necesario" es `118.000 ÷ (1 − 0,08)` y **no** `118.000 × 1,08` (= 127.440, que dejaría a Bisú cobrando menos de lo buscado).

5. **Comisiones: dividir, no multiplicar.** Si querés recibir $118.000 y te cobran 8%, el precio es 118.000 ÷ 0,92 = 128.261, no 118.000 × 1,08. Lo mismo con el ejemplo del punto 9: con 6% + 10% sobre $200.000, Bisú recibe $168.000 (200.000 × 0,84). Para *recibir* $200.000 hay que publicar $238.095.

6. **Un solo precio publicado, muchos medios de pago.** Si publicás un precio y el cliente puede pagar en 6 cuotas, el precio debe calcularse con el medio más caro (o tu mix real). Si lo calculás con transferencia, perdés margen en cada venta en cuotas.
   → Elegís el **medio de pago de referencia** (sugerido: el más caro que ofrezcas). La tabla de medios de pago muestra cuánto recibís y qué margen te queda con cada uno.

7. **Inflación: no aplicarla dos veces.** Si cargás los precios de tela de *dentro de 3 meses* y además usás costo de reposición, la inflación se cuenta doble.
   → Cargá siempre precios de **hoy**; la herramienta proyecta.
   Tampoco se suma la inflación del "plazo hasta recibir el dinero" al precio: si vendés sobre costo de reposición, ese efecto ya está cubierto (el dinero se usa recién al reponer). La tabla de pagos muestra cuánto se "come" la inflación en el plazo solo como referencia.

8. **Costo de reposición y ganancia "contable" no son lo mismo.** Si vendés a $X y la prenda te costó $C hoy, la ganancia contable es mayor que la ganancia después de reponer. Se muestran las dos: "ganancia sobre costo actual" y "ganancia después de reponer".

9. **Punto de equilibrio.** Lo que pedís en el punto 15 ("cuántas tengo que vender para recuperar la inversión") es el **recupero de inversión del lote**: `inversión ÷ neto por unidad`. El "punto de equilibrio" clásico usa gastos fijos ÷ margen de contribución; como acá los gastos fijos ya están imputados en el costo, ambos se responden con el mismo número. Se muestra con ese nombre aclarado.

10. **IVA.** No se asume ningún régimen. Si Bisú es Responsable Inscripto, el precio publicado incluye IVA que no es ingreso: se puede cargar como un impuesto más (21% incluido equivale a 17,36% del precio publicado: 21 ÷ 121) y los insumos deberían cargarse sin IVA. Si es monotributista, no se carga. Esto lo tiene que confirmar el contador.

11. **Mayorista y comisiones.** Una venta mayorista normalmente no paga Tiendanube ni cuotas. Cada impuesto/comisión tiene la opción "aplica a mayorista" y el mayorista usa su propio medio de pago (por defecto, transferencia).

12. **Redondeo hacia abajo rompe el margen.** Por defecto se redondea siempre hacia arriba. Si elegís "al más cercano" o "hacia abajo", la herramienta avisa cuando el margen real queda por debajo del objetivo.

13. **Descuentos sobre qué costo.** El descuento máximo se calcula contra el costo base elegido (reposición, por defecto). También se indica si el descuento genera pérdida contra el costo actual.

## 7. Mejoras propuestas (incluidas)

- Varias telas por prenda (tela principal + forro / entretela).
- "Precio que vas a publicar" editable: probás un precio y ves el margen real al instante.
- Avisos cuando faltan datos clave (comisiones vacías, producción mensual en 0, margen ≥ 100%).
- Cargar ejemplo "Pantalón Siena" para probar.
- Exportar / importar copia de seguridad (JSON).
- Duplicar prenda (para variantes de la misma moldería).

## 8. Mejoras para más adelante

- Guardar en Supabase (para usarlo desde varias computadoras).
- Biblioteca de insumos: actualizar el precio de una tela una sola vez y que se recalculen todas las prendas que la usan.
- Mix de medios de pago ponderado (ej. 40% transferencia, 60% cuotas).
- Talles con distinto consumo de tela.
- Historial de costos por prenda.

## 9. Precisión numérica

Internamente todo se calcula con decimales exactos de 18 posiciones (`js/decimal.js`, usando `BigInt` del navegador; sin librerías). Solo se redondea al mostrar.
Única excepción: la inflación compuesta con meses *no enteros* (ej. 2,5 meses) usa una potencia fraccionaria, que se calcula con la precisión normal de JavaScript (~15 dígitos; irrelevante para pesos).

## 10. Tests

```
cd bisu
node --test
```

## 11. Versión de un solo archivo

`bisu/bisu-costing.html` es la misma herramienta con todo embebido (HTML + CSS + JS): se abre con doble clic, sin servidor, y en Vercel queda en **/bisu/bisu-costing.html**.

Se genera con `node tools/build-standalone.js` (desde `bisu/`). **No se edita a mano**: el generador valida la sintaxis del JavaScript antes de escribir el archivo, y un test verifica que el resultado sea válido.

Si algo falla al arrancar, la página muestra "Error al iniciar Bisú Costing" con el detalle técnico en lugar de quedar en blanco. Los datos guardados que estén dañados se ignoran y se cargan los valores iniciales.
