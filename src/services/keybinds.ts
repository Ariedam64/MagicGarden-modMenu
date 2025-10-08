// src/services/keybinds.ts
import { inGameHotkeys } from "../core/ingameHotkeys";
import { hotkeyToPretty, hotkeyToString, matchHotkey, stringToHotkey, type Hotkey } from "../ui/menu";

export type { Hotkey } from "../ui/menu";

export type KeybindId =
  | "gui.toggle"
  | "gui.drag"
  | "shops.seeds"
  | "shops.eggs"
  | "shops.decors"
  | "shops.tools"
  | "sell.sell-all"
  | "sell.sell-all-pets"
  | "game.action"
  | "game.inventory"
  | "game.move-up"
  | "game.move-down"
  | "game.move-left"
  | "game.move-right"
  | `pets.team.${string}`
  | "pets.team.next"
  | "pets.team.prev";


type GameKeybindId =
  | "game.action"
  | "game.inventory"
  | "game.move-up"
  | "game.move-down"
  | "game.move-left"
  | "game.move-right";


export interface KeybindAction {
  id: KeybindId;
  sectionId: string;
  label: string;
  hint?: string;
  defaultHotkey: Hotkey | null;
  allowModifierOnly?: boolean;
  holdDetection?: KeybindHoldDetectionConfig;
}

export interface KeybindSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  actions: KeybindAction[];
}

export type KeyPhase = "down" | "hold" | "up";
export type KeybindDispatch = (
  id: KeybindAction["id"],
  phase: KeyPhase,
  ev: KeyboardEvent
) => void;

export interface KeybindHoldDetectionConfig {
  label: string;
  description?: string;
  defaultEnabled?: boolean;
}

interface KeybindActionConfig {
  id: KeybindId;
  label: string;
  hint?: string;
  defaultHotkey: Hotkey | null;
  allowModifierOnly?: boolean;
  holdDetection?: KeybindHoldDetectionConfig;
}

interface KeybindSectionConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
  actions: KeybindActionConfig[];
}

const SECTION_CONFIG: KeybindSectionConfig[] = [
  {
    id: "gui",
    title: "GUI",
    icon: "🖥️",
    description: "Choose how you open and move the overlay.",
    actions: [
      {
        id: "gui.toggle",
        label: "👁️ Toggle menu visibility",
        hint: "Opens or closes the Arie's Mod overlay.",
        defaultHotkey: { alt: true, code: "KeyX" },
      },
      {
        id: "gui.drag",
        label: "✋ Drag HUD",
        hint: "Hold to drag menus interfaces around the screen.",
        defaultHotkey: { alt: true, code: "AltLeft" },
        allowModifierOnly: true,
      },
    ],
  },
  {
    id: "shops",
    title: "Shops",
    icon: "🛒",
    description: "Quick shortcuts to every shop tab.",
    actions: [
      {
        id: "shops.seeds",
        label: "🌰 Seeds shop",
        defaultHotkey: { alt: true, code: "KeyS" },
      },
      {
        id: "shops.eggs",
        label: "🥚 Eggs shop",
        defaultHotkey: { alt: true, code: "KeyE" },
      },
      {
        id: "shops.decors",
        label: "🪑 Decors shop",
        defaultHotkey: { alt: true, code: "KeyD" },
      },
      {
        id: "shops.tools",
        label: "🧺 Tools shop",
        defaultHotkey: { alt: true, code: "KeyT" },
      },
    ],
  },
  {
    id: "game",
    title: "Game",
    icon: "🎮",
    description: "Remap the in-game actions",
    actions: [
      {
        id: "game.action",
        label: "⚡ Action",
        defaultHotkey: { code: "Space" },
        holdDetection: {
          label: "Hold to repeat",
          defaultEnabled: false,
        },
      },
      {
        id: "game.inventory",
        label: "🎒 Inventory",
        defaultHotkey: { code: "KeyE" },
      },
      {
        id: "game.move-up",
        label: "⬆ Move up",
        defaultHotkey: { code: "KeyW" },
      },
      {
        id: "game.move-down",
        label: "⬇ Move down",
        defaultHotkey: { code: "KeyS" },
      },
      {
        id: "game.move-left",
        label: "⬅ Move left",
        defaultHotkey: { code: "KeyA" },
      },
      {
        id: "game.move-right",
        label: "➡ Move right",
        defaultHotkey: { code: "KeyD" },
      },
    ],
  },
  {
    id: "sell",
    title: "Sell",
    icon: "💰",
    description: "Streamline selling actions.",
    actions: [
      {
        id: "sell.sell-all",
        label: "🌾 All crops",
        hint: "Trigger the sell-all flow for harvested crops.",
        defaultHotkey: null,
      },
      {
        id: "sell.sell-all-pets",
        label: "🐾 All pets",
        hint: "Sell every non-favorited pet in your inventory.",
        defaultHotkey: null,
      },
    ],
  },
];

