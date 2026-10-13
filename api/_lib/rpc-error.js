/* Sólo mensajes comerciales fijos de las RPC versionadas; nunca errores externos. */
"use strict";
var MESSAGES = [
  "Acción no válida.",
  "Actualizá la página antes de enviar la solicitud.",
  "Canal no válido.",
  "Confirmado requiere una reserva registrada.",
  "El ID de operación ya se usó con otros datos. Recargá el panel.",
  "El estado cambió mientras tanto. Actualizá el panel.",
  "El proveedor no coincide con la selección.",
  "Esa cotización no es de esta solicitud.",
  "Esta operación ya no coincide con la elección actual.",
  "Estado no válido.",
  "Falta el ID de operación. Actualizá el panel.",
  "La cotización no es válida para confirmar.",
  "La elección cambió mientras tanto. Revisá la opción actual antes de volver a elegir.",
  "La operación original se guardó, pero el estado cambió después. Recargá el panel; no la repitas.",
  "La propuesta cambió o el usuario ya respondió. Actualizá el panel.",
  "La propuesta de esta operación ya cambió. Actualizá el panel.",
  "La propuesta no corresponde o no fue aceptada.",
  "La reserva cambió o ya está cancelada.",
  "La solicitud de esta operación tiene otros datos. Revisá el formulario.",
  "La solicitud está cerrada.",
  "La solicitud está cerrada: no se puede confirmar.",
  "La solicitud tiene una reserva activa.",
  "La solicitud ya no está disponible. Contactá a LISTO antes de repetir.",
  "No encontramos esa solicitud.",
  "No encontramos ese pedido.",
  "No se puede cancelar: la comisión está pagada o exenta.",
  "No se puede sincronizar una solicitud cerrada o sin reserva activa.",
  "Operación no válida.",
  "Transición no permitida. Las solicitudes cerradas no se reabren.",
  "Tu elección cambió. Volvé a elegir la opción antes de enviar.",
  "Ya hay una reserva confirmada para esta solicitud."
];
module.exports = function (message) { return MESSAGES.indexOf(message) !== -1 ? message : "No pudimos confirmar el resultado. Actualizá la página o el panel antes de repetir la operación."; };
module.exports.payload = function (out) {
  var safe = { ok: false, http_status: Number.isInteger(out.http_status) && out.http_status >= 400 && out.http_status <= 599 ? out.http_status : 409, error: module.exports(out.error) };
  if (typeof out.already_applied === "boolean") safe.already_applied = out.already_applied;
  if (out.item && typeof out.item === "object") {
    safe.item = {};
    ["id", "status", "updated_at", "provider_contacted_at", "provider_contact_channel"].forEach(function (key) { if (Object.hasOwn(out.item, key)) safe.item[key] = out.item[key]; });
  }
  if (Object.hasOwn(out, "current_selection")) safe.current_selection = out.current_selection ? { id: out.current_selection.id, google_place_id: out.current_selection.google_place_id } : null;
  return safe;
};
