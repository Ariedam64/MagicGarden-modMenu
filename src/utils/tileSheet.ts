import { Sprites, type TileInfo } from "../core/sprite";

const sheetCache = new Map<string, Promise<TileInfo<HTMLCanvasElement>[]>>();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function clearTileSheetCache(): void {
  sheetCache.clear();
}

export function normalizeSheetBase(urlOrBase: string): string {
  const clean = urlOrBase.split(/[?#]/)[0] ?? urlOrBase;
  const file = clean.split("/").pop() ?? clean;
  return file.replace(/\.[^.]+$/, "");
}

export function uniqueBases(urls: Iterable<string>, fallback: string[]): string[] {
  const set = new Set<string>();
  for (const url of urls) {
    if (typeof url === "string" && url.length) {
      set.add(normalizeSheetBase(url));
    }
  }
  if (set.size === 0) {
    for (const base of fallback) set.add(base);
  }
  return [...set];
}

export async function loadTileSheet(base: string): Promise<TileInfo<HTMLCanvasElement>[]> {
  const key = base.toLowerCase();
  if (sheetCache.has(key)) return sheetCache.get(key)!;

  const regex = new RegExp(`${escapeRegExp(base)}\\.(png|webp)$`, "i");
  const promise = Sprites.loadTiles({ mode: "canvas", onlySheets: regex })
    .then((map) => {
      for (const [sheetBase, tiles] of map.entries()) {
        if (sheetBase.toLowerCase() === key) return tiles ?? [];
      }
      const direct = map.get(base);
      return direct ?? [];
    })
    .catch(() => []);

  sheetCache.set(key, promise);
  return promise;
}

export async function getTileCanvas(base: string, index: number): Promise<HTMLCanvasElement | null> {
  const tiles = await loadTileSheet(base);
  const tile = tiles.find((t) => t.index === index);
  if (!tile) return null;
  try {
    return Sprites.toCanvas(tile);
  } catch {
    return null;
  }
}