const STORAGE_PREFIX = "qws:keybind:";
const HOLD_STORAGE_PREFIX = "qws:keybind-hold:";
const STORED_NONE = "__none__";

const actionMap = new Map<KeybindId, KeybindAction>();
const defaultMap = new Map<KeybindId, Hotkey | null>();
const cache = new Map<KeybindId, Hotkey | null>();
const listeners = new Map<KeybindId, Set<(hk: Hotkey | null) => void>>();
const holdDefaultMap = new Map<KeybindId, boolean>();
const holdCache = new Map<KeybindId, boolean>();
const holdListeners = new Map<KeybindId, Set<(enabled: boolean) => void>>();

const keybindSections: KeybindSection[] = SECTION_CONFIG.map((section) => {
  const actions = section.actions.map<KeybindAction>((action) => {
    const normalized: KeybindAction = {
      id: action.id,
      sectionId: section.id,
      label: action.label,
      hint: action.hint,
      allowModifierOnly: action.allowModifierOnly,
      defaultHotkey: cloneHotkey(action.defaultHotkey),
      holdDetection: action.holdDetection
        ? {
            label: action.holdDetection.label,
            description: action.holdDetection.description,
            defaultEnabled: action.holdDetection.defaultEnabled,
          }
        : undefined,
    };
    actionMap.set(normalized.id, normalized);
    defaultMap.set(normalized.id, cloneHotkey(action.defaultHotkey));
    if (action.holdDetection) {
      holdDefaultMap.set(normalized.id, !!action.holdDetection.defaultEnabled);
    }
    return normalized;
  });
  return {
    id: section.id,
    title: section.title,
    description: section.description,
    icon: section.icon,
    actions,
  };
});

const PET_SECTION_ID = "pets";
export const PET_TEAM_ACTION_PREFIX = "pets.team.";
export const PET_TEAM_NEXT_ID = "pets.team.next" as const;
export const PET_TEAM_PREV_ID = "pets.team.prev" as const;

type PetTeamActionId = `${typeof PET_TEAM_ACTION_PREFIX}${string}`;

const petSection: KeybindSection = {
  id: PET_SECTION_ID,
  title: "Pets",
  icon: "🐷",
  description: "Assign shortcuts to your pet teams and cycle through them instantly.",
  actions: [],
};

keybindSections.push(petSection);

const petActionIds = new Set<KeybindId>();

export interface PetTeamKeybindInfo {
  id: string;
  name?: string | null;
}

export function getPetTeamActionId(teamId: string): PetTeamActionId {
  return `${PET_TEAM_ACTION_PREFIX}${teamId}` as PetTeamActionId;
}

function disposePetAction(id: KeybindId): void {
  actionMap.delete(id);
  defaultMap.delete(id);
  cache.delete(id);
  listeners.delete(id);
  holdDefaultMap.delete(id);
  holdCache.delete(id);
  holdListeners.delete(id);
}

