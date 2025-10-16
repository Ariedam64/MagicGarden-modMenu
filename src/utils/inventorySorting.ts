// inventorySorting.ts
// Inventory Sorting helpers + UI (TypeScript, vanilla DOM)

import { Atoms } from "../store/atoms";
import {
  decorCatalog,
  eggCatalog,
  petCatalog,
  plantCatalog,
  rarity as rarityMap,
  toolCatalog,
} from "../data/hardcoded-data.clean.js";
import {
  computeInventoryItemValue,
  ensureInventoryValueWatcher,
  getInventoryValueSnapshot,
} from "./inventoryValue";

export type SortKey =
  | 'none'
  | 'alpha'
  | 'qty'
  | 'rarity'
  | 'size'
  | 'mutations'
  | 'strength'
  | 'value';

export type SortDirection = 'asc' | 'desc';

export type FilterKey =
  | 'seed'
  | 'crop'
  | 'plant'
  | 'pet'
  | 'tool'
  | 'decor'
  | string; // autorise d'autres clés au besoin

export interface SortOption {
  value: SortKey;
  label: string;
}

export interface InventorySortingConfig {
  gridSelector: string;
  filtersBlockSelector: string;
  closeButtonSelector: string;
  checkboxSelector: string;
  checkboxLabelSelector: string; // texte du label d’un filtre (ex: '.chakra-checkbox__label')
  injectDarkStyles?: boolean;
  mapExtraByFilter?: Partial<Record<FilterKey, SortKey[]>>;
  labelByValue?: Partial<Record<SortKey, string>>;
  directionLabel?: string;
  directionLabelByValue?: Partial<Record<SortDirection, string>>;
  defaultDirectionBySortKey?: Partial<Record<SortKey, SortDirection>>;
  onSortChange?: (sortKey: SortKey, direction: SortDirection) => void; // callback global en plus du tri appliqué
  applySorting?: (grid: Element, sortKey: SortKey, direction: SortDirection) => void; // hook tri métier
}

export interface InventorySortingController {
  destroy(): void;
  update(): void; // recalcule options selon filtres actifs
  getActiveFilters(): string[];
  getCurrentSortKey(): SortKey | null;
  getCurrentSortDirection(): SortDirection | null;
  setSortKey(k: SortKey): void;
  setSortDirection(direction: SortDirection): void;
  getSortOptions(): SortOption[];
  getGrid(): Element | null;
}

// -------------------- Defaults --------------------

const DEFAULTS: Required<Pick<
  InventorySortingConfig,
  | 'gridSelector'
  | 'filtersBlockSelector'
  | 'closeButtonSelector'
  | 'checkboxSelector'
  | 'checkboxLabelSelector'
  | 'injectDarkStyles'
>> = {
  gridSelector: 'div.McGrid.css-tqc83y',
  filtersBlockSelector: '.McGrid.css-o1vp12',
  closeButtonSelector: 'button.css-vuqwsg',
  checkboxSelector: 'label.chakra-checkbox.css-1v6h4z7',
  checkboxLabelSelector: '.chakra-checkbox__label',
  injectDarkStyles: true,
};

const ALWAYS: SortKey[] = ['none'];
const BASE_SORT: SortKey[] = ['alpha', 'qty', 'rarity', 'value']; // Rarity par défaut
const ORDER: SortKey[] = [
  'none',
  'alpha',
  'qty',
  'rarity',
  'value',
  'size',
  'mutations',
  'strength',
];

const SORT_STORAGE_KEY = 'mg-mod.inventory.sortKey';
const SORT_KEY_SET = new Set<SortKey>(ORDER);

const SORT_DIRECTION_STORAGE_KEY = 'mg-mod.inventory.sortDirection';
const SORT_DIRECTION_SET = new Set<SortDirection>(['asc', 'desc']);

const DEFAULT_DIRECTION_LABEL = 'Order:';
const DIRECTION_LABELS_DEFAULT: Record<SortDirection, string> = {
  asc: 'Ascending',
  desc: 'Descending',
};

const INVENTORY_VALUE_VISIBILITY_STORAGE_KEY = 'mg-mod.inventory.showValues';

const loadPersistedInventoryValueVisibility = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(INVENTORY_VALUE_VISIBILITY_STORAGE_KEY) ?? null;
    if (stored === '1') return true;
    if (stored === '0') return false;
    return null;
  } catch (error) {
    console.warn(
      "[InventorySorting] Impossible de lire la préférence d'affichage des valeurs d'inventaire",
      error
    );
    return null;
  }
};

const persistInventoryValueVisibility = (visible: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(INVENTORY_VALUE_VISIBILITY_STORAGE_KEY, visible ? '1' : '0');
  } catch (error) {
    console.warn(
      "[InventorySorting] Impossible de sauvegarder la préférence d'affichage des valeurs d'inventaire",
      error
    );
  }
};

let shouldDisplayInventoryValues = true;

const setShouldDisplayInventoryValues = (visible: boolean) => {
  shouldDisplayInventoryValues = visible;
};

const getShouldDisplayInventoryValues = (): boolean => shouldDisplayInventoryValues;

const DEFAULT_DIRECTION_BY_SORT_KEY: Record<SortKey, SortDirection> = {
  none: 'asc',
  alpha: 'asc',
  qty: 'desc',
  rarity: 'asc',
  value: 'desc',
  size: 'desc',
  mutations: 'desc',
  strength: 'desc',
};

const DIRECTION_ORDER: SortDirection[] = ['asc', 'desc'];

const isPersistedSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && SORT_KEY_SET.has(value as SortKey);

const isPersistedSortDirection = (value: unknown): value is SortDirection =>
  typeof value === 'string' && SORT_DIRECTION_SET.has(value as SortDirection);

const loadPersistedSortKey = (): SortKey | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(SORT_STORAGE_KEY) ?? null;
    return isPersistedSortKey(stored) ? stored : null;
  } catch (error) {
    console.warn('[InventorySorting] Impossible de lire la valeur de tri persistée', error);
    return null;
  }
};

const persistSortKey = (value: SortKey) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(SORT_STORAGE_KEY, value);
  } catch (error) {
    console.warn('[InventorySorting] Impossible de sauvegarder la valeur de tri', error);
  }
};

const loadPersistedSortDirection = (): SortDirection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(SORT_DIRECTION_STORAGE_KEY) ?? null;
    return isPersistedSortDirection(stored) ? stored : null;
  } catch (error) {
    console.warn('[InventorySorting] Impossible de lire l\'ordre de tri persisté', error);
    return null;
  }
};

const persistSortDirection = (value: SortDirection) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(SORT_DIRECTION_STORAGE_KEY, value);
  } catch (error) {
    console.warn("[InventorySorting] Impossible de sauvegarder l'ordre de tri", error);
  }
};

const MAP_EXTRA_BY_FILTER_DEFAULT: Record<FilterKey, SortKey[]> = {
  // seed/tool/ decor = tri de base
  seed: [],
  tool: [],
  decor: [],
  // crop/plant = base + size/mutations
  crop: ['size', 'mutations'],
  plant: [],
  // pet = base + size/mutations/strength
  pet: ['mutations', 'strength'],
};

const LABEL_BY_VALUE_DEFAULT: Record<SortKey, string> = {
  none: 'None',
  alpha: 'A–Z',
  qty: 'Quantity',
  rarity: 'Rarity',
  value: 'Values',
  size: 'Size',
  mutations: 'Mutations',
  strength: 'Strength',
};

const INVENTORY_BASE_INDEX_DATASET_KEY = 'tmInventoryBaseIndex';
const INVENTORY_ITEMS_CONTAINER_SELECTOR = '.McFlex.css-ofw63c';
const INVENTORY_VALUE_CONTAINER_SELECTOR = '.McFlex.css-1p00rng';
const INVENTORY_VALUE_REFERENCE_SELECTOR = ':scope > .McFlex.css-1gd1uup';
const INVENTORY_VALUE_ELEMENT_CLASS = 'tm-inventory-item-value';
const INVENTORY_VALUE_TEXT_CLASS = `${INVENTORY_VALUE_ELEMENT_CLASS}__text`;
const INVENTORY_VALUE_DATASET_KEY = 'tmInventoryValue';

interface InventoryDomEntry {
  wrapper: HTMLElement;
  card: HTMLElement;
}

interface InventoryDomSortState {
  filtersKey: string;
  baseItems: any[];
  entryByBaseIndex: Map<number, InventoryDomEntry>;
}

// -------------------- Utils (exportés quand utiles) --------------------

export const debounce = <T extends (...args: any[]) => void>(fn: T, wait = 120) => {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
};

