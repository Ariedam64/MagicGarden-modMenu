/* Sprites.ts — logique (sans UI) pour capturer & réutiliser les sprites (UI + Tiles).
   - Découpe auto: allplants => 512px, le reste => 256px.
   - Filtre les tuiles vides/noires (configurable).
   - Fournit des accès par catégories et des caches réutilisables.
*/

import { pageWindow, shareGlobal } from "../utils/page-context";
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
  ui: string[];
  tiles: string[];
}

export interface LoadTilesOptions {
  mode?: SpriteMode;          // "bitmap" (defaut) | "canvas" | "dataURL"
  includeBlanks?: boolean;    // garder les tuiles vides/noires (defaut false)
  forceSize?: 256 | 512;      // imposer une taille globale
  onlySheets?: RegExp;        // charger uniquement les feuilles dont l'URL matche
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
  onAsset?: (url: string, kind: "ui" | "tiles") => void;
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

function isTilesUrl(u: string): boolean {
  return (
    /\/assets\/tiles\//i.test(u) ||
    /(map|plants|allplants|items|seeds|pets|animations|mutations)\.(png|webp)$/i.test(u)
  );
}
function isUiUrl(u: string): boolean {
  return /\/assets\/ui\//i.test(u);
}

export class SpritesCore {
  /** Configuration (ajuste à la volée si besoin) */
  public cfg: Config = {
    skipAlphaBelow: 1,
    blackBelow: 8,
    tolerance: 0.005,
    ruleAllplants512: /allplants/i,
  };

  private initialized = false;
  private onAssetCb?: (url: string, kind: "ui" | "tiles") => void;
  private onMessageListener?: (e: MessageEvent) => void;

  // URLs récoltées
  private ui = new Set<string>();
  private tiles = new Set<string>();
  private all = new Set<string>();

