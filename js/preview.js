// preview.js — renders the live invoice document (the on-screen A4/Letter canvas).

import { $, esc } from "./dom.js";
import { state, currentPaper, applyPaperSize, templateFooterInsetMm } from "./state.js";
import { money, dateFmt, alignClass, fmtCell, num } from "./format.js";
import { calc, itemValue } from "./calc.js";
import { applyAllOptionalColors } from "./accent.js";

export function renderPreview() {
  let inv = $("invoice"), tpl = $("template").value;
  const logoPos = $("logoPosition").value;
  const notesAlign = $("notesAlign").value || "left";
  inv.className = "invoice template-" + tpl + (logoPos ? " logo-position-" + logoPos : "") + " notes-align-" + notesAlign;
  // renderPreview() resets the invoice's className above (to swap the
  // template/layout classes) — that wipes the has-header-bg/has-header-text
  // toggle classes set by the optional color overrides, so re-derive them
  // here from the current HEX fields every time a render happens.
  applyAllOptionalColors();
  // Footer inset matches this template's own padding (see TEMPLATE_PADDING_MM
  // in state.js) — the same values the print footer uses — instead of a
  // fixed 12mm/9mm inset borrowed from Modern Professional for every template.
  const footerInset = templateFooterInsetMm(tpl);
  inv.style.setProperty("--footer-left", footerInset.left + "mm");
  inv.style.setProperty("--footer-right", footerInset.right + "mm");
  inv.style.setProperty("--footer-bottom", footerInset.bottom + "mm");
  applyPaperSize();
  const labels = { title: "INVOICE", bill: "Bill to", status: "Invoice status", balance: "Balance due", note: "Invoice note", payment: "Payment details", terms: "Terms", date: "Invoice date", due: "Due date", ref: "Reference" };
  $("pInvoiceTitle").textContent = labels.title;
  $("pBillToLabel").textContent = labels.bill;
  $("pBalanceLabel").textContent = labels.balance;
  $("pNoteLabel").textContent = labels.note;
  $("pPaymentLabel").textContent = labels.payment;
  $("pTermsLabel").textContent = labels.terms;
  const metaLabels = document.querySelectorAll(".metatable td:first-child");
  if (metaLabels[0]) metaLabels[0].textContent = labels.date;
  if (metaLabels[1]) metaLabels[1].textContent = labels.due;
  if (metaLabels[2]) metaLabels[2].textContent = labels.ref;
  $("pCompanyName").textContent = $("companyName").value.trim() || "Your Company"; $("pCompanyMeta").textContent = metaCompany();
  let no = $("invoiceNumber").value.trim() || "Untitled"; $("pInvoiceNo").textContent = "#" + no; $("pDate").textContent = dateFmt($("invoiceDate").value); $("pDue").textContent = dateFmt($("dueDate").value); $("pReference").textContent = $("reference").value.trim() || "—";
  $("pClientName").textContent = $("clientName").value.trim() || "Client company"; $("pClientMeta").textContent = metaClient();
  const notesText = $("notes").value.trim();
  const termsText = $("terms").value.trim();
  $("pNotes").textContent = notesText;
  $("pPayment").textContent = $("paymentDetails").value.trim();
  $("pTerms").textContent = termsText;
  $("pFooterCompany").textContent = $("companyName").value.trim() || "Your Company"; $("pFooterInvoice").textContent = "Invoice #" + no;
  let status = $("status").value, p = $("pStatus"), styles = { Draft: ["#475467", "#f2f4f7", "#d0d5dd"], Due: ["#18794e", "#ecfdf3", "#abefc6"], Paid: ["#175cd3", "#eff8ff", "#b2ddff"], "Partially Paid": ["#9a6700", "#fffaeb", "#fedf89"], Overdue: ["#b42318", "#fef3f2", "#fecdca"], Canceled: ["#667085", "#f2f4f7", "#d0d5dd"] }[status] || ["#475467", "#f2f4f7", "#d0d5dd"]; p.textContent = "● " + status; p.style.color = styles[0]; p.style.background = styles[1]; p.style.borderColor = styles[2];
  document.querySelectorAll("[data-section]").forEach(e => e.classList.toggle("section-hidden", !state.sections[e.dataset.section]));
  const notesSection = document.querySelector('[data-section="notes"]');
  const termsSection = document.querySelector('[data-section="terms"]');
  if (notesSection) notesSection.classList.toggle("section-hidden", !state.sections.notes || !notesText);
  if (termsSection) termsSection.classList.toggle("section-hidden", !state.sections.terms || !termsText);
  const paymentSection = document.querySelector('[data-section="payment"]');
  const paymentText = $("paymentDetails").value.trim();
  if (paymentSection) paymentSection.classList.toggle("section-hidden", !state.sections.payment || !paymentText);
  let visible = state.columns.filter(c => c.visible);
  { let raw = visible.map(c => Math.max(5, num(c.width))), sum = raw.reduce((a, b) => a + b, 0) || 1; $("pCols").innerHTML = raw.map(w => `<col style="width:${(w / sum * 100).toFixed(2)}%">`).join(""); }
  $("pHeaders").innerHTML = visible.map(c => `<th class="${alignClass(c.align)}">${esc(c.label)}</th>`).join("");
  let body = $("pItems"); body.innerHTML = ""; if (!state.items.length) body.innerHTML = `<tr><td class="empty" colspan="${Math.max(1, visible.length)}">No line items added.</td></tr>`; else state.items.forEach(item => { let tr = document.createElement("tr"); tr.innerHTML = visible.map(c => `<td class="${alignClass(c.align)}">${fmtCell(itemValue(item, c), c)}</td>`).join(""); body.appendChild(tr); });
  let t = calc(); $("pSubtotal").textContent = money(t.subtotal); $("discountLabel").textContent = `Discount (${t.dr.toFixed(2).replace(/\.00$/, "")}%)`; $("pDiscount").textContent = "−" + money(t.disc); $("taxLabel").textContent = `Tax (${t.tr.toFixed(2).replace(/\.00$/, "")}%)`; $("pTax").textContent = money(t.tax); $("pShipping").textContent = money(t.ship); $("pTotal").textContent = $("pBalance").textContent = money(t.total);
  $("discountRow").style.display = t.disc && state.sections.discount ? "flex" : "none"; $("taxRow").style.display = t.tax && state.sections.tax ? "flex" : "none"; $("shippingRow").style.display = t.ship && state.sections.shipping ? "flex" : "none";
  $("pLogoFallback").textContent = ($("companyName").value.trim()[0] || "I").toUpperCase();
  let img = $("pLogo"), box = img.closest(".logobox");
  const logoSize = Math.max(24, Math.min(160, num($("logoHeight").value) || 48));
  inv.style.setProperty("--logo-h", logoSize + "px");
  $("logoHeightValue").textContent = logoSize;
  if (state.logo) {
    img.src = state.logo; box.classList.add("has-logo");
  } else {
    img.removeAttribute("src"); box.classList.remove("has-logo");
  }
  fitInvoiceCanvas();
}

