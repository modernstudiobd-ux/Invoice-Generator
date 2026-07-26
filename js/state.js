// state.js — the single source of truth for the app's in-memory data, plus the
// constants/defaults that shape it. No rendering or DOM-writing logic lives
// here on purpose: everything else imports `state` and reads/writes it.

import { $, uid } from "./dom.js";

export const KEY = "invoiceStudioPro.v2";

export const defaultColumns = () => [
  { id: uid(), key: "sku", label: "SKU", type: "text", width: 14, align: "left", visible: true, role: "none" },
  { id: uid(), key: "description", label: "Description", type: "text", width: 44, align: "left", visible: true, role: "none" },
  { id: uid(), key: "quantity", label: "Qty", type: "number", width: 11, align: "right", visible: true, role: "quantity" },
  { id: uid(), key: "rate", label: "Rate", type: "currency", width: 14, align: "right", visible: true, role: "rate" },
  { id: uid(), key: "amount", label: "Amount", type: "currency", width: 17, align: "right", visible: true, role: "amount" }
];

export const sectionDefs = [
  ["logo", "Logo"], ["company", "Company details"], ["client", "Client details"], ["status", "Invoice status"],
  ["invoiceDate", "Invoice date"], ["dueDate", "Due date"], ["reference", "Reference / PO"], ["balance", "Balance due"],
  ["notes", "Notes"], ["discount", "Discount"], ["tax", "Tax"], ["shipping", "Shipping"], ["payment", "Payment details"],
  ["terms", "Terms"], ["footer", "Footer"]
];

export const state = {
  logo: "",
  logoNatural: null,
  zoom: 1,
  columns: defaultColumns(),
  items: [],
  sections: Object.fromEntries(sectionDefs.map(x => [x[0], true]))
};

export const fields = ["logoHeight", "invoiceNumber", "status", "invoiceDate", "dueDate", "currency", "reference", "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite", "clientName", "clientContact", "clientTax", "clientAddress", "clientEmail", "discount", "tax", "shipping", "notes", "paymentDetails", "terms", "template", "accent", "accentHex", "paperSize"];

export const DEFAULT_ACCENT = "#18181b";

export const PAPER_SIZES = {
  a4: { w: 210, h: 297, page: "A4", pdfName: "A4", ptW: 595.28, ptH: 841.89 },
  letter: { w: 215.9, h: 279.4, page: "215.9mm 279.4mm", pdfName: "LETTER", ptW: 612, ptH: 792 }
};

export function currentPaper() {
  const sel = $("paperSize");
  return PAPER_SIZES[sel ? sel.value : "a4"] || PAPER_SIZES.a4;
}

// Printed/PDF pages after the first get a top margin so a multi-page invoice
// doesn't look like it just abruptly continues flush against the page edge.
// The first page keeps margin 0 (matches the on-screen design, which already
// accounts for its own internal spacing).
export const PRINT_PAGE_TOP_MARGIN_MM = 14;

// Reserved space at the bottom of every printed page for the footer (company
// name + invoice number + page number), rendered via native CSS @page margin
// boxes below. This is the print-only footer; the on-screen ".footer"
// element inside the invoice itself is hidden during print (see print.css)
// since this replaces it — @page margin boxes are the one mechanism browsers
// actually support for repeating footer content, with a real page count,
// on every physical printed page (an in-content element can't do this: it
// only ever exists once, wherever it falls in the flow).
const PRINT_PAGE_BOTTOM_MARGIN_MM = 12;

function cssStringEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").trim();
}

// Matches .invoice's own left/right padding (see invoice.css: padding:12mm 12mm 11mm)
// so the print footer text lines up with the invoice content above it instead
// of sitting flush against the physical page edges — the @page margin-box
// band spans the full page width regardless, this insets the text within it.
const PRINT_PAGE_SIDE_MARGIN_MM = 12;

export function applyPaperSize() {
  const p = currentPaper();
  document.documentElement.style.setProperty("--page-w", p.w + "mm");
  document.documentElement.style.setProperty("--page-h", p.h + "mm");

  const companyNameEl = $("companyName"), invoiceNumberEl = $("invoiceNumber");
  const companyName = cssStringEscape((companyNameEl && companyNameEl.value.trim()) || "Your Company");
  const invoiceNumber = cssStringEscape((invoiceNumberEl && invoiceNumberEl.value.trim()) || "Untitled");
  const footerOn = state.sections.footer;

  const footerBoxes = footerOn
    ? `@bottom-left{content:"${companyName}";font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:8pt;color:#8a94a5;text-align:left;padding-left:${PRINT_PAGE_SIDE_MARGIN_MM}mm}` +
      `@bottom-right{content:"Invoice #${invoiceNumber}  ·  Page " counter(page) " of " counter(pages);font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:8pt;color:#8a94a5;text-align:right;padding-right:${PRINT_PAGE_SIDE_MARGIN_MM}mm}`
    : "";

  $("pageSizeCSS").textContent =
    `@page{size:${p.page};margin:0;margin-top:${PRINT_PAGE_TOP_MARGIN_MM}mm;margin-bottom:${PRINT_PAGE_BOTTOM_MARGIN_MM}mm;${footerBoxes}}` +
    `@page:first{margin-top:0}`;
}

// Snapshot everything needed to fully reconstruct the current invoice
// (used for localStorage autosave, History entries, export, and undo/redo).
export function serialize() {
  let f = {};
  fields.forEach(id => f[id] = $(id).value);
  return { version: 2, logo: state.logo, logoNatural: state.logoNatural, zoom: state.zoom, columns: state.columns, items: state.items, sections: state.sections, fields: f };
}
