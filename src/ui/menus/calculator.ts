// src/ui/menus/calculator.ts
import { addStyle } from "../../core/dom";
import { Sprites } from "../../core/sprite";
import { ensureSpritesReady } from "../../services/assetManifest";
import {
  coin,
  mutationCatalog,
  plantCatalog,
  tileRefsMutationLabels,
} from "../../data/hardcoded-data.clean";
import { loadTileSheet } from "../../utils/tileSheet";
import { DefaultPricing, estimateProduceValue } from "../../utils/calculators";
import {
  createPlantSprite,
  getLockerSeedEmojiForKey,
  getLockerSeedEmojiForSeedName,
  getLockerSeedOptions,
  scheduleLockerSpritePreload,
  type LockerSeedOption,
} from "./locker";
import { Menu } from "../menu";

const ROOT_CLASS = "mg-crop-simulation";
const SIZE_MIN = 50;
const SIZE_MAX = 100;
const SCALE_MIN = 1;
const SCALE_MAX = 3;

const COLOR_MUTATION_LABELS = ["None", "Gold", "Rainbow"] as const;
const WEATHER_CONDITION_LABELS = ["None", "Wet", "Chilled", "Frozen"] as const;
const WEATHER_LIGHTING_LABELS = ["None", "Dawnlit", "Dawnbound", "Amberlit", "Amberbound"] as const;
const FRIEND_BONUS_LABELS = ["+0%", "+10%", "+20%", "+30%", "+40%", "+50%"] as const;
const FRIEND_BONUS_MIN_PLAYERS = 1;
const FRIEND_BONUS_MAX_PLAYERS = FRIEND_BONUS_LABELS.length;

const COLOR_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgColor: "none" },
  Gold: { mgColor: "gold" },
  Rainbow: { mgColor: "rainbow" },
};

const WEATHER_CONDITION_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgWeather: "none" },
  Wet: { mgWeather: "wet" },
  Chilled: { mgWeather: "chilled" },
  Frozen: { mgWeather: "frozen" },
};

const WEATHER_LIGHTING_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgLighting: "none" },
  Dawnlit: { mgLighting: "dawnlit" },
  Dawnbound: { mgLighting: "dawnbound" },
  Amberlit: { mgLighting: "amberlit" },
  Amberbound: { mgLighting: "amberbound" },
};

type ColorLabel = (typeof COLOR_MUTATION_LABELS)[number];
type WeatherConditionLabel = (typeof WEATHER_CONDITION_LABELS)[number];
type WeatherLightingLabel = (typeof WEATHER_LIGHTING_LABELS)[number];

type CalculatorState = {
  sizePercent: number;
  color: ColorLabel;
  weatherCondition: WeatherConditionLabel;
  weatherLighting: WeatherLightingLabel;
  friendPlayers: number;
};

type CalculatorRefs = {
  root: HTMLDivElement;
  sprite: HTMLSpanElement;
  sizeSlider: HTMLInputElement;
  sizeValue: HTMLSpanElement;
  sizeWeight: HTMLSpanElement;
  colorMutations: HTMLDivElement;
  weatherConditions: HTMLDivElement;
  weatherLighting: HTMLDivElement;
  friendBonus: HTMLDivElement;
  priceValue: HTMLSpanElement;
};

const segmentedUi = new Menu({ compact: true });
const ensureMenuStyles = (segmentedUi as unknown as { ensureStyles?: () => void }).ensureStyles;
ensureMenuStyles?.call(segmentedUi);

const priceFormatter = new Intl.NumberFormat("en-US");
const weightFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const DEFAULT_STATE: CalculatorState = {
  sizePercent: SIZE_MIN,
  color: "None",
  weatherCondition: "None",
  weatherLighting: "None",
  friendPlayers: FRIEND_BONUS_MIN_PLAYERS,
};


type CropSimulationSpriteOptions = {
  colorLabel?: string | null;
  weatherLabels?: readonly string[] | null;
  fallback?: string | null;
};

const BASE_SPRITE_SIZE_PX = 96;
const COLOR_VARIANTS = ["normal", "gold", "rainbow"] as const;
type ColorVariant = (typeof COLOR_VARIANTS)[number];

const WEATHER_EFFECT_PRIORITY = ["wet", "chilled", "frozen"] as const;
const LIGHTING_EFFECT_PRIORITY_GROUPS = [
  ["dawnlit"],
  ["dawnbound", "dawncharged", "dawn radiant", "dawnradiant", "dawn-radiant"],
  ["ambershine", "amberlit"],
  ["amberbound", "ambercharged", "amber radiant", "amberradiant", "amber-radiant"],
] as const;

type SpriteEffectConfig = {
  blendMode: GlobalCompositeOperation;
  colors: readonly string[];
  alpha: number;
};

const EFFECTS_CONFIG = {
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
} as const satisfies Record<string, SpriteEffectConfig>;

type EffectName = keyof typeof EFFECTS_CONFIG;

const EFFECT_PRIORITY_BY_LOWER_NAME = (() => {
  const map = new Map<string, number>();
  WEATHER_EFFECT_PRIORITY.forEach((name, index) => {
    map.set(name.toLowerCase(), index);
  });
  let offset = WEATHER_EFFECT_PRIORITY.length;
  LIGHTING_EFFECT_PRIORITY_GROUPS.forEach((group) => {
    group.forEach((name) => {
      map.set(name.toLowerCase(), offset);
    });
    offset += 1;
  });
  return map;
})();

const LIGHTING_EFFECT_NAMES_LOWER = new Set<string>([
  "dawnlit",
  "dawncharged",
  "ambershine",
  "ambercharged",
]);

const EFFECT_TOKEN_ALIASES = new Map<string, EffectName>([
  ["wet", "Wet"],
  ["damp", "Wet"],
  ["moist", "Wet"],
  ["chilled", "Chilled"],
  ["cold", "Chilled"],
  ["frozen", "Frozen"],
  ["ice", "Frozen"],
  ["icy", "Frozen"],
  ["dawnlit", "Dawnlit"],
  ["dawn-lit", "Dawnlit"],
  ["dawnbound", "Dawnlit"],
  ["dawn-bound", "Dawnlit"],
  ["dawncharged", "Dawncharged"],
  ["dawn-charged", "Dawncharged"],
  ["dawn radiant", "Dawncharged"],
  ["dawnradiant", "Dawncharged"],
  ["dawn-radiant", "Dawncharged"],
  ["ambershine", "Ambershine"],
  ["amber-shine", "Ambershine"],
  ["amberlit", "Ambershine"],
  ["amber-lit", "Ambershine"],
  ["amberbound", "Ambercharged"],
  ["amber-bound", "Ambercharged"],
  ["ambercharged", "Ambercharged"],
  ["amber-charged", "Ambercharged"],
  ["amber radiant", "Ambercharged"],
  ["amberradiant", "Ambercharged"],
  ["amber-radiant", "Ambercharged"],
]);

