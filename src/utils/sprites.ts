import { Sprites } from "../core/sprite";
import { loadTileSheet, uniqueBases, clearTileSheetCache, normalizeSheetBase } from "./tileSheet";
import { ensureSpritesReady } from "../services/assetManifest";
import {
  plantCatalog,
  eggCatalog,
  toolCatalog,
  decorCatalog,
  tileRefsAnimations,
  petCatalog,
} from "../data/hardcoded-data.clean";
import { pageWindow } from "./page-context";

export type ShopSpriteType = "Seed" | "Egg" | "Tool" | "Decor" | "Crop";

export interface ShopSpriteOptions {
  size?: number;
  fallback?: string;
  alt?: string;
}

export interface ShopSpriteBatchOptions {
  batchSize?: number;
  delayMs?: number;
  threshold?: number;
  force?: boolean;
  enabled?: boolean;
}

type SpriteConfig = {
  size: number;
  fallback: string;
  alt: string;
};

type SpriteKey = `${ShopSpriteType}::${string}`;

const spriteConfig = new WeakMap<HTMLSpanElement, SpriteConfig>();
const spriteSubscribers = new Map<SpriteKey, Set<HTMLSpanElement>>();
type SpritePayload = string | null;
type SpriteCacheEntry = { payload: SpritePayload; createdAt: number };
const spriteCache = new Map<SpriteKey, SpriteCacheEntry>();
const spritePromises = new Map<SpriteKey, Promise<SpritePayload>>();

type NormalizedShopSpriteOptions = Required<Pick<ShopSpriteOptions, "size" | "fallback" | "alt">>;

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

type PlantCatalogEntry = {
  seed?: { tileRef?: unknown };
  crop?: { tileRef?: unknown };
};

const plantCatalogLookup = plantCatalog as Record<string, PlantCatalogEntry>;


const FALLBACK_BASES: Record<ShopSpriteType, string[]> = {
  Seed: ["seeds"],
  Egg: ["pets"],
  Tool: ["items"],
  Decor: ["decor"],
  Crop: ["plants"],
};

const baseCache: Partial<Record<ShopSpriteType, string[]>> = {};
let tallCropSheetBases: string[] | null = null;

const computeBases = (provider: () => string[] | null | undefined, fallback: string[]): string[] => {
  try {
    const list = provider() ?? [];
    return uniqueBases(list, fallback);
  } catch {
    return [...fallback];
  }
};

const LIST_PROVIDERS: Partial<Record<Exclude<ShopSpriteType, "Crop">, () => string[]>> = {
  Seed: () => (typeof Sprites.listSeeds === "function" ? Sprites.listSeeds() : []),
  Egg: () => (typeof Sprites.listPets === "function" ? Sprites.listPets() : []),
  Tool: () => (typeof Sprites.listItems === "function" ? Sprites.listItems() : []),
  Decor: () => (typeof Sprites.listTilesByCategory === "function"
    ? Sprites.listTilesByCategory(/decor/i)
    : []),
};

const TALL_CROP_SPECIES = new Set<string>(["Cactus", "Bamboo"]);

const SHOP_SPRITE_ID_BUILDERS: Record<ShopSpriteType, () => string[]> = {
  Seed: () => Object.keys(plantCatalogLookup).filter((id) => Boolean(plantCatalogLookup[id]?.seed?.tileRef)),
  Crop: () => Object.keys(plantCatalogLookup).filter((id) => Boolean(plantCatalogLookup[id]?.crop?.tileRef)),
  Egg: () => Object.keys(eggCatalog),
  Tool: () => Object.keys(toolCatalog),
  Decor: () => Object.keys(decorCatalog),
};

const warmupIdCache: Partial<Record<ShopSpriteType, string[]>> = {};

