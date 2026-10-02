/* Bisú Studio — Formato argentino para mostrar números, y lectura de lo que se tipea.
   Solo se redondea acá, al mostrar. */

import { D } from "./decimal.js";

const nf = (dp) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function toNum(v, dp) {
  return D(v).round(dp).toNumber();
}

export function money(v, dp = 0) {
  if (v === null || v === undefined) return "—";
  const n = toNum(v, dp);
  return (n < 0 ? "−$" : "$") + nf(dp).format(Math.abs(n));
}

// Montos chicos (avíos) con centavos solo si los tienen.
export function moneyAuto(v) {
  if (v === null || v === undefined) return "—";
  return money(v, D(v).round(0).eq(D(v).round(2)) ? 0 : 2);
}

export function percent(fraction, dp = 1) {
  if (fraction === null || fraction === undefined) return "—";
  const n = toNum(D(fraction).times(100), dp);
  return (n < 0 ? "−" : "") + nf(dp).format(Math.abs(n)) + "%";
}

export function signedPercent(fraction, dp = 1) {
  if (fraction === null || fraction === undefined) return "—";
  const s = percent(fraction, dp);
  return D(fraction).gt(0) ? "+" + s : s;
}

export function qty(v, dp = 3) {
  if (v === null || v === undefined) return "—";
  const n = toNum(v, dp);
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: dp }).format(n);
}

export function date(iso) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* Convierte lo tipeado a decimal canónico ("12.000" → "12000", "1,40" → "1.4").
   Regla argentina: la coma es decimal y el punto separa miles. Si solo hay puntos y
   alguno no separa grupos de 3 cifras ("1.40"), se toma como decimal. Devuelve null si es inválido. */
export function parseInput(text) {
  let s = String(text ?? "").trim().replace(/\s|\$|%/g, "");
  if (s === "") return "";
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const thousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length >= 1 && parts[0] !== "0";
    if (thousands) s = parts.join("");
    else if (parts.length > 2) return null;
  }
  if (!/^\d*\.?\d*$/.test(s) || s === "." ) return null;
  const out = D(s).toString();
  return neg ? "-" + out : out;
}

/* Cómo mostrar un valor guardado dentro de un campo editable. */
export function inputValue(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 }).format(n);
}