export function isVisible(el: Element | null): el is Element {
  if (!el || !document.contains(el)) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  const cs = getComputedStyle(el as HTMLElement);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  return r.width > 0 && r.height > 0;
}

const labelIsChecked = (el: Element): boolean =>
  el.matches('[data-checked]') || !!el.querySelector('[data-checked]');

const normalize = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

const RARITY_ORDER = [
  rarityMap.Common,
  rarityMap.Uncommon,
  rarityMap.Rare,
  rarityMap.Legendary,
  rarityMap.Mythic,
  rarityMap.Divine,
  rarityMap.Celestial,
].filter(Boolean);

const RARITY_RANK = (() => {
  const entries = new Map<string, number>();
  RARITY_ORDER.forEach((label, index) => {
    const key = normalize(label);
    if (key) {
      entries.set(key, index);
    }
  });
  // Handle possible alternate spellings the game might emit.
  const mythicIndex = entries.get(normalize(rarityMap.Mythic));
  if (typeof mythicIndex === "number") {
    entries.set(normalize("Mythic"), mythicIndex);
  }
  return entries;
})();

const getRarityRank = (value: string | null | undefined): number => {
  const key = normalize(value);
  if (!key) return RARITY_ORDER.length;
  return RARITY_RANK.get(key) ?? RARITY_ORDER.length;
};

const SPECIES_FIELDS = [
  "species",
  "seedSpecies",
  "plantSpecies",
  "cropSpecies",
  "baseSpecies",
  "seedKey",
];

const normalizeSpeciesKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/(seed|plant|baby|fruit|crop)$/i, "");

const MAX_SCALE_BY_SPECIES = (() => {
  const map = new Map<string, number>();
  const register = (key: unknown, value: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key.trim());
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, value);
  };

  for (const [species, entry] of Object.entries(plantCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.crop?.maxScale);
    if (!Number.isFinite(maxScale) || maxScale <= 0) continue;
    register(species, maxScale);
    register(entry?.seed?.name, maxScale);
    register(entry?.plant?.name, maxScale);
    register(entry?.crop?.name, maxScale);
  }

  return map;
})();

const lookupMaxScale = (species: unknown): number | null => {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species.trim());
  if (!normalized) return null;
  const value = MAX_SCALE_BY_SPECIES.get(normalized);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const scaleToPercent = (scale: number, maxScale: number | null): number => {
  if (!Number.isFinite(scale)) return 50;

  const MIN_PERCENT = 50;
  const MAX_PERCENT = 100;
  const MIN_SCALE = 1;
  const safeScale = Math.max(MIN_SCALE, scale);

  if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > MIN_SCALE) {
    const limited = Math.min(maxScale, safeScale);
    const ratio = (limited - MIN_SCALE) / (maxScale - MIN_SCALE);
    const pct = MIN_PERCENT + ratio * (MAX_PERCENT - MIN_PERCENT);
    return clampNumber(Math.round(pct), MIN_PERCENT, MAX_PERCENT);
  }

  const FALLBACK_MAX_SCALE = 2;
  const limited = Math.min(FALLBACK_MAX_SCALE, safeScale);
  const ratio = (limited - MIN_SCALE) / (FALLBACK_MAX_SCALE - MIN_SCALE);
  const pct = MIN_PERCENT + ratio * (MAX_PERCENT - MIN_PERCENT);
  return clampNumber(Math.round(pct), MIN_PERCENT, MAX_PERCENT);
};

const collectSpeciesCandidates = (source: any, out: Set<string>): void => {
  if (!source || typeof source !== "object") return;
  for (const field of SPECIES_FIELDS) {
    const raw = (source as Record<string, unknown>)[field];
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value) out.add(value);
    }
  }
};

const computeSizePercentFromScale = (speciesCandidates: Iterable<string>, scale: number): number | null => {
  if (!Number.isFinite(scale)) return null;

  let maxScale: number | null = null;
  for (const candidate of speciesCandidates) {
    maxScale = lookupMaxScale(candidate);
    if (maxScale != null) break;
  }

  return scaleToPercent(scale, maxScale);
};

const getInventoryItemSizePercent = (item: any): number | null => {
  if (!item || typeof item !== "object") return null;

  const candidates = new Set<string>();
  collectSpeciesCandidates(item, candidates);
  collectSpeciesCandidates((item as any).item, candidates);
  collectSpeciesCandidates((item as any).data, candidates);

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();

  if (type === "Crop" || type === "Produce") {
    const scale = Number((item as Record<string, unknown>).scale);
    return computeSizePercentFromScale(candidates, scale);
  }

  return null;
};

const collectMutations = (source: unknown, out: string[]): void => {
  if (!source || typeof source !== "object") return;

  const rawMutations = (source as Record<string, unknown>).mutations;
  if (Array.isArray(rawMutations)) {
    for (const mutation of rawMutations) {
      if (typeof mutation === "string" && mutation.trim()) {
        out.push(mutation.trim());
      }
    }
  }

  const slots = (source as Record<string, unknown>).slots;
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      collectMutations(slot, out);
    }
  }
};

const getInventoryItemMutations = (item: any): string[] => {
  if (!item || typeof item !== "object") return [];

  const mutations: string[] = [];
  collectMutations(item, mutations);
  collectMutations((item as any).item, mutations);
  collectMutations((item as any).data, mutations);

  return mutations;
};

const FILTER_LABEL_TO_ITEM_TYPES: Record<string, string[]> = {
  crop: ["Produce"],
  crops: ["Produce"],
  produce: ["Produce"],
  seed: ["Seed"],
  seeds: ["Seed"],
  plant: ["Plant"],
  plants: ["Plant"],
  pet: ["Pet"],
  pets: ["Pet"],
  tool: ["Tool"],
  tools: ["Tool"],
  decor: ["Decor"],
  decors: ["Decor"],
  decoration: ["Decor"],
  decorations: ["Decor"],
  egg: ["Egg"],
  eggs: ["Egg"],
};

function filterLabelToItemTypes(filter: string): string[] {
  const key = normalize(filter);
  if (!key || key === "all") return [];
  const mapped = FILTER_LABEL_TO_ITEM_TYPES[key];
  if (mapped) return mapped;
  const singular = key.endsWith("s") ? key.slice(0, -1) : key;
  if (!singular) return [];
  const itemType = singular.charAt(0).toUpperCase() + singular.slice(1);
  return itemType ? [itemType] : [];
}

interface FilterInventoryResult {
  filteredItems: any[];
  keepAll: boolean;
  itemTypes: Set<string>;
}

function attachItemValues(items: any[]): void {
  const snapshot = getInventoryValueSnapshot();
  const playersInRoom = snapshot?.plants?.playersInRoom ?? null;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const value = computeInventoryItemValue(item, { playersInRoom });
    (item as Record<string, any>).value = value ?? null;
  }
}

function filterInventoryItems(items: any[], filters: string[]): FilterInventoryResult {
  const normalizedFilters = filters.map((f) => normalize(f)).filter(Boolean);
  const itemTypes = new Set<string>();
  let recognized = false;

  for (const filter of normalizedFilters) {
    const mappedTypes = filterLabelToItemTypes(filter);
    if (mappedTypes.length) {
      recognized = true;
      for (const type of mappedTypes) {
        if (type) itemTypes.add(type);
      }
    }
  }

  const keepAll = !recognized;
  const filteredItems = keepAll
    ? items.slice()
    : items.filter((item: any) => {
        const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
        return type ? itemTypes.has(type) : false;
      });

  attachItemValues(filteredItems);

  return { filteredItems, keepAll, itemTypes };
}

function getInventoryItemsContainer(grid: Element): HTMLElement | null {
  return grid.querySelector<HTMLElement>(INVENTORY_ITEMS_CONTAINER_SELECTOR);
}

function getInventoryDomEntries(container: Element): InventoryDomEntry[] {
  const entries: InventoryDomEntry[] = [];
  const children = Array.from(container.children) as Element[];

  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;

    if (child.matches('.css-vmnhaw')) {
      entries.push({ wrapper: child, card: child });
      continue;
    }

    const card = child.querySelector('.css-vmnhaw');
    if (card instanceof HTMLElement) {
      entries.push({ wrapper: child, card });
    }
  }

  return entries;
}

const INVENTORY_COMPACT_VALUE_UNITS: Array<{ threshold: number; suffix: string }> = [
  { threshold: 1e12, suffix: 'T' },
  { threshold: 1e9, suffix: 'B' },
  { threshold: 1e6, suffix: 'M' },
  { threshold: 1e3, suffix: 'K' },
];

const INVENTORY_FULL_VALUE_FORMATTER =
  typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function'
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })
    : null;

