import {
  tileRefsMap,
  tileRefsPlants,
  tileRefsTallPlants,
  tileRefsSeeds,
  tileRefsItems,
  tileRefsAnimations,
  tileRefsPets,
  tileRefsMutations,
  tileRefsDecor,
} from "./hardcoded-data.clean";

export interface TileRefEntry {
  index: number;
  key: string;
  source: string;
  sourceLabel: string;
  qualifiedName: string;
  displayName: string;
}

export interface TileRefMatch {
  sheetId: string;
  sheetLabel: string;
  entries: TileRefEntry[];
}

type MatcherSource = {
  source: string;
  refs: Record<string, number>;
};

type MatcherConfig = {
  id: string;
  label: string;
  test: (sheet: string) => boolean;
  sources: MatcherSource[];
};

type SheetMatcher = MatcherConfig & {
  entries: Map<number, TileRefEntry[]>;
};

const SOURCE_LABELS: Record<string, string> = {
  tileRefsMap: "Map tiles",
  tileRefsPlants: "Plants",
  tileRefsTallPlants: "Tall plants",
  tileRefsSeeds: "Seeds",
  tileRefsItems: "Items",
  tileRefsAnimations: "Animations",
  tileRefsPets: "Pets",
  tileRefsMutations: "Mutations",
  tileRefsDecor: "Decor",
};

function formatDisplayName(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildEntries(config: MatcherConfig): Map<number, TileRefEntry[]> {
  const map = new Map<number, TileRefEntry[]>();
  for (const { source, refs } of config.sources) {
    const sourceLabel = SOURCE_LABELS[source] ?? source;
    for (const [key, value] of Object.entries(refs)) {
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      const index = value > 0 ? value - 1 : value;
      const entry: TileRefEntry = {
        index,
        key,
        source,
        sourceLabel,
        qualifiedName: `${source}.${key}`,
        displayName: formatDisplayName(key),
      };
      const current = map.get(index);
      if (current) {
        current.push(entry);
      } else {
        map.set(index, [entry]);
      }
    }
  }
  return map;
}

const rawMatchers: MatcherConfig[] = [
  {
    id: "plants-tall",
    label: "Tall plants",
    test: (sheet) => sheet.includes("tall"),
    sources: [{ source: "tileRefsTallPlants", refs: tileRefsTallPlants }],
  },
  {
    id: "plants",
    label: "Plants",
    test: (sheet) => sheet.includes("plants"),
    sources: [{ source: "tileRefsPlants", refs: tileRefsPlants }],
  },
  {
    id: "mutations",
    label: "Mutations",
    test: (sheet) => sheet.includes("mutation"),
    sources: [{ source: "tileRefsMutations", refs: tileRefsMutations }],
  },
  {
    id: "seeds",
    label: "Seeds",
    test: (sheet) => sheet.includes("seed"),
    sources: [{ source: "tileRefsSeeds", refs: tileRefsSeeds }],
  },
  {
    id: "items",
    label: "Items",
    test: (sheet) => sheet.includes("item"),
    sources: [{ source: "tileRefsItems", refs: tileRefsItems }],
  },
  {
    id: "pets",
    label: "Pets",
    test: (sheet) => sheet.includes("pet"),
    sources: [{ source: "tileRefsPets", refs: tileRefsPets }],
  },
  {
    id: "decor",
    label: "Decor",
    test: (sheet) => sheet.includes("decor"),
    sources: [{ source: "tileRefsDecor", refs: tileRefsDecor }],
  },
  {
    id: "animations",
    label: "Animations",
    test: (sheet) => sheet.includes("anim"),
    sources: [{ source: "tileRefsAnimations", refs: tileRefsAnimations }],
  },
  {
    id: "map",
    label: "Map",
    test: (sheet) => sheet.includes("map"),
    sources: [{ source: "tileRefsMap", refs: tileRefsMap }],
  },
];

const matchers: SheetMatcher[] = rawMatchers.map((config) => ({
  ...config,
  entries: buildEntries(config),
}));

const matchersBySource = new Map<string, SheetMatcher[]>();
for (const matcher of matchers) {
  for (const { source } of matcher.sources) {
    const existing = matchersBySource.get(source);
    if (existing) existing.push(matcher);
    else matchersBySource.set(source, [matcher]);
  }
}

const fallbackEntries = (() => {
  const map = new Map<number, TileRefEntry[]>();
  for (const matcher of matchers) {
    for (const [index, entries] of matcher.entries) {
      const existing = map.get(index);
      if (existing) {
        existing.push(...entries);
      } else {
        map.set(index, [...entries]);
      }
    }
  }
  return map;
})();

function normalizeSheet(sheet: string): string {
  return sheet.toLowerCase();
}

export function findTileRefMatch(sheet: string, index: number): TileRefMatch | null {
  const normalized = normalizeSheet(sheet);
  for (const matcher of matchers) {
    if (!matcher.test(normalized)) continue;
    const entries = matcher.entries.get(index);
    if (entries?.length) {
      return {
        sheetId: matcher.id,
        sheetLabel: matcher.label,
        entries: [...entries],
      };
    }
  }

  const fallback = fallbackEntries.get(index);
  if (fallback?.length === 1) {
    const entry = fallback[0];
    const sourceMatchers = matchersBySource.get(entry.source);
    if (!sourceMatchers || sourceMatchers.some((m) => m.test(normalized))) {
      return {
        sheetId: entry.source,
        sheetLabel: entry.sourceLabel,
        entries: [...fallback],
      };
    }
  }

  return null;
}

export function knownSheetMatchers(): TileRefMatch[] {
  return matchers.map((matcher) => ({
    sheetId: matcher.id,
    sheetLabel: matcher.label,
    entries: [],
  }));
}
