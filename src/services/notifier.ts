// src/services/shop-notifier.ts
// Logic only. No DOM.
// - Watches shopsAtom
// - Builds rows with static meta (name/rarity)
// - Tracks per-item notification prefs (popup only) in localStorage
// - Emits NotifierState to subscribers


import { Atoms } from "../store/atoms";
import {
  plantCatalog,
  eggCatalog,
  toolCatalog,
  decorCatalog,
  rarity as rarityMap,
  weatherCatalog,
} from "../data/hardcoded-data.clean";
import { audio, type PlaybackMode, type TriggerOverrides } from "../utils/audio";
import { getWeatherSpriteKey } from "../utils/weatherSprites";
import { StatsService } from "./stats";

export type SectionType = "Seed" | "Egg" | "Tool" | "Decor";

export type NotifierRow = {
  id: string;
  type: SectionType;
  name: string;
  rarity?: string;
  popup: boolean;
  followed: boolean; // == popup (compat)
};

export type NotifierState = {
  updatedAt: number;
  rows: NotifierRow[];
  counts: {
    items: number;   // nb de rows visibles (présents dans le shop)
    followed: number; // nb avec popup=true
  };
};

export type NotifierRule = {
  sound?: string | null;
  playbackMode?: PlaybackMode | null;
  stopMode?: "manual" | "purchase" | null;
  stopRepeats?: number | null;
  loopIntervalMs?: number | null;
};

export type NotifierFilters = {
  type?: "all" | "seed" | "egg" | "tool" | "decor";
  rarity?: "all" | "common" | "uncommon" | "rare" | "legendary" | "mythical" | "divine" | "celestial";
};

export type NotifierContext = "shops" | "weather";

export type WeatherCycleMeta = {
  kind: "weather" | "lunar" | "base" | "unknown";
  rawKind?: string;
  startWindowMin?: number;
  startWindowMax?: number;
  durationMinutes?: number;
  periodMinutes?: number;
};

export type WeatherMutation = {
  name: string;
  multiplier?: number | null;
  conditional?: string | null;
};

export type WeatherRow = {
  id: string;
  name: string;
  type: string;
  spriteKey?: string | null;
  atomValue: string;
  notify: boolean;
  lastSeen: number | null;
  isCurrent: boolean;
  description: string | null;
  cycle: WeatherCycleMeta | null;
  weightInCycle: number | null;
  mutations: WeatherMutation[];
};

export type WeatherState = {
  updatedAt: number;
  currentId: string | null;
  rows: WeatherRow[];
};

export type WeatherProbabilityDisplay = {
  label: string;
  title: string;
  value: number | null;
};

export type ShopsSnapshot = {
  seed:  { inventory: any[]; secondsUntilRestock: number };
  egg:   { inventory: any[]; secondsUntilRestock: number };
  tool:  { inventory: any[]; secondsUntilRestock: number };
  decor: { inventory: any[]; secondsUntilRestock: number };
};

export type PurchasesSnapshot = {
  seed:  { createdAt: number; purchases: Record<string, number> };
  egg:   { createdAt: number; purchases: Record<string, number> };
  tool:  { createdAt: number; purchases: Record<string, number> };
  decor: { createdAt: number; purchases: Record<string, number> };
};

export type ToolInvItem = { toolId: string; itemType: "Tool"; quantity: number };

// Conserve la même clé pour compat (on n'utilise plus que le bit 1 = popup)
const LS_PREFS_KEY = "qws:shop:notifs:v1"; // { [id]: number } bitmask: 1=popup
const LS_RULES_KEY = "qws:shop:notifs:rules.v1";
const LS_WEATHER_PREFS_KEY = "qws:weather:notifs:v1";
const LS_CONTEXT_DEFAULTS_KEY = "qws:notifier:loopDefaults.v1";

// ---------- Rarity mapping (clean English labels) ----------
const DISPLAY_RARITY: Record<string, string> = {
  [rarityMap.Common]: "Common",
  [rarityMap.Uncommon]: "Uncommon",
  [rarityMap.Rare]: "Rare",
  [rarityMap.Legendary]: "Legendary",
  [rarityMap.Mythic]: "Mythical",
  [rarityMap.Divine]: "Divine",
  [rarityMap.Celestial]: "Celestial",
};

const norm = (s: unknown) => String(s ?? "").toLowerCase();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatPercent = (value: number): string => {
  const pct = clamp(value, 0, 1) * 100;
  if (pct >= 99.5) return "100%";
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
};

const describeMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) {
    const mins = Math.round(minutes);
    return `${mins} minute${mins !== 1 ? "s" : ""}`;
  }
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `${days} day${days !== 1 ? "s" : ""}`;
};

export const formatRuleSummary = (rule?: NotifierRule | null): string => {
  if (!rule) return "";
  const parts: string[] = [];
  if (rule.sound) {
    const names = audio.listSounds();
    const label = names.includes(rule.sound)
      ? rule.sound
      : (rule.sound.length > 32 ? `${rule.sound.slice(0, 29)}…` : rule.sound);
    parts.push(`Sound: ${label}`);
  }
  if (rule.playbackMode === "oneshot") parts.push("Mode: One-shot");
  else if (rule.playbackMode === "loop") parts.push("Mode: Loop");
  if (rule.stopMode === "purchase") parts.push("Stop: Until purchase");
  else if (rule.stopMode === "manual") parts.push("Stop: Manual");
  if (rule.loopIntervalMs != null) {
    const raw = Number(rule.loopIntervalMs);
    if (Number.isFinite(raw)) {
      const ms = Math.max(1, Math.round(raw));
      const seconds = ms / 1000;
      const label = seconds >= 1
        ? `${(seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10).toFixed(seconds >= 10 ? 0 : 1)} s`
        : `${ms} ms`;
      parts.push(`Interval: ${label}`);
    }
  }
  return parts.join(" • ");
};

