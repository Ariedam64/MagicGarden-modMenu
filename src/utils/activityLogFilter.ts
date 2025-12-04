import { addStyle, onAdded } from "../core/dom";
import { readAriesPath, writeAriesPath } from "./localStorage";

type ActionKey =
  | "all"
  | "found"
  | "buy"
  | "sell"
  | "harvest"
  | "plant"
  | "feed"
  | "hatch"
  | "water"
  | "boost"
  | "remove"
  | "other"
  | string;

const FILTER_STORAGE_KEY = "activityLog.filter";
const STYLE_ID = "mg-activity-log-filter-style";
const ROOT_FLAG_ATTR = "data-mg-activity-log-filter-ready";
const WRAPPER_CLASS = "mg-activity-log-filter";
const BUTTON_CLASS = "mg-activity-log-filter-btn";
const ACTIVE_CLASS = "is-active";

const ACTION_ORDER: ActionKey[] = [
  "all",
  "found",
  "buy",
  "sell",
  "harvest",
  "plant",
  "feed",
  "hatch",
  "water",
  "boost",
  "remove",
  "other",
];
const ACTION_LABELS: Record<string, string> = {
  all: "All",
  found: "Finds",
  buy: "Purchases",
  sell: "Sold",
  harvest: "Harvests",
  plant: "Planted",
  feed: "Feed",
  hatch: "Hatch",
  water: "Water",
  boost: "Boosts",
  remove: "Remove",
  other: "Other",
};

const ACTION_MAP: Record<string, ActionKey> = {
  purchaseDecor: "buy",
  purchaseSeed: "buy",
  purchaseEgg: "buy",
  purchaseTool: "buy",
  waterPlant: "water",
  plantSeed: "plant",
  plantGardenPlant: "plant",
  potPlant: "plant",
  removeGardenObject: "remove",
  harvest: "harvest",
  feedPet: "feed",
  plantEgg: "hatch",
  hatchEgg: "hatch",
  instaGrow: "boost",
  customRestock: "boost",
  spinSlotMachine: "boost",
  sellAllCrops: "sell",
  sellPet: "sell",
  logItems: "boost",
  mutationPotion: "boost",
  ProduceScaleBoost: "boost",
  ProduceScaleBoostII: "boost",
  DoubleHarvest: "boost",
  DoubleHatch: "boost",
  ProduceEater: "boost",
  SellBoostI: "boost",
  SellBoostII: "boost",
  SellBoostIII: "boost",
  SellBoostIV: "boost",
  ProduceRefund: "boost",
  PlantGrowthBoost: "boost",
  PlantGrowthBoostII: "boost",
  HungerRestore: "boost",
  HungerRestoreII: "boost",
  GoldGranter: "boost",
  RainbowGranter: "boost",
  RainDance: "boost",
  PetXpBoost: "boost",
  PetXpBoostII: "boost",
  EggGrowthBoost: "boost",
  EggGrowthBoostII_NEW: "boost",
  EggGrowthBoostII: "boost",
  PetAgeBoost: "boost",
  PetAgeBoostII: "boost",
  CoinFinderI: "boost",
  CoinFinderII: "boost",
  CoinFinderIII: "boost",
  SeedFinderI: "boost",
  SeedFinderII: "boost",
  SeedFinderIII: "boost",
  SeedFinderIV: "boost",
  PetHatchSizeBoost: "boost",
  PetHatchSizeBoostII: "boost",
  MoonKisser: "boost",
  DawnKisser: "boost",
  PetRefund: "boost",
  PetRefundII: "boost",
};
const ACTION_MAP_LOWER: Record<string, ActionKey> = Object.fromEntries(
  Object.entries(ACTION_MAP).map(([k, v]) => [k.toLowerCase(), v])
) as Record<string, ActionKey>;

const PATTERNS: Array<{ key: ActionKey; re: RegExp }> = [
  { key: "found", re: /\bfound\b/i },
  { key: "buy", re: /\b(bought|purchas(e|ed))\b/i },
  { key: "sell", re: /\bsold\b/i },
  { key: "harvest", re: /harvest/i },
  { key: "water", re: /water(ed)?/i },
  { key: "plant", re: /planted/i },
  { key: "feed", re: /\bfed\b/i },
  { key: "hatch", re: /\bhatched?\b/i },
  { key: "remove", re: /\b(remove|removed|delete)\b/i },
  { key: "boost", re: /\b(boost|potion|refund|granter|growth|restock|spin)\b/i },
];

