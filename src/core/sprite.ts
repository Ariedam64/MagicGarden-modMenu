/* Sprites.ts — logique (sans UI) pour capturer & réutiliser les sprites (UI + Tiles).
   - Découpe auto: allplants => 512px, le reste => 256px.
   - Filtre les tuiles vides/noires (configurable).
   - Fournit des accès par catégories et des caches réutilisables.
*/

import { pageWindow, shareGlobal } from "../utils/page-context";
import { MutationName } from "../utils/calculators";
import JSZip from "jszip";

type SpriteMode = "bitmap" | "canvas" | "dataURL";

export interface TileInfo<T = ImageBitmap | HTMLCanvasElement | string> {
  sheet: string;     // nom de la feuille (base du fichier, sans extension)
  url: string;       // URL de la feuille
  index: number;     // index linéaire
  col: number;       // colonne
  row: number;       // ligne
  size: number;      // 256 ou 512 (ou forcé)
  data: T;           // sprite (ImageBitmap | Canvas | dataURL)
}

export interface Lists {
  all: string[];
  [family: string]: string[];
}

export interface LoadTilesOptions {
  mode?: SpriteMode;          // "bitmap" (defaut) | "canvas" | "dataURL"
  includeBlanks?: boolean;    // garder les tuiles vides/noires (defaut false)
  forceSize?: 256 | 512;      // imposer une taille globale
  onlySheets?: RegExp;        // charger uniquement les feuilles dont l'URL matche
}

export interface PreloadTilesOptions extends LoadTilesOptions {
  batchSize?: number; // nombre de feuilles traitées avant de céder la main
  delayMs?: number;   // délai (ms) entre deux batches
  onProgress?: (processed: number, total: number) => void;
}

export interface Config {
  skipAlphaBelow: number;   // alpha <= seuil → transparent
  blackBelow: number;       // valeur RGB max considérée “noire”
  tolerance: number;        // % pixels “colorés” tolérés avant de considérer non-vide
  ruleAllplants512: RegExp; // feuilles 512 par règle
}

export interface InitOptions {
  /** Merge dans this.cfg (optionnel) */
  config?: Partial<Config>;
  /** Callback à chaque nouvel asset détecté */
  onAsset?: (url: string, kind: string) => void;
}

export interface MutationIconTile {
  tile: TileInfo;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
}

function isImageUrl(u: string): boolean {
  try {
    if (!u || u.startsWith("blob:")) return false;
    return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|ktx2|basis)$/i.test(u);
  } catch { return false; }
}

function toAbs(u: string): string {
  try { return new URL(u, location.href).href; } catch { return String(u); }
}

function fileBase(url: string): string {
  const name = decodeURIComponent(url.split("/").pop() || "");
  return name.replace(/\.[a-z0-9]+$/i, "");
}

