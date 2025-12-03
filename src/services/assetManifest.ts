import { Sprites } from "../core/sprite";
import { pageWindow } from "../utils/page-context";
import { gameVersion } from "../utils/gameVersion";

export type ManifestAsset = {
  alias?: string[];
  src?: string[];
  data?: { tags?: Record<string, unknown> };
};

export type ManifestBundle = {
  name?: string;
  assets?: ManifestAsset[];
};

export type AssetManifest = {
  bundles?: ManifestBundle[];
};

export type ResolvedManifestAsset = {
  bundle: string;
  aliases: string[];
  src: string;
  url: string;
  tags: Record<string, unknown>;
  families: string[];
  primaryFamily: string | null;
};

type PrefetchOptions = {
  force?: boolean;
  url?: string;
  registerSprites?: boolean;
  waitForVersionMs?: number;
};

const LOG_PREFIX = "[AssetManifest]";
const ASSET_BASE_RE = /(https?:\/\/[^/]+\/(?:version\/[^/]+\/)?assets\/)/i;
const VERSION_RE = /\/version\/([^/]+)\//i;
const VERSION_PATH_RE = /\/version\/([^/]+)\//i;

let manifestCache: AssetManifest | null = null;
let manifestPromise: Promise<AssetManifest | null> | null = null;
let resolvedAssets: ResolvedManifestAsset[] = [];
let aliasIndex = new Map<string, ResolvedManifestAsset>();
let manifestFamilyIndex = new Map<string, ResolvedManifestAsset[]>();
let assetBaseUrl: string | null = null;
let assetVersion: string | null = null;
let autoLoadScheduled = false;
let manifestBaseUsed: string | null = null;

function normalizeManifest(manifest: AssetManifest | null): AssetManifest | null {
  if (!manifest || typeof manifest !== "object") return null;
  if (!Array.isArray(manifest.bundles)) {
    return { bundles: [] };
  }
  const bundles = manifest.bundles
    .map((b) => ({
      name: typeof b.name === "string" && b.name ? b.name : "default",
      assets: Array.isArray(b.assets) ? b.assets : [],
    }))
    .filter((b) => b.assets.length > 0);
  return { bundles };
}

function normalizeFamilyName(name: string | undefined | null): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return normalized ? normalized : null;
}