function getShopSpriteWarmupIds(type: ShopSpriteType): string[] {
  const cached = warmupIdCache[type];
  if (cached) return cached;
  const builder = SHOP_SPRITE_ID_BUILDERS[type];
  if (!builder) return [];
  const ids = builder().filter((id) => typeof id === "string" && id.length > 0);
  warmupIdCache[type] = ids;
  return ids;
}

function spriteKey(type: ShopSpriteType, id: string): SpriteKey {
  return `${type}::${id}` as SpriteKey;
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

function getCropBases(): string[] {
  if (baseCache.Crop) return baseCache.Crop;
  const provider = () => {
    if (typeof Sprites.listTilesByCategory !== "function") return [];
    const all = Sprites.listTilesByCategory(/plants|allplants/i);
    const filtered = all.filter((u) => !/tallplants/i.test(u) && !/tall/i.test(u));
    return filtered.length ? filtered : all;
  };
  const bases = computeBases(provider, FALLBACK_BASES.Crop);
  baseCache.Crop = bases;
  return bases;
}

function getTallCropBases(): string[] {
  if (tallCropSheetBases) return tallCropSheetBases;
  const provider = () => {
    if (typeof Sprites.listTilesByCategory !== "function") return [];
    return Sprites.listTilesByCategory(/tallplants/i);
  };
  tallCropSheetBases = computeBases(provider, ["tallplants", "TallPlants"]);
  return tallCropSheetBases;
}

function getBases(type: ShopSpriteType, id?: string): string[] {
  if (type === "Crop") {
    const bases = getCropBases();
    if (id && TALL_CROP_SPECIES.has(id)) {
      return [...getTallCropBases(), ...bases];
    }
    return bases;
  }
  if (baseCache[type]) return baseCache[type]!;
  const builder = LIST_PROVIDERS[type];
  const fallback = FALLBACK_BASES[type];
  const bases = builder ? computeBases(builder, fallback) : [...fallback];
  baseCache[type] = bases;
  return bases;
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

function applySprite(el: HTMLSpanElement, src: SpritePayload): void {
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

function notifySpriteSubscribers(key: SpriteKey, src: SpritePayload): void {
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

async function fetchSprite(type: ShopSpriteType, id: string): Promise<SpritePayload> {
  await ensureSpritesReady();

  if (typeof pageWindow === "undefined") return null;
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
      const dataUrl = canvas.toDataURL();
      return dataUrl;
    } catch (error) {
      /* ignore */
    }
  }

  return null;
}


function loadSprite(type: ShopSpriteType, id: string, key: SpriteKey = spriteKey(type, id)): Promise<SpritePayload> {
  if (typeof pageWindow === "undefined") {
    spriteCache.set(key, { payload: null, createdAt: nowMs() });
    notifySpriteSubscribers(key, null);
    return Promise.resolve(null);
  }

  const cached = spriteCache.get(key);
  if (cached !== undefined) {
    notifySpriteSubscribers(key, cached.payload);
    return Promise.resolve(cached.payload);
  }

  const inflight = spritePromises.get(key);
  if (inflight) return inflight;

  const promise = fetchSprite(type, id)
    .then((src) => {
      spriteCache.set(key, { payload: src, createdAt: nowMs() });
      spritePromises.delete(key);
      return src;
    })
    .catch(() => {
      spritePromises.delete(key);
      return null;
    });

  spritePromises.set(key, promise);
  return promise;
}

export function prefetchShopSprite(type: ShopSpriteType, id: string): Promise<SpritePayload> {
  const key = spriteKey(type, id);
  return loadSprite(type, id, key);
}

type ShopSpriteWarmupLimitConfig = number | Partial<Record<ShopSpriteType, number>>;

export interface ShopSpriteWarmupOptions {
  types?: ShopSpriteType[];
  limit?: ShopSpriteWarmupLimitConfig;
  delayMs?: number;
  stepMs?: number;
}

const SHOP_SPRITE_WARMUP_TYPES: ShopSpriteType[] = ["Seed", "Egg", "Tool", "Decor", "Crop"];

const DEFAULT_SHOP_SPRITE_WARMUP_LIMITS: Record<ShopSpriteType, number> = {
  Seed: 18,
  Egg: 6,
  Tool: 6,
  Decor: 24,
  Crop: 10,
};

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function resolveWarmupLimit(type: ShopSpriteType, options: ShopSpriteWarmupOptions): number {
  const limitConfig = options.limit;
  if (typeof limitConfig === "number") {
    return limitConfig;
  }
  if (limitConfig && typeof limitConfig === "object" && limitConfig[type] != null) {
    return limitConfig[type]!;
  }
  return DEFAULT_SHOP_SPRITE_WARMUP_LIMITS[type] ?? Infinity;
}

export async function warmUpShopSprites(options: ShopSpriteWarmupOptions = {}): Promise<void> {
  if (typeof pageWindow === "undefined") return;
  const delay = Math.max(0, options.delayMs ?? 0);
  const step = Math.max(0, options.stepMs ?? 0);
  const types = options.types ?? SHOP_SPRITE_WARMUP_TYPES;

  if (delay > 0) {
    await waitMs(delay);
  }

  for (const type of types) {
    const ids = getShopSpriteWarmupIds(type);
    if (ids.length === 0) continue;
    const limit = resolveWarmupLimit(type, options);
    if (limit <= 0) {
      continue;
    }
    const selected = limit < ids.length ? ids.slice(0, limit) : ids;
    for (const id of selected) {
      try {
        await prefetchShopSprite(type, id);
      } catch {
        /* ignore */
      }
      if (step > 0) {
        await waitMs(step);
      }
    }
  }
}

type ShopSpriteBatchTask = {
  type: ShopSpriteType;
  id: string;
  options: NormalizedShopSpriteOptions;
  placeholder: HTMLSpanElement;
  batchSize: number;
  delayMs: number;
};

const SHOP_SPRITE_BATCH_SIZE = 12;
const SHOP_SPRITE_BATCH_DELAY_MS = 0;
const SHOP_SPRITE_BATCH_THRESHOLD = 10;

type ResolvedShopSpriteBatchConfig = {
  enabled: boolean;
  batchSize: number;
  delayMs: number;
  threshold: number;
};

const shopSpriteBatchConfig: ResolvedShopSpriteBatchConfig = {
  enabled: true,
  batchSize: SHOP_SPRITE_BATCH_SIZE,
  delayMs: SHOP_SPRITE_BATCH_DELAY_MS,
  threshold: SHOP_SPRITE_BATCH_THRESHOLD,
};

const shopSpriteBatchQueue: ShopSpriteBatchTask[] = [];
let shopSpriteBatchScheduled = false;
let shopSpriteBurstCount = 0;
let shopSpriteBurstResetToken: number | null = null;

export function setShopSpriteBatchConfig(config: Partial<ResolvedShopSpriteBatchConfig>): void {
  if (typeof config.enabled === "boolean") {
    shopSpriteBatchConfig.enabled = config.enabled;
  }
  if (config.batchSize != null && Number.isFinite(config.batchSize)) {
    shopSpriteBatchConfig.batchSize = Math.max(1, Math.floor(config.batchSize));
  }
  if (config.delayMs != null && Number.isFinite(config.delayMs)) {
    shopSpriteBatchConfig.delayMs = Math.max(0, Math.floor(config.delayMs));
  }
  if (config.threshold != null && Number.isFinite(config.threshold)) {
    shopSpriteBatchConfig.threshold = Math.max(1, Math.floor(config.threshold));
  }
}

const resetShopSpriteBurst = () => {
  shopSpriteBurstCount = 0;
  shopSpriteBurstResetToken = null;
};

const trackShopSpriteBurst = (): number => {
  shopSpriteBurstCount += 1;
  if (shopSpriteBurstResetToken != null) return shopSpriteBurstCount;

  if (typeof requestAnimationFrame === "function") {
    shopSpriteBurstResetToken = requestAnimationFrame(resetShopSpriteBurst);
  } else if (typeof window !== "undefined") {
    shopSpriteBurstResetToken = window.setTimeout(resetShopSpriteBurst, 16);
  } else {
    resetShopSpriteBurst();
  }
  return shopSpriteBurstCount;
};

const resolveShopSpriteBatchConfig = (batchOptions?: ShopSpriteBatchOptions): ResolvedShopSpriteBatchConfig => ({
  enabled: batchOptions?.enabled ?? shopSpriteBatchConfig.enabled,
  batchSize: Math.max(1, Math.floor(batchOptions?.batchSize ?? shopSpriteBatchConfig.batchSize)),
  delayMs: Math.max(0, Math.floor(batchOptions?.delayMs ?? shopSpriteBatchConfig.delayMs)),
  threshold: Math.max(1, Math.floor(batchOptions?.threshold ?? shopSpriteBatchConfig.threshold)),
});

const shouldBatchShopSprite = (
  resolved: ResolvedShopSpriteBatchConfig,
  batchOptions?: ShopSpriteBatchOptions,
): boolean => {
  if (!resolved.enabled) return false;
  if (batchOptions?.force === true) return true;
  if (batchOptions?.force === false) return false;
  if (typeof window === "undefined") return false;
  const burst = trackShopSpriteBurst();
  return burst >= resolved.threshold;
};

const normalizeShopSpriteOptions = (
  type: ShopSpriteType,
  options: ShopSpriteOptions,
): NormalizedShopSpriteOptions => {
  const size = Math.max(12, options.size ?? 36);
  const fallback = String(options.fallback ?? defaultFallback(type));
  const alt = typeof options.alt === "string" ? options.alt : "";
  return { size, fallback, alt };
};

const createShopSpriteImmediate = (
  type: ShopSpriteType,
  id: string,
  options: NormalizedShopSpriteOptions,
): HTMLSpanElement => {
  const { size, fallback, alt } = options;
  const el = document.createElement("span");
  spriteConfig.set(el, { size, fallback, alt });

  if (typeof pageWindow === "undefined") {
    applySprite(el, null);
    return el;
  }

  const key = spriteKey(type, id);
  subscribeSprite(key, el);
  applySprite(el, spriteCache.get(key)?.payload ?? null);
  const promise = loadSprite(type, id, key);
  void promise;
  return el;
};

function flushShopSpriteBatch(): void {
  shopSpriteBatchScheduled = false;
  if (!shopSpriteBatchQueue.length) return;
  const batchSize = Math.max(1, shopSpriteBatchQueue[0]?.batchSize ?? SHOP_SPRITE_BATCH_SIZE);
  const tasks = shopSpriteBatchQueue.splice(0, batchSize);
  tasks.forEach((task) => {
    const { placeholder } = task;
    if (!placeholder.isConnected) return;
    const sprite = createShopSpriteImmediate(task.type, task.id, task.options);
    try {
      placeholder.replaceWith(sprite);
    } catch {
      /* ignore */
    }
  });
  if (shopSpriteBatchQueue.length) {
    scheduleShopSpriteBatch();
  }
}

function scheduleShopSpriteBatch(): void {
  if (shopSpriteBatchScheduled) return;
  shopSpriteBatchScheduled = true;
  const delayMs = Math.max(0, shopSpriteBatchQueue[0]?.delayMs ?? SHOP_SPRITE_BATCH_DELAY_MS);
  const run = () => {
    if (delayMs > 0) {
      setTimeout(flushShopSpriteBatch, delayMs);
    } else {
      flushShopSpriteBatch();
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, delayMs);
  }
}

const enqueueShopSpriteBatch = (
  type: ShopSpriteType,
  id: string,
  options: NormalizedShopSpriteOptions,
  batchOptions: ResolvedShopSpriteBatchConfig,
): HTMLSpanElement => {
  const placeholder = document.createElement("span");
  spriteConfig.set(placeholder, options);
  applySprite(placeholder, null);

  shopSpriteBatchQueue.push({
    type,
    id,
    options,
    placeholder,
    batchSize: batchOptions.batchSize,
    delayMs: batchOptions.delayMs,
  });

  scheduleShopSpriteBatch();
  return placeholder;
};

export function createShopSpriteBatched(
  type: ShopSpriteType,
  id: string,
  options: ShopSpriteOptions = {},
  batchOptions: ShopSpriteBatchOptions = {},
): HTMLSpanElement {
  const resolvedBatch = resolveShopSpriteBatchConfig(batchOptions);
  const normalizedOptions = normalizeShopSpriteOptions(type, options);
  if (!resolvedBatch.enabled || typeof document === "undefined" || typeof window === "undefined") {
    return createShopSpriteImmediate(type, id, normalizedOptions);
  }
  return enqueueShopSpriteBatch(type, id, normalizedOptions, resolvedBatch);
}

export function createShopSprite(
  type: ShopSpriteType,
  id: string,
  options: ShopSpriteOptions = {},
  batchOptions?: ShopSpriteBatchOptions,
): HTMLSpanElement {
  const normalizedOptions = normalizeShopSpriteOptions(type, options);
  const resolvedBatch = resolveShopSpriteBatchConfig(batchOptions);
  if (shouldBatchShopSprite(resolvedBatch, batchOptions)) {
    return enqueueShopSpriteBatch(type, id, normalizedOptions, resolvedBatch);
  }
  return createShopSpriteImmediate(type, id, normalizedOptions);
}

// ================== Weather Sprites ==================

export type WeatherSpriteOptions = {
  size?: number;
  fallback?: string;
  alt?: string;
};

type WeatherSpriteConfig = { size: number; fallback: string; alt: string };
type WeatherSpriteKey = string;

const weatherSpriteConfig = new WeakMap<HTMLSpanElement, WeatherSpriteConfig>();
const weatherSpriteSubscribers = new Map<WeatherSpriteKey, Set<HTMLSpanElement>>();
const weatherSpriteCache = new Map<WeatherSpriteKey, string | null>();
const weatherSpritePromises = new Map<WeatherSpriteKey, Promise<string | null>>();

let weatherListenerAttached = false;
let animationBases: string[] | null = null;

const weatherTileIndices: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [rawKey, rawValue] of Object.entries(tileRefsAnimations ?? {})) {
    const key = normalizeWeatherRawKey(rawKey);
    const index = toAnimationTileIndex(rawValue);
    if (key && index != null) {
      map.set(key, index);
    }
  }
  return map;
})();