const formatInventoryItemCompactValue = (value: number): string => {
  const abs = Math.abs(value);
  for (const { threshold, suffix } of INVENTORY_COMPACT_VALUE_UNITS) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const formatted = scaled.toFixed(1).replace(/\.0$/, '');
      return `${formatted}${suffix}`;
    }
  }
  const rounded = Math.round(value);
  return INVENTORY_FULL_VALUE_FORMATTER
    ? INVENTORY_FULL_VALUE_FORMATTER.format(rounded)
    : String(rounded);
};

const formatInventoryItemFullValue = (value: number): string =>
  INVENTORY_FULL_VALUE_FORMATTER ? INVENTORY_FULL_VALUE_FORMATTER.format(value) : String(value);

const getInventoryItemValue = (item: any): number | null => {
  if (!item || typeof item !== 'object') return null;
  const raw = (item as Record<string, unknown>).value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function updateInventoryCardValue(card: HTMLElement, rawValue: number | null): void {
  const container = card.querySelector<HTMLElement>(INVENTORY_VALUE_CONTAINER_SELECTOR);
  const existing = card.dataset[INVENTORY_VALUE_DATASET_KEY];

  if (!container) {
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  const currentEl = container.querySelector<HTMLElement>(`.${INVENTORY_VALUE_ELEMENT_CLASS}`);

  if (!getShouldDisplayInventoryValues()) {
    if (currentEl?.parentElement) {
      currentEl.parentElement.removeChild(currentEl);
    }
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    if (currentEl?.parentElement) {
      currentEl.parentElement.removeChild(currentEl);
    }
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  const compactValue = formatInventoryItemCompactValue(rawValue);
  const fullValue = formatInventoryItemFullValue(rawValue);

  let target = currentEl;
  if (!target) {
    target = document.createElement('div');
    target.className = INVENTORY_VALUE_ELEMENT_CLASS;
  }

  Object.assign(target.style, {
    fontSynthesis: 'none',
    WebkitFontSmoothing: 'antialiased',
    WebkitTextSizeAdjust: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.15rem',
    fontFamily: 'var(--chakra-fonts-body, "GreyCliff CF", sans-serif)',
    fontWeight: '700',
    fontSize: '0.65rem',
    lineHeight: '1',
    textTransform: 'none',
    color: 'var(--chakra-colors-Yellow-Magic, #F3D32B)',
  });

  let textEl = target.querySelector<HTMLElement>(`.${INVENTORY_VALUE_TEXT_CLASS}`);

  if (!textEl) {
    target.textContent = '';
    textEl = document.createElement('span');
    textEl.className = INVENTORY_VALUE_TEXT_CLASS;
    textEl.style.display = 'inline-flex';
    textEl.style.alignItems = 'center';
    textEl.style.color = 'inherit';
    target.appendChild(textEl);
  }

  textEl.textContent = compactValue;
  target.title = fullValue;

  card.dataset[INVENTORY_VALUE_DATASET_KEY] = String(rawValue);

  if (target.parentElement !== container) {
    const reference = container.querySelector<HTMLElement>(INVENTORY_VALUE_REFERENCE_SELECTOR);
    if (reference && reference.parentElement === container) {
      reference.insertAdjacentElement('afterend', target);
    } else {
      container.appendChild(target);
    }
  }
}

function assignBaseIndexesToEntries(entries: InventoryDomEntry[]): void {
  entries.forEach((entry, index) => {
    entry.wrapper.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] = String(index);
    entry.card.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] = String(index);
  });
}

function readBaseIndex(entry: InventoryDomEntry): number | null {
  const raw =
    entry.wrapper.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] ??
    entry.card.dataset[INVENTORY_BASE_INDEX_DATASET_KEY];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const NAME_FIELDS_BY_ITEM_TYPE: Record<string, string> = {
  Seed: "species",
  Crop: "species",
  Produce: "species",
  Plant: "species",
  Pet: "petSpecies",
  Egg: "eggId",
  Tool: "toolId",
  Decor: "decorId",
};

const getInventoryItemName = (item: any): string => {
  if (!item || typeof item !== "object") return "";
  const type = typeof item.itemType === "string" ? item.itemType : "";
  const field = type ? NAME_FIELDS_BY_ITEM_TYPE[type] : undefined;
  const raw = field ? (item as Record<string, unknown>)[field] : undefined;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  const fallback = typeof (item as Record<string, unknown>).name === "string"
    ? (item as Record<string, string>).name
    : typeof (item as Record<string, unknown>).id === "string"
    ? (item as Record<string, string>).id
    : type;
  return typeof fallback === "string" ? fallback.trim() : "";
};

const QUANTITY_ONE_TYPES = new Set(["Produce", "Crop", "Plant", "Pet"]);

const getInventoryItemQuantity = (item: any): number => {
  if (!item || typeof item !== "object") return 0;

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();

  if (QUANTITY_ONE_TYPES.has(type)) {
    return 1;
  }

  const rawQuantity = (item as Record<string, unknown>).quantity;
  const quantity = Number(rawQuantity);
  if (Number.isFinite(quantity) && quantity >= 0) {
    return quantity;
  }

  return 0;
};

const readStringField = (item: any, field: string | undefined): string => {
  if (!item || typeof item !== "object" || !field) return "";
  const raw = (item as Record<string, unknown>)[field];
  return typeof raw === "string" ? raw.trim() : "";
};

const getInventoryItemRarity = (item: any): string => {
  if (!item || typeof item !== "object") return "";

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();
  const field = NAME_FIELDS_BY_ITEM_TYPE[type];
  const identifier = readStringField(item, field);
  if (!identifier) return "";

  switch (type) {
    case "Seed": {
      const entry = (plantCatalog as Record<string, any>)[identifier];
      return String(entry?.seed?.rarity ?? entry?.crop?.rarity ?? entry?.plant?.rarity ?? "").trim();
    }
    case "Crop":
    case "Produce": {
      const entry = (plantCatalog as Record<string, any>)[identifier];
      return String(entry?.crop?.rarity ?? entry?.plant?.rarity ?? entry?.seed?.rarity ?? "").trim();
    }
    case "Plant": {
      const entry = (plantCatalog as Record<string, any>)[identifier];
      return String(entry?.plant?.rarity ?? entry?.crop?.rarity ?? entry?.seed?.rarity ?? "").trim();
    }
    case "Pet": {
      const entry = (petCatalog as Record<string, any>)[identifier];
      return String(entry?.rarity ?? "").trim();
    }
    case "Egg": {
      const entry = (eggCatalog as Record<string, any>)[identifier];
      return String(entry?.rarity ?? "").trim();
    }
    case "Tool": {
      const entry = (toolCatalog as Record<string, any>)[identifier];
      return String(entry?.rarity ?? "").trim();
    }
    case "Decor": {
      const entry = (decorCatalog as Record<string, any>)[identifier];
      return String(entry?.rarity ?? "").trim();
    }
    default:
      return "";
  }
};

const readNestedValue = <T>(
  item: any,
  field: string,
  parser: (value: unknown) => T | null
): T | null => {
  if (!item || typeof item !== "object") return null;
  const sources: unknown[] = [item, (item as any).item, (item as any).data];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const raw = (source as Record<string, unknown>)[field];
    const parsed = parser(raw);
    if (parsed != null) return parsed;
  }
  return null;
};

const readNestedStringField = (item: any, field: string): string | null =>
  readNestedValue<string>(item, field, (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  });

const readNestedNumberField = (item: any, field: string): number | null =>
  readNestedValue<number>(item, field, (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  });

const PET_STATS_BY_SPECIES = (() => {
  const map = new Map<string, { maxScale: number; hoursToMature: number }>();
  const register = (key: unknown, maxScale: number, hoursToMature: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key);
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, { maxScale, hoursToMature });
  };

  for (const [species, entry] of Object.entries(petCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.maxScale);
    const hoursToMature = Number(entry?.hoursToMature);
    if (!Number.isFinite(maxScale) || maxScale <= 1) continue;
    if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) continue;
    register(species, maxScale, hoursToMature);
    register((entry as any)?.name, maxScale, hoursToMature);
  }

  return map;
})();

const lookupPetStats = (
  species: unknown
): { maxScale: number; hoursToMature: number } | null => {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species);
  if (!normalized) return null;
  return PET_STATS_BY_SPECIES.get(normalized) ?? null;
};

