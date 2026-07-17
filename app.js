(() => {
  "use strict";

  const STORAGE_KEY = "ledger_invoices_v1";
  const DRAFT_KEY = "ledger_draft_v1";
  const CURRENT_ID_KEY = "ledger_current_id_v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    fromName: $("fromName"), fromAddress: $("fromAddress"), fromEmail: $("fromEmail"), fromPhone: $("fromPhone"),
    toName: $("toName"), toAddress: $("toAddress"), toEmail: $("toEmail"),
    invoiceNumber: $("invoiceNumber"), status: $("status"),
    issueDate: $("issueDate"), dueDate: $("dueDate"), currency: $("currency"),
    lineItems: $("lineItems"), addItemBtn: $("addItemBtn"),
    taxRate: $("taxRate"), discountRate: $("discountRate"), notes: $("notes"),
    invoiceSelect: $("invoiceSelect"),
    newBtn: $("newBtn"), saveBtn: $("saveBtn"), deleteBtn: $("deleteBtn"), printBtn: $("printBtn"),
  };

  const pv = {
    number: $("pv-number"), stamp: $("pv-stamp"),
    fromName: $("pv-fromName"), fromAddress: $("pv-fromAddress"), fromContact: $("pv-fromContact"),
    toName: $("pv-toName"), toAddress: $("pv-toAddress"), toContact: $("pv-toContact"),
    issueDate: $("pv-issueDate"), dueDate: $("pv-dueDate"),
    lineItems: $("pv-lineItems"),
    subtotal: $("pv-subtotal"), tax: $("pv-tax"), discount: $("pv-discount"), total: $("pv-total"),
    taxRow: $("pv-taxRow"), discountRow: $("pv-discountRow"),
    notes: $("pv-notes"),
  };

  let state = null;

  function uid() {
    return "inv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function loadAllInvoices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Could not read saved invoices", e);
      return [];
    }
  }

  function saveAllInvoices(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function nextInvoiceNumber() {
    const list = loadAllInvoices();
    let max = 0;
    list.forEach((inv) => {
      const m = /(\d+)\s*$/.exec(inv.invoiceNumber || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const n = max + 1;
    return "INV-" + String(n).padStart(4, "0");
  }

  function blankItem() {
    return { description: "", qty: 1, rate: 0 };
  }

  function defaultState() {
    return {
      id: uid(),
      invoiceNumber: nextInvoiceNumber(),
      status: "draft",
      issueDate: todayISO(),
      dueDate: todayISO(14),
      currency: "$",
      fromName: "", fromAddress: "", fromEmail: "", fromPhone: "",
      toName: "", toAddress: "", toEmail: "",
      items: [blankItem()],
      taxRate: 0,
      discountRate: 0,
      notes: "",
      updatedAt: Date.now(),
    };
  }

  // ---------- Form <-> state ----------

  function renderForm(s) {
    els.fromName.value = s.fromName || "";
    els.fromAddress.value = s.fromAddress || "";
    els.fromEmail.value = s.fromEmail || "";
    els.fromPhone.value = s.fromPhone || "";
    els.toName.value = s.toName || "";
    els.toAddress.value = s.toAddress || "";
    els.toEmail.value = s.toEmail || "";
    els.invoiceNumber.value = s.invoiceNumber || "";
    els.status.value = s.status || "draft";
    els.issueDate.value = s.issueDate || "";
    els.dueDate.value = s.dueDate || "";
    els.currency.value = s.currency || "$";
    els.taxRate.value = s.taxRate ?? 0;
    els.discountRate.value = s.discountRate ?? 0;
    els.notes.value = s.notes || "";

    els.lineItems.innerHTML = "";
    (s.items && s.items.length ? s.items : [blankItem()]).forEach((item) => addLineItemRow(item));
  }

  function addLineItemRow(item) {
    const row = document.createElement("div");
    row.className = "line-item-row";
    row.innerHTML = `
      <input type="text" class="li-desc" placeholder="Description of work or item" value="${escapeAttr(item.description || "")}">
      <input type="number" class="li-qty" min="0" step="0.01" value="${item.qty ?? 1}">
      <input type="number" class="li-rate" min="0" step="0.01" value="${item.rate ?? 0}">
      <button type="button" class="li-remove" title="Remove line" aria-label="Remove line">×</button>
    `;
    row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", handleChange));
    row.querySelector(".li-remove").addEventListener("click", () => {
      row.remove();
      handleChange();
    });
    els.lineItems.appendChild(row);
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function readForm() {
    const items = Array.from(els.lineItems.querySelectorAll(".line-item-row")).map((row) => ({
      description: row.querySelector(".li-desc").value,
      qty: parseFloat(row.querySelector(".li-qty").value) || 0,
      rate: parseFloat(row.querySelector(".li-rate").value) || 0,
    }));

    return {
      ...state,
      fromName: els.fromName.value,
      fromAddress: els.fromAddress.value,
      fromEmail: els.fromEmail.value,
      fromPhone: els.fromPhone.value,
      toName: els.toName.value,
      toAddress: els.toAddress.value,
      toEmail: els.toEmail.value,
      invoiceNumber: els.invoiceNumber.value,
      status: els.status.value,
      issueDate: els.issueDate.value,
      dueDate: els.dueDate.value,
      currency: els.currency.value,
      items,
      taxRate: parseFloat(els.taxRate.value) || 0,
      discountRate: parseFloat(els.discountRate.value) || 0,
      notes: els.notes.value,
      updatedAt: Date.now(),
    };
  }

  function fmt(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function computeTotals(s) {
    const subtotal = s.items.reduce((sum, it) => sum + (it.qty * it.rate), 0);
    const tax = subtotal * ((s.taxRate || 0) / 100);
    const discount = subtotal * ((s.discountRate || 0) / 100);
    const total = subtotal + tax - discount;
    return { subtotal, tax, discount, total };
  }

  function renderPreview(s) {
    const cur = s.currency || "$";
    pv.number.textContent = s.invoiceNumber || "—";
    pv.stamp.textContent = (s.status || "draft").toUpperCase();
    pv.stamp.className = "stamp is-" + (s.status || "draft");

    pv.fromName.textContent = s.fromName || "Your business";
    pv.fromAddress.textContent = s.fromAddress || "";
    pv.fromContact.textContent = [s.fromEmail, s.fromPhone].filter(Boolean).join("  ·  ");

    pv.toName.textContent = s.toName || "Client name";
    pv.toAddress.textContent = s.toAddress || "";
    pv.toContact.textContent = s.toEmail || "";

    pv.issueDate.textContent = s.issueDate || "—";
    pv.dueDate.textContent = s.dueDate || "—";

    pv.lineItems.innerHTML = "";
    s.items.forEach((it) => {
      if (!it.description && !it.qty && !it.rate) return;
      const tr = document.createElement("tr");
      const amount = (it.qty || 0) * (it.rate || 0);
      tr.innerHTML = `
        <td class="col-desc">${escapeHTML(it.description || "—")}</td>
        <td class="col-num">${it.qty ?? 0}</td>
        <td class="col-num">${cur}${fmt(it.rate || 0)}</td>
        <td class="col-num">${cur}${fmt(amount)}</td>
      `;
      pv.lineItems.appendChild(tr);
    });
    if (!pv.lineItems.children.length) {
      pv.lineItems.innerHTML = `<tr><td class="col-desc" colspan="4" style="color:var(--muted); font-style:italic;">No line items yet</td></tr>`;
    }

    const { subtotal, tax, discount, total } = computeTotals(s);
    pv.subtotal.textContent = cur + fmt(subtotal);
    pv.tax.textContent = cur + fmt(tax);
    pv.discount.textContent = "−" + cur + fmt(discount);
    pv.total.textContent = cur + fmt(total);
    pv.taxRow.style.display = s.taxRate ? "flex" : "none";
    pv.discountRow.style.display = s.discountRate ? "flex" : "none";

    pv.notes.textContent = s.notes || "";
  }

  function persistDraft(s) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
    localStorage.setItem(CURRENT_ID_KEY, s.id);
  }

  function handleChange() {
    state = readForm();
    renderPreview(state);
    persistDraft(state);
  }

  // ---------- Saved invoice list ----------

  function refreshInvoiceSelect(selectedId) {
    const list = loadAllInvoices().slice().sort((a, b) => b.updatedAt - a.updatedAt);
    els.invoiceSelect.innerHTML = `<option value="">— Saved invoices —</option>`;
    list.forEach((inv) => {
      const opt = document.createElement("option");
      opt.value = inv.id;
      opt.textContent = `${inv.invoiceNumber || "Untitled"} — ${inv.toName || "no client"}`;
      if (inv.id === selectedId) opt.selected = true;
      els.invoiceSelect.appendChild(opt);
    });
  }

  function saveCurrent() {
    state = readForm();
    const list = loadAllInvoices();
    const idx = list.findIndex((inv) => inv.id === state.id);
    if (idx >= 0) list[idx] = state; else list.push(state);
    saveAllInvoices(list);
    persistDraft(state);
    refreshInvoiceSelect(state.id);
  }

  function deleteCurrent() {
    if (!confirm("Delete this invoice? This can't be undone.")) return;
    const list = loadAllInvoices().filter((inv) => inv.id !== state.id);
    saveAllInvoices(list);
    startNew();
  }

  function loadInvoice(id) {
    const list = loadAllInvoices();
    const inv = list.find((i) => i.id === id);
    if (!inv) return;
    state = inv;
    renderForm(state);
    renderPreview(state);
    persistDraft(state);
    refreshInvoiceSelect(state.id);
  }

  function startNew() {
    state = defaultState();
    renderForm(state);
    renderPreview(state);
    persistDraft(state);
    refreshInvoiceSelect(null);
  }

  // ---------- Wiring ----------

  function attachListeners() {
    [
      els.fromName, els.fromAddress, els.fromEmail, els.fromPhone,
      els.toName, els.toAddress, els.toEmail,
      els.invoiceNumber, els.status, els.issueDate, els.dueDate, els.currency,
      els.taxRate, els.discountRate, els.notes,
    ].forEach((el) => el.addEventListener("input", handleChange));
    els.status.addEventListener("change", handleChange);
    els.currency.addEventListener("change", handleChange);

    els.addItemBtn.addEventListener("click", () => {
      addLineItemRow(blankItem());
      handleChange();
    });

    els.newBtn.addEventListener("click", () => {
      if (confirm("Start a new blank invoice? Unsaved changes to the current one will be kept as your last draft, but won't appear in the saved list unless you Save it first.")) {
        startNew();
      }
    });
    els.saveBtn.addEventListener("click", saveCurrent);
    els.deleteBtn.addEventListener("click", deleteCurrent);
    els.printBtn.addEventListener("click", () => {
      setActiveView("preview");
      window.print();
    });

    els.invoiceSelect.addEventListener("change", (e) => {
      if (e.target.value) loadInvoice(e.target.value);
    });

    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => setActiveView(btn.dataset.view));
    });
  }

  function setActiveView(view) {
    document.querySelectorAll(".toggle-btn").forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    $("editPanel").dataset.hidden = String(view !== "edit");
    $("previewPanel").dataset.hidden = String(view !== "preview");
  }

  function init() {
    attachListeners();

    const draftRaw = localStorage.getItem(DRAFT_KEY);
    if (draftRaw) {
      try {
        state = JSON.parse(draftRaw);
      } catch (e) {
        state = defaultState();
      }
    } else {
      state = defaultState();
    }

    renderForm(state);
    renderPreview(state);
    refreshInvoiceSelect(state.id);
    setActiveView("edit");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* offline install still works without SW registration succeeding immediately */
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
