const DB_NAME = "filament-stock-db";
const DB_VERSION = 2;
const SPOOL_STORE = "spools";
const PRINTER_STORE = "printers";
const CUSTOM_CATALOG_STORE = "catalogCustom";

let db;
let allSpools = [];
let allPrinters = [];
let builtInCatalog = { version: 1, brands: [] };
let mergedCatalog = { version: 1, brands: [] };
let customCatalogEntries = [];

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function uid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(SPOOL_STORE)) {
        const store = database.createObjectStore(SPOOL_STORE, { keyPath: "id" });
        store.createIndex("material", "material", { unique: false });
        store.createIndex("dateAdded", "dateAdded", { unique: false });
      }
      if (!database.objectStoreNames.contains(PRINTER_STORE)) {
        database.createObjectStore(PRINTER_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(CUSTOM_CATALOG_STORE)) {
        database.createObjectStore(CUSTOM_CATALOG_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function deleteRecord(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBuiltInCatalog() {
  try {
    const response = await fetch("catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error("catalog load failed");
    builtInCatalog = await response.json();
  } catch (error) {
    console.warn("Built-in catalogue unavailable", error);
    builtInCatalog = { version: 1, brands: [] };
  }
}

function slugify(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rebuildMergedCatalog() {
  mergedCatalog = JSON.parse(JSON.stringify(builtInCatalog));
  mergedCatalog.brands ||= [];

  for (const entry of customCatalogEntries) {
    const brandName = entry.brand?.trim();
    const productName = entry.product?.trim();
    const colorName = entry.colorName?.trim();
    if (!brandName || !productName || !colorName) continue;

    let brand = mergedCatalog.brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    if (!brand) {
      brand = { id: `custom-brand-${slugify(brandName)}-${entry.id.slice(0, 6)}`, name: brandName, products: [] };
      mergedCatalog.brands.push(brand);
    }

    let product = brand.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (!product) {
      product = {
        id: `custom-product-${slugify(productName)}-${entry.id.slice(0, 6)}`,
        family: entry.family || "Other",
        name: productName,
        spoolSizes: [Number(entry.spoolSize || 1000)],
        colors: []
      };
      brand.products.push(product);
    }

    if (!product.colors.some(c => c.name.toLowerCase() === colorName.toLowerCase())) {
      product.colors.push({ name: colorName, hex: entry.colorHex || "#808080", custom: true });
    }
  }

  mergedCatalog.brands.sort((a, b) => a.name.localeCompare(b.name));
  for (const brand of mergedCatalog.brands) {
    brand.products.sort((a, b) => a.name.localeCompare(b.name));
    for (const product of brand.products) product.colors.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percentRemaining(spool) {
  if (!spool.initialWeightGrams || spool.initialWeightGrams <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(spool.remainingWeightGrams || 0) / Number(spool.initialWeightGrams)) * 100));
}

function isLow(spool) {
  return Number(spool.remainingWeightGrams || 0) <= Number(spool.lowStockThresholdGrams || 0);
}

function slotLabel(printer, index) {
  if (printer.systemType === "toolchanger") return `Toolhead ${index + 1}`;
  if (printer.systemType === "single") return "Filament";
  return `Slot ${index + 1}`;
}

function findLoadedLocation(spoolId) {
  for (const printer of allPrinters) {
    for (let i = 0; i < (printer.slots || []).length; i++) {
      if (printer.slots[i]?.spoolId === spoolId) return `${printer.name} • ${slotLabel(printer, i)}`;
    }
  }
  return "";
}

function renderSpoolCard(spool, compact = false) {
  const pct = percentRemaining(spool);
  const lowBadge = isLow(spool) ? `<span class="badge low">⚠ Low stock</span>` : "";
  const openBadge = spool.isOpen ? `<span class="badge open">Open</span>` : "";
  const loadedAt = findLoadedLocation(spool.id);
  const loadedBadge = loadedAt ? `<span class="badge loaded">Loaded: ${escapeHtml(loadedAt)}</span>` : "";
  const location = spool.location ? `<div class="spool-location">📦 ${escapeHtml(spool.location)}</div>` : "";
  const family = spool.materialFamily ? `${escapeHtml(spool.materialFamily)} • ` : "";

  return `
    <article class="spool-card">
      <div class="spool-card-main">
        <div class="color-dot" style="background:${escapeHtml(spool.colorHex || "#808080")}"></div>
        <div>
          <div class="spool-title">${escapeHtml(spool.colorName)}</div>
          <div class="spool-subtitle">${escapeHtml(spool.brand)} • ${family}${escapeHtml(spool.material)}</div>
          ${location}
          <div>${lowBadge} ${openBadge} ${loadedBadge}</div>
        </div>
        <div class="spool-weight"><strong>${Math.round(Number(spool.remainingWeightGrams || 0))} g</strong><small>${Math.round(pct)}%</small></div>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div>
      ${compact ? "" : `<div class="spool-actions"><button class="secondary-button" onclick="openEditSpool('${spool.id}')">Edit</button><button class="secondary-button" onclick="openUseDialog('${spool.id}')">Used in print</button></div>`}
    </article>`;
}

function spoolOptionLabel(spool) {
  return `${spool.brand} ${spool.material} — ${spool.colorName} (${Math.round(Number(spool.remainingWeightGrams || 0))} g)`;
}

function renderPrinterCard(printer, compact = false) {
  const slots = printer.slots || [];
  const loaded = slots.filter(s => s.spoolId).length;
  const systemText = printer.systemType === "toolchanger" ? "Toolchanger" : printer.systemType === "ams" ? "AMS / multi-spool" : printer.systemType === "single" ? "Single filament" : "Multi-material";

  const slotRows = slots.map((slot, index) => {
    const options = [`<option value="">— Empty —</option>`]
      .concat(allSpools.map(spool => `<option value="${spool.id}" ${slot.spoolId === spool.id ? "selected" : ""}>${escapeHtml(spoolOptionLabel(spool))}</option>`))
      .join("");
    return `<div class="slot-row"><div class="slot-label">${escapeHtml(slotLabel(printer, index))}</div><select onchange="assignSpoolToSlot('${printer.id}', ${index}, this.value)">${options}</select></div>`;
  }).join("");

  return `<article class="printer-card">
    <div class="printer-header">
      <div><div class="printer-title">${escapeHtml(printer.name)}</div><div class="printer-subtitle">${escapeHtml(printer.model)} • ${systemText} • ${slots.length} position${slots.length === 1 ? "" : "s"}</div></div>
      ${compact ? "" : `<button class="secondary-button" onclick="openEditPrinter('${printer.id}')">Edit</button>`}
    </div>
    ${slotRows || `<div class="empty-state">No filament positions configured.</div>`}
    <div class="loaded-summary">${loaded} of ${slots.length} position${slots.length === 1 ? "" : "s"} loaded</div>
  </article>`;
}

async function refresh() {
  [allSpools, allPrinters, customCatalogEntries] = await Promise.all([
    getAll(SPOOL_STORE), getAll(PRINTER_STORE), getAll(CUSTOM_CATALOG_STORE)
  ]);
  allSpools.sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
  allPrinters.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  rebuildMergedCatalog();

  const totalGrams = allSpools.reduce((sum, s) => sum + Number(s.remainingWeightGrams || 0), 0);
  const low = allSpools.filter(isLow);
  $("statSpools").textContent = allSpools.length;
  $("statKg").textContent = `${(totalGrams / 1000).toFixed(1)} kg`;
  $("statPrinters").textContent = allPrinters.length;
  $("statLow").textContent = low.length;

  $("lowStockList").innerHTML = low.length ? low.map(s => renderSpoolCard(s, true)).join("") : `<div class="empty-state">No low-stock spools right now.</div>`;
  $("dashboardPrinters").innerHTML = allPrinters.length ? allPrinters.map(p => renderPrinterCard(p, true)).join("") : `<div class="empty-state">No printers added yet.</div>`;
  $("printerList").innerHTML = allPrinters.length ? allPrinters.map(p => renderPrinterCard(p)).join("") : `<div class="empty-state">Add your first printer to track what filament is loaded.</div>`;

  const materials = [...new Set(allSpools.map(s => s.materialFamily || s.material).filter(Boolean))].sort();
  const filter = $("materialFilter");
  const currentFilter = filter.value;
  filter.innerHTML = `<option value="All">All materials</option>` + materials.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if ([...filter.options].some(o => o.value === currentFilter)) filter.value = currentFilter;

  const productCount = mergedCatalog.brands.reduce((sum, b) => sum + (b.products?.length || 0), 0);
  $("catalogueSummary").textContent = `${mergedCatalog.brands.length} brands • ${productCount} products • ${customCatalogEntries.length} custom entr${customCatalogEntries.length === 1 ? "y" : "ies"}`;

  populateBrandSelect();
  renderInventory();
}

function renderInventory() {
  const search = $("searchInput").value.trim().toLowerCase();
  const selectedMaterial = $("materialFilter").value;
  const filtered = allSpools.filter(spool => {
    const materialKey = spool.materialFamily || spool.material;
    const materialMatch = selectedMaterial === "All" || materialKey === selectedMaterial;
    const haystack = `${spool.brand} ${spool.materialFamily || ""} ${spool.material} ${spool.colorName} ${spool.location || ""} ${spool.notes || ""}`.toLowerCase();
    return materialMatch && (!search || haystack.includes(search));
  });
  $("inventoryCount").textContent = `${filtered.length} spool${filtered.length === 1 ? "" : "s"}`;
  $("inventoryList").innerHTML = filtered.length ? filtered.map(s => renderSpoolCard(s)).join("") : `<div class="empty-state">No filament matches this search.</div>`;
}

function currentBrand() {
  return mergedCatalog.brands.find(b => b.id === $("brandSelect").value) || mergedCatalog.brands[0];
}

function currentProduct() {
  const brand = currentBrand();
  return brand?.products?.find(p => p.id === $("productSelect").value) || brand?.products?.[0];
}

function currentColor() {
  const product = currentProduct();
  const idx = Number($("colorSelect").value || 0);
  return product?.colors?.[idx] || product?.colors?.[0];
}

function populateBrandSelect(selectedId = null) {
  const select = $("brandSelect");
  if (!select) return;
  const previous = selectedId || select.value;
  if (!mergedCatalog.brands.length) {
    select.innerHTML = `<option value="">No built-in catalogue available</option>`;
    $("useCustomFilament").checked = true;
    toggleFilamentMode();
    return;
  }
  select.innerHTML = mergedCatalog.brands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  if (mergedCatalog.brands.some(b => b.id === previous)) select.value = previous;
  populateProductSelect();
}

function populateProductSelect(selectedId = null) {
  const brand = currentBrand();
  const select = $("productSelect");
  const previous = selectedId || select.value;
  const products = brand?.products || [];
  select.innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (products.some(p => p.id === previous)) select.value = previous;
  populateColorSelect();
}

function populateColorSelect(selectedIndex = null) {
  const product = currentProduct();
  const select = $("colorSelect");
  const colors = product?.colors || [];
  select.innerHTML = colors.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");
  if (selectedIndex !== null && colors[selectedIndex]) select.value = String(selectedIndex);
  updateCatalogPreview();
  if (!$("spoolId").value && product?.spoolSizes?.length) {
    $("initialWeight").value = product.spoolSizes[0];
    $("remainingWeight").value = product.spoolSizes[0];
  }
}

function updateCatalogPreview() {
  const product = currentProduct();
  const color = currentColor();
  $("catalogColorPreview").value = color?.hex || "#808080";
  $("materialFamilyHint").textContent = product ? `Material family: ${product.family || "Other"}` : "";
}

function toggleFilamentMode() {
  const custom = $("useCustomFilament").checked;
  $("catalogFields").classList.toggle("hidden", custom);
  $("customFields").classList.toggle("hidden", !custom);
}

function findCatalogMatch(spool) {
  for (const brand of mergedCatalog.brands) {
    if (brand.name.toLowerCase() !== String(spool.brand || "").toLowerCase()) continue;
    for (const product of brand.products || []) {
      if (product.name.toLowerCase() !== String(spool.material || "").toLowerCase()) continue;
      const colorIndex = (product.colors || []).findIndex(c => c.name.toLowerCase() === String(spool.colorName || "").toLowerCase());
      if (colorIndex >= 0) return { brandId: brand.id, productId: product.id, colorIndex };
    }
  }
  return null;
}

function resetSpoolForm() {
  $("spoolForm").reset();
  $("spoolId").value = "";
  $("initialWeight").value = 1000;
  $("remainingWeight").value = 1000;
  $("tareWeight").value = 0;
  $("lowStockThreshold").value = 150;
  $("colorHexCustom").value = "#808080";
  $("saveToCatalog").checked = true;
  $("useCustomFilament").checked = mergedCatalog.brands.length === 0;
  $("deleteSpoolBtn").classList.add("hidden");
  $("dialogEyebrow").textContent = "NEW FILAMENT";
  $("dialogTitle").textContent = "Add Spool";
  populateBrandSelect();
  toggleFilamentMode();
}

function openAddSpool() {
  resetSpoolForm();
  $("spoolDialog").showModal();
}

window.openEditSpool = function(id) {
  const spool = allSpools.find(s => s.id === id);
  if (!spool) return;
  resetSpoolForm();
  $("spoolId").value = spool.id;
  $("initialWeight").value = spool.initialWeightGrams ?? 1000;
  $("remainingWeight").value = spool.remainingWeightGrams ?? 1000;
  $("tareWeight").value = spool.spoolTareWeightGrams ?? 0;
  $("lowStockThreshold").value = spool.lowStockThresholdGrams ?? 150;
  $("location").value = spool.location || "";
  $("notes").value = spool.notes || "";
  $("isOpen").checked = !!spool.isOpen;

  const match = findCatalogMatch(spool);
  if (match) {
    $("useCustomFilament").checked = false;
    populateBrandSelect(match.brandId);
    $("brandSelect").value = match.brandId;
    populateProductSelect(match.productId);
    $("productSelect").value = match.productId;
    populateColorSelect(match.colorIndex);
  } else {
    $("useCustomFilament").checked = true;
    $("brandCustom").value = spool.brand || "";
    $("familyCustom").value = spool.materialFamily || "";
    $("materialCustom").value = spool.material || "";
    $("colorNameCustom").value = spool.colorName || "";
    $("colorHexCustom").value = spool.colorHex || "#808080";
    $("saveToCatalog").checked = false;
  }
  toggleFilamentMode();
  $("deleteSpoolBtn").classList.remove("hidden");
  $("dialogEyebrow").textContent = "FILAMENT DETAILS";
  $("dialogTitle").textContent = "Edit Spool";
  $("spoolDialog").showModal();
};

window.openUseDialog = function(id) {
  const spool = allSpools.find(s => s.id === id);
  if (!spool) return;
  $("useSpoolId").value = id;
  $("gramsUsed").value = "";
  $("useTitle").textContent = `${spool.colorName} ${spool.material}`;
  $("useRemainingHint").textContent = `${Math.round(spool.remainingWeightGrams)} g currently remaining`;
  $("useDialog").showModal();
};

function resetPrinterForm() {
  $("printerForm").reset();
  $("printerId").value = "";
  $("printerPreset").value = "custom";
  $("printerSystem").value = "single";
  $("printerSlotCount").value = 1;
  $("deletePrinterBtn").classList.add("hidden");
  $("printerDialogTitle").textContent = "Add Printer";
}

function openAddPrinter() {
  resetPrinterForm();
  $("printerDialog").showModal();
}

window.openEditPrinter = function(id) {
  const printer = allPrinters.find(p => p.id === id);
  if (!printer) return;
  resetPrinterForm();
  $("printerId").value = printer.id;
  $("printerName").value = printer.name || "";
  $("printerModel").value = printer.model || "";
  $("printerSystem").value = printer.systemType || "single";
  $("printerSlotCount").value = (printer.slots || []).length || 1;
  $("printerNotes").value = printer.notes || "";
  $("deletePrinterBtn").classList.remove("hidden");
  $("printerDialogTitle").textContent = "Edit Printer";
  $("printerDialog").showModal();
};

function createSlots(count, existingSlots = []) {
  return Array.from({ length: count }, (_, i) => ({ spoolId: existingSlots[i]?.spoolId || "" }));
}

window.assignSpoolToSlot = async function(printerId, slotIndex, spoolId) {
  const target = allPrinters.find(p => p.id === printerId);
  if (!target) return;

  let movedFrom = "";
  if (spoolId) {
    for (const printer of allPrinters) {
      let changed = false;
      for (let i = 0; i < (printer.slots || []).length; i++) {
        if (printer.id === printerId && i === slotIndex) continue;
        if (printer.slots[i].spoolId === spoolId) {
          movedFrom = `${printer.name} • ${slotLabel(printer, i)}`;
          printer.slots[i].spoolId = "";
          changed = true;
        }
      }
      if (changed) await putRecord(PRINTER_STORE, printer);
    }
  }

  target.slots[slotIndex].spoolId = spoolId || "";
  await putRecord(PRINTER_STORE, target);
  await refresh();
  if (spoolId && movedFrom) showToast(`Spool moved from ${movedFrom}`);
  else showToast(spoolId ? "Filament loaded" : "Slot marked empty");
};

async function removeSpoolFromPrinters(spoolId) {
  for (const printer of allPrinters) {
    let changed = false;
    for (const slot of printer.slots || []) {
      if (slot.spoolId === spoolId) { slot.spoolId = ""; changed = true; }
    }
    if (changed) await putRecord(PRINTER_STORE, printer);
  }
}

async function saveCustomCatalogEntry(entry) {
  const duplicate = customCatalogEntries.find(e =>
    e.brand.toLowerCase() === entry.brand.toLowerCase() &&
    e.product.toLowerCase() === entry.product.toLowerCase() &&
    e.colorName.toLowerCase() === entry.colorName.toLowerCase()
  );
  if (duplicate) {
    entry.id = duplicate.id;
  }
  await putRecord(CUSTOM_CATALOG_STORE, entry);
}

async function exportBackup() {
  const payload = {
    app: "Filament Stock",
    version: 2,
    exportedAt: new Date().toISOString(),
    spools: allSpools,
    printers: allPrinters,
    customCatalog: customCatalogEntries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `filament-stock-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
  showToast("Backup exported");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const spools = Array.isArray(parsed) ? parsed : (parsed.spools || []);
    const printers = Array.isArray(parsed) ? [] : (parsed.printers || []);
    const custom = Array.isArray(parsed) ? [] : (parsed.customCatalog || []);
    if (!Array.isArray(spools)) throw new Error("Invalid backup");
    if (!confirm(`Replace current data with ${spools.length} spool(s) and ${printers.length} printer(s)?`)) return;

    await Promise.all([clearStore(SPOOL_STORE), clearStore(PRINTER_STORE), clearStore(CUSTOM_CATALOG_STORE)]);
    for (const spool of spools) {
      if (!spool.id) spool.id = uid();
      if (!spool.dateAdded) spool.dateAdded = new Date().toISOString();
      await putRecord(SPOOL_STORE, spool);
    }
    for (const printer of printers) {
      if (!printer.id) printer.id = uid();
      printer.slots ||= createSlots(1);
      await putRecord(PRINTER_STORE, printer);
    }
    for (const entry of custom) {
      if (!entry.id) entry.id = uid();
      await putRecord(CUSTOM_CATALOG_STORE, entry);
    }
    await refresh();
    showToast("Backup imported");
  } catch (err) {
    console.error(err);
    alert("That file does not look like a valid Filament Stock backup.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await openDb();
  await loadBuiltInCatalog();
  await refresh();

  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      $(btn.dataset.view).classList.add("active");
      btn.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  $("addSpoolTop").addEventListener("click", openAddSpool);
  $("addSpoolBottom").addEventListener("click", openAddSpool);
  $("closeDialog").addEventListener("click", () => $("spoolDialog").close());
  $("cancelSpoolBtn").addEventListener("click", () => $("spoolDialog").close());
  $("useCustomFilament").addEventListener("change", toggleFilamentMode);
  $("brandSelect").addEventListener("change", () => populateProductSelect());
  $("productSelect").addEventListener("change", () => populateColorSelect());
  $("colorSelect").addEventListener("change", updateCatalogPreview);

  $("spoolForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const existingId = $("spoolId").value;
    const existing = allSpools.find(s => s.id === existingId);
    const customMode = $("useCustomFilament").checked;

    let brand, materialFamily, material, colorName, colorHex;
    if (customMode) {
      brand = $("brandCustom").value.trim();
      materialFamily = $("familyCustom").value.trim() || "Other";
      material = $("materialCustom").value.trim();
      colorName = $("colorNameCustom").value.trim();
      colorHex = $("colorHexCustom").value;
      if (!brand || !material || !colorName) {
        alert("Please enter a brand, product/material, and colour name.");
        return;
      }
      if ($("saveToCatalog").checked) {
        await saveCustomCatalogEntry({
          id: uid(), brand, family: materialFamily, product: material, colorName, colorHex,
          spoolSize: Number($("initialWeight").value || 1000)
        });
      }
    } else {
      const b = currentBrand(), p = currentProduct(), c = currentColor();
      if (!b || !p || !c) { alert("Please choose a filament from the catalogue."); return; }
      brand = b.name; materialFamily = p.family || "Other"; material = p.name; colorName = c.name; colorHex = c.hex || "#808080";
    }

    const spool = {
      id: existingId || uid(), brand, materialFamily, material, colorName, colorHex,
      initialWeightGrams: Number($("initialWeight").value),
      remainingWeightGrams: Number($("remainingWeight").value),
      spoolTareWeightGrams: Number($("tareWeight").value || 0),
      lowStockThresholdGrams: Number($("lowStockThreshold").value || 0),
      location: $("location").value.trim(), notes: $("notes").value.trim(), isOpen: $("isOpen").checked,
      dateAdded: existing?.dateAdded || new Date().toISOString()
    };
    await putRecord(SPOOL_STORE, spool);
    $("spoolDialog").close();
    await refresh();
    showToast(existingId ? "Spool updated" : "Spool added");
  });

  $("deleteSpoolBtn").addEventListener("click", async () => {
    const id = $("spoolId").value;
    if (!id || !confirm("Delete this spool? It will also be unloaded from any printer.")) return;
    await removeSpoolFromPrinters(id);
    await deleteRecord(SPOOL_STORE, id);
    $("spoolDialog").close();
    await refresh();
    showToast("Spool deleted");
  });

  $("searchInput").addEventListener("input", renderInventory);
  $("materialFilter").addEventListener("change", renderInventory);

  $("closeUseDialog").addEventListener("click", () => $("useDialog").close());
  $("cancelUseBtn").addEventListener("click", () => $("useDialog").close());
  $("useForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("useSpoolId").value;
    const spool = allSpools.find(s => s.id === id);
    if (!spool) return;
    const grams = Number($("gramsUsed").value);
    if (!Number.isFinite(grams) || grams <= 0) return;
    spool.remainingWeightGrams = Math.max(0, Number(spool.remainingWeightGrams) - grams);
    await putRecord(SPOOL_STORE, spool);
    $("useDialog").close();
    await refresh();
    showToast(`${grams.toFixed(1)} g subtracted`);
  });

  $("addPrinterBtn").addEventListener("click", openAddPrinter);
  $("closePrinterDialog").addEventListener("click", () => $("printerDialog").close());
  $("cancelPrinterBtn").addEventListener("click", () => $("printerDialog").close());
  $("printerPreset").addEventListener("change", () => {
    const preset = $("printerPreset").value;
    if (preset === "snapmaker-u1") {
      $("printerName").value = "Snapmaker U1";
      $("printerModel").value = "Snapmaker U1";
      $("printerSystem").value = "toolchanger";
      $("printerSlotCount").value = 4;
    } else if (preset === "single") {
      $("printerSystem").value = "single";
      $("printerSlotCount").value = 1;
    }
  });

  $("printerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const existingId = $("printerId").value;
    const existing = allPrinters.find(p => p.id === existingId);
    const count = Math.max(1, Math.min(16, Number($("printerSlotCount").value || 1)));
    const printer = {
      id: existingId || uid(),
      name: $("printerName").value.trim(),
      model: $("printerModel").value.trim(),
      systemType: $("printerSystem").value,
      slots: createSlots(count, existing?.slots || []),
      notes: $("printerNotes").value.trim(),
      dateAdded: existing?.dateAdded || new Date().toISOString()
    };
    await putRecord(PRINTER_STORE, printer);
    $("printerDialog").close();
    await refresh();
    showToast(existingId ? "Printer updated" : "Printer added");
  });

  $("deletePrinterBtn").addEventListener("click", async () => {
    const id = $("printerId").value;
    if (!id || !confirm("Delete this printer? Your filament spools will stay in inventory.")) return;
    await deleteRecord(PRINTER_STORE, id);
    $("printerDialog").close();
    await refresh();
    showToast("Printer deleted");
  });

  $("exportBtn").addEventListener("click", exportBackup);
  $("settingsExportBtn").addEventListener("click", exportBackup);
  $("importInput").addEventListener("change", e => importBackup(e.target.files[0]));
  $("settingsImportInput").addEventListener("change", e => importBackup(e.target.files[0]));

  $("clearCustomCatalogBtn").addEventListener("click", async () => {
    if (!customCatalogEntries.length) { showToast("No custom catalogue entries to clear"); return; }
    if (!confirm("Clear your saved custom catalogue entries? Existing inventory spools will not be deleted.")) return;
    await clearStore(CUSTOM_CATALOG_STORE);
    await refresh();
    showToast("Custom catalogue cleared");
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(console.error);
});