// Print (see print.js) temporarily resizes .canvaswrap to its natural,
// unscaled size right before calling window.print(). That resize is itself
// observed by the ResizeObserver in main.js, which calls fitInvoiceCanvas()
// again — and without this guard, that re-entrant call would immediately
// re-apply the on-screen "shrink to fit the panel" transform, scaling the
// invoice back down right as the print dialog opens. The physical page
// still prints at full size, so the result is a full-size blank page with
// the shrunk invoice floating in the top-left corner. print.js sets this
// flag for the duration of the print flow so fitInvoiceCanvas() becomes a
// no-op until it's done.
let printGuard = false;
export function setPrintGuard(v) { printGuard = v; }

const MM_TO_PX = 96 / 25.4;
// Colored breathing room at the top of continuation pages (page 2+) — real,
// in-flow content (a padding-top added to whichever row/section actually
// starts that page — see applyPrintPagination below), not a @page margin,
// so it's painted in the template's real background color instead of
// showing up as a plain white gap.
const PRINT_TOP_SPACER_MM = 10;
// Extra clearance reserved above the footer on every page, on top of the
// template's own footer inset, so real content can never flow underneath
// the footer that gets placed there afterward.
const PRINT_FOOTER_CLEARANCE_MM = 7;

let printPagination = null;

