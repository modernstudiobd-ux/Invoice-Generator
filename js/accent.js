// accent.js — the invoice's accent color (used across CSS via --accent / --accent-rgb).

import { $ } from "./dom.js";

export function safeColor(v) {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#2563eb";
}

export function setAccent(v) {
  v = safeColor(v);
  let h = v.slice(1), rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(",");
  document.documentElement.style.setProperty("--accent", v);
  document.documentElement.style.setProperty("--accent-rgb", rgb);
  $("accent").value = v;
  $("accentHex").value = v;
}