let started = false;
let activeFilter: ActionKey = loadPersistedFilter() ?? "all";

export function startActivityLogFilter(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  ensureStyles();

  onAdded(
    (el) => el instanceof HTMLElement && el.matches("p.chakra-text") && /activity\s*log/i.test(el.textContent || ""),
    (titleEl) => {
      const root = titleEl.closest<HTMLElement>("div.McGrid");
      if (!root || root.hasAttribute(ROOT_FLAG_ATTR)) return;

      const header = root.querySelector<HTMLElement>("div.McFlex.css-2tfeb0") ?? titleEl.closest<HTMLElement>("div.McFlex");
      const content =
        root.querySelector<HTMLElement>("div.McFlex.css-iek5kf") ??
        root.querySelectorAll<HTMLElement>("div.McFlex")[1] ??
        null;

      if (!header || !content) return;

      root.setAttribute(ROOT_FLAG_ATTR, "1");
      injectFilter(header, content);
    },
    { callForExisting: true }
  );
}

function injectFilter(header: HTMLElement, content: HTMLElement): void {
  const wrapper = document.createElement("div");
  wrapper.className = WRAPPER_CLASS;
  wrapper.style.width = "100%";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.gridColumn = "1 / -1";
  wrapper.style.alignSelf = "start";
  wrapper.style.justifyContent = "flex-start";
  wrapper.style.flex = "0 0 auto";
  wrapper.style.minHeight = "auto";

  const label = document.createElement("span");
  label.textContent = "Filter by action:";
  label.className = `${WRAPPER_CLASS}__label`;

  const buttons = document.createElement("div");
  buttons.className = `${WRAPPER_CLASS}__buttons`;
  buttons.style.flex = "1 1 100%";
  buttons.style.minWidth = "0";
  buttons.style.alignItems = "center";

  wrapper.append(label, buttons);
  content.insertBefore(wrapper, content.firstChild);

  const entriesContainer =
    content.querySelector<HTMLElement>("div.McFlex.css-173k61n") ?? content.querySelector<HTMLElement>("div.McFlex") ?? content;

  const renderButtons = (counts: Map<ActionKey, number>) => {
    const actions = mergeActions(Array.from(counts.keys()));
    if (!actions.includes("all")) actions.unshift("all");

    buttons.innerHTML = "";
    for (const action of actions) {
      const count = counts.get(action) ?? 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${BUTTON_CLASS}${action === activeFilter ? ` ${ACTIVE_CLASS}` : ""}`;
      btn.textContent = `${getActionLabel(action)}${count ? ` (${count})` : ""}`;
      btn.dataset.action = action;
      btn.addEventListener("click", () => {
        activeFilter = action;
        persistFilter(action);
        updateButtons(buttons);
        applyFilter(entriesContainer, activeFilter);
      });
      buttons.appendChild(btn);
    }
  };

  const refresh = () => {
    const counts = new Map<ActionKey, number>();
    for (const entry of getEntryElements(entriesContainer)) {
      const action = classifyEntry(entry);
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
    renderButtons(counts);
    if (!counts.has(activeFilter) && activeFilter !== "all") {
      activeFilter = "all";
      persistFilter(activeFilter);
      updateButtons(buttons);
    }
    applyFilter(entriesContainer, activeFilter);
  };

  const obs = new MutationObserver(() => refresh());
  obs.observe(entriesContainer, { childList: true, subtree: true });

  refresh();

  const cleanup = () => obs.disconnect();
  const onRemoved = () => cleanup();
  wrapper.addEventListener("DOMNodeRemovedFromDocument", onRemoved, { once: true });
}

function classifyEntry(entry: HTMLElement): ActionKey {
  const preset =
    entry.dataset.action ||
    entry.getAttribute("data-action") ||
    entry.getAttribute("data-activity") ||
    entry.dataset.mgAction;
  if (preset && typeof preset === "string") {
    const trimmed = preset.trim();
    if (trimmed) {
      const normalized = normalizeAction(trimmed);
      entry.dataset.mgAction = normalized;
      return normalized;
    }
  }

  const text = (entry.textContent || "").trim();
  for (const { key, re } of PATTERNS) {
    if (re.test(text)) {
      entry.dataset.mgAction = key;
      return key;
    }
  }
  entry.dataset.mgAction = "other";
  return "other";
}

function normalizeAction(raw: string): ActionKey {
  const lowered = raw.toLowerCase();
  if (ACTION_MAP[raw as keyof typeof ACTION_MAP]) return ACTION_MAP[raw as keyof typeof ACTION_MAP];
  if (ACTION_MAP_LOWER[lowered as keyof typeof ACTION_MAP_LOWER]) return ACTION_MAP_LOWER[lowered as keyof typeof ACTION_MAP_LOWER];
  for (const { key, re } of PATTERNS) {
    if (re.test(lowered)) return key;
  }
  return lowered || "other";
}

function getEntryElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  return candidates.filter((child) => {
    if (child.classList.contains(WRAPPER_CLASS)) return false;
    const text = child.textContent || "";
    return /\bago\b/i.test(text) || child.querySelector("p.chakra-text");
  });
}

function mergeActions(actions: ActionKey[]): ActionKey[] {
  const seen = new Set<ActionKey>();
  const ordered: ActionKey[] = [];

  for (const k of ACTION_ORDER) {
    if (k === "all") continue;
    if (actions.includes(k) && !seen.has(k)) {
      seen.add(k);
      ordered.push(k);
    }
  }

  for (const a of actions) {
    if (a === "all") continue;
    if (!seen.has(a)) {
      seen.add(a);
      ordered.push(a);
    }
  }

  return ordered;
}

function applyFilter(container: HTMLElement, filter: ActionKey): void {
  for (const entry of getEntryElements(container)) {
    const action = entry.dataset.mgAction ?? classifyEntry(entry);
    const visible = filter === "all" || action === filter;
    entry.style.display = visible ? "" : "none";
  }
}

function updateButtons(buttons: HTMLElement): void {
  buttons.querySelectorAll(`.${BUTTON_CLASS}`).forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = btn.dataset.action as ActionKey | undefined;
    btn.classList.toggle(ACTIVE_CLASS, action === activeFilter);
  });
}

function getActionLabel(action: ActionKey): string {
  return ACTION_LABELS[action] ?? action.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function loadPersistedFilter(): ActionKey | null {
  try {
    const stored = readAriesPath<string>(FILTER_STORAGE_KEY);
    return stored || null;
  } catch {
    return null;
  }
}

function persistFilter(value: ActionKey): void {
  try {
    writeAriesPath(FILTER_STORAGE_KEY, String(value));
  } catch {
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.${WRAPPER_CLASS}{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 10px;
  margin:8px 0 10px 0;
  border-radius:12px;
  background:linear-gradient(180deg, #f7e8d4, #f1dcc1);
  border:1px solid #d7b989;
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 14px rgba(120,70,34,0.22);
  flex-wrap:wrap;
  max-width:100%;
  box-sizing:border-box;
}
.${WRAPPER_CLASS}__label{
  font-size:12px;
  letter-spacing:0.03em;
  text-transform:uppercase;
  opacity:0.85;
  font-weight:700;
  color:#7b4b2b;
}
.${WRAPPER_CLASS}__buttons{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  flex:1 1 100%;
  min-width:0;
}
.${BUTTON_CLASS}{
  border:1px solid #caa56f;
  background:linear-gradient(180deg, #ffe9c8, #f6d7aa);
  color:#5c3416;
  border-radius:999px;
  padding:4px 10px;
  font-size:12px;
  cursor:pointer;
  transition:background 120ms ease, border-color 120ms ease, transform 120ms ease;
  white-space:nowrap;
}
.${BUTTON_CLASS}:hover{
  background:linear-gradient(180deg, #ffe2b2, #f3c98d);
  border-color:#d7b989;
}
.${BUTTON_CLASS}.${ACTIVE_CLASS}{
  background:linear-gradient(180deg, #ffcd82, #f3b05e);
  border-color:#e3a23d;
  box-shadow:0 0 0 1px rgba(227,162,61,0.35), 0 4px 10px rgba(158,94,32,0.25);
  transform:translateY(-1px);
}
`;
  const s = addStyle(css);
  s.id = STYLE_ID;
}
