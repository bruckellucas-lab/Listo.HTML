import { test } from "node:test";
import assert from "node:assert/strict";
import { D } from "../js/decimal.js";
import * as F from "../js/finance.js";
import { computeProduct } from "../js/pricing.js";
import { defaultConfig, exampleProduct } from "../js/model.js";

const eq = (actual, expected, msg) => assert.equal(D(actual).toString(), D(expected).toString(), msg);
const near = (actual, expected, dp = 2) => assert.equal(D(actual).round(dp).toString(), D(expected).round(dp).toString());

test("decimales exactos: 0,1 + 0,2 = 0,3", () => {
  eq(D("0.1").plus("0.2"), "0.3");
  eq(D(0.1).plus(0.2), "0.3");
  eq(D("1.1").times("1.1"), "1.21");
  eq(D(1).div(3).times(3).round(10), "1");
  eq(D("1e-3"), "0.001");
  eq(D("-2.5").round(0), "-3");
});

test("tela: consumo ajustado y costo (ejemplo Tencel)", () => {
  const r = F.calculateFabricCost({ pricePerMeter: 12000, consumption: "1.40", wasteRate: "0.08" });
  eq(r.adjustedConsumption, "1.512");
  eq(r.cost, "18144");
});

test("avíos y mano de obra", () => {
  const t = F.calculateItemsCost([{ qty: 1, unitPrice: 1800 }, { qty: 6, unitPrice: "35.5" }]);
  eq(t.total, "2013");
  eq(F.calculateLaborCost({ a: "15000", b: "", c: "2000" }), "17000");
});

test("gasto fijo por prenda: 4.000.000 / 1.000 = 4.000", () => {
  eq(F.calculateFixedCostPerUnit(4000000, 1000), "4000");
  assert.equal(F.calculateFixedCostPerUnit(4000000, 0), null);
});

test("costo unitario y del lote", () => {
  const unit = F.calculateUnitCost({ fabric: 18100, trims: 4500, labor: 17000, fixed: 5000 });
  eq(unit, "44600");
  eq(F.calculateLotCost(62350, 40), "2494000");
});

test("costo de reposición con inflación compuesta", () => {
  // 60.000 × 1,025³ = 60.000 × 1,076890625
  eq(F.calculateReplacementCost(60000, "0.025", 3), "64613.4375");
  eq(F.calculateReplacementCost(60000, "0.025", 0), "60000");
});

test("margen vs markup: 60% de margen sobre $60.000 = $150.000, no $96.000", () => {
  const price = F.calculatePriceFromMargin(60000, "0.6");
  eq(price, "150000");
  eq(F.calculateGrossMargin(price, 60000), "0.6");
  eq(F.calculateMarkup(price, 60000), "1.5");
  // costo × 1,60 es markup 60% = margen 37,5%
  eq(F.calculateGrossMargin(96000, 60000), "0.375");
  eq(F.marginToMarkup("0.6"), "1.5");
  eq(F.markupToMargin("1.5"), "0.6");
  assert.throws(() => F.calculatePriceFromMargin(100, 1));
});

test("comisiones: se divide por (1 − tasa), no se multiplica por (1 + tasa)", () => {
  // Ejemplo punto 21: 118.000 neto con 8% de comisiones
  near(F.calculateRequiredRetailPrice(118000, "0.08"), "128260.87");
  // Ejemplo punto 9: venta $200.000 con 6% + 10%
  const rate = F.calculateTotalFeeRate(["0.06", "0.10"]);
  eq(rate, "0.16");
  eq(F.calculateNetRevenue(200000, rate), "168000");
  eq(F.calculateRequiredRetailPrice(168000, rate), "200000");
  // Ida y vuelta con cargo fijo
  const p = F.calculateRequiredRetailPrice(100000, "0.12", 500);
  near(F.calculateNetRevenue(p, "0.12", 500), "100000", 8);
  assert.throws(() => F.calculateRequiredRetailPrice(100, "1"));
});

test("detalle de comisiones", () => {
  const fee = F.calculatePaymentFee(200000, [{ name: "Plataforma", rate: "0.06" }, { name: "Financiación", rate: "0.10" }], 300);
  eq(fee.lines[0].amount, "12000");
  eq(fee.lines[1].amount, "20000");
  eq(fee.total, "32300");
});

test("descuento máximo", () => {
  // Precio 200.000, comisión 10%, costo 90.000 → precio mínimo 100.000 → 50% OFF
  eq(F.calculateMaximumDiscount(200000, 90000, "0.1"), "0.5");
  // Si el precio ya está debajo del mínimo, el descuento máximo es 0
  eq(F.calculateMaximumDiscount(90000, 90000, "0.1"), "0");
  // En el descuento máximo, el neto cubre exactamente el costo
  const d = F.calculateMaximumDiscount(189000, 64000, "0.15", 200);
  near(F.calculateNetRevenue(D(189000).times(D(1).minus(d)), "0.15", 200), "64000", 6);
});