export const formatLastSeen = (timestamp: number | null, isCurrent: boolean): { label: string; title: string } => {
  if (isCurrent) {
    const title = timestamp ? new Date(timestamp).toLocaleString() : "Currently active";
    return { label: "Now", title };
  }
  if (!timestamp) return { label: "Never", title: "Never seen" };

  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  let label: string;
  if (diff < 45_000) label = "Just now";
  else if (diff < 90_000) label = "1 min ago";
  else if (diff < 60 * 60 * 1000) {
    const mins = Math.round(diff / 60_000);
    label = `${mins} min${mins > 1 ? "s" : ""} ago`;
  } else if (diff < 36 * 60 * 60 * 1000) {
    const hours = Math.round(diff / 3_600_000);
    label = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    const days = Math.round(diff / 86_400_000);
    label = `${days} day${days > 1 ? "s" : ""} ago`;
  }

  return { label, title: new Date(timestamp).toLocaleString() };
};

export const computeWeatherProbabilityDisplay = (row: WeatherRow): WeatherProbabilityDisplay => {
  if (row.isCurrent) {
    return {
      label: "Active",
      title: "Weather currently active",
      value: 1,
    };
  }

  const weight = typeof row.weightInCycle === "number" && Number.isFinite(row.weightInCycle)
    ? Math.max(0, row.weightInCycle)
    : null;

  if (!row.lastSeen) {
    if (weight != null) {
      const pct = formatPercent(weight);
      return {
        label: `~${pct}`,
        title: `Estimated from cycle weight (${pct}). No sightings yet.`,
        value: clamp(weight, 0, 1),
      };
    }
    return { label: "—", title: "No sightings yet", value: null };
  }

  const cycle = row.cycle;
  const elapsedMinutes = Math.max(0, (Date.now() - row.lastSeen) / 60_000);

  if (!cycle) {
    if (weight != null) {
      const pct = formatPercent(weight);
      return {
        label: `~${pct}`,
        title: `Estimated from cycle weight (${pct}).`,
        value: clamp(weight, 0, 1),
      };
    }
    return { label: "—", title: "No cycle data", value: null };
  }

  if (cycle.kind === "base") {
    return { label: "Default", title: "Base weather state", value: null };
  }

  let readiness = 0;
  const details: string[] = [];

  if (cycle.kind === "weather") {
    const min = typeof cycle.startWindowMin === "number" ? cycle.startWindowMin : 0;
    const max = typeof cycle.startWindowMax === "number" ? cycle.startWindowMax : min;
    const range = Math.max(1, max - min);
    readiness = clamp((elapsedMinutes - min) / range, 0, 1);
    details.push(`Cycle window: ${Math.round(min)}-${Math.round(max)} min`);
  } else if (cycle.kind === "lunar") {
    const period = typeof cycle.periodMinutes === "number" ? cycle.periodMinutes : 0;
    if (period > 0) {
      readiness = clamp(elapsedMinutes / period, 0, 1);
      details.push(`Cycle period: ${Math.round(period)} min`);
    } else {
      readiness = 0;
    }
  } else {
    const raw = cycle.rawKind ? cycle.rawKind : cycle.kind;
    if (weight != null) {
      const pct = formatPercent(weight);
      return {
        label: `~${pct}`,
        title: `Cycle kind: ${raw}.`,
        value: clamp(weight, 0, 1),
      };
    }
    return { label: "—", title: `Cycle kind: ${raw}.`, value: null };
  }

  details.unshift(`Last seen ${describeMinutes(elapsedMinutes)} ago`);
  if (weight != null) details.push(`Cycle weight: ${formatPercent(weight)}`);

  const chance = clamp(weight != null ? weight * readiness : readiness, 0, 1);
  return {
    label: `~${formatPercent(chance)}`,
    title: details.join("\n"),
    value: chance,
  };
};

export const weatherStateSignature = (rows: WeatherRow[]): string => JSON.stringify(
  rows.map((r) => [r.id, r.notify ? 1 : 0, r.lastSeen || 0, r.isCurrent ? 1 : 0]),
);

export const formatWeatherMutation = (mutation: WeatherMutation): string => {
  const parts: string[] = [mutation.name];
  if (mutation.multiplier != null) {
    const raw = Number(mutation.multiplier);
    if (Number.isFinite(raw)) {
      const rounded = Math.abs(raw - Math.round(raw)) < 0.01
        ? Math.round(raw)
        : Math.round(raw * 100) / 100;
      parts[0] = `${parts[0]} ×${rounded}`;
    }
  }
  return parts.join(" ");
};

type WeatherDef = {
  id: string;
  name: string;
  atomValue: string;
  spriteKey: string | null;
  type: string;
  description: string | null;
  cycle: WeatherCycleMeta | null;
  weightInCycle: number | null;
  mutations: WeatherMutation[];
};

const normalizeNumber = (value: unknown): number | undefined => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const normalizeCycle = (raw: unknown): WeatherCycleMeta | null => {
  if (!raw || typeof raw !== "object") return null;
  const rawKind = typeof (raw as any).kind === "string"
    ? (raw as any).kind.trim()
    : "";
  const kindLc = rawKind.toLowerCase();
  let kind: WeatherCycleMeta["kind"] = "unknown";
  if (kindLc === "weather" || kindLc === "lunar" || kindLc === "base") kind = kindLc;
  const meta: WeatherCycleMeta = { kind, rawKind: rawKind || undefined };
  const startWindowMin = normalizeNumber((raw as any).startWindowMin);
  if (startWindowMin !== undefined) meta.startWindowMin = startWindowMin;
  const startWindowMax = normalizeNumber((raw as any).startWindowMax);
  if (startWindowMax !== undefined) meta.startWindowMax = startWindowMax;
  const durationMinutes = normalizeNumber((raw as any).durationMinutes);
  if (durationMinutes !== undefined) meta.durationMinutes = durationMinutes;
  const periodMinutes = normalizeNumber((raw as any).periodMinutes);
  if (periodMinutes !== undefined) meta.periodMinutes = periodMinutes;
  return meta;
};

