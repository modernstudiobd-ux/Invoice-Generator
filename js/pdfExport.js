// pdfExport.js — builds a pdfmake document definition from the current
// invoice and triggers a PDF download, plus the native browser print path.
//
// Every Design option in the sidebar gets its own PDF "theme" (themeFor,
// below) so the exported file matches the on-screen template — colors,
// header treatment, typography and table/balance styling — rather than
// falling back to one generic layout. pdfmake can't load custom fonts here
// (no network access to embed them), so typographic identity is carried by
// size/weight/spacing/case instead of font family.

import { $ } from "./dom.js";
import { state, currentPaper, DEFAULT_ACCENT } from "./state.js";
import { num, dateFmt, money } from "./format.js";
import { calc, itemValue } from "./calc.js";
import { toast } from "./toast.js";

export async function ensurePDFMake() {
  if (!window.pdfMake) {
    await new Promise((res, rej) => { let s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js"; s.onload = res; s.onerror = () => rej(Error("PDF export library could not load. Check your connection and try again.")); document.head.appendChild(s); });
  }
  if (!window.pdfMake.vfs) {
    await new Promise((res, rej) => { let s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js"; s.onload = res; s.onerror = () => rej(Error("PDF font data could not load. Check your connection and try again.")); document.head.appendChild(s); });
  }
}

function mmToPt(mm) { return +(mm * 2.83465).toFixed(2); }

function tint(hex, amt) {
  hex = String(hex || "#18181b").replace("#", "");
  if (hex.length !== 6) hex = "18181b";
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function fmtCellPdf(v, col) {
  if (col.type === "currency") return money(v);
  if (col.type === "number") return num(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (col.type === "percentage") return num(v).toFixed(2).replace(/\.00$/, "") + "%";
  if (col.type === "date") return dateFmt(v);
  return String(v ?? "");
}

async function logoToPngDataURL(src) {
  if (!src) return null;
  try {
    const img = new Image();
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(Error("logo")); });
    img.src = src;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 200; canvas.height = img.naturalHeight || 200;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Template themes — one entry per Design option. Each theme describes  */
/* margins, header treatment, typography and table/balance styling;     */
/* buildInvoiceDocDefinition() below reads these instead of branching   */
/* on the template id directly.                                        */
/* ------------------------------------------------------------------ */
function themeFor(tpl, accent) {
  const base = {
    margin: 12, marginLeft: null, pageBg: null,
    headerMode: "plain", // plain | band | centered | leftbar | stripe | box
    bandColor: null, bandTextColor: null,
    barColor: null, stripeColorA: null, stripeColorB: null,
    title: { size: 28, bold: false, color: accent, case: "none", spacing: 0 },
    name: { size: 15, bold: true, color: "#101828", case: "none", spacing: 0 },
    body: { text: "#1f2937", muted: "#485568", label: "#667085" },
    rule: { color: null, width: 0, dash: false, double: false },
    balance: { mode: "fill", fill: tint(accent, 0.92), border: null, textColor: "#18181b", labelColor: "#101828" },
    table: { headerFill: tint(accent, 0.94), headerColor: "#344054", border: "#d7dde6", grid: true },
    invnoChip: null
  };
  const merge = o => ({
    ...base, ...o,
    title: { ...base.title, ...o.title },
    name: { ...base.name, ...o.name },
    body: { ...base.body, ...o.body },
    rule: { ...base.rule, ...o.rule },
    balance: { ...base.balance, ...o.balance },
    table: { ...base.table, ...o.table }
  });

  switch (tpl) {
    case "classic": return merge({
      margin: 14,
      title: { size: 28, bold: true, color: "#1f2937", case: "upper", spacing: 2 },
      name: { size: 16, bold: true, color: "#1f2937", case: "upper", spacing: 0.6 },
      rule: { color: "#1f2937", width: 1.5 },
      balance: { mode: "outline", border: "#1f2937", textColor: "#1f2937", labelColor: "#101828" },
      table: { headerFill: "#1f2937", headerColor: "#ffffff", border: "#c9cdd3", grid: true }
    });
    case "compact": return merge({
      margin: 10,
      title: { size: 20, bold: false, color: accent },
      name: { size: 13, bold: true },
      rule: { color: "#1f2937", width: 2 },
      balance: { mode: "plain", border: accent, textColor: "#18181b", labelColor: "#101828" },
      table: { headerFill: null, headerColor: "#1f2937", border: "#e4e7ec", grid: false }
    });
    case "apple": return merge({
      margin: 16,
      title: { size: 34, bold: false, color: accent },
      name: { size: 14, bold: false, color: "#1d1d1f" },
      body: { text: "#1d1d1f", muted: "#86868b", label: "#86868b" },
      balance: { mode: "fill", fill: "#f5f5f7", textColor: "#18181b", labelColor: "#1d1d1f" },
      table: { headerFill: null, headerColor: "#86868b", border: "#e5e5e7", grid: false }
    });
    case "freelancer": return merge({
      margin: 14,
      title: { size: 30, bold: true, color: accent },
      name: { size: 15, bold: true, color: "#1f2937" },
      balance: { mode: "fill", fill: tint(accent, 0.9), border: tint(accent, 0.7), textColor: "#18181b", labelColor: "#101828" },
      table: { headerFill: tint(accent, 0.9), headerColor: accent, border: "#eef0f3", grid: false }
    });
    case "dark": return merge({
      margin: 14, pageBg: "#111318",
      title: { size: 30, bold: false, color: "#ffffff" },
      name: { size: 15, bold: true, color: "#ffffff" },
      body: { text: "#e6e8eb", muted: "#9aa1ac", label: "#9aa1ac" },
      rule: { color: accent, width: 2 },
      balance: { mode: "fill", fill: "#1c2230", border: tint(accent, 0.2), textColor: "#ffffff", labelColor: "#e6e8eb" },
      table: { headerFill: "#1c1f26", headerColor: "#c7cbd1", border: "#2a2e37", grid: true }
    });
    case "luxury": return merge({
      margin: 17, pageBg: "#0c0c0c",
      title: { size: 26, bold: false, color: "#b08d57", case: "upper", spacing: 3 },
      name: { size: 13, bold: false, color: "#f3ede2", case: "upper", spacing: 1.5 },
      body: { text: "#e7e0d3", muted: "#b8ab8f", label: "#8a7c62" },
      rule: { color: "#b08d57", width: 1 },
      balance: { mode: "outline", border: "#b08d57", textColor: "#b08d57", labelColor: "#8a7c62" },
      table: { headerFill: null, headerColor: "#b08d57", border: "#2a2a2a", grid: false }
    });
    case "corporate": return merge({
      margin: 14, headerMode: "band", bandColor: "#0b2545", bandTextColor: "#ffffff",
      title: { size: 26, bold: true, color: "#ffffff", case: "upper", spacing: 1.5 },
      name: { size: 15, bold: true, color: "#ffffff", case: "upper", spacing: 0.6 },
      body: { text: "#1f2937", muted: "#a9b7d1", label: "#a9b7d1" },
      rule: { color: accent, width: 3 },
      balance: { mode: "fill", fill: "#0b2545", textColor: "#ffffff", labelColor: "#ffffff" },
      table: { headerFill: "#0b2545", headerColor: "#ffffff", border: "#d7dde6", grid: true }
    });
    case "agency": return merge({
      margin: 16, marginLeft: 22, headerMode: "leftbar", barColor: accent,
      title: { size: 38, bold: true, color: "#111111", spacing: -0.3 },
      name: { size: 18, bold: true, color: "#111111" },
      rule: { color: "#111111", width: 3 },
      balance: { mode: "fill", fill: "#111111", textColor: "#ffffff", labelColor: "#ffffff" },
      table: { headerFill: "#111111", headerColor: "#ffffff", border: "#e4e7ec", grid: true }
    });
    case "construction": return merge({
      margin: 12, headerMode: "stripe", stripeColorA: "#f2b705", stripeColorB: "#1f2430",
      title: { size: 28, bold: true, color: "#1f2430" },
      name: { size: 16, bold: true, color: "#1f2430", case: "upper" },
      rule: { color: "#1f2430", width: 3 },
      balance: { mode: "fill", fill: "#1f2430", textColor: "#f2b705", labelColor: "#ffffff" },
      table: { headerFill: "#1f2430", headerColor: "#f2b705", border: "#1f2430", grid: true }
    });
    case "medical": return merge({
      margin: 14, headerMode: "band", bandColor: "#f4fbfa", bandTextColor: "#0f6a63",
      title: { size: 24, bold: false, color: "#0f6a63" },
      name: { size: 16, bold: true, color: "#0f6a63" },
      body: { text: "#1f2937", muted: "#5b7d79", label: "#5b7d79" },
      balance: { mode: "fill", fill: "#e3f5f2", border: "#bfe6df", textColor: "#0f6a63", labelColor: "#0f6a63" },
      table: { headerFill: "#e3f5f2", headerColor: "#0f6a63", border: "#dcece9", grid: true }
    });
    case "legal": return merge({
      margin: 16, headerMode: "centered",
      title: { size: 20, bold: true, color: "#1f2937", case: "upper", spacing: 3 },
      name: { size: 18, bold: true, color: "#1f2937", case: "upper", spacing: 1.2 },
      body: { text: "#1f2937", muted: "#475467", label: "#475467" },
      rule: { color: "#1f2937", width: 1.5, double: true },
      balance: { mode: "outline", border: "#1f2937", textColor: "#1f2937", labelColor: "#101828" },
      table: { headerFill: null, headerColor: "#1f2937", border: "#1f2937", grid: false }
    });
    case "realestate": return merge({
      margin: 14,
      title: { size: 28, bold: false, color: "#2b2b28", spacing: 0.5 },
      name: { size: 17, bold: true, color: "#2b2b28" },
      body: { text: "#2b2b28", muted: "#6b6558", label: "#8a6d3b" },
      rule: { color: "#d9d2c3", width: 1 },
      balance: { mode: "fill", fill: "#faf7f0", border: "#e5ddc8", textColor: "#2b2b28", labelColor: "#2b2b28" },
      table: { headerFill: "#faf7f0", headerColor: "#6b6558", border: "#eee8d9", grid: true }
    });
    case "restaurant": return merge({
      margin: 14, pageBg: "#fbf9f4",
      title: { size: 24, bold: true, color: "#4b5320", spacing: 0.5 },
      name: { size: 15, bold: true, color: "#3c3a2f" },
      body: { text: "#3c3a2f", muted: "#7a7563", label: "#7a7563" },
      rule: { color: "#4b5320", width: 1.5, dash: true },
      balance: { mode: "outline", border: "#4b5320", textColor: "#4b5320", labelColor: "#3c3a2f" },
      table: { headerFill: null, headerColor: "#4b5320", border: "#d8d3c2", grid: false }
    });
    case "retail": return merge({
      margin: 14,
      title: { size: 28, bold: true, color: "#111111", case: "upper", spacing: 0.5 },
      name: { size: 17, bold: true, color: "#111111", case: "upper" },
      rule: { color: "#111111", width: 3 },
      balance: { mode: "fill", fill: accent, textColor: "#ffffff", labelColor: "#ffffff" },
      table: { headerFill: "#111111", headerColor: "#ffffff", border: "#111111", grid: true }
    });
    case "technology": return merge({
      margin: 14,
      title: { size: 24, bold: true, color: "#0b0e14", spacing: -0.2 },
      name: { size: 15, bold: true, color: "#0b0e14" },
      invnoChip: { fill: "#0b0e14", color: "#7ee7c7" },
      balance: { mode: "fill", fill: "#0b0e14", textColor: "#7ee7c7", labelColor: "#9aa1ac" },
      table: { headerFill: "#0b0e14", headerColor: "#e6e8eb", border: "#e4e7ec", grid: true }
    });
    case "manufacturing": return merge({
      margin: 12, headerMode: "box",
      title: { size: 22, bold: true, color: "#1f2733", case: "upper" },
      name: { size: 15, bold: true, color: "#1f2733", case: "upper" },
      body: { text: "#1f2733", muted: "#384250", label: "#384250" },
      balance: { mode: "fillOutline", fill: "#eceff2", border: "#384250", textColor: "#1f2733", labelColor: "#1f2733" },
      table: { headerFill: "#384250", headerColor: "#ffffff", border: "#c3ccd6", grid: true }
    });
    default: return merge({}); // modern
  }
}

function tableLayoutFor(theme) {
  const border = theme.table.border || "#d7dde6";
  const grid = theme.table.grid !== false;
  return {
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : (grid ? 0.75 : 0.6),
    vLineWidth: () => (grid ? 0.75 : 0),
    hLineColor: () => border,
    vLineColor: () => border,
    paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 6, paddingBottom: () => 6
  };
}

function balanceTable(theme, totalMoney) {
  const b = theme.balance;
  const labelCell = { text: "Balance due", fontSize: 11, bold: true, color: b.labelColor };
  const amountCell = { text: totalMoney, fontSize: 16, bold: true, color: b.textColor, alignment: "right" };
  if (b.mode === "outline") {
    return {
      table: { widths: ["*", "auto"], body: [[{ ...labelCell, margin: [10, 7, 4, 7] }, { ...amountCell, margin: [4, 7, 10, 7] }]] },
      layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => b.border, vLineColor: () => b.border, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
    };
  }
  if (b.mode === "plain") {
    return {
      stack: [
        { columns: [labelCell, amountCell] },
        { canvas: [{ type: "line", x1: 0, y1: 4, x2: 200, y2: 4, lineWidth: 2, lineColor: b.border }] }
      ]
    };
  }
  if (b.mode === "fillOutline") {
    return {
      table: { widths: ["*", "auto"], body: [[{ ...labelCell, fillColor: b.fill, margin: [10, 7, 4, 7] }, { ...amountCell, fillColor: b.fill, margin: [4, 7, 10, 7] }]] },
      layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => b.border, vLineColor: () => b.border, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
    };
  }
  // "fill" — solid or tinted background block, the most common style
  const layout = b.border
    ? { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => b.border, vLineColor: () => b.border, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
    : "noBorders";
  return { table: { widths: ["*", "auto"], body: [[{ ...labelCell, fillColor: b.fill, margin: [10, 7, 4, 7] }, { ...amountCell, fillColor: b.fill, margin: [4, 7, 10, 7] }]] }, layout };
}

function cased(text, mode) { return mode === "upper" ? String(text).toUpperCase() : text; }

async function buildInvoiceDocDefinition() {
  const paper = currentPaper();
  const tpl = $("template").value;
  const accent = $("accentHex").value || DEFAULT_ACCENT;
  const theme = themeFor(tpl, accent);

  // Optional overrides (Total due / Header background / Header text / Invoice
  // area background) — same hex fields the live preview reads, empty means
  // "use the template's own default" and is left untouched here.
  const validHex = v => /^#[0-9a-f]{6}$/i.test(v || "");
  const totalOverride = $("totalColorHex").value.trim();
  const headerBgOverride = $("headerColorHex").value.trim();
  const headerTextOverride = $("headerTextColorHex").value.trim();
  const invoiceOverride = $("invoiceColorHex").value.trim();
  if (validHex(totalOverride)) theme.balance.textColor = totalOverride;
  if (validHex(headerBgOverride) && (theme.headerMode === "band")) theme.bandColor = headerBgOverride;
  if (validHex(invoiceOverride)) theme.pageBg = invoiceOverride;

  const marginMm = theme.margin;
  const marginLeftMm = theme.marginLeft ?? marginMm;
  const margin = mmToPt(marginMm);
  const marginLeft = mmToPt(marginLeftMm);
  const contentWidth = paper.ptW - margin - marginLeft;
  const status = $("status").value;
  const statusColors = { Draft: ["#475467", "#f2f4f7"], Due: ["#18794e", "#ecfdf3"], Paid: ["#175cd3", "#eff8ff"], "Partially Paid": ["#9a6700", "#fffaeb"], Overdue: ["#b42318", "#fef3f2"], Canceled: ["#667085", "#f2f4f7"] }[status] || ["#475467", "#f2f4f7"];
  const t = calc();
  const visible = state.columns.filter(c => c.visible);
  const rawW = visible.map(c => Math.max(5, num(c.width))), sumW = rawW.reduce((a, b) => a + b, 0) || 1;
  const colWidths = rawW.map(w => (w / sumW * 100).toFixed(2) + "%");

  const tableBody = [visible.map(c => ({ text: c.label.toUpperCase(), bold: true, fontSize: 8, color: theme.table.headerColor, fillColor: theme.table.headerFill || undefined, alignment: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }))];
  if (!state.items.length) {
    tableBody.push([{ text: "No line items added.", colSpan: visible.length, alignment: "center", color: "#98a2b3", italics: true, margin: [0, 6, 0, 6] }, ...Array(Math.max(0, visible.length - 1)).fill({})]);
  } else {
    state.items.forEach(item => tableBody.push(visible.map(c => ({ text: fmtCellPdf(itemValue(item, c), c), fontSize: 9, alignment: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }))));
  }

  const logoDataUrl = (state.sections.logo && state.logo) ? await logoToPngDataURL(state.logo) : null;
  const logoHeightPt = Math.max(24, Math.min(160, num($("logoHeight").value) || 48)) * 0.75;

  const companyName = $("companyName").value.trim() || "Your Company";
  const companyMeta = [];
  if ($("companyReg").value.trim()) companyMeta.push("Registration: " + $("companyReg").value.trim());
  if ($("companyVat").value.trim()) companyMeta.push("VAT / Tax: " + $("companyVat").value.trim());
  if ($("companyAddress").value.trim()) companyMeta.push($("companyAddress").value.trim());
  if ($("companyPhone").value.trim()) companyMeta.push("Phone: " + $("companyPhone").value.trim());
  if ($("companyEmail").value.trim()) companyMeta.push("Email: " + $("companyEmail").value.trim());
  if ($("companyWebsite").value.trim()) companyMeta.push($("companyWebsite").value.trim());

  const clientName = $("clientName").value.trim() || "Client company";
  const clientMeta = [];
  if ($("clientContact").value.trim()) clientMeta.push($("clientContact").value.trim());
  if ($("clientTax").value.trim()) clientMeta.push("VAT / Tax: " + $("clientTax").value.trim());
  if ($("clientAddress").value.trim()) clientMeta.push($("clientAddress").value.trim());
  if ($("clientEmail").value.trim()) clientMeta.push($("clientEmail").value.trim());

  const invNo = $("invoiceNumber").value.trim() || "Untitled";
  const notesText = $("notes").value.trim();
  const termsText = $("terms").value.trim();
  const paymentText = $("paymentDetails").value.trim();

  // Header text color override applies only to header text nodes (company
  // name/meta, "Invoice" title, invoice #, date/due/reference) — never to
  // the balance box, BILL TO section, table, or footer, which stay on the
  // theme's own colors (or their own separate overrides).
  const hName = headerTextOverride && validHex(headerTextOverride) ? headerTextOverride : theme.name.color;
  const hTitle = headerTextOverride && validHex(headerTextOverride) ? headerTextOverride : theme.title.color;
  const hMuted = headerTextOverride && validHex(headerTextOverride) ? headerTextOverride : theme.body.muted;
  const hLabel = headerTextOverride && validHex(headerTextOverride) ? headerTextOverride : theme.body.label;
  const hText = headerTextOverride && validHex(headerTextOverride) ? headerTextOverride : theme.body.text;

  // Compact-minimal always stacks the logo above the company name (matches
  // the on-screen "Compact Minimal" layout); every other template keeps the
  // logo inline above the name within the same left-hand stack.
  const headerLeft = [
    ...(logoDataUrl ? [{ image: logoDataUrl, fit: [165, logoHeightPt], margin: [0, 0, 0, 8] }] : []),
    { text: cased(companyName, theme.name.case), bold: theme.name.bold, fontSize: theme.name.size, color: hName, characterSpacing: theme.name.spacing || 0, margin: [0, 0, 0, 4] },
    ...(state.sections.company && companyMeta.length ? [{ text: companyMeta.join("\n"), fontSize: 8.5, color: hMuted, lineHeight: 1.25 }] : [])
  ];

  const metaRows = [];
  if (state.sections.invoiceDate) metaRows.push(["Invoice date", dateFmt($("invoiceDate").value)]);
  if (state.sections.dueDate) metaRows.push(["Due date", dateFmt($("dueDate").value)]);
  if (state.sections.reference) metaRows.push(["Reference", $("reference").value.trim() || "—"]);

  const invNoNode = theme.invnoChip
    ? { table: { widths: ["auto"], body: [[{ text: "#" + invNo, fontSize: 10, bold: true, color: theme.invnoChip.color, fillColor: theme.invnoChip.fill, margin: [6, 3, 6, 3] }]] }, layout: "noBorders", alignment: "right", margin: [0, 0, 0, 8] }
    : { text: "#" + invNo, alignment: "right", fontSize: 12, bold: true, color: hMuted, margin: [0, 0, 0, 8] };

  const headerRight = [
    { text: cased("Invoice", theme.title.case), alignment: "right", fontSize: theme.title.size, bold: theme.title.bold, color: hTitle, characterSpacing: theme.title.spacing || 0, margin: [0, 0, 0, 2] },
    invNoNode,
    ...metaRows.map(([l, v]) => ({ columns: [{ text: l, fontSize: 9, color: hLabel }, { text: v, fontSize: 9, bold: true, alignment: "right", color: hText }], margin: [0, 1.5, 0, 1.5] }))
  ];

  const content = [];

  // --- Header block, shaped by headerMode -------------------------------
  if (theme.headerMode === "centered") {
    content.push({ stack: [...headerLeft, { text: "", margin: [0, 6, 0, 0] }, ...headerRight], alignment: "center" });
  } else if (theme.headerMode === "band") {
    content.push({
      table: { widths: ["*"], body: [[{ margin: [margin, margin, margin, 14], stack: [{ columns: [{ width: "*", stack: headerLeft }, { width: "*", stack: headerRight }], columnGap: 18 }], fillColor: theme.bandColor }]] },
      layout: "noBorders",
      margin: [-marginLeft, -margin, -margin, 0]
    });
  } else if (theme.headerMode === "box") {
    content.push({
      table: { widths: ["*"], body: [[{ margin: [10, 10, 10, 10], columns: [{ width: "*", stack: headerLeft }, { width: "*", stack: headerRight }], columnGap: 18 }]] },
      layout: { hLineWidth: () => 2, vLineWidth: () => 2, hLineColor: () => "#384250", vLineColor: () => "#384250" }
    });
  } else {
    // plain / leftbar / stripe all use the standard two-column header;
    // leftbar and stripe add their own accent marks below.
    content.push({ columns: [{ width: "*", stack: headerLeft }, { width: "*", stack: headerRight }], columnGap: 18 });
  }

  if (theme.headerMode === "stripe") {
    content.unshift(
      { canvas: [{ type: "rect", x: 0, y: 0, w: contentWidth, h: mmToPt(3), color: theme.stripeColorA }] },
      { canvas: [{ type: "rect", x: 0, y: 0, w: contentWidth, h: mmToPt(1.4), color: theme.stripeColorB }], margin: [0, 0, 0, 10] }
    );
  }
  if (theme.headerMode === "leftbar") {
    const headerBlock = content.pop();
    content.push({ columns: [{ width: 10, canvas: [{ type: "rect", x: 0, y: 0, w: 8, h: 100, color: theme.barColor }] }, { width: "*", stack: [headerBlock] }], columnGap: 10 });
  }

  // --- Divider under the header (band mode already has its own edge; only add
  // an accent rule there if the theme specifies one, e.g. corporate's navy band). ---
  if (theme.headerMode === "band") {
    if (theme.rule.color) content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: theme.rule.width, lineColor: theme.rule.color }], margin: [0, 0, 0, 10] });
  } else if (theme.rule.double) {
    content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: theme.rule.width, lineColor: theme.rule.color }, { type: "line", x1: 0, y1: 3, x2: contentWidth, y2: 3, lineWidth: theme.rule.width, lineColor: theme.rule.color }], margin: [0, 6, 0, 10] });
  } else if (theme.rule.color) {
    content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: theme.rule.width, lineColor: theme.rule.color, dash: theme.rule.dash ? { length: 4, space: 3 } : undefined }], margin: [0, 6, 0, 10] });
  } else {
    content.push({ text: "", margin: [0, 6, 0, 0] });
  }

  if (state.sections.status || state.sections.balance) {
    const row = [];
    row.push(state.sections.status ? {
      width: "auto",
      table: {
        body: [[{
          // pdfmake's embedded Roboto font subset doesn't include the "●"
          // glyph (U+25CF), so it silently disappears in the PDF even though
          // it renders fine on screen/print via the browser's own fonts.
          // Drawing the dot with pdfmake's canvas primitive instead sidesteps
          // font glyph coverage entirely.
          columns: [
            { width: 7, canvas: [{ type: "ellipse", x: 3.5, y: 5, r1: 3.5, r2: 3.5, color: statusColors[0] }] },
            { width: "auto", text: status, fontSize: 9, bold: true, color: statusColors[0], margin: [3, 0, 0, 0] }
          ],
          columnGap: 0,
          fillColor: statusColors[1],
          margin: [8, 4, 8, 4]
        }]]
      },
      layout: "noBorders"
    } : { width: "auto", text: "" });
    row.push(state.sections.balance ? { width: "*", ...balanceTable(theme, money(t.total)) } : { width: "*", text: "" });
    content.push({ columns: row, columnGap: 14, margin: [0, 6, 0, 10] });
  }

  if (state.sections.client) {
    content.push({ text: "BILL TO", fontSize: 8, bold: true, color: theme.body.label, characterSpacing: 1, margin: [0, 4, 0, 3] });
    content.push({ text: clientName, fontSize: 12, bold: true, color: theme.body.text, margin: [0, 0, 0, 2] });
    content.push(clientMeta.length ? { text: clientMeta.join("\n"), fontSize: 9, color: theme.body.muted, margin: [0, 0, 0, 10] } : { text: "", margin: [0, 0, 0, 10] });
  }

  content.push({ table: { headerRows: 1, widths: colWidths, body: tableBody }, layout: tableLayoutFor(theme), margin: [0, 4, 0, 10] });

  const summaryRows = [["Subtotal", money(t.subtotal)]];
  if (t.disc && state.sections.discount) summaryRows.push([`Discount (${t.dr.toFixed(2).replace(/\.00$/, "")}%)`, "−" + money(t.disc)]);
  if (t.tax && state.sections.tax) summaryRows.push([`Tax (${t.tr.toFixed(2).replace(/\.00$/, "")}%)`, money(t.tax)]);
  if (t.ship && state.sections.shipping) summaryRows.push(["Shipping", money(t.ship)]);

  const notesStack = (state.sections.notes && notesText) ? [{ text: "Invoice note", fontSize: 8, bold: true, color: theme.body.label, margin: [0, 0, 0, 3] }, { text: notesText, fontSize: 9, color: theme.body.text }] : [{ text: "" }];

  content.push({
    columns: [
      { width: "*", stack: notesStack },
      {
        width: 180, stack: [
          ...summaryRows.map(([l, v]) => ({ columns: [{ text: l, fontSize: 9, color: theme.body.label }, { text: v, fontSize: 9, bold: true, alignment: "right", color: theme.body.text }], margin: [0, 1.5, 0, 1.5] })),
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: theme.rule.color || "#1f2937" }], margin: [0, 4, 0, 4] },
          { columns: [{ text: "Total", fontSize: 12, bold: true, color: theme.body.text }, { text: money(t.total), fontSize: 12, bold: true, alignment: "right", color: theme.body.text }] }
        ]
      }
    ],
    columnGap: 18,
    margin: [0, 4, 0, 10]
  });

  if ((state.sections.payment && paymentText) || (state.sections.terms && termsText)) {
    content.push({
      columns: [
        { width: "*", stack: (state.sections.payment && paymentText) ? [{ text: "Payment details", fontSize: 8, bold: true, color: theme.body.label, margin: [0, 0, 0, 3] }, { text: paymentText, fontSize: 9, color: theme.body.text }] : [{ text: "" }] },
        { width: "*", stack: (state.sections.terms && termsText) ? [{ text: "Terms", fontSize: 8, bold: true, color: theme.body.label, margin: [0, 0, 0, 3] }, { text: termsText, fontSize: 9, color: theme.body.text }] : [{ text: "" }] }
      ],
      columnGap: 18,
      margin: [0, 6, 0, 0]
    });
  }

  return {
    pageSize: paper.pdfName,
    pageMargins: [marginLeft, margin, margin, margin],
    background: theme.pageBg ? ((currentPage, pageSize) => ({ canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: theme.pageBg }] })) : undefined,
    footer: state.sections.footer ? ((currentPage, pageCount) => ({ columns: [{ text: companyName, fontSize: 7.5, color: theme.body.muted, margin: [marginLeft, 0, 0, 0] }, { text: "Invoice #" + invNo + (pageCount > 1 ? "  ·  Page " + currentPage + " of " + pageCount : ""), fontSize: 7.5, color: theme.body.muted, alignment: "right", margin: [0, 0, margin, 0] }] })) : undefined,
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: theme.body.text }
  };
}