function extractFamilyFromPath(path: string | undefined | null): string | null {
  if (!path) return null;
  const cleaned = path.replace(/^\/+/, "").replace(/\\/g, "/").replace(/[\?#].*$/, "");
  const slashIndex = cleaned.indexOf("/");
  if (slashIndex <= 0) return null;
  return normalizeFamilyName(cleaned.slice(0, slashIndex));
}

function deriveAssetFamilies(src: string, aliases: string[], bundleName: string): string[] {
  const families = new Set<string>();
  const add = (path?: string | null) => {
    const family = extractFamilyFromPath(path);
    if (family) families.add(family);
  };
  add(src);
  for (const alias of aliases) {
    add(alias);
  }
  if (!families.size) {
    const fallback = normalizeFamilyName(bundleName);
    if (fallback) families.add(fallback);
  }
  return Array.from(families);
}

function toAbsoluteUrl(base: string, rel: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return `${cleanBase}${rel.replace(/^\/+/, "")}`;
}

function inferAssetBase(url: string): string | null {
  try {
    const href = new URL(url, location.href).href;
    const m = href.match(ASSET_BASE_RE);
    if (m && m[1]) {
      return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setAssetBase(url: string | null): void {
  if (!url) return;
  const base = inferAssetBase(url);
  if (!base) return;
  if (assetBaseUrl && assetBaseUrl === base) return;
  assetBaseUrl = base;
  const match = base.match(VERSION_RE);
  assetVersion = match?.[1] ?? assetVersion;
}

function getManifestUrl(custom?: string | null): string | null {
  if (custom) return custom;
  if (assetBaseUrl) return `${assetBaseUrl}manifest.json`;
  return null;
}

function inferBaseFromLocation(): string | null {
  try {
    const href = location.href;
    const match = href.match(VERSION_PATH_RE);
    if (match?.[1]) {
      return `${location.origin}/version/${match[1]}/assets/`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function baseFromGameVersion(): string | null {
  if (!gameVersion) return null;
  try {
    return `${location.origin}/version/${gameVersion}/assets/`;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function indexResolvedAssets(list: ResolvedManifestAsset[]): void {
  resolvedAssets = list;
  aliasIndex = new Map();
  manifestFamilyIndex = new Map();
  for (const asset of list) {
    aliasIndex.set(asset.src, asset);
    aliasIndex.set(asset.url, asset);
    for (const alias of asset.aliases) {
      aliasIndex.set(alias, asset);
    }
    for (const family of asset.families) {
      const bucket = manifestFamilyIndex.get(family);
      if (bucket) {
        bucket.push(asset);
      } else {
        manifestFamilyIndex.set(family, [asset]);
      }
    }
  }
}

function resolveManifest(manifest: AssetManifest, base: string | null): ResolvedManifestAsset[] {
  const out: ResolvedManifestAsset[] = [];
  for (const bundle of manifest.bundles ?? []) {
    const bundleName = bundle.name ?? "default";
    for (const asset of bundle.assets ?? []) {
      const aliases = Array.isArray(asset.alias) ? asset.alias.filter(Boolean) : [];
      for (const src of asset.src ?? []) {
        const url = base ? toAbsoluteUrl(base, src) : src;
        const families = deriveAssetFamilies(src, aliases, bundleName);
        const primaryFamily = families[0] ?? null;
        out.push({
          bundle: bundleName,
          aliases,
          src,
          url,
          tags: asset.data?.tags ?? {},
          families,
          primaryFamily,
        });
      }
    }
  }
  return out;
}

function registerSpritesFromResolved(list: ResolvedManifestAsset[]): number {
  let added = 0;
  for (const asset of list) {
    const wasNew = Sprites.registerKnownAsset(asset.url, asset.families);
    if (
      wasNew &&
      (asset.families.includes("tiles") || asset.families.includes("ui"))
    ) {
      added += 1;
    }
  }
  if (added > 0) {
    try {
      pageWindow.dispatchEvent(new CustomEvent("mg:sprite-detected", { detail: { source: "manifest" } }));
    } catch {
      /* ignore */
    }
  }
  return added;
}

async function fetchManifest(manifestUrl: string): Promise<AssetManifest | null> {
  try {
    const res = await fetch(manifestUrl, { cache: "no-store", credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return normalizeManifest(json);
  } catch (error) {
    console.warn(LOG_PREFIX, "unable to fetch remote manifest", { manifestUrl, error });
    return null;
  }
}

export function recordAssetUrlHint(url: string): void {
  const previousBase = assetBaseUrl;
  setAssetBase(url);
  if (assetBaseUrl && assetBaseUrl !== previousBase) {
    scheduleAutoLoad();
  }
}

function scheduleAutoLoad(): void {
  if (autoLoadScheduled) return;
  autoLoadScheduled = true;
  setTimeout(() => {
    autoLoadScheduled = false;
    void prefetchManifest({ registerSprites: true }).catch(() => {});
  }, 100);
}

export function getManifestAssets(): ResolvedManifestAsset[] {
  return resolvedAssets;
}

export function getManifestFamilies(): string[] {
  return [...manifestFamilyIndex.keys()];
}

export function getManifestAssetsForFamily(family: string): ResolvedManifestAsset[] {
  if (!family) return [];
  const key = family.trim().toLowerCase();
  const list = manifestFamilyIndex.get(key);
  return list ? [...list] : [];
}

export function findManifestAsset(alias: string): ResolvedManifestAsset | null {
  return aliasIndex.get(alias) ?? null;
}

export function getAssetBaseUrl(): string | null {
  return assetBaseUrl;
}

export function getAssetVersion(): string | null {
  return assetVersion;
}

export async function prefetchManifest(options: PrefetchOptions = {}): Promise<AssetManifest | null> {
  const desiredBase = assetBaseUrl ?? null;
  if (!options.force && manifestCache) {
    if (!desiredBase || manifestBaseUsed === desiredBase) {
      return manifestCache;
    }
  }
  if (!options.force && manifestPromise) return manifestPromise;

  if (!assetBaseUrl) {
    const hintedVersionBase = baseFromGameVersion();
    if (hintedVersionBase) {
      setAssetBase(hintedVersionBase);
    } else {
      const hintedBase = inferBaseFromLocation();
      if (hintedBase) setAssetBase(hintedBase);
    }
  }

  if (!assetBaseUrl && options.waitForVersionMs) {
    const deadline = Date.now() + options.waitForVersionMs;
    while (!assetBaseUrl && !gameVersion && Date.now() < deadline) {
      await sleep(50);
    }
    if (!assetBaseUrl && gameVersion) {
      const hintedVersionBase = baseFromGameVersion();
      if (hintedVersionBase) setAssetBase(hintedVersionBase);
    }
  }

  const manifestUrl = getManifestUrl(options.url);
  if (!manifestUrl) {
    console.warn(LOG_PREFIX, "no manifest URL could be resolved");
    return null;
  }

  manifestPromise = (async () => {
    const manifest = manifestUrl ? await fetchManifest(manifestUrl) : null;
    if (!manifest) return null;

    if (manifestUrl) {
      setAssetBase(manifestUrl);
    }

    const baseForResolution = assetBaseUrl ?? (manifestUrl ? inferAssetBase(manifestUrl) : null);
    const resolved = resolveManifest(manifest, baseForResolution);
    indexResolvedAssets(resolved);

    manifestBaseUsed = baseForResolution ?? manifestBaseUsed;

    if (options.registerSprites !== false && baseForResolution) {
      registerSpritesFromResolved(resolved);
    }

    manifestCache = manifest;
    return manifest;
  })();

  try {
    return await manifestPromise;
  } finally {
    manifestPromise = null;
  }
}

let spritesReadyPromise: Promise<void> | null = null;

export function ensureSpritesReady(): Promise<void> {
  if (spritesReadyPromise) return spritesReadyPromise;

  spritesReadyPromise = (async () => {
    await prefetchManifest({ registerSprites: true, waitForVersionMs: 4_000 });
  })();

  return spritesReadyPromise;
}