function guessFamiliesFromUrl(u: string): string[] {
  const families: string[] = [];
  const normalized = u.replace(/^\/+/, "").toLowerCase();
  if (/(^|\/)ui\//.test(normalized)) families.push("ui");
  if (/(^|\/)tiles\//.test(normalized) || /(map|plants|allplants|items|seeds|pets|animations|mutations)\.(png|webp)$/i.test(normalized)) {
    families.push("tiles");
  }
  return families;
}

export interface SpriteFilterConfig {
  blendMode: GlobalCompositeOperation;
  colors: string[];
  alpha?: number;
  gradientAngle?: number;
  masked?: boolean;
  reverse?: boolean;
}

export const spriteFilters: Record<string, SpriteFilterConfig> = {
  Gold: {
    blendMode: "source-atop",
    colors: ["rgb(255, 215, 0)"],
    alpha: 0.7,
  },
  Rainbow: {
    blendMode: "color",
    colors: ["#FF1744", "#FF9100", "#FFEA00", "#00E676", "#2979FF", "#D500F9"],
    gradientAngle: 130,
    masked: true,
    reverse: true,
  },
  Wet: {
    blendMode: "source-atop",
    colors: ["rgb(128, 128, 255)"],
    alpha: 0.2,
  },
  Chilled: {
    blendMode: "source-atop",
    colors: ["rgb(183, 183, 236)"],
    alpha: 0.5,
  },
  Frozen: {
    blendMode: "source-atop",
    colors: ["rgb(128, 128, 255)"],
    alpha: 0.6,
  },
  Dawnlit: {
    blendMode: "source-atop",
    colors: ["rgb(120, 100, 180)"],
    alpha: 0.4,
  },
  Ambershine: {
    blendMode: "source-atop",
    colors: ["rgb(255, 140, 26)", "rgb(230, 92, 26)", "rgb(178, 58, 26)"],
    alpha: 0.5,
  },
  Dawncharged: {
    blendMode: "source-atop",
    colors: ["rgb(100, 80, 160)", "rgb(110, 90, 170)", "rgb(120, 100, 180)"],
    alpha: 0.5,
  },
  Ambercharged: {
    blendMode: "source-atop",
    colors: ["rgb(167, 50, 30)", "rgb(177, 60, 40)", "rgb(187, 70, 50)"],
    alpha: 0.5,
  },
};

const MUTATION_PRIORITY: MutationName[] = [
  "Gold",
  "Rainbow",
  "Wet",
  "Chilled",
  "Frozen",
  "Dawnlit",
  "Ambershine",
  "Dawncharged",
  "Ambercharged",
  "Dawnbound",
  "Amberlit",
  "Amberbound",
];

const HIGH_MUTATIONS = new Set([
  "Dawnlit",
  "Ambershine",
  "Dawncharged",
  "Ambercharged",
]);

export class SpritesCore {
  /** Configuration (ajuste à la volée si besoin) */
  public cfg: Config = {
    skipAlphaBelow: 1,
    blackBelow: 8,
    tolerance: 0.005,
    ruleAllplants512: /allplants|mutation-overlays/i,
  };

  private initialized = false;
  private onAssetCb?: (url: string, kind: string) => void;
  private onMessageListener?: (e: MessageEvent) => void;

  // URLs récoltées
  private all = new Set<string>();
  private familyAssets = new Map<string, Set<string>>();
  private assetFamilies = new Map<string, string[]>();

  // Caches de sprites découpés par feuille et par mode
  private tileCacheBitmap = new Map<string, TileInfo<ImageBitmap>[]>();
  private tileCacheCanvas = new Map<string, TileInfo<HTMLCanvasElement>[]>();
  private tileCacheDataURL = new Map<string, TileInfo<string>[]>();
  // Images UI chargées
  private uiCache = new Map<string, HTMLImageElement>();

  private normalizeFamilies(families?: string[] | null): string[] {
    const set = new Set<string>();
    for (const raw of families ?? []) {
      const normalized = raw?.trim().toLowerCase();
      if (normalized) set.add(normalized);
    }
    return Array.from(set);
  }

  private familySet(name: string): Set<string> {
    return this.familyAssets.get(name) ?? new Set();
  }

  // Hooks / sniffers
  private observers: PerformanceObserver[] = [];
  private patched: {
    imgDesc?: PropertyDescriptor | null;
    setAttr?: any;
    Worker?: typeof Worker;
    Blob?: typeof Blob;
    createObjectURL?: typeof URL.createObjectURL;
  } = {};
  private blobText = new WeakMap<Blob, string>();

  constructor(autoStart = true) {
    if (autoStart) this.init();
  }
  public init(opts?: InitOptions): this {
  if (opts?.config) Object.assign(this.cfg, opts.config);
  if (opts?.onAsset) this.onAssetCb = opts.onAsset;

  if (this.initialized) {
    console.debug("[Sprites] SpritesCore déjà initialisé", {
      totals: {
        all: this.all.size,
        ui: this.familySet("ui").size,
        tiles: this.familySet("tiles").size,
      },
    });
    return this;
  }

  console.debug("[Sprites] Initialisation des sniffers de sprites", {
    config: this.cfg,
  });

    // main sniffers and worker hooks removed; sprite data managed via manifest.
 
  this.onMessageListener = (e: MessageEvent) => {
    const d: any = e.data;
    if (d && d.__awc && d.url) this.add(d.url, "worker");
  };
  pageWindow.addEventListener("message", this.onMessageListener, true);

  this.initialized = true;

  console.debug("[Sprites] SpritesCore initialisé", {
    globals: {
      hasWindowSprites: Boolean((pageWindow as any).Sprites),
    },
  });

  return this;
}

/** Désinstalle les hooks et nettoie. */
public destroy(): void {
  if (!this.initialized) return;

  // observers
  this.observers.forEach(o => { try { o.disconnect(); } catch {} });
  this.observers = [];

  // restore <img>.src + setAttribute
  if (this.patched.imgDesc) {
    Object.defineProperty(HTMLImageElement.prototype, "src", this.patched.imgDesc);
    this.patched.imgDesc = undefined;
  }
  if (this.patched.setAttr) {
    (HTMLImageElement.prototype as any).setAttribute = this.patched.setAttr;
    this.patched.setAttr = undefined;
  }

  // restore Worker / Blob / createObjectURL
  if (this.patched.Worker) {
    (pageWindow as any).Worker = this.patched.Worker;
    if (pageWindow !== pageWindow) (pageWindow as any).Worker = this.patched.Worker;
    this.patched.Worker = undefined;
  }
  if (this.patched.Blob) {
    (pageWindow as any).Blob = this.patched.Blob;
    if (pageWindow !== pageWindow) (pageWindow as any).Blob = this.patched.Blob;
    this.patched.Blob = undefined;
  }
  if (this.patched.createObjectURL) {
    const pageURL = ((pageWindow as any).URL ?? URL) as typeof URL;
    pageURL.createObjectURL = this.patched.createObjectURL;
    if (pageWindow !== pageWindow) URL.createObjectURL = this.patched.createObjectURL;
    this.patched.createObjectURL = undefined;
  }

  if (this.onMessageListener) {
    pageWindow.removeEventListener("message", this.onMessageListener, true);
    this.onMessageListener = undefined;
  }

  this.initialized = false;
}

  /* ===================== PUBLIC API ===================== */

  /** URLs collectées */
  public lists(): Lists {
    const result: Lists = { all: [...this.all] };
    for (const [family, assets] of this.familyAssets) {
      result[family] = [...assets];
    }
    const ensureFamily = (name: string) => {
      if (!result[name]) {
        result[name] = [...this.familySet(name)];
      }
    };
    ensureFamily("tiles");
    ensureFamily("ui");
    return result;
  }

  public listFamilies(): string[] {
    return [...this.familyAssets.keys()];
  }

  public listAssetsForFamily(family: string): string[] {
    const normalized = family?.trim().toLowerCase();
    if (!normalized) return [];
    return [...this.familySet(normalized)];
  }

  /** Ajout manuel d'un asset connu (ex: manifest) */
  public registerKnownAsset(url: string, families: string[] = ["tiles"]): boolean {
    return this.addAsset(url, families);
  }

  /** Liste des tilesheets par catégorie de nom (regex sur l'URL) */
  public listTilesByCategory(re: RegExp): string[] {
    return [...this.familySet("tiles")].filter(u => re.test(u));
  }
  public listPlants(): string[] {
    const urls = new Set(this.listTilesByCategory(/plants/i));
    for (const url of this.listAllPlants()) urls.add(url);
    return [...urls];
  }
  public listAllPlants(): string[] { return this.listTilesByCategory(this.cfg.ruleAllplants512); }
  public listItems(): string[] { return this.listTilesByCategory(/items/i); }
  public listSeeds(): string[] { return this.listTilesByCategory(/seeds/i); }
  public listPets(): string[] { return this.listTilesByCategory(/pets/i); }
  public listMap(): string[] { return this.listTilesByCategory(/map\.(png|webp)$/i); }

  /** Charge toutes les images UI (retourne Map<basename, HTMLImageElement>) */
  public async loadUI(): Promise<Map<string, HTMLImageElement>> {
    const out = new Map<string, HTMLImageElement>();
    for (const u of this.familySet("ui")) {
      if (!this.uiCache.has(u)) {
        const im = await this.loadImage(u);
        this.uiCache.set(u, im);
      }
      out.set(fileBase(u), this.uiCache.get(u)!);
    }
    return out;
  }

  /** Charge & découpe les tilesheets (retourne Map<basename, TileInfo[]>) */
  public async loadTiles(options: LoadTilesOptions = {}): Promise<Map<string, TileInfo<any>[]>> {
    const {
      mode = "bitmap",
      includeBlanks = false,
      forceSize,
      onlySheets,
    } = options;

    const out = new Map<string, TileInfo<any>[]>();
    const tiles = [...this.familySet("tiles")];
    const list = onlySheets ? tiles.filter(u => onlySheets.test(u)) : tiles;

    for (const u of list) {
      const tiles = await this.ensureTilesForUrl(u, { mode, includeBlanks, forceSize });
      out.set(fileBase(u), tiles);
    }
    return out;
  }

  public async preloadTilesGradually(options: PreloadTilesOptions = {}): Promise<void> {
    const {
      mode = "bitmap",
      includeBlanks = false,
      forceSize,
      onlySheets,
      batchSize = 1,
      delayMs = 40,
      onProgress,
    } = options;

    const tiles = [...this.familySet("tiles")];
    const list = onlySheets ? tiles.filter(u => onlySheets.test(u)) : tiles;
    const total = list.length;
    if (!total) return;

    const throttleBatch = Math.max(1, batchSize);
    const throttleDelay = Math.max(0, delayMs);
    let processed = 0;

    for (const url of list) {
      await this.ensureTilesForUrl(url, { mode, includeBlanks, forceSize });
      processed += 1;
      onProgress?.(processed, total);
      if (throttleDelay > 0 && processed < total && processed % throttleBatch === 0) {
        await this.delay(throttleDelay);
      }
    }
  }

  /** Raccourcis pratiques */
  public async loadTilesAuto(): Promise<Map<string, TileInfo[]>> {
    return this.loadTiles({ mode: "bitmap" });
  }
  public async loadTiles256(): Promise<Map<string, TileInfo[]>> {
    return this.loadTiles({ mode: "bitmap", forceSize: 256 });
  }
  public async loadTiles512(): Promise<Map<string, TileInfo[]>> {
    return this.loadTiles({ mode: "bitmap", forceSize: 512 });
  }

  private getCacheForMode(mode: SpriteMode): Map<string, TileInfo<any>[]> {
    if (mode === "canvas") return this.tileCacheCanvas as Map<string, TileInfo<any>[]>;
    if (mode === "dataURL") return this.tileCacheDataURL as Map<string, TileInfo<any>[]>;
    return this.tileCacheBitmap as Map<string, TileInfo<any>[]>;
  }

  private async ensureTilesForUrl(
    url: string,
    opts: { mode: SpriteMode; includeBlanks: boolean; forceSize?: 256 | 512 },
  ): Promise<TileInfo<any>[]> {
    const cache = this.getCacheForMode(opts.mode);
    let cached = cache.get(url);
    if (cached) return cached;
    const tiles = await this.sliceOne(url, opts);
    cache.set(url, tiles as any);
    return tiles as any;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => {
      pageWindow.setTimeout(resolve, ms);
    });
  }

  /** Récupère un sprite précis (par feuille + index) */
  public async getTile(sheetBase: string, index: number, mode: SpriteMode = "bitmap"): Promise<TileInfo | null> {
    const url = [...this.familySet("tiles")].find(u => fileBase(u) === sheetBase);
    if (!url) return null;
    const map = await this.loadTiles({ mode, onlySheets: new RegExp(sheetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.(png|webp)$", "i") });
    const tiles = map.get(sheetBase) || [];
    const tile = tiles.find(t => t.index === index);

    return tile ?? null;
  }

  /** Aplatis toutes les tiles en un seul tableau (utile pour un index global) */
  public async flatTiles(options: LoadTilesOptions = {}): Promise<TileInfo[]> {
    const maps = await this.loadTiles(options);
    const all: TileInfo[] = [];
    maps.forEach(arr => all.push(...arr));
    return all;
  }

  /** Exporte les UI en ZIP (brut, sans découpe) */
  public async zipUI(name = "ui_assets.zip"): Promise<void> {
    const zip = new JSZip();
    const list = [...this.familySet("ui")];
    let i = 0;
    for (const u of list) {
      try {
        const b = await this.fetchBlob(u);
        const fn = decodeURIComponent(u.split("/").pop() || "").replace(/\?.*$/, "");
        zip.file(fn, b);
      } catch { /* ignore */ }
      if (++i % 10 === 0) console.log(`[zipUI] ${i}/${list.length}`);
    }
    await this.saveZip(zip, name);
  }

  /** Exporte les tiles découpées en ZIP (auto 256/512 selon règle allplants) */
  public async zipTilesAuto(name = "tiles_auto.zip"): Promise<void> {
    await this.zipTiles({ name, mode: "bitmap" });
  }
  /** Exporte les tiles en ZIP (forcé 256/512) */
  public async zipTiles256(name = "tiles_256.zip"): Promise<void> {
    await this.zipTiles({ name, mode: "bitmap", forceSize: 256 });
  }
  public async zipTiles512(name = "tiles_512.zip"): Promise<void> {
    await this.zipTiles({ name, mode: "bitmap", forceSize: 512 });
  }

  /** Exporte toutes les tiles découpées + les assets UI dans un seul ZIP */
  public async zipAllSprites(name = "sprites_all.zip"): Promise<void> {
    const zip = new JSZip();
    const tilesFolder = zip.folder("tiles");
    const uiFolder = zip.folder("ui");

    if (tilesFolder) {
      for (const url of this.familySet("tiles")) {
        try {
          const tiles = await this.sliceOne(url, {
            mode: "canvas",
            includeBlanks: false,
          });
          if (!tiles.length) continue;

          const base = fileBase(url);
          const sheetFolder = tilesFolder.folder(base) ?? tilesFolder;
          let index = 0;

          for (const tile of tiles) {
            const canvas = tile.data as HTMLCanvasElement;
            const baseName = `tile_${String(++index).padStart(4, "0")}`;
            try {
              const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => {
                  if (!b) {
                    reject(new Error("toBlob returned null"));
                    return;
                  }
                  resolve(b);
                }, "image/png");
              });
              sheetFolder.file(`${baseName}.png`, blob);
            } catch (error) {
              console.warn("[Sprites] Failed to export tile", { url, error });
            }
          }
        } catch (error) {
          console.warn("[Sprites] Failed to export sheet", { url, error });
        }
      }
    }

    if (uiFolder) {
      let fallbackIndex = 0;
      for (const url of this.familySet("ui")) {
        try {
          const blob = await this.fetchBlob(url);
          const base = decodeURIComponent(url.split("/").pop() || "").replace(/\?.*$/, "");
          const fileName = base || `asset_${String(++fallbackIndex).padStart(4, "0")}.png`;
          uiFolder.file(fileName, blob);
        } catch (error) {
          console.warn("[Sprites] Failed to export UI asset", { url, error });
        }
      }
    }

    await this.saveZip(zip, name);
  }

  /** Exporte une sélection de tiles avec les filtres (si fournis). */
  public async exportFilteredTileset(opts: {
    tiles: TileInfo[];
    filters?: string[];
    baseName: string;
    filename?: string;
    onProgress?: (processed: number, total: number) => void;
  }): Promise<void> {
    const { tiles, filters = [], baseName, filename = `${baseName}_tiles.zip` } = opts;
    const zip = new JSZip();
    let index = 0;

    for (const tile of tiles) {
      const baseCanvas = this.tileToCanvas(tile);
      let canvas = baseCanvas;

      for (const filterName of filters) {
        const filtered = this.applyCanvasFilter(canvas, filterName);
        if (filtered) canvas = filtered;
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) {
            reject(new Error("canvas.toBlob returned null"));
            return;
          }
          resolve(b);
        }, "image/png");
      });

      zip.file(`${baseName}/tile_${String(++index).padStart(4, "0")}.png`, blob);
      opts.onProgress?.(index, tiles.length);
    }

    await this.saveZip(zip, filename);
  }

  public async exportAssets(opts: {
    urls: string[];
    baseName: string;
    filename?: string;
    onProgress?: (processed: number, total: number) => void;
  }): Promise<void> {
    const { urls, baseName, filename = `${baseName}_assets.zip` } = opts;
    if (!urls.length) return;
    const zip = new JSZip();
    const folder = zip.folder(baseName) ?? zip;
    let index = 0;

    for (const url of urls) {
      index++;
      try {
        const blob = await this.fetchBlob(url);
        let name = decodeURIComponent(url.split("/").pop() ?? "");
        name = name.replace(/\?.*$/, "");
        if (!name) name = `asset_${String(index).padStart(4, "0")}.png`;
        folder.file(name, blob);
      } catch (error) {
        console.warn("[Sprites] Failed to fetch asset", { url, error });
      } finally {
        opts.onProgress?.(index, urls.length);
      }
    }

    await this.saveZip(zip, filename);
  }

