// accent.js — the invoice's accent color (used across CSS via --accent / --accent-rgb).

import { $ } from "./dom.js";

export function safeColor(v) {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#2563eb";
}

export function setAccent(v) {
  v = safeColor(v);
  let h = v.slice(1), rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(",");
  // Scoped to #invoice (not the document root) so this only ever affects the
  // invoice design — never the app's own sidebar/editor chrome.
  $("invoice").style.setProperty("--accent", v);
  $("invoice").style.setProperty("--accent-rgb", rgb);
  $("accent").value = v;
  $("accentHex").value = v;
}

// Optional overrides, independent of the accent color: Total due color, and
// Header/Invoice area/Footer background. Each pairs a hex text field (the
// stored value — empty means "no override, use the template's own default")
// with a color-picker swatch (a convenience input, not itself persisted).
// All are scoped to #invoice, same as setAccent above.
const OPTIONAL_COLOR_VARS = {
  totalColor: { cssVar: "--total-color", hostClass: null },
  headerColor: { cssVar: "--header-bg", hostClass: "has-header-bg" },
  invoiceColor: { cssVar: "--invoice-bg", hostClass: null },
  footerColor: { cssVar: "--footer-bg", hostClass: "has-footer-bg" }
};

export function applyOptionalColor(id) {
  const cfg = OPTIONAL_COLOR_VARS[id];
  if (!cfg) return;
  const invoice = $("invoice");
  const hex = $(id + "Hex").value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    invoice.style.setProperty(cfg.cssVar, hex);
    $(id).value = hex;
    if (cfg.hostClass) invoice.classList.add(cfg.hostClass);
  } else {
    invoice.style.removeProperty(cfg.cssVar);
    if (cfg.hostClass) invoice.classList.remove(cfg.hostClass);
  }
}

export function clearOptionalColor(id) {
  $(id + "Hex").value = "";
  applyOptionalColor(id);
}

export function applyAllOptionalColors() {
  Object.keys(OPTIONAL_COLOR_VARS).forEach(applyOptionalColor);
}
