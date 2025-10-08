// src/services/misc.ts
import { PlayerService } from "./player";
import { Atoms } from "../store/atoms";
import { fakeInventoryShow, isInventoryPanelOpen, waitInventoryPanelClosed, fakeInventoryHide } from "./fakeModal";
import { toastSimple } from "../ui/toast";
import { plantCatalog } from "../data/hardcoded-data.clean";

/* ========================================================================== */
/*                               GHOST HELPERS                                */
/* ========================================================================== */

export const LS_GHOST_KEY = "qws:player:ghostMode";
const LS_DELAY_KEY = "qws:ghost:delayMs";
const DEFAULT_DELAY_MS = 50;

export const readGhostEnabled = (def = false): boolean => {
  try { return localStorage.getItem(LS_GHOST_KEY) === "1"; } catch { return def; }
};
export const writeGhostEnabled = (v: boolean) => {
  try {
    localStorage.setItem(LS_GHOST_KEY, v ? "1" : "0");
  } catch (err) {
  }
};

export const getGhostDelayMs = (): number => {
  try {
    const n = Math.floor(Number(localStorage.getItem(LS_DELAY_KEY)) || DEFAULT_DELAY_MS);
    return Math.max(5, n);
  } catch { return DEFAULT_DELAY_MS; }
};
export const setGhostDelayMs = (n: number) => {
  const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
  try {
    localStorage.setItem(LS_DELAY_KEY, String(v));
  } catch (err) {
  }
};

/* ========================================================================== */
/*                               GHOST CONTROLLER                             */
/* ========================================================================== */

export type GhostController = {
  start(): void;
  stop(): void;
  setSpeed(n: number): void;
  getSpeed(): number;
};

export function createGhostController(): GhostController {
  let DELAY_MS = getGhostDelayMs();
  const KEYS = new Set<string>();

  const onKeyDownCapture = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const isMove =
      k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" ||
      e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!isMove) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    KEYS.add(k);
  };
  const onKeyUpCapture = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const isMove =
      k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" ||
      e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!isMove) return;
    e.preventDefault(); e.stopImmediatePropagation();
    KEYS.delete(k);
  };
  const onBlur = () => { KEYS.clear(); };
  const onVisibility = () => { if (document.hidden) KEYS.clear(); };

  function getDir() {
    let dx = 0, dy = 0;
    if (KEYS.has("z") || KEYS.has("w") || KEYS.has("arrowup")) dy -= 1;
    if (KEYS.has("s") || KEYS.has("arrowdown")) dy += 1;
    if (KEYS.has("q") || KEYS.has("a") || KEYS.has("arrowleft")) dx -= 1;
    if (KEYS.has("d") || KEYS.has("arrowright")) dx += 1;
    if (dx) dx = dx > 0 ? 1 : -1;
    if (dy) dy = dy > 0 ? 1 : -1;
    return { dx, dy };
  }

  let rafId: number | null = null;
  let lastTs = 0, accMs = 0, inMove = false;

  async function step(dx: number, dy: number) {
    let cur;
    try {
      cur = await PlayerService.getPosition();
    } catch (err) {
    }
    const cx = Math.round(cur?.x ?? 0), cy = Math.round(cur?.y ?? 0);
    try {
      await PlayerService.move(cx + dx, cy + dy);
    } catch (err) {
    }
  }

  const CAPTURE: AddEventListenerOptions = { capture: true };

  function frame(ts: number) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs; lastTs = ts;
    const { dx, dy } = getDir();
    accMs += dt;

    if (dx === 0 && dy === 0) {
      accMs = Math.min(accMs, DELAY_MS * 4);
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (accMs >= DELAY_MS && !inMove) {
      accMs -= DELAY_MS;
      inMove = true;
      (async () => { try { await step(dx, dy); } finally { inMove = false; } })();
    }
    accMs = Math.min(accMs, DELAY_MS * 4);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (rafId !== null) return;
      lastTs = 0; accMs = 0; inMove = false;
      window.addEventListener("keydown", onKeyDownCapture, CAPTURE);
      window.addEventListener("keyup", onKeyUpCapture, CAPTURE);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      KEYS.clear();
      window.removeEventListener("keydown", onKeyDownCapture, CAPTURE);
      window.removeEventListener("keyup", onKeyUpCapture, CAPTURE);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    setSpeed(n: number) {
      const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
      DELAY_MS = v;
      setGhostDelayMs(v);
    },
    getSpeed() { return DELAY_MS; },
  };
}

