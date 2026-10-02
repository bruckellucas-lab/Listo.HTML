/* Bisú Studio — Motor de cálculo de una prenda.
   Junta las fórmulas de finance.js y devuelve todos los resultados (en Dec) más
   el detalle paso a paso para "Ver cálculo". No toca la pantalla. */

import { D } from "./decimal.js";
import * as F from "./finance.js";
import { DISCOUNT_STEPS, PAYMENT_FEE_FIELDS } from "./model.js";

const pct = (v) => D(v).div(100);
const isSet = (v) => v !== null && v !== undefined && String(v).trim() !== "";

function safe(fn) {
  try { return fn(); } catch (e) { return null; }
}

/* Componentes porcentuales de un medio de pago + impuestos/comisiones activos.
   forWholesale: solo los impuestos marcados "aplica a mayorista". */
export function feeComponents(method, taxes, forWholesale = false) {
  const comps = PAYMENT_FEE_FIELDS
    .map((f) => ({ name: f.label, rate: pct(method[f.id] || 0) }))
    .filter((c) => !c.rate.isZero());
  (taxes || [])
    .filter((t) => t.active && (!forWholesale || t.wholesale))
    .forEach((t) => { if (!pct(t.pct || 0).isZero()) comps.push({ name: t.name, rate: pct(t.pct) }); });
  return comps;
}

function methodInfo(method, taxes, forWholesale = false) {
  const components = feeComponents(method, taxes, forWholesale);
  return {
    id: method.id,
    name: method.name,
    components,
    rate: F.calculateTotalFeeRate(components.map((c) => c.rate)),
    fixed: D(method.fixedCharge || 0),
    settlementDays: D(method.settlementDays || 0),
  };
}

/* Qué pasa con un precio publicado: comisiones, neto y ganancia contra el costo base y el actual. */
export function evaluatePrice(price, method, basisCost, currentCost) {
  if (price === null) return null;
  const P = D(price);
  const fees = F.calculatePaymentFee(P, method.components, method.fixed);
  const net = F.calculateNetRevenue(P, method.rate, method.fixed);
  const profit = net.minus(basisCost);
  const profitCurrent = net.minus(currentCost);
  return {
    price: P,
    fees,
    net,
    profit,
    margin: F.calculateGrossMargin(net, basisCost),
    markup: F.calculateMarkup(net, basisCost),
    marginOnPublished: F.calculateGrossMargin(P, D(basisCost).plus(fees.total)),
    profitCurrent,
    marginCurrent: F.calculateGrossMargin(net, currentCost),
    loss: profit.isNeg(),
    lossCurrent: profitCurrent.isNeg(),
  };
}

function priceForMargin(basisCost, margin, method) {
  return safe(() => F.calculateRequiredRetailPrice(F.calculatePriceFromMargin(basisCost, margin), method.rate, method.fixed));
}

