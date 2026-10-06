/* =========================================================
   LISTO — Verificación anti-robots (Cloudflare Turnstile) en el navegador
   Sólo para "Quiero avanzar". Este archivo NO carga nada de Cloudflare:
   el script de Cloudflare se pide recién cuando se abre el formulario.
   - Modo "interaction-only": para la mayoría no aparece nada; Cloudflare
     verifica en segundo plano y sólo muestra un control si hace falta.
   - El token queda sólo en memoria y se usa una vez.
   - Si algo falla, se registra SÓLO el código técnico de Cloudflare
     (nunca el token ni datos de la persona) y se muestra un mensaje claro.
   ========================================================= */
(function (root) {
  "use strict";

  var SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var WAIT_MS = 15000;              // espera del token en segundo plano
  var INTERACTIVE_WAIT_MS = 120000; // si Cloudflare pide interacción, más tiempo

  var MESSAGES = {
    domain: "Este dominio todavía no está habilitado para la verificación de seguridad.",
    load: "No pudimos cargar la verificación de seguridad. Probá recargando la página o revisando bloqueadores.",
    failed: "No pudimos completar la verificación. Probá nuevamente.",
    unsupported: "Tu navegador no es compatible con la verificación de seguridad. Probá con otro navegador o actualizalo.",
    slow: "La verificación de seguridad está tardando. Probá nuevamente en unos segundos.",
    interact: "Completá la verificación de seguridad para enviar."
  };

  // Código técnico de Cloudflare → mensaje para la persona.
  function messageFor(code) {
    var c = String(code || "");
    if (c === "110200") return MESSAGES.domain;
    if (c === "200500") return MESSAGES.load;
    return MESSAGES.failed;   // 300xxx, 600xxx y cualquier otro
  }

  // Sólo dígitos/letras, corto: nunca puede llevar un token ni datos personales.
  function safeCode(code) { return String(code === undefined || code === null ? "" : code).replace(/[^0-9a-z]/gi, "").slice(0, 12) || "sin-codigo"; }

  function loadScript(doc) {
    return new Promise(function (resolve, reject) {
      var w = doc.defaultView || root;
      if (w.turnstile) return resolve(w.turnstile);
      var s = doc.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = function () { if (w.turnstile) resolve(w.turnstile); else { s.remove(); reject(new Error("turnstile")); } };
      s.onerror = function () { s.remove(); reject(new Error("turnstile")); };
      doc.head.appendChild(s);
    });
  }

  /* opts: { siteKey, action, container, box, notice(msg), log(...), load() → Promise<turnstile>,
             setTimeout, clearTimeout } */
  function create(opts) {
    var later = opts.setTimeout || root.setTimeout.bind(root);
    var cancel = opts.clearTimeout || root.clearTimeout.bind(root);
    var log = opts.log || function () {};
    var notice = opts.notice || function () {};
    var api = null, widget = null, token = "", state = "idle", interactive = false, lastMessage = "";
    var loading = null, waiters = [];

    function showBox() {
      if (opts.box && opts.box.classList) opts.box.classList.toggle("is-active", interactive || !!lastMessage);
    }
    function say(msg) { lastMessage = msg || ""; notice(lastMessage); showBox(); }

    function settle(tok, err) {
      var list = waiters; waiters = [];
      list.forEach(function (w) { w(tok, err); });
    }

    var options = {
      sitekey: opts.siteKey,
      action: opts.action,
      theme: "dark",
      size: "flexible",
      language: "es",
      appearance: "interaction-only",
      "response-field": false,
      "feedback-enabled": false,
      retry: "auto",
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
      callback: function (t) {
        token = typeof t === "string" ? t : "";
        state = "ready";
        if (lastMessage) say("");
        if (token) { var t2 = token; token = ""; if (waiters.length) settle(t2, null); else token = t2; }
      },
      "expired-callback": function () { token = ""; },
      "timeout-callback": function () { token = ""; },
      "before-interactive-callback": function () { interactive = true; showBox(); },
      "after-interactive-callback": function () { interactive = false; showBox(); },
      "error-callback": function (errorCode) {
        token = "";
        state = "error";
        log("[turnstile] error cliente:", safeCode(errorCode));
        var msg = messageFor(errorCode);
        say(msg);
        settle(null, new Error(msg));
        return true;   // manejado por LISTO (Cloudflare reintenta solo cuando corresponde)
      },
      "unsupported-callback": function () {
        token = "";
        state = "unsupported";
        log("[turnstile] navegador no compatible");
        say(MESSAGES.unsupported);
        settle(null, new Error(MESSAGES.unsupported));
      }
    };

    function render() {
      try {
        widget = api.render(opts.container, options);
        state = "waiting";
      } catch (e) {
        widget = null;
        state = "error";
        log("[turnstile] error cliente:", "render");
        say(MESSAGES.failed);
        settle(null, new Error(MESSAGES.failed));
      }
    }

    // Prepara el widget (al abrir "Quiero avanzar"). quiet: no mostrar aviso si falla la carga.
    function setup(quiet) {
      if (widget !== null && state !== "error") return Promise.resolve();
      if (loading) return loading;
      loading = (api ? Promise.resolve(api) : (opts.load || function () { return loadScript(root.document); })())
        .then(function (ts) {
          loading = null;
          api = ts;
          if (widget !== null) { try { api.remove(widget); } catch (e) { /* ya no estaba */ } widget = null; }
          token = "";
          if (!quiet) say("");
          render();
        }, function () {
          loading = null;
          state = "error";
          log("[turnstile] error cliente:", "load");
          if (!quiet) say(MESSAGES.load);
          settle(null, new Error(MESSAGES.load));
        });
      return loading;
    }

    // Devuelve un token nuevo (un solo uso). Si el widget estaba en error, lo vuelve a crear.
    function obtain() {
      if (token) { var t = token; token = ""; return Promise.resolve(t); }
      if (state === "unsupported") return Promise.reject(new Error(MESSAGES.unsupported));
      return new Promise(function (resolve, reject) {
        var done = false, timer = null;
        function arm(ms) { cancel(timer); timer = later(function () { finish(null, new Error(interactive ? MESSAGES.interact : MESSAGES.slow)); }, ms); }
        function finish(t, err) {
          if (done) return;
          done = true; cancel(timer);
          var i = waiters.indexOf(waiter); if (i !== -1) waiters.splice(i, 1);
          if (t) resolve(t); else reject(err);
        }
        function waiter(t, err) { done || finish(t, err); }
        waiters.push(waiter);
        arm(interactive ? INTERACTIVE_WAIT_MS : WAIT_MS);
        var wasInteractive = interactive;
        var watch = function () { if (!done && interactive && !wasInteractive) { wasInteractive = true; arm(INTERACTIVE_WAIT_MS); } if (!done) later(watch, 500); };
        later(watch, 500);
        if (widget === null || state === "error") {
          // Sin aviso doble: el error se muestra en el formulario.
          say("");
          setup(true);
        } else if (state === "ready" && api) {
          // Ya se usó el token anterior: pedir uno nuevo.
          try { api.reset(widget); state = "waiting"; } catch (e) { setup(true); }
        }
      });
    }

    // Después de cada envío: el token ya no sirve, se pide otro en segundo plano.
    function reset() {
      token = "";
      if (widget !== null && api) {
        try { api.reset(widget); state = "waiting"; } catch (e) { state = "error"; }
      }
    }

    function clearNotice() { if (lastMessage) say(""); }

    return { setup: setup, obtain: obtain, reset: reset, clearNotice: clearNotice, options: options,
      _state: function () { return { state: state, widget: widget, hasToken: !!token, interactive: interactive, message: lastMessage }; } };
  }

  var exported = { create: create, messageFor: messageFor, safeCode: safeCode, MESSAGES: MESSAGES, SRC: SRC, WAIT_MS: WAIT_MS };
  root.ListoVerify = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
