/* Bisú Studio — Modelo de datos.
   Forma de la configuración general y de una prenda. Todos los valores numéricos
   se guardan como texto decimal ("12000", "1.4"); "" significa vacío.
   Comisiones e impuestos arrancan en 0: dependen de la situación de Bisú y se cargan en Configuración. */

export const SCHEMA_VERSION = 1;

export const CATEGORIES = [
  { id: "pantalon", label: "Pantalón" },
  { id: "top", label: "Top" },
  { id: "vestido", label: "Vestido" },
  { id: "short", label: "Short" },
  { id: "camisa", label: "Camisa" },
  { id: "body", label: "Body" },
  { id: "otro", label: "Otro" },
];

export const FIXED_COST_FIELDS = [
  { id: "rent", label: "Alquiler" },
  { id: "electricity", label: "Luz" },
  { id: "gas", label: "Gas" },
  { id: "salaries", label: "Sueldos" },
  { id: "socialCharges", label: "Cargas sociales" },
  { id: "accountant", label: "Contador" },
  { id: "software", label: "Software" },
  { id: "logistics", label: "Logística" },
  { id: "maintenance", label: "Mantenimiento" },
  { id: "other", label: "Otros gastos fijos" },
];

export const LABOR_FIELDS = [
  { id: "cut", label: "Corte" },
  { id: "sewing", label: "Confección" },
  { id: "finishing", label: "Terminaciones" },
  { id: "ironing", label: "Plancha" },
];

export const PROCESS_FIELDS = [
  { id: "washing", label: "Lavado" },
  { id: "embroidery", label: "Bordado" },
  { id: "printing", label: "Estampado" },
  { id: "other", label: "Otros procesos" },
];

export const PAYMENT_FEE_FIELDS = [
  { id: "gatewayPct", label: "Comisión pasarela" },
  { id: "bankPct", label: "Comisión bancaria" },
  { id: "financingPct", label: "Costo financiero" },
  { id: "otherPct", label: "Otros cargos" },
];

export const DISCOUNT_STEPS = [10, 20, 30, 40, 50];

export function uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function paymentMethod(id, name, settlementDays = "0") {
  return { id, name, gatewayPct: "0", bankPct: "0", financingPct: "0", otherPct: "0", fixedCharge: "0", settlementDays };
}