const getPetStrength = (item: any): number | null => {
  if (!item || typeof item !== "object") return null;

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();
  if (type !== "Pet") return null;

  const rawXp = readNestedNumberField(item, "xp");
  const xp = typeof rawXp === "number" && Number.isFinite(rawXp) ? rawXp : 0;
  const rawTargetScale = readNestedNumberField(item, "targetScale");
  const targetScale =
    typeof rawTargetScale === "number" && Number.isFinite(rawTargetScale)
      ? rawTargetScale
      : 1;

  const speciesCandidates = new Set<string>();
  const maybePetSpecies = readNestedStringField(item, "petSpecies");
  if (maybePetSpecies) speciesCandidates.add(maybePetSpecies);
  const maybeSpecies = readNestedStringField(item, "species");
  if (maybeSpecies) speciesCandidates.add(maybeSpecies);
  const maybeName = readNestedStringField(item, "name");
  if (maybeName) speciesCandidates.add(maybeName);

  let stats: { maxScale: number; hoursToMature: number } | null = null;
  for (const candidate of speciesCandidates) {
    stats = lookupPetStats(candidate);
    if (stats) break;
  }

  if (!stats) return null;

  const { maxScale, hoursToMature } = stats;
  if (!Number.isFinite(maxScale) || maxScale <= 1) return null;
  if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) return null;

  const safeXp = Math.max(0, xp);
  const xpDenominator = hoursToMature * 3600;
  const xpComponent =
    xpDenominator > 0 ? Math.min(Math.floor((safeXp / xpDenominator) * 30), 30) : 0;

  const minScale = 1;
  const clampedScale = clampNumber(targetScale, minScale, maxScale);
  const scaleDenominator = maxScale - minScale;
  const scaleComponent =
    scaleDenominator > 0
      ? Math.floor(((clampedScale - minScale) / scaleDenominator) * 20 + 80)
      : 80;

  const combined = xpComponent + scaleComponent - 30;
  return clampNumber(combined, 0, 100);
};

const compareByNameThenTypeThenId = (a: any, b: any): number => {
  const nameA = getInventoryItemName(a);
  const nameB = getInventoryItemName(b);
  if (nameA && nameB) {
    const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp;
  }

  if (!nameA && nameB) return 1;
  if (nameA && !nameB) return -1;

  const typeA = typeof a?.itemType === "string" ? a.itemType : "";
  const typeB = typeof b?.itemType === "string" ? b.itemType : "";
  const typeCmp = typeA.localeCompare(typeB, undefined, { sensitivity: "base" });
  if (typeCmp !== 0) return typeCmp;

  const idA = typeof (a as Record<string, unknown>).id === "string"
    ? (a as Record<string, string>).id
    : "";
  const idB = typeof (b as Record<string, unknown>).id === "string"
    ? (b as Record<string, string>).id
    : "";
  return idA.localeCompare(idB, undefined, { sensitivity: "base" });
};

