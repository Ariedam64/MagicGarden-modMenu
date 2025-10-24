import { Sprites } from "../core/sprite";
import { ensureSpritesReady } from "../core/spriteBootstrap";
import { tileRefsAnimations } from "../data/hardcoded-data.clean";

export type WeatherSpriteOptions = {
  size?: number;
  fallback?: string;
  alt?: string;
};

type SpriteConfig = { size: number; fallback: string; alt: string };

type SpriteKey = string;

type TileIndexMap = Map<string, number>;

const spriteConfig = new WeakMap<HTMLSpanElement, SpriteConfig>();
const spriteSubscribers = new Map<SpriteKey, Set<HTMLSpanElement>>();
const spriteCache = new Map<SpriteKey, string | null>();
const spritePromises = new Map<SpriteKey, Promise<string | null>>();

let listenerAttached = false;
let animationBases: string[] | null = null;

const weatherTileIndices: TileIndexMap = (() => {
  const map: TileIndexMap = new Map();
  for (const [rawKey, rawValue] of Object.entries(tileRefsAnimations ?? {})) {
    const key = normalizeRawKey(rawKey);
    const index = toTileIndex(rawValue);
    if (key && index != null) {
      map.set(key, index);
    }
  }
  return map;
})();

function normalizeRawKey(raw: string | null | undefined): string {
  const str = typeof raw === "string" ? raw : String(raw ?? "");
  return str
    .trim()
    .replace(/^Weather:/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function toTileIndex(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num > 0 ? Math.trunc(num) - 1 : Math.trunc(num);
}

function resolveSpriteKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = normalizeRawKey(raw);
  if (!normalized) return null;
  if (weatherTileIndices.has(normalized)) return normalized;
  return null;
}

function getAnimationBases(): string[] {
  if (animationBases) return animationBases;

  const bases = new Set<string>();
  try {
    const listFn = (Sprites as any)?.listTilesByCategory as
      | ((re: RegExp) => string[])
      | undefined;
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
    ["animations", "Animations", "animation", "Animation"].forEach((base) => bases.add(base));
  }

  animationBases = [...bases];
  return animationBases;
}

function subscribeSprite(key: SpriteKey, el: HTMLSpanElement, config: SpriteConfig): void {
  let subs = spriteSubscribers.get(key);
  if (!subs) {
    subs = new Set();
    spriteSubscribers.set(key, subs);
  }
  subs.add(el);
  spriteConfig.set(el, config);
}

function notifySpriteSubscribers(key: SpriteKey, src: string | null): void {
  const subs = spriteSubscribers.get(key);
  if (!subs) return;

  subs.forEach((el) => {
    if (!el.isConnected) {
      subs.delete(el);
      spriteConfig.delete(el);
      return;
    }
    applySprite(el, src);
  });

  if (subs.size === 0) {
    spriteSubscribers.delete(key);
  }
}

function ensureSpriteListener(): void {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("mg:sprite-detected", () => {
    spriteCache.clear();
    spritePromises.clear();
    animationBases = null;
    const keys = Array.from(spriteSubscribers.keys());
    keys.forEach((key) => {
      void loadSprite(key);
    });
  });
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
    if (alt) el.setAttribute("aria-label", alt);
    else el.removeAttribute("aria-label");
  }
}

async function fetchSprite(key: SpriteKey): Promise<string | null> {
  await ensureSpritesReady();

  const index = weatherTileIndices.get(key);
  if (index == null) return null;

  const bases = getAnimationBases();
  for (const base of bases) {
    try {
      const tile = await Sprites.getTile(base, index, "canvas");
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

function loadSprite(key: SpriteKey): Promise<string | null> {
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

  const promise = fetchSprite(key)
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

export function getWeatherSpriteKey(raw: string | null | undefined): string | null {
  return resolveSpriteKey(raw);
}

export function createWeatherSprite(
  rawKey: string | null | undefined,
  options: WeatherSpriteOptions = {},
): HTMLSpanElement {
  const size = Math.max(12, options.size ?? 36);
  const fallback = String(options.fallback ?? "🌦");
  const alt = typeof options.alt === "string" ? options.alt : "";

  const el = document.createElement("span");
  spriteConfig.set(el, { size, fallback, alt });

  if (typeof window === "undefined") {
    applySprite(el, null);
    return el;
  }

  ensureSpriteListener();

  const key = resolveSpriteKey(rawKey);
  if (!key) {
    applySprite(el, null);
    return el;
  }

  subscribeSprite(key, el, { size, fallback, alt });
  applySprite(el, spriteCache.get(key) ?? null);
  void loadSprite(key);
  return el;
}