const normalizeMutations = (raw: unknown): WeatherMutation[] => {
  if (!Array.isArray(raw)) return [];
  const items: WeatherMutation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const name = typeof (entry as any).name === "string"
      ? (entry as any).name.trim()
      : "";
    if (!name) continue;
    const mutation: WeatherMutation = { name };
    const multiplier = normalizeNumber((entry as any).multiplier);
    if (multiplier !== undefined) mutation.multiplier = multiplier;
    const conditional = typeof (entry as any).conditional === "string"
      ? (entry as any).conditional.trim()
      : "";
    if (conditional) mutation.conditional = conditional;
    items.push(mutation);
  }
  return items;
};

const WEATHER_DEFS: WeatherDef[] = (() => {
  const entries: WeatherDef[] = [];
  for (const [rawName, rawValue] of Object.entries(weatherCatalog ?? {})) {
    const safeName = String(rawName || "").trim();
    if (!safeName) continue;
    const rawDisplayName = typeof (rawValue as any)?.displayName === "string"
      ? String((rawValue as any).displayName).trim()
      : "";
    const displayName = (rawDisplayName || safeName)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const atomValue = typeof (rawValue as any)?.atomValue === "string"
      ? String((rawValue as any).atomValue).trim()
      : "";
    const spriteKey = getWeatherSpriteKey(safeName)
      ?? getWeatherSpriteKey(rawDisplayName)
      ?? null;
    const type = atomValue || displayName;
    const description = typeof (rawValue as any)?.description === "string"
      ? String((rawValue as any).description).trim()
      : null;
    const weightInCycle = normalizeNumber((rawValue as any)?.weightInCycle);
    const cycle = normalizeCycle((rawValue as any)?.cycle);
    const mutations = normalizeMutations((rawValue as any)?.mutations);
    entries.push({
      id: `Weather:${safeName}`,
      name: displayName || safeName,
      atomValue,
      spriteKey,
      type,
      description,
      cycle,
      weightInCycle: weightInCycle ?? null,
      mutations,
    });
  }
  return entries;
})();

const WEATHER_BY_ID = new Map<string, WeatherDef>();
const WEATHER_BY_ATOM = new Map<string, WeatherDef>();
const WEATHER_BY_NAME = new Map<string, WeatherDef>();
for (const def of WEATHER_DEFS) {
  WEATHER_BY_ID.set(def.id, def);
  WEATHER_BY_NAME.set(def.name.toLowerCase(), def);
  WEATHER_BY_ATOM.set(def.atomValue.toLowerCase(), def);
  WEATHER_BY_NAME.set(def.id.slice("Weather:".length).toLowerCase(), def);
}

// ---------- static meta built once ----------
type StaticMeta = { type: SectionType; name: string; rarity?: string };
let _staticMeta: Map<string, StaticMeta> | null = null;

function buildStaticMeta(): Map<string, StaticMeta> {
  if (_staticMeta) return _staticMeta;
  const map = new Map<string, StaticMeta>();

  // Seeds
  for (const [species, entry] of Object.entries(plantCatalog)) {
    if (entry?.seed) {
      const id = `Seed:${species}`;
      map.set(id, {
        type: "Seed",
        name: entry.seed.name,
        rarity: DISPLAY_RARITY[entry.seed.rarity] ?? entry.seed.rarity,
      });
    }
  }
  // Eggs
  for (const [eggId, entry] of Object.entries(eggCatalog)) {
    const id = `Egg:${eggId}`;
    map.set(id, {
      type: "Egg",
      name: entry.name,
      rarity: DISPLAY_RARITY[entry.rarity] ?? entry.rarity,
    });
  }
  // Tools
  for (const [toolId, entry] of Object.entries(toolCatalog)) {
    const id = `Tool:${toolId}`;
    map.set(id, {
      type: "Tool",
      name: entry.name,
      rarity: DISPLAY_RARITY[entry.rarity] ?? entry.rarity,
    });
  }
  // Decor
  for (const [decorId, entry] of Object.entries(decorCatalog)) {
    const id = `Decor:${decorId}`;
    map.set(id, {
      type: "Decor",
      name: entry.name,
      rarity: DISPLAY_RARITY[entry.rarity] ?? entry.rarity,
    });
  }

  _staticMeta = map;
  return map;
}

// ---------- prefs (LS) ----------
let _prefs = new Map<string, number>();

type WeatherPref = { notify?: boolean; lastSeen?: number };
let _weatherPrefs = new Map<string, WeatherPref>();
let _weatherPrefsLoaded = false;

export type ContextStopDefaults = {
  stopMode: "manual" | "purchase";
  stopRepeats: number | null;
  loopIntervalMs: number;
};
let _contextDefaults: Partial<Record<NotifierContext, ContextStopDefaults>> = {};
let _contextDefaultsLoaded = false;

type InternalRule = {
  sound?: string;
  playbackMode?: PlaybackMode;
  stopMode?: "manual" | "purchase";
  stopRepeats?: number;
  loopIntervalMs?: number;
};

let _rules = new Map<string, InternalRule>();
let _rulesLoaded = false;
const _rulesSubs = new Set<(rules: Record<string, NotifierRule>) => void>();

const _hasOwn = Object.prototype.hasOwnProperty;

let _weatherState: WeatherState | null = null;
let _weatherSig: string | null = null;
const _weatherSubs = new Set<(s: WeatherState) => void>();
let _currentWeatherId: string | null = null;
let _currentWeatherValue: string | null = null;
let _unsubWeather: (() => void) | null = null;

