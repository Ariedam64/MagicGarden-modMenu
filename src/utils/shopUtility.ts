
/* ======================== BUY ALL =========================*/

import {
  NotifierService,
  type ShopsSnapshot,
  type PurchasesSnapshot,
} from "../services/notifier";
import { PlayerService } from "../services/player";
import { Atoms } from "../store/atoms";

export type ShopType = "plant" | "egg" | "tool" | "decor";

const SHOP_TYPES: ShopType[] = ["plant", "egg", "tool", "decor"];

export type BuyAllConfig = {
  countOverride?: Partial<Record<ShopType, number>>;
};

declare global {
  interface Window {
    BuyAllConfig?: BuyAllConfig;
  }
}

const BTN_CLASS     = "romann-buyall-btn";
const STYLE_ID      = "tm-buyall-css";
const ITEM_SELECTOR = "div.McFlex.css-1kkwxjt";
const LIST_SELECTOR = "div.McFlex.css-1lfov12";
const ROW_SELECTOR  = "div.McFlex.css-b9riu6";
const INDEX_ATTR    = "data-tm-shop-index";

const RESCAN_MS = 20;

type RemainingDetails = {
  notifierItemId: string | null;
  initialStock: number | null;
  purchased: number | null;
  remaining: number | null;
};

// ——— tailles attendues (BASE + overrides) ———
const SHOP_ATOMS: Record<ShopType, any> = {
  plant: Atoms.shop.seedShop,
  egg:   Atoms.shop.eggShop,
  tool:  Atoms.shop.toolShop,
  decor: Atoms.shop.decorShop,
};

type InventoryEntry = { id: string; name: string | null; raw: any };

const shopInventoryCache: Partial<Record<ShopType, InventoryEntry[]>> = {};
const shopInventoryLengths: Partial<Record<ShopType, number>> = {};

let shopInventoryInitStarted = false;
const shopInventoryUnsubs: Partial<Record<ShopType, (() => void) | null>> = {};

function extractInventoryId(shop: ShopType, entry: any): string | null {
  if (!entry) return null;
  if (shop === "plant") return entry?.species ? String(entry.species) : null;
  if (shop === "egg")   return entry?.eggId ? String(entry.eggId) : null;
  if (shop === "tool")  return entry?.toolId ? String(entry.toolId) : null;
  if (shop === "decor") return entry?.decorId ? String(entry.decorId) : null;
  return null;
}

function extractInventoryName(shop: ShopType, entry: any): string | null {
  if (!entry) return null;
  if (shop === "plant") return entry?.species ? String(entry.species) : null;
  if (shop === "egg")   return entry?.eggId ? String(entry.eggId) : null;
  if (shop === "tool")  return entry?.toolId ? String(entry.toolId) : null;
  if (shop === "decor") return entry?.decorId ? String(entry.decorId) : null;
  return null;
}

function normalizeInventory(shop: ShopType, data: any): InventoryEntry[] {
  const rawInventory = Array.isArray(data?.inventory) ? data.inventory : [];
  const normalized: InventoryEntry[] = [];
  for (const entry of rawInventory) {
    const id = extractInventoryId(shop, entry);
    if (!id) continue;
    normalized.push({ id, name: extractInventoryName(shop, entry), raw: entry });
  }
  return normalized;
}

function updateShopInventoryCache(shop: ShopType, data: any): void {
  const normalized = normalizeInventory(shop, data);
  shopInventoryCache[shop] = normalized;
  shopInventoryLengths[shop] = normalized.length;
}

async function initShopInventoryWatchers(): Promise<void> {
  for (const shop of SHOP_TYPES) {
    const atom = SHOP_ATOMS[shop];
    if (!atom) continue;

    if (!shopInventoryInitStarted) return;
    try {
      updateShopInventoryCache(shop, await atom.get());
    } catch (error) {
      console.warn(`[TM] buyAll failed to fetch ${shop} inventory`, error);
    }

    if (!shopInventoryInitStarted) return;
    try {
      const unsub = await atom.onChange((next: any) => {
        updateShopInventoryCache(shop, next);
      });
      if (!shopInventoryInitStarted) {
        try {
          unsub();
        } catch (error) {
          console.warn(`[TM] buyAll failed to cancel stale ${shop} inventory watcher`, error);
        }
        return;
      }
      shopInventoryUnsubs[shop] = () => {
        try {
          unsub();
        } catch (err) {
          console.warn(`[TM] buyAll failed to unsubscribe ${shop} inventory`, err);
        }
      };
    } catch (error) {
      console.warn(`[TM] buyAll failed to subscribe to ${shop} inventory`, error);
    }
  }
}

