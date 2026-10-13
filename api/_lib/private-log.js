/* Nunca serializa errores, mensajes, respuestas, headers ni payloads externos. */
"use strict";
var CODES = ["23503", "23505", "23514", "42703", "42P01", "42883", "MISSING_SECRET", "MISSING_STORAGE"];
function error(context, err) {
  var out = { context: context };
  if (err && Number.isInteger(err.status) && err.status >= 100 && err.status <= 599) out.status = err.status;
  if (err && typeof err.code === "string" && (CODES.indexOf(err.code) !== -1 || /^PGRST\d{3}$/.test(err.code))) out.code = err.code;
  if (err && err.name === "AbortError") out.kind = "timeout";
  console.error(JSON.stringify(out));
}
module.exports = { error: error };
