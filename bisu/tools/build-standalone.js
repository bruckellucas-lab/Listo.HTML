/* Bisú Studio — Genera la versión de un solo archivo (HTML + CSS + JS embebidos).

   Uso (desde la carpeta bisu/):
     node tools/build-standalone.js                      → escribe bisu-costing.html
     node tools/build-standalone.js --artifact <archivo> → versión para publicar en Claude
                                                            (sin <html>/<head>, sin botón Descargar)

   No editar a mano el archivo generado: cambiar js/, styles.css o index.html y volver a correr esto.
   Antes de escribir, verifica que todo el JavaScript sea válido (si no, falla y no escribe nada). */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["decimal", "finance", "model", "pricing", "storage", "format", "app"];
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/* Convierte cada módulo ES en una función que devuelve sus exports, y los imports en lecturas de esos objetos. */
export function bundleModules() {
  return MODULES.map((name) => {
    let src = read(`js/${name}.js`);
    const exports = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    src = src.replace(/^import\s+(\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+"\.\/(\w+)\.js";/gm, (all, names, mod) => {
      if (!MODULES.includes(mod)) throw new Error(`${name}.js importa un módulo desconocido: ${mod}`);
      return names.startsWith("*")
        ? `const ${names.replace(/^\*\s+as\s+/, "")} = __${mod};`
        : `const ${names.replace(/\s+as\s+/g, ": ")} = __${mod};`;
    });
    src = src.replace(/^export\s+/gm, "");
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}.js tiene un import/export que el generador no entiende`);
    return `const __${name} = (() => {\n${src}\nreturn { ${exports.join(", ")} };\n})();`;
  }).join("\n");
}

function assertValidScript(code, label) {
  try {
    new vm.Script(code, { filename: label });
  } catch (e) {
    throw new Error(`JavaScript inválido en ${label}: ${e.message}`);
  }
}

// Un "</script" dentro del código cerraría la etiqueta antes de tiempo.
const safeScript = (code) => code.replace(/<\/script/gi, "<\\/script");

export function buildStandalone({ artifact = false } = {}) {
  const html = read("index.html");
  const css = read("styles.css");
  const fonts = html.match(/<link href="(https:\/\/fonts\.googleapis\.com[^"]+)" rel="stylesheet">/)[1];
  const bodyMatch = html.match(/<body>([\s\S]*?)<noscript>/);
  if (!bodyMatch) throw new Error("No se encontró el contenido de <body> en index.html");
  const body = bodyMatch[1].replace('href="/bisu/"', 'href="#"');

  // Validar el script de la guardia de arranque y el principal.
  [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => assertValidScript(m[1], `guardia-${i}`));
  const flags = artifact ? "window.__BISU_NO_DOWNLOAD__ = true;\n" : "";
  const appJs = `"use strict";\n${flags}${bundleModules()}`;
  assertValidScript(appJs, "app");

  const content = `<title>Bisú Studio Costeo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
${body}
<noscript><p class="noscript">Esta herramienta necesita JavaScript activado.</p></noscript>
<script>
${safeScript(appJs)}
</script>
`;
  if (artifact) return content;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<!-- Archivo generado por bisu/tools/build-standalone.js. No editar a mano. -->
${content.replace(/<\/style>\n/, "</style>\n</head>\n<body>\n")}</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--artifact");
  if (i > 0) {
    const out = process.argv[i + 1];
    writeFileSync(out, buildStandalone({ artifact: true }));
    console.log("Versión para Claude escrita en " + out);
  } else {
    writeFileSync(join(ROOT, "bisu-costing.html"), buildStandalone());
    console.log("Escrito bisu/bisu-costing.html");
  }
}