function ensureShopInventories(): void {
  if (shopInventoryInitStarted) return;
  shopInventoryInitStarted = true;
  void initShopInventoryWatchers().catch((error) => {
    console.warn("[TM] buyAll inventory init error", error);
  });
}

function cleanupShopInventories(): void {
  for (const shop of SHOP_TYPES) {
    const unsub = shopInventoryUnsubs[shop];
    if (unsub) {
      try {
        unsub();
      } catch (error) {
        console.warn(`[TM] buyAll cleanup inventory failed (${shop})`, error);
      }
      shopInventoryUnsubs[shop] = null;
    }
    delete shopInventoryCache[shop];
    delete shopInventoryLengths[shop];
  }
  shopInventoryInitStarted = false;
}

function getInventoryEntry(shop: ShopType, index: number): InventoryEntry | null {
  const list = shopInventoryCache[shop];
  if (!list || index < 0 || index >= list.length) return null;
  return list[index] ?? null;
}

const DEFAULT_OVERRIDES: Partial<Record<ShopType, number>> = { tool: 3 };

const PURCHASE_FNS: Record<ShopType, (id: string) => Promise<void>> = {
  plant: (id: string) => PlayerService.purchaseSeed(id),
  egg:   (id: string) => PlayerService.purchaseEgg(id),
  tool:  (id: string) => PlayerService.purchaseTool(id),
  decor: (id: string) => PlayerService.purchaseDecor(id),
};

async function purchaseRemainingItems(
  shop: ShopType | null,
  itemId: string | null,
  remaining: number | null,
): Promise<void> {
  if (!shop || !itemId) return;

  const purchase = PURCHASE_FNS[shop];
  if (!purchase) return;

   const totalToBuy = typeof remaining === "number" ? Math.max(0, Math.floor(remaining)) : 0;
  if (totalToBuy <= 0) return;

  for (let bought = 0; bought < totalToBuy; bought += 1) {
    try {
      await purchase(itemId);
    } catch (error) {
      console.warn("[TM] buyAll purchase failed", { shop, itemId, attempt: bought + 1, error });
      break;
    }
  }
}

function getExpectedSizes(): Partial<Record<ShopType, number>> {
  const overrides = { ...DEFAULT_OVERRIDES, ...(window.BuyAllConfig?.countOverride ?? {}) };
  const sizes: Partial<Record<ShopType, number>> = {};
  for (const shop of SHOP_TYPES) {
    const cached = shopInventoryLengths[shop];
    if (typeof cached === "number") {
      sizes[shop] = cached;
    } else if (typeof overrides[shop] === "number") {
      sizes[shop] = overrides[shop];
    }
  }
  return sizes;
}

function detectShopByCount(total: number): ShopType | null {
  const sizes = getExpectedSizes();
  const matches = SHOP_TYPES.filter((t) => typeof sizes[t] === "number" && sizes[t] === total);
  return matches.length === 1 ? matches[0] : null;
}

// ——— number parsing (K/M/B/T + milliers) ———
function parseCompactNumber(s: string): number | undefined {
  if (!s) return undefined;

  const txt = s.replace(/\u00A0|\u202F/g, " ").trim();
  const re = /(\d{1,3}(?:[ \u00A0\u202F.,]\d{3})+|\d+(?:[.,]\d+)?)(\s*[kKmMbBtT])?/g;

  let m: RegExpExecArray | null;
  let lastNum: string | null = null;
  let lastSuf: string | null = null;

  while ((m = re.exec(txt))) {
    lastNum = m[1];
    lastSuf = (m[2] || "").trim().toUpperCase() || null;
  }
  if (!lastNum) return undefined;

  if (lastSuf) {
    const base = Number(lastNum.replace(/[ \u00A0\u202F]/g, "").replace(",", "."));
    if (!Number.isFinite(base)) return undefined;
    const mult =
      lastSuf === "K" ? 1e3 :
      lastSuf === "M" ? 1e6 :
      lastSuf === "B" ? 1e9 :
      lastSuf === "T" ? 1e12 : 1;
    return Math.round(base * mult);
  }

  const hasThousandsSep = /[ \u00A0\u202F.,]\d{3}/.test(lastNum);
  if (hasThousandsSep) {
    const val = Number(lastNum.replace(/[ \u00A0\u202F.,]/g, ""));
    return Number.isFinite(val) ? val : undefined;
  } else {
    const val = Number(lastNum.replace(",", "."));
    return Number.isFinite(val) ? Math.round(val) : undefined;
  }
}

