import { Sprites, type TileInfo } from "../core/sprite";
import { petCatalog } from "../data/hardcoded-data.clean.js";

export type PetSpriteVariant = "normal" | "gold" | "rainbow";

type MutationInput = string | string[] | null | undefined;

type PetCatalogEntry = {
  tileRef?: number | null;
};

const spriteCache = new Map<string, string | null>();
const spritePromises = new Map<string, Promise<string | null>>();
let petSheetBasesCache: string[] | null = null;
let listenerAttached = false;

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

  const bases = Array.from(urls, (url) => {
    const clean = url.split(/[?#]/)[0] ?? url;
    const file = clean.split("/").pop() ?? clean;
    return file.replace(/\.[^.]+$/, "");
  });

  petSheetBasesCache = bases;
  return bases;
}

function resetCaches(): void {
  spriteCache.clear();
  spritePromises.clear();
  petSheetBasesCache = null;
}

function ensureListener(): void {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("mg:sprite-detected", () => {
    resetCaches();
  });
}

function keyFor(species: string, variant: PetSpriteVariant): string {
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
      const tile = await Sprites.getTile(base, index, "canvas") as TileInfo<HTMLCanvasElement> | null;
      if (!tile) continue;
      const data = tile.data;
      if (!(data instanceof HTMLCanvasElement) || data.width === 0 || data.height === 0) {
        continue;
      }

      let canvas: HTMLCanvasElement | null = null;
      if (variant === "gold" && typeof Sprites.effectGold === "function") {
        canvas = Sprites.effectGold(tile);
      } else if (variant === "rainbow" && typeof Sprites.effectRainbow === "function") {
        canvas = Sprites.effectRainbow(tile);
      } else {
        const copy = document.createElement("canvas");
        copy.width = data.width;
        copy.height = data.height;
        const ctx = copy.getContext("2d");
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(data, 0, 0);
        canvas = copy;
      }

      if (!canvas || canvas.width === 0 || canvas.height === 0) continue;
      return canvas.toDataURL();
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function loadPetSprite(
  speciesRaw?: string | null,
  variant: PetSpriteVariant = "normal",
): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const species = canonicalSpecies(String(speciesRaw ?? "").trim());
  if (!species) return Promise.resolve(null);

  ensureListener();

  const key = keyFor(species, variant);
  const cached = spriteCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const inflight = spritePromises.get(key);
  if (inflight) return inflight;

  const promise = fetchPetSprite(species, variant)
    .then((src) => {
      spriteCache.set(key, src);
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

export function loadPetSpriteFromMutations(
  species?: string | null,
  mutations?: MutationInput,
): Promise<string | null> {
  const variant = determinePetSpriteVariant(mutations);
  return loadPetSprite(species, variant);
}
