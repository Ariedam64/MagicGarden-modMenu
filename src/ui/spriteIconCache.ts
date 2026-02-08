import { pageWindow } from "../utils/page-context";

type SpriteServiceHandle = {
  ready?: Promise<unknown>;
  renderToCanvas?: (params: { category: string; id: string; mutations?: string[] }) => HTMLCanvasElement | null;
  list?: (category?: string) => Array<{ key?: string }>;
};

const SPRITE_PRELOAD_CATEGORIES = [
  "plant",
  "tallplant",
  "decor",
  "item",
  "pet",
  "seed",
  "ui",
  "mutation",
  "mutation-overlay",
] as const;

const spriteDataUrlCache = new Map<string, Promise<string | null>>();
const spriteDataUrlResolved = new Map<string, string>();
let spriteWarmupQueued = false;
let spriteWarmupStarted = false;
type SpriteWarmupState = { total: number; done: number; completed: boolean };
let warmupState: SpriteWarmupState = { total: 0, done: 0, completed: false };
let prefetchedWarmupKeys: string[] = [];
const warmupCompletedKeys = new Set<string>();
const WARMUP_RETRY_MS = 100;
const WARMUP_DELAY_MS = 8;
const WARMUP_BATCH = 3;
const warmupListeners = new Set<(state: SpriteWarmupState) => void>();