export function defaultConfig() {
  return {
    version: SCHEMA_VERSION,
    inflationMonthly: "2.5",
    monthsToReplacement: "3",
    priceBasis: "replacement",
    marginRetail: "60",
    scenarioConservative: "50",
    scenarioPremium: "65",
    marginWholesale: "40",
    retailerMargin: "50",
    fixedCosts: Object.fromEntries(FIXED_COST_FIELDS.map((f) => [f.id, ""])),
    monthlyUnits: "1000",
    paymentMethods: [
      paymentMethod("pm_transfer", "Transferencia"),
      paymentMethod("pm_debit", "Débito"),
      paymentMethod("pm_1", "1 cuota"),
      paymentMethod("pm_3", "3 cuotas"),
      paymentMethod("pm_6", "6 cuotas"),
    ],
    referenceMethodId: "pm_6",
    wholesaleMethodId: "pm_transfer",
    taxes: [
      { id: "tx_tn", name: "Comisión Tiendanube", pct: "0", active: true, wholesale: false },
      { id: "tx_iibb", name: "Ingresos brutos", pct: "0", active: true, wholesale: true },
      { id: "tx_mp", name: "Mercado Pago", pct: "0", active: false, wholesale: false },
      { id: "tx_gw", name: "Gateway de pago", pct: "0", active: false, wholesale: false },
      { id: "tx_other", name: "Otros impuestos / comisiones", pct: "0", active: false, wholesale: false },
    ],
    rounding: { mode: "up", step: "10000", ending: "9000" },
    wholesaleRounding: { mode: "up", step: "1000", ending: "0" },
    updatedAt: null,
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/* Los valores de la configuración que cada prenda copia al crearse (editables por prenda). */
export function settingsFromConfig(config) {
  const c = clone(config);
  return {
    inflationMonthly: c.inflationMonthly,
    monthsToReplacement: c.monthsToReplacement,
    priceBasis: c.priceBasis,
    margin: c.marginRetail,
    scenarioConservative: c.scenarioConservative,
    scenarioPremium: c.scenarioPremium,
    marginWholesale: c.marginWholesale,
    retailerMargin: c.retailerMargin,
    fixedCosts: c.fixedCosts,
    monthlyUnits: c.monthlyUnits,
    paymentMethods: c.paymentMethods,
    referenceMethodId: c.referenceMethodId,
    wholesaleMethodId: c.wholesaleMethodId,
    taxes: c.taxes,
    rounding: c.rounding,
    wholesaleRounding: c.wholesaleRounding,
  };
}

export function emptyFabric() {
  return { name: "", pricePerMeter: "", consumption: "", wastePct: "" };
}

export function emptyItem() {
  return { name: "", qty: "1", unitPrice: "" };
}

export function newProduct(config) {
  return {
    id: null,
    name: "",
    sku: "",
    category: "pantalon",
    date: today(),
    units: "",
    fabrics: [emptyFabric()],
    trims: [emptyItem()],
    packaging: [],
    labor: Object.fromEntries(LABOR_FIELDS.map((f) => [f.id, ""])),
    processes: Object.fromEntries(PROCESS_FIELDS.map((f) => [f.id, ""])),
    fixedOverride: "",
    settings: settingsFromConfig(config),
    publishPrice: "",
    snapshot: null,
    createdAt: null,
    updatedAt: null,
  };
}

/* Ejemplo con los datos del pedido original: Pantalón Siena, 40 unidades, Tencel a $12.000/m,
   1,40 m, 8% de desperdicio; avíos $4.500, confección $15.000 y plancha $2.000 (punto 21);
   gastos fijos $4.000.000 / 1.000 prendas (punto 5) si todavía no cargaste los tuyos.
   Sirve solo para probar la herramienta. */
export function exampleProduct(config) {
  const p = newProduct(config);
  Object.assign(p, {
    name: "Pantalón Siena",
    sku: "PA001",
    category: "pantalon",
    units: "40",
    fabrics: [{ name: "Tencel", pricePerMeter: "12000", consumption: "1.4", wastePct: "8" }],
    trims: [{ name: "Avíos (total del ejemplo)", qty: "1", unitPrice: "4500" }],
    packaging: [],
    labor: { cut: "", sewing: "15000", finishing: "", ironing: "2000" },
  });
  const hasFixed = Object.values(p.settings.fixedCosts).some((v) => v !== "" && Number(v) !== 0);
  if (!hasFixed) {
    p.settings.fixedCosts.other = "4000000";
    p.settings.monthlyUnits = "1000";
  }
  return p;
}

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const objOr = (v) => (isObj(v) ? v : {});

/* Completa campos faltantes en datos guardados con versiones anteriores.
   Si lo guardado no tiene la forma esperada, se ignora esa parte. */
export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!isObj(raw)) return base;
  const out = Object.assign(base, raw);
  out.fixedCosts = Object.assign(defaultConfig().fixedCosts, objOr(raw.fixedCosts));
  out.rounding = Object.assign(defaultConfig().rounding, objOr(raw.rounding));
  out.wholesaleRounding = Object.assign(defaultConfig().wholesaleRounding, objOr(raw.wholesaleRounding));
  if (!Array.isArray(out.paymentMethods) || !out.paymentMethods.length) out.paymentMethods = defaultConfig().paymentMethods;
  out.paymentMethods = out.paymentMethods.filter(isObj);
  if (!out.paymentMethods.length) out.paymentMethods = defaultConfig().paymentMethods;
  out.taxes = Array.isArray(out.taxes) ? out.taxes.filter(isObj) : defaultConfig().taxes;
  out.version = SCHEMA_VERSION;
  return out;
}

export function normalizeProduct(raw, config) {
  const base = newProduct(config);
  if (!isObj(raw)) return base;
  const out = Object.assign(base, raw);
  out.labor = Object.assign(base.labor, objOr(raw.labor));
  out.processes = Object.assign(base.processes, objOr(raw.processes));
  const s = Object.assign(settingsFromConfig(config), objOr(raw.settings));
  s.fixedCosts = Object.assign(settingsFromConfig(config).fixedCosts, objOr(objOr(raw.settings).fixedCosts));
  ["paymentMethods", "taxes"].forEach((k) => { if (!Array.isArray(s[k]) || !s[k].length) s[k] = settingsFromConfig(config)[k]; });
  out.settings = s;
  ["fabrics", "trims", "packaging"].forEach((k) => { out[k] = Array.isArray(out[k]) ? out[k].filter(isObj) : []; });
  return out;
}
