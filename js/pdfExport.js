// pdfExport.js — builds a pdfmake document definition from the current
// invoice and triggers a PDF download, plus the native browser print path.

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

function pdfTableLayout(tpl) {
  if (tpl === "classic") return { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => "#c9cdd3", vLineColor: () => "#c9cdd3", paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 5, paddingBottom: () => 5 };
  if (tpl === "compact") return { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5, vLineWidth: () => 0, hLineColor: (i) => i <= 1 ? "#1f2937" : "#e4e7ec", paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 };
  return { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => "#d7dde6", vLineColor: () => "#d7dde6", paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 6, paddingBottom: () => 6 };
}

async function buildInvoiceDocDefinition() {
  const paper = currentPaper();
  const tpl = $("template").value;
  const accent = $("accentHex").value || DEFAULT_ACCENT;
  const marginMm = tpl === "classic" ? 14 : tpl === "compact" ? 10 : 12;
  const margin = mmToPt(marginMm);
  const contentWidth = paper.ptW - margin * 2;
  const status = $("status").value;
  const statusColors = { Draft: ["#475467", "#f2f4f7"], Due: ["#18794e", "#ecfdf3"], Paid: ["#175cd3", "#eff8ff"], "Partially Paid": ["#9a6700", "#fffaeb"], Overdue: ["#b42318", "#fef3f2"], Canceled: ["#667085", "#f2f4f7"] }[status] || ["#475467", "#f2f4f7"];
  const t = calc();
  const visible = state.columns.filter(c => c.visible);
  const rawW = visible.map(c => Math.max(5, num(c.width))), sumW = rawW.reduce((a, b) => a + b, 0) || 1;
  const colWidths = rawW.map(w => (w / sumW * 100).toFixed(2) + "%");

  const headerFill = tpl === "classic" ? accent : tpl === "compact" ? null : tint(accent, 0.94);
  const headerColor = tpl === "classic" ? "#ffffff" : "#344054";
  const tableBody = [visible.map(c => ({ text: c.label.toUpperCase(), bold: true, fontSize: 8, color: headerColor, fillColor: headerFill || undefined, alignment: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }))];
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
  const titleColor = tpl === "classic" ? "#1f2937" : accent;

  const headerLeft = [
    ...(logoDataUrl ? [{ image: logoDataUrl, fit: [165, logoHeightPt], margin: [0, 0, 0, 8] }] : []),
    { text: companyName, bold: true, fontSize: tpl === "compact" ? 13 : tpl === "classic" ? 14 : 15, margin: [0, 0, 0, 4] },
    ...(state.sections.company && companyMeta.length ? [{ text: companyMeta.join("\n"), fontSize: 8.5, color: "#485568", lineHeight: 1.25 }] : [])
  ];

  const metaRows = [];
  if (state.sections.invoiceDate) metaRows.push(["Invoice date", dateFmt($("invoiceDate").value)]);
  if (state.sections.dueDate) metaRows.push(["Due date", dateFmt($("dueDate").value)]);
  if (state.sections.reference) metaRows.push(["Reference", $("reference").value.trim() || "—"]);

  const headerRight = [
    { text: tpl === "classic" ? "INVOICE" : "Invoice", alignment: "right", fontSize: tpl === "compact" ? 20 : tpl === "classic" ? 22 : 28, bold: tpl !== "modern", color: titleColor, characterSpacing: tpl === "classic" ? 2 : 0, margin: [0, 0, 0, 2] },
    { text: "#" + invNo, alignment: "right", fontSize: 12, bold: true, color: "#667085", margin: [0, 0, 0, 8] },
    ...metaRows.map(([l, v]) => ({ columns: [{ text: l, fontSize: 9, color: "#667085" }, { text: v, fontSize: 9, bold: true, alignment: "right" }], margin: [0, 1.5, 0, 1.5] }))
  ];

  const content = [{ columns: [{ width: "*", stack: headerLeft }, { width: "*", stack: headerRight }], columnGap: 18 }];

  if (tpl === "classic") content.push({ canvas: [{ type: "line", x1: 0, y1: 6, x2: contentWidth, y2: 6, lineWidth: 1.5, lineColor: "#1f2937" }], margin: [0, 4, 0, 10] });
  else content.push({ text: "", margin: [0, 6, 0, 0] });

  if (state.sections.status || state.sections.balance) {
    const row = [];
    row.push(state.sections.status ? { width: "auto", table: { body: [[{ text: "● " + status, fontSize: 9, bold: true, color: statusColors[0], fillColor: statusColors[1], margin: [8, 4, 8, 4] }]] }, layout: "noBorders" } : { width: "auto", text: "" });
    row.push(state.sections.balance ? { width: "*", table: { widths: ["*", "auto"], body: [[{ text: "Balance due", fontSize: 11, bold: true, color: "#101828", fillColor: tint(accent, 0.92), margin: [10, 7, 4, 7] }, { text: money(t.total), fontSize: 16, bold: true, color: accent, alignment: "right", fillColor: tint(accent, 0.92), margin: [4, 7, 10, 7] }]] }, layout: "noBorders" } : { width: "*", text: "" });
    content.push({ columns: row, columnGap: 14, margin: [0, 6, 0, 10] });
  }

  if (state.sections.client) {
    content.push({ text: "BILL TO", fontSize: 8, bold: true, color: "#667085", characterSpacing: 1, margin: [0, 4, 0, 3] });
    content.push({ text: clientName, fontSize: 12, bold: true, margin: [0, 0, 0, 2] });
    content.push(clientMeta.length ? { text: clientMeta.join("\n"), fontSize: 9, color: "#485568", margin: [0, 0, 0, 10] } : { text: "", margin: [0, 0, 0, 10] });
  }

  content.push({ table: { headerRows: 1, widths: colWidths, body: tableBody }, layout: pdfTableLayout(tpl), margin: [0, 4, 0, 10] });

  const summaryRows = [["Subtotal", money(t.subtotal)]];
  if (t.disc && state.sections.discount) summaryRows.push([`Discount (${t.dr.toFixed(2).replace(/\.00$/, "")}%)`, "−" + money(t.disc)]);
  if (t.tax && state.sections.tax) summaryRows.push([`Tax (${t.tr.toFixed(2).replace(/\.00$/, "")}%)`, money(t.tax)]);
  if (t.ship && state.sections.shipping) summaryRows.push(["Shipping", money(t.ship)]);

  const notesStack = (state.sections.notes && notesText) ? [{ text: "Invoice note", fontSize: 8, bold: true, color: "#667085", margin: [0, 0, 0, 3] }, { text: notesText, fontSize: 9, color: "#344054" }] : [{ text: "" }];

  content.push({
    columns: [
      { width: "*", stack: notesStack },
      {
        width: 180, stack: [
          ...summaryRows.map(([l, v]) => ({ columns: [{ text: l, fontSize: 9, color: "#667085" }, { text: v, fontSize: 9, bold: true, alignment: "right" }], margin: [0, 1.5, 0, 1.5] })),
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: "#1f2937" }], margin: [0, 4, 0, 4] },
          { columns: [{ text: "Total", fontSize: 12, bold: true }, { text: money(t.total), fontSize: 12, bold: true, alignment: "right" }] }
        ]
      }
    ],
    columnGap: 18,
    margin: [0, 4, 0, 10]
  });

  if ((state.sections.payment && paymentText) || (state.sections.terms && termsText)) {
    content.push({
      columns: [
        { width: "*", stack: (state.sections.payment && paymentText) ? [{ text: "Payment details", fontSize: 8, bold: true, color: "#667085", margin: [0, 0, 0, 3] }, { text: paymentText, fontSize: 9, color: "#344054" }] : [{ text: "" }] },
        { width: "*", stack: (state.sections.terms && termsText) ? [{ text: "Terms", fontSize: 8, bold: true, color: "#667085", margin: [0, 0, 0, 3] }, { text: termsText, fontSize: 9, color: "#344054" }] : [{ text: "" }] }
      ],
      columnGap: 18,
      margin: [0, 6, 0, 0]
    });
  }

  return {
    pageSize: paper.pdfName,
    pageMargins: [margin, margin, margin, margin],
    footer: state.sections.footer ? ((currentPage, pageCount) => ({ columns: [{ text: companyName, fontSize: 7.5, color: "#8a94a5", margin: [margin, 0, 0, 0] }, { text: "Invoice #" + invNo + (pageCount > 1 ? "  ·  Page " + currentPage + " of " + pageCount : ""), fontSize: 7.5, color: "#8a94a5", alignment: "right", margin: [0, 0, margin, 0] }] })) : undefined,
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#1f2937" }
  };
}

export async function downloadInvoicePDF(suggestedName) {
  try {
    toast("Preparing your PDF…");
    await ensurePDFMake();
    const docDefinition = await buildInvoiceDocDefinition();
    if (state.sections.logo && state.logo && !docDefinition.content[0].columns[0].stack.some(n => n.image)) toast("Note: the logo couldn't be embedded in the PDF — everything else exported fine.");
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