function registerPetAction(action: KeybindAction, defaultHotkey: Hotkey | null): void {
  const normalized: KeybindAction = {
    id: action.id,
    sectionId: PET_SECTION_ID,
    label: action.label,
    hint: action.hint,
    allowModifierOnly: action.allowModifierOnly,
    defaultHotkey: cloneHotkey(defaultHotkey),
    holdDetection: action.holdDetection
      ? {
          label: action.holdDetection.label,
          description: action.holdDetection.description,
          defaultEnabled: action.holdDetection.defaultEnabled,
        }
      : undefined,
  };
  actionMap.set(normalized.id, normalized);
  defaultMap.set(normalized.id, cloneHotkey(defaultHotkey));
  petActionIds.add(normalized.id);
  petSection.actions.push(normalized);
}

export function updatePetKeybinds(teams: PetTeamKeybindInfo[]): void {
  for (const id of petActionIds) {
    disposePetAction(id);
  }
  petActionIds.clear();
  petSection.actions = [];

  registerPetAction(
    {
      id: PET_TEAM_PREV_ID,
      sectionId: PET_SECTION_ID,
      label: "◀️ Previous team",
      defaultHotkey: null,
    },
    null
  );

  registerPetAction(
    {
      id: PET_TEAM_NEXT_ID,
      sectionId: PET_SECTION_ID,
      label: "▶️ Next team",
      defaultHotkey: null,
    },
    null
  );

  teams.forEach((team, index) => {
    const name = String(team?.name || "").trim();
    const labelName = name.length ? name : `Team ${index + 1}`;
    registerPetAction(
      {
        id: getPetTeamActionId(team.id),
        sectionId: PET_SECTION_ID,
        label: `Use team — ${labelName}`,
        defaultHotkey: null,
      },
      null
    );
  });
}

updatePetKeybinds([]);

const GAME_KEYBIND_TARGETS: Record<GameKeybindId, string> = {
  "game.action": "Space",
  "game.inventory": "KeyE",
  "game.move-up": "KeyW",    // Z (AZERTY) == KeyW
  "game.move-down": "KeyS",  // S
  "game.move-left": "KeyA",  // Q (AZERTY) == KeyA
  "game.move-right": "KeyD", // D
};

const GAME_KEYBIND_IDS: GameKeybindId[] = [
  "game.action",
  "game.inventory",
  "game.move-up",
  "game.move-down",
  "game.move-left",
  "game.move-right",
];

interface GameKeybindState {
  combo: string;
  replaced: boolean;
  rapidFire: boolean;
}

const gameActiveStates = new Map<GameKeybindId, GameKeybindState>();
let gameKeybindsInstalled = false;

const GAME_ACTION_ID: GameKeybindId = "game.action";

const gameActionBlockers = new Set<string>();
const gameActionBlockedCombos = new Set<string>();

function getCombosForGameAction(): string[] {
  const state = gameActiveStates.get(GAME_ACTION_ID);
  if (!state) return [];
  const combo = state.combo;
  return typeof combo === "string" && combo.length ? [combo] : [];
}

function applyGameActionBlockers(): void {
  const shouldBlock = gameActionBlockers.size > 0;
  const desired = new Set<string>();

  if (shouldBlock) {
    for (const combo of getCombosForGameAction()) {
      if (combo) desired.add(combo);
    }
  }

  for (const combo of gameActionBlockedCombos) {
    if (!desired.has(combo)) {
      try {
        inGameHotkeys.unblock(combo);
      } catch {
        /* ignore */
      }
    }
  }

  if (shouldBlock) {
    for (const combo of desired) {
      if (!gameActionBlockedCombos.has(combo)) {
        try {
          inGameHotkeys.block(combo);
        } catch {
          /* ignore */
        }
      }
    }
  }

  gameActionBlockedCombos.clear();
  if (shouldBlock) {
    for (const combo of desired) gameActionBlockedCombos.add(combo);
  }
}

export function setGameActionBlocked(source: string, blocked: boolean): void {
  if (!source) return;
  if (blocked) {
    gameActionBlockers.add(source);
  } else {
    gameActionBlockers.delete(source);
  }
  applyGameActionBlockers();
}