function _ensureRulesLoaded() {
  if (_rulesLoaded) return;
  _rulesLoaded = true;
  _rules = new Map();
  try {
    const raw = localStorage.getItem(LS_RULES_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (obj && typeof obj === "object") {
      for (const [id, value] of Object.entries(obj)) {
        const norm = _normalizeRule(value as any);
        if (norm) _rules.set(String(id), norm);
      }
    }
  } catch {
    _rules = new Map();
  }
}

function _normalizeRule(raw: any): InternalRule | null {
  const patch: Partial<NotifierRule> = {};
  if (_hasOwn.call(raw ?? {}, "sound")) patch.sound = raw?.sound ?? null;
  if (_hasOwn.call(raw ?? {}, "playbackMode")) patch.playbackMode = raw?.playbackMode ?? null;
  if (_hasOwn.call(raw ?? {}, "stopMode")) patch.stopMode = raw?.stopMode ?? null;
  if (_hasOwn.call(raw ?? {}, "stopRepeats")) patch.stopRepeats = raw?.stopRepeats ?? null;
  if (_hasOwn.call(raw ?? {}, "loopIntervalMs")) patch.loopIntervalMs = raw?.loopIntervalMs ?? null;
  return _mergeRule(undefined, patch);
}

function _saveRules() {
  if (!_rulesLoaded) return;
  try {
    const obj: Record<string, InternalRule> = {};
    for (const [id, rule] of _rules.entries()) {
      obj[id] = { ...rule };
    }
    localStorage.setItem(LS_RULES_KEY, JSON.stringify(obj));
  } catch {}
}

function _ensureWeatherPrefsLoaded() {
  if (_weatherPrefsLoaded) return;
  _weatherPrefsLoaded = true;
  _weatherPrefs = new Map();
  try {
    const raw = localStorage.getItem(LS_WEATHER_PREFS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      for (const [id, value] of Object.entries(obj as Record<string, any>)) {
        if (!id) continue;
        const pref: WeatherPref = {};
        if (typeof (value as any)?.notify === "boolean") pref.notify = !!(value as any).notify;
        if (typeof (value as any)?.lastSeen === "number" && Number.isFinite((value as any).lastSeen)) {
          pref.lastSeen = Number((value as any).lastSeen);
        }
        _weatherPrefs.set(String(id), pref);
      }
    }
  } catch {
    _weatherPrefs = new Map();
  }
}

function _saveWeatherPrefs() {
  if (!_weatherPrefsLoaded) return;
  try {
    const obj: Record<string, WeatherPref> = {};
    for (const [id, pref] of _weatherPrefs.entries()) {
      const entry: WeatherPref = {};
      if (pref.notify) entry.notify = true;
      if (typeof pref.lastSeen === "number" && Number.isFinite(pref.lastSeen)) entry.lastSeen = pref.lastSeen;
      if (entry.notify || entry.lastSeen != null) obj[id] = entry;
    }
    localStorage.setItem(LS_WEATHER_PREFS_KEY, JSON.stringify(obj));
  } catch {}
}

function _getWeatherPref(id: string): WeatherPref {
  _ensureWeatherPrefsLoaded();
  const existing = _weatherPrefs.get(id);
  if (existing) return existing;
  const fresh: WeatherPref = {};
  _weatherPrefs.set(id, fresh);
  return fresh;
}

function _ensureContextDefaultsLoaded() {
  if (_contextDefaultsLoaded) return;
  _contextDefaultsLoaded = true;
  _contextDefaults = {};
  try {
    const raw = localStorage.getItem(LS_CONTEXT_DEFAULTS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      for (const [context, value] of Object.entries(obj as Record<string, any>)) {
        const ctx = context as NotifierContext;
        if (ctx !== "shops" && ctx !== "weather") continue;
        const modeRaw = (value as any)?.stopMode;
        const stopMode = modeRaw === "purchase" ? "purchase" : "manual";
        const repeatsRaw = Number((value as any)?.stopRepeats);
        const stopRepeats = Number.isFinite(repeatsRaw) ? Math.max(1, Math.floor(repeatsRaw)) : null;
        const intervalRaw = Number((value as any)?.loopIntervalMs);
        const playback = audio.getPlaybackSettings(ctx);
        const baseLoop = Number.isFinite(intervalRaw) ? intervalRaw : playback.loopIntervalMs;
        const loopIntervalMs = Math.max(150, Math.floor(baseLoop || 0));
        _contextDefaults[ctx] = { stopMode, stopRepeats, loopIntervalMs };
      }
    }
  } catch {
    _contextDefaults = {};
  }
}

function _saveContextDefaults() {
  if (!_contextDefaultsLoaded) return;
  try {
    const obj: Record<string, ContextStopDefaults> = {};
    for (const [ctx, value] of Object.entries(_contextDefaults)) {
      if (!value) continue;
      const loopIntervalMs = Math.max(150, Math.floor(value.loopIntervalMs | 0));
      const normalizedRepeats = value.stopRepeats != null
        ? Math.max(1, Math.floor(value.stopRepeats | 0))
        : null;
      obj[ctx] = {
        stopMode: value.stopMode,
        stopRepeats: normalizedRepeats,
        loopIntervalMs,
      };
    }
    localStorage.setItem(LS_CONTEXT_DEFAULTS_KEY, JSON.stringify(obj));
  } catch {}
}

function _getContextStopDefaultsInternal(context: NotifierContext): ContextStopDefaults {
  _ensureContextDefaultsLoaded();
  const stored = _contextDefaults[context];
  const playback = audio.getPlaybackSettings(context);
  const playbackLoop = Math.max(150, Math.floor(playback.loopIntervalMs || 0));
  const storedLoop = stored?.loopIntervalMs;
  const loopIntervalMs = Math.max(150, Math.floor(storedLoop ?? playbackLoop));
  const storedMode = stored?.stopMode === "purchase" ? "purchase" : null;
  const playbackMode = playback.stop.mode === "purchase" ? "purchase" : null;
  if (context === "shops") {
    const stopMode = storedMode ?? playbackMode ?? "purchase";
    return { stopMode, stopRepeats: null, loopIntervalMs };
  }
  return { stopMode: "manual", stopRepeats: null, loopIntervalMs };
}

function _notifyWeather() {
  if (!_weatherState) return;
  _weatherSubs.forEach((fn) => {
    try {
      fn(_weatherState as WeatherState);
    } catch {}
  });
}

function _recomputeWeatherState() {
  _ensureWeatherPrefsLoaded();
  const rows: WeatherRow[] = WEATHER_DEFS.map((def) => {
    const pref = _getWeatherPref(def.id);
    const notify = !!pref.notify;
    const lastSeen = typeof pref.lastSeen === "number" && Number.isFinite(pref.lastSeen)
      ? pref.lastSeen
      : null;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      spriteKey: def.spriteKey,
      atomValue: def.atomValue,
      notify,
      lastSeen,
      isCurrent: def.id === _currentWeatherId,
      description: def.description,
      cycle: def.cycle ? { ...def.cycle } : null,
      weightInCycle: def.weightInCycle,
      mutations: def.mutations.map((mutation) => ({ ...mutation })),
    };
  });
  const sig = JSON.stringify(rows.map((r) => [r.id, r.notify ? 1 : 0, r.lastSeen || 0, r.isCurrent ? 1 : 0]));
  const changed = sig !== _weatherSig;
  _weatherSig = sig;
  _weatherState = {
    updatedAt: Date.now(),
    currentId: _currentWeatherId,
    rows,
  };
  if (changed) _notifyWeather();
}