// ——— notifier snapshots (shops + purchases) ———
let lastShops: ShopsSnapshot | null = null;
let lastPurchases: PurchasesSnapshot | null = null;
let shopsSubStarted = false;
let purchasesSubStarted = false;

function purchasedCountForId(
  id: string,
  purchases: PurchasesSnapshot | null | undefined
): number {
  if (!purchases) return 0;
  const [type, raw] = String(id).split(":") as ["Seed"|"Egg"|"Tool"|"Decor", string];

  const section =
    type === "Seed" ? purchases.seed :
    type === "Egg"  ? purchases.egg  :
    type === "Tool" ? purchases.tool : purchases.decor;

  if (!section || !section.purchases) return 0;
  const n = section.purchases[raw];
  return typeof n === "number" && n > 0 ? n : 0;
}

function toNotifierItemId(shop: ShopType | null, itemId: string | null): string | null {
  if (!shop || !itemId) return null;
  const raw = String(itemId);
  switch (shop) {
    case "plant": return `Seed:${raw}`;
    case "egg":   return `Egg:${raw}`;
    case "tool":  return `Tool:${raw}`;
    case "decor": return `Decor:${raw}`;
    default: return null;
  }
}

function ensureNotifierSnapshots(): void {
  if (!shopsSubStarted) {
    shopsSubStarted = true;
    NotifierService.onShopsChangeNow((snap) => {
      lastShops = snap;
    }).catch((err) => {
      shopsSubStarted = false;
      console.warn("[TM] buyAll notifier shops subscription failed", err);
    });
  }

  if (!purchasesSubStarted) {
    purchasesSubStarted = true;
    NotifierService.onPurchasesChangeNow((snap) => {
      lastPurchases = snap;
    }).catch((err) => {
      purchasesSubStarted = false;
      console.warn("[TM] buyAll notifier purchases subscription failed", err);
    });
  }
}

function extractInitialStock(shop: ShopType | null, rawId: string | null): { initialStock: number | null; canSpawn: boolean } {
  if (!shop || !rawId || !lastShops) return { initialStock: null, canSpawn: false };

  const byShop =
    shop === "plant" ? lastShops.seed?.inventory ?? [] :
    shop === "egg"   ? lastShops.egg?.inventory ?? []  :
    shop === "tool"  ? lastShops.tool?.inventory ?? [] :
                       lastShops.decor?.inventory ?? [];

  const match = byShop.find((entry: any) => {
    if (!entry) return false;
    if (shop === "plant") return String(entry.species) === rawId;
    if (shop === "egg")   return String(entry.eggId) === rawId;
    if (shop === "tool")  return String(entry.toolId) === rawId;
    return String(entry.decorId) === rawId;
  });

  if (!match) return { initialStock: null, canSpawn: false };

  const initial = Number(match.initialStock);
  const normalized = Number.isFinite(initial) ? initial : null;
  const canSpawn = !!match.canSpawnHere;
  return { initialStock: normalized, canSpawn };
}

function getRemainingDetails(shop: ShopType | null, itemId: string | null): RemainingDetails {
  const notifierItemId = toNotifierItemId(shop, itemId);
  if (!notifierItemId) {
    return { notifierItemId: null, initialStock: null, purchased: null, remaining: null };
  }

  const rawId = notifierItemId.split(":")[1] ?? null;
  const { initialStock, canSpawn } = extractInitialStock(shop, rawId);

  if (initialStock == null) {
    return { notifierItemId, initialStock, purchased: null, remaining: null };
  }

  if (!canSpawn) {
    return { notifierItemId, initialStock, purchased: null, remaining: 0 };
  }

  const purchased = purchasedCountForId(notifierItemId, lastPurchases);
  const remaining = Math.max(0, initialStock - purchased);
  return { notifierItemId, initialStock, purchased, remaining };
}

