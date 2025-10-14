// src/services/pets.ts
import {
  PlayerService,
  type PetInfo,
  type PetState,
  type CropItem,
  type CropInventoryState,
} from "./player";
import { petCatalog, petAbilities } from "../data/hardcoded-data.clean.js";
import { fakeInventoryShow, closeInventoryPanel, isInventoryOpen } from "./fakeModal.ts";
import { Atoms } from "../store/atoms";
import { Hotkey, matchHotkey, stringToHotkey } from "../ui/menu.ts";
import {
  getKeybind,
  getPetTeamActionId,
  onKeybindChange,
  setKeybind,
  updatePetKeybinds,
  PET_TEAM_NEXT_ID,
  PET_TEAM_PREV_ID,
} from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";
import { StatsService } from "./stats";

/* ----------------------------- Types & constants ----------------------------- */

export type PetTeam = {
  id: string;
  name: string;
  slots: (string | null)[];
};

export type InventoryPet = {
  id: string;
  itemType: "Pet";
  petSpecies: string;
  name: string | null;
  xp: number;
  hunger: number;
  mutations: string[];
  targetScale?: number;
  abilities: string[];
};

export type AutofeedTrigger = {
  pet: PetInfo;
  petId: string;
  species: string;
  hungerPct: number;
  thresholdPct: number;
  allowedCrops: string[];
  chosenItem?: CropItem | null;
  didUnfavorite?: boolean;
};

export type PetOverride = {
  enabled: boolean;
  thresholdPct: number;
  crops: Record<string, { allowed: boolean }>;
};

export type PetOverridesMap = Record<string, PetOverride>;

export type PetsUIState = {
  selectedPetId: string | null;
};

type PetImgEntry = { img64?: { normal?: string; gold?: string; rainbow?: string } };
type PetCatalogLoose = Record<string, PetImgEntry>;

const LS_OVERRIDES_KEY   = "qws:pets:overrides:v1";
const LS_UI_KEY          = "qws:pets:ui:v1";
const LS_TEAMS_KEY       = "qws:pets:teams:v1";
const LS_TEAM_SEARCH_KEY = "qws:pets:teamSearch:v1";
const LS_TEAM_HK_PREFIX  = "qws:hk:petteam:use:";

/* -------------------------------- HOTKEYS ----------------------------------- */

const TEAM_HK_MAP = new Map<string, Hotkey>();
const TEAM_HK_UNSUBS = new Map<string, () => void>();
let hkNextTeam: Hotkey | null = null;
let hkPrevTeam: Hotkey | null = null;
let unsubNextHotkey: (() => void) | null = null;
let unsubPrevHotkey: (() => void) | null = null;
let orderedTeamIds: string[] = [];
let lastUsedTeamId: string | null = null;

const legacyKeyForTeam = (id: string) => `${LS_TEAM_HK_PREFIX}${id}`;

export type TeamLite = { id: string; name?: string | null };

function syncTeamHotkey(teamId: string): void {
  const hk = getKeybind(getPetTeamActionId(teamId));
  if (hk) TEAM_HK_MAP.set(teamId, hk);
  else TEAM_HK_MAP.delete(teamId);
}

function syncNextTeamHotkey(): void {
  hkNextTeam = getKeybind(PET_TEAM_NEXT_ID);
}

function syncPrevTeamHotkey(): void {
  hkPrevTeam = getKeybind(PET_TEAM_PREV_ID);
}

function ensureLegacyTeamHotkeyMigration(teamId: string): void {
  if (typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem(legacyKeyForTeam(teamId));
    if (!legacy) return;
    const actionId = getPetTeamActionId(teamId);
    const existing = getKeybind(actionId);
    if (!existing) {
      const hk = stringToHotkey(legacy);
      if (hk) {
        setKeybind(actionId, hk);
      }
    }
    localStorage.removeItem(legacyKeyForTeam(teamId));
  } catch {}
}

function normalizeTeamList(teams: TeamLite[]): TeamLite[] {
  if (!Array.isArray(teams)) return [];
  return teams.map(t => ({ id: String(t?.id ?? ""), name: t?.name ?? null })).filter(t => t.id.length > 0);
}

function ensureLastUsedTeamIsValid(): void {
  if (!orderedTeamIds.length) {
    lastUsedTeamId = null;
    return;
  }
  if (!lastUsedTeamId || !orderedTeamIds.includes(lastUsedTeamId)) {
    lastUsedTeamId = orderedTeamIds[0] ?? null;
  }
}

function adjacentTeam(direction: 1 | -1): string | null {
  if (!orderedTeamIds.length) return null;
  if (!lastUsedTeamId || !orderedTeamIds.includes(lastUsedTeamId)) {
    return direction === 1
      ? orderedTeamIds[0] ?? null
      : orderedTeamIds[orderedTeamIds.length - 1] ?? null;
  }
  if (orderedTeamIds.length === 1) return orderedTeamIds[0] ?? null;
  const currentIndex = orderedTeamIds.indexOf(lastUsedTeamId);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = orderedTeamIds.length - 1;
  if (nextIndex >= orderedTeamIds.length) nextIndex = 0;
  return orderedTeamIds[nextIndex] ?? null;
}

export function markTeamAsUsed(teamId: string | null): void {
  lastUsedTeamId = teamId ? String(teamId) : null;
}

export function setTeamsForHotkeys(rawTeams: TeamLite[]) {
  for (const unsub of TEAM_HK_UNSUBS.values()) {
    try { unsub(); } catch {}
  }
  TEAM_HK_UNSUBS.clear();
  if (unsubNextHotkey) {
    try { unsubNextHotkey(); } catch {}
    unsubNextHotkey = null;
  }
  if (unsubPrevHotkey) {
    try { unsubPrevHotkey(); } catch {}
    unsubPrevHotkey = null;
  }

  const teams = normalizeTeamList(rawTeams);
  updatePetKeybinds(teams);

  orderedTeamIds = teams.map(t => t.id);
  ensureLastUsedTeamIsValid();

  const keep = new Set(orderedTeamIds);
  for (const teamId of Array.from(TEAM_HK_MAP.keys())) {
    if (!keep.has(teamId)) TEAM_HK_MAP.delete(teamId);
  }

  teams.forEach((team) => {
    ensureLegacyTeamHotkeyMigration(team.id);
    syncTeamHotkey(team.id);
    const unsub = onKeybindChange(getPetTeamActionId(team.id), () => syncTeamHotkey(team.id));
    TEAM_HK_UNSUBS.set(team.id, unsub);
  });

  syncNextTeamHotkey();
  syncPrevTeamHotkey();
  unsubNextHotkey = onKeybindChange(PET_TEAM_NEXT_ID, () => syncNextTeamHotkey());
  unsubPrevHotkey = onKeybindChange(PET_TEAM_PREV_ID, () => syncPrevTeamHotkey());
}

