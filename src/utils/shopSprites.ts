import { Sprites } from "../core/sprite";
import { loadTileSheet, uniqueBases, clearTileSheetCache } from "./tileSheet"
import { ensureSpritesReady } from "../services/assetManifest";
import {
  plantCatalog,
  eggCatalog,
  toolCatalog,
  decorCatalog,
} from "../data/hardcoded-data.clean";

export type ShopSpriteType = "Seed" | "Egg" | "Tool" | "Decor" | "Crop";

export interface ShopSpriteOptions {
  size?: number;
  fallback?: string;
  alt?: string;
}

type SpriteConfig = {
  size: number;
  fallback: string;
  alt: string;
};

type SpriteKey = `${ShopSpriteType}::${string}`;

const spriteConfig = new WeakMap<HTMLSpanElement, SpriteConfig>();
const spriteSubscribers = new Map<SpriteKey, Set<HTMLSpanElement>>();
const spriteCache = new Map<SpriteKey, string | null>();
const spritePromises = new Map<SpriteKey, Promise<string | null>>();

const MAX_CONCURRENT_SPRITE_LOADS = 4;
let activeSpriteLoads = 0;
const pendingSpriteLoads: Array<() => void> = [];

function enqueueSpriteLoad(task: () => Promise<string | null>): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const runner = () => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeSpriteLoads--;
          const next = pendingSpriteLoads.shift();
          if (next) {
            activeSpriteLoads++;
            next();
          }
        });
    };

    if (activeSpriteLoads < MAX_CONCURRENT_SPRITE_LOADS) {
      activeSpriteLoads++;
      runner();
    } else {
      pendingSpriteLoads.push(runner);
    }
  });
}

let listenerAttached = false;

let seedSheetBases: string[] | null = null;
let eggSheetBases: string[] | null = null;
let itemSheetBases: string[] | null = null;
let decorSheetBases: string[] | null = null;
let cropSheetBases: string[] | null = null;
let tallCropSheetBases: string[] | null = null;

const FALLBACK_BASES: Record<ShopSpriteType, string[]> = {
  Seed: ["seeds", "Seeds"],
  Egg: ["pets", "Pets", "eggs", "Eggs"],
  Tool: ["items", "Items"],
  Decor: ["decor", "Decor"],
  Crop: ["plants", "Plants", "allplants", "AllPlants"],
};

function spriteKey(type: ShopSpriteType, id: string): SpriteKey {
  return `${type}::${id}` as SpriteKey;
}

function parseSpriteKey(key: SpriteKey): { type: ShopSpriteType; id: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0) return null;
  const type = key.slice(0, idx) as ShopSpriteType;
  const id = key.slice(idx + 2);
  if (!id) return null;
  if (type !== "Seed" && type !== "Egg" && type !== "Tool" && type !== "Decor") return null;
  return { type, id };
}

function defaultFallback(type: ShopSpriteType): string {
  switch (type) {
    case "Seed": return "🌱";
    case "Egg": return "🥚";
    case "Tool": return "🧰";
    case "Decor": return "🏠";
    case "Crop": return "🍎";
  }
}

function getSeedSheetBases(): string[] {
  if (seedSheetBases) return seedSheetBases;
  try {
    if (typeof Sprites.listSeeds === "function") {
      seedSheetBases = uniqueBases(Sprites.listSeeds(), FALLBACK_BASES.Seed);
      return seedSheetBases;
    }
  } catch { /* ignore */ }
  seedSheetBases = [...FALLBACK_BASES.Seed];
  return seedSheetBases;
}

function getEggSheetBases(): string[] {
  if (eggSheetBases) return eggSheetBases;
  try {
    if (typeof Sprites.listPets === "function") {
      eggSheetBases = uniqueBases(Sprites.listPets(), FALLBACK_BASES.Egg);
      return eggSheetBases;
    }
  } catch { /* ignore */ }
  eggSheetBases = [...FALLBACK_BASES.Egg];
  return eggSheetBases;
}