test("unidades para recuperar la inversión", () => {
  eq(F.calculateBreakEvenUnits(2494000, 150000), "17");
  eq(F.calculateBreakEvenUnits(300000, 100000), "3");
  assert.equal(F.calculateBreakEvenUnits(100, 0), null);
});

test("variación de costo", () => {
  eq(F.calculateVariation(64000, 71936), "0.124");
});

test("redondeo comercial configurable", () => {
  const cfg = { mode: "up", step: 10000, ending: 9000 };
  eq(F.applyCommercialRounding(283746, cfg), "289000");
  eq(F.applyCommercialRounding(289000, cfg), "289000");
  eq(F.applyCommercialRounding(289001, cfg), "299000");
  eq(F.applyCommercialRounding(128260.87, { mode: "up", step: 1000, ending: 0 }), "129000");
  eq(F.applyCommercialRounding(128260.87, { mode: "nearest", step: 1000, ending: 0 }), "128000");
  eq(F.applyCommercialRounding(128260.87, { mode: "down", step: 1000, ending: 0 }), "128000");
  eq(F.applyCommercialRounding(128260.87, { mode: "none" }), "128260.87");
});

test("pérdida por inflación en el plazo de acreditación", () => {
  eq(F.calculateSettlementInflationLoss(100000, "0.025", 0), "0");
  near(F.calculateSettlementInflationLoss(102500, "0.025", 30), "2500", 6);
});

test("prenda completa: ejemplo Pantalón Siena", () => {
  const product = exampleProduct(defaultConfig());
  product.settings.paymentMethods.find((m) => m.id === "pm_6").gatewayPct = "8";
  const r = computeProduct(product);
  // 18.144 tela + 4.500 avíos + 17.000 mano de obra + 4.000 fijos
  eq(r.currentCost, "43644");
  eq(r.lotCost, "1745760");
  eq(r.replacementCost, D("43644").times("1.076890625"));
  eq(r.basisCost, r.replacementCost);
  // Neto objetivo = reposición ÷ 0,4 ; precio = neto ÷ 0,92
  eq(r.netTarget, r.replacementCost.div("0.4"));
  eq(r.targetPrice, r.netTarget.div("0.92"));
  // Recomendado redondeado hacia arriba: nunca baja el margen
  assert.ok(r.recommendedPrice.gte(r.targetPrice));
  assert.ok(r.atRecommended.margin.gte("0.6"));
  // El precio mínimo deja ganancia 0
  const atMin = r.discountFor(D(1).minus(r.minimumPrice.div(r.recommendedPrice)));
  near(atMin.profit, "0", 6);
  // Escenarios ordenados
  assert.ok(r.scenarios[0].price.lte(r.scenarios[1].price));
  assert.ok(r.scenarios[1].price.lte(r.scenarios[2].price));
  // Con 60% de margen, 50% OFF todavía no genera pérdida; 70% OFF sí
  assert.ok(!r.discounts[4].loss);
  assert.ok(r.discountFor("0.7").loss);
  assert.ok(r.maxDiscount.gt("0.5") && r.maxDiscount.lt("0.7"));
  // Producción
  eq(r.production.investment, "1745760");
  eq(r.production.breakEvenUnits, r.lotCost.div(r.atPublish.net).ceil());
  assert.equal(r.errors.length, 0);
});

test("prenda: elegir costo actual cambia la base y no duplica inflación", () => {
  const product = exampleProduct(defaultConfig());
  product.settings.priceBasis = "current";
  const r = computeProduct(product);
  eq(r.basisCost, r.currentCost);
  eq(r.netTarget, D("43644").div("0.4"));
});

test("prenda: mayorista no paga comisiones que no aplican a mayorista", () => {
  const product = exampleProduct(defaultConfig());
  const tn = product.settings.taxes.find((t) => t.id === "tx_tn");
  tn.pct = "2";
  tn.active = true;
  tn.wholesale = false;
  const r = computeProduct(product);
  eq(r.wholesale.method.rate, "0");
  eq(r.reference.rate, "0.02");
  eq(r.wholesale.rawPrice, r.basisCost.div("0.6"));
});

test("prenda: alerta de costo y precio para mantener el margen", () => {
  const product = exampleProduct(defaultConfig());
  product.snapshot = { date: "2026-09-01", currentCost: "40000", publishPrice: "150000", margin: "0.6" };
  const r = computeProduct(product);
  eq(r.alert.variation, D("43644").minus(40000).div(40000));
  assert.ok(r.alert.priceToKeep.gte(r.basisCost.div("0.4")));
});

test("lectura de números en formato argentino", async () => {
  const { parseInput } = await import("../js/format.js");
  assert.equal(parseInput("12.000"), "12000");
  assert.equal(parseInput("1.234.567,5"), "1234567.5");
  assert.equal(parseInput("1,40"), "1.4");
  assert.equal(parseInput("1.40"), "1.4");
  assert.equal(parseInput("0.400"), "0.4");
  assert.equal(parseInput("$ 4.000.000"), "4000000");
  assert.equal(parseInput("8%"), "8");
  assert.equal(parseInput(""), "");
  assert.equal(parseInput("abc"), null);
});