const EFFECT_NAME_BY_TOKEN = (() => {
  const map = new Map<string, EffectName>();
  (Object.keys(EFFECTS_CONFIG) as EffectName[]).forEach((key) => {
    map.set(key.toLowerCase(), key);
  });
  EFFECT_TOKEN_ALIASES.forEach((value, key) => {
    map.set(key, value);
  });
  return map;
})();

const WEATHER_LABEL_NORMALIZATION = (() => {
  const map = new Map<string, string>();
  const entries = tileRefsMutationLabels as Record<string, string>;
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    map.set(key.toLowerCase(), value);
    map.set(value.toLowerCase(), value);
  }
  return map;
})();

const TALL_PLANT_SEEDS = new Set(["Bamboo", "Cactus"]);

type MutationCategory = "color" | "weather";
type MutationMetadata = {
  id: string;
  label: string;
  tileRef: number | null;
  category: MutationCategory;
};

const mutationMetadataByNormalizedName = (() => {
  const map = new Map<string, MutationMetadata>();
  const catalog = mutationCatalog as Record<string, any>;
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof key !== "string" || !key.trim()) continue;
    const label =
      typeof value?.name === "string" && value.name.trim().length > 0 ? value.name : key;
    const tileRef = typeof value?.tileRef === "number" ? value.tileRef : null;
    const category: MutationCategory = tileRef != null ? "weather" : "color";
    const info: MutationMetadata = {
      id: key,
      label,
      tileRef,
      category,
    };
    map.set(key.toLowerCase(), info);
    map.set(label.toLowerCase(), info);
  }
  const tileRefLabels = tileRefsMutationLabels as Record<string, unknown>;
  for (const [key, value] of Object.entries(tileRefLabels)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const info = map.get(key.toLowerCase());
    if (!info) continue;
    const normalizedLabel = value.toLowerCase();
    if (!map.has(normalizedLabel)) {
      map.set(normalizedLabel, info);
    }
  }
  const goldInfo = map.get("gold");
  if (goldInfo) {
    map.set("golden", goldInfo);
  }
  const normalInfo: MutationMetadata = {
    id: "Normal",
    label: "Normal",
    tileRef: null,
    category: "color",
  };
  map.set("normal", normalInfo);
  return map;
})();

type NormalizedMutation = MutationMetadata;

type SpriteRenderOptions = {
  colorVariant: ColorVariant;
  weatherMutations: NormalizedMutation[];
  fallback?: string | null;
};

type OverlaySpriteLayer = {
  mutation: NormalizedMutation;
  src: string;
};

const plantSpriteCache = new Map<string, string | null>();
const plantSpritePromises = new Map<string, Promise<string | null>>();
const plantSpriteCanvasCache = new Map<string, HTMLCanvasElement | null>();
const plantSpriteCanvasPromises = new Map<string, Promise<HTMLCanvasElement | null>>();
const plantSpriteVariantCache = new Map<string, string | null>();
const plantSpriteVariantPromises = new Map<string, Promise<string | null>>();
const plantSpriteEffectVariantCache = new Map<string, string | null>();
const plantSpriteEffectVariantPromises = new Map<string, Promise<string | null>>();
const mutationSpriteCache = new Map<string, string | null>();
const mutationSpritePromises = new Map<string, Promise<string | null>>();
let spriteUpdateSeq = 0;

const CROP_SIMULATION_CSS = `
.${ROOT_CLASS} {
  display: none;
  width: min(100%, 500px);
  padding: 12px 14px;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  position: relative;
  z-index: 2000;
  pointer-events: auto;
}
.${ROOT_CLASS} .mg-crop-simulation__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.${ROOT_CLASS} .mg-crop-simulation__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #f8fafc;
}
.${ROOT_CLASS} .mg-crop-simulation__crop-name {
  font-size: 13px;
  font-weight: 600;
  color: #38bdf8;
  text-transform: capitalize;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-section {
  display: flex;
  flex-direction: column;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${BASE_SPRITE_SIZE_PX}px;
  height: ${BASE_SPRITE_SIZE_PX}px;
  position: relative;
  flex-shrink: 0;
  --mg-crop-simulation-scale: 1;
  transform-origin: center;
  transform: scale(var(--mg-crop-simulation-scale));
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer,
.${ROOT_CLASS} .mg-crop-simulation__sprite-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--base {
  z-index: 1;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--overlay {
  z-index: 2;
  transform: translateY(-4px);
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--overlay-lighting {
  transform: translateY(-30px);
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-fallback {
  z-index: 0;
  font-size: 42px;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.82);
  flex: 0 0 auto;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-value {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #f8fafc;
  text-align: right;
  width: 4ch;
  min-width: 4ch;
  flex: 0 0 4ch;
  white-space: nowrap;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-weight {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.82);
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}
.${ROOT_CLASS} .mg-crop-simulation__slider {
  flex: 1 1 auto;
  min-width: 0;
  accent-color: #38bdf8;
}
.${ROOT_CLASS} .mg-crop-simulation__price {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 14px;
  color: #ffd84d;
  align-self: flex-start;
  margin-top: auto;
}
.${ROOT_CLASS} .mg-crop-simulation__price-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  display: inline-block;
  user-select: none;
  pointer-events: none;
}
.${ROOT_CLASS} .mg-crop-simulation__price-value {
  line-height: 1;
}
.${ROOT_CLASS} .mg-crop-simulation__section-title {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}
.${ROOT_CLASS}.mg-crop-simulation--calculator {
  align-items: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: min(440px, 100%);
  margin: 0 auto;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #4446;
  background: #1f2328;
  box-shadow: 0 0 0 1px #0002 inset;
  justify-items: stretch;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section-heading {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.82);
  font-weight: 600;
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section--preview {
  justify-items: center;
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section--preview .mg-crop-simulation__slider-row {
  width: 100%;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__mutations-weather {
  display: grid;
  gap: 8px;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__mutations-heading {
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price {
  margin-top: 0;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented {
  display: flex;
  width: 100%;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented-control {
  --qmm-bg-soft: rgba(11, 15, 19, 0.8);
  --qmm-border-2: rgba(148, 163, 184, 0.28);
  --qmm-text: #e2e8f0;
  --qmm-text-dim: rgba(148, 163, 184, 0.82);
  --seg-pad: 6px;
  --seg-fill: rgba(56, 191, 248, 0.02);
  --seg-stroke-color: rgba(255, 255, 255, 0.49);
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented-control .qmm-seg__btn {
  font-size: 11px;
  letter-spacing: 0.02em;
  font-weight: 600;
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-width: 0;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="none"].active {
  color: rgba(148, 163, 184, 0.92);
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"].active {
  color: #facc15;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"] .qmm-seg__btn-label,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"].active .qmm-seg__btn-label {
  color: transparent;
  background-image: linear-gradient(90deg, #fef08a, #facc15, #fef08a);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"].active {
  color: #fbbf24;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"] .qmm-seg__btn-label,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"].active .qmm-seg__btn-label {
  color: transparent;
  background-image: linear-gradient(90deg, #f87171, #fbbf24, #34d399, #38bdf8, #c084fc);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="none"].active,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="none"].active {
  color: rgba(148, 163, 184, 0.92);
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="wet"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="wet"].active {
  color: #5AF6F5;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="chilled"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="chilled"].active {
  color: #AFE0F6;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="frozen"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="frozen"].active {
  color: #AABEFF;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnlit"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnlit"].active {
  color: #7864B4;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnbound"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnbound"].active {
  color: #9785CB;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberlit"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberlit"].active {
  color: #A04632;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberbound"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberbound"].active {
  color: #F06E50;
  font-weight: 700;
}
.${ROOT_CLASS} .mg-crop-simulation__mutations-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`;

