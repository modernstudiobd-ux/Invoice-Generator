// pdfExport.js — turns the invoice into a PDF by capturing the actual
// rendered #invoice element (html2canvas) and placing that capture into a
// correctly paginated A4/Letter PDF (jsPDF). Print re-uses the exact same
// PDF. This guarantees Export PDF, Print, and the on-screen preview can
// never drift apart — they're all the same rendered invoice, not a second
// hand-built re-implementation of each template's design.

import { $ } from "./dom.js";
import { state, currentPaper } from "./state.js";
import { fitInvoiceCanvas } from "./preview.js";
import { toast } from "./toast.js";

const HTML2CANVAS_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";

function loadScript(src, failMessage) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(failMessage));
    document.head.appendChild(s);
  });
}

async function ensureExportLibs() {
  if (!window.html2canvas) await loadScript(HTML2CANVAS_URL, "The PDF capture library couldn't load. Check your connection and try again.");
  if (!window.jspdf) await loadScript(JSPDF_URL, "The PDF builder library couldn't load. Check your connection and try again.");
}

// Captures #invoice exactly as rendered on screen and returns a jsPDF
// document paginated to the selected paper size. Any element with
// data-pdf-skip (page-break guide lines, etc.) is hidden for the capture.
async function buildPdfFromDom() {
  await ensureExportLibs();
  const invoice = $("invoice");
  const paper = currentPaper();

  // The on-screen invoice is shown at a zoomed/fit-to-panel scale (see
  // fitInvoiceCanvas in preview.js) via a CSS transform + explicit margin.
  // Capturing it at that scale would capture the zoomed appearance, so this
  // neutralizes it for the capture and restores the real preview afterward.
  const oldTransform = invoice.style.transform, oldMarginLeft = invoice.style.marginLeft, oldTransformOrigin = invoice.style.transformOrigin;
  invoice.style.transform = "none";
  invoice.style.marginLeft = "0";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let canvas;
  try {
    canvas = await html2canvas(invoice, {
      scale: Math.max(2, Math.min(3, 2200 / invoice.offsetWidth)),
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: invoice.scrollWidth,
      windowHeight: invoice.scrollHeight
    });
  } finally {
    invoice.style.transform = oldTransform;
    invoice.style.marginLeft = oldMarginLeft;
    invoice.style.transformOrigin = oldTransformOrigin;
    fitInvoiceCanvas();
  }

  const { jsPDF } = window.jspdf;
  const orientation = paper.ptW > paper.ptH ? "landscape" : "portrait";
  const pdf = new jsPDF({ unit: "pt", format: [paper.ptW, paper.ptH], orientation, compress: true });

  // Slice the captured canvas into page-height chunks that keep the same
  // aspect ratio as the physical page, so each slice maps cleanly onto a page.
  const pagePxHeight = Math.max(1, Math.round(canvas.width * (paper.ptH / paper.ptW)));
  const totalPages = Math.max(1, Math.ceil(canvas.height / pagePxHeight));

  for (let i = 0; i < totalPages; i++) {
    const sliceHeight = Math.min(pagePxHeight, canvas.height - i * pagePxHeight);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, i * pagePxHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const imgData = slice.toDataURL("image/jpeg", 0.95);
    if (i > 0) pdf.addPage([paper.ptW, paper.ptH], orientation);
    const drawnHeight = paper.ptW * (sliceHeight / canvas.width);
    pdf.addImage(imgData, "JPEG", 0, 0, paper.ptW, drawnHeight);
  }

  return pdf;
}

export async function downloadInvoicePDF(suggestedName) {
  try {
    toast("Preparing your PDF…");
    const pdf = await buildPdfFromDom();
    pdf.save((suggestedName || "invoice") + ".pdf");
  } catch (err) {
    toast(err.message || "PDF export failed — check your connection and try again.");
  }
}

export async function printInvoice(suggestedName, preOpenedWindow) {
  const win = preOpenedWindow || null;
  try {
    if (win && !win.closed) { win.document.write("<title>Preparing…</title><body style='font:14px -apple-system,Segoe UI,Arial,sans-serif;padding:28px;color:#475467'>Preparing your invoice for printing…</body>"); win.document.close(); }
    // Print uses the exact same capture-and-paginate PDF as Export PDF, so
    // the two can never show something different from each other.
    const pdf = await buildPdfFromDom();
    const url = URL.createObjectURL(pdf.output("blob"));
    if (win && !win.closed) {
      win.location.href = url;
      const tryPrint = () => { try { win.focus(); win.print(); } catch {} };
      win.addEventListener("load", tryPrint, { once: true });
      setTimeout(tryPrint, 700);
    } else {
      const a = document.createElement("a"); a.href = url; a.download = (suggestedName || "invoice") + ".pdf"; document.body.appendChild(a); a.click(); a.remove();
      toast("Pop-ups are blocked, so the PDF downloaded instead — open it and print from there.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win && !win.closed) win.close();
    toast(err.message || "Couldn't prepare the PDF for printing, printing the on-screen preview instead.");
    printInvoiceFromDOM(suggestedName);
  }
}

// Fallback used only if the capture/PDF libraries can't load (e.g. no
// network access): prints the live on-screen invoice directly via the
// browser's own print dialog and print.css.
function printInvoiceFromDOM(suggestedName) {
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