function _buildWeatherOverrides(id: string): TriggerOverrides {
  const overrides: TriggerOverrides = {};
  const rule = _rules.get(id);
  if (rule?.sound) overrides.sound = rule.sound;
  overrides.mode = "oneshot";
  return overrides;
}

function _triggerWeatherNotification(id: string) {
  const def = WEATHER_BY_ID.get(id);
  if (!def) return;
  const overrides = _buildWeatherOverrides(id);
  audio.trigger(id, overrides, "weather").catch(() => {});
}

function _handleWeatherUpdate(raw: any, opts: { force?: boolean } = {}) {
  const normalize = (value: any): string => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    return String(value || "").trim();
  };

  const nextValue = normalize(raw);
  if (!opts.force && _currentWeatherValue === nextValue) return;

  const lookupKey = nextValue.toLowerCase();
  let def = WEATHER_BY_ATOM.get(lookupKey) || WEATHER_BY_NAME.get(lookupKey);
  if (!def && lookupKey) {
    const noSpace = lookupKey.replace(/\s+/g, "");
    def = WEATHER_BY_NAME.get(noSpace);
  }

  const prevId = _currentWeatherId;
  const now = Date.now();

  if (def) {
    const pref = _getWeatherPref(def.id);
    pref.lastSeen = now;
    _weatherPrefs.set(def.id, pref);
  }
  _currentWeatherId = def?.id ?? null;
  _currentWeatherValue = nextValue;

  if (_currentWeatherId) {
    StatsService.incrementWeatherStat(_currentWeatherId.replace("Weather:",""));
  }
  
  if (prevId && prevId !== _currentWeatherId) {
    audio.stopLoop(prevId);
  }

  if (def && _getWeatherPref(def.id).notify) {
    _triggerWeatherNotification(def.id);
  }

  if (def) _saveWeatherPrefs();
  _recomputeWeatherState();
}

function _rulesEqual(a: InternalRule | undefined | null, b: InternalRule | undefined | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.sound === b.sound &&
    a.playbackMode === b.playbackMode &&
    a.stopMode === b.stopMode &&
    a.loopIntervalMs === b.loopIntervalMs
  );
}

function _sanitizeSound(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function _sanitizePlaybackMode(value: unknown): PlaybackMode | undefined {
  if (value == null) return undefined;
  const v = String(value);
  return v === "oneshot" || v === "loop" ? (v as PlaybackMode) : undefined;
}

function _sanitizeStopMode(value: unknown): "manual" | "purchase" | undefined {
  if (value == null) return undefined;
  const v = String(value);
  if (v === "purchase") return "purchase";
  return undefined;
}

function _sanitizeLoopInterval(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const normalized = Math.max(150, Math.floor(n));
  return normalized >= 150 ? normalized : undefined;
}

function _mergeRule(prev: InternalRule | undefined, patch: Partial<NotifierRule>): InternalRule | null {
  const next: InternalRule = { ...(prev ?? {}) };

  if (_hasOwn.call(patch, "sound")) {
    const s = _sanitizeSound((patch as any).sound);
    if (s) next.sound = s;
    else delete next.sound;
  }

  if (_hasOwn.call(patch, "playbackMode")) {
    const mode = _sanitizePlaybackMode((patch as any).playbackMode);
    if (mode) next.playbackMode = mode;
    else delete next.playbackMode;
  }

  if (_hasOwn.call(patch, "stopMode")) {
    const mode = _sanitizeStopMode((patch as any).stopMode);
    if (mode) next.stopMode = mode;
    else delete next.stopMode;
    delete next.stopRepeats;
  }

  if (_hasOwn.call(patch, "stopRepeats")) {
    delete next.stopRepeats;
  }

  if (_hasOwn.call(patch, "loopIntervalMs")) {
    const interval = _sanitizeLoopInterval((patch as any).loopIntervalMs);
    if (interval != null) next.loopIntervalMs = interval;
    else delete next.loopIntervalMs;
  }

  return Object.keys(next).length ? next : null;
}

function _rulesSnapshot(): Record<string, NotifierRule> {
  _ensureRulesLoaded();
  const out: Record<string, NotifierRule> = {};
  for (const [id, rule] of _rules.entries()) {
    out[id] = {
      ...(rule.sound ? { sound: rule.sound } : {}),
      ...(rule.playbackMode ? { playbackMode: rule.playbackMode } : {}),
      ...(rule.stopMode ? { stopMode: rule.stopMode } : {}),
      ...(rule.loopIntervalMs != null ? { loopIntervalMs: rule.loopIntervalMs } : {}),
    };
  }
  return out;
}

function _emitRules() {
  if (!_rulesLoaded) return;
  const snap = _rulesSnapshot();
  _rulesSubs.forEach((fn) => {
    try {
      fn(snap);
    } catch {}
  });
}
function _loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_PREFS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const m = new Map<string, number>();
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v) | 0;
        // Ne garder que le bit 1 (popup)
        const popupBits = n & 1;
        if (k && popupBits !== undefined) m.set(String(k), popupBits);
      }
    }
    _prefs = m;
  } catch {
    _prefs = new Map();
  }
}
function _savePrefs() {
  try {
    const obj: Record<string, number> = {};
    for (const [k, v] of _prefs) obj[k] = v & 1; // n'enregistrer que le bit popup
    localStorage.setItem(LS_PREFS_KEY, JSON.stringify(obj));
  } catch {}
}
const _getPrefBits = (id: string) => (_prefs.get(id) ?? 0) & 1;
const _setPrefBits = (id: string, bits: number) => {
  if (!id) return;
  const masked = bits & 1;
  if (masked) _prefs.set(id, masked);
  else _prefs.delete(id);
  _savePrefs();
  _recomputeFromCacheAndNotify(); // update rows.followed / counts
};