function normalizeWeatherRawKey(raw: string | null | undefined): string {
  const str = typeof raw === "string" ? raw : String(raw ?? "");
  return str
    .trim()
    .replace(/^Weather:/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function toAnimationTileIndex(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num > 0 ? Math.trunc(num) - 1 : Math.trunc(num);
}

function getAnimationBases(): string[] {
  if (animationBases) return animationBases;
  const bases = new Set<string>();
  try {
    const listFn = (Sprites as any)?.listTilesByCategory as ((re: RegExp) => string[]) | undefined;
    if (typeof listFn === "function") {
      for (const url of listFn(/anim/i)) {
        if (typeof url !== "string" || !url.length) continue;
        const clean = url.split(/[?#]/)[0] ?? url;
        const file = clean.split("/").pop() ?? clean;
        bases.add(file.replace(/\.[^.]+$/, ""));
      }
    }
  } catch {
    /* ignore */
  }
  if (bases.size === 0) {
    bases.add("animations");
  }
  animationBases = [...bases];
  return animationBases;
}

function subscribeWeatherSprite(key: WeatherSpriteKey, el: HTMLSpanElement, config: WeatherSpriteConfig): void {
  let subs = weatherSpriteSubscribers.get(key);
  if (!subs) {
    subs = new Set();
    weatherSpriteSubscribers.set(key, subs);
  }
  subs.add(el);
  weatherSpriteConfig.set(el, config);
}

function notifyWeatherSpriteSubscribers(key: WeatherSpriteKey, src: string | null): void {
  const subs = weatherSpriteSubscribers.get(key);
  if (!subs) return;
  subs.forEach((el) => {
    if (!el.isConnected) {
      subs.delete(el);
      weatherSpriteConfig.delete(el);
      return;
    }
    applyWeatherSprite(el, src);
  });
  if (subs.size === 0) {
    weatherSpriteSubscribers.delete(key);
  }
}

function ensureWeatherSpriteListener(): void {
  if (weatherListenerAttached || typeof window === "undefined") return;
  weatherListenerAttached = true;
  window.addEventListener("mg:sprite-detected", () => {
    weatherSpriteCache.clear();
    weatherSpritePromises.clear();
    animationBases = null;
    clearTileSheetCache();
    const keys = Array.from(weatherSpriteSubscribers.keys());
    keys.forEach((key) => {
      void loadWeatherSprite(key);
    });
  });
}

function applyWeatherSprite(el: HTMLSpanElement, src: string | null): void {
  const cfg = weatherSpriteConfig.get(el);
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
    if (alt) el.setAttribute("aria-label", alt);
    else el.removeAttribute("aria-label");
  }
}

async function fetchWeatherSprite(key: WeatherSpriteKey): Promise<string | null> {
  await ensureSpritesReady();
  const index = weatherTileIndices.get(key);
  if (index == null) return null;
  const bases = getAnimationBases();
  for (const base of bases) {
    try {
      const tiles = await loadTileSheet(base);
      const tile = tiles.find((t) => t.index === index);
      if (!tile) continue;
      const canvas = Sprites.toCanvas(tile);
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) continue;
      return canvas.toDataURL();
    } catch {
      /* ignore */
    }
  }
  return null;
}

function loadWeatherSprite(key: WeatherSpriteKey): Promise<string | null> {
  if (typeof window === "undefined") {
    weatherSpriteCache.set(key, null);
    notifyWeatherSpriteSubscribers(key, null);
    return Promise.resolve(null);
  }
  const cached = weatherSpriteCache.get(key);
  if (cached !== undefined) {
    notifyWeatherSpriteSubscribers(key, cached);
    return Promise.resolve(cached);
  }
  const inflight = weatherSpritePromises.get(key);
  if (inflight) return inflight;
  const promise = fetchWeatherSprite(key)
    .then((src) => {
      weatherSpriteCache.set(key, src);
      weatherSpritePromises.delete(key);
      notifyWeatherSpriteSubscribers(key, src);
      return src;
    })
    .catch(() => {
      weatherSpritePromises.delete(key);
      return null;
    });
  weatherSpritePromises.set(key, promise);
  return promise;
}

export interface WeatherSpritePrefetchOptions {
  keys?: string[];
  limit?: number;
  delayMs?: number;
}

export async function prefetchWeatherSprites(options: WeatherSpritePrefetchOptions = {}): Promise<void> {
  const { keys, limit = 20, delayMs = 40 } = options;
  const sourceKeys = (keys ?? Array.from(weatherTileIndices.keys()))
    .map((value) => normalizeWeatherRawKey(value))
    .map((value) => getWeatherSpriteKey(value))
    .filter((value): value is string => Boolean(value));
  const max = limit && limit > 0 ? Math.min(limit, sourceKeys.length) : sourceKeys.length;
  for (let i = 0; i < max; i += 1) {
    const key = sourceKeys[i];
    try {
      await loadWeatherSprite(key);
    } catch {
      /* ignore */
    }
    if (delayMs > 0 && i < max - 1) {
      await waitMs(delayMs);
    }
  }
}

export function getWeatherSpriteKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = normalizeWeatherRawKey(raw);
  if (!normalized) return null;
  if (weatherTileIndices.has(normalized)) return normalized;
  return null;
}

export function createWeatherSprite(rawKey: string | null | undefined, options: WeatherSpriteOptions = {}): HTMLSpanElement {
  const size = Math.max(12, options.size ?? 36);
  const fallback = String(options.fallback ?? "ĞYOİ");
  const alt = typeof options.alt === "string" ? options.alt : "";
  const el = document.createElement("span");
  weatherSpriteConfig.set(el, { size, fallback, alt });
  if (typeof window === "undefined") {
    applyWeatherSprite(el, null);
    return el;
  }
  ensureWeatherSpriteListener();
  const key = getWeatherSpriteKey(rawKey);
  if (!key) {
    applyWeatherSprite(el, null);
    return el;
  }
  subscribeWeatherSprite(key, el, { size, fallback, alt });
  applyWeatherSprite(el, weatherSpriteCache.get(key) ?? null);
  const promise = loadWeatherSprite(key);
  void promise;
  return el;
}

// ================== Pet Sprites ==================

export type PetSpriteVariant = "normal" | "gold" | "rainbow";

const PET_VARIANT_COLOR_FILTER: Record<PetSpriteVariant, string | null> = {
  normal: null,
  gold: "Gold",
  rainbow: "Rainbow",
};

type MutationInput = string | string[] | null | undefined;

type PetCatalogEntry = {
  tileRef?: number | null;
};

const petSpriteCache = new Map<string, string | null>();
const petSpritePromises = new Map<string, Promise<string | null>>();
let petSheetBasesCache: string[] | null = null;
let petListenerAttached = false;

function canonicalSpecies(raw: string): string {
  if (!raw) return raw;
  if ((petCatalog as Record<string, unknown>)[raw]) return raw;
  const pretty = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return (petCatalog as Record<string, unknown>)[pretty] ? pretty : raw;
}

function toPetTileIndex(tileRef: unknown): number | null {
  const value = typeof tileRef === "number" && Number.isFinite(tileRef) ? tileRef : Number(tileRef);
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return value;
  return value - 1;
}

function getPetSheetBases(): string[] {
  if (petSheetBasesCache) return petSheetBasesCache;
  const urls = new Set<string>();
  try {
    const list = typeof Sprites.listPets === "function" ? Sprites.listPets() : [];
    for (const url of list) {
      if (typeof url === "string" && url.length) {
        urls.add(url);
      }
    }
  } catch {
    /* ignore */
  }
  const bases = Array.from(urls, (url) => normalizeSheetBase(url));
  petSheetBasesCache = bases;
  return bases;
}

function resetPetCaches(): void {
  petSpriteCache.clear();
  petSpritePromises.clear();
  petSheetBasesCache = null;
  clearTileSheetCache();
}

function ensurePetListener(): void {
  if (petListenerAttached || typeof window === "undefined") return;
  petListenerAttached = true;
  window.addEventListener("mg:sprite-detected", () => {
    resetPetCaches();
  });
}

function keyForPet(species: string, variant: PetSpriteVariant): string {
  return `${species.toLowerCase()}::${variant}`;
}

function hasMutation(target: string, mutations: MutationInput): boolean {
  if (!mutations) return false;
  const list = Array.isArray(mutations) ? mutations : [mutations];
  return list
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(target));
}