/* ========================================================================== */
/*                              SEED DELETER LOGIC                            */
/* ========================================================================== */

export type SeedItem = {
  species: string;
  itemType: "Seed";
  quantity: number;
  id?: string;
};
export type InventoryShape = { items: any[]; favoritedItemIds?: string[] };

// Ce que l’utilisateur sélectionne dans l’overlay
type SeedSelection = { name: string; qty: number; maxQty: number };

// État interne du flow de sélection
const selectedMap = new Map<string, SeedSelection>();      // key = display name (ex: "Tulip Seed")
let seedStockByName = new Map<string, number>();           // "Tulip Seed" -> quantité dispo
let seedSourceCache: SeedItem[] = [];                      // snapshot des seeds au lancement

// ------ US number formatting ------
const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

async function clearUiSelectionAtoms() {
  try { await Atoms.inventory.mySelectedItemName.set(null); } catch {}
  try { await Atoms.inventory.myValidatedSelectedItemIndex.set(null); } catch {}
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch {}
}

// IDs/refs overlay
const OVERLAY_ID = "qws-seeddeleter-overlay";
const LIST_ID = "qws-seeddeleter-list";
const SUMMARY_ID = "qws-seeddeleter-summary";

/* ------------------------------ helpers data ------------------------------ */

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Mappe les noms d’affichage (seed.name) vers la/les species depuis le plantCatalog. */
function buildDisplayNameToSpeciesFromCatalog(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  try {
    const cat = plantCatalog as any;
    for (const species of Object.keys(cat || {})) {
      const seedName: string =
        (cat?.[species]?.seed?.name && String(cat?.[species]?.seed?.name)) || `${species} Seed`;
      const arr = map.get(seedName) ?? [];
      arr.push(species);
      map.set(seedName, arr);
    }
  } catch {}
  return map;
}

/** Stock courant par species (depuis l’inventaire réel). */
async function buildSpeciesStockFromInventory(): Promise<Map<string, number>> {
  const inv = await getMySeedInventory();
  const stock = new Map<string, number>();
  for (const it of inv) {
    const q = Math.max(0, Math.floor(it.quantity || 0));
    if (q > 0) stock.set(it.species, (stock.get(it.species) ?? 0) + q);
  }
  return stock;
}

/** Répartit une demande “name/qty” sur les species candidates, en respectant le stock dispo. */
function allocateForRequestedName(
  requested: { name: string; qty: number },
  nameToSpecies: Map<string, string[]>,
  speciesStock: Map<string, number>
): { species: string; qty: number }[] {
  let remaining = Math.max(0, Math.floor(requested.qty || 0));
  // 1) species candidates via catalog
  let candidates = nameToSpecies.get(requested.name) ?? [];

  // 2) fallback best-effort: “Xxx Seed” -> “Xxx” si présent dans le catalog
  if (!candidates.length && / seed$/i.test(requested.name)) {
    const fallbackSpecies = requested.name.replace(/\s+seed$/i, "");
    if ((plantCatalog as any)?.[fallbackSpecies]) candidates = [fallbackSpecies];
  }

  if (!candidates.length || remaining <= 0) return [];

  // 3) tri par stock dispo (desc) pour consommer là où il y en a
  const ranked = candidates
    .map(sp => ({ sp, available: speciesStock.get(sp) ?? 0 }))
    .filter(x => x.available > 0)
    .sort((a, b) => b.available - a.available);

  const out: { species: string; qty: number }[] = [];
  for (const { sp, available } of ranked) {
    if (remaining <= 0) break;
    const take = Math.min(available, remaining);
    if (take > 0) {
      out.push({ species: sp, qty: take });
      remaining -= take;
    }
  }
  return out;
}

