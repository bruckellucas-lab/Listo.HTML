/* Fechas de calendario YYYY-MM-DD: Date.parse puede normalizar días inexistentes. */
"use strict";

function validDate(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  var date = new Date(day + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

module.exports = { validDate: validDate };