export function determinePetSpriteVariant(mutations: MutationInput): PetSpriteVariant {
  if (hasMutation("rainbow", mutations)) return "rainbow";
  if (hasMutation("gold", mutations)) return "gold";
  return "normal";
}

async function fetchPetSprite(species: string, variant: PetSpriteVariant): Promise<string | null> {
  await ensureSpritesReady();
  if (typeof window === "undefined") return null;
  if (typeof Sprites.getTile !== "function") return null;
  const entry = petCatalog[species as keyof typeof petCatalog] as PetCatalogEntry | undefined;
  const tileRef = entry?.tileRef;
  if (tileRef == null) return null;
  const index = toPetTileIndex(tileRef);
  if (index == null) return null;
  const baseCandidates = new Set(getPetSheetBases());
  if (baseCandidates.size === 0) {
    baseCandidates.add("pets");
    baseCandidates.add("Pets");
  }
  for (const base of baseCandidates) {
    try {
      const tiles = await loadTileSheet(base);
      const tile = tiles.find((t) => t.index === index);
      if (!tile) continue;
      const canvas = Sprites.toCanvas(tile);
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) continue;
      let finalCanvas = canvas;
      const filterName = PET_VARIANT_COLOR_FILTER[variant];
      if (filterName) {
        const filtered = Sprites.applyCanvasFilter(finalCanvas, filterName);
        if (filtered) finalCanvas = filtered;
      }
      return finalCanvas.toDataURL();
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function loadPetSprite(speciesRaw?: string | null, variant: PetSpriteVariant = "normal"): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  const species = canonicalSpecies(String(speciesRaw ?? "").trim());
  if (!species) return Promise.resolve(null);
  ensurePetListener();
  const key = keyForPet(species, variant);
  const cached = petSpriteCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const inflight = petSpritePromises.get(key);
  if (inflight) return inflight;
  const promise = fetchPetSprite(species, variant)
    .then((src) => {
      petSpriteCache.set(key, src);
      petSpritePromises.delete(key);
      return src;
    })
    .catch(() => {
      petSpritePromises.delete(key);
      return null;
    });
  petSpritePromises.set(key, promise);
  return promise;
}

export function loadPetSpriteFromMutations(species?: string | null, mutations?: MutationInput): Promise<string | null> {
  const variant = determinePetSpriteVariant(mutations);
  return loadPetSprite(species, variant);
}

export interface PetSpritePrefetchOptions {
  species?: string[];
  variants?: PetSpriteVariant[];
  delayMs?: number;
  limit?: number;
}

export async function prefetchPetSprites(options: PetSpritePrefetchOptions = {}): Promise<void> {
  const { species, variants = ["normal", "gold", "rainbow"], delayMs = 10, limit } = options;
  const allSpecies = (species ?? Object.keys(petCatalog))
    .map((value) => canonicalSpecies(value))
    .filter((value) => Boolean(value));
  const combos: Array<{ species: string; variant: PetSpriteVariant }> = [];
  for (const entry of allSpecies) {
    for (const variant of variants) {
      combos.push({ species: entry, variant });
    }
  }
  const max = typeof limit === "number" && limit > 0 ? Math.min(limit, combos.length) : combos.length;
  for (let i = 0; i < max; i += 1) {
    const combo = combos[i];
    try {
      await loadPetSprite(combo.species, combo.variant);
    } catch {
      /* ignore */
    }
    if (delayMs > 0 && i < max - 1) {
      await waitMs(delayMs);
    }
  }
}

// ================== Combined Warm-up ==================

export interface SpriteWarmupOptions {
  shop?: ShopSpriteWarmupOptions;
  weather?: WeatherSpritePrefetchOptions;
  pet?: PetSpritePrefetchOptions;
}

const FULL_SHOP_WARMUP_LIMIT: NonNullable<ShopSpriteWarmupOptions["limit"]> = {
  Seed: Infinity,
  Egg: Infinity,
  Tool: Infinity,
  Decor: Infinity,
  Crop: Infinity,
};

export async function warmUpAllSprites(options: SpriteWarmupOptions = {}): Promise<void> {
  const shopOptions: ShopSpriteWarmupOptions = {
    delayMs: options.shop?.delayMs,
    stepMs: options.shop?.stepMs,
    types: options.shop?.types,
    limit: options.shop?.limit ?? FULL_SHOP_WARMUP_LIMIT,
  };
  await warmUpShopSprites(shopOptions);
  await prefetchWeatherSprites(options.weather ?? { delayMs: 5, limit: 0 });
  await prefetchPetSprites(options.pet ?? { delayMs: 5 });
}