function getItemSheetBases(): string[] {
  if (itemSheetBases) return itemSheetBases;
  try {
    if (typeof Sprites.listItems === "function") {
      itemSheetBases = uniqueBases(Sprites.listItems(), FALLBACK_BASES.Tool);
      return itemSheetBases;
    }
  } catch { /* ignore */ }
  itemSheetBases = [...FALLBACK_BASES.Tool];
  return itemSheetBases;
}

function getDecorSheetBases(): string[] {
  if (decorSheetBases) return decorSheetBases;
  try {
    if (typeof Sprites.listTilesByCategory === "function") {
      decorSheetBases = uniqueBases(Sprites.listTilesByCategory(/decor/i), FALLBACK_BASES.Decor);
      return decorSheetBases;
    }
  } catch { /* ignore */ }
  decorSheetBases = [...FALLBACK_BASES.Decor];
  return decorSheetBases;
}

function getCropSheetBases(): string[] {
  if (cropSheetBases) return cropSheetBases;
  try {
    if (typeof Sprites.listTilesByCategory === "function") {
      const all = Sprites.listTilesByCategory(/plants|allplants/i);
      const filtered = all.filter((u) => !/tallplants/i.test(u) && !/tall/i.test(u));
      const source = filtered.length ? filtered : all;
      cropSheetBases = uniqueBases(source, FALLBACK_BASES.Crop);
      return cropSheetBases;
    }
  } catch { /* ignore */ }
  cropSheetBases = [...FALLBACK_BASES.Crop];
  return cropSheetBases;
}

function getTallCropSheetBases(): string[] {
  if (tallCropSheetBases) return tallCropSheetBases;
  try {
    if (typeof Sprites.listTilesByCategory === "function") {
      const all = Sprites.listTilesByCategory(/tallplants/i);
      tallCropSheetBases = uniqueBases(all, ["tallplants", "TallPlants"]);
      return tallCropSheetBases;
    }
  } catch { /* ignore */ }
  tallCropSheetBases = ["tallplants", "TallPlants"];
  return tallCropSheetBases;
}

const TALL_CROP_SPECIES = new Set<string>(["Cactus", "Bamboo"]);

function getBases(type: ShopSpriteType, id?: string): string[] {
  switch (type) {
    case "Seed": return getSeedSheetBases();
    case "Egg": return getEggSheetBases();
    case "Tool": return getItemSheetBases();
    case "Decor": return getDecorSheetBases();
    case "Crop":
      if (id && TALL_CROP_SPECIES.has(id)) {
        return [...getTallCropSheetBases(), ...getCropSheetBases()];
      }
      return getCropSheetBases();
  }
}

function toTileIndex(tileRef: unknown): number | null {
  if (tileRef == null) return null;
  const value = typeof tileRef === "number" && Number.isFinite(tileRef)
    ? tileRef
    : Number(tileRef);
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return value;
  return value - 1;
}

function getTileRef(type: ShopSpriteType, id: string): unknown {
  switch (type) {
    case "Seed": return (plantCatalog as Record<string, any>)?.[id]?.seed?.tileRef ?? null;
    case "Egg": return (eggCatalog as Record<string, any>)?.[id]?.tileRef ?? null;
    case "Tool": return (toolCatalog as Record<string, any>)?.[id]?.tileRef ?? null;
    case "Decor": return (decorCatalog as Record<string, any>)?.[id]?.tileRef ?? null;
    case "Crop": return (plantCatalog as Record<string, any>)?.[id]?.crop?.tileRef ?? null;
  }
}

function subscribeSprite(key: SpriteKey, el: HTMLSpanElement): void {
  let subs = spriteSubscribers.get(key);
  if (!subs) {
    subs = new Set();
    spriteSubscribers.set(key, subs);
  }
  subs.add(el);
}

function unsubscribeIfDisconnected(key: SpriteKey, el: HTMLSpanElement): void {
  const subs = spriteSubscribers.get(key);
  if (!subs) return;
  if (!el.isConnected) {
    subs.delete(el);
    spriteConfig.delete(el);
  }
  if (subs.size === 0) {
    spriteSubscribers.delete(key);
  }
}