// ——— état disabled : si l’item contient .chakra-text.css-fcn4vq ———
function isItemDisabled(itemEl: Element | null): boolean {
  if (!itemEl) return false;
  return !!itemEl.querySelector(".chakra-text.css-fcn4vq");
}

// ——— DOM utils ———
function getListItems(listRoot: Element): Element[] {
  const direct = listRoot.querySelectorAll(`:scope > ${ITEM_SELECTOR}`);
  if (direct.length) return Array.from(direct);
  return Array.from(listRoot.querySelectorAll(ITEM_SELECTOR));
}

function parsePriceFromButton(btn: Element | null): number | undefined {
  if (!btn) return undefined;
  const label = btn.querySelector(".css-1uduba2") as HTMLElement | null;
  const raw = (label?.innerText ?? btn.textContent ?? "").trim();
  return parseCompactNumber(raw);
}

function findRowForItem(itemEl: Element): Element | null {
  const bySelector = itemEl.querySelector(ROW_SELECTOR);
  if (bySelector) return bySelector as Element;
  const any = Array.from(itemEl.querySelectorAll("div"))
    .find((d) => d.querySelectorAll("button.chakra-button").length >= 2);
  return (any as Element) ?? null;
}

/** Style global : palette bleue + états hover/focus + état disabled GRIS précis */
function ensureGlobalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
    .${BTN_CLASS}{
      background: var(--chakra-colors-Blue-Magic, #0067B4) !important;
      border-color: var(--chakra-colors-Blue-Dark, #264093) !important;
      color: #fff !important;
      border-width: 2px;
      border-radius: 5px;
      text-transform: uppercase;
      height: 40px;
      padding-inline: 24px;
      padding-top: 12px;
      padding-bottom: 12px;
      width: 100%;
    }
    .${BTN_CLASS}:hover{
      background: var(--chakra-colors-Blue-Light, #48ADF4) !important;
      border-color: var(--chakra-colors-Blue-Magic, #0067B4) !important;
    }
    .${BTN_CLASS}:focus-visible{
      outline: transparent solid 2px;
      outline-offset: 2px;
      box-shadow: var(--chakra-ring-offset-shadow, 0 0 #0000),
                  var(--chakra-ring-shadow, 0 0 #0000),
                  0 0 0 3px var(--chakra-ring-color, rgba(66,153,225,0.6));
    }
    /* État disabled : couleurs/gris EXACTES demandées + blocage du hover */
    .${BTN_CLASS}[disabled],
    .${BTN_CLASS}[aria-disabled="true"]{
      background: var(--chakra-colors-Neutral-Grey) !important;
      border-color: var(--chakra-colors-Neutral-EarlGrey) !important;
      color: var(--chakra-colors-Neutral-EarlGrey) !important;
      opacity: 0.7 !important;
      cursor: not-allowed !important;
      box-shadow: none !important;
      pointer-events: none; /* pour l’aria-disabled éventuel */
    }
    .${BTN_CLASS}[disabled]:hover,
    .${BTN_CLASS}[disabled]:focus,
    .${BTN_CLASS}[aria-disabled="true"]:hover,
    .${BTN_CLASS}[aria-disabled="true"]:focus{
      background: var(--chakra-colors-Neutral-Grey) !important;
      border-color: var(--chakra-colors-Neutral-EarlGrey) !important;
      color: var(--chakra-colors-Neutral-EarlGrey) !important;
      box-shadow: none !important;
    }
  `.trim();

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ——— UI ———
function createButton(templateBtn?: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";

  // Copie les classes Chakra du 1er bouton et ajoute notre classe
  if (templateBtn?.className) {
    const classes = `${templateBtn.className} ${BTN_CLASS}`
      .replace(new RegExp(`\\b${BTN_CLASS}\\b`, "g"), "")
      .trim();
    btn.className = `${classes} ${BTN_CLASS}`.trim();
  } else {
    btn.className = `chakra-button ${BTN_CLASS}`;
  }

  const flex = document.createElement("div");
  flex.className = "McFlex css-1fxg3mj";
  const label = document.createElement("span");
  label.className = "css-1uduba2";
  label.textContent = "Buy all";
  flex.appendChild(label);
  btn.appendChild(flex);

  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    if ((btn as HTMLButtonElement).disabled) return;

    const itemEl   = btn.closest(ITEM_SELECTOR) as Element | null;
    const listRoot = (itemEl?.closest(LIST_SELECTOR) as Element | null) || document.body;

    const items = getListItems(listRoot);
    const total = items.length;

    const attrIndex = itemEl?.getAttribute(INDEX_ATTR);
    let idx0 =
      attrIndex != null && attrIndex !== ""
        ? Number.parseInt(attrIndex, 10)
        : -1;
    if (!Number.isFinite(idx0) || idx0 < 0) {
      idx0 = itemEl ? items.indexOf(itemEl) : -1;
    }
    const idx1 = idx0 >= 0 ? idx0 + 1 : -1;

    const shop = detectShopByCount(total);

    let itemId: string | null = null;
    let itemName: string | null = null;
    let reason: "coin+credit" | "coin" | "credit" | "index" | "inventory" | "none" = "none";
    let coinParsed: number | undefined;
    let creditParsed: number | undefined;

    if (shop && itemEl) {
      const row = findRowForItem(itemEl);
      if (row) {
        const me = btn as HTMLElement;
        const coinBtn   = me.previousElementSibling as Element | null;
        const creditBtn = me.nextElementSibling as Element | null;
        coinParsed   = parsePriceFromButton(coinBtn);
        creditParsed = parsePriceFromButton(creditBtn);
        const inventoryEntry = idx0 >= 0 ? getInventoryEntry(shop, idx0) : null;
        if (inventoryEntry) {
          itemId = inventoryEntry.id;
          itemName = inventoryEntry.name ?? inventoryEntry.id;
          reason = "inventory";
        } else if (idx0 >= 0 && typeof coinParsed === "number" && typeof creditParsed === "number") {
          reason = "index";
        }
      }
    }

    const remainingDetails = getRemainingDetails(shop ?? null, itemId);
    void purchaseRemainingItems(shop, itemId, remainingDetails.remaining);

    window.dispatchEvent(new CustomEvent("tm:buyAll", {
      detail: {
        index1: idx1,
        index0: idx0,
        total,
        shopType: shop,
        itemId,
        itemName,
        reason,
        coin: coinParsed,
        credit: creditParsed,
        element: itemEl,
        remaining: remainingDetails.remaining,
        notifierItemId: remainingDetails.notifierItemId,
      },
    }));
  });

  return btn;
}

function insertIntoItem(itemEl: Element): void {
  const listRoot = itemEl.closest(LIST_SELECTOR) as Element | null;
  if (listRoot && !itemEl.hasAttribute(INDEX_ATTR)) {
    const items = getListItems(listRoot);
    const idx = items.indexOf(itemEl);
    if (idx >= 0) {
      itemEl.setAttribute(INDEX_ATTR, String(idx));
    }
  }

  const row =
    (itemEl.querySelector(ROW_SELECTOR) as Element | null) ||
    (Array.from(itemEl.querySelectorAll("div"))
      .find((d) => d.querySelectorAll("button.chakra-button").length >= 2) as Element | null);

  if (!row) return;

  const btns = row.querySelectorAll("button.chakra-button");
  if (btns.length < 2) return;

  let middle = row.querySelector(`button.${BTN_CLASS}`) as HTMLButtonElement | null;
  if (!middle) {
    middle = createButton(btns[0] as HTMLElement);
    row.insertBefore(middle, btns[1]);
  }

  const disabled = isItemDisabled(itemEl);
  middle.disabled = disabled;
  middle.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll(ITEM_SELECTOR).forEach(insertIntoItem);
}

// ——— bootstrap + interval + API ———
let observer: MutationObserver | null = null;
let intervalId: number | null = null;

export function setupBuyAll(): void {
  ensureGlobalStyles();
  ensureNotifierSnapshots();
  ensureShopInventories();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan());
  } else {
    scan();
  }

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.matches(ITEM_SELECTOR)) insertIntoItem(n);
        n.querySelectorAll?.(ITEM_SELECTOR).forEach(insertIntoItem);
      }
    }
  });

  const startObserver = () => observer!.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();

  startRescan();
}

export function startRescan(): void {
  if (intervalId != null) return;
  intervalId = window.setInterval(() => scan(), RESCAN_MS);
}

export function stopRescan(): void {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

export function teardownBuyAll(): void {
  stopRescan();
  if (observer) { observer.disconnect(); observer = null; }
  cleanupShopInventories();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopRescan();
  else if (observer) startRescan();
});



/*=============================   REORDER SHOP   ======================= */

/**
 * Reorder Observer — Magic* lists
 * Remonte en haut les items contenant FLAG_SEL à l'intérieur de chaque conteneur CONTAINER_SEL.
 * - Tri stable (conserve l'ordre relatif intra-groupes)
 * - Batching via rAF
 * - Hooks SPA optionnels (pushState/replaceState/popstate)
 *
 * Exemple d'usage :
 *   import { startReorderObserver } from './reorderObserver';
 *   const ctrl = startReorderObserver({ log: true });
 *   // ... plus tard ...
 *   ctrl.stop();
 */

export interface StartOptions {
  /** Sélecteur du conteneur qui regroupe les items */
  containerSelector?: string; // default: '.McFlex.css-1lfov12'
  /** Sélecteur d'un item (candidat au réordonnancement) */
  itemSelector?: string;      // default: '.McFlex.css-1kkwxjt'
  /** Sélecteur du marqueur de priorité recherché en descendant des items */
  flagSelector?: string;      // default: '.chakra-text.css-rlkzj4'
  /** Nœud racine où chercher les conteneurs (document par défaut) */
  root?: ParentNode;
  /** Si true, on ré-exécute sur navigation SPA (history.* / popstate) */
  observeHistory?: boolean;   // default: true
  /** Si true ou fonction, active un logging léger */
  log?: boolean | ((...args: unknown[]) => void);
  /**
   * Si true, on privilégie strictement les enfants directs (":scope > sel").
   * Si false (défaut), on tente enfants directs sinon on retombe sur "descendants".
   */
  preferDirectChildren?: boolean; // default: false
}

export interface ReorderController {
  /** Arrête l'observateur et les hooks d'historique (le cas échéant) */
  stop(): void;
  /** Déclenche un passage manuel (réordonne immédiatement en batch via rAF) */
  runOnce(): void;
  /** Indique si l'observateur est actif */
  isRunning(): boolean;
}

/** Valeurs par défaut des sélecteurs */
export const DEFAULTS = {
  containerSelector: '.McFlex.css-1lfov12',
  itemSelector: '.McFlex.css-1kkwxjt',
  flagSelector: '.chakra-text.css-rlkzj4',
} as const;

/** Lance un passage unique de réordonnancement, sans installer d'observer */
export function reorderAll(options: Omit<StartOptions, 'observeHistory' | 'log' | 'preferDirectChildren'> = {}): void {
  if (!isBrowser()) return;
  const containerSel = options.containerSelector ?? DEFAULTS.containerSelector;
  const itemSel = options.itemSelector ?? DEFAULTS.itemSelector;
  const flagSel = options.flagSelector ?? DEFAULTS.flagSelector;
  const root: ParentNode = options.root ?? document;

  const containers = queryAll(root, containerSel);
  for (const c of containers) {
    reorderContainer(c, itemSel, flagSel, /*preferDirectChildren*/ false);
  }
}

/** Démarre l'observateur de mutations + (optionnel) hooks d'historique SPA */
export function startReorderObserver(options: StartOptions = {}): ReorderController {
  if (!isBrowser()) {
    // On renvoie un contrôleur no-op pour SSR / tests
    return {
      stop() {},
      runOnce() {},
      isRunning() { return false; },
    };
  }

  const CONTAINER_SEL = options.containerSelector ?? DEFAULTS.containerSelector;
  const ITEM_SEL = options.itemSelector ?? DEFAULTS.itemSelector;
  const FLAG_SEL = options.flagSelector ?? DEFAULTS.flagSelector;
  const ROOT: ParentNode = options.root ?? document;
  const OBSERVE_HISTORY = options.observeHistory ?? true;
  const PREFER_DIRECT = options.preferDirectChildren ?? false;

  const logger: (...args: unknown[]) => void =
    typeof options.log === 'function'
      ? options.log
      : options.log
      ? (...args: unknown[]) => console.debug('[ReorderObserver]', ...args)
      : () => {};

  let running = true;
  let pending = false;

  function processAll(): void {
    if (!running || pending) return;
    pending = true;

    requestAnimationFrame(() => {
      try {
        const containers = queryAll(ROOT, CONTAINER_SEL);
        for (const c of containers) {
          reorderContainer(c, ITEM_SEL, FLAG_SEL, PREFER_DIRECT);
        }
      } finally {
        pending = false;
      }
    });
  }

  // --- MutationObserver ---
  const observeTarget: Node =
    (ROOT as Document).documentElement ?? (ROOT as unknown as Node);

  const mo = new MutationObserver(processAll);
  mo.observe(observeTarget, { childList: true, subtree: true });

  // Premier passage
  processAll();

  // --- Hooks d'historique (SPA) ---
  let unhookHistory: (() => void) | null = null;

  if (OBSERVE_HISTORY) {
    const { unhook } = hookHistory(processAll);
    unhookHistory = unhook;
  }

  const controller: ReorderController = {
    stop() {
      if (!running) return;
      running = false;
      mo.disconnect();
      unhookHistory?.();
      unhookHistory = null;
      logger('Stopped.');
    },
    runOnce() {
      processAll();
    },
    isRunning() {
      return running;
    },
  };

  return controller;
}

/* ======================== Impl. helpers ======================== */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function queryAll(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

function supportsScope(): boolean {
  try {
    document.querySelector(':scope');
    return true;
  } catch {
    return false;
  }
}

function childrenOrDescendants(container: Element, itemSel: string): Element[] {
  // Essaye ":scope > sel" si supporté, sinon fallback descendants
  if (supportsScope()) {
    const direct = Array.from(container.querySelectorAll(`:scope > ${itemSel}`));
    if (direct.length > 0) return direct;
  }
  return Array.from(container.querySelectorAll(itemSel));
}

/**
 * Réordonne un conteneur donné :
 * - Partitionne les items en [withFlag, withoutFlag] en gardant l'ordre relatif
 * - Si nécessaire, replace les nœuds (DocumentFragment) pour remonter withFlag
 */
function reorderContainer(
  container: Element,
  itemSel: string,
  flagSel: string,
  preferDirectChildren: boolean
): void {
  const items = preferDirectChildren
    ? Array.from(container.children).filter((n): n is Element => n instanceof Element && n.matches(itemSel))
    : childrenOrDescendants(container, itemSel);

  if (items.length === 0) return;

  const withFlag: Element[] = [];
  const withoutFlag: Element[] = [];

  for (const el of items) {
    (el.querySelector(flagSel) ? withFlag : withoutFlag).push(el);
  }
  if (withFlag.length === 0) return;

  // Vérifie si déjà trié : tous les withFlag en premier sans interleaving
  let seenRest = false;
  for (const el of items) {
    const flagged = !!el.querySelector(flagSel);
    if (!flagged) seenRest = true;
    else if (seenRest) { // un prioritaire après un non-prioritaire => pas trié
      // On réordonne et on sort
      const frag = document.createDocumentFragment();
      for (const e of withFlag) frag.appendChild(e);
      for (const e of withoutFlag) frag.appendChild(e);
      container.appendChild(frag);
      return;
    }
  }
  // Si on arrive ici, l'ordre était déjà bon -> no-op
}

/**
 * Installe des hooks d'historique pour relancer le tri sur navigations SPA.
 * Retourne une fonction `unhook()` pour restaurer l'état initial.
 */
function hookHistory(onNavigate: () => void): { unhook: () => void } {
  const origPush = history.pushState?.bind(history);
  const origReplace = history.replaceState?.bind(history);

  function wrap<T extends (...a: any[]) => any>(fn?: T): T | undefined {
    if (!fn) return fn;
    const wrapped = function (this: unknown, ...args: Parameters<T>) {
      const ret = fn.apply(this, args as any);
      onNavigate();
      return ret;
    } as T;
    return wrapped;
  }

  const onPop = () => onNavigate();

  if (origPush) history.pushState = wrap(origPush)!;
  if (origReplace) history.replaceState = wrap(origReplace)!;
  window.addEventListener('popstate', onPop);

  return {
    unhook() {
      if (origPush) history.pushState = origPush;
      if (origReplace) history.replaceState = origReplace;
      window.removeEventListener('popstate', onPop);
    },
  };
}