// ---------- state/cache ----------
let _rowsById = new Map<string, NotifierRow>();
let _lastSig = ""; // structural signature to avoid noisy notifies
let _state: NotifierState | null = null;
let _unsubShops: null | (() => void) = null;
let _unsubPurchases: null | (() => void) = null;
const _subs = new Set<(s: NotifierState) => void>();

let _toolInv = new Map<string, number>();
let _unsubToolInv: null | (() => void) = null;

const TOOL_CAPS: Record<string, number> = {
  Shovel: 1,
  WateringCan: 99,
};

function _isToolCapReached(toolId: string): boolean {
  const cap = TOOL_CAPS[toolId];
  if (!cap) return false;
  const q = _toolInv.get(toolId) || 0;
  return q >= cap;
}

function _updateToolInv(raw: any) {
  try {
    const arr: ToolInvItem[] = Array.isArray(raw) ? raw : [];
    _toolInv = new Map(arr.map(it => [String(it.toolId), Number(it.quantity) || 0]));
  } catch {
    _toolInv = new Map();
  }
  // Répercute sur les rows (désactive popup si cap atteint) et notifie
  _recomputeFromCacheAndNotify();
}

// Essaie plusieurs emplacements possibles pour l’atome d’inventaire
function _resolveToolInvAtom(): any {
  const a: any = Atoms as any;
  return a.inventory?.myToolInventory
      ?? a.shop?.myToolInventory
      ?? a.myToolInventoryAtom
      ?? null;
}

// ---------- recompute from shopsAtom snapshot ----------
function _computeSig(ids: string[]): string {
  // Signature structurelle = présence/ensemble des IDs
  return ids.slice().sort().join("|");
}

const _purchasesSubs = new Set<(p: PurchasesSnapshot) => void>();

function _coercePurchases(raw: any): PurchasesSnapshot {
  const co = (sec: any) => ({
    createdAt: Number(sec?.createdAt) || 0,
    purchases:
      sec?.purchases && typeof sec.purchases === "object"
        ? (sec.purchases as Record<string, number>)
        : {},
  });
  return {
    seed: co(raw?.seed),
    egg: co(raw?.egg),
    tool: co(raw?.tool),
    decor: co(raw?.decor),
  };
}

function _notifyPurchases(raw: any) {
  const snap = _coercePurchases(raw);
  _purchasesSubs.forEach((fn) => {
    try {
      fn(snap);
    } catch {}
  });
}

const _shopsSubs = new Set<(s: ShopsSnapshot) => void>();

function _coerceSnap(raw: any): ShopsSnapshot {
  const co = (sec: any) => ({
    inventory: Array.isArray(sec?.inventory) ? sec.inventory : [],
    secondsUntilRestock: Number(sec?.secondsUntilRestock) || 0,
  });
  return {
    seed: co(raw?.seed),
    egg: co(raw?.egg),
    tool: co(raw?.tool),
    decor: co(raw?.decor),
  };
}

function _notifyShops(raw: any) {
  const snap = _coerceSnap(raw);
  _shopsSubs.forEach((fn) => {
    try {
      fn(snap);
    } catch {}
  });
}

function _recomputeFromRaw(raw: any) {
  const staticMeta = buildStaticMeta();

  const sections: Array<{ key: "seed" | "egg" | "tool" | "decor"; type: SectionType }> = [
    { key: "seed", type: "Seed" },
    { key: "egg", type: "Egg" },
    { key: "tool", type: "Tool" },
    { key: "decor", type: "Decor" },
  ];

  const seen = new Set<string>();

  for (const { key, type } of sections) {
    const sec = raw?.[key] ?? {};
    const inv = Array.isArray(sec?.inventory) ? sec.inventory : [];
    for (const entry of inv) {
      const id =
        type === "Seed"
          ? `Seed:${entry.species}`
          : type === "Egg"
          ? `Egg:${entry.eggId}`
          : type === "Tool"
          ? `Tool:${entry.toolId}`
          : `Decor:${entry.decorId}`;

      seen.add(id);

      const meta = staticMeta.get(id);

      const bits = _getPrefBits(id);
      const popup = !!(bits & 1);

      const row: NotifierRow = {
        id,
        type,
        name: meta?.name ?? id.split(":")[1] ?? id,
        rarity: meta?.rarity,
        popup,
        followed: popup, // compat
      };
      _rowsById.set(id, row);
    }
  }

  // prune rows not present anymore
  for (const id of Array.from(_rowsById.keys())) {
    if (!seen.has(id)) _rowsById.delete(id);
  }

  // build rows & counts
  const rows = Array.from(_rowsById.values());
  const followed = rows.reduce((n, r) => n + (r.followed ? 1 : 0), 0);
  const next: NotifierState = {
    updatedAt: Date.now(),
    rows,
    counts: { items: rows.length, followed },
  };

  // notify only if struct changed (membership)
  const sig = _computeSig(rows.map((r) => r.id));
  const changed = sig !== _lastSig;
  _state = next;
  if (changed) {
    _lastSig = sig;
    _notify();
  } else {
  }
}