export function computeProduct(product) {
  const s = product.settings;
  const errors = [];
  const warnings = [];

  /* 1. Costo */
  const fabrics = (product.fabrics || []).map((f) => ({
    name: f.name || "Tela",
    pricePerMeter: D(f.pricePerMeter),
    consumption: D(f.consumption),
    wasteRate: pct(f.wastePct || 0),
    ...F.calculateFabricCost({ pricePerMeter: f.pricePerMeter, consumption: f.consumption, wasteRate: pct(f.wastePct || 0) }),
  }));
  const fabricTotal = D.sum(fabrics.map((f) => f.cost));
  const trims = F.calculateItemsCost(product.trims);
  const packaging = F.calculateItemsCost(product.packaging);
  const labor = F.calculateLaborCost(product.labor);
  const processes = F.calculateLaborCost(product.processes);

  const fixedMonthly = F.calculateLaborCost(s.fixedCosts);
  const fixedComputed = F.calculateFixedCostPerUnit(fixedMonthly, s.monthlyUnits || 0);
  const fixedIsManual = isSet(product.fixedOverride);
  const fixed = fixedIsManual ? D(product.fixedOverride) : fixedComputed || D(0);
  if (!fixedIsManual && fixedComputed === null && !fixedMonthly.isZero()) {
    warnings.push("Falta la producción mensual: los gastos fijos no se están imputando.");
  }
  if (!fixedIsManual && fixedMonthly.isZero()) {
    warnings.push("No hay gastos fijos cargados. Cargalos en Configuración o en el paso Gastos.");
  }

  const currentCost = F.calculateUnitCost({ fabric: fabricTotal, trims: trims.total, labor, processes, packaging: packaging.total, fixed });
  const units = D(product.units || 0);
  const lotCost = F.calculateLotCost(currentCost, units);

  /* 2. Reposición */
  const inflation = pct(s.inflationMonthly || 0);
  const months = D(s.monthsToReplacement || 0);
  const replacementFactor = D(1).plus(inflation).pow(months.toNumber());
  const replacementCost = F.calculateReplacementCost(currentCost, inflation, months.toNumber());
  const basis = s.priceBasis === "current" ? "current" : "replacement";
  const basisCost = basis === "current" ? currentCost : replacementCost;

  /* 3. Margen y medios de pago */
  const margin = pct(s.margin || 0);
  if (margin.gte(1)) errors.push("El margen tiene que ser menor a 100%.");
  const methods = (s.paymentMethods || []).map((m) => methodInfo(m, s.taxes));
  const reference = methods.find((m) => m.id === s.referenceMethodId) || methods[0] || methodInfo({ id: "none", name: "Sin medio de pago" }, s.taxes);
  if (reference.rate.gte(1)) errors.push("Las comisiones e impuestos de " + reference.name + " suman 100% o más.");
  if (reference.rate.isZero() && reference.fixed.isZero()) {
    warnings.push("El medio de pago de referencia no tiene comisiones cargadas. Revisalas en el paso Pagos.");
  }

  const netTarget = safe(() => F.calculatePriceFromMargin(basisCost, margin));
  const minimumPrice = safe(() => F.calculateRequiredRetailPrice(basisCost, reference.rate, reference.fixed));
  const targetPrice = netTarget && safe(() => F.calculateRequiredRetailPrice(netTarget, reference.rate, reference.fixed));
  const recommendedPrice = targetPrice && F.applyCommercialRounding(targetPrice, s.rounding);
  const hasPublish = isSet(product.publishPrice) && D(product.publishPrice).gt(0);
  const publishPrice = hasPublish ? D(product.publishPrice) : recommendedPrice;

  const atRecommended = evaluatePrice(recommendedPrice, reference, basisCost, currentCost);
  const atPublish = evaluatePrice(publishPrice, reference, basisCost, currentCost);
  if (atRecommended && atRecommended.margin && atRecommended.margin.lt(margin) && s.rounding.mode !== "up") {
    warnings.push("El redondeo deja el margen por debajo del objetivo. Usá redondeo hacia arriba.");
  }
  if (atPublish && atPublish.loss) warnings.push("Con el precio publicado, Bisú no cubre el costo base.");

  const paymentTable = methods.map((m) => {
    const ev = evaluatePrice(publishPrice, m, basisCost, currentCost);
    return {
      method: m,
      requiredPrice: netTarget && safe(() => F.calculateRequiredRetailPrice(netTarget, m.rate, m.fixed)),
      eval: ev,
      settlementLoss: ev ? F.calculateSettlementInflationLoss(ev.net, inflation, m.settlementDays) : null,
    };
  });

  /* 4. Escenarios */
  const scenarioDefs = [
    { id: "conservative", label: "Conservador", margin: pct(s.scenarioConservative || 0) },
    { id: "target", label: "Objetivo", margin },
    { id: "premium", label: "Premium", margin: pct(s.scenarioPremium || 0) },
  ];
  const scenarios = scenarioDefs.map((sc) => {
    const raw = priceForMargin(basisCost, sc.margin, reference);
    const price = raw && F.applyCommercialRounding(raw, s.rounding);
    return { ...sc, rawPrice: raw, price, eval: evaluatePrice(price, reference, basisCost, currentCost) };
  });

  /* 5. Descuentos (sobre el precio publicado, con el medio de referencia) */
  const discountFor = (d) => {
    if (!publishPrice) return null;
    const price = publishPrice.times(D(1).minus(d));
    return { rate: D(d), ...evaluatePrice(price, reference, basisCost, currentCost) };
  };
  const discounts = DISCOUNT_STEPS.map((p) => discountFor(pct(p)));
  const maxDiscount = publishPrice && safe(() => F.calculateMaximumDiscount(publishPrice, basisCost, reference.rate, reference.fixed));
  const maxDiscountCurrent = publishPrice && safe(() => F.calculateMaximumDiscount(publishPrice, currentCost, reference.rate, reference.fixed));

  /* 6. Mayorista */
  const wMethodRaw = (s.paymentMethods || []).find((m) => m.id === s.wholesaleMethodId) || (s.paymentMethods || [])[0];
  const wMethod = wMethodRaw ? methodInfo(wMethodRaw, s.taxes, true) : reference;
  const wMargin = pct(s.marginWholesale || 0);
  const wRaw = priceForMargin(basisCost, wMargin, wMethod);
  const wPrice = wRaw && F.applyCommercialRounding(wRaw, s.wholesaleRounding);
  const wEval = evaluatePrice(wPrice, wMethod, basisCost, currentCost);
  const retailerMargin = pct(s.retailerMargin || 0);
  const retailerRetailRaw = wPrice && safe(() => F.calculatePriceFromMargin(wPrice, retailerMargin));
  const retailerRetail = retailerRetailRaw && F.applyCommercialRounding(retailerRetailRaw, s.rounding);
  const wholesale = {
    method: wMethod,
    margin: wMargin,
    rawPrice: wRaw,
    price: wPrice,
    eval: wEval,
    retailerMargin,
    retailerRetail,
    retailerRealMargin: retailerRetail && wPrice && F.calculateGrossMargin(retailerRetail, wPrice),
    retailerMarkup: retailerRetail && wPrice && F.calculateMarkup(retailerRetail, wPrice),
    channelConflict: !!(retailerRetail && publishPrice && retailerRetail.lt(publishPrice)),
  };

  /* 7. Producción */
  let production = null;
  if (atPublish) {
    const netTotal = atPublish.net.times(units);
    const investment = lotCost;
    production = {
      units,
      investment,
      revenue: publishPrice.times(units),
      feesTotal: atPublish.fees.total.times(units),
      netTotal,
      profit: netTotal.minus(investment),
      margin: F.calculateGrossMargin(netTotal, investment),
      profitAfterReplacement: netTotal.minus(replacementCost.times(units)),
      breakEvenUnits: F.calculateBreakEvenUnits(investment, atPublish.net),
    };
  }

  /* 8. Alertas de costo (comparado con el último cálculo guardado) */
  let alert = null;
  const snap = product.snapshot;
  if (snap && isSet(snap.currentCost) && D(snap.currentCost).gt(0)) {
    const variation = F.calculateVariation(snap.currentCost, currentCost);
    const previousPrice = isSet(snap.publishPrice) ? D(snap.publishPrice) : null;
    const previousMargin = isSet(snap.margin) ? D(snap.margin) : null;
    let priceToKeep = null;
    if (previousMargin !== null && previousMargin.lt(1)) {
      const raw = priceForMargin(basisCost, previousMargin, reference);
      priceToKeep = raw && F.applyCommercialRounding(raw, s.rounding);
    }
    alert = {
      date: snap.date,
      previousCost: D(snap.currentCost),
      currentCost,
      variation,
      previousPrice,
      previousMargin,
      priceToKeep,
      changed: variation !== null && !variation.isZero(),
    };
  }

  const result = {
    errors,
    warnings,
    fabrics,
    fabricTotal,
    trims,
    packaging,
    labor,
    processes,
    fixed: { monthly: fixedMonthly, computed: fixedComputed, isManual: fixedIsManual, applied: fixed, monthlyUnits: D(s.monthlyUnits || 0) },
    currentCost,
    units,
    lotCost,
    inflation,
    months,
    replacementFactor,
    replacementCost,
    basis,
    basisCost,
    margin,
    markupTarget: safe(() => F.marginToMarkup(margin)),
    netTarget,
    reference,
    minimumPrice,
    targetPrice,
    recommendedPrice,
    publishPrice,
    hasPublish,
    atRecommended,
    atPublish,
    paymentTable,
    scenarios,
    discounts,
    discountFor,
    maxDiscount,
    maxDiscountCurrent,
    wholesale,
    production,
    alert,
  };
  result.trace = buildTrace(result, product);
  return result;
}

