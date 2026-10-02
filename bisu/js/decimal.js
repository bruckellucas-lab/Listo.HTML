/* Bisú Studio — Decimales exactos.
   Punto fijo con BigInt (18 decimales): 0,1 + 0,2 da exactamente 0,3.
   Se redondea "mitad hacia afuera" solo en divisiones y multiplicaciones
   que exceden los 18 decimales (error máximo: 0,000000000000000001). */

const SCALE = 18;
const ONE_RAW = 10n ** BigInt(SCALE);
const NUM_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

function divRound(n, d) {
  if (d === 0n) throw new RangeError("División por cero");
  if (d < 0n) { n = -n; d = -d; }
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice >= d) return n < 0n ? q - 1n : q + 1n;
  return q;
}

function parseRaw(value) {
  if (value instanceof Dec) return value.raw;
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value * ONE_RAW;
  let s;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Número inválido: " + value);
    s = String(value);
  } else {
    s = String(value).trim();
  }
  if (s === "" || s === "-" || s === "+" || s === ".") return 0n;
  const m = NUM_RE.exec(s);
  if (!m) throw new RangeError("Número inválido: " + value);
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] || "";
  const frac = m[3] || "";
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  const digits = BigInt((intPart + frac) || "0");
  const shift = SCALE - frac.length + exp;
  const raw = shift >= 0 ? digits * 10n ** BigInt(shift) : divRound(digits, 10n ** BigInt(-shift));
  return sign * raw;
}

export class Dec {
  constructor(raw) { this.raw = raw; }

  plus(x) { return new Dec(this.raw + parseRaw(x)); }
  minus(x) { return new Dec(this.raw - parseRaw(x)); }
  times(x) { return new Dec(divRound(this.raw * parseRaw(x), ONE_RAW)); }
  div(x) {
    const d = parseRaw(x);
    if (d === 0n) throw new RangeError("División por cero");
    return new Dec(divRound(this.raw * ONE_RAW, d));
  }
  neg() { return new Dec(-this.raw); }
  abs() { return this.raw < 0n ? this.neg() : this; }

  /* Potencia. Exponente entero: exacto. Exponente fraccionario: precisión de
     JavaScript (~15 dígitos), suficiente para un factor de inflación. */
  pow(exp) {
    const e = Number(exp instanceof Dec ? exp.toNumber() : exp);
    if (Number.isInteger(e) && e >= 0) {
      let result = D(1);
      let base = this;
      let k = e;
      while (k > 0) {
        if (k & 1) result = result.times(base);
        base = base.times(base);
        k >>= 1;
      }
      return result;
    }
    if (Number.isInteger(e)) return D(1).div(this.pow(-e));
    return D(Math.pow(this.toNumber(), e).toPrecision(15));
  }

  cmp(x) { const o = parseRaw(x); return this.raw < o ? -1 : this.raw > o ? 1 : 0; }
  eq(x) { return this.cmp(x) === 0; }
  lt(x) { return this.cmp(x) < 0; }
  lte(x) { return this.cmp(x) <= 0; }
  gt(x) { return this.cmp(x) > 0; }
  gte(x) { return this.cmp(x) >= 0; }
  isZero() { return this.raw === 0n; }
  isNeg() { return this.raw < 0n; }

  /* Redondeo a `dp` decimales. mode: "half" (mitad hacia afuera), "up" (techo), "down" (piso). */
  round(dp = 0, mode = "half") {
    const unit = 10n ** BigInt(SCALE - dp);
    const q = this.raw / unit;
    const r = this.raw % unit;
    if (r === 0n) return new Dec(q * unit);
    let k = q;
    if (mode === "up") k = r > 0n ? q + 1n : q;
    else if (mode === "down") k = r < 0n ? q - 1n : q;
    else k = divRound(this.raw, unit);
    return new Dec(k * unit);
  }
  ceil() { return this.round(0, "up"); }
  floor() { return this.round(0, "down"); }

  toString() {
    const neg = this.raw < 0n;
    const abs = neg ? -this.raw : this.raw;
    const int = abs / ONE_RAW;
    let frac = (abs % ONE_RAW).toString().padStart(SCALE, "0").replace(/0+$/, "");
    return (neg ? "-" : "") + int.toString() + (frac ? "." + frac : "");
  }
  toNumber() { return Number(this.toString()); }
  toJSON() { return this.toString(); }
}

export function D(value) {
  return value instanceof Dec ? value : new Dec(parseRaw(value));
}

D.sum = (values) => values.reduce((acc, v) => acc.plus(v), D(0));
D.max = (a, b) => (D(a).gte(b) ? D(a) : D(b));
D.min = (a, b) => (D(a).lte(b) ? D(a) : D(b));
D.isDec = (v) => v instanceof Dec;