function applySprite(el: HTMLSpanElement, src: string | null): void {
  const cfg = spriteConfig.get(el);
  if (!cfg) return;
  const { size, fallback, alt } = cfg;

  el.innerHTML = "";
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.flexShrink = "0";
  el.style.position = "relative";
  el.setAttribute("role", "img");

  if (src) {
    el.removeAttribute("aria-label");
    el.style.fontSize = "";
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.decoding = "async";
    (img as any).loading = "lazy";
    img.draggable = false;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    el.appendChild(img);
  } else {
    el.textContent = fallback;
    el.style.fontSize = `${Math.max(10, Math.round(size * 0.72))}px`;
    el.setAttribute("aria-label", alt || fallback);
  }
}

function notifySpriteSubscribers(key: SpriteKey, src: string | null): void {
  const subs = spriteSubscribers.get(key);
  if (!subs) return;
  subs.forEach((el) => {
    if (!el.isConnected) {
      unsubscribeIfDisconnected(key, el);
      return;
    }
    applySprite(el, src);
  });
}

function clearSheetCaches(): void {
  seedSheetBases = null;
  eggSheetBases = null;
  itemSheetBases = null;
  decorSheetBases = null;
  cropSheetBases = null;
  tallCropSheetBases = null;
  clearTileSheetCache();
}

async function fetchSprite(type: ShopSpriteType, id: string): Promise<string | null> {
  await ensureSpritesReady();

  if (typeof window === "undefined") return null;
  if (typeof (Sprites as any)?.getTile !== "function") return null;

  const tileRef = getTileRef(type, id);
  const index = toTileIndex(tileRef);
  if (index == null) return null;

  const bases = getBases(type, id);
  for (const base of bases) {
    try {
      const tiles = await loadTileSheet(base);
      const tile = tiles.find((t) => t.index === index);
      const canvas = tile?.data as HTMLCanvasElement | undefined;
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) continue;
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext("2d");
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0);
      return copy.toDataURL();
    } catch {
      /* ignore */
    }
  }

  return null;
}

function ensureSpriteListener(): void {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("mg:sprite-detected", () => {
    spriteCache.clear();
    spritePromises.clear();
    clearSheetCaches();
    const keys = Array.from(spriteSubscribers.keys());
    keys.forEach((key) => {
      const parsed = parseSpriteKey(key);
      if (!parsed) return;
      void loadSprite(parsed.type, parsed.id, key);
    });
  });
}

function loadSprite(type: ShopSpriteType, id: string, key: SpriteKey = spriteKey(type, id)): Promise<string | null> {
  if (typeof window === "undefined") {
    spriteCache.set(key, null);
    notifySpriteSubscribers(key, null);
    return Promise.resolve(null);
  }

  const cached = spriteCache.get(key);
  if (cached !== undefined) {
    notifySpriteSubscribers(key, cached);
    return Promise.resolve(cached);
  }

  const inflight = spritePromises.get(key);
  if (inflight) return inflight;

  const promise = enqueueSpriteLoad(() => fetchSprite(type, id))
    .then((src) => {
      spriteCache.set(key, src);
      spritePromises.delete(key);
      notifySpriteSubscribers(key, src);
      return src;
    })
    .catch(() => {
      spritePromises.delete(key);
      return null;
    });

  spritePromises.set(key, promise);
  return promise;
}

export function prefetchShopSprite(type: ShopSpriteType, id: string): Promise<string | null> {
  return loadSprite(type, id);
}

export function createShopSprite(type: ShopSpriteType, id: string, options: ShopSpriteOptions = {}): HTMLSpanElement {
  const size = Math.max(12, options.size ?? 36);
  const fallback = String(options.fallback ?? defaultFallback(type));
  const alt = typeof options.alt === "string" ? options.alt : "";

  const el = document.createElement("span");
  spriteConfig.set(el, { size, fallback, alt });

  if (typeof window === "undefined") {
    applySprite(el, null);
    return el;
  }

  const key = spriteKey(type, id);
  subscribeSprite(key, el);
  applySprite(el, spriteCache.get(key) ?? null);
  ensureSpriteListener();
  void loadSprite(type, id, key);
  return el;
}