let cropSimulationStyleEl: HTMLStyleElement | null = null;

function ensureCropSimulationStyles(): void {
  if (cropSimulationStyleEl) return;
  cropSimulationStyleEl = addStyle(CROP_SIMULATION_CSS);
}

function resolveEffectNameToken(value: unknown): EffectName | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return EFFECT_NAME_BY_TOKEN.get(normalized) ?? null;
}

function getMutationEffectName(mutation: NormalizedMutation): EffectName | null {
  return resolveEffectNameToken(mutation.id) ?? resolveEffectNameToken(mutation.label);
}

function getEffectPriority(effectName: EffectName): number {
  const lower = effectName.toLowerCase();
  return EFFECT_PRIORITY_BY_LOWER_NAME.get(lower) ?? Number.MAX_SAFE_INTEGER;
}

function isLightingEffect(effectName: EffectName): boolean {
  return LIGHTING_EFFECT_NAMES_LOWER.has(effectName.toLowerCase());
}

function normalizeEffectNames(effectNames: readonly EffectName[]): EffectName[] {
  const seen = new Set<EffectName>();
  const order = new Map<EffectName, number>();
  const normalized: EffectName[] = [];
  effectNames.forEach((name, index) => {
    if (seen.has(name)) return;
    seen.add(name);
    normalized.push(name);
    order.set(name, index);
  });
  normalized.sort((a, b) => {
    const priorityDiff = getEffectPriority(a) - getEffectPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });
  return normalized;
}

function getApplicableEffectNames(weatherMutations: NormalizedMutation[]): EffectName[] {
  const effectNames = weatherMutations
    .map((mutation) => getMutationEffectName(mutation))
    .filter((value): value is EffectName => value != null);
  return normalizeEffectNames(effectNames);
}

function makeEffectCacheKey(
  seedKey: string,
  variant: ColorVariant,
  effectNames: readonly EffectName[],
): string {
  return `${seedKey}::variant::${variant}::effects::${effectNames.join("+")}`;
}

