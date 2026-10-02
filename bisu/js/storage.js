/* Bisú Studio — Guardado en el navegador (localStorage).
   Los datos quedan en esta computadora y este navegador. Usar "Exportar copia" para respaldarlos. */

import { normalizeConfig, normalizeProduct, uid, SCHEMA_VERSION } from "./model.js";

const KEYS = {
  config: "bisu.config.v1",
  products: "bisu.products.v1",
  draft: "bisu.draft.v1",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadConfig() {
  return normalizeConfig(read(KEYS.config, null));
}

export function saveConfig(config) {
  config.updatedAt = new Date().toISOString();
  return write(KEYS.config, config);
}

export function hasSavedConfig() {
  return read(KEYS.config, null) !== null;
}

export function loadProducts(config) {
  const list = read(KEYS.products, []);
  return Array.isArray(list) ? list.map((p) => normalizeProduct(p, config)) : [];
}

export function saveProduct(product, config) {
  const list = loadProducts(config);
  const now = new Date().toISOString();
  if (!product.id) {
    product.id = uid("prd");
    product.createdAt = now;
  }
  product.updatedAt = now;
  const i = list.findIndex((p) => p.id === product.id);
  if (i >= 0) list[i] = product; else list.push(product);
  return write(KEYS.products, list);
}

export function deleteProduct(id, config) {
  return write(KEYS.products, loadProducts(config).filter((p) => p.id !== id));
}

export function loadDraft(config) {
  const d = read(KEYS.draft, null);
  return d ? normalizeProduct(d, config) : null;
}

export function saveDraft(product) {
  return write(KEYS.draft, product);
}

export function clearDraft() {
  try { localStorage.removeItem(KEYS.draft); } catch (e) { /* sin acceso */ }
}

export function exportAll(config) {
  return JSON.stringify({
    app: "bisu-costeo",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config: loadConfig(),
    products: loadProducts(config),
  }, null, 2);
}

export function importAll(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== "bisu-costeo") throw new Error("El archivo no es una copia de Bisú Costeo.");
  const config = normalizeConfig(data.config);
  const products = (data.products || []).map((p) => normalizeProduct(p, config));
  write(KEYS.config, config);
  write(KEYS.products, products);
  return { config, count: products.length };
}