  // Caches de sprites découpés par feuille et par mode
  private tileCacheBitmap = new Map<string, TileInfo<ImageBitmap>[]>();
  private tileCacheCanvas = new Map<string, TileInfo<HTMLCanvasElement>[]>();
  private tileCacheDataURL = new Map<string, TileInfo<string>[]>();
  // Images UI chargées
  private uiCache = new Map<string, HTMLImageElement>();

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
        ui: this.ui.size,
        tiles: this.tiles.size,
      },
    });
    return this;
  }

  console.debug("[Sprites] Initialisation des sniffers de sprites", {
    config: this.cfg,
  });

  this.installMainSniffers();
  this.installWorkerHooks();

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
    return { all: [...this.all], ui: [...this.ui], tiles: [...this.tiles] };
  }

  /** Liste des tilesheets par catégorie de nom (regex sur l'URL) */
  public listTilesByCategory(re: RegExp): string[] {
    return [...this.tiles].filter(u => re.test(u));
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
    for (const u of this.ui) {
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
    const list = onlySheets ? [...this.tiles].filter(u => onlySheets.test(u)) : [...this.tiles];

    for (const u of list) {
      const base = fileBase(u);
      let cached: TileInfo<any>[] | undefined;

      if (mode === "bitmap") cached = this.tileCacheBitmap.get(u);
      else if (mode === "canvas") cached = this.tileCacheCanvas.get(u);
      else cached = this.tileCacheDataURL.get(u);

      if (!cached) {
        const tiles = await this.sliceOne(u, { mode, includeBlanks, forceSize });
        if (mode === "bitmap") this.tileCacheBitmap.set(u, tiles as any);
        else if (mode === "canvas") this.tileCacheCanvas.set(u, tiles as any);
        else this.tileCacheDataURL.set(u, tiles as any);
        cached = tiles as any;
      }
      out.set(base, cached!);
    }
    return out;
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

  /** Récupère un sprite précis (par feuille + index) */
  public async getTile(sheetBase: string, index: number, mode: SpriteMode = "bitmap"): Promise<TileInfo | null> {
    const url = [...this.tiles].find(u => fileBase(u) === sheetBase);
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
    const list = [...this.ui];
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
      for (const url of this.tiles) {
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
            const tileIndex = ++index;
            const baseName = `tile_${String(tileIndex).padStart(4, "0")}`;

            const exportVariant = async (
              suffix: string,
              label: string,
              factory: () => HTMLCanvasElement,
            ): Promise<void> => {
              try {
                const variantCanvas = factory();
                const blob = await new Promise<Blob>((resolve, reject) => {
                  variantCanvas.toBlob((b) => {
                    if (!b) {
                      reject(new Error("toBlob returned null"));
                      return;
                    }
                    resolve(b);
                  }, "image/png");
                });
                sheetFolder.file(`${baseName}${suffix}.png`, blob);
              } catch (error) {
                console.warn("[Sprites] Failed to export tile", { url, label, error });
              }
            };

            await exportVariant("", "base", () => canvas);
            await exportVariant("_gold", "gold", () => this.effectGold(tile));
            await exportVariant("_rainbow", "rainbow", () => this.effectRainbow(tile));
          }
        } catch (error) {
          console.warn("[Sprites] Failed to export sheet", { url, error });
        }
      }
    }

    if (uiFolder) {
      let fallbackIndex = 0;
      for (const url of this.ui) {
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

  /** Vide les caches */
  public clearCaches(): void {
    // Fermer proprement les ImageBitmap
    this.tileCacheBitmap.forEach(arr => arr.forEach(t => (t.data as ImageBitmap).close?.()));
    this.tileCacheBitmap.clear();
    this.tileCacheCanvas.clear();
    this.tileCacheDataURL.clear();
    this.uiCache.clear();
  }

  /** Applique l’effet Gold sur une tuile — retourne un NOUVEAU canvas. */
public effectGold(
    tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
    opts?: { alpha?: number; color?: string }
    ): HTMLCanvasElement {
    const srcCan = this.tileToCanvas(tile);
    const w = srcCan.width, h = srcCan.height;

    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Dessine le sprite de base
    ctx.drawImage(srcCan, 0, 0);

    // Applique le tint or (même réglages que ton SMUT)
    const alpha = opts?.alpha ?? 0.7;
    const color = opts?.color ?? "rgb(255, 215, 0)";

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = alpha;

    // Dans le jeu ils font un gradient vertical même à 1 couleur → équiv. à un fill plein
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    return out;
  }

    /** Applique l’effet Rainbow (dégradé masqué + blend 'color' si dispo, sinon 'source-atop') */
  /** Rainbow identique au jeu (masked + blend 'color' + angle 130°). */
  public effectRainbow(
    tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
    opts?: { angle?: number; colors?: string[] }
    ): HTMLCanvasElement {
    const srcCan = this.tileToCanvas(tile);
    const w = srcCan.width, h = srcCan.height;

    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Sprite de base
    ctx.drawImage(srcCan, 0, 0);

    // Paramètres strictement identiques à ton script
    const angle = opts?.angle ?? 130;
    const colors = opts?.colors ?? ["#FF1744","#FF9100","#FFEA00","#00E676","#2979FF","#D500F9"];

    // 1) Dégradé temporaire (géométrie "angle-90", rayon size/2)
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    tctx.imageSmoothingEnabled = false;

    const size = w; // dans le jeu/ton script c'est 'size' (tu passais out.width) → tiles carrées
    const rad = (angle - 90) * Math.PI / 180;
    const cx = w / 2, cy = h / 2;
    const x1 = cx - Math.cos(rad) * (size / 2);
    const y1 = cy - Math.sin(rad) * (size / 2);
    const x2 = cx + Math.cos(rad) * (size / 2);
    const y2 = cy + Math.sin(rad) * (size / 2);

    const grad = tctx.createLinearGradient(x1, y1, x2, y2);
    if (colors.length <= 1) {
        const c0 = colors[0] ?? "#ffffff";
        grad.addColorStop(0, c0); grad.addColorStop(1, c0);
    } else {
        colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
    }
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, w, h);

    // 2) Masque: on garde le dégradé là où le sprite est opaque
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(srcCan, 0, 0);
    tctx.globalCompositeOperation = "source-over";

    // 3) Composition finale avec blend 'color' (comme le jeu)
    ctx.save();
    ctx.globalCompositeOperation = "color" as GlobalCompositeOperation;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();

    return out;
  }


    /** Helper générique: applique "Gold" ou "Rainbow" selon le nom */
  public effectApply(
    name: "Gold" | "Rainbow",
    tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
    opts?: any
    ): HTMLCanvasElement {
    return name === "Gold" ? this.effectGold(tile, opts) : this.effectRainbow(tile, opts);
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
    for (const u of this.tiles) {
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

  /** Teste si un mode de blend est supporté par le Canvas 2D */
  private supportsBlend(op: GlobalCompositeOperation): boolean {
    try {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const g = c.getContext("2d")!;
        const before = g.globalCompositeOperation;
        g.globalCompositeOperation = op as any;
        const ok = g.globalCompositeOperation === op;
        g.globalCompositeOperation = before;
        return ok;
    } catch { return false; }
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
    const rad = (angleDeg * Math.PI) / 180;
    const cx = w / 2, cy = h / 2;
    const R = Math.hypot(w, h);
    const x0 = cx - Math.cos(rad) * R, y0 = cy - Math.sin(rad) * R;
    const x1 = cx + Math.cos(rad) * R, y1 = cy + Math.sin(rad) * R;
    return ctx.createLinearGradient(x0, y0, x1, y1);
  }


  /* ===================== SNIFFERS (UI + Tiles) ===================== */

    private add(url: string, _why = ""): void {
    const abs = toAbs(url);
    if (!isImageUrl(abs) || this.all.has(abs)) return;

    if (isUiUrl(abs)) {
        this.ui.add(abs); this.all.add(abs);
        console.debug("[Sprites] Asset UI détecté", { url: abs, totals: this.ui.size });
        this.onAssetCb?.(abs, "ui");
    } else if (isTilesUrl(abs)) {
        this.tiles.add(abs); this.all.add(abs);
        console.debug("[Sprites] Tilesheet détecté", { url: abs, totals: this.tiles.size });
        this.onAssetCb?.(abs, "tiles");
    }
    }

private installMainSniffers(): void {
  // <img src=...>
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (desc && !this.patched.imgDesc) {
      this.patched.imgDesc = desc;
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        set: function (this: HTMLImageElement, v: string) {
          // ⚠ ici on ne touche pas à 'this' (c'est bien l'img)
          (pageWindow as any).Sprites?.add?.(v, "img");
          return (desc.set as any).call(this, v);
        },
        get: desc.get as any,
        configurable: true,
        enumerable: desc.enumerable!,
      });

      // ---- setAttribute hook (fix) ----
      const proto = HTMLImageElement.prototype as any;
      const nativeSetAttr = proto.setAttribute;
      this.patched.setAttr = nativeSetAttr;

      const self = this;
      proto.setAttribute = function (this: HTMLImageElement, name: any, value: any) {
        try {
          if (String(name).toLowerCase() === "src" && typeof value === "string") {
            self.add(value, "img-attr");
          }
        } catch {}
        // IMPORTANT : appeler le natif avec le bon 'this'
        return nativeSetAttr.call(this, name, value);
      };
    }
  } catch {}

  // PerformanceObserver…
  try {
    if ("PerformanceObserver" in pageWindow) {
      const po = new PerformanceObserver((list) => {
        list.getEntries().forEach((e: PerformanceEntry) => this.add((e as any).name, "po"));
      });
      po.observe({ entryTypes: ["resource"] });
      this.observers.push(po);
    }
  } catch {}
}


  private workerPreludeSource(): string {
    return `
      (function(){
        const IMG=/\\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|ktx2|basis)$/i;
        const isImg=(u)=>{ try{return IMG.test(u)&&!String(u).startsWith('blob:')}catch{return false} };
        const post=(o)=>{ try{ self.postMessage(Object.assign({__awc:1}, o)); }catch{} };

        const F=self.fetch;
        if(F){
          self.fetch=async function(...a){
            let u=a[0]; try{ u=typeof u==='string'?u:(u&&u.url)||u; }catch{}
            const r=await F.apply(this,a);
            try{
              const ct=(r.headers&&r.headers.get&&r.headers.get('content-type'))||'';
              if((u&&isImg(u)) || /^image\\//i.test(ct)) post({ url:(typeof u==='string'?u:(u&&u.url)||String(u)), src:'worker:fetch', ct });
            }catch{}
            return r;
          };
        }

        const CIB=self.createImageBitmap;
        if(CIB){
          self.createImageBitmap=async function(b,...rest){
            try{ if(b&&/^image\\//i.test(b.type)) post({ url:'blob://imagebitmap', src:'worker:cib', ct:b.type }); }catch{}
            return CIB.call(this,b,...rest);
          };
        }

        const IS=self.importScripts;
        if(IS){
          self.importScripts=function(...urls){
            try{ urls.forEach(u=>post({ url:u, src:'worker:importScripts' })); }catch{}
            return IS.apply(this,urls);
          };
        }
      })();
    `;
  }

  private installWorkerHooks(): void {
    const pageGlobal = pageWindow as any;
    const sandboxGlobal = pageWindow as any;
    const isIsolated = pageWindow !== pageWindow;

    const NativeWorker = pageGlobal.Worker as typeof Worker | undefined;
    const NativeBlob = pageGlobal.Blob as (typeof Blob) | undefined;
    const pageURL = (pageGlobal.URL ?? URL) as typeof URL;
    const NativeCreate = pageURL.createObjectURL.bind(pageURL);
    if (!NativeBlob || !NativeWorker) return;

    if (!this.patched.Blob) {
      this.patched.Blob = NativeBlob;
      const OriginalBlob = this.patched.Blob;
      const self = this;

      const PatchedBlob = function (parts: any[] = [], opts: BlobPropertyBag = {}): Blob {
        const b = new OriginalBlob!(parts, opts);
        const type = (opts && opts.type) || "";
        if (/javascript|ecmascript/i.test(type)) {
          let ok = true, txt = "";
          for (const p of parts) { if (typeof p === "string") txt += p; else { ok = false; break; } }
          if (ok) self.blobText.set(b, txt);
        }
        return b;
      } as any;

      pageGlobal.Blob = PatchedBlob;
      if (isIsolated) sandboxGlobal.Blob = PatchedBlob;

      // garder au moins le prototype d’instance
      pageGlobal.Blob.prototype = OriginalBlob!.prototype;
      if (isIsolated) sandboxGlobal.Blob.prototype = OriginalBlob!.prototype;
    }

    // 2) Patch createObjectURL pour injecter le préambule dans les blob workers
    if (!this.patched.createObjectURL) {
      this.patched.createObjectURL = pageURL.createObjectURL;
      const prelude = this.workerPreludeSource();
      const self = this;
      const patchedCreateObjectURL = function (obj: any): string {
        if (obj instanceof pageGlobal.Blob || obj instanceof Blob) {
          const type = (obj.type || "").toLowerCase();
          const txt = self.blobText.get(obj) || "";
          const looksWorkerJS = /javascript/.test(type) || /onmessage|fetch\(|importScripts/.test(txt);
          if (looksWorkerJS && txt) {
            const patched = new NativeBlob([prelude + "\n" + txt + "\n//# sourceURL=sprites-blob.js"], { type: type || "application/javascript" });
            return NativeCreate(patched);
          }
        }
        return NativeCreate(obj);
      } as typeof URL.createObjectURL;

      pageURL.createObjectURL = patchedCreateObjectURL;
      if (isIsolated) URL.createObjectURL = patchedCreateObjectURL;
    }

    // 3) Wrap Worker(URL) pour injecter le préambule avant import
    if (!this.patched.Worker) {
      this.patched.Worker = pageGlobal.Worker;
      const prelude = this.workerPreludeSource();
      const self = this;
      const PatchedWorker = function (url: string | URL, opts?: WorkerOptions): Worker {
        try {
          const abs = new URL(String(url), location.href).href;
          if (!abs.startsWith("blob:")) {
            const isModule = opts && (opts as WorkerOptions).type === "module";
            const src = isModule
              ? `${prelude}\nimport "${abs}";\n//# sourceURL=sprites-wrapper-module.js`
              : `${prelude}\ntry{importScripts("${abs}")}catch(e){}\n//# sourceURL=sprites-wrapper-classic.js`;
            const blob = new NativeBlob([src], { type: "text/javascript" });
            const u = NativeCreate(blob);
            const w = new (self.patched.Worker as any)(u, isModule ? { type: "module" } : {});
            self.attachWorkerListener(w);
            return w;
          }
        } catch { /* fallthrough */ }
        const w = new (self.patched.Worker as any)(url, opts);
        self.attachWorkerListener(w);
        return w;
      } as any;

      pageGlobal.Worker = PatchedWorker;
      if (isIsolated) sandboxGlobal.Worker = PatchedWorker;
      (pageGlobal.Worker as any).toString = () => (this.patched.Worker as any).toString();
      if (isIsolated) (sandboxGlobal.Worker as any).toString = () => (this.patched.Worker as any).toString();
    }
  }

  private attachWorkerListener(w: Worker): void {
    try {
      w.addEventListener("message", (e: MessageEvent) => {
        const d: any = e.data;
        if (d && d.__awc && d.url) this.add(d.url, d.src || "worker");
      });
    } catch { /* ignore */ }
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

/* ------- (Option bundler) -------
- Si tu construis côté bundler (Vite/Webpack), importe JSZip au lieu du declare :
    import JSZip from "jszip";
  et exporte juste:
    export const Sprites = new SpritesCore();
---------------------------------- */

export default Sprites;