function hotkeyToCombo(hk: Hotkey | null): string | null {
  if (!hk) return null;
  const combo = hotkeyToString(hk);
  return combo.length ? combo : null;
}

function purgeTargetBindings(emitCombo: string): void {
  try { inGameHotkeys.unblock(emitCombo); } catch {}
  try {
    const curr = inGameHotkeys.current(); // { fromCombo: "Ctrl+KeyX" | "KeyX" | ... → "KeyY" | "Space" | ... }
    for (const [from, to] of Object.entries(curr)) {
      // isole le dernier token (le code destination)
      const toCode = String(to).split("+").pop();
      if (toCode === emitCombo) {
        try { inGameHotkeys.remove(from); } catch {}
      }
    }
  } catch {}
}

function isMac(): boolean {
  // petit heuristique OS
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
}

function codeToDisplay(code?: string): string {
  if (!code) return "";
  // Lettres & chiffres physiques
  const mKey = code.match(/^Key([A-Z])$/);
  if (mKey) return mKey[1];                      // "KeyE" -> "E"
  const mDigit = code.match(/^Digit([0-9])$/);
  if (mDigit) return mDigit[1];                  // "Digit5" -> "5"

  // Modifiers (côté “key” principal, pas besoin de préciser Left/Right)
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "AltLeft"     || code === "AltRight")     return "Alt";
  if (code === "ShiftLeft"   || code === "ShiftRight")   return "Shift";
  if (code === "MetaLeft"    || code === "MetaRight")    return isMac() ? "⌘" : "Win";

  // Spéciaux / navigation
  if (code === "Space")     return "Space";   // ou "⎵"
  if (code === "Enter")     return "Enter";   // ou "↵"
  if (code === "Escape")    return "Esc";
  if (code === "Tab")       return "Tab";
  if (code === "Backspace") return "Backspace"; // ou "⌫"
  if (code === "Delete")    return "Del";
  if (code === "Insert")    return "Ins";
  if (code === "ArrowUp")   return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight")return "→";

  // Par défaut, on garde tel quel (rare)
  return code;
}

function prettyHotkey(hk: Hotkey | null): string {
  if (!hk) return "—";

  const mods: string[] = [];
  if ((hk as any).ctrl)  mods.push("Ctrl");
  if ((hk as any).shift) mods.push("Shift");
  if ((hk as any).alt)   mods.push("Alt");
  if ((hk as any).meta)  mods.push(isMac() ? "⌘" : "Win");

  // base: on préfère hk.key si c’est un seul caractère (ex: "e"), sinon on dérive de hk.code
  let base = "";
  const k = (hk as any).key;
  if (typeof k === "string" && k.length === 1) {
    base = k.toUpperCase();
  } else {
    base = codeToDisplay((hk as any).code);
  }

  // éviter “Alt + Alt” si { alt: true, code: "AltLeft" } etc.
  const baseIsModifier = base && ["Ctrl", "Shift", "Alt", "⌘", "Win"].includes(base);
  const parts = baseIsModifier ? mods : (mods.concat(base ? [base] : []));

  return parts.join(" + ");
}


