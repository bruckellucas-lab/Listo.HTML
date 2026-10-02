/* Bisú Studio — Lógica financiera.
   Funciones puras: reciben números (o Dec) y devuelven Dec. No tocan la pantalla.
   Convención: los porcentajes entran como FRACCIÓN (8% = 0.08).
   Las ecuaciones están documentadas en bisu/DISENO.md (sección 4). */

import { D } from "./decimal.js";

const ONE = D(1);

function assertRate(rate, label) {
  if (D(rate).gte(1)) throw new RangeError(label + " debe ser menor a 100%");
}

/* ---------- Costo ---------- */

// consumo ajustado = consumo × (1 + desperdicio)
export function calculateAdjustedConsumption(consumption, wasteRate) {
  return D(consumption).times(ONE.plus(wasteRate));
}

// costo de tela = consumo ajustado × precio por metro
export function calculateFabricCost({ pricePerMeter, consumption, wasteRate }) {
  const adjustedConsumption = calculateAdjustedConsumption(consumption, wasteRate);
  return { adjustedConsumption, cost: adjustedConsumption.times(pricePerMeter) };
}

// Σ cantidad × precio unitario (avíos, packaging)
export function calculateItemsCost(items) {
  const lines = (items || []).map((it) => ({
    name: it.name,
    total: D(it.qty).times(it.unitPrice),
  }));
  return { lines, total: D.sum(lines.map((l) => l.total)) };
}

// Suma de importes por unidad (mano de obra, procesos). Los vacíos cuentan como 0.
export function calculateLaborCost(values) {
  return D.sum(Object.values(values || {}).map((v) => D(v)));
}

// gasto fijo por prenda = gastos fijos mensuales ÷ prendas por mes (null si no hay producción)
export function calculateFixedCostPerUnit(monthlyFixedCosts, monthlyUnits) {
  if (D(monthlyUnits).lte(0)) return null;
  return D(monthlyFixedCosts).div(monthlyUnits);
}

// costo unitario = tela + avíos + mano de obra + procesos + packaging + gasto fijo
export function calculateUnitCost({ fabric = 0, trims = 0, labor = 0, processes = 0, packaging = 0, fixed = 0 }) {
  return D(fabric).plus(trims).plus(labor).plus(processes).plus(packaging).plus(fixed);
}

export function calculateLotCost(unitCost, units) {
  return D(unitCost).times(units);
}

// costo de reposición = costo × (1 + inflación mensual)^meses (inflación compuesta)
export function calculateReplacementCost(cost, monthlyInflation, months) {
  return D(cost).times(ONE.plus(monthlyInflation).pow(months));
}

/* ---------- Margen y markup ---------- */

// margen sobre venta = (precio − costo) ÷ precio
export function calculateGrossMargin(price, cost) {
  if (D(price).isZero()) return null;
  return D(price).minus(cost).div(price);
}

// markup = (precio − costo) ÷ costo
export function calculateMarkup(price, cost) {
  if (D(cost).isZero()) return null;
  return D(price).minus(cost).div(cost);
}

export function marginToMarkup(margin) {
  assertRate(margin, "El margen");
  return D(margin).div(ONE.minus(margin));
}

export function markupToMargin(markup) {
  return D(markup).div(ONE.plus(markup));
}

// precio para un margen m = costo ÷ (1 − m). NO es costo × (1 + m).
export function calculatePriceFromMargin(cost, margin) {
  assertRate(margin, "El margen");
  return D(cost).div(ONE.minus(margin));
}

/* ---------- Comisiones, impuestos y financiación ---------- */

// Tasa total: todas las comisiones porcentuales se cobran sobre el precio publicado, por eso se suman.
export function calculateTotalFeeRate(rates) {
  return D.sum((rates || []).map((r) => D(r)));
}

// Detalle de lo que se descuenta de un precio publicado.
export function calculatePaymentFee(price, components, fixedCharge = 0) {
  const lines = (components || []).map((c) => ({
    name: c.name,
    rate: D(c.rate),
    amount: D(price).times(c.rate),
  }));
  const fixed = D(fixedCharge);
  const total = D.sum(lines.map((l) => l.amount)).plus(fixed);
  return { lines, fixed, total };
}

// neto recibido = precio × (1 − tasa) − cargo fijo
export function calculateNetRevenue(price, feeRate, fixedCharge = 0) {
  return D(price).times(ONE.minus(feeRate)).minus(fixedCharge);
}

// precio necesario para recibir un neto = (neto + cargo fijo) ÷ (1 − tasa)
export function calculateRequiredRetailPrice(netTarget, feeRate, fixedCharge = 0) {
  assertRate(feeRate, "La suma de comisiones e impuestos");
  return D(netTarget).plus(fixedCharge).div(ONE.minus(feeRate));
}

// Cuánto vale hoy el dinero que llega en `days` días, con inflación mensual i: 1 − 1 ÷ (1+i)^(días/30)
export function calculateSettlementInflationLoss(net, monthlyInflation, days) {
  if (D(days).lte(0)) return D(0);
  const factor = ONE.plus(monthlyInflation).pow(D(days).div(30).toNumber());
  return D(net).minus(D(net).div(factor));
}

/* ---------- Decisiones ---------- */

// Descuento máximo antes de que el neto deje de cubrir el costo: 1 − precio mínimo ÷ precio
export function calculateMaximumDiscount(price, cost, feeRate, fixedCharge = 0) {
  if (D(price).lte(0)) return D(0);
  const floor = calculateRequiredRetailPrice(cost, feeRate, fixedCharge);
  const d = ONE.minus(floor.div(price));
  return d.isNeg() ? D(0) : d;
}

// Unidades a vender para recuperar la inversión = ⌈ inversión ÷ neto por unidad ⌉
export function calculateBreakEvenUnits(investment, netPerUnit) {
  if (D(netPerUnit).lte(0)) return null;
  return D(investment).div(netPerUnit).ceil();
}

export function calculateVariation(previous, current) {
  if (D(previous).isZero()) return null;
  return D(current).minus(previous).div(previous);
}

/* Redondeo comercial.
   mode "up": el menor valor ≥ x que cumple (valor − terminación) múltiplo de `step`.
   Ej.: step 10000, ending 9000 → 283.746 se convierte en 289.000.
   mode "nearest" / "down": idem, al más cercano o hacia abajo. "none": sin redondeo. */
export function applyCommercialRounding(value, { mode = "up", step = 1000, ending = 0 } = {}) {
  const x = D(value);
  if (mode === "none" || D(step).lte(0)) return x;
  const s = D(step);
  const e = D(ending);
  const k = x.minus(e).div(s);
  const up = k.ceil().times(s).plus(e);
  const down = k.floor().times(s).plus(e);
  if (mode === "down") return down;
  if (mode === "nearest") return up.minus(x).lte(x.minus(down)) ? up : down;
  return up;
}