let _seedDeleteAbort: AbortController | null = null;
let _seedDeleteBusy = false;

type DeleteOpts = {
  selection?: { name: string; qty: number }[]; // sinon on lit selectedMap
  batchSize?: number;                           // par défaut 25
  delayMs?: number;                             // par défaut 16ms
  keepSelection?: boolean;                      // false => on clear à la fin
  onProgress?: (info: { done: number; total: number; species: string; remainingForSpecies: number }) => void;
};

/** Supprime les graines sélectionnées en appelant PlayerService.wish(species) autant de fois que qty. */
export async function deleteSelectedSeeds(opts: DeleteOpts = {}) {
  if (_seedDeleteBusy) {
    await toastSimple("Seed deleter", "Deletion already in progress.", "info");
    return;
  }

  const batchSize = Math.max(1, Math.floor(opts.batchSize ?? 25));
  const delayMs   = Math.max(0, Math.floor(opts.delayMs ?? 16));

  // 1) Lire la sélection (ou utiliser celle passée en param)
  const selection = (opts.selection && Array.isArray(opts.selection) ? opts.selection : Array.from(selectedMap.values()))
    .map(s => ({ name: s.name, qty: Math.max(0, Math.floor(s.qty || 0)) }))
    .filter(s => s.qty > 0);

  if (selection.length === 0) {
    await toastSimple("Seed deleter", "No seeds selected.", "info");
    return;
  }

  // 2) Index catalog: displayName -> species[], et stock réel par species
  const nameToSpecies = buildDisplayNameToSpeciesFromCatalog();
  const speciesStock  = await buildSpeciesStockFromInventory();

  // 3) Allocation des quantités sur species selon stock
  const allocatedBySpecies = new Map<string, number>();
  let requestedTotal = 0, cappedTotal = 0;
  for (const req of selection) {
    requestedTotal += req.qty;
    const chunks = allocateForRequestedName(req, nameToSpecies, speciesStock);
    const okForThis = chunks.reduce((a, c) => a + c.qty, 0);
    cappedTotal += okForThis;
    for (const c of chunks) {
      allocatedBySpecies.set(c.species, (allocatedBySpecies.get(c.species) ?? 0) + c.qty);
    }
  }

  if (cappedTotal <= 0) {
    await toastSimple("Seed deleter", "Nothing to delete (not in inventory).", "info");
    return;
  }
  if (cappedTotal < requestedTotal) {
    await toastSimple(
      "Seed deleter",
      `Requested ${formatNum(requestedTotal)} but only ${formatNum(cappedTotal)} available. Proceeding.`,
      "info"
    );
  }

  // 4) Tâches par species
  const tasks = Array.from(allocatedBySpecies.entries())
    .map(([species, qty]) => ({ species, qty: Math.max(0, Math.floor(qty || 0)) }))
    .filter(t => t.qty > 0);

  const total = tasks.reduce((acc, t) => acc + t.qty, 0);
  if (total <= 0) {
    await toastSimple("Seed deleter", "Nothing to delete.", "info");
    return;
  }

  _seedDeleteBusy = true;
  const abort = new AbortController();
  _seedDeleteAbort = abort;

  try {
    await toastSimple("Seed deleter", `Deleting ${formatNum(total)} seeds across ${tasks.length} species...`, "info");

    let done = 0;
    for (const t of tasks) {
      let remaining = t.qty;
      while (remaining > 0) {
        if (abort.signal.aborted) throw new Error("Deletion cancelled.");

        const n = Math.min(batchSize, remaining);
        // on séquence (évite de flood)
        for (let i = 0; i < n; i++) {
          try {
            await PlayerService.wish(t.species);
          } catch (err) {
          }
        }

        done += n;
        remaining -= n;

        try {
          opts.onProgress?.({ done, total, species: t.species, remainingForSpecies: remaining });
          window.dispatchEvent(new CustomEvent("qws:seeddeleter:progress", {
            detail: { done, total, species: t.species, remainingForSpecies: remaining }
          }));
        } catch {}

        if (delayMs > 0 && remaining > 0) await sleep(delayMs);
      }
    }

    if (!opts.keepSelection) selectedMap.clear();

    try {
      window.dispatchEvent(new CustomEvent("qws:seeddeleter:done", { detail: { total, speciesCount: tasks.length } }));
    } catch {}

    await toastSimple("Seed deleter", `Deleted ${formatNum(total)} seeds (${tasks.length} species).`, "success");
  } catch (e: any) {
    const msg = e?.message || "Deletion failed.";
    try { window.dispatchEvent(new CustomEvent("qws:seeddeleter:error", { detail: { message: msg } })); } catch {}
    await toastSimple("Seed deleter", msg, "error");
  } finally {
    _seedDeleteBusy = false;
    _seedDeleteAbort = null;
  }
}