function _recomputeFromCacheAndNotify() {
  if (!_state) return;
  for (const [id, row] of _rowsById) {
    const bits = _getPrefBits(id);
    let popup = !!(bits & 1);

    // Clamp si tool cap atteint
    if (id.startsWith("Tool:")) {
      const toolId = id.slice(5);
      if (_isToolCapReached(toolId)) {
        popup = false;
      }
    }

    row.popup = popup;
    row.followed = popup;
  }
  const rows = Array.from(_rowsById.values());
  const followed = rows.reduce((n, r) => n + (r.followed ? 1 : 0), 0);

  _state = {
    ..._state,
    updatedAt: Date.now(),
    rows,
    counts: { items: rows.length, followed },
  };
  _notify();
}

function _notify() {
  if (!_state) return;
  const snap = { ..._state, rows: _state.rows.slice() };
  _subs.forEach((fn) => {
    try {
      fn(snap);
    } catch {}
  });
}

// ---------- start/stop ----------
let _started = false;
async function _ensureStarted() {
  if (_started) {
    return;
  }
  _started = true;
  _loadPrefs();
  _ensureRulesLoaded();

  // prime + subscribe shops
  try {
    const cur = await Atoms.shop.shops.get();
    _recomputeFromRaw(cur);
    _notifyShops(cur);
  } catch (err) {
  }

  try {
    _unsubShops = await Atoms.shop.shops.onChange((next) => {
      try { _recomputeFromRaw(next); } catch {}
      try { _notifyShops(next); } catch {}
    });
  } catch (err) {
  }

  // prime + subscribe purchases
  try {
    const curP = await Atoms.shop.myShopPurchases.get();
    _notifyPurchases(curP);
  } catch (err) {
  }
  try {
    _unsubPurchases = await Atoms.shop.myShopPurchases.onChange((next: any) => {
      try { _notifyPurchases(next); } catch {}
    });
  } catch (err) {
  }

  // tool inventory (caps)
  try {
    const invAtom = _resolveToolInvAtom();
    if (invAtom) {
      try { _updateToolInv(await invAtom.get()); } catch (err) {
      }
      try {
        _unsubToolInv = await invAtom.onChange((next: any) => {
          try { _updateToolInv(next); } catch {}
        });
      } catch (err) {
      }
    }
  } catch (err) {
  }

  // weather
  try {
    const weatherAtom = (Atoms.data as any)?.weather;
    if (weatherAtom) {
      try {
        _handleWeatherUpdate(await weatherAtom.get(), { force: true });
      } catch (err) {
      }
      try {
        _unsubWeather = await weatherAtom.onChange((next: any) => {
          try { _handleWeatherUpdate(next); } catch {}
        });
      } catch (err) {
      }
    } else {
    }
  } catch (err) {
  }
}

function _stop() {
  try { _unsubShops?.(); } catch {}
  _unsubShops = null;
  try { _unsubPurchases?.(); } catch {}
  _unsubPurchases = null;
  try { _unsubToolInv?.(); } catch {}
  _unsubToolInv = null;
  try { _unsubWeather?.(); } catch {}
  _unsubWeather = null;
  if (_currentWeatherId) {
    try { audio.stopLoop(_currentWeatherId); } catch {}
  }
  _currentWeatherId = null;
  _currentWeatherValue = null;

  _started = false;
}

