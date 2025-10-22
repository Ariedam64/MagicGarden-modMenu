// src/utils/calculators.ts
import { plantCatalog } from "../data/hardcoded-data.clean.js";

export type ColorMutation = "Gold" | "Rainbow";
export type WeatherMutation = "Wet" | "Chilled" | "Frozen";
export type TimeMutation = "Dawnlit" | "Dawnbound" | "Amberlit" | "Amberbound";

export type MutationName =
  | ColorMutation
  | WeatherMutation
  | TimeMutation
  | (string & {});

export type InventoryProduce = {
  id: string;
  species: string;
  itemType: "Produce";
  scale: number;
  mutations?: MutationName[];
};

export type GardenPlantSlot = {
  species: string;
  startTime: number;
  endTime: number;
  targetScale: number;
  mutations?: MutationName[];
};

export type GardenPlant = {
  objectType: "plant";
  species: string;
  slots: GardenPlantSlot[];
  plantedAt?: number;
  maturedAt?: number;
};

export type RoundingMode = "round" | "floor" | "ceil" | "none";

export type PricingOptions = {
  getBasePrice?: (species: string) => number | undefined | null;
  scaleTransform?: (species: string, scale: number) => number;
  rounding?: RoundingMode;
  friendPlayers?: number;
};

const key = (s: unknown) => String(s ?? "").trim();

function resolveSpeciesKey(species: string): string | null {
  const wanted = key(species).toLowerCase();
  if (!wanted) return null;
  for (const k of Object.keys(plantCatalog as Record<string, unknown>)) {
    if (k.toLowerCase() === wanted) return k;
  }
  return null;
}

function findAnySellPriceNode(obj: any): number | null {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.baseSellPrice === "number" && Number.isFinite(obj.baseSellPrice)) {
    return obj.baseSellPrice;
  }
  for (const k of ["produce", "crop", "item", "items", "data"]) {
    if (obj[k]) {
      const v = findAnySellPriceNode(obj[k]);
      if (v != null) return v;
    }
  }
  try {
    const seen = new Set<any>();
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop()!;
      if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
      seen.add(cur);
      if (typeof (cur as any).baseSellPrice === "number") {
        const v = (cur as any).baseSellPrice;
        if (Number.isFinite(v)) return v;
      }
      for (const v of Object.values(cur)) if (v && typeof v === "object") stack.push(v);
    }
  } catch {}
  return null;
}

function defaultGetBasePrice(species: string): number | null {
  const spKey = resolveSpeciesKey(species);
  if (!spKey) return null;
  const node: any = (plantCatalog as any)[spKey];
  const cands = [
    node?.produce?.baseSellPrice,
    node?.crop?.baseSellPrice,
    node?.item?.baseSellPrice,
    node?.items?.Produce?.baseSellPrice,
  ].filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
  if (cands.length) return cands[0];
  return findAnySellPriceNode(node);
}

function applyRounding(v: number, mode: RoundingMode = "round"): number {
  switch (mode) {
    case "floor": return Math.floor(v);
    case "ceil":  return Math.ceil(v);
    case "none":  return v;
    case "round":
    default:      return Math.round(v);
  }
}

function friendBonusMultiplier(playersInRoom?: number): number {
  if (!Number.isFinite(playersInRoom as number)) return 1;
  const n = Math.max(1, Math.min(6, Math.floor(playersInRoom as number)));
  return 1 + (n - 1) * 0.1;
}

const COLOR_MULT: Record<ColorMutation, number> = {
  Gold: 25,
  Rainbow: 50,
} as const;

const WEATHER_MULT: Record<WeatherMutation, number> = {
  Wet: 2,
  Chilled: 2,
  Frozen: 10,
} as const;

const TIME_MULT: Record<TimeMutation, number> = {
  Dawnlit: 2,
  Dawnbound: 3,
  Amberlit: 5,
  Amberbound: 6,
} as const;

const WEATHER_TIME_COMBO: Record<string, number> = {
  "Wet+Dawnlit": 3,
  "Chilled+Dawnlit": 3,
  "Wet+Dawnbound": 4,
  "Chilled+Dawnbound": 4,
  "Wet+Amberlit": 6,
  "Chilled+Amberlit": 6,
  "Wet+Amberbound": 7,
  "Chilled+Amberbound": 7,
  "Frozen+Dawnlit": 11,
  "Frozen+Dawnbound": 12,
  "Frozen+Amberlit": 14,
  "Frozen+Amberbound": 15,
} as const;

function isColor(m: MutationName): m is ColorMutation {
  return m === "Gold" || m === "Rainbow";
}
function isWeather(m: MutationName): m is WeatherMutation {
  return m === "Wet" || m === "Chilled" || m === "Frozen";
}
function isTime(m: MutationName): m is TimeMutation {
  return m === "Dawnlit" || m === "Dawnbound" || m === "Amberlit" || m === "Amberbound";
}