export function cancelSeedDeletion() {
  try {
    _seedDeleteAbort?.abort();
  } catch (err) {
  }
}
export function isSeedDeletionRunning() {
  return _seedDeleteBusy;
}

/* Bridge : si ton UI envoie déjà `qws:seeddeleter:apply`, on déclenche la suppression. */
try {
  window.addEventListener("qws:seeddeleter:apply", async (e: any) => {
    try {
      const selection = Array.isArray(e?.detail?.selection) ? e.detail.selection : undefined;
      await deleteSelectedSeeds({ selection, batchSize: 25, delayMs: 16, keepSelection: false });
    } catch {}
  });
} catch {}

function seedDisplayNameFromSpecies(species: string): string {
  try {
    const node = (plantCatalog as any)?.[species];
    const n = node?.seed?.name;
    if (typeof n === "string" && n) return n;
  } catch {}
  return `${species} Seed`;
}

function normalizeSeedItem(x: any, _idx: number): SeedItem | null {
  if (!x || typeof x !== "object") return null;
  const species = typeof x.species === "string" ? x.species.trim() : "";
  const itemType = x.itemType === "Seed" ? "Seed" : null;
  const quantity = Number.isFinite(x.quantity) ? Math.max(0, Math.floor(x.quantity)) : 0;
  if (!species || itemType !== "Seed" || quantity <= 0) return null;
  return { species, itemType: "Seed", quantity, id: `seed:${species}` };
}

export async function getMySeedInventory(): Promise<SeedItem[]> {
  try {
    const raw = await Atoms.inventory.mySeedInventory.get();
    if (!Array.isArray(raw)) return [];
    const out: SeedItem[] = [];
    raw.forEach((x, i) => { const s = normalizeSeedItem(x, i); if (s) out.push(s); });
    return out;
  } catch { return []; }
}

function buildInventoryShapeFrom(items: SeedItem[]): InventoryShape {
  return { items, favoritedItemIds: [] };
}

// Remplit le cache des quantités par nom d’affichage
export async function buildSeedInventoryShape(): Promise<InventoryShape | null> {
  const seeds = await getMySeedInventory();
  seedStockByName.clear();
  for (const s of seeds) {
    const disp = seedDisplayNameFromSpecies(s.species);
    seedStockByName.set(disp, (seedStockByName.get(disp) ?? 0) + (s.quantity ?? 0));
  }
  if (!seeds.length) return null;
  return { items: seeds, favoritedItemIds: [] };
}

/* ------------------------------ overlay (UI) ------------------------------ */

function setStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}

function styleOverlayBox(div: HTMLDivElement) {
  div.id = OVERLAY_ID;
  setStyles(div, {
    position: "fixed",
    left: "12px",
    top: "12px",
    zIndex: "999999",
    display: "grid",
    gridTemplateRows: "auto auto 1px 1fr auto",
    gap: "6px",
    minWidth: "320px",
    maxWidth: "420px",
    maxHeight: "52vh",
    padding: "8px",
    border: "1px solid #39424c",
    borderRadius: "10px",
    background: "rgba(22,27,34,0.92)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    backdropFilter: "blur(2px)",
    userSelect: "none",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    fontSize: "12px",
    lineHeight: "1.25",
  } as any);
  (div as any).dataset["qwsSeedDeleter"] = "1";
}