export function installPetTeamHotkeysOnce(onUseTeam: (teamId: string) => void) {
  const FLAG = "__qws_pet_team_hk_installed";
  if ((window as any)[FLAG]) return;
  window.addEventListener(
    "keydown",
    (e) => {
      if (shouldIgnoreKeydown(e)) return;
      const useTeam = (teamId: string | null) => {
        if (!teamId) return;
        markTeamAsUsed(teamId);
        onUseTeam(teamId);
      };

      if (hkPrevTeam && matchHotkey(e, hkPrevTeam)) {
        const target = adjacentTeam(-1);
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(target);
          return;
        }
      }

      if (hkNextTeam && matchHotkey(e, hkNextTeam)) {
        const target = adjacentTeam(1);
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(target);
          return;
        }
      }

      for (const [teamId, hk] of TEAM_HK_MAP) {
        if (matchHotkey(e, hk)) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(teamId);
          break;
        }
      }
    },
    true
  );
  (window as any)[FLAG] = true;
}

/* --------------------------------- Abilities -------------------------------- */

export function petImg64From(
  species?: string,
  mutation?: string | string[]
): string | undefined {
  // 1) normaliser l’espèce pour matcher les clés du catalog
  const spRaw = String(species || "").trim();
  if (!spRaw) return undefined;
  const sp = _canonicalSpecies(spRaw); // <-- utilise déjà petCatalog

  const entry = (petCatalog as unknown as PetCatalogLoose)[sp];
  const imgs = entry?.img64;
  if (!imgs) {
    return undefined;
  }

  // 2) accepter string[] et déduire la "clé" à partir de la liste
  const toLower = (v: unknown) => String(v || "").toLowerCase();
  const muts = Array.isArray(mutation) ? mutation.map(toLower) : [toLower(mutation)];

  // synonyms : "none"/"aucune" -> normal
  const has = (s: string) => muts.some(m => m.includes(s));
  const key: keyof NonNullable<PetImgEntry["img64"]> =
    has("rainbow") ? "rainbow" :
    has("gold")    ? "gold"    :
    "normal";

  const src = (imgs as any)?.[key] || imgs.normal; // fallback normal
  if (!src) return undefined;
  return String(src).startsWith("data:") ? src : `data:image/png;base64,${src}`;
}

type AbilityDef = { name?: string; description?: string; trigger?: string; baseProbability?: number; baseParameters?: any };
const _AB: Record<string, AbilityDef> = (petAbilities as any) ?? {};

function _abilityName(id: unknown): string {
  const key = String(id ?? "");
  const raw = (typeof _AB?.[key]?.name === "string" && _AB[key]!.name.trim())
    ? _AB[key]!.name
    : key;
  return String(raw);
}
function _abilityNameWithoutLevel(id: unknown): string {
  const key = String(id ?? "");
  const raw = (typeof _AB?.[key]?.name === "string" && _AB[key]!.name.trim())
    ? _AB[key]!.name
    : key;
  return String(raw).replace(/(?:\s+|-)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*$/,'').trim();
}
function _parseTeamSearch(raw: string): { mode: "ability" | "species" | "text"; value: string } {
  const s = String(raw || "").trim();
  const m = s.match(/^(ab|sp):\s*(.*)$/i);
  if (!m) return { mode: "text", value: s };
  return { mode: m[1].toLowerCase() === "ab" ? "ability" : "species", value: (m[2] || "").trim() };
}
async function _abilityNameToPresentIds(name: string): Promise<Set<string>> {
  await _ensureInventoryWatchersStarted();
  const target = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/(?:\s+|-)?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, "");
  const ids = new Set<string>();
  if (!target) return ids;
  for (const p of _invPetsCache) {
    const abs = Array.isArray(p.abilities) ? p.abilities : [];
    for (const id of abs) {
      if (_abilityNameWithoutLevel(id).toLowerCase() === target) ids.add(id);
    }
  }
  return ids;
}

/* --------------------------------- Data utils -------------------------------- */

const _s    = (v?: string | null) => (v ?? "").toLowerCase();
const _sOpt = (v: unknown) => (typeof v === "string" ? v : null);
const _n    = (v: unknown) => (Number.isFinite(v as number) ? (v as number) : 0);
const _sArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

function _canonicalSpecies(s: string): string {
  if (!s) return s;
  if ((petCatalog as any)[s]) return s;
  const t = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return (petCatalog as any)[t] ? t : s;
}
function _invPetToRawItem(p: InventoryPet): any {
  return {
    id: p.id,
    itemType: "Pet",
    petSpecies: _canonicalSpecies(p.petSpecies),
    name: p.name ?? null,
    xp: p.xp,
    hunger: p.hunger,
    mutations: Array.isArray(p.mutations) ? p.mutations.slice() : [],
    targetScale: p.targetScale,
    abilities: Array.isArray(p.abilities) ? p.abilities.slice() : [],
  };
}

/* ----------------------------- LS helpers (teams & UI) ----------------------------- */