function notifyWarmup(state: SpriteWarmupState): void {
  warmupState = state;
  warmupListeners.forEach(listener => {
    try {
      listener(warmupState);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function getSpriteWarmupState(): SpriteWarmupState {
  return warmupState;
}

export function onSpriteWarmupProgress(
  listener: (state: SpriteWarmupState) => void,
): () => void {
  warmupListeners.add(listener);
  // Immediately emit current state to the new subscriber
  try {
    listener(warmupState);
  } catch {
    /* ignore */
  }
  return () => {
    warmupListeners.delete(listener);
  };
}

export function primeWarmupKeys(keys: string[]): void {
  prefetchedWarmupKeys.push(...keys);
}

function bumpWarmupTotal(total: number): void {
  if (total > warmupState.total) {
    notifyWarmup({ ...warmupState, total, completed: warmupState.completed && warmupState.done >= total });
  }
}

export function primeSpriteData(category: string, spriteId: string, dataUrl: string): void {
  const cacheKey = cacheKeyFor(category, spriteId);
  if (!spriteDataUrlCache.has(cacheKey)) {
    spriteDataUrlCache.set(cacheKey, Promise.resolve(dataUrl));
  }
  spriteDataUrlResolved.set(cacheKey, dataUrl);
  if (!warmupCompletedKeys.has(cacheKey)) {
    warmupCompletedKeys.add(cacheKey);
    const nextDone = warmupState.done + 1;
    const completed = warmupState.total > 0 ? nextDone >= warmupState.total : false;
    notifyWarmup({ total: Math.max(warmupState.total, nextDone), done: nextDone, completed });
  }
}

const normalizeSpriteId = (value: string): string =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const baseNameFromKey = (key: string): string => {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
};

type SpriteCacheOptions = {
  mutations?: string[];
};

const normalizeMutationList = (mutations?: string[]): { list: string[]; key: string } => {
  const list = Array.from(
    new Set((mutations ?? []).map(value => String(value ?? "").trim()).filter(Boolean)),
  );
  if (!list.length) {
    return { list, key: "" };
  }
  const key = list
    .map(val => normalizeSpriteId(val))
    .filter(Boolean)
    .sort()
    .join(",");
  return { list, key: key ? `|m=${key}` : "" };
};

const cacheKeyFor = (category: string, spriteId: string, mutationKey?: string): string =>
  `${category}:${normalizeSpriteId(spriteId)}${mutationKey ?? ""}`;

const scheduleNonBlocking = <T>(cb: () => T | Promise<T>): Promise<T> => {
  return new Promise(resolve => {
    const runner = () => {
      Promise.resolve()
        .then(cb)
        .then(resolve)
        .catch(() => resolve(cb() as any));
    };
    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(runner, { timeout: 50 });
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(runner);
    } else {
      setTimeout(runner, 0);
    }
  });
};

function getSpriteService(): SpriteServiceHandle | null {
  const win: any = pageWindow ?? (globalThis as any);
  return win?.__MG_SPRITE_SERVICE__ ?? win?.unsafeWindow?.__MG_SPRITE_SERVICE__ ?? null;
}

const parseKeyToCategoryId = (key: string): { category: string; id: string } | null => {
  const parts = key.split("/").filter(Boolean);
  if (!parts.length) return null;
  // Accept keys like "sprite/plant/Carrot" or "plant/Carrot"
  const start = parts[0] === "sprite" || parts[0] === "sprites" ? 1 : 0;
  const category = parts[start] ?? "";
  const id = parts.slice(start + 1).join("/") || parts[parts.length - 1] || "";
  if (!category || !id) return null;
  return { category, id };
};

function whenServiceReady(handle: SpriteServiceHandle | null): Promise<void> {
  if (!handle || !handle.ready || typeof handle.ready.then !== "function") {
    return Promise.resolve();
  }
  return handle.ready.then(
    () => {},
    () => {},
  );
}

async function ensureSpriteDataCached(
  service: SpriteServiceHandle,
  category: string,
  spriteId: string,
  logTag: string,
  options?: SpriteCacheOptions,
): Promise<string | null> {
  if (!service?.renderToCanvas) {
    return null;
  }
  const { list: mutationList, key: mutationKey } = normalizeMutationList(options?.mutations);
  const cacheKey = cacheKeyFor(category, spriteId, mutationKey);
  let promise = spriteDataUrlCache.get(cacheKey);
  if (!promise) {
    promise = scheduleNonBlocking(async () => {
      try {
        const canvas = service.renderToCanvas?.({
          category,
          id: spriteId,
          mutations: mutationList,
        });
        if (!canvas) return null;
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl) {
          spriteDataUrlResolved.set(cacheKey, dataUrl);
        }
        return dataUrl;
      } catch (error) {
        console.error("[SpriteIconCache]", "failed to cache sprite", { category, spriteId, logTag, error });
        return null;
      }
    });
    spriteDataUrlCache.set(cacheKey, promise);
  }
  return promise;
}

const spriteMatchCache = new Map<string, { category: string; spriteId: string } | null>();

function getMatchCacheKey(categories: string[], id: string): string {
  const normalizedCategories = categories.map(category => category.toLowerCase()).join("|");
  return `${normalizedCategories}|${normalizeSpriteId(id)}`;
}

function findCachedSpriteMatch(
  categories: string[],
  candidateIds: string[],
): { match: { category: string; spriteId: string }; candidate: string } | null {
  for (const candidate of candidateIds) {
    const cacheKey = getMatchCacheKey(categories, candidate);
    if (!spriteMatchCache.has(cacheKey)) continue;
    const match = spriteMatchCache.get(cacheKey);
    if (match) {
      return { match, candidate };
    }
  }
  return null;
}

function findSpriteMatch(
  service: SpriteServiceHandle,
  categories: string[],
  id: string,
): { category: string; spriteId: string } | null {
  if (!service.list) return null;
  const cacheKey = getMatchCacheKey(categories, id);
  if (spriteMatchCache.has(cacheKey)) {
    return spriteMatchCache.get(cacheKey) ?? null;
  }

  const normalizedTarget = normalizeSpriteId(id);
  const categoryLists = categories.map(category => ({
    category,
    items: service.list?.(category) ?? [],
  }));

  let matched: { category: string; spriteId: string } | null = null;
  const tryMatch = (category: string, base: string): boolean => {
    if (normalizeSpriteId(base) === normalizedTarget) {
      matched = { category, spriteId: base };
      return true;
    }
    return false;
  };

  for (const { category, items } of categoryLists) {
    for (const it of items) {
      const key = typeof it?.key === "string" ? it.key : "";
      if (!key) continue;
      const base = baseNameFromKey(key);
      if (tryMatch(category, base)) {
        spriteMatchCache.set(cacheKey, matched);
        return matched;
      }
    }
  }

  for (const { category, items } of categoryLists) {
    for (const it of items) {
      const key = typeof it?.key === "string" ? it.key : "";
      if (!key) continue;
      const base = baseNameFromKey(key);
      const normBase = normalizeSpriteId(base);
      if (!normBase) continue;
      if (
        normalizedTarget.includes(normBase) ||
        normBase.includes(normalizedTarget) ||
        normBase.startsWith(normalizedTarget) ||
        normalizedTarget.startsWith(normBase)
      ) {
        matched = { category, spriteId: base };
        spriteMatchCache.set(cacheKey, matched);
        return matched;
      }
    }
  }

  spriteMatchCache.set(cacheKey, null);
  return null;
}

type AttachSpriteIconOptions = {
  mutations?: string[];
  onSpriteApplied?: (
    img: HTMLImageElement,
    meta: { category: string; spriteId: string; candidate: string },
  ) => void;
  onNoSpriteFound?: (meta: { categories: string[]; candidates: string[] }) => void;
};

export function attachSpriteIcon(
  target: HTMLElement,
  categories: string[],
  id: string | string[],
  size: number,
  logTag: string,
  options?: AttachSpriteIconOptions,
): void {
  const candidateIds = Array.isArray(id)
    ? id.map(value => String(value ?? "").trim()).filter(Boolean)
    : [String(id ?? "").trim()].filter(Boolean);
  if (!candidateIds.length) return;

  const cachedMatch = findCachedSpriteMatch(categories, candidateIds);
  if (cachedMatch) {
    const { match, candidate } = cachedMatch;
    const { key: mutationKey } = normalizeMutationList(options?.mutations);
    const spriteKey = `${match.category}:${match.spriteId}${mutationKey}`;
    const cacheKey = cacheKeyFor(match.category, match.spriteId, mutationKey);
    const cachedUrl = spriteDataUrlResolved.get(cacheKey);
    const existingImg = target.querySelector<HTMLImageElement>("img[data-sprite-key]");
    if (existingImg && existingImg.dataset.spriteKey === spriteKey) {
      return;
    }
    if (cachedUrl) {
      const img = document.createElement("img");
      img.src = cachedUrl;
      img.width = size;
      img.height = size;
      img.alt = "";
      img.decoding = "async";
      (img as any).loading = "lazy";
      img.draggable = false;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.objectFit = "contain";
      img.style.imageRendering = "auto";
      img.style.display = "block";
      img.dataset.spriteKey = spriteKey;
      img.dataset.spriteCategory = match.category;
      img.dataset.spriteId = match.spriteId;
      target.replaceChildren(img);
      options?.onSpriteApplied?.(img, {
        category: match.category,
        spriteId: match.spriteId,
        candidate,
      });
      return;
    }
  }

  const service = getSpriteService();
  if (!service?.renderToCanvas) return;
  void whenServiceReady(service).then(() =>
    scheduleNonBlocking(async () => {
      let selected:
        | {
            match: { category: string; spriteId: string };
            candidate: string;
          }
        | null = null;
      for (const candidate of candidateIds) {
        const match = findSpriteMatch(service, categories, candidate);
        if (match) {
          selected = { match, candidate };
          break;
        }
      }
      if (!selected) {
        options?.onNoSpriteFound?.({ categories, candidates: candidateIds });
        return;
      }
      const resolved = selected;
      const { key: mutationKey } = normalizeMutationList(options?.mutations);
      const spriteKey = `${resolved.match.category}:${resolved.match.spriteId}${mutationKey}`;

      const existingImg = target.querySelector<HTMLImageElement>("img[data-sprite-key]");
      if (existingImg && existingImg.dataset.spriteKey === spriteKey) {
        // Already showing the right sprite; avoid flicker/replacement.
        return;
      }

      const dataUrl = await ensureSpriteDataCached(
        service,
        resolved.match.category,
        resolved.match.spriteId,
        logTag,
        {
          mutations: options?.mutations,
        },
      );
      if (!dataUrl) return;
      const img = document.createElement("img");
      img.src = dataUrl;
      img.width = size;
      img.height = size;
      img.alt = "";
      img.decoding = "async";
      (img as any).loading = "lazy";
      img.draggable = false;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.objectFit = "contain";
      img.style.imageRendering = "auto";
      img.style.display = "block";
      img.dataset.spriteKey = spriteKey;
      img.dataset.spriteCategory = resolved.match.category;
      img.dataset.spriteId = resolved.match.spriteId;
      requestAnimationFrame(() => {
        target.replaceChildren(img);
        options?.onSpriteApplied?.(img, {
          category: resolved.match.category,
          spriteId: resolved.match.spriteId,
          candidate: resolved.candidate,
        });
      });
    }),
  );
}

export function attachWeatherSpriteIcon(target: HTMLElement, tag: string, size: number): void {
  if (tag === "NoWeatherEffect") return;
  attachSpriteIcon(target, ["mutation"], tag, size, "weather");
}

export function warmupSpriteCache(): void {
  if (spriteWarmupQueued || spriteWarmupStarted || typeof window === "undefined") return;
  spriteWarmupQueued = true;
  notifyWarmup({ total: warmupState.total, done: warmupState.done, completed: false });

  const scheduleRetry = () => {
    window.setTimeout(() => {
      spriteWarmupQueued = false;
      warmupSpriteCache();
    }, WARMUP_RETRY_MS);
  };

  let service = getSpriteService();
  if (!service && prefetchedWarmupKeys.length === 0) {
    scheduleRetry();
    return;
  }

  const tasks: Array<{ category: string; id: string }> = [];
  const seen = new Set<string>(warmupCompletedKeys);
  if (service?.list) {
    SPRITE_PRELOAD_CATEGORIES.forEach(category => {
      const items = service.list?.(category) ?? [];
      items.forEach(item => {
        const key = typeof item?.key === "string" ? item.key : "";
        if (!key) return;
        const base = baseNameFromKey(key);
        if (!base) return;
        const k = `${category}:${base.toLowerCase()}`;
        if (seen.has(k)) return;
        seen.add(k);
        tasks.push({ category, id: base });
      });
    });
  }
  if (prefetchedWarmupKeys.length) {
    prefetchedWarmupKeys.forEach(key => {
      const parsed = parseKeyToCategoryId(key);
      if (!parsed) return;
      const k = `${parsed.category}:${parsed.id.toLowerCase()}`;
      if (seen.has(k)) return;
      seen.add(k);
      tasks.push(parsed);
    });
    prefetchedWarmupKeys = [];
  }
  if (!tasks.length) {
    if (warmupState.completed) {
      spriteWarmupQueued = false;
      return;
    }
    scheduleRetry();
    return;
  }

  spriteWarmupStarted = true;
  const total = Math.max(warmupState.total, tasks.length);
  const startingDone = Math.min(warmupState.done, total);
  notifyWarmup({ total, done: startingDone, completed: total === 0 || startingDone >= total });

  const processNext = () => {
    service = service || getSpriteService();
    if (!service?.renderToCanvas || !service?.list) {
      setTimeout(processNext, WARMUP_RETRY_MS);
      return;
    }

    if (!tasks.length) {
      spriteWarmupQueued = false;
      console.log("[SpriteIconCache]", "warmup complete", {
        categories: SPRITE_PRELOAD_CATEGORIES,
        totalCached: spriteDataUrlCache.size,
      });
      notifyWarmup({ total, done: warmupState.done, completed: true });
      return;
    }

    let processed = 0;
    const batch = tasks.splice(0, WARMUP_BATCH);
    batch.forEach(entry => {
      ensureSpriteDataCached(service!, entry.category, entry.id, "warmup")
        .then(result => {
          if (result == null && !service?.renderToCanvas) {
            tasks.unshift(entry);
            return;
          }
          const completionKey = cacheKeyFor(entry.category, entry.id);
          if (!warmupCompletedKeys.has(completionKey)) {
            warmupCompletedKeys.add(completionKey);
            const nextDone = Math.min(warmupState.done + 1, total);
            notifyWarmup({ total, done: nextDone, completed: nextDone >= total });
          }
        })
        .finally(() => {
          processed += 1;
          if (processed >= batch.length) {
            setTimeout(processNext, WARMUP_DELAY_MS);
          }
        });
    });
  };

  processNext();
}