function makeDraggable(root: HTMLDivElement, handle: HTMLElement) {
  let dragging = false;
  let ox = 0, oy = 0;

  const onDown = (e: MouseEvent) => {
    dragging = true;
    const r = root.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp, { once: true });
  };
  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const nx = Math.max(4, e.clientX - ox);
    const ny = Math.max(4, e.clientY - oy);
    root.style.left = `${nx}px`;
    root.style.top = `${ny}px`;
  };
  const onUp = () => {
    dragging = false;
    document.removeEventListener("mousemove", onMove);
  };

  handle.addEventListener("mousedown", onDown);
}

function createButton(label: string, styleOverride?: Partial<CSSStyleDeclaration>) {
  const b = document.createElement("button");
  b.textContent = label;
  setStyles(b, {
    padding: "4px 8px",
    borderRadius: "8px",
    border: "1px solid #4446",
    background: "#161b22",
    color: "#E7EEF7",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "12px",
    ...styleOverride,
  });
  b.onmouseenter = () => (b.style.borderColor = "#6aa1");
  b.onmouseleave = () => (b.style.borderColor = "#4446");
  return b;
}

// ------------ BLOCK GAME KEYS WHEN TYPING IN OVERLAY INPUTS ----------------
let overlayKeyGuardsOn = false;
function isInsideOverlay(el: Element | null) {
  return !!(el && (el as HTMLElement).closest?.(`#${OVERLAY_ID}`));
}
function keyGuardCapture(e: KeyboardEvent) {
  // Only when typing inside overlay inputs/textareas/contenteditable
  const ae = document.activeElement as HTMLElement | null;
  if (!isInsideOverlay(ae)) return;
  const tag = (ae?.tagName || "").toLowerCase();
  const isEditable = tag === "input" || tag === "textarea" || (ae && (ae as any).isContentEditable);
  if (!isEditable) return;
  // Block digits 0-9 (top row & numpad: e.key is still "0"-"9")
  if (/^[0-9]$/.test(e.key)) {
    // Let the input receive the key, but stop it from reaching the game
    e.stopImmediatePropagation();
  }
}
function installOverlayKeyGuards() {
  if (overlayKeyGuardsOn) return;
  window.addEventListener("keydown", keyGuardCapture, { capture: true });
  overlayKeyGuardsOn = true;
}
function removeOverlayKeyGuards() {
  if (!overlayKeyGuardsOn) return;
  window.removeEventListener("keydown", keyGuardCapture, { capture: true } as any);
  overlayKeyGuardsOn = false;
}
// ---------------------------------------------------------------------------

// Ferme proprement le faux inventaire (désactive les fakes + ferme la modale).
// Fallback: synthétise ESC si jamais ça jette.
async function closeSeedInventoryPanel() {
  try {
    await fakeInventoryHide();
  } catch {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    } catch {}
  }
}

function createSeedOverlay(): HTMLDivElement {
  const box = document.createElement("div");
  styleOverlayBox(box);

  const header = document.createElement("div");
  setStyles(header, { display: "flex", alignItems: "center", gap: "4px", cursor: "move" });

  const title = document.createElement("div");
  title.textContent = "🎯 Selection mode";
  setStyles(title, { fontWeight: "700", fontSize: "13px" });

  const hint = document.createElement("div");
  hint.textContent = "Click seeds in inventory to toggle selection.";
  setStyles(hint, { opacity: "0.8", fontSize: "11px" });

  const hr = document.createElement("div");
  setStyles(hr, { height: "1px", background: "#2d333b" });

  const list = document.createElement("div");
  list.id = LIST_ID;
  setStyles(list, {
    minHeight: "44px",
    maxHeight: "26vh",
    overflow: "auto",
    padding: "4px",
    border: "1px dashed #39424c",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.84)",
    userSelect: "text",
  });

  const actions = document.createElement("div");
  setStyles(actions, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });

  const summary = document.createElement("div");
  summary.id = SUMMARY_ID;
  setStyles(summary, { fontWeight: "600" });
  summary.textContent = "Selected: 0 species · 0 seeds";

  const btnClear = createButton("Clear");
  btnClear.title = "Clear selection";
  btnClear.onclick = async () => {
    selectedMap.clear();
    refreshList();
    updateSummary();
    await clearUiSelectionAtoms();
    await repatchFakeSeedInventoryWithSelection();
  };

  _btnConfirm = createButton("Confirm", { background: "#1F2328CC" });
  _btnConfirm.disabled = true;
  _btnConfirm.onclick = async () => {
    await closeSeedInventoryPanel();
  };

  header.append(title);
  actions.append(summary, btnClear, _btnConfirm);
  box.append(header, hint, hr, list, actions);

  makeDraggable(box, header);
  return box;
}

function showSeedOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = createSeedOverlay();
  document.body.appendChild(el);
  installOverlayKeyGuards(); // <-- active key guard
  refreshList();
  updateSummary();
}
function hideSeedOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  removeOverlayKeyGuards(); // <-- retire key guard
}

/* --------------------------- sélection (atom) --------------------------- */

let _btnConfirm: HTMLButtonElement | null = null;
let unsubSelectedName: null | (() => void | Promise<void>) = null;

function renderListRow(item: SeedSelection): HTMLElement {
  const row = document.createElement("div");
  setStyles(row, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderBottom: "1px dashed #2d333b",
  });

  const name = document.createElement("div");
  name.textContent = item.name;
  setStyles(name, {
    fontSize: "12px",
    fontWeight: "600",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const controls = document.createElement("div");
  setStyles(controls, { display: "flex", alignItems: "center", gap: "6px" });

  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "1";
  qty.max = String(Math.max(1, item.maxQty));
  qty.step = "1";
  qty.value = String(item.qty);
  qty.className = "qmm-input";
  setStyles(qty, {
    width: "68px",
    height: "28px",
    border: "1px solid #4446",
    borderRadius: "8px",
    background: "rgba(15,19,24,0.90)",
    padding: "0 8px",
    fontSize: "12px",
  } as any);

  // Extra safety: stop bubbling digits from input itself (in case some listener is attached late)
  const swallowDigits = (e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      // not preventing default → the input still receives the digit
    }
  };
  qty.addEventListener("keydown", swallowDigits);


  qty.onchange = () => {
    const v = Math.min(item.maxQty, Math.max(1, Math.floor(Number(qty.value) || 1)));
    qty.value = String(v);
    const cur = selectedMap.get(item.name);
    if (!cur) return;
    cur.qty = v;
    selectedMap.set(item.name, cur);
    updateSummary();
  };
  qty.oninput = qty.onchange as any;

  const remove = createButton("Remove", { background: "transparent" });
  remove.onclick = async () => {
    selectedMap.delete(item.name);
    refreshList();
    updateSummary();
    await repatchFakeSeedInventoryWithSelection();
  };

  controls.append(qty, remove);
  row.append(name, controls);
  return row;
}

function refreshList() {
  const list = document.getElementById(LIST_ID) as HTMLDivElement | null;
  if (!list) return;
  list.innerHTML = "";
  const entries = Array.from(selectedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No seeds selected.";
    empty.style.opacity = "0.8";
    list.appendChild(empty);
    return;
  }
  for (const it of entries) list.appendChild(renderListRow(it));
}

function totalSelected() {
  let species = 0, qty = 0;
  for (const it of selectedMap.values()) { species += 1; qty += it.qty; }
  return { species, qty };
}

function updateSummary() {
  const { species, qty } = totalSelected();
  const el = document.getElementById(SUMMARY_ID);
  if (el) el.textContent = `Selected: ${species} species · ${formatNum(qty)} seeds`;
  if (_btnConfirm) {
    _btnConfirm.textContent = "Confirm";
    _btnConfirm.disabled = qty <= 0;
    _btnConfirm.style.opacity = qty <= 0 ? "0.6" : "1";
    _btnConfirm.style.cursor = qty <= 0 ? "not-allowed" : "pointer";
  }
}

