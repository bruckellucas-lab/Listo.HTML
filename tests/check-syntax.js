/* LISTO — Control rápido antes de publicar (sin dependencias):
   - que todos los .js tengan sintaxis válida (también los <script> dentro de los .html);
   - que vercel.json y package.json sean JSON válido;
   - que los archivos locales que cargan los .html existan;
   - que /api no pase el límite de 12 funciones de Vercel Hobby.
   Uso: node tests/check-syntax.js   (o npm run check) */
"use strict";

var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var childProcess = require("node:child_process");

var ROOT = path.join(__dirname, "..");
var MAX_FUNCTIONS = 12;
var problems = [];
var checked = 0;

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === "node_modules" || e.name[0] === ".") return;
    var full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  });
  return out;
}
function rel(f) { return path.relative(ROOT, f); }

var files = walk(ROOT, []);

files.filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  try {
    childProcess.execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    checked++;
  } catch (e) {
    problems.push(rel(f) + ": " + String(e.stderr || e.message).trim().split("\n").slice(0, 5).join("\n"));
  }
});

files.filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
  var html = fs.readFileSync(f, "utf8");
  var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    var attrs = m[1];
    var src = /\bsrc="([^"]+)"/.exec(attrs);
    if (src) {
      if (!/^(https?:)?\/\//.test(src[1]) && !fs.existsSync(path.join(path.dirname(f), src[1]))) problems.push(rel(f) + ": no existe " + src[1]);
      continue;
    }
    if (/type="(?!text\/javascript)[^"]*"/.test(attrs) || !m[2].trim()) continue;
    try { new vm.Script(m[2], { filename: rel(f) + " <script #" + n + ">" }); checked++; }
    catch (e) { problems.push(rel(f) + " <script #" + n + ">: " + e.message); }
  }
  var linkRe = /<link\b[^>]*\bhref="([^"]+)"/gi;
  while ((m = linkRe.exec(html))) {
    var href = m[1];
    if (/^(https?:|\/\/|data:|#|\/$)/.test(href)) continue;
    var target = href[0] === "/" ? path.join(ROOT, href) : path.join(path.dirname(f), href);
    if (!fs.existsSync(target)) problems.push(rel(f) + ": no existe " + href);
  }
});

["vercel.json", "package.json"].forEach(function (name) {
  var f = path.join(ROOT, name);
  if (!fs.existsSync(f)) return;
  try { JSON.parse(fs.readFileSync(f, "utf8")); checked++; } catch (e) { problems.push(name + ": JSON inválido (" + e.message + ")"); }
});

var fns = fs.readdirSync(path.join(ROOT, "api")).filter(function (f) { return /\.js$/.test(f) && f[0] !== "_"; });
if (fns.length > MAX_FUNCTIONS) problems.push("api/: hay " + fns.length + " funciones y Vercel Hobby permite " + MAX_FUNCTIONS + ".");

if (problems.length) {
  console.error("✗ " + problems.length + " problema(s):\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("✓ Sintaxis OK (" + checked + " archivos/bloques). Funciones en /api: " + fns.length + "/" + MAX_FUNCTIONS + ".");