function loadTeams(): PetTeam[] {
  try {
    const raw = localStorage.getItem(LS_TEAMS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => ({
        id: String(t?.id || ""),
        name: String(t?.name || "Team"),
        slots: Array.isArray(t?.slots)
          ? (t.slots.slice(0, 3).map((x: unknown) => (x ? String(x) : null)) as (string | null)[])
          : [null, null, null],
      }))
      .filter(t => t.id);
  } catch {
    return [];
  }
}
function saveTeams(arr: PetTeam[]) {
  try { localStorage.setItem(LS_TEAMS_KEY, JSON.stringify(arr)); } catch {}
}
function _uid() {
  try { return crypto.randomUUID(); } catch {
    return `t_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
  }
}
function _loadTeamSearchMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_TEAM_SEARCH_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
function _saveTeamSearchMap(map: Record<string, string>) {
  try { localStorage.setItem(LS_TEAM_SEARCH_KEY, JSON.stringify(map)); } catch {}
}

/* ----------------------------- Teams state interne ----------------------------- */

let _teams: PetTeam[] = loadTeams();
let _teamSubs = new Set<(teams: PetTeam[]) => void>();
function _notifyTeams() {
  const snap = _teams.slice();
  _teamSubs.forEach(fn => { try { fn(snap); } catch {} });
}
let _teamSearch: Record<string, string> = _loadTeamSearchMap();

/* --------------------------------- Inventory cache/watchers -------------------------------- */

let _invRaw: any = null;      // myInventory snapshot
let _activeRaw: any[] = [];   // myPetInfos snapshot
let _invPetsCache: InventoryPet[] = [];

let _invUnsub: null | (() => void) = null;
let _activeUnsub: null | (() => void) = null;

let _invSig: Map<string, string> | null = null;
let _activeSig: Map<string, string> | null = null;

function _inventoryItemToPet(x: any): InventoryPet | null {
  if (!x || x.itemType !== "Pet") return null;
  const id = _s(x.id);
  if (!id) return null;
  return {
    id,
    itemType: "Pet",
    petSpecies: _s(x.petSpecies ?? x.data?.petSpecies),
    name: _sOpt(x.name ?? x.data?.name ?? null),
    xp: _n(x.xp ?? x.data?.xp),
    hunger: _n(x.hunger ?? x.data?.hunger),
    mutations: _sArr(x.mutations ?? x.data?.mutations),
    targetScale: Number.isFinite(x.targetScale ?? x.data?.targetScale)
      ? Number(x.targetScale ?? x.data?.targetScale)
      : undefined,
    abilities: _sArr(x.abilities ?? x.data?.abilities),
  };
}
function _activeSlotToPet(entry: any): InventoryPet | null {
  const slot = entry?.slot;
  if (!slot || typeof slot !== "object") return null;
  const id = _s(slot.id);
  if (!id) return null;
  return {
    id,
    itemType: "Pet",
    petSpecies: _s(slot.petSpecies),
    name: _sOpt(slot.name ?? null),
    xp: _n(slot.xp),
    hunger: _n(slot.hunger),
    mutations: _sArr(slot.mutations),
    targetScale: Number.isFinite(slot.targetScale) ? Number(slot.targetScale) : undefined,
    abilities: _sArr(slot.abilities),
  };
}
function _petSigStableNoXpNoHunger(p: InventoryPet): string {
  return JSON.stringify({
    id: p.id,
    itemType: "Pet",
    petSpecies: p.petSpecies,
    name: p.name ?? null,
    mutations: Array.isArray(p.mutations) ? p.mutations : [],
    targetScale: Number.isFinite(p.targetScale as number) ? (p.targetScale as number) : null,
    abilities: Array.isArray(p.abilities) ? p.abilities : [],
  });
}
function _buildInvSigFromInventory(inv: any): Map<string, string> {
  const out = new Map<string, string>();
  const items: any[] =
    Array.isArray(inv?.items) ? inv.items :
    Array.isArray(inv) ? inv : [];
  for (const it of items) {
    const p = _inventoryItemToPet(it);
    if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
  }
  return out;
}
function _buildActiveSig(list: any): Map<string, string> {
  const out = new Map<string, string>();
  const arr = Array.isArray(list) ? list : [];
  for (const e of arr) {
    const p = _activeSlotToPet(e);
    if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
  }
  return out;
}
function _mapsEqual(a: Map<string, string> | null, b: Map<string, string>): boolean {
  if (!a) return false;
  if (a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}
function _rebuildInvPets() {
  const map = new Map<string, InventoryPet>();
  const items: any[] =
    Array.isArray(_invRaw?.items) ? _invRaw.items :
    Array.isArray(_invRaw) ? _invRaw : [];
  for (const it of items) {
    const p = _inventoryItemToPet(it);
    if (p && p.id) map.set(p.id, p);
  }
  const act = Array.isArray(_activeRaw) ? _activeRaw : [];
  for (const e of act) {
    const p = _activeSlotToPet(e);
    if (p && p.id) map.set(p.id, p);
  }
  _invPetsCache = Array.from(map.values());
}
async function _startInventoryWatcher() {
  const unsub = await (async () => {
    try {
      const cur = await Atoms.inventory.myInventory.get();
      _invSig = _buildInvSigFromInventory(cur);
      _invRaw = cur;
      _rebuildInvPets();
    } catch {}
    return Atoms.inventory.myInventory.onChange((inv: any) => {
      const nextSig = _buildInvSigFromInventory(inv);
      if (_mapsEqual(_invSig, nextSig)) return;
      _invSig = nextSig;
      _invRaw = inv;
      _rebuildInvPets();
    });
  })();
  _invUnsub = () => { try { unsub(); } catch {} };
}
async function _startActivePetsWatcher() {
  const unsub = await (async () => {
    try {
      const cur = await Atoms.pets.myPetInfos.get();
      _activeSig = _buildActiveSig(cur);
      _activeRaw = Array.isArray(cur) ? cur : [];
      _rebuildInvPets();
    } catch {}
    return Atoms.pets.myPetInfos.onChange((list: any) => {
      const nextSig = _buildActiveSig(list);
      if (_mapsEqual(_activeSig, nextSig)) return;
      _activeSig = nextSig;
      _activeRaw = Array.isArray(list) ? list : [];
      _rebuildInvPets();
    });
  })();
  _activeUnsub = () => { try { unsub(); } catch {} };
}
async function _ensureInventoryWatchersStarted() {
  if (!_invUnsub)  await _startInventoryWatcher();
  if (!_activeUnsub) await _startActivePetsWatcher();

  if (!_invPetsCache.length) {
    try {
      const [inv, active] = await Promise.all([
        Atoms.inventory.myInventory.get(),
        Atoms.pets.myPetInfos.get(),
      ]);
      _invSig    = _buildInvSigFromInventory(inv);
      _activeSig = _buildActiveSig(active);
      _invRaw    = inv;
      _activeRaw = Array.isArray(active) ? active : [];
      _rebuildInvPets();
    } catch {}
  }
}

/* ------------------------------- UI helpers --------------------------------- */

export async function clearHandSelection(): Promise<void> {
  try { await Atoms.inventory.setSelectedIndexToEnd.set(null); } catch (err) { }
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch (err) {  }
  try { await PlayerService.setSelectedItem(null); } catch (err) {  }
  try { await PlayerService.dropObject(); } catch (err) {  }
}
async function _waitValidatedInventoryIndex(timeoutMs = 20000): Promise<number | null> {
  await clearHandSelection();
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const modalVal = await Atoms.ui.activeModal.get();
      if (!isInventoryOpen(modalVal)) return null;
    } catch { return null; }
    try {
      const v = await Atoms.inventory.myValidatedSelectedItemIndex.get();
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  return null;
}

/* -------------------------- Autofeed (per-pet overrides) -------------------------- */

const _belowThreshold = new Map<string, boolean>();
const DEFAULT_OVERRIDE: PetOverride = { enabled: false, thresholdPct: 10, crops: {} };
const DEFAULT_UI: PetsUIState = { selectedPetId: null };

let _currentPets: PetInfo[] = [];
let _userTriggerCb: ((t: AutofeedTrigger) => void) | null = null;

function saveOverrides(map: PetOverridesMap) {
  try {
    localStorage.setItem(LS_OVERRIDES_KEY, JSON.stringify(map));
  } catch (err) {
  }
}
function loadOverrides(): PetOverridesMap {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    const out = obj && typeof obj === "object" ? (obj as PetOverridesMap) : {};
    return out;
  } catch (err) {
    return {};
  }
}
function saveUIState(next: PetsUIState) {
  try {
    localStorage.setItem(LS_UI_KEY, JSON.stringify(next));
  } catch (err) {
  }
}
function loadUIState(): PetsUIState {
  try {
    const raw = localStorage.getItem(LS_UI_KEY);
    if (!raw) return { ...DEFAULT_UI };
    const obj = JSON.parse(raw);
    const merged = { ...DEFAULT_UI, ...(obj || {}) } as PetsUIState;
    return merged;
  } catch (err) {
    return { ...DEFAULT_UI };
  }
}
function cloneOverride(o?: PetOverride): PetOverride {
  const src = o ?? DEFAULT_OVERRIDE;
  return {
    enabled: !!src.enabled,
    thresholdPct: Math.min(100, Math.max(1, Number(src.thresholdPct) || DEFAULT_OVERRIDE.thresholdPct)),
    crops: { ...(src.crops || {}) },
  };
}
function clampPct(n: number) { return Math.max(0, Math.min(100, n)); }

function getCompatibleCropsFromData(species: string): string[] {
  type PetCatalog = Record<string, { diet?: unknown; compatibleCrops?: unknown; crops?: unknown } | undefined>;
  const PC = petCatalog as unknown as PetCatalog;
  const entry = PC?.[species];
  const raw = entry?.diet ?? entry?.compatibleCrops ?? entry?.crops ?? [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.filter((c: unknown): c is string => typeof c === "string" && c.length > 0);
}
function getMaxHungerFromData(species: string): number {
  type PetCatalog = Record<string, { coinsToFullyReplenishHunger?: unknown } | undefined>;
  const v = (petCatalog as unknown as PetCatalog)?.[species]?.coinsToFullyReplenishHunger;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return 3000; // défaut safe
}
async function findPetById(petId: string): Promise<PetInfo | null> {
  try {
    const list = await PlayerService.getPets();
    const arr = Array.isArray(list) ? list : [];
    return arr.find(p => String(p?.slot?.id || "") === String(petId)) ?? null;
  } catch { return null; }
}
function findFirstCompatibleInvItem(allowed: Set<string>, inv: CropInventoryState): CropItem | null {
  const arr = Array.isArray(inv) ? inv : [];
  for (const it of arr) {
    const species = String((it as any)?.species || "");
    if (species && allowed.has(species)) return it as CropItem;
  }
  return null;
}
function _emitTrigger(payload: AutofeedTrigger) {
  try { _userTriggerCb?.(payload); } catch {}
}

async function _evaluatePet(pet: PetInfo) {
  const petId = String(pet?.slot?.id || "");
  if (!petId) return;

  const ov = PetsService.getOverride(petId);
  if (!ov.enabled) { _belowThreshold.set(petId, false); return; }

  const hungerPct = PetsService.getHungerPctFor(pet);
  const thresholdPct = Math.max(1, Math.min(100, (ov.thresholdPct | 0) || 10));

  const previouslyBelow = _belowThreshold.get(petId) === true;
  const nowBelow = hungerPct < thresholdPct;

  if (nowBelow && !previouslyBelow) {
    // allowed crops for this pet
    let allowedSet: Set<string>;
    try { allowedSet = await PetsService.getPetAllowedCrops(petId); }
    catch {
      const species = String(pet?.slot?.petSpecies || "");
      allowedSet = new Set(PetsService.getCompatibleCropsForSpecies(species));
    }
    const allowed = Array.from(allowedSet);

    // pick NON-FAVORITE compatible item & feed (if API present)
    let chosen: CropItem | null = null;
    let didUnfavorite = false;

    try {
      const [invRaw, favIdsRaw] = await Promise.all([
        PlayerService.getCropInventoryState(),
        (PlayerService as any).getFavoriteIds?.() ?? [],
      ]);
      const inv: any[] = Array.isArray(invRaw) ? invRaw : [];
      const favSet = new Set<string>(Array.isArray(favIdsRaw) ? favIdsRaw : []);
      const invNonFav = inv.filter(it => !favSet.has(String(it?.id)));

      chosen = findFirstCompatibleInvItem(allowedSet, invNonFav);

      if (chosen?.id && (PlayerService as any).feedPet) {
        try { await (PlayerService as any).feedPet(petId, chosen.id); } catch {}
      }
    } catch {}

    _emitTrigger({
      pet,
      petId,
      species: String(pet?.slot?.petSpecies || ""),
      hungerPct,
      thresholdPct,
      allowedCrops: allowed,
      chosenItem: chosen,
      didUnfavorite,
    });
  }

  _belowThreshold.set(petId, nowBelow);
}
async function _evaluateAll() {
  const arr = Array.isArray(_currentPets) ? _currentPets : [];
  for (const p of arr) { try { await _evaluatePet(p); } catch {} }
}

/* --------------------------------- Service API -------------------------------- */

export const PetsService = {
  /* --------- Player-facing (UI list/subscribe) --------- */
  getPets(): Promise<PetState> { return PlayerService.getPets(); },
  onPetsChange(cb: (pets: PetState) => void) { return PlayerService.onPetsChange(cb); },
  onPetsChangeNow(cb: (pets: PetState) => void) { return PlayerService.onPetsChangeNow(cb); },

  /* ------------------------- Abilities utils ------------------------- */
  getAbilityName(id: string): string { return _abilityName(id); },
  getAbilityNameWithoutLevel(id: string): string { return _abilityNameWithoutLevel(id); },

  /* ------------------------- Autofeed + per-pet UI state ------------------------- */
  setUIState(next: Partial<PetsUIState>): PetsUIState {
    const cur = loadUIState();
    const merged: PetsUIState = { ...cur, ...(next || {}) };
    saveUIState(merged);
    return merged;
  },
  setSelectedPet(id: string | null): PetsUIState { return this.setUIState({ selectedPetId: id }); },
  getSelectedPetId(): string | null { return loadUIState().selectedPetId ?? null; },

  getOverride(petId: string): PetOverride {
    const all = loadOverrides();
    return cloneOverride(all[petId]);
  },
  setOverride(petId: string, patch: Partial<PetOverride>): PetOverride {
    const all = loadOverrides();
    const cur = cloneOverride(all[petId]);
    const next: PetOverride = {
      enabled: patch.enabled ?? cur.enabled,
      thresholdPct: Number.isFinite(patch.thresholdPct as number)
        ? Math.min(100, Math.max(1, Number(patch.thresholdPct))) : cur.thresholdPct,
      crops: { ...cur.crops, ...(patch.crops || {}) },
    };
    all[petId] = next;
    saveOverrides(all);
    void _evaluateAll();
    return next;
  },
  updateOverride(petId: string, fn: (cur: PetOverride) => PetOverride): PetOverride {
    const all = loadOverrides();
    const cur = cloneOverride(all[petId]);
    const next = cloneOverride(fn(cur));
    all[petId] = next;
    saveOverrides(all);
    void _evaluateAll();
    return next;
  },

  async setPetAutofeedEnabled(petId: string, enabled: boolean): Promise<PetOverride> {
    return this.setOverride(petId, { enabled: !!enabled });
  },
  getPetAutofeedEnabled(petId: string): boolean { return this.getOverride(petId).enabled; },

  async setPetAutofeedThresholdPct(petId: string, pct: number): Promise<PetOverride> {
    const v = Math.min(100, Math.max(1, Math.floor(Number(pct) || 10)));
    return this.setOverride(petId, { thresholdPct: v });
  },
  getPetAutofeedThresholdPct(petId: string): number { return this.getOverride(petId).thresholdPct; },

  async setPetAllowedCrop(petId: string, crop: string, allowed?: boolean): Promise<PetOverride> {
    return this.updateOverride(petId, (cur) => {
      const next = cloneOverride(cur);
      const entry = next.crops[crop] ?? { allowed: true };
      next.crops[crop] = { allowed: allowed ?? entry.allowed };
      return next;
    });
  },
  async getPetAllowedCrops(petId: string): Promise<Set<string>> {
    const ov = this.getOverride(petId);
    const pet = await findPetById(petId);
    const species = pet?.slot?.petSpecies || "";
    const compatibles = this.getCompatibleCropsForSpecies(species);
    const allowed = new Set<string>();
    for (const c of compatibles) {
      const rule = ov.crops[c];
      if (rule ? !!rule.allowed : true) allowed.add(c); // default: allowed
    }
    return allowed;
  },

  getCompatibleCropsForSpecies(species: string): string[] { return getCompatibleCropsFromData(species); },
  getMaxHungerForSpecies(species: string): number { return getMaxHungerFromData(species); },
  getHungerPctFor(pet: PetInfo): number {
    const cur = Number(pet?.slot?.hunger) || 0;
    const species = String(pet?.slot?.petSpecies || "");
    const max = this.getMaxHungerForSpecies(species);
    const pct = (cur / max) * 100;
    return +clampPct(pct).toFixed(1);
  },

  async startAutofeedWatcher(onTrigger?: (t: AutofeedTrigger) => void): Promise<() => void> {
    _userTriggerCb = onTrigger ?? null;
    const stop = await PlayerService.onPetsChangeNow((arr) => {
      _currentPets = Array.isArray(arr) ? arr.slice() : [];
      void _evaluateAll();
    });
    return () => {
      try { stop(); } catch {}
      _currentPets = [];
      _belowThreshold.clear();
      _userTriggerCb = null;
    };
  },

  /* ------------------------- Teams (UI-less core used by UI) ------------------------- */
  _teams: loadTeams(),
  _teamSubs: new Set<(all: PetTeam[]) => void>(),
  _notifyTeamSubs() {
    const snap = this.getTeams();
    this._teamSubs.forEach(fn => { try { fn(snap); } catch {} });
  },
  getTeams(): PetTeam[] {
    return Array.isArray(this._teams) ? this._teams.map(t => ({ ...t, slots: t.slots.slice(0,3) })) : [];
  },
  onTeamsChange(cb: (all: PetTeam[]) => void): () => void {
    this._teamSubs.add(cb);
    try { cb(this.getTeams()); } catch {}
    return () => { this._teamSubs.delete(cb); };
  },
  async onTeamsChangeNow(cb: (all: PetTeam[]) => void): Promise<() => void> {
    const unsub = this.onTeamsChange(cb);
    try { cb(this.getTeams()); } catch {}
    return unsub;
  },
  createTeam(name?: string): PetTeam {
    const t: PetTeam = { id: _uid(), name: name?.trim() || `Team ${this._teams.length + 1}`, slots: [null,null,null] };
    this._teams.push(t);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return t;
  },
  deleteTeam(teamId: string): boolean {
    const i = this._teams.findIndex(t => t.id === teamId);
    if (i < 0) return false;
    this._teams.splice(i, 1);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return true;
  },
  saveTeam(patch: { id: string; name?: string; slots?: (string|null)[] }): PetTeam | null {
    const i = this._teams.findIndex(t => t.id === patch.id);
    if (i < 0) return null;
    const cur = this._teams[i];
    const next: PetTeam = {
      id: cur.id,
      name: typeof patch.name === "string" ? patch.name : cur.name,
      slots: Array.isArray(patch.slots) ? (patch.slots.slice(0,3) as (string|null)[]) : cur.slots,
    };
    this._teams[i] = next;
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return next;
  },
  setTeamsOrder(ids: string[]) {
    const byId = new Map(this._teams.map(t => [t.id, t]));
    const next: PetTeam[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t) { next.push(t); byId.delete(id); }
    }
    for (const rest of byId.values()) next.push(rest);
    this._teams = next;
    saveTeams(this._teams);
    this._notifyTeamSubs();
  },
  getTeamById(teamId: string): PetTeam | null {
    const t = this._teams.find(t => t.id === teamId) || null;
    return t ? { ...t, slots: t.slots.slice(0,3) } : null;
  },
  getTeamSearch(teamId: string): string { return _teamSearch[teamId] || ""; },
  setTeamSearch(teamId: string, q: string) {
    _teamSearch[teamId] = (q || "").trim();
    _saveTeamSearchMap(_teamSearch);
  },

  /* ------------------------- Inventory filters + pickers ------------------------- */
  async getInventoryPets(): Promise<InventoryPet[]> {
    await _ensureInventoryWatchersStarted();
    return _invPetsCache.slice();
  },
  async buildFilteredInventoryForTeam(teamId: string, opts?: { excludeIds?: Set<string> }) {
    await _ensureInventoryWatchersStarted();

    const { mode, value } = _parseTeamSearch(this.getTeamSearch(teamId) || "");
    let list = await this.getInventoryPets();

    if (mode === "ability" && value) {
      const idSet = await _abilityNameToPresentIds(value);
      list = idSet.size
        ? list.filter(p => Array.isArray(p.abilities) && p.abilities.some(a => idSet.has(a)))
        : [];
    } else if (mode === "species" && value) {
      const vv = value.toLowerCase();
      list = list.filter(p => (p.petSpecies || "").toLowerCase() === vv);
    } else if (value) {
      const q = value.toLowerCase();
      list = list.filter(p =>
        _s(p.id).includes(q) ||
        _s(p.petSpecies).includes(q) ||
        _s(p.name).includes(q) ||
        (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
        (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
      );
    }

    if (opts?.excludeIds?.size) {
      const ex = opts.excludeIds;
      list = list.filter(p => !ex.has(p.id));
    }

    const items = list.map(_invPetToRawItem);

    let favoritedItemIds: string[] = [];
    try {
      const favAll = await Atoms.inventory.favoriteIds.get().catch(() => []);
      const keep = new Set(list.map(p => p.id));
      favoritedItemIds = (favAll || []).filter((id: string) => keep.has(id));
    } catch {}

    return { items, favoritedItemIds };
  },
  async buildFilteredInventoryByQuery(
    query: string,
    opts?: { excludeIds?: Set<string> }
  ): Promise<{ items: any[]; favoritedItemIds: string[] }> {
    await _ensureInventoryWatchersStarted();
    const q = (query || "").toLowerCase().trim();

    let list = await this.getInventoryPets();
    if (q) {
      list = list.filter(p =>
        _s(p.id).includes(q) ||
        _s(p.petSpecies).includes(q) ||
        _s(p.name).includes(q) ||
        (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
        (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
      );
    }

    if (opts?.excludeIds?.size) {
      const ex = opts.excludeIds;
      list = list.filter(p => !ex.has(p.id));
    }

    const items = list.map(_invPetToRawItem);

    let favoritedItemIds: string[] = [];
    try {
      const favAll = await Atoms.inventory.favoriteIds.get().catch(() => []);
      const keep = new Set(list.map(p => p.id));
      favoritedItemIds = (favAll || []).filter((id: string) => keep.has(id));
    } catch {}

    return { items, favoritedItemIds };
  },

  async chooseSlotPet(teamId: string, slotIndex: number, searchOverride?: string): Promise<InventoryPet | null> {
    const idx = Math.max(0, Math.min(2, Math.floor(slotIndex || 0)));
    const team = this.getTeamById(teamId);
    if (!team) return null;

    const exclude = new Set<string>();
    team.slots.forEach((id, i) => { if (i !== idx && id) exclude.add(String(id)); });

    const payload =
      searchOverride && searchOverride.trim().length
        ? await this.buildFilteredInventoryByQuery(searchOverride, { excludeIds: exclude })
        : await this.buildFilteredInventoryForTeam(teamId, { excludeIds: exclude });

    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) return null;

    await fakeInventoryShow(payload, { open: true });
    const selIndex = await _waitValidatedInventoryIndex(20000);
    await closeInventoryPanel();

    if (selIndex == null || selIndex < 0 || selIndex >= items.length) return null;

    const chosenPet = _inventoryItemToPet(items[selIndex]);
    if (!chosenPet) return null;

    const next = team.slots.slice(0, 3);
    next[idx] = String(chosenPet.id);
    this.saveTeam({ id: team.id, slots: next });

    try { await clearHandSelection(); } catch {}
    return chosenPet;
  },

  async pickPetViaFakeInventory(search?: string): Promise<InventoryPet | null> {
    const payload = await this.buildFilteredInventoryByQuery(search || "");
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) return null;

    await fakeInventoryShow(payload, { open: true });
    const selIndex = await _waitValidatedInventoryIndex(20000);
    await closeInventoryPanel();
    if (selIndex == null || selIndex < 0 || selIndex >= items.length) return null;

    await clearHandSelection();
    return _inventoryItemToPet(items[selIndex]);
  },

  /* ------------------------- Team switching ------------------------- */
  async useTeam(teamId: string): Promise<{ swapped: number; placed: number; skipped: number }> {
    const t = this.getTeams().find(tt => tt.id === teamId) || null;
    if (!t) throw new Error("Team not found");
    const targetInvIds = (t.slots || [])
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 3);
    const res = await _applyTeam(targetInvIds);
    markTeamAsUsed(teamId);
    return res;
  },

  /* ------------------------- Ability logs ------------------------- */
  _logs: [] as AbilityLogEntry[],
  _logsMax: 500,
  _seenPerfByPet: new Map<string, number>(),
  _logSubs: new Set<(all: AbilityLogEntry[]) => void>(),
  _logsCutoffMs: 0,
  _logsCutoffSkewMs: 1500,

  _extractAbilityValue(abilityId: string, rawData: any): number {
    const num = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const data = (rawData ?? {}) as Record<string, unknown>;
    const base = (petAbilities as Record<string, any>)[abilityId]?.baseParameters ?? {};

    switch (abilityId as keyof typeof petAbilities) {
      case "CoinFinderI":
      case "CoinFinderII":
      case "CoinFinderIII": {
        const value = data["coinsFound"] ?? data["coins"] ?? 0;
        return num(value);
      }

      case "SellBoostI":
      case "SellBoostII":
      case "SellBoostIII":
      case "SellBoostIV": {
        const value = data["bonusCoins"] ?? data["coinsEarned"] ?? 0;
        return num(value);
      }

      case "ProduceEater":
        return num(data["sellPrice"] ?? 0);

      case "EggGrowthBoost":
      case "EggGrowthBoostII":
      case "EggGrowthBoostIII": {
        const minutes =
          data["eggGrowthTimeReductionMinutes"] ??
          data["reductionMinutes"] ??
          base["eggGrowthTimeReductionMinutes"] ??
          0;
        return num(minutes) * 60 * 1000;
      }

      case "PlantGrowthBoost":
      case "PlantGrowthBoostII": {
        const minutes =
          data["reductionMinutes"] ??
          data["plantGrowthReductionMinutes"] ??
          base["plantGrowthReductionMinutes"] ??
          0;
        return num(minutes) * 60 * 1000;
      }

      case "PetXpBoost":
      case "PetXpBoostII": {
        const xp = data["bonusXp"] ?? base["bonusXp"] ?? 0;
        return num(xp);
      }

      case "PetHatchSizeBoost":
      case "PetHatchSizeBoostII": {
        const strength = data["strengthIncrease"] ?? 0;
        return num(strength);
      }

      case "HungerRestore":
      case "HungerRestoreII": {
        const pct =
          data["hungerRestoredPercentage"] ??
          base["hungerRestorePercentage"] ??
          0;
        return num(pct);
      }

      default:
        return 0;
    }
  },

  async startAbilityLogsWatcher(): Promise<() => void> {
    await _ensureInventoryWatchersStarted();

    const indexInfosByPetId = (list: any): Record<string, any> => {
      const out: Record<string, any> = {};
      const arr = Array.isArray(list) ? list : [];
      for (const e of arr) {
        const id = String(e?.slot?.id ?? e?.id ?? "");
        if (id) out[id] = e;
      }
      return out;
    };

    let myInfosMap: Record<string, any> = {};
    try { myInfosMap = indexInfosByPetId(await Atoms.pets.myPetInfos.get()); } catch {}

    let stopInfos: (() => void) | null = null;
    try {
      stopInfos = await Atoms.pets.myPetInfos.onChange((list: any) => {
        try { myInfosMap = indexInfosByPetId(list); } catch {}
      });
    } catch {}

    const extractFlat = (src: any): Record<string, FlatAbilityEntry | null> => {
      const out: Record<string, FlatAbilityEntry | null> = {};
      if (!src || typeof src !== "object") return out;
      const obj = src as Record<string, any>;

      for (const petId of Object.keys(obj)) {
        const entry = obj[petId] ?? {};
        const lat   = entry.lastAbilityTrigger ?? null;

        let rawH =
          entry.hungerPct ??
          entry.hunger_percentage ??
          entry.hunger ??
          entry.stats?.hungerPct ??
          entry.stats?.hunger?.pct ??
          entry.stats?.hunger?.percent ??
          null;

        if (rawH == null) {
          const info = myInfosMap[petId];
          rawH =
            info?.hungerPct ?? info?.hunger_percentage ?? info?.hunger ??
            info?.slot?.hungerPct ?? info?.slot?.hunger ??
            info?.stats?.hungerPct ?? info?.stats?.hunger?.pct ?? info?.stats?.hunger?.percent ?? null;
        }

        let hungerPct: number | null =
          Number.isFinite(Number(rawH)) ? Number(rawH) : null;
        if (hungerPct != null && hungerPct > 0 && hungerPct <= 1) hungerPct *= 100;

        out[petId] = {
          petId,
          abilityId: lat?.abilityId ?? null,
          performedAt: Number.isFinite(lat?.performedAt) ? lat.performedAt : null,
          data: lat?.data ?? null,
          position: entry.position ?? null,
          hungerPct,
        };
      }
      return out;
    };

    try { this._ingestAbilityMap(extractFlat(await Atoms.pets.myPetSlotInfos.get())); } catch {}
    const stopSlots = await Atoms.pets.myPetSlotInfos.onChange((src) => {
      try { this._ingestAbilityMap(extractFlat(src)); } catch {}
    });

    return () => {
      try { stopSlots(); } catch {}
      try { stopInfos?.(); } catch {}
    };
  },

  getAbilityLogs(opts?: { abilityIds?: string[]; since?: number; limit?: number }): AbilityLogEntry[] {
    const ids = opts?.abilityIds && opts.abilityIds.length ? new Set(opts.abilityIds) : null;
    const since = Number.isFinite(opts?.since as number) ? (opts!.since as number) : 0;
    const lim = Math.max(0, Math.floor(opts?.limit ?? 0));
    let arr = this._logs.filter(e =>
      (since ? e.performedAt >= since : true) &&
      (ids ? ids.has(e.abilityId) : true)
    );
    arr = arr.sort((a, b) => b.performedAt - a.performedAt);
    return lim ? arr.slice(0, lim) : arr;
  },
  onAbilityLogs(cb: (all: AbilityLogEntry[]) => void): () => void {
    this._logSubs.add(cb);
    try { cb(this.getAbilityLogs()); } catch {}
    return () => { this._logSubs.delete(cb); };
  },
  getSeenAbilityIds(): string[] {
    const set = new Set<string>();
    for (const e of this._logs) set.add(e.abilityId);
    return Array.from(set).sort();
  },
  clearAbilityLogs() {
    this._logs.length = 0;
    this._seenPerfByPet.clear();
    this._logsCutoffMs = Date.now();
    this._notifyLogSubs();
  },
  _notifyLogSubs() {
    const snap = this.getAbilityLogs();
    this._logSubs.forEach(fn => { try { fn(snap); } catch {} });
  },
  _pushLog(e: AbilityLogEntry) {
    this._logs.push(e);
    if (this._logs.length > this._logsMax) {
      this._logs.splice(0, this._logs.length - this._logsMax);
    }
    this._notifyLogSubs();
  },
  _ingestAbilityMap(map: Record<string, FlatAbilityEntry | null | undefined>) {
    if (!map || typeof map !== "object") return;

    const abilityDisplayName = (abilityId: string): string => {
      const def = (petAbilities as Record<string, { name?: string }>)[abilityId];
      return (def?.name && def.name.trim()) || abilityId;
    };
    const fmtTime12 = (ms: number): string =>
      new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fmtInt = (n: unknown): string =>
      Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('en-US') : '0';
    const fmtPct0 = (n: unknown): string =>
      `${Number.isFinite(Number(n)) ? Number(n).toFixed(0) : '0'}%`;
    const fmtMin1 = (n: unknown): string =>
      `${Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '0.0'} min`;

    const formatDetails = (abilityId: string, data: any): string => {
      const d = (data ?? {}) as Record<string, unknown>;
      const base = (petAbilities as Record<string, any>)[abilityId]?.baseParameters ?? {};
      switch (abilityId as keyof typeof petAbilities) {
        case 'CoinFinderI':
        case 'CoinFinderII':
        case 'CoinFinderIII': {
          const coins = d['coinsFound'] ?? base['baseMaxCoinsFindable'];
          return `+${fmtInt(coins)} coins`;
        }
        case 'SeedFinderI':
        case 'SeedFinderII':
        case 'SeedFinderIII':
        case 'SeedFinderIV':
          return `Seed found: ${(d['seedName'] as string) ?? '—'}`;

        case 'SellBoostI':
        case 'SellBoostII':
        case 'SellBoostIII':
        case 'SellBoostIV': {
          if (d['bonusCoins'] != null) return `Sale bonus: +${fmtInt(d['bonusCoins'])} coins`;
          const pct = base['cropSellPriceIncreasePercentage'];
          return pct != null ? `Sale bonus: +${fmtPct0(pct)}` : 'Sale bonus';
        }
        case 'ProduceRefund': {
          const n = d['numItemsRefunded'];
          return n != null ? `Refunded: ${fmtInt(n)} item(s)` : `Crops refunded`;
        }
        case 'DoubleHarvest':
          return `Harvest duplicated`;
        case 'ProduceEater': {
          const name = (d['cropName'] as string) ?? '—';
          if (d['sellPrice'] != null) return `Eaten: ${name} (value ${fmtInt(d['sellPrice'])})`;
          const pct = base['cropSellPriceIncreasePercentage'];
          return pct != null ? `Eaten: ${name} (+${fmtPct0(pct)} price)` : `Eaten: ${name}`;
        }

        case 'EggGrowthBoost':
        case 'EggGrowthBoostII':
        case 'EggGrowthBoostIII': {
          const mins = d['eggGrowthTimeReductionMinutes'] ?? base['eggGrowthTimeReductionMinutes'];
          return `Eggs faster: -${fmtMin1(mins)}`;
        }
        case 'PlantGrowthBoost':
        case 'PlantGrowthBoostII': {
          const mins = d['reductionMinutes'] ?? base['plantGrowthReductionMinutes'];
          return `Plants faster: -${fmtMin1(mins)}`;
        }

        case 'GoldGranter': {
          const target = (d['cropName'] as string) ?? '—';
          return `Gold mutation: ${target}`;
        }
        case 'RainbowGranter': {
          const target = (d['cropName'] as string) ?? '—';
          return `Rainbow mutation: ${target}`;
        }
        case 'ProduceMutationBoost':
        case 'ProduceMutationBoostII':
        case 'PetMutationBoost':
        case 'PetMutationBoostII':
          return '—';

        case 'PetXpBoost':
        case 'PetXpBoostII': {
          const xp = d['bonusXp'] ?? base['bonusXp'];
          return `+${fmtInt(xp)} XP`;
        }
        case 'PetAgeBoost':
        case 'PetAgeBoostII': {
          const xp = d['bonusXp'] ?? base['bonusXp'];
          const who = (d['petName'] as string) ?? 'pet';
          return `+${fmtInt(xp)} XP (${who})`;
        }
        case 'PetHatchSizeBoost':
        case 'PetHatchSizeBoostII': {
          const who = (d['petName'] as string) ?? 'pet';
          if (d['strengthIncrease'] != null) return `+${fmtInt(d['strengthIncrease'])} strength (${who})`;
          const pct = base['maxStrengthIncreasePercentage'];
          return pct != null ? `Max strength +${fmtPct0(pct)} (${who})` : `Strength increased (${who})`;
        }
        case 'HungerRestore':
        case 'HungerRestoreII': {
          const pct = d['hungerRestoredPercentage'] ?? base['hungerRestorePercentage'];
          const who = (d['petName'] as string) ?? 'pet';
          return `Hunger restored (${who}): ${fmtPct0(pct)}`;
        }
        case 'HungerBoost':
        case 'HungerBoostII': {
          const pct = base['hungerDepletionRateDecreasePercentage'];
          return pct != null ? `Hunger depletion rate: -${fmtPct0(pct)}` : 'Hunger reduced';
        }
        case 'PetRefund':
        case 'PetRefundII': {
          const egg = (d['eggName'] as string) ?? null;
          return egg ? `Refunded: ${egg}` : `Pet refunded as egg`;
        }
        case 'Copycat':
          return '—';

        default: {
          const meta = (petAbilities as Record<string, any>)[abilityId];
          if (d && typeof d === 'object' && Object.keys(d).length) return JSON.stringify(d);
          return meta?.description || '—';
        }
      }
    };

    const EPS = 1e-6;
    for (const petId of Object.keys(map)) {
      const entry = map[petId];
      if (!entry || typeof entry !== "object") continue;

      const abilityId = (entry as any).abilityId ?? null;
      const performedAtNum = Number((entry as any).performedAt) || 0;
      if (!abilityId || !performedAtNum) continue;

      const prev = this._seenPerfByPet.get(petId) || 0;
      if (performedAtNum <= prev) continue;

      if (this._logsCutoffMs &&
          performedAtNum < (this._logsCutoffMs - this._logsCutoffSkewMs)) {
        this._seenPerfByPet.set(petId, performedAtNum);
        continue;
      }

      let hungerPct = Number.isFinite(Number((entry as any).hungerPct))
        ? Number((entry as any).hungerPct)
        : null;
      if (hungerPct != null && hungerPct > 0 && hungerPct <= 1) hungerPct *= 100;
      if (hungerPct != null && hungerPct <= EPS) {
        this._seenPerfByPet.set(petId, performedAtNum);
        continue;
      }

      const pet = _invPetsCache.find(p => String(p.id) === String(petId)) || null;
      const abilityIdStr = String(abilityId);

      const logLine: AbilityLogEntry = {
        petId,
        species: pet?.petSpecies || undefined,
        name: pet?.name ?? undefined,
        abilityId: abilityIdStr,
        abilityName: abilityDisplayName(abilityId),
        data: formatDetails(abilityIdStr, (entry as any).data),
        performedAt: performedAtNum,
        time12: fmtTime12(performedAtNum),
      };

      this._seenPerfByPet.set(petId, performedAtNum);

      try {
        StatsService.incrementAbilityStat(abilityIdStr, "triggers");
        const abilityValue = this._extractAbilityValue(abilityIdStr, (entry as any).data);
        if (abilityValue > 0) {
          StatsService.incrementAbilityStat(abilityIdStr, "totalValue", abilityValue);
        }
      } catch {}

      this._pushLog(logLine);
    }
  },
};

/* -------------------------- Types for ability logs -------------------------- */
export type AbilityLogEntry = {
  petId: string;
  species?: string;
  name?: string | null;
  abilityId: string;
  abilityName: string;
  data?: any;
  performedAt: number;
  time12: string;
};

/* ----------------------- Flat map entry from selector ----------------------- */
type FlatAbilityEntry = {
  petId: string;
  abilityId: string | null;
  performedAt: number | null;
  data?: any;
  position?: { x: number; y: number } | null;
  hungerPct?: any;
};

/* --------------------------------- Helpers: active pets -------------------------------- */
async function _getActivePetSlotIds(): Promise<string[]> {
  try {
    const arr = await PlayerService.getPets();
    const list = Array.isArray(arr) ? arr : [];
    return list
      .map(p => String(p?.slot?.id || ""))
      .filter(id => !!id)
      .slice(0, 3);
  } catch { return []; }
}

/* --------------------------------- Team switching --------------------------------- */
async function _applyTeam(targetInvIds: string[]): Promise<{ swapped: number; placed: number; skipped: number }> {
  let activeSlots = await _getActivePetSlotIds();

  const targetSet = new Set(targetInvIds);
  const extras = activeSlots.filter(id => !targetSet.has(id));
  const mustStore = Math.max(0, activeSlots.length - targetInvIds.length);

  if (mustStore > 0) {
    const toStore = extras.slice(0, mustStore);
    for (const itemId of toStore) {
      try {
        await PlayerService.storePet(itemId);
        activeSlots = activeSlots.filter(id => id !== itemId);
      } catch {}
    }
  }

  const alreadyActive = new Set<string>();
  for (const invId of targetInvIds) if (activeSlots.includes(invId)) alreadyActive.add(invId);

  let swapped = 0, placed = 0, skipped = 0;

  if (alreadyActive.size) {
    activeSlots = activeSlots.filter(slotId => !alreadyActive.has(slotId));
    skipped = alreadyActive.size;
  }

  const toDo = targetInvIds.filter(id => !alreadyActive.has(id));

  for (const invId of toDo) {
    const slotId = activeSlots.shift();
    try {
      if (slotId) { await PlayerService.swapPet(slotId, invId); swapped++; }
      else        { await PlayerService.placePet(invId, { x: 0, y: 0 }, "Boardwalk", 64); placed++; }
    } catch {}
  }

  return { swapped, placed, skipped };
}
