// print.js — prints the invoice using the browser's own native print dialog,
// directly on the live #invoice element (styled by print.css). No PDF
// library, no new tab: this opens the print dialog immediately, the same
// way pressing Ctrl/Cmd+P on any web page would.

import { $ } from "./dom.js";

export function printInvoice(suggestedName) {
  const invoice = $("invoice");
  const wrap = document.querySelector(".canvaswrap");
  const oldTitle = document.title;
  const oldTransform = invoice.style.transform;
  const oldMarginLeft = invoice.style.marginLeft;
  const oldWrapHeight = wrap ? wrap.style.height : "";
  // document.title becomes the print dialog's/PDF's suggested filename in
  // most browsers when printing or choosing "Save as PDF" as the destination.
  if (suggestedName) document.title = suggestedName;
  // The on-screen invoice is shown at a zoomed/fit-to-panel scale (see
  // fitInvoiceCanvas in preview.js); print.css prints it full-size, so this
  // neutralizes that scale just for the print, then restores it afterward.
  invoice.style.transform = "none";
  invoice.style.marginLeft = "0";
  if (wrap) wrap.style.height = "auto";
  requestAnimationFrame(() => {
    window.print();
    setTimeout(() => {
      invoice.style.transform = oldTransform;
      invoice.style.marginLeft = oldMarginLeft;
      if (wrap) wrap.style.height = oldWrapHeight;
      document.title = oldTitle;
    }, 250);
  });
}