function syncGameKeybind(id: GameKeybindId): void {
  if (typeof window === "undefined") return;

  const emitCombo = GAME_KEYBIND_TARGETS[id]; // ex. "Space" ou "KeyW"

  // 0) Nettoyage complet de TOUT ce qui cible la touche in-game (blocages + remaps résiduels)
  purgeTargetBindings(emitCombo);

  // 1) Nettoyage de l'état précédent (si on en avait un suivi)
  const prev = gameActiveStates.get(id);
  if (prev) {
    if (prev.rapidFire) {
      try { inGameHotkeys.stopRapidFire(prev.combo); } catch {}
    }
    // NB: pas besoin de remove/unblock ici : purgeTargetBindings l'a déjà fait pour nous
    gameActiveStates.delete(id);
  }

  // 2) Récupère le combo utilisateur choisi dans l’UI
  const combo = hotkeyToCombo(getKeybind(id));
  if (!combo) {
    if (id === GAME_ACTION_ID) {
      applyGameActionBlockers();
    }
    return;
  }

  const holdEnabled = getKeybindHoldDetection(id);

  // 3) Si l’utilisateur a choisi la même touche que le jeu attend → rien à remapper
  let replaced = false;
  if (combo !== emitCombo) {
    try {
      // oldBase = la touche que le jeu attend (emitCombo), newPhysical = touche physique utilisateur (combo)
      inGameHotkeys.replace(emitCombo, combo);
      replaced = true;
    } catch {}
  }
  // sinon: aucun replace, et Space (ou KeyW, etc.) n'est plus bloqué grâce à purgeTargetBindings()

  // 4) Rapid-fire uniquement si l’option Hold est activée pour cette action
  let rapidFire = false;
  if (holdEnabled) {
    try {
      inGameHotkeys.startRapidFire({
        trigger: combo, // on tient la touche choisie
        emit: combo,    // remapper convertira en emitCombo si replace() actif
        mode: "tap",
        rateHz: 10,
      });
      rapidFire = true;
    } catch {}
  }

  gameActiveStates.set(id, { combo, replaced, rapidFire });

  if (id === GAME_ACTION_ID) {
    applyGameActionBlockers();
  }
}

export function mountGlobalKeybinds(opts: {
  onAction: KeybindDispatch;                // quoi faire quand une action est déclenchée
  isRebinding?: () => boolean;              // vrai quand tu es en train d’enregistrer un nouveau bind
  canUseGameplayInput?: () => boolean;      // ex: () => document.hasFocus() && !ui.isPaused()
  preventDefault?: boolean;                 // false pour ne pas stopper scroll/shortcuts navigateur
  actionIds?: Array<KeybindAction["id"]>;   // par défaut: toutes les actions déclarées
}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const pressed = new Set<string>();
  const ids =
    (opts.actionIds && opts.actionIds.length
      ? opts.actionIds
      : getKeybindSections().flatMap(s => s.actions.map(a => a.id))) as Array<KeybindAction["id"]>;

  const isTyping = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as any).isContentEditable);
  };

  const canUse =
    opts.canUseGameplayInput ??
    (() => true);

  function handle(ev: KeyboardEvent, phase: KeyPhase) {
    if (opts.isRebinding?.() === true) return;
    if (!canUse()) return;
    if (isTyping(ev.target)) return;

    for (const id of ids) {
      const hk = getKeybind(id as any);
      if (!hk) continue;

      if (matchesHotkey(ev, hk)) {
        const detectHold = getKeybindHoldDetection(id as any);
        let actualPhase: KeyPhase = phase;

        if (phase === "down") {
          const wasPressed = pressed.has(String(id));
          if (wasPressed || ev.repeat) {
            if (!detectHold) break;
            actualPhase = "hold";
          } else {
            pressed.add(String(id));
          }
        } else {
          pressed.delete(String(id));
        }

        if (opts.preventDefault !== false) {
          ev.preventDefault();
          ev.stopPropagation();
        }

        opts.onAction(id, actualPhase, ev);
        break; // on stoppe au premier match
      }
    }
  }

  function matchesHotkey(ev: KeyboardEvent, hk: any): boolean {
  if (typeof hk === "string") {
    const parts = hk.toLowerCase().split("+").map((s: string) => s.trim());
    const want = {
      ctrl: parts.includes("ctrl") || parts.includes("control"),
      alt: parts.includes("alt"),
      shift: parts.includes("shift"),
      meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command") || parts.includes("super"),
      key: parts[parts.length - 1],
    };
    return (ev.ctrlKey || false) === want.ctrl &&
           (ev.altKey || false) === want.alt &&
           (ev.shiftKey || false) === want.shift &&
           (ev.metaKey || false) === want.meta &&
           ev.key.toLowerCase() === want.key;
  }

  // Objet
  const key = (hk.key ?? hk.code ?? hk.k ?? "").toString().toLowerCase();
  const evKey = (ev.key ?? ev.code ?? "").toLowerCase();
  const keyOk   = key ? evKey === key : true;
  const ctrlOk  = "ctrl"  in hk ? !!ev.ctrlKey  === !!hk.ctrl  : true;
  const altOk   = "alt"   in hk ? !!ev.altKey   === !!hk.alt   : true;
  const shiftOk = "shift" in hk ? !!ev.shiftKey === !!hk.shift : true;
  const metaOk  = "meta"  in hk ? !!ev.metaKey  === !!hk.meta  : true;
  return keyOk && ctrlOk && altOk && shiftOk && metaOk;
}

  const onDown = (e: KeyboardEvent) => handle(e, "down");
  const onUp   = (e: KeyboardEvent) => handle(e, "up");

  window.addEventListener("keydown", onDown, true); // capture:true => avant l’UI
  window.addEventListener("keyup", onUp, true);

  window.addEventListener("blur", () => pressed.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") pressed.clear();
  });

  return () => {
    window.removeEventListener("keydown", onDown, true);
    window.removeEventListener("keyup", onUp, true);
  };
}