function sortInventoryItems(items: any[], sortKey: SortKey, direction: SortDirection): any[] {
  const sorted = items.slice();
  const isDesc = direction === 'desc';

  switch (sortKey) {
    case "alpha":
      sorted.sort((a, b) => {
        const cmp = compareByNameThenTypeThenId(a, b);
        return isDesc ? -cmp : cmp;
      });
      break;
    case "qty":
      sorted.sort((a: any, b: any) => {
        const qtyA = getInventoryItemQuantity(a);
        const qtyB = getInventoryItemQuantity(b);
        if (qtyA !== qtyB) {
          const cmp = qtyA - qtyB;
          return isDesc ? -cmp : cmp;
        }
        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "rarity":
      sorted.sort((a: any, b: any) => {
        const rarityA = getInventoryItemRarity(a);
        const rarityB = getInventoryItemRarity(b);
        const rankA = getRarityRank(rarityA);
        const rankB = getRarityRank(rarityB);
        if (rankA !== rankB) {
          const cmp = rankA - rankB;
          return isDesc ? -cmp : cmp;
        }

        const cmpRarity = rarityA.localeCompare(rarityB, undefined, { sensitivity: "base" });
        if (cmpRarity !== 0) return cmpRarity;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "value":
      sorted.sort((a: any, b: any) => {
        const rawValueA = (a as Record<string, unknown>)?.value;
        const rawValueB = (b as Record<string, unknown>)?.value;

        const hasA = typeof rawValueA === "number" && Number.isFinite(rawValueA);
        const hasB = typeof rawValueB === "number" && Number.isFinite(rawValueB);

        if (hasA && hasB && rawValueA !== rawValueB) {
          const cmp = (rawValueA as number) - (rawValueB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "size":
      sorted.sort((a: any, b: any) => {
        const sizeA = getInventoryItemSizePercent(a);
        const sizeB = getInventoryItemSizePercent(b);

        const hasA = typeof sizeA === "number" && Number.isFinite(sizeA);
        const hasB = typeof sizeB === "number" && Number.isFinite(sizeB);

        if (hasA && hasB && sizeA !== sizeB) {
          const cmp = (sizeA as number) - (sizeB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "mutations":
      sorted.sort((a: any, b: any) => {
        const mutationsA = getInventoryItemMutations(a);
        const mutationsB = getInventoryItemMutations(b);

        const countA = mutationsA.length;
        const countB = mutationsB.length;

        if (countA !== countB) {
          const cmp = countA - countB;
          return isDesc ? -cmp : cmp;
        }

        if (countA > 0 && countB > 0) {
          const labelA = mutationsA
            .slice()
            .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }))
            .join("\u0000");
          const labelB = mutationsB
            .slice()
            .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }))
            .join("\u0000");
          const cmp = labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
          if (cmp !== 0) return cmp;
        }

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "strength":
      sorted.sort((a: any, b: any) => {
        const strengthA = getPetStrength(a);
        const strengthB = getPetStrength(b);

        const hasA = typeof strengthA === "number" && Number.isFinite(strengthA);
        const hasB = typeof strengthB === "number" && Number.isFinite(strengthB);

        if (hasA && hasB && strengthA !== strengthB) {
          const cmp = (strengthA as number) - (strengthB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    default:
      break;
  }

  return sorted;
}

async function logInventoryForFilters(
  filters: string[],
  sortKey?: SortKey,
  direction?: SortDirection
): Promise<void> {
  try {
    const inventory = await Atoms.inventory.myInventory.get();
    if (!inventory || typeof inventory !== "object") {
      console.log("[InventorySorting] Inventaire introuvable pour le log des filtres.");
      return;
    }

    const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
    const { filteredItems, keepAll, itemTypes } = filterInventoryItems(items, filters);
    const resolvedDirection: SortDirection = sortKey
      ? (direction && DIRECTION_ORDER.includes(direction) ? direction : DEFAULT_DIRECTION_BY_SORT_KEY[sortKey]) ?? 'asc'
      : direction && DIRECTION_ORDER.includes(direction)
      ? direction
      : 'asc';
    const itemsForLog = sortKey
      ? sortInventoryItems(filteredItems, sortKey, resolvedDirection)
      : filteredItems.slice();

    const descriptor = keepAll
      ? "toutes catégories"
      : `types: ${Array.from(itemTypes).join(", ") || "(aucun)"}`;
    const sortDescriptor = sortKey
      ? `tri: ${sortKey} (${resolvedDirection})`
      : "tri: (non spécifié)";
    console.log(`[InventorySorting] myInventory filtré (${descriptor}, ${sortDescriptor}).`);
  } catch (error) {
    console.warn("[InventorySorting] Impossible de récupérer myInventory pour le log", error);
  }
}

function createDefaultApplySorting(
  cfg: InventorySortingConfig & Required<typeof DEFAULTS>
): (grid: Element, sortKey: SortKey, direction: SortDirection) => Promise<void> {
  const stateByGrid = new WeakMap<Element, InventoryDomSortState>();

const ensureState = async (
  grid: Element,
  filters: string[],
  entries: InventoryDomEntry[]
): Promise<InventoryDomSortState | null> => {
  const filtersKey = JSON.stringify(filters);
  let state = stateByGrid.get(grid);

  // on calcule séparément pour éviter d'utiliser state quand il est undefined
  const hasAllBaseIndexes = entries.every((e) => readBaseIndex(e) != null);

  const needsRebuild =
    !state ||
    state.filtersKey !== filtersKey ||
    state.baseItems.length !== entries.length ||
    !hasAllBaseIndexes;

  // 🔒 Ici on ne touche à state que s'il existe ET qu'on ne reconstruit pas
  if (state && !needsRebuild) {
    state.entryByBaseIndex.clear();
    for (const entry of entries) {
      const baseIndex = readBaseIndex(entry);
      if (baseIndex != null) state.entryByBaseIndex.set(baseIndex, entry);
    }
    return state;
  }

  // sinon, on reconstruit
  try {
    const inventory = await Atoms.inventory.myInventory.get();
    if (!inventory || typeof inventory !== "object") {
      console.log("[InventorySorting] Inventaire introuvable pour le tri DOM.");
      return null;
    }

    const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
    const { filteredItems } = filterInventoryItems(items, filters);

    if (filteredItems.length !== entries.length) {
      console.warn(
        `[InventorySorting] Nombre d'éléments filtrés (${filteredItems.length}) différent du DOM (${entries.length}). Réorganisation annulée.`
      );
      return null;
    }

    assignBaseIndexesToEntries(entries);

    const newState: InventoryDomSortState = {
      filtersKey,
      baseItems: filteredItems.slice(),
      entryByBaseIndex: new Map<number, InventoryDomEntry>(),
    };

    entries.forEach((entry, index) => {
      newState.entryByBaseIndex.set(index, entry);
    });

    stateByGrid.set(grid, newState);
    return newState;
  } catch (error) {
    console.warn("[InventorySorting] Impossible de récupérer myInventory pour le tri DOM", error);
    return null;
  }
};


  return async (grid: Element, sortKey: SortKey, direction: SortDirection) => {
    if (typeof document === "undefined") return;

    const container = getInventoryItemsContainer(grid);
    if (!container) return;

    const entries = getInventoryDomEntries(container);
    if (!entries.length) return;

    const filters = getActiveFiltersFromGrid(
      grid,
      cfg.checkboxSelector,
      cfg.checkboxLabelSelector
    );

    const state = await ensureState(grid, filters, entries);
    if (!state) return;

    const baseIndexByItem = new Map<any, number>();
    state.baseItems.forEach((item, index) => {
      baseIndexByItem.set(item, index);
    });

    const effectiveDirection: SortDirection =
      direction && DIRECTION_ORDER.includes(direction)
        ? direction
        : DEFAULT_DIRECTION_BY_SORT_KEY[sortKey] ?? 'asc';
    const desiredItems =
      !sortKey || sortKey === "none"
        ? state.baseItems.slice()
        : sortInventoryItems(state.baseItems, sortKey, effectiveDirection);

    const desiredEntries: InventoryDomEntry[] = [];
    const usedEntries = new Set<InventoryDomEntry>();

    for (const item of desiredItems) {
      const baseIndex = baseIndexByItem.get(item);
      if (baseIndex == null) continue;
      const entry = state.entryByBaseIndex.get(baseIndex);
      if (!entry || usedEntries.has(entry)) continue;
      const value = getInventoryItemValue(item);
      updateInventoryCardValue(entry.card, value);
      desiredEntries.push(entry);
      usedEntries.add(entry);
    }

    if (desiredEntries.length !== entries.length) {
      console.warn(
        `[InventorySorting] Impossible de réordonner l'inventaire : correspondances insuffisantes (${desiredEntries.length}/${entries.length}).`
      );
      return;
    }

    const fragment = document.createDocumentFragment();
    desiredEntries.forEach((entry) => {
      fragment.appendChild(entry.wrapper);
    });
    container.appendChild(fragment);

    state.entryByBaseIndex.clear();
    desiredEntries.forEach((entry) => {
      const baseIndex = readBaseIndex(entry);
      if (baseIndex != null) {
        state.entryByBaseIndex.set(baseIndex, entry);
      }
    });
  };
}

// -------------------- Core helpers --------------------

/**
 * Récupère la liste des filtres actifs (texte du label).
 */
export function getActiveFiltersFromGrid(
  grid: Element,
  checkboxSelector: string,
  checkboxLabelSelector: string
): string[] {
  return Array.from(grid.querySelectorAll(checkboxSelector))
    .filter(labelIsChecked)
    .map((lbl) =>
      (lbl.querySelector(checkboxLabelSelector)?.textContent ?? '').trim()
    )
    .filter(Boolean);
}

/**
 * Calcule les options de tri à partir des filtres actifs (intersection logique).
 */
export function computeSortOptions(
  activeFilters: string[],
  labelByValue: Record<SortKey, string> = LABEL_BY_VALUE_DEFAULT,
  mapExtraByFilter: Readonly<Partial<Record<string, SortKey[]>>> = MAP_EXTRA_BY_FILTER_DEFAULT
): SortOption[] {
  if (!activeFilters.length) {
    const values = [...ALWAYS, ...BASE_SORT];
    return values.map(v => ({ value: v, label: labelByValue[v] || v }));
  }

  const act = activeFilters.map(s => (s ?? '').trim().toLowerCase());
  const getExtras = (k: string): SortKey[] => mapExtraByFilter[k] ?? [];

  const first = act[0];
  let allowed = new Set<SortKey>([...BASE_SORT, ...getExtras(first)]);

  for (let i = 1; i < act.length; i++) {
    const key = act[i];
    const current = new Set<SortKey>([...BASE_SORT, ...getExtras(key)]);
    allowed = new Set([...allowed].filter(x => current.has(x)));
  }

  const values = ORDER.filter(v => v === 'none' || allowed.has(v));
  return values.map(v => ({ value: v, label: labelByValue[v] || v }));
}


// -------------------- Styles (optionnels) --------------------

function injectDarkSelectStyles(id = 'inv-sort-dark-styles') {
  if (document.getElementById(id)) return;
  const css = `
    .tm-sort-select {
      color: #e7eef7 !important;
      background-color: rgba(17,17,17,0.98) !important;
      border: 1px solid rgba(255,255,255,0.25) !important;
      outline: none !important;
      -webkit-appearance: none;
      appearance: none;
      color-scheme: dark;
      padding-right: 28px !important;
    }
    .tm-sort-select:focus { box-shadow: 0 0 0 2px rgba(122,162,255,.35); }
    .tm-sort-select option { color: #e7eef7; background-color: #111; }
    .tm-sort-select option:checked { background-color: #222; }
    .tm-sort-select option:hover   { background-color: #1a1a1a; }
    .tm-select-wrap { position: relative; display: inline-flex; align-items: center; }
    .tm-select-arrow {
      position: absolute; right: 10px; top: 50%;
      transform: translateY(-50%);
      pointer-events: none; display: inline-flex; align-items: center; justify-content: center;
    }
    .tm-select-arrow svg { display: block; }
  `;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

// -------------------- UI factory --------------------

function createSortingBar() {
  const wrap = document.createElement('div');
  wrap.className = 'tm-sort-wrap';
  Object.assign(wrap.style, {
    display: 'block',
    width: '100%',
    margin: '0',
    padding: '0',
    position: 'relative',
    flex: '0 0 auto',
    minHeight: '0',
    contain: 'layout style',
  } as CSSStyleDeclaration);

  const bar = document.createElement('div');
  bar.className = 'tm-sorting-bar';
  Object.assign(bar.style, {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255,255,255,0.12)',
    width: '100%',
    boxSizing: 'border-box',
    position: 'relative',
    flex: '0 0 auto',
    height: 'auto',
    minHeight: '0',
    maxHeight: 'none',
    alignSelf: 'stretch',
  } as CSSStyleDeclaration);

  const label = document.createElement('span');
  label.textContent = 'Sort by:';
  Object.assign(label.style, { font: 'inherit', opacity: '0.8', flex: '0 0 auto' } as CSSStyleDeclaration);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'tm-select-wrap';

  const select = document.createElement('select');
  select.className = 'tm-sort-select tm-sort-select--key';
    Object.assign(select.style, {
    padding: '6px 10px',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px',
    background: 'rgba(17,17,17,0.98)',
    color: '#e7eef7',
    cursor: 'pointer',
    flex: '0 0 auto',
    width: 'auto',
    outline: 'none',
    appearance: 'none',
    });

// clé vendor en kebab-case via setProperty
select.style.setProperty('-webkit-appearance', 'none');


  const arrow = document.createElement('span');
  arrow.className = 'tm-select-arrow';
  arrow.innerHTML = `
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  selectWrap.append(select, arrow);
  bar.append(label, selectWrap);

  const directionLabel = document.createElement('span');
  directionLabel.className = 'tm-direction-label';
  directionLabel.textContent = DEFAULT_DIRECTION_LABEL;
  Object.assign(directionLabel.style, {
    font: 'inherit',
    opacity: '0.8',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const directionWrap = document.createElement('div');
  directionWrap.className = 'tm-select-wrap';

  const directionSelect = document.createElement('select');
  directionSelect.className = 'tm-sort-select tm-direction-select';
  Object.assign(directionSelect.style, {
    padding: '6px 10px',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px',
    background: 'rgba(17,17,17,0.98)',
    color: '#e7eef7',
    cursor: 'pointer',
    flex: '0 0 auto',
    width: 'auto',
    outline: 'none',
    appearance: 'none',
  } as CSSStyleDeclaration);
  directionSelect.style.setProperty('-webkit-appearance', 'none');

  const directionArrow = document.createElement('span');
  directionArrow.className = 'tm-select-arrow';
  directionArrow.innerHTML = `
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  directionWrap.append(directionSelect, directionArrow);
  bar.append(directionLabel, directionWrap);

  const divider = document.createElement('span');
  divider.className = 'tm-value-toggle__divider';
  Object.assign(divider.style, {
    alignSelf: 'stretch',
    width: '1px',
    minHeight: '24px',
    background: 'rgba(255,255,255,0.15)',
    flex: '0 0 auto',
    opacity: '0.5',
  } as CSSStyleDeclaration);

  const valueToggleLabel = document.createElement('label');
  valueToggleLabel.className = 'tm-value-toggle';
  Object.assign(valueToggleLabel.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    font: 'inherit',
    opacity: '0.9',
    cursor: 'pointer',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const valueToggleControl = document.createElement('span');
  valueToggleControl.className = 'tm-value-toggle__control';
  Object.assign(valueToggleControl.style, {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '20px',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const valueToggleInput = document.createElement('input');
  valueToggleInput.type = 'checkbox';
  valueToggleInput.className = 'tm-value-toggle__checkbox';
  Object.assign(valueToggleInput.style, {
    position: 'absolute',
    inset: '0',
    margin: '0',
    opacity: '0',
    cursor: 'pointer',
  } as CSSStyleDeclaration);

  const switchTrack = document.createElement('span');
  switchTrack.className = 'tm-value-toggle__switch';
  Object.assign(switchTrack.style, {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: '100%',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.25)',
    transition: 'background 120ms ease',
    padding: '2px',
    boxSizing: 'border-box',
  } as CSSStyleDeclaration);

  const switchThumb = document.createElement('span');
  switchThumb.className = 'tm-value-toggle__thumb';
  Object.assign(switchThumb.style, {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#111',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
    transform: 'translateX(0)',
    transition: 'transform 120ms ease, background 120ms ease',
  } as CSSStyleDeclaration);

  switchTrack.appendChild(switchThumb);
  valueToggleControl.append(valueToggleInput, switchTrack);

  const valueToggleText = document.createElement('span');
  valueToggleText.className = 'tm-value-toggle__label';
  valueToggleText.textContent = 'Show values';
  Object.assign(valueToggleText.style, {
    font: 'inherit',
    color: 'inherit',
  } as CSSStyleDeclaration);

  valueToggleLabel.append(valueToggleControl, valueToggleText);

  bar.append(divider, valueToggleLabel);

  const syncValueToggleVisual = (checked: boolean) => {
    switchTrack.style.background = checked
      ? 'var(--chakra-colors-Yellow-Magic, #F3D32B)'
      : 'rgba(255,255,255,0.25)';
    switchThumb.style.transform = checked ? 'translateX(16px)' : 'translateX(0)';
    valueToggleLabel.setAttribute('data-checked', checked ? 'true' : 'false');
    valueToggleLabel.setAttribute('role', 'switch');
    valueToggleLabel.setAttribute('aria-checked', checked ? 'true' : 'false');
  };

  valueToggleInput.addEventListener('change', () => {
    syncValueToggleVisual(valueToggleInput.checked);
  });

  (wrap as any).__syncValueToggle = syncValueToggleVisual;
  syncValueToggleVisual(valueToggleInput.checked);
  wrap.appendChild(bar);

  return {
    wrap,
    bar,
    select,
    directionSelect,
    directionLabel,
    valueToggleInput,
    valueToggleLabel,
  };
}

// -------------------- DOM wiring --------------------

function ensureSortingBar(
  grid: Element,
  cfg: Required<typeof DEFAULTS> & InventorySortingConfig,
  labelByValue: Record<SortKey, string>,
  directionLabelText: string,
  onChange: (value: SortKey, direction: SortDirection, activeFilters: string[]) => void,
  showValues: boolean,
  onToggleValues: (visible: boolean) => void
) {
  void labelByValue;
  const filtersBlock = grid.querySelector(cfg.filtersBlockSelector);
  if (!filtersBlock) return null;

  const closeBtnInBlock = filtersBlock.querySelector(cfg.closeButtonSelector);
  const closeBtn = closeBtnInBlock || grid.querySelector(cfg.closeButtonSelector);

  let wrap = filtersBlock.querySelector(':scope > .tm-sort-wrap') as HTMLElement | null;
  let select: HTMLSelectElement;
  let directionSelect: HTMLSelectElement;
  let directionLabelEl: HTMLSpanElement | null = null;
  let valueToggleInput: HTMLInputElement | null = null;

  if (!wrap) {
    const ui = createSortingBar();
    wrap = ui.wrap;
    select = ui.select;
    directionSelect = ui.directionSelect;
    directionLabelEl = ui.directionLabel;
    valueToggleInput = ui.valueToggleInput;

    (wrap as any).__grid = grid;

    if (closeBtn && (closeBtn as HTMLElement).parentElement) {
      (closeBtn as HTMLElement).insertAdjacentElement('afterend', wrap);
    } else {
      filtersBlock.appendChild(wrap);
    }

    if (directionLabelEl) {
      directionLabelEl.textContent = directionLabelText;
    }

    if (valueToggleInput) {
      valueToggleInput.checked = showValues;
      valueToggleInput.addEventListener('change', () => {
        const nextVisible = valueToggleInput ? valueToggleInput.checked : false;
        (wrap as any).__showValues = nextVisible;
        onToggleValues(nextVisible);
      });
    }

    select.addEventListener('change', () => {
      const value = select.value as SortKey;
      (wrap as any).__prevValue = value;
      const direction = (directionSelect?.value as SortDirection) || 'asc';
      const currentGrid = (wrap as any).__grid as Element | null;
      const activeFilters = currentGrid
        ? getActiveFiltersFromGrid(
            currentGrid,
            cfg.checkboxSelector,
            cfg.checkboxLabelSelector
          )
        : [];
      console.log('[InventorySorting] Tri sélectionné :', value);
      void logInventoryForFilters(activeFilters, value, direction);
      onChange(value, direction, activeFilters);
    });

    directionSelect.addEventListener('change', () => {
      const direction = directionSelect.value as SortDirection;
      (wrap as any).__prevDirection = direction;
      const value = (select?.value as SortKey) || 'none';
      const currentGrid = (wrap as any).__grid as Element | null;
      const activeFilters = currentGrid
        ? getActiveFiltersFromGrid(
            currentGrid,
            cfg.checkboxSelector,
            cfg.checkboxLabelSelector
          )
        : [];
      console.log('[InventorySorting] Ordre de tri sélectionné :', direction);
      void logInventoryForFilters(activeFilters, value, direction);
      onChange(value, direction, activeFilters);
    });
  } else {
    const maybeSelect = wrap.querySelector('select.tm-sort-select--key');
    const maybeDirectionSelect = wrap.querySelector('select.tm-direction-select');
    if (!maybeSelect || !maybeDirectionSelect) return null;
    select = maybeSelect as HTMLSelectElement;
    directionSelect = maybeDirectionSelect as HTMLSelectElement;
    directionLabelEl = wrap.querySelector('.tm-direction-label');
    valueToggleInput = wrap.querySelector('label.tm-value-toggle input[type="checkbox"]');

    if (directionLabelEl) {
      directionLabelEl.textContent = directionLabelText;
    }

    if (
      closeBtn &&
      (closeBtn as HTMLElement).parentElement &&
      (closeBtn as Element).nextElementSibling !== wrap
    ) {
      (closeBtn as HTMLElement).insertAdjacentElement('afterend', wrap);
    } else if (!closeBtn && wrap.parentElement !== filtersBlock) {
      filtersBlock.appendChild(wrap);
    }
  }

  if (valueToggleInput) {
    valueToggleInput.checked = showValues;
  }

  const syncValueToggle = (wrap as any).__syncValueToggle as
    | ((checked: boolean) => void)
    | undefined;
  if (syncValueToggle) {
    syncValueToggle(valueToggleInput?.checked ?? showValues);
  }

  (wrap as any).__grid = grid;
  (wrap as any).__showValues = valueToggleInput?.checked ?? showValues;

  return { wrap, select, directionSelect, valueToggleInput };
}


function renderSelectOptions(
  select: HTMLSelectElement,
  options: SortOption[],
  prevValue: string | null
) {
  const prev = prevValue ?? select.value;
  select.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  if (options.some((o) => o.value === 'none')) {
    select.value = 'none';
  }
  if (prev && options.some((o) => o.value === prev) && prev !== 'none') {
    select.value = prev;
  }
}

function renderDirectionOptions(
  select: HTMLSelectElement,
  labels: Record<SortDirection, string>,
  prevValue: SortDirection | null
) {
  const prev = prevValue ?? (select.value as SortDirection | undefined) ?? null;
  select.innerHTML = '';
  for (const value of DIRECTION_ORDER) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels[value] ?? value;
    select.appendChild(option);
  }

  if (prev && DIRECTION_ORDER.includes(prev)) {
    select.value = prev;
  } else {
    select.value = DIRECTION_ORDER[0];
  }
}

// -------------------- Public attach --------------------

export function attachInventorySorting(userConfig: Partial<InventorySortingConfig> = {}): InventorySortingController {
  const cfg: InventorySortingConfig & Required<typeof DEFAULTS> = {
    ...DEFAULTS,
    ...userConfig,
  };

  const mapExtraByFilter = { ...MAP_EXTRA_BY_FILTER_DEFAULT, ...(cfg.mapExtraByFilter || {}) };
  const labelByValue: Record<SortKey, string> = { ...LABEL_BY_VALUE_DEFAULT, ...(cfg.labelByValue || {}) };
  const directionLabelText = cfg.directionLabel ?? DEFAULT_DIRECTION_LABEL;
  const directionLabelByValue: Record<SortDirection, string> = {
    ...DIRECTION_LABELS_DEFAULT,
    ...(cfg.directionLabelByValue || {}),
  };
  const defaultDirectionBySortKey: Record<SortKey, SortDirection> = {
    ...DEFAULT_DIRECTION_BY_SORT_KEY,
    ...(cfg.defaultDirectionBySortKey || {}),
  };

  if (cfg.injectDarkStyles) injectDarkSelectStyles();

  const applySorting = cfg.applySorting ?? createDefaultApplySorting(cfg);

  let showInventoryValues = loadPersistedInventoryValueVisibility() ?? true;
  setShouldDisplayInventoryValues(showInventoryValues);

  let grid: Element | null = null;
  let currentWrap: HTMLElement | null = null;
  let currentSelect: HTMLSelectElement | null = null;
  let currentDirectionSelect: HTMLSelectElement | null = null;
  let currentValueToggle: HTMLInputElement | null = null;
  let lastLoggedFilters: string | null = null;
  let lastAppliedFiltersKey: string | null = null;
  let lastAppliedSortKey: SortKey | null = null;
  let lastAppliedDirection: SortDirection | null = null;
  let shouldEnsureInventoryValueWatcherOnNextVisible = true;

  const obs = new MutationObserver((muts) => {
    const relevant = muts.some((m) =>
      m.type === 'attributes'
        ? ['data-checked', 'style', 'class', 'hidden', 'aria-hidden'].includes(m.attributeName || '')
        : m.type === 'childList'
    );
    if (relevant) refresh();
  });

  const setGrid = (next: Element | null) => {
    if (grid === next) return;
    obs.disconnect();
    grid = next;
    lastLoggedFilters = null;
    lastAppliedFiltersKey = null;
    lastAppliedSortKey = null;
    shouldEnsureInventoryValueWatcherOnNextVisible = true;
    if (grid) {
      obs.observe(grid, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-checked', 'style', 'class', 'hidden', 'aria-hidden'],
      });
    }
  };

  const bodyObserver = new MutationObserver(() => {
    const hasCurrent = !!(grid && document.contains(grid));
    if (!hasCurrent && grid) {
      setGrid(null);
    }

    const current = hasCurrent ? grid : null;
    const next = document.querySelector(cfg.gridSelector);
    if (next !== current) {
      setGrid(next);
      if (next) {
        update();
      }
    }
  });

  const resolveGrid = (): Element | null => {
    if (grid && document.contains(grid)) return grid;
    const next = document.querySelector(cfg.gridSelector);
    if (next !== grid) {
      setGrid(next);
    }
    return grid && document.contains(grid) ? grid : null;
  };

  const applyCurrentSorting = () => {
    const targetGrid = resolveGrid();
    if (!targetGrid) return;
    const sortKey = (currentSelect?.value as SortKey) ?? 'none';
    const fallbackDirection =
      defaultDirectionBySortKey[sortKey] ?? DEFAULT_DIRECTION_BY_SORT_KEY[sortKey] ?? 'asc';
    const direction = (currentDirectionSelect?.value as SortDirection) ?? fallbackDirection;
    void applySorting(targetGrid, sortKey, direction);
  };

  const update = () => {
    const targetGrid = resolveGrid();
    if (!targetGrid || !isVisible(targetGrid)) {
      shouldEnsureInventoryValueWatcherOnNextVisible = true;
      return;
    }

    setShouldDisplayInventoryValues(showInventoryValues);

    if (shouldEnsureInventoryValueWatcherOnNextVisible) {
      shouldEnsureInventoryValueWatcherOnNextVisible = false;
      void ensureInventoryValueWatcher().catch((error) => {
        console.warn(
          "[InventorySorting] Impossible d'initialiser la surveillance de la valeur de l'inventaire",
          error
        );
      });
    }

    const mount = ensureSortingBar(
      targetGrid,
      cfg,
      labelByValue,
      directionLabelText,
      (value, direction, filters) => {
        lastAppliedSortKey = value;
        lastAppliedDirection = direction;
        const filtersKey = JSON.stringify(filters ?? []);
        lastAppliedFiltersKey = filtersKey;
        persistSortKey(value);
        persistSortDirection(direction);
        cfg.onSortChange?.(value, direction);
        void applySorting(targetGrid, value, direction);
      },
      showInventoryValues,
      (visible) => {
        showInventoryValues = visible;
        setShouldDisplayInventoryValues(visible);
        persistInventoryValueVisibility(visible);
        if (currentValueToggle) {
          currentValueToggle.checked = visible;
        }
        applyCurrentSorting();
      }
    );
    if (!mount) return;

    currentWrap = mount.wrap;
    currentSelect = mount.select;
    currentDirectionSelect = mount.directionSelect;
    currentValueToggle = mount.valueToggleInput ?? null;

    const activeFilters = getActiveFiltersFromGrid(
      targetGrid,
      cfg.checkboxSelector,
      cfg.checkboxLabelSelector
    );
    const serializedFilters = JSON.stringify(activeFilters);
    const filtersChanged = serializedFilters !== lastAppliedFiltersKey;
    if (serializedFilters !== lastLoggedFilters) {
      lastLoggedFilters = serializedFilters;
      console.log('[InventorySorting] Filtres actifs :', activeFilters);
      const currentSortKey = (currentSelect?.value as SortKey) ?? undefined;
      const currentDirection = (currentDirectionSelect?.value as SortDirection) ?? undefined;
      void logInventoryForFilters(activeFilters, currentSortKey, currentDirection);
    }
    const options = computeSortOptions(activeFilters, labelByValue, mapExtraByFilter);
    const wrapPrevValue =
      typeof (currentWrap as any).__prevValue === 'string'
        ? ((currentWrap as any).__prevValue as string)
        : null;
    const persistedSortKey = loadPersistedSortKey();
    const preferredValue =
      (wrapPrevValue && options.some((o) => o.value === wrapPrevValue) ? wrapPrevValue : null) ||
      (persistedSortKey && options.some((o) => o.value === persistedSortKey) ? persistedSortKey : null);

    renderSelectOptions(currentSelect, options, preferredValue);
    (currentWrap as any).__prevValue = currentSelect.value;

    const appliedSortKey = currentSelect.value as SortKey;
    const wrapPrevDirection =
      typeof (currentWrap as any).__prevDirection === 'string'
        ? ((currentWrap as any).__prevDirection as SortDirection)
        : null;
    const persistedDirection = loadPersistedSortDirection();
    const fallbackDirection =
      defaultDirectionBySortKey[appliedSortKey] ?? DEFAULT_DIRECTION_BY_SORT_KEY[appliedSortKey] ?? 'asc';
    const preferredDirection =
      (wrapPrevDirection && DIRECTION_ORDER.includes(wrapPrevDirection) ? wrapPrevDirection : null) ||
      (persistedDirection && DIRECTION_ORDER.includes(persistedDirection) ? persistedDirection : null) ||
      fallbackDirection;

    if (currentDirectionSelect) {
      renderDirectionOptions(currentDirectionSelect, directionLabelByValue, preferredDirection);
      const appliedDirection = currentDirectionSelect.value as SortDirection;
      (currentWrap as any).__prevDirection = appliedDirection;
      if (filtersChanged || appliedSortKey !== lastAppliedSortKey || appliedDirection !== lastAppliedDirection) {
        lastAppliedSortKey = appliedSortKey;
        lastAppliedDirection = appliedDirection;
        lastAppliedFiltersKey = serializedFilters;
        persistSortKey(appliedSortKey);
        persistSortDirection(appliedDirection);
        cfg.onSortChange?.(appliedSortKey, appliedDirection);
        void applySorting(targetGrid, appliedSortKey, appliedDirection);
      }
    } else {
      if (filtersChanged || appliedSortKey !== lastAppliedSortKey) {
        lastAppliedSortKey = appliedSortKey;
        lastAppliedDirection = fallbackDirection;
        lastAppliedFiltersKey = serializedFilters;
        persistSortKey(appliedSortKey);
        persistSortDirection(fallbackDirection);
        cfg.onSortChange?.(appliedSortKey, fallbackDirection);
        void applySorting(targetGrid, appliedSortKey, fallbackDirection);
      }
    }
  };

  const refresh = debounce(update, 120);

  const changeHandler = (e: Event) => {
    const target = e.target as Element | null;
    if (!target) return;
    const within = target.closest(cfg.gridSelector);
    if (within && within === resolveGrid()) {
      setTimeout(refresh, 0);
    }
  };

  const startObservers = () => {
    const root = document.body || document.documentElement;
    if (root) {
      bodyObserver.observe(root, { childList: true, subtree: true });
    }
    setGrid(document.querySelector(cfg.gridSelector));
    document.addEventListener('change', changeHandler, true);
    update();
  };

  startObservers();

  return {
    destroy() {
      obs.disconnect();
      bodyObserver.disconnect();
      document.removeEventListener('change', changeHandler, true);
      if (currentWrap && currentWrap.parentElement) {
        currentWrap.parentElement.removeChild(currentWrap);
      }
      currentWrap = null;
      currentSelect = null;
      currentDirectionSelect = null;
      currentValueToggle = null;
      grid = null;
      lastLoggedFilters = null;
      lastAppliedFiltersKey = null;
      lastAppliedSortKey = null;
      lastAppliedDirection = null;
      shouldEnsureInventoryValueWatcherOnNextVisible = true;
    },
    update,
    getActiveFilters() {
      const targetGrid = resolveGrid();
      if (!targetGrid) return [];
      return getActiveFiltersFromGrid(targetGrid, cfg.checkboxSelector, cfg.checkboxLabelSelector);
    },
    getCurrentSortKey() {
      return (currentSelect?.value as SortKey) ?? null;
    },
    getCurrentSortDirection() {
      return (currentDirectionSelect?.value as SortDirection) ?? null;
    },
    setSortKey(k: SortKey) {
      if (!currentSelect) return;
      currentSelect.value = k;
      (currentWrap as any).__prevValue = k;
      const targetGrid = resolveGrid();
      if (targetGrid) {
        const filtersForLog = getActiveFiltersFromGrid(
          targetGrid,
          cfg.checkboxSelector,
          cfg.checkboxLabelSelector
        );
        const filtersKey = JSON.stringify(filtersForLog);
        console.log('[InventorySorting] Tri sélectionné (programmatique) :', k);
        const directionToApply = (currentDirectionSelect?.value as SortDirection) ??
          defaultDirectionBySortKey[k] ??
          DEFAULT_DIRECTION_BY_SORT_KEY[k] ??
          'asc';
        if (currentDirectionSelect) {
          currentDirectionSelect.value = directionToApply;
          (currentWrap as any).__prevDirection = directionToApply;
        }
        void logInventoryForFilters(filtersForLog, k, directionToApply);
        lastAppliedFiltersKey = filtersKey;
        lastAppliedSortKey = k;
        lastAppliedDirection = directionToApply;
        persistSortKey(k);
        persistSortDirection(directionToApply);
        cfg.onSortChange?.(k, directionToApply);
        setShouldDisplayInventoryValues(showInventoryValues);
        void applySorting(targetGrid, k, directionToApply);
      }
    },
    setSortDirection(direction: SortDirection) {
      if (!currentDirectionSelect) return;
      currentDirectionSelect.value = direction;
      (currentWrap as any).__prevDirection = direction;
      const targetGrid = resolveGrid();
      const sortKey = (currentSelect?.value as SortKey) ?? 'none';
      if (targetGrid) {
        const filtersForLog = getActiveFiltersFromGrid(
          targetGrid,
          cfg.checkboxSelector,
          cfg.checkboxLabelSelector
        );
        const filtersKey = JSON.stringify(filtersForLog);
        console.log('[InventorySorting] Ordre de tri sélectionné (programmatique) :', direction);
        void logInventoryForFilters(filtersForLog, sortKey, direction);
        lastAppliedFiltersKey = filtersKey;
        lastAppliedSortKey = sortKey;
        lastAppliedDirection = direction;
        persistSortKey(sortKey);
        persistSortDirection(direction);
        cfg.onSortChange?.(sortKey, direction);
        setShouldDisplayInventoryValues(showInventoryValues);
        void applySorting(targetGrid, sortKey, direction);
      }
    },
    getSortOptions() {
      const targetGrid = resolveGrid();
      const filters = targetGrid
        ? getActiveFiltersFromGrid(targetGrid, cfg.checkboxSelector, cfg.checkboxLabelSelector)
        : [];
      return computeSortOptions(filters, labelByValue, mapExtraByFilter);
    },
    getGrid() {
      return resolveGrid();
    },
  };
}

// -------------------- Convenience named helpers --------------------

export interface StartInventorySortingOptions
  extends Partial<InventorySortingConfig> {
  waitForGrid?: boolean;
  log?: boolean | ((...args: unknown[]) => void);
}

export interface InventorySortingObserverHandle {
  stop(): void;
  refresh(): void;
  getController(): InventorySortingController | null;
}

export function startInventorySortingObserver(
  options: StartInventorySortingOptions = {}
): InventorySortingObserverHandle {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      stop() {},
      refresh() {},
      getController() {
        return null;
      },
    };
  }

  const { waitForGrid = true, log, ...config } = options;
  const cfg = config as Partial<InventorySortingConfig>;
  let controller: InventorySortingController | null = null;
  let observer: MutationObserver | null = null;
  let readyListener: (() => void) | null = null;

  const logger: (...args: unknown[]) => void =
    typeof log === 'function'
      ? log
      : log
      ? (...args: unknown[]) => console.debug('[InventorySorting]', ...args)
      : () => {};

  const attachIfPossible = () => {
    if (controller) return controller;
    if (waitForGrid) {
      const selector = cfg.gridSelector ?? DEFAULTS.gridSelector;
      if (!document.querySelector(selector)) {
        return null;
      }
    }
    controller = attachInventorySorting(cfg);
    logger('attached');
    return controller;
  };

  const ensureObserver = () => {
    if (controller || observer || !waitForGrid) return;
    const target = document.body || document.documentElement;
    if (!target) return;
    observer = new MutationObserver(() => {
      if (attachIfPossible()) {
        observer?.disconnect();
        observer = null;
        logger('attached via mutation');
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  };

  const start = () => {
    if (!attachIfPossible()) {
      ensureObserver();
    }
  };

  if (document.readyState === 'loading') {
    readyListener = () => {
      readyListener = null;
      start();
    };
    document.addEventListener('DOMContentLoaded', readyListener, { once: true });
  } else {
    start();
  }

  return {
    stop() {
      if (readyListener) {
        document.removeEventListener('DOMContentLoaded', readyListener);
        readyListener = null;
      }
      observer?.disconnect();
      observer = null;
      controller?.destroy();
      controller = null;
    },
    refresh() {
      if (controller) {
        controller.update();
      } else {
        start();
      }
    },
    getController() {
      return controller;
    },
  };
}

/** Helper simple pour récupérer les filtres actifs depuis un conteneur spécifique. */
export function getActiveFilters(container: Element, config?: Partial<Pick<
  InventorySortingConfig, 'checkboxSelector' | 'checkboxLabelSelector'
>>) {
  const checkboxSelector = config?.checkboxSelector ?? DEFAULTS.checkboxSelector;
  const checkboxLabelSelector = config?.checkboxLabelSelector ?? DEFAULTS.checkboxLabelSelector;
  return getActiveFiltersFromGrid(container, checkboxSelector, checkboxLabelSelector);
}

/** Renvoie un mapping labels i18n par défaut (pratique si tu veux cloner et modifier). */
export function defaultSortLabels(): Record<SortKey, string> {
  return { ...LABEL_BY_VALUE_DEFAULT };
}

/** Mapping extra par filtre par défaut (modifiable côté appelant). */
export function defaultMapExtraByFilter(): Record<FilterKey, SortKey[]> {
  return { ...MAP_EXTRA_BY_FILTER_DEFAULT };
}