async function repatchFakeSeedInventoryWithSelection() {
  const selectedNames = new Set(Array.from(selectedMap.keys()));
  const filtered = (Array.isArray(seedSourceCache) ? seedSourceCache : []).filter(s => {
    const disp = seedDisplayNameFromSpecies(s.species);
    return !selectedNames.has(disp);
  });

  try {
    await fakeInventoryShow({ items: filtered, favoritedItemIds: [] }, { open: false });
  } catch {
    // panel fermé entre-temps → on ignore
  }
}

// Écoute la sélection côté UI inventaire
async function beginSelectedNameListener() {
  if (unsubSelectedName) return;

  const unsub = await Atoms.inventory.mySelectedItemName.onChange(async (name: string | null) => {
    const n = (name || "").trim();
    if (!n) return;

    if (selectedMap.has(n)) {
      selectedMap.delete(n);
    } else {
      const max = Math.max(1, seedStockByName.get(n) ?? 1);
      selectedMap.set(n, { name: n, qty: max, maxQty: max });
    }

    refreshList();
    updateSummary();

    await clearUiSelectionAtoms();
    await repatchFakeSeedInventoryWithSelection();
  });

  unsubSelectedName = typeof unsub === "function" ? unsub : null;
}

async function endSelectedNameListener() {
  const fn = unsubSelectedName;
  unsubSelectedName = null;
  try { await fn?.(); } catch {}
}

/* ------------------------- Ouverture simple (preview) ------------------------- */

export async function openSeedInventoryPreview() {
  try {
    const src = await getMySeedInventory();
    if (!src.length) {
      await toastSimple("Seed inventory", "No seeds to display.", "info");
      return;
    }
    await fakeInventoryShow(buildInventoryShapeFrom(src), { open: true });
  } catch (e: any) {
    await toastSimple("Seed inventory", e?.message || "Failed to open seed inventory.", "error");
  }
}

/* ---------------------------- Flow complet (selector) ---------------------------- */
/**
 * Cache le menu appelant via setWindowVisible(false),
 * ouvre l’inventaire des graines (seulement) + overlay discret déplaçable,
 * écoute les sélections, puis restaure l’UI à la fermeture.
 */
export async function openSeedSelectorFlow(setWindowVisible?: (v: boolean) => void) {
  try {
    setWindowVisible?.(false);

    seedSourceCache = await getMySeedInventory();
    seedStockByName = new Map<string, number>();
    for (const s of seedSourceCache) {
      const display = seedDisplayNameFromSpecies(s.species);
      seedStockByName.set(display, Math.max(1, Math.floor(s.quantity || 0)));
    }

    selectedMap.clear();
    showSeedOverlay();
    await beginSelectedNameListener();

    await fakeInventoryShow(buildInventoryShapeFrom(seedSourceCache), { open: true });

    if (await isInventoryPanelOpen()) {
      await waitInventoryPanelClosed();
    }
  } catch (e: any) {
    await toastSimple("Seed inventory", e?.message || "Failed to open seed selector.", "error");
  } finally {
    await endSelectedNameListener();
    hideSeedOverlay();
    seedSourceCache = [];
    seedStockByName.clear();
    setWindowVisible?.(true);
  }
}

/* ========================================================================== */
/*                             SERVICE UNIQUE (facile)                        */
/* ========================================================================== */

export const MiscService = {
  // ghost
  readGhostEnabled,
  writeGhostEnabled,
  getGhostDelayMs,
  setGhostDelayMs,
  createGhostController,

  // seeds
  getMySeedInventory,
  openSeedInventoryPreview,
  openSeedSelectorFlow,

  //delete
  deleteSelectedSeeds,
  cancelSeedDeletion,
  isSeedDeletionRunning,

  getCurrentSeedSelection(): SeedSelection[] {
    return Array.from(selectedMap.values());
  },
  clearSeedSelection() {
    selectedMap.clear();
  },
};