function cloneHotkey(hk: Hotkey | null): Hotkey | null {
  return hk ? { ...hk } : null;
}

function hotkeysEqual(a: Hotkey | null, b: Hotkey | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return hotkeyToString(a) === hotkeyToString(b);
}

function storageKey(id: KeybindId): string {
  return `${STORAGE_PREFIX}${id}`;
}

function holdStorageKey(id: KeybindId): string {
  return `${HOLD_STORAGE_PREFIX}${id}`;
}

function readStored(id: KeybindId): Hotkey | null | undefined {
  if (typeof window === "undefined") return undefined;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(id));
  } catch {
    return undefined;
  }
  if (raw == null) return undefined;
  if (raw === STORED_NONE) return null;
  const parsed = stringToHotkey(raw);
  return parsed ?? null;
}

function writeStored(id: KeybindId, hk: Hotkey | null): void {
  if (typeof window === "undefined") return;
  try {
    if (hk) {
      window.localStorage.setItem(storageKey(id), hotkeyToString(hk));
    } else {
      window.localStorage.setItem(storageKey(id), STORED_NONE);
    }
  } catch {
    /* ignore */
  }
}

function removeStored(id: KeybindId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    /* ignore */
  }
}

function readHoldStored(id: KeybindId): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(holdStorageKey(id));
  } catch {
    return undefined;
  }
  if (raw == null) return undefined;
  return raw === "1";
}