/* "Ver cálculo": cada paso con su valor y la fórmula usada. type: money | pct | qty */
function buildTrace(r, product) {
  const steps = [];
  const add = (label, value, type = "money", formula = "", strong = false) => steps.push({ label, value, type, formula, strong });
  const section = (label) => steps.push({ section: label });

  section("Costo actual por prenda");
  r.fabrics.forEach((f) => {
    add(f.name + ": consumo ajustado", f.adjustedConsumption, "qty", "consumo × (1 + desperdicio)");
    add(f.name, f.cost, "money", "consumo ajustado × precio por metro");
  });
  if (!r.trims.total.isZero()) add("Avíos", r.trims.total, "money", "Σ cantidad × precio unitario");
  if (!r.labor.isZero()) add("Mano de obra", r.labor, "money", "corte + confección + terminaciones + plancha");
  if (!r.processes.isZero()) add("Procesos adicionales", r.processes, "money", "lavado + bordado + estampado + otros");
  if (!r.packaging.total.isZero()) add("Packaging", r.packaging.total, "money", "Σ cantidad × precio unitario");
  add("Gastos fijos imputados", r.fixed.applied, "money", r.fixed.isManual ? "valor manual" : "gastos fijos mensuales ÷ prendas por mes");
  add("Costo actual", r.currentCost, "money", "suma de todo lo anterior", true);

  section("Reposición");
  add("Inflación mensual estimada", r.inflation, "pct");
  add("Meses hasta reposición", r.months, "qty");
  add("Costo de reposición", r.replacementCost, "money", "costo actual × (1 + inflación)^meses", true);
  add("Costo base del precio", r.basisCost, "money", r.basis === "current" ? "elegiste costo actual" : "elegiste costo de reposición");

  section("Precio");
  add("Margen objetivo", r.margin, "pct", "sobre lo que cobra Bisú");
  if (r.netTarget) add("Precio antes de comisiones (neto objetivo)", r.netTarget, "money", "costo base ÷ (1 − margen)");
  add("Comisiones e impuestos (" + r.reference.name + ")", r.reference.rate, "pct", r.reference.components.map((c) => c.name).join(" + ") || "sin comisiones cargadas");
  if (!r.reference.fixed.isZero()) add("Cargo fijo por venta", r.reference.fixed, "money");
  if (r.minimumPrice) add("Precio mínimo", r.minimumPrice, "money", "(costo base + cargo fijo) ÷ (1 − comisiones)");
  if (r.targetPrice) add("Precio necesario", r.targetPrice, "money", "(neto objetivo + cargo fijo) ÷ (1 − comisiones)", true);
  if (r.recommendedPrice) add("Precio comercial recomendado", r.recommendedPrice, "money", roundingLabel(product.settings.rounding), true);
  if (r.hasPublish) add("Precio que vas a publicar", r.publishPrice, "money", "ingresado por vos");

  if (r.atPublish) {
    section("Lo que recibe Bisú");
    r.atPublish.fees.lines.forEach((l) => add(l.name, l.amount.neg(), "money", "precio × " + fmtRate(l.rate)));
    if (!r.atPublish.fees.fixed.isZero()) add("Cargo fijo", r.atPublish.fees.fixed.neg(), "money");
    add("Neto recibido", r.atPublish.net, "money", "precio − comisiones − cargos", true);
    add("Ganancia", r.atPublish.profit, "money", "neto − costo base");
    if (r.atPublish.margin) add("Margen real", r.atPublish.margin, "pct", "ganancia ÷ neto", true);
  }
  return steps;
}

function fmtRate(d) {
  return d.times(100).round(2).toNumber().toLocaleString("es-AR") + "%";
}

export function roundingLabel(rounding) {
  if (!rounding || rounding.mode === "none") return "sin redondeo";
  const modes = { up: "hacia arriba", nearest: "al más cercano", down: "hacia abajo" };
  const n = (v) => Number(v || 0).toLocaleString("es-AR");
  const end = D(rounding.ending || 0).isZero() ? "" : ", terminado en " + n(rounding.ending);
  return "redondeo " + (modes[rounding.mode] || "") + " a múltiplos de $" + n(rounding.step) + end;
}

/* Datos que se guardan con la prenda para comparar en el próximo cálculo. */
export function makeSnapshot(result) {
  return {
    date: new Date().toISOString(),
    currentCost: result.currentCost.toString(),
    replacementCost: result.replacementCost.toString(),
    basisCost: result.basisCost.toString(),
    recommendedPrice: result.recommendedPrice ? result.recommendedPrice.toString() : "",
    publishPrice: result.publishPrice ? result.publishPrice.toString() : "",
    margin: result.atPublish && result.atPublish.margin ? result.atPublish.margin.toString() : "",
  };
}