// Multi-page print/PDF output needs three things no single native CSS
// feature provides all of together: (1) every page's background fully
// painted — including a colored top margin on continuation pages, not a
// blank one, (2) a footer that repeats on every page, and (3) a live
// "Page X of Y" counter. @page margin boxes give (2) and (3) but only in
// Chrome/Edge/Safari (Firefox has ~no support) and can only ever be plain
// white space, never colored (a real @page margin is outside the content
// box by definition — no element's background can reach into it, in any
// browser). This instead replicates the browser's own break-inside:avoid
// pagination *before* printing, using real measured heights of the
// already-rendered content, so it knows in advance exactly which row/section
// will start each page — then:
//   - forces those breaks explicitly (so the real browser pagination that
//     happens during printing matches this calculation exactly, instead of
//     the two disagreeing), and adds real in-flow top padding there instead
//     of a blank margin,
//   - stretches .invoice to an exact multiple of the page height so its own
//     background — whatever color the current template uses — fills every
//     page fully, and
//   - inserts one absolutely-positioned footer clone per page (cloned from
//     the real .footer element, so it stays in sync with every template's
//     styling), each showing a live "Page N of TOTAL", positioned at a
//     precise computed offset rather than "the bottom of .invoice" (which
//     only ever resolves to the bottom of the *last* page once .invoice
//     spans more than one physical page).
// Works identically in every browser, including Firefox, since none of it
// depends on @page margin boxes. Call right before print/PDF export; undone
// by clearPrintPagination() once it's done.
export function applyPrintPagination() {
  const inv = $("invoice");
  const table = inv ? inv.querySelector(".invtable") : null;
  const thead = table ? table.querySelector("thead") : null;
  const tbody = $("pItems");
  const footer = inv ? inv.querySelector(".footer") : null;
  if (!inv || !table || !tbody) return;

  const tpl = $("template") ? $("template").value : "modern";
  const footerInset = templateFooterInsetMm(tpl);
  const p = currentPaper();
  const pageHpx = p.h * MM_TO_PX;
  const topSpacerPx = PRINT_TOP_SPACER_MM * MM_TO_PX;
  const footerReservePx = (footerInset.bottom + PRINT_FOOTER_CLEARANCE_MM) * MM_TO_PX;
  const theadHpx = thead ? thead.offsetHeight : 0;
  // Small safety margin on top of the real reserved space above: this
  // function measures heights under normal screen layout, before print
  // media (and whatever it changes) is actually active, so it's a close
  // prediction of the real print layout rather than a guarantee of it —
  // this trims a little more off the budget than strictly measured, to
  // absorb any small discrepancy that shows up once printing actually
  // happens instead of letting it silently overflow onto an unplanned page.
  // (measuredPageCount below is the actual guarantee — this just makes it
  // less likely to be needed.)
  const budgetSafetyPx = 0.03 * pageHpx;

  // Every top-level flow unit in document order: each direct child of
  // .invoice is one unit, except .invtable, whose body rows are each their
  // own unit (so the table can split across pages row-by-row like it always
  // has) and .footer, which isn't part of this pagination — it's rebuilt
  // from scratch below.
  const units = [];
  Array.from(inv.children).forEach(child => {
    if (child === table) {
      Array.from(tbody.children).forEach(row => units.push({ el: row, h: row.offsetHeight, isRow: true }));
    } else if (child === footer || child.classList.contains("page-break-line") || child.classList.contains("page-break-chip")) {
      // handled separately / screen-only guides, not real content
    } else if (!child.classList.contains("section-hidden")) {
      units.push({ el: child, h: child.offsetHeight, isRow: false });
    }
  });

  // Greedy bucket into pages — mirrors the browser's own break-inside:avoid
  // algorithm (an atomic unit that doesn't fit in what's left of the current
  // page moves to the next one whole), using real rendered heights instead
  // of guessing, so this matches what the browser would do on its own; the
  // difference is this runs *first*, so the actual breaks (forced below via
  // break-before:page) are known in advance instead of left to chance.
  const firstBudget = pageHpx - footerReservePx - budgetSafetyPx;
  const laterBudget = pageHpx - topSpacerPx - footerReservePx - budgetSafetyPx;
  const pages = [];
  let current = { units: [], usedPx: 0, hasRow: false };
  let budget = firstBudget;
  units.forEach(u => {
    let extra = u.isRow && !current.hasRow ? theadHpx : 0;
    if (current.units.length > 0 && current.usedPx + u.h + extra > budget) {
      pages.push(current);
      current = { units: [], usedPx: 0, hasRow: false };
      budget = laterBudget;
      extra = u.isRow ? theadHpx : 0;
    }
    current.units.push(u);
    current.usedPx += u.h + extra;
    if (u.isRow) current.hasRow = true;
  });
  pages.push(current);
  const pageCount = pages.length;

  // Force the real breaks to land exactly where the simulation above put
  // them, and add the colored top spacer there (as real padding on the
  // element itself — table rows use border-collapse:collapse, which only
  // honors padding on <td>, not <tr>, hence the isRow branch).
  const touched = [];
  pages.forEach((pg, i) => {
    if (i === 0 || !pg.units.length) return;
    const first = pg.units[0];
    if (first.isRow) {
      Array.from(first.el.children).forEach(cell => {
        touched.push({ el: cell, prop: "paddingTop", prev: cell.style.paddingTop });
        cell.style.paddingTop = `calc(${getComputedStyle(cell).paddingTop} + ${PRINT_TOP_SPACER_MM}mm)`;
      });
      touched.push({ el: first.el, prop: "breakBefore", prev: first.el.style.breakBefore });
      first.el.style.breakBefore = "page";
    } else {
      touched.push({ el: first.el, prop: "marginTop", prev: first.el.style.marginTop });
      touched.push({ el: first.el, prop: "breakBefore", prev: first.el.style.breakBefore });
      first.el.style.marginTop = `calc(${getComputedStyle(first.el).marginTop} + ${PRINT_TOP_SPACER_MM}mm)`;
      first.el.style.breakBefore = "page";
    }
  });
  if (window.__PAGINATION_DEBUG__) {
    console.log("PAGINATION_DEBUG", JSON.stringify({
      pageHpx, firstBudget, laterBudget, theadHpx, footerReservePx,
      pages: pages.map(pg => ({ n: pg.units.length, used: pg.usedPx })),
      breakBeforeRows: Array.from(document.querySelectorAll('#pItems tr')).filter(r => r.style.breakBefore === "page").map(r => r.textContent)
    }));
  }

  // Safety net: the bucketing above predicts each page's content from
  // heights measured *before* printing (this function runs under normal
  // screen layout — print media, and whatever it changes, isn't active
  // until window.print() actually runs afterward). For most templates that
  // prediction matches the real print layout exactly, but it's not
  // guaranteed to for every one, and an underestimate anywhere is
  // expensive: the browser's own break-inside:avoid still protects
  // individual rows from being split, but a whole extra page can silently
  // appear beyond what pageCount predicted — one this function wouldn't
  // stretch the background into or generate a footer clone for, which is
  // what actually produced the reported bug (a near-empty orphan page with
  // no footer and the wrong "Page X of Y" on the page after it).
  // inv.scrollHeight is a plain continuous-flow measurement — it isn't
  // affected by break-before (a paged-media concept, inert outside actual
  // pagination) — so re-reading it here, after the real spacer padding
  // above has been added, gives the true total content height regardless
  // of whether the bucketing above sliced it into the right pages. Using
  // the larger of the two page counts below means the stretch and the
  // footers always cover the true content even when they don't, keeping
  // this a "some page has fewer rows than ideal" problem instead of a
  // "blank orphan page with no footer" one.
  const measuredPageCount = Math.max(1, Math.ceil(inv.scrollHeight / pageHpx - 0.01));
  const safePageCount = Math.max(pageCount, measuredPageCount);
  if (window.__PAGINATION_DEBUG__ && safePageCount !== pageCount) {
    console.log("PAGINATION_DEBUG_MISMATCH", JSON.stringify({ predicted: pageCount, measured: measuredPageCount, scrollHeight: inv.scrollHeight }));
  }

  // Stretch .invoice so its own background fills every page fully —
  // uniform now that every page is exactly one physical page tall (@page
  // margin is always 0 — see applyPaperSize in state.js).
  inv.style.minHeight = (safePageCount * p.h) + "mm";

  // Replace the single real footer with one absolutely-positioned clone per
  // page. Position is computed directly (distance from the *bottom of the
  // whole stretched box*, in exactly (pageCount - pageNum) full pages) —
  // not "bottom:Xmm" the way the on-screen footer works, since that only
  // ever resolves against .invoice's total height, i.e. only the last page,
  // once .invoice is taller than one physical page.
  const clones = [];
  let footerPrevVisibility = "";
  if (footer && !footer.classList.contains("section-hidden")) {
    footerPrevVisibility = footer.style.visibility;
    footer.style.visibility = "hidden";
    const invNo = ($("invoiceNumber") && $("invoiceNumber").value.trim()) || "Untitled";
    const companyText = footer.querySelector("#pFooterCompany") ? footer.querySelector("#pFooterCompany").textContent : "";
    for (let i = 1; i <= safePageCount; i++) {
      const clone = footer.cloneNode(true);
      clone.removeAttribute("id");
      clone.classList.remove("section-hidden");
      clone.classList.add("footer-print-clone");
      clone.style.visibility = "visible";
      clone.style.bottom = ((safePageCount - i) * p.h + footerInset.bottom) + "mm";
      const invoiceSpan = clone.querySelector("#pFooterInvoice");
      if (invoiceSpan) invoiceSpan.textContent = safePageCount > 1 ? `Invoice #${invNo}  ·  Page ${i} of ${safePageCount}` : `Invoice #${invNo}`;
      const companySpan = clone.querySelector("#pFooterCompany");
      if (companySpan) companySpan.textContent = companyText;
      inv.appendChild(clone);
      clones.push(clone);
    }
  }

  printPagination = { touched, clones, footer, footerPrevVisibility };
}