function writeHoldStored(id: KeybindId, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(holdStorageKey(id), enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function emitHoldChange(id: KeybindId): void {
  const set = holdListeners.get(id);
  if (!set || set.size === 0) return;
  const current = getKeybindHoldDetection(id);
  for (const cb of set) cb(current);
}

function emitChange(id: KeybindId): void {
  const set = listeners.get(id);
  if (!set || set.size === 0) return;
  const current = cloneHotkey(getKeybind(id));
  for (const cb of set) cb(current);
}

function ensureCache(id: KeybindId): Hotkey | null {
  if (cache.has(id)) {
    return cloneHotkey(cache.get(id) ?? null);
  }
  const stored = readStored(id);
  const resolved = stored === undefined ? cloneHotkey(defaultMap.get(id) ?? null) : cloneHotkey(stored);
  cache.set(id, resolved);
  return cloneHotkey(resolved);
}

let cachePrimed = false;

function ensureHoldCache(id: KeybindId): boolean {
  if (!holdDefaultMap.has(id)) return false;
  if (holdCache.has(id)) {
    return holdCache.get(id) ?? false;
  }
  const stored = readHoldStored(id);
  const resolved = stored === undefined ? !!holdDefaultMap.get(id) : stored;
  holdCache.set(id, resolved);
  return resolved;
}

/**
 * Preloads every keybind in memory so shortcuts are immediately available
 * even if the dedicated menu has never been opened in the session.
 */
export function primeKeybindCache(): void {
  if (cachePrimed) return;
  cachePrimed = true;

  for (const id of actionMap.keys()) {
    ensureCache(id);
  }
}

export function getKeybind(id: KeybindId): Hotkey | null {
  return ensureCache(id);
}

export function getDefaultKeybind(id: KeybindId): Hotkey | null {
  return cloneHotkey(defaultMap.get(id) ?? null);
}

export function setKeybind(id: KeybindId, hk: Hotkey | null): void {
  const current = getKeybind(id);
  if (hotkeysEqual(current, hk)) return;

  const next = cloneHotkey(hk);

  if (next) {
    const asString = hotkeyToString(next);
    for (const otherId of actionMap.keys()) {
      if (otherId === id) continue;
      const other = getKeybind(otherId);
      if (!other) continue;
      if (hotkeyToString(other) !== asString) continue;
      cache.set(otherId, null);
      writeStored(otherId, null);
      emitChange(otherId);
    }
  }

  cache.set(id, next);
  writeStored(id, next);
  emitChange(id);
}

export function resetKeybind(id: KeybindId): void {
  cache.delete(id);
  removeStored(id);
  emitChange(id);
}

export function getKeybindHoldDetection(id: KeybindId): boolean {
  return ensureHoldCache(id);
}

export function setKeybindHoldDetection(id: KeybindId, enabled: boolean): void {
  if (!holdDefaultMap.has(id)) return;
  const current = ensureHoldCache(id);
  if (current === enabled) return;
  holdCache.set(id, enabled);
  writeHoldStored(id, enabled);
  emitHoldChange(id);
}

export function onKeybindHoldDetectionChange(id: KeybindId, cb: (enabled: boolean) => void): () => void {
  if (!holdDefaultMap.has(id)) {
    return () => {};
  }
  const set = holdListeners.get(id) ?? new Set<(enabled: boolean) => void>();
  if (!holdListeners.has(id)) holdListeners.set(id, set);
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) holdListeners.delete(id);
  };
}

export function onKeybindChange(id: KeybindId, cb: (hk: Hotkey | null) => void): () => void {
  const set = listeners.get(id) ?? new Set();
  if (!listeners.has(id)) listeners.set(id, set);
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(id);
  };
}

export function eventMatchesKeybind(id: KeybindId, e: KeyboardEvent): boolean {
  return matchHotkey(e, getKeybind(id));
}

export function installGameKeybindsOnce(): void {
  if (gameKeybindsInstalled || typeof window === "undefined") return;
  gameKeybindsInstalled = true;

  for (const id of GAME_KEYBIND_IDS) {
    syncGameKeybind(id);
    onKeybindChange(id, () => syncGameKeybind(id));
    onKeybindHoldDetectionChange(id, () => syncGameKeybind(id));
  }
}

export function getKeybindLabel(id: KeybindId): string {
  return prettyHotkey(getKeybind(id));
}

export function getKeybindSections(): KeybindSection[] {
  return keybindSections.map((section) => ({
    ...section,
    actions: section.actions.map((action) => ({
      ...action,
      defaultHotkey: cloneHotkey(action.defaultHotkey),
      holdDetection: action.holdDetection
        ? {
            label: action.holdDetection.label,
            description: action.holdDetection.description,
            defaultEnabled: action.holdDetection.defaultEnabled,
          }
        : undefined,
    })),
  }));
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
    const id = event.key.slice(STORAGE_PREFIX.length) as KeybindId;
    if (!actionMap.has(id)) return;
    cache.delete(id);
    emitChange(id);
  });
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith(HOLD_STORAGE_PREFIX)) return;
    const id = event.key.slice(HOLD_STORAGE_PREFIX.length) as KeybindId;
    if (!holdDefaultMap.has(id)) return;
    holdCache.delete(id);
    emitHoldChange(id);
  });
}