function normalizeMutationName(m: MutationName): MutationName {
  const s = key(m).toLowerCase();
  if (!s) return "" as MutationName;
  if (s === "amberglow" || s === "ambershine" || s === "amberlight") return "Amberlit";
  if (s === "dawn" || s === "dawnlight") return "Dawnlit";
  if (s === "gold") return "Gold";
  if (s === "rainbow") return "Rainbow";
  if (s === "wet") return "Wet";
  if (s === "chilled") return "Chilled";
  if (s === "frozen") return "Frozen";
  if (s === "dawnlit") return "Dawnlit";
  if (s === "dawnbound") return "Dawnbound";
  if (s === "amberlit") return "Amberlit";
  if (s === "dawncharged" || s === "dawnradiant" || s === "dawn-radiant" || s === "dawn charged") return "Dawnbound";
  if (s === "amberbound" ||  s === "ambercharged" || s === "amberradiant" || s === "amber-radiant" || s === "amber charged") return "Amberbound";

  return m;
}

function computeColorMultiplier(mutations?: MutationName[] | null): number {
  if (!Array.isArray(mutations)) return 1;
  let best = 1;
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (isColor(m)) {
      const mult = COLOR_MULT[m];
      if (mult > best) best = mult;
    }
  }
  return best;
}

function pickWeather(mutations?: MutationName[] | null): WeatherMutation | null {
  if (!Array.isArray(mutations)) return null;
  let pick: WeatherMutation | null = null;
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (isWeather(m)) {
      if (pick == null) { pick = m; continue; }
      if (WEATHER_MULT[m] > WEATHER_MULT[pick]) pick = m;
    }
  }
  return pick;
}

function pickTime(mutations?: MutationName[] | null): TimeMutation | null {
  if (!Array.isArray(mutations)) return null;
  let pick: TimeMutation | null = null;
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (isTime(m)) {
      if (pick == null) { pick = m; continue; }
      if (TIME_MULT[m] > TIME_MULT[pick]) pick = m;
    }
  }
  return pick;
}

function computeWeatherTimeMultiplier(
  weather: WeatherMutation | null,
  time: TimeMutation | null
): number {
  if (!weather && !time) return 1;
  if (weather && !time) return WEATHER_MULT[weather];
  if (!weather && time) return TIME_MULT[time];
  const k = `${weather}+${time}`;
  const combo = WEATHER_TIME_COMBO[k];
  if (typeof combo === "number") return combo;
  return Math.max(WEATHER_MULT[weather!], TIME_MULT[time!]);
}

export function mutationsMultiplier(mutations?: MutationName[] | null): number {
  const color = computeColorMultiplier(mutations);
  const weather = pickWeather(mutations);
  const time = pickTime(mutations);
  const wt = computeWeatherTimeMultiplier(weather, time);
  return color * wt;
}

export function estimateProduceValue(
  species: string,
  scale: number,
  mutations?: MutationName[] | null,
  opts?: PricingOptions
): number {
  const getBase = opts?.getBasePrice ?? defaultGetBasePrice;
  const sXform = opts?.scaleTransform ?? ((_: string, s: number) => s);
  const round = opts?.rounding ?? "round";
  const base = getBase(species);
  if (!(Number.isFinite(base as number) && (base as number) > 0)) return 0;
  const sc = Number(scale);
  if (!Number.isFinite(sc) || sc <= 0) return 0;
  const effScale = sXform(species, sc);
  if (!Number.isFinite(effScale) || effScale <= 0) return 0;
  const mutMult = mutationsMultiplier(mutations);
  const friendsMult = friendBonusMultiplier(opts?.friendPlayers);
  const pre = (base as number) * effScale * mutMult * friendsMult;
  const out = Math.max(0, applyRounding(pre, round));
  return out;
}

export function valueFromInventoryProduce(
  item: InventoryProduce,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!item || item.itemType !== "Produce") return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  return estimateProduceValue(item.species, item.scale, item.mutations, merged);
}

export function valueFromGardenSlot(
  slot: GardenPlantSlot,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!slot) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  return estimateProduceValue(slot.species, slot.targetScale, slot.mutations, merged);
}

export function valueFromGardenPlant(
  plant: GardenPlant,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!plant || plant.objectType !== "plant" || !Array.isArray(plant.slots)) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const s of plant.slots) sum += valueFromGardenSlot(s, merged);
  return sum;
}

export function sumInventoryValue(
  items: Array<InventoryProduce | any>,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!Array.isArray(items)) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const it of items) {
    if (it?.itemType === "Produce") {
      sum += valueFromInventoryProduce(it as InventoryProduce, merged);
    }
  }
  return sum;
}

export function sumGardenValue(
  garden: Record<string, GardenPlant | any>,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!garden || typeof garden !== "object") return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const k of Object.keys(garden)) {
    const p = garden[k];
    if (p?.objectType === "plant") {
      sum += valueFromGardenPlant(p as GardenPlant, merged);
    }
  }
  return sum;
}

export const DefaultPricing: PricingOptions = Object.freeze({
  getBasePrice: defaultGetBasePrice,
  rounding: "round",
});

export function debugProbe(
  species: string,
  scale: number,
  muts?: MutationName[],
  playersInRoom?: number
) {
  const base = defaultGetBasePrice(species) ?? 0;
  const effScale = scale;
  const mutMult = mutationsMultiplier(muts);
  const friendsMult = friendBonusMultiplier(playersInRoom);
  const rawCoins = base * effScale * mutMult * friendsMult;
  return {
    species,
    basePrice: base,
    effScale,
    mutationMult: mutMult,
    friendsMult,
    rawCoins,
    coins: applyRounding(rawCoins),
  };
}