function getMutationSheetBases(): string[] {
  const urls = new Set<string>();
  try {
    Sprites.listTilesByCategory(/mutations/i).forEach((url) => urls.add(url));
  } catch {
    /* ignore */
  }
  const bases = Array.from(urls, (url) => {
    const clean = url.split(/[?#]/)[0] ?? url;
    const file = clean.split("/").pop() ?? clean;
    return file.replace(/\.[^.]+$/, "");
  });
  return bases.length ? bases : ["mutations"];
}

async function fetchPlantSpriteCanvas(seedKey: string): Promise<HTMLCanvasElement | null> {
  await ensureSpritesReady();

  if (typeof window === "undefined") return null;
  const entry = (plantCatalog as Record<string, any>)[seedKey];
  if (!entry) return null;
  const tileRef = entry?.crop?.tileRef ?? entry?.plant?.tileRef ?? entry?.seed?.tileRef;
  const bases = plantSheetBases(seedKey);
  const index = toTileIndex(tileRef, bases);
  if (index == null) return null;

  for (const base of bases) {
    try {
      const tiles = await loadTileSheet(base);
      const tile = tiles.find((t) => t.index === index);
      if (!tile) continue;
      const canvas = Sprites.toCanvas(tile);
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext("2d");
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0);
        return copy;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function loadPlantSpriteCanvas(seedKey: string): Promise<HTMLCanvasElement | null> {
  const cached = plantSpriteCanvasCache.get(seedKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = plantSpriteCanvasPromises.get(seedKey);
  if (inFlight) return inFlight;

  const promise = fetchPlantSpriteCanvas(seedKey)
    .then((canvas) => {
      plantSpriteCanvasCache.set(seedKey, canvas);
      plantSpriteCanvasPromises.delete(seedKey);
      return canvas;
    })
    .catch(() => {
      plantSpriteCanvasCache.set(seedKey, null);
      plantSpriteCanvasPromises.delete(seedKey);
      return null;
    });

  plantSpriteCanvasPromises.set(seedKey, promise);
  return promise;
}

async function loadPlantSpriteCanvasForVariant(
  seedKey: string,
  variant: ColorVariant,
): Promise<HTMLCanvasElement | null> {
  const canvas = await loadPlantSpriteCanvas(seedKey);
  if (!canvas) return null;
  if (variant === "normal") return canvas;

  const tileInfo = {
    sheet: "",
    url: "",
    index: 0,
    col: 0,
    row: 0,
    size: canvas.width,
    data: canvas,
  } as const;
  return Sprites.toCanvas(tileInfo);
}

function loadPlantSpriteVariant(seedKey: string, variant: ColorVariant): Promise<string | null> {
  if (variant === "normal") {
    return loadPlantSprite(seedKey);
  }

  const cacheKey = `${seedKey}::${variant}`;
  const cached = plantSpriteVariantCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = plantSpriteVariantPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = loadPlantSpriteCanvasForVariant(seedKey, variant)
    .then((canvas) => {
      if (!canvas) return null;
      return canvas.toDataURL();
    })
    .then((src) => {
      plantSpriteVariantCache.set(cacheKey, src ?? null);
      plantSpriteVariantPromises.delete(cacheKey);
      return src ?? null;
    })
    .catch(() => {
      plantSpriteVariantCache.set(cacheKey, null);
      plantSpriteVariantPromises.delete(cacheKey);
      return null;
    });

  plantSpriteVariantPromises.set(cacheKey, promise);
  return promise;
}

function loadMutationSprite(mutation: NormalizedMutation): Promise<string | null> {
  const tileRef = mutation.tileRef;
  if (tileRef == null) return Promise.resolve(null);
  const cacheKey = mutation.id.toLowerCase();
  const cached = mutationSpriteCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = mutationSpritePromises.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    await ensureSpritesReady();

    const bases = getMutationSheetBases();
    const index = tileRef > 0 ? tileRef - 1 : tileRef;
    for (const base of bases) {
      try {
        const tiles = await loadTileSheet(base);
        const tile = tiles.find((t) => t.index === index);
        if (!tile) continue;
        const canvas = Sprites.toCanvas(tile);
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          const copy = document.createElement("canvas");
          copy.width = canvas.width;
          copy.height = canvas.height;
          const ctx = copy.getContext("2d");
          if (!ctx) continue;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(canvas, 0, 0);
          return copy.toDataURL();
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  })()
    .then((src) => {
      mutationSpriteCache.set(cacheKey, src);
      mutationSpritePromises.delete(cacheKey);
      return src;
    })
    .catch(() => {
      mutationSpriteCache.set(cacheKey, null);
      mutationSpritePromises.delete(cacheKey);
      return null;
    });

  mutationSpritePromises.set(cacheKey, promise);
  return promise;
}

function plantSheetBases(seedKey?: string): string[] {
  const urls = new Set<string>();
  try {
    Sprites.listPlants().forEach((url) => urls.add(url));
  } catch {
    /* ignore */
  }
  try {
    Sprites.listAllPlants().forEach((url) => urls.add(url));
  } catch {
    /* ignore */
  }
  const bases = Array.from(urls, (url) => {
    const clean = url.split(/[?#]/)[0] ?? url;
    const file = clean.split("/").pop() ?? clean;
    return file.replace(/\.[^.]+$/, "");
  });

  if (!seedKey) return bases.length ? bases : ["plants"];

  const normalizedBases = bases.map((base) => base.toLowerCase());
  const findPreferred = (
    predicate: (base: string, normalized: string) => boolean,
  ): string[] => bases.filter((base, index) => predicate(base, normalizedBases[index] ?? base.toLowerCase()));

  if (TALL_PLANT_SEEDS.has(seedKey)) {
    const tallExact = findPreferred((_, norm) => norm === "tallplants");
    if (tallExact.length) return tallExact;
    const tallAny = findPreferred((base, norm) => /tall/.test(base) || /tall/.test(norm));
    if (tallAny.length) return tallAny;
  } else {
    const plantsExact = findPreferred((_, norm) => norm === "plants");
    if (plantsExact.length) return plantsExact;
    const nonTall = findPreferred((base, norm) => !/tall/.test(base) && !/tall/.test(norm));
    if (nonTall.length) return nonTall;
  }

  return bases.length ? bases : ["plants"];
}

function toTileIndex(tileRef: unknown, bases: string[] = []): number | null {
  const value =
    typeof tileRef === "number" && Number.isFinite(tileRef)
      ? tileRef
      : Number(tileRef);
  if (!Number.isFinite(value)) return null;

  if (value <= 0) return value;

  const normalizedBases = bases.map((base) => base.toLowerCase());
  if (normalizedBases.some((base) => base.includes("tall"))) {
    return value - 1;
  }
  if (normalizedBases.some((base) => base.includes("plants"))) {
    return value - 1;
  }

  return value - 1;
}

function loadPlantSprite(seedKey: string): Promise<string | null> {
  const cached = plantSpriteCache.get(seedKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = plantSpritePromises.get(seedKey);
  if (inFlight) return inFlight;

  const promise = loadPlantSpriteCanvas(seedKey)
    .then((canvas) => {
      const src = canvas ? canvas.toDataURL() : null;
      plantSpriteCache.set(seedKey, src);
      plantSpritePromises.delete(seedKey);
      return src;
    })
    .catch(() => {
      plantSpriteCache.set(seedKey, null);
      plantSpritePromises.delete(seedKey);
      return null;
    });

  plantSpritePromises.set(seedKey, promise);
  return promise;
}

function sortMutationsForRendering(mutations: NormalizedMutation[]): NormalizedMutation[] {
  const entries = mutations.map((mutation, index) => ({ mutation, index }));
  entries.sort((a, b) => {
    const effectA = getMutationEffectName(a.mutation);
    const effectB = getMutationEffectName(b.mutation);
    const priorityA = effectA ? getEffectPriority(effectA) : Number.MAX_SAFE_INTEGER;
    const priorityB = effectB ? getEffectPriority(effectB) : Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.index - b.index;
  });
  return entries.map((entry) => entry.mutation);
}

function applyEffectToCanvas(canvas: HTMLCanvasElement, effect: SpriteEffectConfig): void {
  if (!effect.colors.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = effect.blendMode;
  ctx.globalAlpha = effect.alpha;

  if (effect.colors.length === 1) {
    ctx.fillStyle = effect.colors[0] ?? "transparent";
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const stops = effect.colors.length - 1;
    effect.colors.forEach((color, index) => {
      const stop = stops === 0 ? 0 : index / stops;
      gradient.addColorStop(stop, color);
    });
    ctx.fillStyle = gradient;
  }

  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function loadPlantSpriteWithEffects(
  seedKey: string,
  variant: ColorVariant,
  effectNames: readonly EffectName[],
): Promise<string | null> {
  const normalizedEffects = normalizeEffectNames(effectNames);
  if (!normalizedEffects.length) {
    return loadPlantSpriteVariant(seedKey, variant);
  }

  const cacheKey = makeEffectCacheKey(seedKey, variant, normalizedEffects);
  const cached = plantSpriteEffectVariantCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = plantSpriteEffectVariantPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = loadPlantSpriteCanvasForVariant(seedKey, variant)
    .then((canvas) => {
      if (!canvas) return null;
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0);
      normalizedEffects.forEach((effectName) => {
        const effect = EFFECTS_CONFIG[effectName];
        if (effect) {
          applyEffectToCanvas(copy, effect);
        }
      });
      return copy.toDataURL();
    })
    .then((src) => {
      plantSpriteEffectVariantCache.set(cacheKey, src ?? null);
      plantSpriteEffectVariantPromises.delete(cacheKey);
      return src ?? null;
    })
    .catch(() => {
      plantSpriteEffectVariantCache.set(cacheKey, null);
      plantSpriteEffectVariantPromises.delete(cacheKey);
      return null;
    });

  plantSpriteEffectVariantPromises.set(cacheKey, promise);
  return promise;
}

function getCachedPlantSpriteSource(
  seedKey: string,
  variant: ColorVariant,
  effectNames: readonly EffectName[],
): string | null | undefined {
  const normalizedEffects = normalizeEffectNames(effectNames);

  if (normalizedEffects.length === 0) {
    if (variant === "normal") {
      return plantSpriteCache.get(seedKey);
    }
    const variantCacheKey = `${seedKey}::${variant}`;
    return plantSpriteVariantCache.get(variantCacheKey);
  }

  const cacheKey = makeEffectCacheKey(seedKey, variant, normalizedEffects);
  return plantSpriteEffectVariantCache.get(cacheKey);
}

function isLightingOverlay(mutation: NormalizedMutation): boolean {
  const effectName = getMutationEffectName(mutation);
  if (!effectName) return false;
  return isLightingEffect(effectName);
}

function applySpriteElement(
  el: HTMLSpanElement,
  baseSrc: string | null,
  overlayLayers: OverlaySpriteLayer[],
  fallbackText?: string | null,
): void {
  el.innerHTML = "";

  if (baseSrc) {
    const baseLayer = document.createElement("span");
    baseLayer.className = "mg-crop-simulation__sprite-layer mg-crop-simulation__sprite-layer--base";
    const img = document.createElement("img");
    img.src = baseSrc;
    img.alt = "";
    img.decoding = "async";
    (img as any).loading = "lazy";
    img.draggable = false;
    baseLayer.appendChild(img);
    el.appendChild(baseLayer);
  }

  overlayLayers.forEach(({ src, mutation }, index) => {
    const layer = document.createElement("span");
    layer.className =
      "mg-crop-simulation__sprite-layer mg-crop-simulation__sprite-layer--overlay";
    layer.style.setProperty("--mg-crop-simulation-layer", String(index + 1));
    if (isLightingOverlay(mutation)) {
      layer.classList.add("mg-crop-simulation__sprite-layer--overlay-lighting");
    }
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    (img as any).loading = "lazy";
    img.draggable = false;
    layer.appendChild(img);
    el.appendChild(layer);
  });

  if (!baseSrc && overlayLayers.length === 0) {
    const fallback = document.createElement("span");
    fallback.className = "mg-crop-simulation__sprite-fallback";
    const content =
      typeof fallbackText === "string" && fallbackText.trim().length > 0
        ? fallbackText
        : "🌱";
    fallback.textContent = content;
    el.appendChild(fallback);
  }
}

function setSpriteElement(
  el: HTMLSpanElement,
  speciesKey: string | null,
  options: SpriteRenderOptions,
): void {
  spriteUpdateSeq += 1;
  const seq = spriteUpdateSeq;
  el.dataset.spriteSeq = String(seq);

  if (!speciesKey) {
    applySpriteElement(el, null, [], options.fallback ?? null);
    return;
  }

  const { colorVariant, weatherMutations } = options;
  const sortedMutations = sortMutationsForRendering(weatherMutations);
  const effectNames =
    colorVariant === "normal" ? getApplicableEffectNames(sortedMutations) : [];
  const cachedBase = getCachedPlantSpriteSource(speciesKey, colorVariant, effectNames);
  const cachedOverlays = sortedMutations
    .map((mutation) => {
      const src = mutationSpriteCache.get(mutation.id.toLowerCase());
      return typeof src === "string" && src.length > 0
        ? ({ mutation, src } satisfies OverlaySpriteLayer)
        : null;
    })
    .filter((value): value is OverlaySpriteLayer => value != null);

  const baseSrcCached = typeof cachedBase === "string" ? cachedBase : null;
  applySpriteElement(el, baseSrcCached, cachedOverlays, options.fallback ?? null);

  const basePromise = loadPlantSpriteWithEffects(speciesKey, colorVariant, effectNames);

  const overlayPromises = sortedMutations.map(async (mutation) => ({
    mutation,
    src: await loadMutationSprite(mutation),
  }));

  Promise.all([basePromise, Promise.all(overlayPromises)])
    .then(([baseSrc, overlays]) => {
      if (el.dataset.spriteSeq !== String(seq)) return;
      const overlaySources = overlays.filter(
        (entry): entry is OverlaySpriteLayer => typeof entry.src === "string" && entry.src.length > 0,
      );
      applySpriteElement(el, baseSrc ?? null, overlaySources, options.fallback ?? null);
    })
    .catch(() => {
      if (el.dataset.spriteSeq !== String(seq)) return;
      applySpriteElement(el, null, [], options.fallback ?? null);
    });
}

function labelToVariant(label: string): ColorVariant {
  const normalized = typeof label === "string" ? label.trim().toLowerCase() : "";
  if (normalized === "gold") return "gold";
  if (normalized === "rainbow") return "rainbow";
  return "normal";
}

function normalizeMutationName(name: string): NormalizedMutation | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const info = mutationMetadataByNormalizedName.get(normalized);
  if (info) {
    return info;
  }
  const normalizedLabel = WEATHER_LABEL_NORMALIZATION.get(normalized);
  if (normalizedLabel) {
    const fallback = mutationMetadataByNormalizedName.get(normalizedLabel.toLowerCase());
    if (fallback) {
      return fallback;
    }
  }
  return {
    id: trimmed,
    label: trimmed,
    tileRef: null,
    category: "weather",
  };
}

function applyCropSimulationSprite(
  el: HTMLSpanElement,
  speciesKey: string | null,
  options: CropSimulationSpriteOptions = {},
): void {
  const colorLabel = options.colorLabel ?? "None";
  const colorVariant = labelToVariant(colorLabel);

  const weatherLabels = Array.isArray(options.weatherLabels) ? options.weatherLabels : [];
  const seen = new Set<string>();
  const weatherMutations: NormalizedMutation[] = [];
  for (const label of weatherLabels) {
    if (!label || typeof label !== "string") continue;
    const info = normalizeMutationName(label);
    if (!info || info.category !== "weather") continue;
    const key = info.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    weatherMutations.push(info);
  }

  setSpriteElement(el, speciesKey, {
    colorVariant,
    weatherMutations,
    fallback: options.fallback ?? null,
  });
}

const applyStyles = <T extends HTMLElement>(el: T, styles: Record<string, string>): T => {
   const toKebab = (s: string) => s.startsWith("--")
     ? s
     : s.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
  for (const [key, value] of Object.entries(styles)) {
     el.style.setProperty(toKebab(key), value);
   }
   return el;
};

let calculatorStyleEl: HTMLStyleElement | null = null;

function ensureCalculatorStyles(): void {
  ensureCropSimulationStyles();
  if (calculatorStyleEl) return;
  calculatorStyleEl = addStyle(`
    .${ROOT_CLASS}.mg-crop-simulation--calculator {
      width: 100%;
      max-width: none;
      min-width: 0;
      position: relative;
    }
    .${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price {
      justify-content: center;
      margin: 0 0 12px;
      font-size: 20px;
      gap: 10px;
    }
    .${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price-value {
      font-size: 20px;
    }
    .mg-crop-calculator__placeholder {
      font-size: 13px;
      text-align: center;
      opacity: 0.7;
      padding: 24px 12px;
    }
  `);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceLabel<T extends string>(label: string, allowed: readonly T[]): T {
  const normalized = typeof label === "string" ? label.trim().toLowerCase() : "";
  for (const candidate of allowed) {
    if (candidate.toLowerCase() === normalized) {
      return candidate;
    }
  }
  return allowed[0];
}

function clampFriendPlayers(players: number | null | undefined): number {
  if (typeof players !== "number" || !Number.isFinite(players)) {
    return FRIEND_BONUS_MIN_PLAYERS;
  }
  const rounded = Math.round(players);
  return clamp(rounded, FRIEND_BONUS_MIN_PLAYERS, FRIEND_BONUS_MAX_PLAYERS);
}

function friendPlayersToLabel(players: number | null | undefined): string {
  const clamped = clampFriendPlayers(players);
  return FRIEND_BONUS_LABELS[clamped - 1] ?? FRIEND_BONUS_LABELS[0];
}

function labelToFriendPlayers(label: string): number {
  const coerced = coerceLabel(label, FRIEND_BONUS_LABELS) as (typeof FRIEND_BONUS_LABELS)[number];
  const index = FRIEND_BONUS_LABELS.indexOf(coerced);
  const players = index >= 0 ? index + 1 : FRIEND_BONUS_MIN_PLAYERS;
  return clamp(players, FRIEND_BONUS_MIN_PLAYERS, FRIEND_BONUS_MAX_PLAYERS);
}

function setSpriteScale(el: HTMLSpanElement, sizePercent: number): void {
  const clamped = clamp(Math.round(sizePercent), SIZE_MIN, SIZE_MAX);
  const scale = clamped / 100;
  el.style.setProperty("--mg-crop-simulation-scale", scale.toString());
}

function applySizePercent(
  refs: CalculatorRefs,
  sizePercent: number,
  maxScale: number | null,
  baseWeight: number | null,
): void {
  const clamped = clamp(Math.round(sizePercent), SIZE_MIN, SIZE_MAX);
  refs.sizeSlider.value = String(clamped);
  refs.sizeValue.textContent = `${clamped}%`;
  setSpriteScale(refs.sprite, clamped);
  if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN) {
    refs.sizeSlider.dataset.maxScale = String(maxScale);
  } else {
    delete refs.sizeSlider.dataset.maxScale;
  }

  const [minWeight, maxWeight] = computeWeightRange(baseWeight, clamped, maxScale);
  refs.sizeWeight.textContent = formatWeightRange(minWeight, maxWeight);
}

function formatCoinValue(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const safe = Math.max(0, Math.round(value));
  return priceFormatter.format(safe);
}

function formatCoinRange(min: number | null, max: number | null): string {
  const minValue = typeof min === "number" && Number.isFinite(min) ? Math.max(0, min) : null;
  const maxValue = typeof max === "number" && Number.isFinite(max) ? Math.max(0, max) : null;
  if (minValue == null && maxValue == null) return "—";
  if (minValue == null) return formatCoinValue(maxValue);
  if (maxValue == null) return formatCoinValue(minValue);
  if (Math.round(minValue) === Math.round(maxValue)) {
    return formatCoinValue(minValue);
  }
  return `${formatCoinValue(minValue)} – ${formatCoinValue(maxValue)}`;
}

function computeWeightRange(
  baseWeight: number | null,
  sizePercent: number,
  maxScale: number | null,
): [number | null, number | null] {
  const numericWeight = typeof baseWeight === "number" ? baseWeight : Number(baseWeight);
  if (!Number.isFinite(numericWeight) || numericWeight == null || numericWeight <= 0) {
    return [null, null];
  }
  const scale = sizePercentToScale(sizePercent, maxScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    return [null, null];
  }
  const minWeight = numericWeight * scale;
  const safeMax =
    typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN
      ? maxScale
      : SCALE_MIN;
  const variation = 1 + Math.max(0, (safeMax - scale) * 0.02);
  const maxWeight = minWeight * variation;
  return [minWeight, maxWeight];
}

function formatWeight(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const formatted = weightFormatter.format(value);
  return formatted.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatWeightRange(min: number | null, max: number | null): string {
  const minFormatted = formatWeight(min);
  const maxFormatted = formatWeight(max);
  if (!minFormatted && !maxFormatted) return "—";
  if (!maxFormatted || minFormatted === maxFormatted) {
    return `${minFormatted ?? maxFormatted} kg`;
  }
  return `${minFormatted ?? "—"} – ${maxFormatted} kg`;
}

function sizePercentToScale(sizePercent: number, maxScale: number | null): number {
  const numeric = Number(sizePercent);
  if (!Number.isFinite(numeric)) return SCALE_MIN;
  const clampedPercent = clamp(numeric, SIZE_MIN, SIZE_MAX);
  const safeMax =
    typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN
      ? maxScale
      : SCALE_MAX;
  if (safeMax <= SCALE_MIN) return SCALE_MIN;
  const normalized = (clampedPercent - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);
  const scale = SCALE_MIN + normalized * (safeMax - SCALE_MIN);
  return Number.isFinite(scale) ? scale : SCALE_MIN;
}

function createSegmentedControl<T extends string>(
  labels: readonly T[],
  selectedLabel: string,
  interactive: boolean,
  onSelect: ((label: T) => void) | undefined,
  ariaLabel: string,
): HTMLDivElement {
  const coerced = coerceLabel(selectedLabel, labels) as T;
  const items = labels.map(label => ({ value: label, label, disabled: !interactive }));
  const segmented = segmentedUi.segmented<T>(
    items,
    coerced,
    interactive && onSelect ? value => onSelect(value) : undefined,
    { ariaLabel, fullWidth: true },
  );
  segmented.classList.add("mg-crop-simulation__segmented-control");
  return segmented;
}

function applySegmentedButtonMetadata(
  segmented: HTMLDivElement,
  metadata: Record<string, Record<string, string | undefined>>,
): void {
  const buttons = segmented.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn");
  buttons.forEach(button => {
    const label = button.textContent?.trim();
    if (!label) return;
    const meta = metadata[label];
    if (!meta) return;
    Object.entries(meta).forEach(([key, value]) => {
      if (!value) return;
      (button.dataset as DOMStringMap)[key] = value;
    });
  });
}

function getMutationsForState(state: CalculatorState): string[] {
  const mutations: string[] = [];
  if (state.color !== "None") mutations.push(state.color);
  if (state.weatherCondition !== "None") mutations.push(state.weatherCondition);
  if (state.weatherLighting !== "None") mutations.push(state.weatherLighting);
  return mutations;
}

function getWeatherLabelsForState(state: CalculatorState): string[] {
  const labels: string[] = [];
  if (state.weatherCondition !== "None") labels.push(state.weatherCondition);
  if (state.weatherLighting !== "None") labels.push(state.weatherLighting);
  return labels;
}

function computePrice(
  speciesKey: string,
  state: CalculatorState,
  percent: number,
  maxScale: number | null,
): number | null {
  const scale = sizePercentToScale(percent, maxScale);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const mutations = getMutationsForState(state);
  const friendPlayers = clampFriendPlayers(state.friendPlayers);
  const pricingOptions = { ...DefaultPricing, friendPlayers };
  const value = estimateProduceValue(speciesKey, scale, mutations, pricingOptions);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getMaxScaleForSpecies(key: string): number | null {
  const entry = (plantCatalog as Record<string, any>)[key];
  const candidates = [entry?.crop?.maxScale, entry?.plant?.maxScale, entry?.seed?.maxScale];
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function getBaseWeightForSpecies(key: string): number | null {
  const entry = (plantCatalog as Record<string, any>)[key];
  const candidates = [
    entry?.produce?.baseWeight,
    entry?.crop?.baseWeight,
    entry?.item?.baseWeight,
    entry?.seed?.baseWeight,
  ];
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export async function renderCalculatorMenu(container: HTMLElement) {
  ensureCalculatorStyles();
  scheduleLockerSpritePreload();

  const ui = new Menu({ id: "calculator", compact: true });

  ui.addTab("crops", "Crops", root => {
    root.innerHTML = "";
    root.style.padding = "8px";
    root.style.boxSizing = "border-box";
    root.style.height = "61vh";
    root.style.overflow = "auto";
    root.style.display = "grid";

    const layout = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
      gap: "10px",
      alignItems: "stretch",
      height: "100%",
      overflow: "hidden",
    });
    root.appendChild(layout);

    const left = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      minHeight: "0",
      flex: "0 0 260px",
      minWidth: "220px",
      maxWidth: "280px",
    });
    layout.appendChild(left);

    const list = applyStyles(document.createElement("div"), {
  display: "grid",
  gridTemplateColumns: "1fr",
  overflow: "auto",
  paddingRight: "2px",
  border: "1px solid #4445",
  borderRadius: "10px",
  minHeight: "0",     // important
  height: "100%",     // pour que overflow: auto prenne effet
});
    left.appendChild(list);

    const right = applyStyles(document.createElement("div"), {
      display: "flex",
      flexDirection: "column",
      minHeight: "0",
      flex: "1 1 auto",
    });
    layout.appendChild(right);

    const detailScroll = applyStyles(document.createElement("div"), {
      flex: "1 1 auto",
      overflow: "auto",
      display: "flex",
      justifyContent: "center",
    });
    right.appendChild(detailScroll);

    const simulationRoot = document.createElement("div");
    simulationRoot.className = `${ROOT_CLASS} mg-crop-simulation--visible mg-crop-simulation--calculator`;

    const detailLayout = document.createElement("div");
    detailLayout.className = "mg-crop-calculator__layout";

    const createSection = (title: string | null, extraClass?: string): HTMLDivElement => {
      const section = document.createElement("div");
      section.className = "mg-crop-calculator__section";
      if (extraClass) {
        section.classList.add(extraClass);
      }
      if (title) {
        const heading = document.createElement("div");
        heading.className = "mg-crop-calculator__section-heading";
        heading.textContent = title;
        section.appendChild(heading);
      }
      return section;
    };

    const previewSection = createSection(null, "mg-crop-calculator__section--preview");

    const priceRow = document.createElement("div");
    priceRow.className = "mg-crop-simulation__price";

    const priceIcon = document.createElement("img");
    priceIcon.className = "mg-crop-simulation__price-icon";
    priceIcon.src = coin.img64;
    priceIcon.alt = "";
    priceIcon.decoding = "async";
    (priceIcon as any).loading = "lazy";
    priceIcon.setAttribute("aria-hidden", "true");
    priceIcon.draggable = false;

    const priceValue = document.createElement("span");
    priceValue.className = "mg-crop-simulation__price-value";
    priceValue.textContent = "—";

    priceRow.append(priceIcon, priceValue);

    const spriteSection = document.createElement("div");
    spriteSection.className = "mg-crop-simulation__sprite-section";

    const spriteBox = document.createElement("div");
    spriteBox.className = "mg-crop-simulation__sprite-box";

    const sprite = document.createElement("span");
    sprite.className = "mg-crop-simulation__sprite";
    spriteBox.appendChild(sprite);

    const sliderContainer = document.createElement("div");
    sliderContainer.className = "mg-crop-simulation__slider-container";

    const sliderRow = document.createElement("div");
    sliderRow.className = "mg-crop-simulation__slider-row";

    const sliderLabel = document.createElement("span");
    sliderLabel.className = "mg-crop-simulation__slider-label";
    sliderLabel.textContent = "Size";

    const slider = ui.slider(SIZE_MIN, SIZE_MAX, 1, SIZE_MIN);
    slider.classList.add("mg-crop-simulation__slider");
    slider.disabled = true;

    const sliderValue = document.createElement("span");
    sliderValue.className = "mg-crop-simulation__slider-value";
    sliderValue.textContent = `${SIZE_MIN}%`;

    const sliderWeight = document.createElement("span");
    sliderWeight.className = "mg-crop-simulation__slider-weight";
    sliderWeight.textContent = "—";

    sliderRow.append(sliderLabel, slider, sliderValue);
    sliderContainer.append(sliderRow, sliderWeight);
    spriteSection.append(spriteBox, sliderContainer);
    previewSection.appendChild(spriteSection);

    const mutationsSection = createSection("Mutations");

    const colorList = document.createElement("div");
    colorList.className = "mg-crop-simulation__segmented";
    mutationsSection.appendChild(colorList);

    const weatherContainer = document.createElement("div");
    weatherContainer.className = "mg-crop-calculator__mutations-weather";

    const weatherConditions = document.createElement("div");
    weatherConditions.className = "mg-crop-simulation__segmented";

    const weatherLighting = document.createElement("div");
    weatherLighting.className = "mg-crop-simulation__segmented";

    weatherContainer.append(weatherConditions, weatherLighting);
    mutationsSection.appendChild(weatherContainer);

    const friendBonusSection = createSection("Friend bonus", "mg-crop-calculator__section--friend-bonus");

    const friendBonus = document.createElement("div");
    friendBonus.className = "mg-crop-simulation__segmented";

    friendBonusSection.appendChild(friendBonus);

    detailLayout.append(
      priceRow,
      previewSection,
      mutationsSection,
      friendBonusSection,
    );
    simulationRoot.appendChild(detailLayout);

    detailScroll.appendChild(simulationRoot);

    const refs: CalculatorRefs = {
      root: simulationRoot,
      sprite,
      sizeSlider: slider,
      sizeValue: sliderValue,
      sizeWeight: sliderWeight,
      colorMutations: colorList,
      weatherConditions,
      weatherLighting,
      friendBonus,
      priceValue,
    };

    const states = new Map<string, CalculatorState>();
    const optionByKey = new Map<string, LockerSeedOption>();
    const options = getLockerSeedOptions();
    options.forEach(opt => optionByKey.set(opt.key, opt));

    const getStateForKey = (key: string): CalculatorState => {
      const existing = states.get(key);
      if (existing) return existing;
      const state: CalculatorState = { ...DEFAULT_STATE };
      states.set(key, state);
      return state;
    };

    let selectedKey: string | null = null;
    let currentMaxScale: number | null = null;
    let currentBaseWeight: number | null = null;

    function renderColorSegment(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.color ?? COLOR_MUTATION_LABELS[0];
      const segmented = createSegmentedControl(
        COLOR_MUTATION_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.color = coerceLabel(label, COLOR_MUTATION_LABELS) as ColorLabel;
              renderColorSegment(target, true);
              renderWeatherConditions(target, true);
              renderWeatherLighting(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Mutations",
      );
      applySegmentedButtonMetadata(segmented, COLOR_SEGMENT_METADATA);
      refs.colorMutations.innerHTML = "";
      refs.colorMutations.appendChild(segmented);
    }

    function renderWeatherConditions(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.weatherCondition ?? WEATHER_CONDITION_LABELS[0];
      const segmented = createSegmentedControl(
        WEATHER_CONDITION_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.weatherCondition = coerceLabel(label, WEATHER_CONDITION_LABELS) as WeatherConditionLabel;
              renderWeatherConditions(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Weather condition",
      );
      applySegmentedButtonMetadata(segmented, WEATHER_CONDITION_SEGMENT_METADATA);
      refs.weatherConditions.innerHTML = "";
      refs.weatherConditions.appendChild(segmented);
    }

    function renderWeatherLighting(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.weatherLighting ?? WEATHER_LIGHTING_LABELS[0];
      const segmented = createSegmentedControl(
        WEATHER_LIGHTING_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.weatherLighting = coerceLabel(label, WEATHER_LIGHTING_LABELS) as WeatherLightingLabel;
              renderWeatherLighting(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Weather lighting",
      );
      applySegmentedButtonMetadata(segmented, WEATHER_LIGHTING_SEGMENT_METADATA);
      refs.weatherLighting.innerHTML = "";
      refs.weatherLighting.appendChild(segmented);
    }

    function renderFriendBonus(state: CalculatorState | null, interactive: boolean): void {
      const active = friendPlayersToLabel(state?.friendPlayers ?? FRIEND_BONUS_MIN_PLAYERS);
      const segmented = createSegmentedControl(
        FRIEND_BONUS_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.friendPlayers = labelToFriendPlayers(label);
              renderFriendBonus(target, true);
              updateOutputs();
            }
          : undefined,
        "Friend bonus",
      );
      refs.friendBonus.innerHTML = "";
      refs.friendBonus.appendChild(segmented);
    }

    function updateOutputs(): void {
      const key = selectedKey;
      if (!key) {
        refs.priceValue.textContent = "—";
        return;
      }
      const state = getStateForKey(key);
      const min = computePrice(key, state, state.sizePercent, currentMaxScale);
      const maxPercent = Math.min(SIZE_MAX, state.sizePercent + 1);
      const max = computePrice(key, state, maxPercent, currentMaxScale);
      refs.priceValue.textContent = formatCoinRange(min, max);
    }

    function updateSprite(): void {
      const key = selectedKey;
      if (!key) {
        refs.sprite.innerHTML = "";
        return;
      }
      const state = getStateForKey(key);
      const option = optionByKey.get(key);
      const fallbackEmoji =
        getLockerSeedEmojiForKey(key) ||
        (option?.seedName ? getLockerSeedEmojiForSeedName(option.seedName) : undefined) ||
        "🌱";
      applyCropSimulationSprite(refs.sprite, key, {
        colorLabel: state.color,
        weatherLabels: getWeatherLabelsForState(state),
        fallback: fallbackEmoji,
      });
    }

    function renderDetail(): void {
      const key = selectedKey;
      if (!key) {
        refs.sprite.innerHTML = "";
        refs.sizeSlider.disabled = true;
        currentBaseWeight = null;
        applySizePercent(refs, SIZE_MIN, null, currentBaseWeight);
        renderColorSegment(null, false);
        renderWeatherConditions(null, false);
        renderWeatherLighting(null, false);
        renderFriendBonus(null, false);
        refs.priceValue.textContent = "—";
        return;
      }

      currentMaxScale = getMaxScaleForSpecies(key);
      currentBaseWeight = getBaseWeightForSpecies(key);
      const state = getStateForKey(key);

      refs.sizeSlider.disabled = false;
      applySizePercent(refs, state.sizePercent, currentMaxScale, currentBaseWeight);

      renderColorSegment(state, true);
      renderWeatherConditions(state, true);
      renderWeatherLighting(state, true);
      renderFriendBonus(state, true);
      updateSprite();
      updateOutputs();
    }

    slider.addEventListener("input", () => {
      if (!selectedKey) return;
      const state = getStateForKey(selectedKey);
      const raw = Number(slider.value);
      const value = clamp(Math.round(raw), SIZE_MIN, SIZE_MAX);
      state.sizePercent = value;
      applySizePercent(refs, value, currentMaxScale, currentBaseWeight);
      updateOutputs();
    });

    function renderList(): void {
      const previous = list.scrollTop;
      list.innerHTML = "";
      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "mg-crop-calculator__placeholder";
        empty.textContent = "No crops available.";
        list.appendChild(empty);
        selectedKey = null;
        currentMaxScale = null;
        renderDetail();
        return;
      }

      if (selectedKey && !options.some(opt => opt.key === selectedKey)) {
        selectedKey = options[0].key;
        currentMaxScale = getMaxScaleForSpecies(selectedKey);
      }

      if (!selectedKey) {
        selectedKey = options[0].key;
        currentMaxScale = getMaxScaleForSpecies(selectedKey);
      }

      const fragment = document.createDocumentFragment();
      scheduleLockerSpritePreload();

      options.forEach(opt => {
        const button = document.createElement("button");
        button.className = "qmm-vtab";
        button.style.display = "grid";
        button.style.gridTemplateColumns = "16px 1fr auto";
        button.style.alignItems = "center";
        button.style.gap = "8px";
        button.style.textAlign = "left";
        button.style.padding = "6px 8px";
        button.style.marginBottom = "6px";
        button.style.borderRadius = "8px";
        button.style.border = "1px solid #4445";
        button.style.background = selectedKey === opt.key ? "#2b8a3e" : "#1f2328";
        button.style.color = "#e7eef7";

        const dot = document.createElement("span");
        dot.className = "qmm-dot";
        dot.style.background = selectedKey === opt.key ? "#2ecc71" : "#4c566a";

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = opt.cropName || opt.key;

        const fallbackEmoji =
          getLockerSeedEmojiForKey(opt.key) ||
          getLockerSeedEmojiForSeedName(opt.seedName) ||
          "🌱";
        const sprite = createPlantSprite(opt.key, {
          size: 24,
          fallback: fallbackEmoji,
        });

        button.append(dot, label, sprite);

        button.onmouseenter = () => (button.style.borderColor = "#6aa1");
        button.onmouseleave = () => (button.style.borderColor = "#4445");
        button.onclick = () => {
          if (selectedKey === opt.key) return;
          selectedKey = opt.key;
          currentMaxScale = getMaxScaleForSpecies(opt.key);
          renderList();
        };

        fragment.appendChild(button);
      });

      list.appendChild(fragment);

      list.scrollTop = previous;
      renderDetail();
    }

    renderList();
  });

  ui.mount(container);
}