export function clearPrintPagination() {
  const inv = $("invoice");
  if (inv) inv.style.minHeight = "";
  if (!printPagination) return;
  printPagination.touched.forEach(t => { t.el.style[t.prop] = t.prev; });
  printPagination.clones.forEach(c => c.remove());
  if (printPagination.footer) printPagination.footer.style.visibility = printPagination.footerPrevVisibility;
  printPagination = null;
}

export function fitInvoiceCanvas() {
  if (printGuard) return;
  const wrap = document.querySelector(".canvaswrap"), inv = $("invoice");
  if (!wrap || !inv) return;
  const p = currentPaper();
  const naturalW = p.w * 96 / 25.4;   // page width in CSS px at the standard 96dpi
  const naturalH = p.h * 96 / 25.4;   // page height in CSS px
  // Measure against the wrap's own parent, not wrap.clientWidth itself — the
  // wrap's CSS max-width caps it at one natural page width, so at zoom>100%
  // clientWidth would silently cap "available" too, making the scaled
  // invoice wider than its own wrapper. That's what caused zooming in to
  // clip/shift the preview instead of actually showing it larger.
  const panel = wrap.parentElement;
  const available = (panel ? panel.clientWidth : 0) || naturalW;
  const fit = Math.min(1, available / naturalW);   // shrink to fit narrow screens; never auto-enlarge
  const total = fit * state.zoom;
  const scaledW = naturalW * total;
  inv.style.transformOrigin = "top left";
  inv.style.transform = `scale(${total})`;
  wrap.style.maxWidth = "none";   // let the wrapper grow past one page width when zoomed in past 100%
  if (scaledW <= available) {
    // Fits within the panel (includes the shrink-to-fit case on narrow
    // screens): size the wrap to the panel and center the invoice inside it.
    wrap.style.width = available + "px";
    inv.style.marginLeft = ((available - scaledW) / 2) + "px";
  } else {
    // Zoomed in past what the panel can show at once: grow the wrap to
    // match the real (larger) size instead of clipping it — .workspace
    // already scrolls, so this reveals the rest via scrolling, the same way
    // a multi-page invoice already scrolls vertically below.
    wrap.style.width = scaledW + "px";
    inv.style.marginLeft = "0";
  }

  // Multi-page invoices: the invoice box naturally grows taller than one page
  // when content overflows (it uses min-height, not a fixed height), but the
  // wrapper below used to be pinned to exactly one page's height — silently
  // clipping everything past page 1. Measure the real content height, work
  // out how many pages that spans, and size the wrapper (+ draw dashed
  // page-break guides) to match — Print/PDF already paginate correctly on
  // their own, this only affects the on-screen preview.
  const contentH = inv.scrollHeight || naturalH;
  const pageCount = Math.max(1, Math.ceil(contentH / naturalH - 0.01));   // small epsilon avoids a
                                                                            // false "page 2" from
                                                                            // sub-pixel rounding
  renderPageBreaks(inv, naturalH, pageCount);
  wrap.style.height = Math.ceil(pageCount * naturalH * total) + "px";

  // The footer (see .footer in print.css) repeats on every printed page via
  // position:fixed rather than CSS @page margin boxes — reliable cross-browser,
  // but it means there's no per-page "counter(page)" available here the way
  // there would be inside a margin box, so this shows the total page count
  // instead of a live "page X of Y" (still useful, and correct everywhere,
  // including Firefox, where margin-box content isn't supported at all).
  const footerInvoiceEl = $("pFooterInvoice");
  if (footerInvoiceEl) {
    const invNo = ($("invoiceNumber") && $("invoiceNumber").value.trim()) || "Untitled";
    footerInvoiceEl.textContent = "Invoice #" + invNo + (pageCount > 1 ? `  ·  ${pageCount} pages` : "");
  }

  $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
  const meta = $("previewMeta");
  if (meta) {
    const sizeName = p.pdfName === "LETTER" ? "US Letter" : "A4";
    meta.textContent = `${sizeName} portrait preview` + (pageCount > 1 ? ` · ${pageCount} pages` : "");
  }
}