/** Vide les caches */
  public clearCaches(): void {
    // Fermer proprement les ImageBitmap
    this.tileCacheBitmap.forEach(arr => arr.forEach(t => (t.data as ImageBitmap).close?.()));
    this.tileCacheBitmap.clear();
    this.tileCacheCanvas.clear();
    this.tileCacheDataURL.clear();
    this.uiCache.clear();
  }

  public toCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
    return this.tileToCanvas(tile);
  }

  public applyCanvasFilter(canvas: HTMLCanvasElement, filterName: string): HTMLCanvasElement | null {
    const cfg = spriteFilters[filterName];
    if (!cfg) return null;
    const w = canvas.width;
    const h = canvas.height;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = cfg.blendMode;
    if (cfg.alpha != null) ctx.globalAlpha = cfg.alpha;

    if (cfg.masked) {
      const mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
      const mctx = mask.getContext("2d")!;
      this.drawGradient(mctx, w, h, cfg);
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(canvas, 0, 0);
      mctx.globalCompositeOperation = "source-over";
      ctx.drawImage(mask, 0, 0);
    } else {
      this.drawGradient(ctx, w, h, cfg);
    }

    ctx.restore();
    return out;
  }

  public applySpriteFilter(
    tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
    filterName: string,
  ): HTMLCanvasElement | null {
    const canvas = this.tileToCanvas(tile);
    return this.applyCanvasFilter(canvas, filterName);
  }

  public renderPlantWithMutationsNonTall(opts: {
    baseTile: TileInfo<ImageBitmap | HTMLCanvasElement | string>;
    mutations: string[];
    mutationIcons: Record<string, MutationIconTile>;
  }): HTMLCanvasElement {
      const { baseTile, mutations, mutationIcons } = opts;

  // 1) Canvas de base
  let canvas = this.tileToCanvas(baseTile);
  const size = canvas.width;
  let ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // 2) Mutations triées
  const ordered = this.sortMutations(mutations);

  // Séparation : celles qui affectent la couleur vs le reste
  // Séparation : celles qui affectent la couleur vs le reste
const colorMutations = ordered.filter(
  (m) =>
    m === "Gold" ||
    m === "Rainbow" ||
    m === "Wet" ||
    m === "Chilled" ||
    m === "Frozen" ||
    m === "Dawnlit" ||
    m === "Ambershine" ||
    m === "Dawncharged" ||
    m === "Ambercharged",
) as MutationName[];


  const iconMutations = ordered.filter(
    (m) => m !== "Gold" && m !== "Rainbow",   // Gold / Rainbow = que couleur
  ) as MutationName[];

  // 3) Filtres de couleur : Gold > Rainbow > reste
  if (colorMutations.length) {
    canvas = this.applyColorMutations(canvas, colorMutations);
    ctx = canvas.getContext("2d")!;
  }

  // 4) Icônes : on dessine avec la liste complète (sans Gold/Rainbow)
  if (iconMutations.length) {
    this.drawMutationIconsNonTall(ctx, iconMutations, size, mutationIcons);
  }

  return canvas;
}

  private sortMutations(mutations: string[]): MutationName[] {
    const seen = new Set<MutationName>();
    for (const raw of mutations) {
      const key = raw as MutationName;
      if (MUTATION_PRIORITY.includes(key) && !seen.has(key)) {
        seen.add(key);
      }
    }
    return Array.from(seen).sort(
      (a, b) => MUTATION_PRIORITY.indexOf(a) - MUTATION_PRIORITY.indexOf(b),
    );
  }

  private applyColorMutations(
  input: HTMLCanvasElement,
  mutations: MutationName[],
): HTMLCanvasElement {
  if (!mutations.length) return input;

  if (mutations.includes("Gold")) {
    return this.applyFilterChain(input, ["Gold"]);
  }
  if (mutations.includes("Rainbow")) {
    return this.applyFilterChain(input, ["Rainbow"]);
  }

  const others = mutations.filter((m) => m !== "Gold" && m !== "Rainbow");
  return this.applyFilterChain(input, others);
}


  private applyFilterChain(
    input: HTMLCanvasElement,
    filters: MutationName[],
  ): HTMLCanvasElement {
    let current = input;
    for (const f of filters) {
      const next = this.applyCanvasFilter(current, f);
      if (next) current = next;
    }
    return current;
  }

  private drawMutationIconsNonTall(
    ctx: CanvasRenderingContext2D,
    mutations: MutationName[],
    tileSize: number,
    mutationIcons: Record<string, MutationIconTile>,
  ): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    for (const m of mutations) {
      const conf = mutationIcons[m];
      if (!conf) continue;

      const iconCanvas = this.tileToCanvas(conf.tile);
      const srcW = iconCanvas.width;
      const srcH = iconCanvas.height;

      const scale = conf.scale ?? 1;
      const dstW = tileSize * scale;
      const dstH = tileSize * scale;

      const baseOffsetY = HIGH_MUTATIONS.has(m) ? -tileSize * 0.25 : 0;
      const offsetX = (conf.offsetX ?? 0) * tileSize;
      const offsetY = (conf.offsetY ?? 0) * tileSize + baseOffsetY;

      ctx.drawImage(
        iconCanvas,
        0,
        0,
        srcW,
        srcH,
        offsetX,
        offsetY,
        dstW,
        dstH,
      );
    }

    ctx.restore();
  }

  private drawGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: SpriteFilterConfig
): void {
  const baseColors = cfg.colors.length ? cfg.colors : ["#ffffff"];
  const colors = cfg.reverse ? [...baseColors].reverse() : baseColors;

  if (cfg.gradientAngle != null) {
    // Cas Rainbow & co : gradient angulaire
    const grad = this.makeAngleGradient(ctx, w, h, cfg.gradientAngle);

    if (colors.length === 1) {
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[0]);
    } else {
      colors.forEach((color, idx) => {
        grad.addColorStop(idx / (colors.length - 1), color);
      });
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // Cas normal (Wet, Chilled, etc.) : gradient vertical simple
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (colors.length === 1) {
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[0]);
  } else {
    colors.forEach((color, idx) => {
      grad.addColorStop(idx / (colors.length - 1), color);
    });
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}




  /* ===================== INTERNE: chargement/découpe ===================== */

  private async loadImage(url: string): Promise<HTMLImageElement> {
    return await new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
  }

  private guessSize(url: string, img: HTMLImageElement, forced?: number): number {
    if (forced) return forced;
    if (this.cfg.ruleAllplants512.test(url)) return 512;
    // fallback sûr
    if (img.width % 256 === 0 && img.height % 256 === 0) return 256;
    if (img.width % 512 === 0 && img.height % 512 === 0) return 512;
    return 256;
  }

  private isBlankOrBlack(data: ImageData): boolean {
    const aThr = this.cfg.skipAlphaBelow;
    const bThr = this.cfg.blackBelow;
    const tol = this.cfg.tolerance;
    const d = data.data;
    const maxColored = Math.ceil((d.length / 4) * tol);
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a > aThr) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > bThr || g > bThr || b > bThr) {
          if (++colored > maxColored) return false;
        }
      }
    }
    return true;
  }

  private async sliceOne(url: string, opts: { mode: SpriteMode; includeBlanks: boolean; forceSize?: 256 | 512 }): Promise<TileInfo[]> {
    const img = await this.loadImage(url);
    const size = this.guessSize(url, img, opts.forceSize);
    const cols = Math.floor(img.width / size);
    const rows = Math.floor(img.height / size);
    const base = fileBase(url);

    const can = document.createElement("canvas");
    can.width = size; can.height = size;
    const ctx = can.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;

    const list: TileInfo[] = [];
    let idx = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, col * size, row * size, size, size, 0, 0, size, size);

        let blank = false;
        try {
          const data = ctx.getImageData(0, 0, size, size);
          blank = this.isBlankOrBlack(data);
        } catch {
          // canvas tainted → impossible de tester → on conserve
          blank = false;
        }
        if (!opts.includeBlanks && blank) { idx++; continue; }

        if (opts.mode === "bitmap") {
          const bmp = await createImageBitmap(can);
          list.push({ sheet: base, url, index: idx, col, row, size, data: bmp });
        } else if (opts.mode === "canvas") {
          const clone = document.createElement("canvas");
          clone.width = size; clone.height = size;
          clone.getContext("2d")!.drawImage(can, 0, 0);
          list.push({ sheet: base, url, index: idx, col, row, size, data: clone });
        } else {
          const dataURL: string = await new Promise<string>((resolve, reject) => {
            can.toBlob((blob) => {
                if (!blob) { reject(new Error("toBlob returned null")); return; }
                const fr = new FileReader();
                fr.onerror = reject;
                fr.onload = () => resolve(fr.result as string); // readAsDataURL => string
                fr.readAsDataURL(blob);
            }, "image/png");
            });

            list.push({ sheet: base, url, index: idx, col, row, size, data: dataURL });
        }
        idx++;
      }
    }
    return list;
  }

  private async zipTiles(opts: { name: string; mode: SpriteMode; forceSize?: 256 | 512 }): Promise<void> {
    const zip = new JSZip();
    for (const u of this.familySet("tiles")) {
      const tiles = await this.sliceOne(u, { mode: "canvas", includeBlanks: false, forceSize: opts.forceSize });
      const base = fileBase(u);
      let k = 0;
      for (const t of tiles) {
        const can = t.data as HTMLCanvasElement;
        const blob: Blob = await new Promise(res => can.toBlob(b => res(b as Blob), "image/png"));
        zip.file(`${base}/tile_${String(++k).padStart(4, "0")}.png`, blob);
      }
    }
    await this.saveZip(zip, opts.name);
  }

    /** Convertit tile.data -> Canvas (ImageBitmap/Canvas). Refuse dataURL (string). */
  private tileToCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
    const src = tile.data as any;
    let w = tile.size, h = tile.size;

    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    if (src instanceof HTMLCanvasElement) {
        w = src.width; h = src.height; out.width = w; out.height = h;
        ctx.drawImage(src, 0, 0);
    } else if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
        w = src.width; h = src.height; out.width = w; out.height = h;
        ctx.drawImage(src, 0, 0);
    } else if (typeof src === "string") {
        throw new Error("Sprites: tile.data est un dataURL (string). Recharge la tuile en mode 'canvas' ou 'bitmap'.");
    } else {
        // fallback (rare)
        ctx.drawImage(src as CanvasImageSource, 0, 0);
    }
    return out;
  }

    /** Crée un gradient linéaire à un angle (deg) couvrant tout le canvas */
  private makeAngleGradient(ctx: CanvasRenderingContext2D, w: number, h: number, angleDeg: number): CanvasGradient {
  // Comme dans le jeu : angle - 90°, rayon = min(w,h)/2
  const rad = (angleDeg - 90) * Math.PI / 180;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2; // et pas hypot(w,h)

  const x0 = cx - Math.cos(rad) * R;
  const y0 = cy - Math.sin(rad) * R;
  const x1 = cx + Math.cos(rad) * R;
  const y1 = cy + Math.sin(rad) * R;

  return ctx.createLinearGradient(x0, y0, x1, y1);
}


  /* ===================== SNIFFERS (UI + Tiles) ===================== */

  private add(url: string, _why = ""): void {
      const families = guessFamiliesFromUrl(url);
      if (!families.length) return;
      this.addAsset(url, families);
    }

  private addAsset(url: string, families: string[] = ["tiles"]): boolean {
    const abs = toAbs(url);
    if (!isImageUrl(abs) || this.all.has(abs)) return false;

    const normalized = this.normalizeFamilies(families);
    if (!normalized.length) return false;

    this.all.add(abs);
    this.assetFamilies.set(abs, normalized);

    for (const family of normalized) {
      let bucket = this.familyAssets.get(family);
      if (!bucket) {
        bucket = new Set();
        this.familyAssets.set(family, bucket);
      }
      bucket.add(abs);
    }

    const kind = normalized[0] ?? "unknown";
    this.onAssetCb?.(abs, kind);
    return true;
  }

  /* ===================== Utils ZIP ===================== */

  private async fetchBlob(u: string): Promise<Blob> {
    const r = await fetch(u, { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return r.blob();
  }

  private async saveZip(zip: any, name: string): Promise<void> {
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

/* ------- Expose l'instance globale pour Tampermonkey ------- */
const sharedSpritesInstance = new SpritesCore(false);
shareGlobal("Sprites", sharedSpritesInstance);

export const Sprites = sharedSpritesInstance;

/** Helper pratique à appeler dans le main de ton projet */
export function initSprites(options?: InitOptions): SpritesCore {
  const instance = Sprites.init(options);
  shareGlobal("Sprites", instance);
  console.debug("[Sprites] Instance globale disponible sur pageWindow.Sprites", {
    hasWindowProperty: "Sprites" in pageWindow,
    lists: instance.lists(),
  });
  return instance;
}

// Pour pouvoir l'appeler même sans import (depuis console/Tampermonkey)
shareGlobal("initSprites", initSprites);

export default Sprites;