// ---------- Public API ----------
export const NotifierService = {
  // lifecycle
  async start(): Promise<() => void> {
    await _ensureStarted();
    return () => _stop();
  },

  async get(): Promise<NotifierState> {
    await _ensureStarted();
    if (!_state) {
      _recomputeFromRaw(await Atoms.shop.shops.get().catch(() => null));
    }
    return _state as NotifierState;
  },

  onChange(cb: (s: NotifierState) => void): () => void {
    _subs.add(cb);
    return () => {
      _subs.delete(cb);
    };
  },

  async onChangeNow(cb: (s: NotifierState) => void): Promise<() => void> {
    await _ensureStarted();
    if (_state) cb(_state);
    else {
      try { _recomputeFromRaw(await Atoms.shop.shops.get()); } catch {}
      if (_state) cb(_state);
    }
    return this.onChange(cb);
  },

  onShopsChange(cb: (s: ShopsSnapshot) => void): () => void {
    _shopsSubs.add(cb);
    return () => {
      _shopsSubs.delete(cb);
    };
  },

  async onShopsChangeNow(cb: (s: ShopsSnapshot) => void): Promise<() => void> {
    await _ensureStarted();
    try { cb(_coerceSnap(await Atoms.shop.shops.get())); } catch {}
    return this.onShopsChange(cb);
  },

  onPurchasesChange(cb: (p: PurchasesSnapshot) => void): () => void {
    _purchasesSubs.add(cb);
    return () => {
      _purchasesSubs.delete(cb);
    };
  },

  async onPurchasesChangeNow(cb: (p: PurchasesSnapshot) => void): Promise<() => void> {
    await _ensureStarted();
    try { cb(_coercePurchases(await (Atoms.shop as any).myShopPurchases.get())); } catch {}
    return this.onPurchasesChange(cb);
  },

  async getWeatherState(): Promise<WeatherState> {
    await _ensureStarted();
    if (!_weatherState) _recomputeWeatherState();
    return _weatherState as WeatherState;
  },

  onWeatherChange(cb: (s: WeatherState) => void): () => void {
    _weatherSubs.add(cb);
    return () => {
      _weatherSubs.delete(cb);
    };
  },

  async onWeatherChangeNow(cb: (s: WeatherState) => void): Promise<() => void> {
    await _ensureStarted();
    if (!_weatherState) _recomputeWeatherState();
    if (_weatherState) cb(_weatherState);
    return this.onWeatherChange(cb);
  },

  getWeatherNotify(id: string): boolean {
    if (!id) return false;
    return !!_getWeatherPref(id).notify;
  },

  setWeatherNotify(id: string, enabled: boolean) {
    if (!id) return;
    _ensureWeatherPrefsLoaded();
    const pref = _getWeatherPref(id);
    const next = !!enabled;
    if (!!pref.notify === next) return;
    pref.notify = next;
    _weatherPrefs.set(id, pref);
    _saveWeatherPrefs();
    if (!next) {
      try { audio.stopLoop(id); } catch {}
    } else if (_currentWeatherId === id) {
      _triggerWeatherNotification(id);
    }
    _recomputeWeatherState();
  },

  getContextStopDefaults(context: NotifierContext): ContextStopDefaults {
    return _getContextStopDefaultsInternal(context);
  },

  setContextStopDefaults(context: NotifierContext, conf: ContextStopDefaults) {
    if (context !== "shops" && context !== "weather") return;
    _ensureContextDefaultsLoaded();
    const current = _getContextStopDefaultsInternal(context);
    const loopRaw = Number((conf as any)?.loopIntervalMs);
    const loopIntervalMs = Number.isFinite(loopRaw)
      ? Math.max(150, Math.floor(loopRaw))
      : current.loopIntervalMs;
    const normalizedMode = conf.stopMode === "purchase" ? "purchase" : "manual";
    const normalized: ContextStopDefaults = {
      stopMode: context === "weather" ? "manual" : normalizedMode,
      stopRepeats: null,
      loopIntervalMs,
    };
    _contextDefaults[context] = normalized;
    _saveContextDefaults();
  },

  // prefs (popup only)
  getPref(id: string): { popup: boolean; followed: boolean } {
    // Clamp côté lecture (utile pour l’overlay)
    if (id.startsWith("Tool:")) {
      const toolId = id.slice(5);
      if (_isToolCapReached(toolId)) {
        return { popup: false, followed: false };
      }
    }
    const bits = _getPrefBits(id);
    const popup = !!(bits & 1);
    return { popup, followed: popup };
  },

  setPopup(id: string, enabled: boolean) {
    if (enabled && id.startsWith("Tool:") && _isToolCapReached(id.slice(5))) {
      return; // on ignore l’activation si cap atteint
    }
    const bits = _getPrefBits(id);
    const next = enabled ? (bits | 1) : (bits & ~1);
    _setPrefBits(id, next);
  },

  setPrefs(id: string, prefs: { popup?: boolean }) {
    const bits = _getPrefBits(id);
    let next = bits;
    if (typeof prefs.popup === "boolean") next = prefs.popup ? (next | 1) : (next & ~1);
    _setPrefBits(id, next);
  },

  clearPrefs(id: string) {
    _setPrefBits(id, 0);
  },

  isIdCapped(id: string): boolean {
    if (!id.startsWith("Tool:")) return false;
    return _isToolCapReached(id.slice(5));
  },

  // pure filter util (no side-effects)
  filterRows(rows: NotifierRow[], f: NotifierFilters): NotifierRow[] {
    let arr = rows.slice();

    const ft = (f.type ?? "all") as NotifierFilters["type"];
    if (ft && ft !== "all") {
      arr = arr.filter((r) => r.type.toLowerCase() === ft);
    }

    const fr = f.rarity ?? "all";
    if (fr !== "all") {
      arr = arr.filter((r) => norm(r.rarity) === fr);
    }

    return arr;
  },

  getRule(id: string): NotifierRule | null {
    if (!id) return null;
    _ensureRulesLoaded();
    const rule = _rules.get(id);
    if (!rule) return null;
    return {
      ...(rule.sound ? { sound: rule.sound } : {}),
      ...(rule.playbackMode ? { playbackMode: rule.playbackMode } : {}),
      ...(rule.stopMode ? { stopMode: rule.stopMode } : {}),
      ...(rule.loopIntervalMs != null ? { loopIntervalMs: rule.loopIntervalMs } : {}),
    };
  },

  getAllRules(): Record<string, NotifierRule> {
    return _rulesSnapshot();
  },

  setRule(id: string, patch: Partial<NotifierRule>) {
    if (!id || !patch || typeof patch !== "object") return;
    _ensureRulesLoaded();
    const prev = _rules.get(id);
    const next = _mergeRule(prev, patch);
    if (_rulesEqual(prev, next)) return;
    if (next) _rules.set(id, next);
    else _rules.delete(id);
    _saveRules();
    _emitRules();
  },

  clearRule(id: string) {
    if (!id) return;
    _ensureRulesLoaded();
    const existed = _rules.delete(id);
    if (existed) {
      _saveRules();
      _emitRules();
    }
  },

  onRulesChange(cb: (rules: Record<string, NotifierRule>) => void): () => void {
    _ensureRulesLoaded();
    _rulesSubs.add(cb);
    return () => {
      _rulesSubs.delete(cb);
    };
  },

  async onRulesChangeNow(cb: (rules: Record<string, NotifierRule>) => void): Promise<() => void> {
    await _ensureStarted();
    cb(_rulesSnapshot());
    return this.onRulesChange(cb);
  },
};