function renderPageBreaks(inv, naturalH, pageCount) {
  inv.querySelectorAll(".page-break-line,.page-break-chip").forEach(el => el.remove());
  for (let i = 1; i < pageCount; i++) {
    const y = naturalH * i;
    const line = document.createElement("div");
    line.className = "page-break-line";
    line.style.top = y + "px";
    inv.appendChild(line);
    const chip = document.createElement("div");
    chip.className = "page-break-chip";
    chip.style.top = y + "px";
    chip.textContent = `Page ${i + 1}`;
    inv.appendChild(chip);
  }
}

function metaCompany() {
  let a = [];
  if ($("companyReg").value.trim()) a.push("Registration: " + $("companyReg").value.trim());
  if ($("companyVat").value.trim()) a.push("VAT / Tax: " + $("companyVat").value.trim());
  if ($("companyAddress").value.trim()) a.push($("companyAddress").value.trim());
  if ($("companyPhone").value.trim()) a.push("Phone: " + $("companyPhone").value.trim());
  if ($("companyEmail").value.trim()) a.push("Email: " + $("companyEmail").value.trim());
  if ($("companyWebsite").value.trim()) a.push($("companyWebsite").value.trim());
  return a.join("\n") || "Add your company details";
}

function metaClient() {
  let a = [];
  if ($("clientContact").value.trim()) a.push($("clientContact").value.trim());
  if ($("clientTax").value.trim()) a.push("VAT / Tax: " + $("clientTax").value.trim());
  if ($("clientAddress").value.trim()) a.push($("clientAddress").value.trim());
  if ($("clientEmail").value.trim()) a.push($("clientEmail").value.trim());
  return a.join("\n") || "Add client details";
}