export async function downloadInvoicePDF(suggestedName) {
  try {
    toast("Preparing your PDF…");
    await ensurePDFMake();
    const docDefinition = await buildInvoiceDocDefinition();
    const hasLogoNode = JSON.stringify(docDefinition.content).includes('"image"');
    if (state.sections.logo && state.logo && !hasLogoNode) toast("Note: the logo couldn't be embedded in the PDF — everything else exported fine.");
    pdfMake.createPdf(docDefinition).download((suggestedName || "invoice") + ".pdf");
  } catch (err) {
    toast(err.message || "PDF export failed — check your connection and try again.");
  }
}

export function printInvoice(suggestedName) {
  const invoice = $("invoice");
  const wrap = document.querySelector(".canvaswrap");
  const oldTitle = document.title;
  const oldTransform = invoice.style.transform;
  const oldMarginLeft = invoice.style.marginLeft;
  const oldWrapHeight = wrap ? wrap.style.height : "";
  if (suggestedName) document.title = suggestedName;
  invoice.style.transform = "none";
  invoice.style.marginLeft = "0";
  if (wrap) wrap.style.height = "auto";
  requestAnimationFrame(() => {
    window.print();
    setTimeout(() => { invoice.style.transform = oldTransform; invoice.style.marginLeft = oldMarginLeft; if (wrap) wrap.style.height = oldWrapHeight; document.title = oldTitle; }, 250);
  });
}
