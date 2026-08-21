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

// Every section defaults to shown except Invoice status, which most invoices
// don't need and is off until someone turns it on.
export const defaultSections = () => Object.fromEntries(sectionDefs.map(x => [x[0], x[0] !== "status"]));

export const state = {
  logo: "",
  logoNatural: null,
  zoom: 1,
  columns: defaultColumns(),
  items: [],
  sections: defaultSections()
};

export const fields = ["logoHeight", "logoPosition", "invoiceNumber", "status", "invoiceDate", "dueDate", "currency", "reference", "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite", "clientName", "clientContact", "clientTax", "clientAddress", "clientEmail", "discount", "tax", "shipping", "notes", "paymentDetails", "terms", "notesAlign", "template", "accent", "accentHex", "totalColorHex", "headerColorHex", "headerTextColorHex", "invoiceColorHex", "paperSize"];

export const DEFAULT_ACCENT = "#18181b";

export const PAPER_SIZES = {
  a4: { w: 210, h: 297, page: "A4", pdfName: "A4", ptW: 595.28, ptH: 841.89 },
  letter: { w: 215.9, h: 279.4, page: "215.9mm 279.4mm", pdfName: "LETTER", ptW: 612, ptH: 792 }
};

export function currentPaper() {
  const sel = $("paperSize");
  return PAPER_SIZES[sel ? sel.value : "a4"] || PAPER_SIZES.a4;
}

// Each template's own .invoice padding (top/right/bottom/left, mm) — must
// stay in sync with css/invoice.css's base .invoice rule and each
// .invoice.template-X rule in css/templates.css. Templates not listed here
// (currently just Corporate) don't override the base padding, so they use
// the "modern" entry below.
const TEMPLATE_PADDING_MM = {
  modern: { top: 12, right: 12, bottom: 11, left: 12 },
  classic: { top: 14, right: 14, bottom: 13, left: 14 },
  compact: { top: 10, right: 10, bottom: 9, left: 10 },
  apple: { top: 16, right: 16, bottom: 14, left: 16 },
  luxury: { top: 18, right: 16, bottom: 18, left: 16 },
  agency: { top: 16, right: 16, bottom: 14, left: 20 },
  medical: { top: 14, right: 14, bottom: 14, left: 14 },
  legal: { top: 16, right: 18, bottom: 16, left: 18 },
  realestate: { top: 14, right: 14, bottom: 14, left: 14 },
  freelancer: { top: 14, right: 14, bottom: 14, left: 14 },
  restaurant: { top: 14, right: 14, bottom: 14, left: 14 },
  retail: { top: 14, right: 14, bottom: 14, left: 14 },
  technology: { top: 14, right: 14, bottom: 14, left: 14 },
  manufacturing: { top: 12, right: 12, bottom: 12, left: 12 },
  dark: { top: 14, right: 14, bottom: 14, left: 14 }
};

// The footer's left/right inset (on-screen, and reused for the print
// margin-box insets below) always matches the template's own left/right
// padding, and its distance from the bottom edge is the template's own
// bottom padding minus 2mm (leaving a small gap above the physical
// page/paper edge) — the exact relationship "Modern Professional" already
// used (padding-bottom 11mm → footer 9mm from the bottom), now applied to
// every template instead of one hardcoded 12mm/9mm pair for all of them.
export function templateFooterInsetMm(tpl) {
  const p = TEMPLATE_PADDING_MM[tpl] || TEMPLATE_PADDING_MM.modern;
  return { left: p.left, right: p.right, bottom: Math.max(0, p.bottom - 2) };
}

// Continuation pages (2nd onward) get a top margin so a multi-page invoice
// doesn't look like it just abruptly continues flush against the page edge.
// Bottom margin is on every page and is where the repeating footer + live
// "Page X of Y" counter live, as real @page margin boxes (@bottom-left /
// @bottom-right below).
//
// This went through two other designs first, both of which turned out to
// have a real correctness problem, not just a cosmetic one:
//   - A predicted, JS-simulated pagination (measuring row heights *before*
//     printing, then forcing explicit page breaks + real in-flow padding at
//     the predicted spots) let the reserved space be colored instead of
//     plain white margin. But it's exactly that: a *prediction*, made under
//     normal screen layout before print media is actually active — and it
//     doesn't always match the real print layout. Two different concrete
//     failures showed up from that gap: one template undercounted pages
//     outright (an orphan near-empty page with a wrong "Page X of Y"), and
//     another had real content run slightly past its predicted spot straight
//     into the reserved footer band, overlapping it — because that space
//     was only ever "empty" by assumption, nothing actually reserved it.
//   - position:fixed for the footer avoids the prediction problem but has
//     no way to reserve its own space in normal flow, so real content can
//     still flow right underneath it.
// A @page margin box sidesteps both: the browser reserves that space for
// every page itself, guaranteed, with zero prediction involved, which is
// worth plain white margin instead of colored. The trade-off is Firefox,
// which has ~no margin-box support — on Firefox the footer and page counter
// just won't appear when printing, a plain omission rather than a broken or
// overlapping one.
export const PRINT_CONTINUATION_TOP_MM = 14;
// Bottom margin needs to comfortably clear the current template's own
// footer text — see applyPaperSize below, which derives it per template
// from templateFooterInsetMm rather than using one fixed value for all of
// them.
const PRINT_BOTTOM_CLEARANCE_MM = 8;

function cssStringEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").trim();
}

export function applyPaperSize() {
  const p = currentPaper();
  document.documentElement.style.setProperty("--page-w", p.w + "mm");
  document.documentElement.style.setProperty("--page-h", p.h + "mm");
  const companyName = cssStringEscape($("companyName") ? $("companyName").value.trim() : "") || "Your Company";
  const invoiceNo = cssStringEscape($("invoiceNumber") ? $("invoiceNumber").value.trim() : "") || "Untitled";
  const marginBoxFont = `font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:8px;color:#8a94a5`;
  const tpl = $("template") ? $("template").value : "modern";
  const footerInset = templateFooterInsetMm(tpl);
  const bottomMarginMm = footerInset.bottom + PRINT_BOTTOM_CLEARANCE_MM;
  // Left/right inset for the margin boxes below — @page's own left/right
  // margin is 0, so without this the footer text sits flush against the
  // physical page edge while the invoice table above it is inset by the
  // current template's own padding, throwing them visibly out of alignment.
  // This is the single source of truth for @page — print.css intentionally
  // has no @page rule of its own, to avoid two separate @page declarations
  // (which Firefox's paged-media engine handles less predictably than
  // Chrome's) ever disagreeing with each other.
  $("pageSizeCSS").textContent =
    `@page{size:${p.page};margin:${PRINT_CONTINUATION_TOP_MM}mm 0 ${bottomMarginMm}mm 0;` +
    `@bottom-left{content:"${companyName}";margin-left:${footerInset.left}mm;${marginBoxFont}}` +
    `@bottom-right{content:"Invoice #${invoiceNo} · Page " counter(page) " of " counter(pages);margin-right:${footerInset.right}mm;${marginBoxFont}}}` +
    `@page:first{margin-top:0}`;
}

// Snapshot everything needed to fully reconstruct the current invoice
// (used for localStorage autosave, History entries, export, and undo/redo).
export function serialize() {
  let f = {};
  fields.forEach(id => f[id] = $(id).value);
  return { version: 2, logo: state.logo, logoNatural: state.logoNatural, zoom: state.zoom, columns: state.columns, items: state.items, sections: state.sections, fields: f };
}
