
import { Atoms, playerDatabaseUserId } from "../../store/atoms";
import {
  closeInventoryPanel,
  fakeInventoryShow,
  isInventoryOpen,
} from "../../services/fakeModal";
import {
  plantCatalog,
  decorCatalog,
  petCatalog,
  toolCatalog,
  eggCatalog,
} from "../../data/hardcoded-data.clean";
import { attachSpriteIcon } from "../spriteIconCache";
import { getPetMaxStrength, getPetStrength } from "../../utils/petCalcul";
import { DefaultPricing, estimateProduceValue } from "../../utils/calculators";
import { MGAssets } from "../../utils/mgAssets";
import { PetsService } from "../../services/pets";
import { audioPlayer } from "../../core/audioPlayer";
import { getFriendSettings } from "../../utils/friendSettings";

const MSG_NOTIFICATION_URL = "https://cdn.pixabay.com/audio/2024/01/11/audio_8e3b99318b.mp3";
import {
  fetchFriendsSummary,
  fetchGroups,
  fetchGroupDetails,
  fetchMessagesThread,
  fetchGroupMessages,
  getAudioUrlSafe,
  getCachedFriendsSummary,
  markMessagesRead,
  openGroupsStream,
  openMessagesStream,
  openPresenceStream,
  sendGroupMessage,
  sendMessage,
  setImageSafe,
  installEmojiDataFetchInterceptor,
  type DirectMessage,
  type FriendSummary,
  type GroupSummary,
  type PresencePayload,
  type StreamHandle,
  type ReadReceipt,
} from "../../utils/supabase";
import "emoji-picker-element";

// Install fetch interceptor BEFORE any emoji-picker element hits the DOM.
// This intercepts window.fetch for jsDelivr so the picker's data loads
// via GM_xmlhttpRequest (bypasses CSP + blob: HEAD issue).
installEmojiDataFetchInterceptor();

declare global {
  interface Window {
    __qws_cleanup_messages_overlay?: () => void;
    __qws_notifier_slot?: HTMLElement;
  }
}

type ConversationState = {
  otherId: string;
  conversationId: string | null;
  messages: DirectMessage[];
  unread: number;
  lastMessageAt: number;
  loaded: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
};

type FriendRowState = {
  row: HTMLDivElement;
  badge: HTMLSpanElement | null;
  avatarWrap: HTMLDivElement | null;
  statusDot: HTMLSpanElement | null;
  sub: HTMLDivElement;
  groupCountBadge?: HTMLSpanElement | null;
};

type ChatSeedItem = {
  itemType: "Seed";
  species: string;
  quantity: number;
};

type ChatDecorItem = {
  itemType: "Decor";
  decorId: string;
  quantity: number;
};

type ChatToolItem = {
  itemType: "Tool";
  toolId: string;
  quantity: number;
};

type ChatPetItem = {
  itemType: "Pet";
  id?: string;
  petSpecies?: string;
  name?: string | null;
  xp?: number;
  mutations?: string[];
  abilities?: string[];
  targetScale?: number;
};

type ChatEggItem = {
  itemType: "Egg";
  eggId: string;
  quantity: number;
};

type ChatProduceItem = {
  itemType: "Produce";
  id?: string;
  species: string;
  scale?: number;
  mutations?: string[];
};

type ChatPlantItem = {
  itemType: "Plant";
  id?: string;
  species: string;
  slotsCount?: number;
};

type ChatItem =
  | ChatSeedItem
  | ChatDecorItem
  | ChatToolItem
  | ChatPetItem
  | ChatEggItem
  | ChatProduceItem
  | ChatPlantItem;

type ItemMessagePayload = {
  v: 1;
  kind: "item";
  message?: string;
  item?: ChatItem;
  items?: ChatItem[];
};

type RoomInvitePayload = {
  v: 1;
  kind: "room";
  message?: string;
  roomId: string;
  roomName?: string;
  playersCount?: number;
  maxPlayers?: number;
};

const ITEM_MESSAGE_PREFIX = "ITEM::v1::";
const ROOM_INVITE_PREFIX = "ROOM::v1::";
const ATTACHMENT_STATUS_PREFIX = "Items attached:";
const MAX_ATTACHMENTS = 6;
const MAX_MESSAGE_LENGTH = 1000;
const THREAD_INITIAL_LIMIT = 80;
const THREAD_PAGE_LIMIT = 50;
const LOAD_OLDER_THRESHOLD = 80;
const FRIENDS_REFRESH_EVENT = "qws-friends-refresh";
const FRIEND_REMOVED_EVENT = "qws-friend-removed";
const GROUPS_REFRESH_EVENT = "qws-groups-refresh";

const STYLE_ID = "qws-messages-overlay-css";

const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
};

type UnknownRecord = Record<string, unknown>;

type PlayerLike = {
  id?: unknown;
  name?: unknown;
  databaseUserId?: unknown;
  playerId?: unknown;
  discordAvatarUrl?: unknown;
  cosmetic?: { avatar?: unknown };
};

type GroupMemberLite = {
  id: string;
  name?: string;
  avatarUrl?: string;
  avatar?: string[];
};

type PlantCatalogEntry = {
  seed?: { name?: string; maxScale?: number };
  crop?: { name?: string; maxScale?: number };
  plant?: { name?: string; maxScale?: number };
};

type NamedCatalogEntry = { name?: string };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

type KeyTrapCleanup = () => void;

export type MessagesOverlayOptions = {
  embedded?: boolean;
  onUnreadChange?: (total: number) => void;
  mode?: "dm" | "group";
  title?: string;
  onThreadHeadRender?: (head: HTMLDivElement, selectedId: string | null) => void;
  onListHeadRender?: (list: HTMLDivElement) => void;
};

function installInputKeyTrap(
  scope: HTMLElement,
  opts: {
    onEnter?: () => void;
    shouldHandleEnter?: (target: HTMLElement | null, active: HTMLElement | null) => boolean;
  } = {},
): KeyTrapCleanup {
  const isEditable = (el: Element | null) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "").toLowerCase();
      return t === "text" || t === "number" || t === "search";
    }
    return el.isContentEditable === true;
  };

  const inScope = (node: Element | null) => {
    if (!node) return false;
    if (scope.contains(node)) return true;
    const panel = (node as HTMLElement).closest?.(".qws-msg-panel");
    if (panel && panel === scope) return true;
    const picker = scope.querySelector("emoji-picker") as HTMLElement | null;
    if (!picker) return false;
    if (picker === node || picker.contains(node)) return true;
    const shadow = picker.shadowRoot;
    if (shadow && node instanceof Node && shadow.contains(node)) return true;
    const root = node.getRootNode?.();
    if (root && shadow && root === shadow) return true;
    return false;
  };

  const handler = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    if (!((inScope(target) && isEditable(target)) || (inScope(active) && isEditable(active)))) return;

    const key = ev.key || "";
    const code = ev.code || "";
    const keyCode = ev.keyCode;
    const isEnter = (key === "Enter" || code === "Enter" || keyCode === 13) && !ev.shiftKey;
    const shouldHandleEnter = opts.shouldHandleEnter
      ? opts.shouldHandleEnter(target, active)
      : true;
    if (isEnter && !ev.isComposing && ev.type === "keydown" && shouldHandleEnter) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      opts.onEnter?.();
      return;
    }

    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };

  const types = ["keydown", "keypress", "keyup"] as const;
  types.forEach((t) => {
    window.addEventListener(t, handler, { capture: true });
    document.addEventListener(t, handler, { capture: true });
    scope.addEventListener(t, handler, { capture: true });
  });

  return () => {
    types.forEach((t) => {
      window.removeEventListener(t, handler, { capture: true });
      document.removeEventListener(t, handler, { capture: true });
      scope.removeEventListener(t, handler, { capture: true });
    });
  };
}

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

function base64UrlEncode(input: string): string {
  try {
    if (encoder) {
      const bytes = encoder.encode(input);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
  } catch {}
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string | null {
  try {
    const raw = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = raw.length % 4;
    const padded = pad ? raw + "=".repeat(4 - pad) : raw;
    const binary = atob(padded);
    if (decoder) {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return decoder.decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  } catch {
    return null;
  }
}

function normalizeQuantity(raw: unknown): number {
  const n = Math.floor(Number(raw ?? 1));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function normalizeChatItem(raw: unknown): ChatItem | null {
  if (!isRecord(raw)) return null;
  const typeRaw = raw.itemType ?? raw.type ?? raw.kind ?? raw.category;
  const type = String(typeRaw ?? "").trim();
  const typeLc = type.toLowerCase();

  const scaleCandidate = Number(raw.scale ?? raw.targetScale);
  if (typeLc === "produce" || typeLc === "crop" || (typeLc === "seed" && Number.isFinite(scaleCandidate))) {
    const species = String(raw.species ?? raw.cropSpecies ?? raw.name ?? "").trim();
    if (!species) return null;
    const scale = Number.isFinite(scaleCandidate) ? scaleCandidate : undefined;
    const mutations = Array.isArray(raw.mutations)
      ? raw.mutations.map((m) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const id = raw.id != null ? String(raw.id) : undefined;
    return { itemType: "Produce", id, species, scale, mutations };
  }
  if (typeLc === "seed") {
    const species = String(raw.species ?? raw.seedSpecies ?? raw.name ?? "").trim();
    if (!species) return null;
    return { itemType: "Seed", species, quantity: normalizeQuantity(raw.quantity) };
  }
  if (typeLc === "decor") {
    const decorId = String(raw.decorId ?? raw.id ?? raw.name ?? "").trim();
    if (!decorId) return null;
    return { itemType: "Decor", decorId, quantity: normalizeQuantity(raw.quantity) };
  }
  if (typeLc === "tool") {
    const toolId = String(raw.toolId ?? raw.id ?? raw.name ?? "").trim();
    if (!toolId) return null;
    return { itemType: "Tool", toolId, quantity: normalizeQuantity(raw.quantity) };
  }
  if (typeLc === "egg") {
    const eggId = String(raw.eggId ?? raw.id ?? raw.name ?? "").trim();
    if (!eggId) return null;
    return { itemType: "Egg", eggId, quantity: normalizeQuantity(raw.quantity) };
  }
  if (typeLc === "plant") {
    const species = String(raw.species ?? raw.plantSpecies ?? raw.name ?? "").trim();
    if (!species) return null;
    const slotsCount = Array.isArray(raw.slots) ? raw.slots.length : undefined;
    const id = raw.id != null ? String(raw.id) : undefined;
    return { itemType: "Plant", id, species, slotsCount };
  }
  if (typeLc === "pet") {
    const petSpecies = String(raw.petSpecies ?? raw.species ?? "").trim();
    const id = raw.id != null ? String(raw.id) : undefined;
    const name =
      raw.name != null && String(raw.name).trim()
        ? String(raw.name)
        : null;
    const data = isRecord(raw.data) ? raw.data : null;
    const xpRaw = Number(raw.xp ?? data?.xp);
    const xp = Number.isFinite(xpRaw) ? xpRaw : undefined;
    const mutations = Array.isArray(raw.mutations)
      ? raw.mutations.map((m) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const abilities = Array.isArray(raw.abilities)
      ? raw.abilities.map((a) => String(a ?? "").trim()).filter(Boolean)
      : undefined;
    const targetScale = Number(raw.targetScale);
    if (!petSpecies && !name && !id) return null;
    return {
      itemType: "Pet",
      id,
      petSpecies: petSpecies || undefined,
      name,
      xp,
      mutations,
      abilities,
      targetScale: Number.isFinite(targetScale) ? targetScale : undefined,
    };
  }

  return null;
}

function compactItem(item: ChatItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value == null) return;
    if (typeof value === "string" && !value.trim()) return;
    if (Array.isArray(value) && value.length === 0) return;
    out[key] = value;
  };
  const setNum = (key: string, value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    out[key] = n;
  };

  if (item.itemType === "Seed") {
    out.t = "S";
    set("s", item.species);
    if (item.quantity > 1) setNum("q", item.quantity);
    return out;
  }
  if (item.itemType === "Decor") {
    out.t = "D";
    set("d", item.decorId);
    if (item.quantity > 1) setNum("q", item.quantity);
    return out;
  }
  if (item.itemType === "Tool") {
    out.t = "T";
    set("o", item.toolId);
    if (item.quantity > 1) setNum("q", item.quantity);
    return out;
  }
  if (item.itemType === "Egg") {
    out.t = "E";
    set("e", item.eggId);
    if (item.quantity > 1) setNum("q", item.quantity);
    return out;
  }
  if (item.itemType === "Produce") {
    out.t = "C";
    set("s", item.species);
    setNum("sc", item.scale);
    set("m", item.mutations);
    set("i", item.id);
    return out;
  }
  if (item.itemType === "Plant") {
    out.t = "L";
    set("s", item.species);
    setNum("c", item.slotsCount);
    set("i", item.id);
    return out;
  }
  if (item.itemType === "Pet") {
    out.t = "P";
    set("s", item.petSpecies);
    set("n", item.name ?? undefined);
    setNum("x", item.xp);
    set("m", item.mutations);
    set("a", item.abilities);
    setNum("sc", item.targetScale);
    set("i", item.id);
    return out;
  }

  out.t = "U";
  return out;
}

function encodeItemMessage(payload: ItemMessagePayload): string {
  const itemsRaw = Array.isArray(payload.items)
    ? payload.items
    : payload.item
      ? [payload.item]
      : [];
  const compactItems = itemsRaw.map(compactItem);
  const compactPayload: Record<string, unknown> = {
    v: 1,
    k: "i",
    i: compactItems,
  };
  if (payload.message && payload.message.trim()) {
    compactPayload.m = payload.message;
  }
  const json = JSON.stringify(compactPayload);
  return `${ITEM_MESSAGE_PREFIX}${json}`;
}

function decodeCompactItem(raw: unknown): ChatItem | null {
  if (!isRecord(raw)) return null;
  const t = String(raw.t ?? "").toUpperCase();
  const qty = normalizeQuantity(raw.q ?? 1);
  if (t === "S") {
    const species = String(raw.s ?? "").trim();
    if (!species) return null;
    return { itemType: "Seed", species, quantity: qty };
  }
  if (t === "D") {
    const decorId = String(raw.d ?? "").trim();
    if (!decorId) return null;
    return { itemType: "Decor", decorId, quantity: qty };
  }
  if (t === "T") {
    const toolId = String(raw.o ?? "").trim();
    if (!toolId) return null;
    return { itemType: "Tool", toolId, quantity: qty };
  }
  if (t === "E") {
    const eggId = String(raw.e ?? "").trim();
    if (!eggId) return null;
    return { itemType: "Egg", eggId, quantity: qty };
  }
  if (t === "C") {
    const species = String(raw.s ?? "").trim();
    if (!species) return null;
    const scale = Number(raw.sc);
    const mutations = Array.isArray(raw.m)
      ? raw.m.map((m) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const id = raw.i != null ? String(raw.i) : undefined;
    return {
      itemType: "Produce",
      id,
      species,
      scale: Number.isFinite(scale) ? scale : undefined,
      mutations,
    };
  }
  if (t === "L") {
    const species = String(raw.s ?? "").trim();
    if (!species) return null;
    const slotsCount = Number(raw.c);
    const id = raw.i != null ? String(raw.i) : undefined;
    return {
      itemType: "Plant",
      id,
      species,
      slotsCount: Number.isFinite(slotsCount) ? slotsCount : undefined,
    };
  }
  if (t === "P") {
    const petSpecies = String(raw.s ?? "").trim();
    const name = raw.n != null && String(raw.n).trim() ? String(raw.n) : null;
    const xp = Number(raw.x);
    const mutations = Array.isArray(raw.m)
      ? raw.m.map((m) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const abilities = Array.isArray(raw.a)
      ? raw.a.map((a) => String(a ?? "").trim()).filter(Boolean)
      : undefined;
    const targetScale = Number(raw.sc);
    const id = raw.i != null ? String(raw.i) : undefined;
    if (!petSpecies && !name && !id) return null;
    return {
      itemType: "Pet",
      id,
      petSpecies: petSpecies || undefined,
      name,
      xp: Number.isFinite(xp) ? xp : undefined,
      mutations,
      abilities,
      targetScale: Number.isFinite(targetScale) ? targetScale : undefined,
    };
  }
  return null;
}

function decodeItemMessage(text: string): ItemMessagePayload | null {
  if (!text || !text.startsWith(ITEM_MESSAGE_PREFIX)) return null;
  const raw = text.slice(ITEM_MESSAGE_PREFIX.length);
  let parsed: unknown = null;
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      parsed = JSON.parse(trimmed);
    } else {
      const decoded = base64UrlDecode(raw);
      if (!decoded) return null;
      parsed = JSON.parse(decoded);
    }
    if (!isRecord(parsed)) return null;
    if (parsed.k !== "i" && parsed.kind !== "item") return null;
    const version = Number(parsed.v ?? parsed.version ?? 1);
    if (!Number.isFinite(version) || version !== 1) return null;
    const itemsRaw = Array.isArray(parsed.i)
      ? parsed.i
      : Array.isArray(parsed.items)
        ? parsed.items
        : parsed.item
          ? [parsed.item]
          : [];
    const normalizedItems = itemsRaw
      .map((entry) =>
        isRecord(entry) && "t" in entry
          ? decodeCompactItem(entry)
          : normalizeChatItem(entry),
      )
      .filter((entry): entry is ChatItem => !!entry);
    if (!normalizedItems.length) return null;
    return {
      v: 1,
      kind: "item",
      message: typeof parsed.m === "string" ? parsed.m : typeof parsed.message === "string" ? parsed.message : "",
      items: normalizedItems,
    };
  } catch {
    return null;
  }
}

function encodeRoomInvite(payload: RoomInvitePayload): string {
  const compact: Record<string, unknown> = {
    v: 1,
    k: "r",
    r: payload.roomId,
  };
  if (payload.message && payload.message.trim()) compact.m = payload.message;
  if (payload.roomName) compact.n = payload.roomName;
  if (typeof payload.playersCount === "number") compact.p = payload.playersCount;
  if (typeof payload.maxPlayers === "number") compact.x = payload.maxPlayers;
  const json = JSON.stringify(compact);
  return `${ROOM_INVITE_PREFIX}${json}`;
}

function decodeRoomInvite(text: string): RoomInvitePayload | null {
  if (!text || !text.startsWith(ROOM_INVITE_PREFIX)) return null;
  const raw = text.slice(ROOM_INVITE_PREFIX.length);
  try {
    let parsed: unknown = null;
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      parsed = JSON.parse(trimmed);
    } else {
      const decoded = base64UrlDecode(raw);
      if (!decoded) return null;
      parsed = JSON.parse(decoded);
    }
    if (!isRecord(parsed)) return null;
    if (parsed.k !== "r" && parsed.kind !== "room") return null;
    const roomId = String(parsed.r ?? parsed.roomId ?? "").trim();
    if (!roomId) return null;
    return {
      v: 1,
      kind: "room",
      message: typeof parsed.m === "string" ? parsed.m : typeof parsed.message === "string" ? parsed.message : "",
      roomId,
      roomName: typeof parsed.n === "string" ? parsed.n : typeof parsed.roomName === "string" ? parsed.roomName : undefined,
      playersCount: typeof parsed.p === "number" ? parsed.p : typeof parsed.playersCount === "number" ? parsed.playersCount : undefined,
      maxPlayers: typeof parsed.x === "number" ? parsed.x : typeof parsed.maxPlayers === "number" ? parsed.maxPlayers : undefined,
    };
  } catch {
    return null;
  }
}

type StrengthBadgeTone = "normal" | "gold" | "rainbow";
const RAINBOW_BADGE_TEXT_GRADIENT =
  "linear-gradient(90deg, #ff6b6b 0%, #ffd86f 25%, #6bff8f 50%, #6bc7ff 75%, #b86bff 100%)";
const SIZE_MIN = 50;
const SIZE_MAX = 100;
const SCALE_MIN = 1;
const SCALE_MAX = 3;
const COIN_FORMATTER = new Intl.NumberFormat("en-US");
const LINK_REGEX = /((?:https?:\/\/|www\.)[^\s]+)/gi;

function findPlayersDeep(state: unknown): PlayerLike[] {
  if (!isRecord(state)) return [];
  const out: PlayerLike[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [state];

  while (stack.length) {
    const cur = stack.pop();
    if (!isRecord(cur) || seen.has(cur)) continue;
    seen.add(cur);
    for (const [key, value] of Object.entries(cur)) {
      if (Array.isArray(value) && value.length > 0) {
        const records = value.filter(isRecord);
        if (records.length === value.length) {
          const looksLikePlayer = records.some(
            (item) => "id" in item && "name" in item,
          );
          if (looksLikePlayer && /player/i.test(key)) {
            out.push(...(records as PlayerLike[]));
          }
        }
      }
      if (isRecord(value)) {
        stack.push(value);
      }
    }
  }

  const byId = new Map<string, PlayerLike>();
  for (const entry of out) {
    if (entry?.id != null) {
      byId.set(String(entry.id), entry);
    }
  }
  return [...byId.values()];
}

function getPlayersArrayFromState(state: unknown): PlayerLike[] {
  if (!isRecord(state)) return [];
  const fullState = isRecord(state.fullState) ? state.fullState : null;
  const fullData = fullState && isRecord(fullState.data) ? fullState.data : null;
  const data = isRecord(state.data) ? state.data : null;
  const direct =
    (fullData ? fullData.players : undefined) ??
    (data ? data.players : undefined) ??
    state.players;
  return Array.isArray(direct)
    ? direct.filter(isRecord) as PlayerLike[]
    : findPlayersDeep(state);
}

function normalizeCosmeticName(raw: string): string | null {
  const source = String(raw ?? "").trim();
  if (!source) return null;
  let value = source;
  const lower = value.toLowerCase();
  const idx = lower.lastIndexOf("cosmetic/");
  if (idx >= 0) {
    value = value.slice(idx + "cosmetic/".length);
  }
  value = value.replace(/^\/+/, "");
  const q = value.indexOf("?");
  if (q >= 0) value = value.slice(0, q);
  const h = value.indexOf("#");
  if (h >= 0) value = value.slice(0, h);
  return value.trim() ? value.trim() : null;
}

const MUTATION_SPRITE_OVERRIDES: Record<string, string> = {
  dawnlit: "Dawnlit",
  dawnbound: "Dawncharged",
  amberlit: "Ambershine",
  amberbound: "Ambercharged",
  thunderstruck: "Thunderstruck",
};

function getPetMutationTone(mutations?: string[]): StrengthBadgeTone {
  const list = Array.isArray(mutations) ? mutations : [];
  const seen = new Set(list.map((m) => String(m).toLowerCase()));
  if (seen.has("rainbow")) return "rainbow";
  if (seen.has("gold") || seen.has("golden")) return "gold";
  return "normal";
}

function getAbilityChipColors(id: string): { bg: string; hover: string } {
  const key = String(id || "");
  const base = (PetsService.getAbilityNameWithoutLevel?.(key) || "")
    .replace(/[\s\-_]+/g, "")
    .toLowerCase();

  const is = (prefix: string) =>
    key.startsWith(prefix) || base === prefix.toLowerCase();

  if (is("MoonKisser")) {
    return { bg: "rgba(250,166,35,0.9)", hover: "rgba(250,166,35,1)" };
  }

  if (is("DawnKisser")) {
    return { bg: "rgba(162,92,242,0.9)", hover: "rgba(162,92,242,1)" };
  }

  if (is("ProduceScaleBoost") || is("SnowyCropSizeBoost")) {
    return { bg: "rgba(34,139,34,0.9)", hover: "rgba(34,139,34,1)" };
  }

  if (is("PlantGrowthBoost") || is("SnowyPlantGrowthBoost")) {
    return { bg: "rgba(0,128,128,0.9)", hover: "rgba(0,128,128,1)" };
  }

  if (is("EggGrowthBoost") || is("SnowyEggGrowthBoost")) {
    return { bg: "rgba(180,90,240,0.9)", hover: "rgba(180,90,240,1)" };
  }

  if (is("PetAgeBoost")) {
    return { bg: "rgba(147,112,219,0.9)", hover: "rgba(147,112,219,1)" };
  }

  if (is("PetHatchSizeBoost")) {
    return { bg: "rgba(128,0,128,0.9)", hover: "rgba(128,0,128,1)" };
  }

  if (is("PetXpBoost") || is("SnowyPetXpBoost")) {
    return { bg: "rgba(30,144,255,0.9)", hover: "rgba(30,144,255,1)" };
  }

  if (is("HungerBoost") || is("SnowyHungerBoost")) {
    return { bg: "rgba(255,20,147,0.9)", hover: "rgba(255,20,147,1)" };
  }

  if (is("HungerRestore") || is("SnowyHungerRestore")) {
    return { bg: "rgba(255,105,180,0.9)", hover: "rgba(255,105,180,1)" };
  }

  if (is("SellBoost")) {
    return { bg: "rgba(220,20,60,0.9)", hover: "rgba(220,20,60,1)" };
  }

  if (is("CoinFinder") || is("SnowyCoinFinder")) {
    return { bg: "rgba(180,150,0,0.9)", hover: "rgba(180,150,0,1)" };
  }

  if (is("SeedFinder")) {
    return { bg: "rgba(168,102,38,0.9)", hover: "rgba(168,102,38,1)" };
  }

  if (is("ProduceMutationBoost")) {
    return { bg: "rgba(140,15,70,0.9)", hover: "rgba(140,15,70,1)" };
  }

  if (is("PetMutationBoost")) {
    return { bg: "rgba(160,50,100,0.9)", hover: "rgba(160,50,100,1)" };
  }

  if (is("DoubleHarvest")) {
    return { bg: "rgba(0,120,180,0.9)", hover: "rgba(0,120,180,1)" };
  }

  if (is("DoubleHatch")) {
    return { bg: "rgba(60,90,180,0.9)", hover: "rgba(60,90,180,1)" };
  }

  if (is("ProduceEater")) {
    return { bg: "rgba(255,69,0,0.9)", hover: "rgba(255,69,0,1)" };
  }

  if (is("ProduceRefund")) {
    return { bg: "rgba(255,99,71,0.9)", hover: "rgba(255,99,71,1)" };
  }

  if (is("PetRefund")) {
    return { bg: "rgba(0,80,120,0.9)", hover: "rgba(0,80,120,1)" };
  }

  if (is("Copycat")) {
    return { bg: "rgba(255,140,0,0.9)", hover: "rgba(255,140,0,1)" };
  }

  if (is("GoldGranter")) {
    return {
      bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
      hover:
        "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)",
    };
  }

  if (is("RainbowGranter")) {
    return {
      bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
      hover:
        "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))",
    };
  }

  if (is("RainDance")) {
    return { bg: "rgba(102,204,216,0.9)", hover: "rgba(102,204,216,1)" };
  }

  if (is("SnowGranter")) {
    return { bg: "rgba(175,215,235,0.9)", hover: "rgba(175,215,235,1)" };
  }

  if (is("FrostGranter")) {
    return { bg: "rgba(100,160,220,0.9)", hover: "rgba(100,160,220,1)" };
  }

  return { bg: "rgba(100,100,100,0.9)", hover: "rgba(150,150,150,1)" };
}

function createAbilityBadges(abilities?: string[]): HTMLSpanElement | null {
  const ids = Array.isArray(abilities)
    ? abilities.map((a) => String(a ?? "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return null;

  const wrap = document.createElement("span");
  wrap.className = "qws-msg-ability-badges";
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.lineHeight = "1";
  wrap.style.flexWrap = "wrap";
  wrap.style.columnGap = "8px";
  wrap.style.rowGap = "4px";
  wrap.style.maxWidth = "100%";

  const size = 12;
  const radius = 3;

  ids.forEach((id) => {
    const chip = document.createElement("span");
    chip.className = "qws-msg-ability-chip";
    const { bg, hover } = getAbilityChipColors(id);
    chip.title = PetsService.getAbilityName?.(id) || id;
    chip.setAttribute("aria-label", chip.title);
    Object.assign(chip.style, {
      display: "inline-block",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${radius}px`,
      background: bg,
      transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
      cursor: "default",
      boxShadow: "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a",
    } as CSSStyleDeclaration);

    chip.onmouseenter = () => {
      chip.style.background = hover;
      chip.style.transform = "scale(1.08)";
      chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff33";
    };
    chip.onmouseleave = () => {
      chip.style.background = bg;
      chip.style.transform = "none";
      chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a";
    };

    wrap.appendChild(chip);
  });

  return wrap;
}

function applyStrengthBadgeTone(
  badge: HTMLSpanElement,
  tone: StrengthBadgeTone,
): void {
  badge.dataset.tmStrengthTone = tone;
  badge.style.backgroundImage = "";
  badge.style.backgroundColor = "";
  badge.style.color = "";
  badge.style.backgroundClip = "";
  badge.style.webkitBackgroundClip = "";
  badge.style.backgroundOrigin = "";
  badge.style.webkitTextFillColor = "";

  if (tone === "rainbow") {
    badge.style.color = "transparent";
    badge.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.25)), ${RAINBOW_BADGE_TEXT_GRADIENT}`;
    badge.style.backgroundClip = "padding-box, text";
    badge.style.webkitBackgroundClip = "padding-box, text";
    badge.style.backgroundOrigin = "padding-box, text";
    badge.style.webkitTextFillColor = "transparent";
  } else if (tone === "gold") {
    badge.style.color = "#F3D32B";
    badge.style.backgroundColor = "rgba(243, 211, 43, 0.25)";
  } else {
    badge.style.color = "#8fd3ff";
    badge.style.backgroundColor = "rgba(79, 166, 255, 0.28)";
  }
}

function normalizeMutationLabelForSprite(label: string): string {
  const normalized = String(label ?? "").trim();
  if (!normalized) return normalized;
  const overridden = MUTATION_SPRITE_OVERRIDES[normalized.toLowerCase()];
  return overridden ?? normalized;
}

function normalizeMutationsForSprite(list?: string[]): string[] {
  return (Array.isArray(list) ? list : [])
    .map((label) => normalizeMutationLabelForSprite(label))
    .filter(Boolean);
}

function shortenLinkLabel(raw: string, maxLen = 36): string {
  const trimmed = String(raw || "");
  const display = trimmed.replace(/^https?:\/\//i, "");
  if (display.length <= maxLen) return display;
  return `${display.slice(0, Math.max(0, maxLen - 3))}...`;
}

function linkifyText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const raw = String(text ?? "");
  if (!raw) return frag;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_REGEX.exec(raw)) !== null) {
    const matchText = match[0];
    const start = match.index;
    const end = start + matchText.length;
    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(raw.slice(lastIndex, start)));
    }

    let linkText = matchText;
    let trailing = "";
    while (linkText && /[.,!?;:)\]]$/.test(linkText)) {
      trailing = linkText.slice(-1) + trailing;
      linkText = linkText.slice(0, -1);
    }

    if (linkText) {
      const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
      const a = document.createElement("a");
      a.className = "qws-msg-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = shortenLinkLabel(linkText);
      frag.appendChild(a);
    } else {
      frag.appendChild(document.createTextNode(matchText));
    }

    if (trailing) {
      frag.appendChild(document.createTextNode(trailing));
    }
    lastIndex = end;
  }

  if (lastIndex < raw.length) {
    frag.appendChild(document.createTextNode(raw.slice(lastIndex)));
  }
  return frag;
}

function formatScaleValue(raw?: number): string | null {
  if (!Number.isFinite(raw)) return null;
  const fixed = (raw as number).toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

function getMaxScaleForSpecies(key: string): number | null {
  const entry = (plantCatalog as Record<string, PlantCatalogEntry>)[key];
  const candidates = [entry?.crop?.maxScale, entry?.plant?.maxScale, entry?.seed?.maxScale];
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function scaleToSizePercent(scale: number, maxScale: number | null): number | null {
  if (!Number.isFinite(scale)) return null;
  const safeMax =
    typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN
      ? maxScale
      : SCALE_MAX;
  if (safeMax <= SCALE_MIN) return SIZE_MIN;
  const normalized = (scale - SCALE_MIN) / (safeMax - SCALE_MIN);
  const percent = SIZE_MIN + normalized * (SIZE_MAX - SIZE_MIN);
  if (!Number.isFinite(percent)) return null;
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, percent));
}

function getProduceMeta(item: ChatProduceItem): { sizeValue: number | null; priceLabel: string | null } {
  let sizeValue: number | null = null;
  const sizePercent = scaleToSizePercent(
    Number(item.scale),
    getMaxScaleForSpecies(item.species),
  );
  if (sizePercent != null) {
    sizeValue = Math.round(sizePercent);
  }

  let priceLabel: string | null = null;
  if (Number.isFinite(item.scale) && item.scale > 0) {
    const price = estimateProduceValue(
      item.species,
      item.scale,
      item.mutations,
      DefaultPricing,
    );
    if (Number.isFinite(price) && price > 0) {
      priceLabel = COIN_FORMATTER.format(price);
    }
  }

  return { sizeValue, priceLabel };
}

function buildSpriteCandidates(...values: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(trimmed.replace(/\W+/g, ""));
    const lastSegment = trimmed.split(/[./]/).pop();
    if (lastSegment && lastSegment !== trimmed) {
      candidates.add(lastSegment);
      candidates.add(lastSegment.replace(/\W+/g, ""));
    }
  };
  values.forEach(addCandidate);
  const baseCandidates = Array.from(candidates)
    .map((value) => value.replace(/icon$/i, ""))
    .filter(Boolean);
  const iconCandidates = baseCandidates.map((value) => `${value}Icon`).filter(Boolean);
  return Array.from(new Set([...candidates, ...baseCandidates, ...iconCandidates])).filter(Boolean);
}

function getChatItemLabel(item: ChatItem): string {
  if (item.itemType === "Seed") {
    const entry = (plantCatalog as Record<string, PlantCatalogEntry>)[item.species];
    return (
      entry?.seed?.name ||
      entry?.crop?.name ||
      item.species ||
      "Seed"
    );
  }
  if (item.itemType === "Produce") {
    const entry = (plantCatalog as Record<string, PlantCatalogEntry>)[item.species];
    return (
      entry?.crop?.name ||
      entry?.plant?.name ||
      entry?.seed?.name ||
      item.species ||
      "Produce"
    );
  }
  if (item.itemType === "Plant") {
    const entry = (plantCatalog as Record<string, PlantCatalogEntry>)[item.species];
    return (
      entry?.plant?.name ||
      entry?.crop?.name ||
      entry?.seed?.name ||
      item.species ||
      "Plant"
    );
  }
  if (item.itemType === "Egg") {
    const entry = (eggCatalog as Record<string, NamedCatalogEntry>)[item.eggId];
    return entry?.name || item.eggId || "Egg";
  }
  if (item.itemType === "Decor") {
    const entry = (decorCatalog as Record<string, NamedCatalogEntry>)[item.decorId];
    return entry?.name || item.decorId || "Decor";
  }
  if (item.itemType === "Tool") {
    const entry = (toolCatalog as Record<string, NamedCatalogEntry>)[item.toolId];
    return entry?.name || item.toolId || "Tool";
  }
  if (item.itemType === "Pet") {
    const entry = (petCatalog as Record<string, NamedCatalogEntry>)[item.petSpecies ?? ""];
    if (item.name) return item.name;
    return entry?.name || item.petSpecies || "Pet";
  }
  return "Item";
}

function getChatItemSubtitle(item: ChatItem): string {
  if (item.itemType === "Seed") {
    return `x${item.quantity}`;
  }
  if (item.itemType === "Decor") {
    return `x${item.quantity}`;
  }
  if (item.itemType === "Tool") {
    return `x${item.quantity}`;
  }
  if (item.itemType === "Egg") {
    return `x${item.quantity}`;
  }
  if (item.itemType === "Pet") {
    const entry = (petCatalog as Record<string, NamedCatalogEntry>)[item.petSpecies ?? ""];
    const speciesLabel = entry?.name || item.petSpecies || "Pet";
    if (item.name) return speciesLabel;
    return "";
  }
  if (item.itemType === "Produce") {
    const meta = getProduceMeta(item);
    return meta.priceLabel ?? "";
  }
  if (item.itemType === "Plant") {
    const slots = typeof item.slotsCount === "number" ? item.slotsCount : null;
    if (slots != null) return `${slots} slots`;
    return "";
  }
  return "Item";
}

function createItemCard(item: ChatItem): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "qws-msg-item-card";

  const iconWrap = document.createElement("div");
  iconWrap.className = "qws-msg-item-icon";
  const fallback = document.createElement("span");
  fallback.textContent = getChatItemLabel(item).charAt(0).toUpperCase();
  iconWrap.appendChild(fallback);

  const meta = document.createElement("div");
  meta.className = "qws-msg-item-meta";
  const title = document.createElement("div");
  title.className = "qws-msg-item-title";
  title.textContent = getChatItemLabel(item);
  const titleRow = document.createElement("div");
  titleRow.className = "qws-msg-item-title-row";
  titleRow.appendChild(title);
  const sub = document.createElement("div");
  sub.className = "qws-msg-item-sub";
  if (item.itemType === "Pet") {
    const petSpecies = item.petSpecies ?? "";
    const abilitiesEl = createAbilityBadges(item.abilities);
    if (abilitiesEl) sub.classList.add("has-abilities");
    let statsRow: HTMLDivElement | null = null;
    const ensureStatsRow = () => {
      if (!statsRow) {
        statsRow = document.createElement("div");
        statsRow.className = "qws-msg-item-sub-row";
        sub.appendChild(statsRow);
      }
      return statsRow;
    };
    const petLike = {
      petSpecies,
      xp: item.xp ?? 0,
      targetScale: item.targetScale ?? 1,
      mutations: item.mutations ?? [],
    };
    const maxStrength = getPetMaxStrength(petLike);
    const strength = getPetStrength(petLike);
    if (Number.isFinite(maxStrength) && maxStrength > 0) {
      const roundedMax = Math.round(maxStrength);
      const roundedCurrent = Math.round(strength);
      if (roundedCurrent >= roundedMax) {
        const str = document.createElement("span");
        str.className = "qws-msg-item-str";
        str.textContent = `STR ${roundedMax}`;
        ensureStatsRow().appendChild(str);
        const badge = document.createElement("span");
        badge.className = "qws-msg-item-badge";
        badge.textContent = "MAX";
        applyStrengthBadgeTone(badge, getPetMutationTone(item.mutations));
        ensureStatsRow().appendChild(badge);
      } else {
        const str = document.createElement("span");
        str.className = "qws-msg-item-str";
        str.textContent = `STR ${Math.max(0, roundedCurrent)}/${roundedMax}`;
        ensureStatsRow().appendChild(str);
      }
    } else {
      const fallback = getChatItemSubtitle(item);
      if (fallback) {
        const label = document.createElement("span");
        label.textContent = fallback;
        ensureStatsRow().appendChild(label);
      }
    }
    if (abilitiesEl) {
      const abilitiesRow = document.createElement("div");
      abilitiesRow.className = "qws-msg-item-sub-row";
      abilitiesRow.appendChild(abilitiesEl);
      sub.appendChild(abilitiesRow);
    }
  } else if (item.itemType === "Produce") {
    const produceMeta = getProduceMeta(item);
    if (produceMeta.sizeValue != null) {
      const sizeBadge = document.createElement("span");
      sizeBadge.className = "qws-msg-item-size";
      sizeBadge.textContent = String(produceMeta.sizeValue);
      titleRow.appendChild(sizeBadge);
    }
    if (produceMeta.priceLabel) {
      const priceEl = document.createElement("span");
      priceEl.className = "qws-msg-item-price";
      priceEl.textContent = produceMeta.priceLabel;
      sub.appendChild(priceEl);
    }
  } else {
    sub.textContent = getChatItemSubtitle(item);
  }
  if (!sub.textContent && !sub.childElementCount) {
    sub.style.display = "none";
  }
  meta.append(titleRow, sub);

  card.append(iconWrap, meta);

  let categories: string[] = [];
  let candidates: string[] = [];
  let mutations: string[] | undefined;

  if (item.itemType === "Seed") {
    categories = ["seed", "plant"];
    candidates = [item.species];
  } else if (item.itemType === "Produce" || item.itemType === "Plant") {
    categories = ["plant", "tallplant"];
    candidates = [item.species];
    mutations = normalizeMutationsForSprite(item.mutations);
  } else if (item.itemType === "Decor") {
    categories = ["decor"];
    candidates = [item.decorId];
  } else if (item.itemType === "Tool") {
    categories = ["item"];
    candidates = [item.toolId];
  } else if (item.itemType === "Egg") {
    categories = ["pet"];
    candidates = [item.eggId];
  } else if (item.itemType === "Pet") {
    categories = ["pet"];
    if (item.petSpecies) candidates = [item.petSpecies];
    mutations = normalizeMutationsForSprite(item.mutations);
  }

  if (categories.length && candidates.length) {
    const expandedCandidates = buildSpriteCandidates(
      ...candidates,
      getChatItemLabel(item),
    );
    attachSpriteIcon(iconWrap, categories, expandedCandidates, 34, "messages-item", {
      mutations,
    });
  }

  return card;
}

function ensureMessagesOverlayStyle(): void {
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const st = existing ?? document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-msg-panel{
  position:absolute;
  top:calc(100% + 8px);
  right:0;
  width:min(760px, 92vw);
  height:min(70vh, 560px);
  max-height:70vh;
  display:none;
  border-radius:12px;
  border:1px solid var(--qws-border, #ffffff22);
  background:var(--qws-panel, #111823cc);
  backdrop-filter:blur(var(--qws-blur, 8px));
  color:var(--qws-text, #e7eef7);
  box-shadow:var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45));
  overflow:hidden;
  z-index:var(--chakra-zIndices-DialogModal, 7010);
}
.qws-msg-panel.qws-msg-panel-embedded{
  position:relative;
  top:auto;
  right:auto;
  left:auto;
  bottom:auto;
  width:100%;
  height:100%;
  max-height:none;
  display:flex;
  flex-direction:column;
  border-radius:16px;
  z-index:auto;
}
.qws-msg-panel.qws-msg-panel-embedded .qws-msg-head{
  cursor:default;
  display:none;
}
.qws-msg-panel.qws-msg-panel-embedded .qws-msg-body{
  height:100%;
}
.qws-msg-panel *{ box-sizing:border-box; }
.qws-msg-head{
  padding:10px 12px;
  font-weight:700;
  border-bottom:1px solid var(--qws-border, #ffffff22);
  display:flex;
  align-items:center;
  gap:8px;
  cursor:grab;
  user-select:none;
}
.qws-msg-body{
  display:grid;
  grid-template-columns:240px 1fr;
  height:calc(100% - 44px);
  min-height:0;
}
.qws-msg-list{
  border-right:1px solid var(--qws-border, #ffffff22);
  overflow:auto;
  padding:8px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend-avatar-wrap{
  display:none;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend{
  padding-left:10px;
}
.qws-msg-list-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:6px 6px 2px 6px;
}
.qws-msg-list-title{
  font-size:12px;
  font-weight:700;
  color:#e2e8f0;
}
.qws-msg-list-new{
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.6);
  color:#f8fafc;
  border-radius:8px;
  padding:4px 8px;
  font-size:11px;
  font-weight:600;
  cursor:pointer;
  transition:background 120ms ease, border 120ms ease;
}
.qws-msg-list-new:hover{
  background:rgba(59,130,246,0.18);
  border-color:rgba(59,130,246,0.4);
}
.qws-msg-list-create{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:8px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.08);
  background:linear-gradient(180deg, rgba(15,23,42,0.65) 0%, rgba(10,16,28,0.65) 100%);
}
.qws-msg-list-create-row{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-msg-list-create-field{
  flex:1;
  min-width:0;
  display:flex;
  align-items:center;
  gap:6px;
  padding:6px 8px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(8,12,22,0.6);
  transition:border-color 120ms ease, box-shadow 120ms ease;
}
.qws-msg-list-create-field:focus-within{
  border-color:rgba(122,162,255,.5);
  box-shadow:0 0 0 1px rgba(122,162,255,.25);
}
.qws-msg-list-input{
  flex:1;
  min-width:0;
  border:none;
  background:transparent;
  color:#f8fafc;
  padding:4px 0;
  font-size:12px;
}
.qws-msg-list-input:focus{ outline:none; }
.qws-msg-list-create-actions{
  display:flex;
  align-items:center;
  gap:6px;
}
.qws-msg-list-action{
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.5);
  color:#f8fafc;
  border-radius:8px;
  padding:5px 8px;
  font-size:11px;
  font-weight:600;
  cursor:pointer;
  transition:background 120ms ease, border 120ms ease;
}
.qws-msg-list-action:hover{
  background:rgba(59,130,246,0.18);
  border-color:rgba(59,130,246,0.4);
}
.qws-msg-list-action-primary{
  background:rgba(122,162,255,0.9);
  color:#0b1017;
  border-color:rgba(122,162,255,0.9);
}
.qws-msg-list-action-primary:hover{
  background:rgba(142,176,255,0.95);
  border-color:rgba(142,176,255,0.95);
}
.qws-msg-list-action-ghost{
  background:transparent;
  border-color:transparent;
  color:rgba(226,232,240,0.8);
}
.qws-msg-list-action-ghost:hover{
  background:rgba(255,255,255,0.06);
  border-color:rgba(255,255,255,0.12);
}
.qws-msg-list-create-hint{
  font-size:10px;
  color:rgba(226,232,240,0.65);
  padding-left:2px;
}
.qws-msg-thread{
  display:flex;
  flex-direction:column;
  min-height:0;
}
  .qws-msg-thread-head{
    padding:10px 12px;
    border-bottom:1px solid var(--qws-border, #ffffff22);
    display:flex;
    align-items:center;
    gap:8px;
    min-height:44px;
  }
  .qws-msg-thread-actions{
    margin-left:auto;
    display:flex;
    align-items:center;
    gap:6px;
  }
  .qws-msg-thread-action-btn{
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(15,23,42,0.6);
    color:#f8fafc;
    border-radius:8px;
    padding:4px 8px;
    font-size:11px;
    font-weight:600;
    cursor:pointer;
    transition:background 120ms ease, border 120ms ease;
  }
  .qws-msg-thread-action-btn:hover{
    background:rgba(59,130,246,0.18);
    border-color:rgba(59,130,246,0.4);
  }
  .qws-msg-thread-action-btn.qws-msg-thread-add-member{
    background:rgba(34,197,94,0.22);
    border-color:rgba(34,197,94,0.6);
    color:#dcfce7;
  }
  .qws-msg-thread-action-btn.qws-msg-thread-add-member:hover{
    background:rgba(34,197,94,0.32);
    border-color:rgba(34,197,94,0.8);
  }
.qws-msg-thread-body{
  flex:1;
  overflow:auto;
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-msg-input{
  padding:10px;
  border-top:1px solid var(--qws-border, #ffffff22);
  display:flex;
  gap:8px;
  align-items:center;
}
.qws-msg-import{
  position:relative;
  flex:0 0 auto;
}
.qws-msg-import-btn{
  width:32px;
  height:32px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:rgba(255,255,255,0.08);
  color:var(--qws-text, #e7eef7);
  font-weight:700;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.qws-msg-import-menu{
  position:absolute;
  left:0;
  bottom:40px;
  min-width:170px;
  display:none;
  flex-direction:column;
  gap:4px;
  padding:6px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff22);
  background:var(--qws-panel, #111823cc);
  backdrop-filter:blur(var(--qws-blur, 8px));
  box-shadow:var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45));
  z-index:2;
}
.qws-msg-import-menu button{
  text-align:left;
  padding:6px 8px;
  border-radius:8px;
  border:1px solid transparent;
  background:transparent;
  color:var(--qws-text, #e7eef7);
  font-size:12px;
  cursor:pointer;
}
.qws-msg-import-menu button:hover{
  background:rgba(255,255,255,0.08);
  border-color:rgba(255,255,255,0.12);
}
.qws-msg-emoji{
  position:relative;
  flex:0 0 auto;
}
.qws-msg-emoji-btn{
  width:32px;
  height:32px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:rgba(255,255,255,0.08);
  color:var(--qws-text, #e7eef7);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:16px;
}
.qws-msg-emoji-btn.active{
  border-color:rgba(122,162,255,.6);
  box-shadow:0 0 0 1px rgba(122,162,255,.3);
}
.qws-msg-emoji-menu{
  position:absolute;
  right:0;
  bottom:40px;
  width:min(380px, 80vw);
  height:320px;
  display:none;
  flex-direction:column;
  gap:6px;
  padding:8px;
  border-radius:12px;
  border:1px solid var(--qws-border, #ffffff22);
  background:var(--qws-panel, #111823cc);
  backdrop-filter:blur(var(--qws-blur, 8px));
  box-shadow:var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45));
  z-index:2;
  overflow:hidden;
}
.qws-msg-emoji-menu .qws-msg-emoji-picker{
  width:100%;
  height:100%;
  color-scheme:dark;
  --background:#0f1724;
  --border-color:rgba(255,255,255,0.08);
  --border-size:1px;
  --border-radius:10px;
  --button-hover-background:rgba(122,162,255,0.18);
  --button-active-background:rgba(122,162,255,0.28);
  --indicator-color:#7aa2ff;
  --input-border-color:rgba(255,255,255,0.18);
  --input-border-radius:8px;
  --input-font-color:#e7eef7;
  --input-placeholder-color:rgba(231,238,247,0.6);
  --category-font-color:#d6e2f0;
  --emoji-size:1.45rem;
  --emoji-padding:0.35rem;
  --num-columns:8;
}
.qws-msg-input input{
  flex:1;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:rgba(0,0,0,.42);
  color:#fff;
  outline:none;
}
.qws-msg-input .qws-msg-send-btn{
  padding:8px 12px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:var(--qws-accent, #7aa2ff);
  color:#0b1017;
  font-weight:700;
  cursor:pointer;
}
.qws-msg-input .qws-msg-send-btn:disabled{
  opacity:.5;
  cursor:not-allowed;
}
.qws-msg-char-count{
  font-size:11px;
  opacity:.65;
  white-space:nowrap;
}
.qws-msg-char-count.over{
  color:#ff6c84;
  opacity:0.95;
}
`;
  st.textContent += `
.qws-msg-friend{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.06);
  background:rgba(255,255,255,0.02);
  cursor:pointer;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend{
  position:relative;
  padding-right:42px;
  padding-top:12px;
  padding-bottom:14px;
  min-height:56px;
}
.qws-msg-group-count{
  position:absolute;
  top:6px;
  right:8px;
  min-width:32px;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:rgba(122,162,255,.16);
  border:1px solid rgba(122,162,255,.35);
  color:#d6e5ff;
  font-size:10px;
  font-weight:700;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  letter-spacing:0.02em;
}
.qws-msg-friend.active{
  border-color:#9db7ff66;
  background:rgba(122,162,255,.16);
}
.qws-msg-friend.unread .qws-msg-friend-name{
  font-weight:700;
}
.qws-msg-friend-avatar-wrap{
  width:32px;
  height:32px;
  flex:0 0 32px;
  position:relative;
}
.qws-msg-friend-avatar{
  width:32px;
  height:32px;
  border-radius:50%;
  overflow:hidden;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.06);
  font-size:12px;
  font-weight:600;
}
.qws-msg-group-avatars-row{
  display:flex;
  align-items:center;
  gap:4px;
  margin-top:4px;
  padding-bottom:2px;
  flex-wrap:nowrap;
}
.qws-msg-group-avatars-row .qws-msg-avatar{
  width:22px;
  height:22px;
  border-radius:50%;
  border:1px solid rgba(255,255,255,0.28);
  background:rgba(10,16,28,0.7);
  box-shadow:0 1px 4px rgba(0,0,0,0.25);
  font-size:10px;
  overflow:hidden;
  flex:0 0 22px;
  line-height:0;
  aspect-ratio:1 / 1;
}
.qws-msg-group-avatars-row .qws-msg-avatar img{
  border-radius:50%;
  object-fit:cover;
}
.qws-msg-group-avatar-anon{
  color:#cbd5f5;
}
.qws-msg-status-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:#34d399;
  box-shadow:0 0 0 2px rgba(0,0,0,.35);
  position:absolute;
  right:-2px;
  bottom:-2px;
}
.qws-msg-friend-meta{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
  flex:1;
}
.qws-msg-friend-name{
  font-size:12px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend-name{
  font-size:14px;
  letter-spacing:0.01em;
}
.qws-msg-friend-sub{
  font-size:11px;
  opacity:.6;
}
.qws-msg-unread-badge{
  min-width:18px;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:#D02128;
  color:#fff;
  font-size:11px;
  font-weight:700;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.qws-msg-row{
  display:flex;
  gap:8px;
  align-items:center;
  width:100%;
  justify-content:flex-start;
}
.qws-msg-row.outgoing{
  justify-content:flex-end;
}
.qws-msg-avatar{
  width:32px;
  height:32px;
  border-radius:50%;
  overflow:hidden;
  position:relative;
  flex:0 0 32px;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.12);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:12px;
  font-weight:700;
  color:#dbe7f5;
}
.qws-msg-avatar img{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:contain;
}
.qws-msg-avatar img.qws-msg-avatar-layer{
  object-fit:contain;
  transform:scale(1.8);
  transform-origin:50% 18%;
}
.qws-msg-avatar img.qws-msg-avatar-photo{
  object-fit:cover;
}
.qws-msg-friend-avatar img.qws-msg-avatar-photo{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-msg-bubble{
  max-width:75%;
  padding:8px 10px;
  border-radius:12px;
  font-size:12px;
  line-height:1.35;
  word-wrap:break-word;
  white-space:pre-wrap;
  display:flex;
  flex-direction:column;
  cursor:default;
  position:relative;
  transition:padding-bottom 180ms ease, min-width 180ms ease;
}
.qws-msg-bubble.has-multi-items{
  width:100%;
}
.qws-msg-content{
  white-space:pre-wrap;
  word-break:break-word;
}
.qws-msg-item-card{
  margin-top:6px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  border-radius:10px;
  background:rgba(0,0,0,0.18);
  border:1px solid rgba(255,255,255,0.08);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
  max-width:100%;
}
.qws-msg-item-stack{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
  gap:6px;
  align-items:stretch;
  justify-items:stretch;
  width:100%;
}
.qws-msg-item-stack .qws-msg-item-card{
  margin-top:0;
  width:100%;
}
.qws-msg-bubble.no-text .qws-msg-item-card{
  margin-top:0;
}
.qws-msg-item-icon{
  width:36px;
  height:36px;
  border-radius:10px;
  background:rgba(255,255,255,0.08);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
  font-weight:700;
  flex:0 0 auto;
  overflow:hidden;
}
.qws-msg-item-meta{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
}
.qws-msg-item-title-row{
  display:flex;
  align-items:center;
  gap:6px;
  min-width:0;
}
.qws-msg-item-title{
  font-weight:600;
  font-size:12px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  min-width:0;
  flex:1;
}
.qws-msg-item-size{
  font-size:10px;
  padding:2px 6px;
  border-radius:999px;
  background:rgba(122,162,255,.2);
  border:1px solid rgba(122,162,255,.4);
  color:#d6e5ff;
  line-height:1;
  white-space:nowrap;
}
.qws-msg-item-sub{
  font-size:11px;
  opacity:0.7;
  display:flex;
  align-items:center;
  gap:6px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  min-height:14px;
}
.qws-msg-item-sub.has-abilities{
  flex-direction:column;
  align-items:flex-start;
  gap:4px;
  white-space:normal;
  overflow:visible;
  text-overflow:clip;
}
.qws-msg-item-sub-row{
  display:inline-flex;
  align-items:center;
  gap:6px;
  flex-wrap:wrap;
}
.qws-msg-ability-badges{
  display:inline-flex;
  flex-wrap:wrap;
  gap:8px;
  max-width:100%;
}
.qws-msg-item-price{
  color:#F3D32B;
  font-weight:700;
}
.qws-msg-link{
  color:#7aa2ff;
  text-decoration:underline;
  text-underline-offset:2px;
}
.qws-msg-link:hover{
  color:#9db7ff;
}
.qws-msg-item-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:0 6px;
  border-radius:999px;
  font-size:10px;
  line-height:1.1;
  font-weight:700;
  letter-spacing:0.02em;
  background:rgba(79, 166, 255, 0.28);
  color:#8fd3ff;
}
.qws-msg-attachments{
  display:none;
  flex-wrap:wrap;
  gap:6px;
  padding:0 10px 8px 10px;
}
.qws-msg-attachment{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:4px 8px;
  border-radius:999px;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.1);
  font-size:11px;
}
.qws-msg-attachment-label{
  white-space:nowrap;
  max-width:160px;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-msg-attachment-remove{
  border:none;
  background:rgba(0,0,0,0.3);
  color:#fff;
  width:16px;
  height:16px;
  border-radius:50%;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  font-size:12px;
  line-height:1;
  padding:0;
}
.qws-msg-attachment-remove:hover{
  background:rgba(255,255,255,0.2);
}
.qws-msg-bubble.incoming{
  align-self:flex-start;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.08);
}
.qws-msg-bubble.outgoing{
  align-self:flex-end;
  background:rgba(122,162,255,.22);
  border:1px solid rgba(122,162,255,.45);
}
.qws-msg-loading{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px 0;
  min-height:120px;
}
.qws-msg-loading-dots{
  display:flex;
  gap:6px;
  align-items:center;
}
.qws-msg-loading-dots span{
  width:8px;
  height:8px;
  border-radius:50%;
  background:rgba(255,255,255,0.65);
  display:inline-block;
  animation:qws-msg-bounce 1s ease-in-out infinite;
}
.qws-msg-loading-dots span:nth-child(2){
  animation-delay:0.15s;
}
.qws-msg-loading-dots span:nth-child(3){
  animation-delay:0.3s;
}
@keyframes qws-msg-bounce{
  0%, 80%, 100% { transform:translateY(0); opacity:0.6; }
  40% { transform:translateY(-6px); opacity:1; }
}
.qws-msg-sep{
  display:flex;
  align-items:center;
  gap:8px;
  width:100%;
  opacity:.65;
  font-size:11px;
  margin:6px 0;
}
.qws-msg-sep-line{
  flex:1;
  height:1px;
  background:rgba(255,255,255,0.12);
}
.qws-msg-sep-label{
  padding:0 6px;
  white-space:nowrap;
}
.qws-msg-read-hint{
  align-self:flex-end;
  font-size:11px;
  opacity:.65;
  margin-top:-2px;
}
.qws-msg-empty{
  opacity:.6;
  font-size:12px;
  text-align:center;
  margin:auto;
}
.qws-msg-room-invite{
  position:relative;
}
.qws-msg-room-invite .qws-msg-item-icon svg{
  width:20px;
  height:20px;
  opacity:0.8;
}
.qws-msg-room-btn-wrap{
  display:flex;
  flex-direction:column;
  gap:4px;
  align-items:flex-end;
  margin-left:auto;
}
.qws-msg-room-join-btn{
  padding:6px 12px;
  border-radius:8px;
  border:1px solid rgba(122,162,255,.45);
  background:rgba(122,162,255,.22);
  color:#d6e5ff;
  font-weight:600;
  font-size:11px;
  cursor:pointer;
  white-space:nowrap;
  transition:all 0.15s ease;
}
.qws-msg-room-join-btn:hover:not(:disabled){
  background:rgba(122,162,255,.32);
  border-color:rgba(122,162,255,.6);
  transform:translateY(-1px);
}
.qws-msg-room-join-btn:disabled{
  opacity:0.5;
  cursor:not-allowed;
}
.qws-msg-room-hint{
  font-size:10px;
  opacity:0.65;
  white-space:nowrap;
  text-align:right;
}
@media (max-width: 700px){
  .qws-msg-body{
    grid-template-columns:1fr;
    grid-template-rows:160px 1fr;
  }
  .qws-msg-list{
    border-right:none;
    border-bottom:1px solid var(--qws-border, #ffffff22);
  }
}
`;
  if (!existing) {
    document.head.appendChild(st);
  }
}

function normalizeId(value: unknown): string {
  return value == null ? "" : String(value);
}

function formatFriendName(friend: FriendSummary | null, fallbackId: string): string {
  const name = friend?.playerName ?? friend?.playerId ?? fallbackId;
  const trimmed = String(name ?? "").trim();
  return trimmed || fallbackId || "Unknown";
}

function formatStatus(friend: FriendSummary | null, mode: "dm" | "group" = "dm"): string {
  if (!friend) return "";
  if (mode === "group") return "";
  if (friend.isOnline) return "Online";
  const seen = formatLastSeen(friend.lastEventAt);
  return seen ? `Offline · ${seen}` : "Offline";
}

function getGroupMemberCount(friend: FriendSummary | null): number | null {
  if (!friend) return null;
  const rawCount =
    (friend as any).memberCount ??
    (friend as any).member_count ??
    (friend as any).membersCount ??
    (friend as any).members_count ??
    null;
  const count = Number(rawCount);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null;
}

function parseMessageTime(msg: DirectMessage): number {
  const raw = msg.createdAt || msg.deliveredAt || msg.readAt || "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDayLabel(date: Date): string {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (dayKey === todayKey) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  if (dayKey === yKey) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function createSeparator(label: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "qws-msg-sep";
  const lineLeft = document.createElement("div");
  lineLeft.className = "qws-msg-sep-line";
  const lineRight = document.createElement("div");
  lineRight.className = "qws-msg-sep-line";
  const text = document.createElement("div");
  text.className = "qws-msg-sep-label";
  text.textContent = label;
  wrap.append(lineLeft, text, lineRight);
  return wrap;
}

function extractInventoryItems(rawInventory: unknown): unknown[] {
  if (!rawInventory) return [];
  if (Array.isArray(rawInventory)) return rawInventory;
  if (!isRecord(rawInventory)) return [];
  if (Array.isArray(rawInventory.items)) return rawInventory.items;
  if (Array.isArray(rawInventory.inventory)) return rawInventory.inventory;
  const inventory = isRecord(rawInventory.inventory) ? rawInventory.inventory : null;
  if (inventory && Array.isArray(inventory.items)) return inventory.items;
  return [];
}

function extractStorages(rawInventory: unknown): unknown[] {
  if (!rawInventory) return [];
  if (!isRecord(rawInventory)) return [];
  if (Array.isArray(rawInventory.storages)) return rawInventory.storages;
  const inventory = isRecord(rawInventory.inventory) ? rawInventory.inventory : null;
  if (inventory && Array.isArray(inventory.storages)) return inventory.storages;
  return [];
}

function unwrapInventoryItem(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  if (isRecord(entry.item)) return entry.item;
  const data = isRecord(entry.data) ? entry.data : null;
  if (data && "itemType" in data) return data;
  return entry;
}

function isPlantInventoryItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const type = String(item.itemType ?? item.type ?? item.kind ?? "").toLowerCase();
  return type === "plant";
}

function getStackKey(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const qty = Number(item.quantity);
  if (!Number.isFinite(qty)) return null;
  const type = String(item.itemType ?? item.type ?? "").toLowerCase();
  const id =
    item.species ??
    item.seedSpecies ??
    item.decorId ??
    item.toolId ??
    item.eggId ??
    item.cropId ??
    item.produceId ??
    item.id ??
    null;
  if (!id) return null;
  return `${type}:${id}`;
}

function mergeInventoryItems(entries: unknown[]): UnknownRecord[] {
  const out: UnknownRecord[] = [];
  const stack = new Map<string, UnknownRecord>();

  for (const raw of entries) {
    const item = unwrapInventoryItem(raw);
    if (!isRecord(item)) continue;
    if (isPlantInventoryItem(item)) continue;
    const key = getStackKey(item);
    if (!key) {
      out.push(item);
      continue;
    }
    const qty = Number(item.quantity);
    if (!stack.has(key)) {
      const clone = { ...item, quantity: qty };
      stack.set(key, clone);
      out.push(clone);
    } else {
      const existing = stack.get(key);
      const base = Number(existing.quantity) || 0;
      existing.quantity = base + qty;
    }
  }
  return out;
}

function parseLastSeen(raw?: string | null): number {
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatLastSeen(raw?: string | null): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (deltaSeconds < 60) {
    return deltaSeconds <= 15 ? "Last seen just now" : `Last seen ${deltaSeconds}s`;
  }
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `Last seen ${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last seen ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d`;
}

function normalizeMessage(raw: unknown): DirectMessage | null {
  if (!isRecord(raw)) return null;
  const idRaw = raw.id ?? raw.message_id ?? raw.messageId ?? raw.msgId ?? raw.msg_id;
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(id)) return null;
  const bodyRaw =
    raw.body ?? raw.text ?? raw.content ?? raw.message ?? raw.msg ?? "";
  const body = bodyRaw == null ? "" : String(bodyRaw);
  const conversationIdRaw = raw.conversationId ?? raw.conversation_id ?? "";
  const senderIdRaw = raw.senderId ?? raw.sender_id ?? "";
  const recipientIdRaw = raw.recipientId ?? raw.recipient_id ?? "";
  const createdAtRaw = raw.createdAt ?? raw.created_at;
  const deliveredAtRaw = raw.deliveredAt ?? raw.delivered_at;
  const conversationId = conversationIdRaw ? String(conversationIdRaw) : "";
  const senderId = senderIdRaw ? String(senderIdRaw) : "";
  const recipientId = recipientIdRaw ? String(recipientIdRaw) : "";
  const createdAt = createdAtRaw ? String(createdAtRaw) : new Date().toISOString();
  const deliveredAt = deliveredAtRaw ? String(deliveredAtRaw) : "";
  const readAtRaw = raw.readAt ?? raw.read_at ?? null;
  const readAt = readAtRaw == null ? null : String(readAtRaw);
  return {
    id,
    conversationId,
    senderId,
    recipientId,
    body,
    createdAt,
    deliveredAt,
    readAt,
  };
}

function mapGroupToFriendSummary(group: GroupSummary): FriendSummary | null {
  if (!group) return null;
  const idRaw = (group as any).id ?? (group as any).groupId ?? (group as any).group_id ?? "";
  const id = String(idRaw ?? "").trim();
  if (!id) return null;
  const nameRaw = (group as any).name ?? (group as any).group_name ?? id;
  const memberCountRaw =
    (group as any).memberCount ??
    (group as any).member_count ??
    (group as any).membersCount ??
    (group as any).members_count ??
    null;
  const memberCount = Number(memberCountRaw);
  const lastEventAt =
    (group as any).updatedAt ??
    (group as any).updated_at ??
    (group as any).createdAt ??
    (group as any).created_at ??
    null;
  return {
    playerId: id,
    playerName: nameRaw ? String(nameRaw) : id,
    avatarUrl: null,
    avatar: null,
    lastEventAt: lastEventAt ? String(lastEventAt) : null,
    isOnline: false,
    roomId: null,
    isGroup: true,
    ...(Number.isFinite(memberCount) ? { memberCount: Math.max(0, Math.floor(memberCount)) } : {}),
  } as FriendSummary;
}

function normalizeGroupMessage(raw: unknown): DirectMessage | null {
  if (!isRecord(raw)) return null;
  const msg = isRecord((raw as any).message) ? ((raw as any).message as UnknownRecord) : raw;
  const groupIdRaw =
    (raw as any).groupId ??
    (raw as any).group_id ??
    (msg as any).groupId ??
    (msg as any).group_id ??
    "";
  const groupId = String(groupIdRaw ?? "").trim();
  if (!groupId) return null;
  const senderRaw =
    (msg as any).senderId ??
    (msg as any).sender_id ??
    (msg as any).playerId ??
    (msg as any).player_id ??
    (raw as any).senderId ??
    (raw as any).sender_id ??
    (raw as any).playerId ??
    (raw as any).player_id ??
    "";
  const senderId = senderRaw ? String(senderRaw) : "";
  const idRaw =
    (msg as any).id ??
    (msg as any).message_id ??
    (msg as any).messageId ??
    (msg as any).msgId ??
    (msg as any).msg_id ??
    "";
  let id = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(id)) {
    id = Date.now();
  }
  const bodyRaw =
    (msg as any).body ??
    (msg as any).text ??
    (msg as any).content ??
    (msg as any).message ??
    (msg as any).msg ??
    "";
  const body = bodyRaw == null ? "" : String(bodyRaw);
  const createdAtRaw =
    (msg as any).createdAt ??
    (msg as any).created_at ??
    (raw as any).createdAt ??
    (raw as any).created_at ??
    null;
  const createdAt = createdAtRaw ? String(createdAtRaw) : new Date().toISOString();
  const avatarUrlRaw =
    (msg as any).senderAvatarUrl ??
    (msg as any).sender_avatar_url ??
    (msg as any).avatarUrl ??
    (msg as any).avatar_url ??
    (raw as any).senderAvatarUrl ??
    (raw as any).sender_avatar_url ??
    (raw as any).avatarUrl ??
    (raw as any).avatar_url ??
    null;
  const avatarListRaw =
    (msg as any).senderAvatar ??
    (msg as any).sender_avatar ??
    (msg as any).avatar ??
    (msg as any).avatar_list ??
    (msg as any).avatarList ??
    (raw as any).senderAvatar ??
    (raw as any).sender_avatar ??
    (raw as any).avatar ??
    (raw as any).avatar_list ??
    (raw as any).avatarList ??
    null;
  const senderNameRaw =
    (msg as any).senderName ??
    (msg as any).sender_name ??
    (msg as any).playerName ??
    (msg as any).player_name ??
    (msg as any).name ??
    (raw as any).senderName ??
    (raw as any).sender_name ??
    (raw as any).playerName ??
    (raw as any).player_name ??
    (raw as any).name ??
    null;
  const normalized = {
    id,
    conversationId: groupId,
    senderId,
    recipientId: groupId,
    body,
    createdAt,
    deliveredAt: createdAt,
    readAt: null,
  } as DirectMessage & {
    senderAvatarUrl?: string;
    senderAvatar?: string[];
    senderName?: string;
  };
  if (avatarUrlRaw) normalized.senderAvatarUrl = String(avatarUrlRaw);
  if (Array.isArray(avatarListRaw)) {
    normalized.senderAvatar = avatarListRaw.map((entry) => String(entry));
  } else if (typeof avatarListRaw === "string" && avatarListRaw.trim()) {
    normalized.senderAvatar = [avatarListRaw.trim()];
  }
  if (senderNameRaw) normalized.senderName = String(senderNameRaw);
  return normalized;
}

async function getCurrentRoomId(): Promise<string | null> {
  try {
    const state = await Atoms.root.state.get();
    const roomId =
      state?.data?.roomId ??
      state?.fullState?.data?.roomId ??
      state?.roomId ??
      null;
    return roomId != null ? String(roomId) : null;
  } catch {
    return null;
  }
}
export class MessagesOverlay {
  private slot: HTMLDivElement = document.createElement("div");
  private btn: HTMLButtonElement = document.createElement("button");
  private badge: HTMLSpanElement = document.createElement("span");
  private panel: HTMLDivElement = document.createElement("div");
  private iconWrap: HTMLDivElement = document.createElement("div");

  private listEl: HTMLDivElement = document.createElement("div");
  private threadHeadEl: HTMLDivElement = document.createElement("div");
  private threadBodyEl: HTMLDivElement = document.createElement("div");
  private inputEl: HTMLInputElement = document.createElement("input");
  private sendBtn: HTMLButtonElement = document.createElement("button");
  private emojiWrapEl: HTMLDivElement = document.createElement("div");
  private emojiBtnEl: HTMLButtonElement = document.createElement("button");
  private emojiMenuEl: HTMLDivElement = document.createElement("div");
  private statusEl: HTMLDivElement = document.createElement("div");
  private attachmentsEl: HTMLDivElement = document.createElement("div");
  private charCountEl: HTMLDivElement = document.createElement("div");
  private maxTextLength = MAX_MESSAGE_LENGTH;
  private opts: MessagesOverlayOptions;
  private embedded = false;
  private mode: "dm" | "group" = "dm";
  private onThreadHeadRender?: (head: HTMLDivElement, selectedId: string | null) => void;
  private onListHeadRender?: (list: HTMLDivElement) => void;

  private myId: string | null = null;
  private friends: FriendSummary[] = [];
  private friendsFingerprint: string | null = null;
  private convs = new Map<string, ConversationState>();
  private convByConversationId = new Map<string, string>();
  private selectedId: string | null = null;
  private panelOpen = false;
  private stream: StreamHandle | null = null;
  private presenceStream: StreamHandle | null = null;
  private mo: MutationObserver | null = null;
  private unsubPlayerId: (() => void) | null = null;
  private keyTrapCleanup: KeyTrapCleanup | null = null;
  private panelHeadEl: HTMLDivElement | null = null;
  private panelDetached = false;
  private importPending = false;
  private importRestoreOpen = false;
  private importRestoreFriendOverlay = false;
  private importUnsubs: Array<() => void> = [];
  private pendingImportItems: ChatItem[] = [];
  private pendingRoomInvite: RoomInvitePayload | null = null;
  private rowById = new Map<string, FriendRowState>();
  private groupMemberCache = new Map<string, { name?: string; avatarUrl?: string; avatar?: string[] }>();
  private groupMembersLoaded = new Set<string>();
  private groupMembersByGroup = new Map<string, GroupMemberLite[]>();
  private groupOwnerByGroup = new Map<string, string>();
  private groupReadAt = new Map<string, number>();
  private groupReadStorageKey: string | null = null;
  private lastNotificationSoundAt = 0;
  private notificationSoundCooldownMs = 1500;
  private suppressSoundUntil = Date.now() + 10000; // Bloquer les sons pendant 10s au démarrage
  private groupIds = new Set<string>();
  private groupIdsLoaded = false;
  private myAvatarUrl: string | null = null;
  private myAvatar: string[] | null = null;
  private myName: string | null = null;
  private cosmeticBaseUrl: string | null = null;
  private cosmeticBasePromise: Promise<string> | null = null;
  private cosmeticBaseStartedAt: number | null = null;
  private cosmeticDebug = false;
  private threadFingerprintById = new Map<string, string>();
  private lastRenderedThreadKey: string | null = null;
  private handleFriendsRefresh = () => {
    if (!this.myId) return;
    void this.loadFriends(true);
  };
  private handleAuthUpdate = () => {
    // Petit délai pour s'assurer que l'API key est bien disponible
    setTimeout(() => {
      this.resetStream();
      this.resetPresenceStream();
      this.loadFriends(true);
      this.renderFriendList({ preserveScroll: true });
      if (this.selectedId) {
        this.renderThread({ preserveScroll: true, scrollToBottom: false });
      }
    }, 100);
  };

  private handleFriendRemoved = (event: Event) => {
    const playerId = (event as CustomEvent<{ playerId?: string }>).detail?.playerId;
    if (!playerId) return;
    const id = normalizeId(playerId);
    if (!id) return;
    this.convs.delete(id);
    this.convByConversationId.forEach((otherId, convId) => {
      if (normalizeId(otherId) === id) this.convByConversationId.delete(convId);
    });
    if (this.selectedId === id) {
      this.selectedId = null;
      this.renderThread();
    }
    this.renderFriendList({ preserveScroll: true });
  };
  private unreadRefreshInFlight = false;
  private lastUnreadRefreshAt = 0;
  private initialDmSyncDone = false;

  constructor(options: MessagesOverlayOptions = {}) {
    this.opts = options;
    this.embedded = Boolean(options.embedded);
    this.mode = options.mode ?? "dm";
    this.onThreadHeadRender = options.onThreadHeadRender;
    this.onListHeadRender = options.onListHeadRender;
    ensureMessagesOverlayStyle();
    this.slot = this.createSlot();
    this.btn = this.createButton();
    this.badge = this.createBadge();
    this.panel = this.createPanel();
    this.ensureCosmeticBase();
    this.installScrollGuards(this.listEl);
    this.installScrollGuards(this.threadBodyEl);
    this.threadBodyEl.addEventListener(
      "scroll",
      () => this.handleThreadScroll(),
      { passive: true },
    );
    window.addEventListener(FRIENDS_REFRESH_EVENT, this.handleFriendsRefresh as EventListener);
    window.addEventListener(FRIEND_REMOVED_EVENT, this.handleFriendRemoved as EventListener);
    window.addEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate as EventListener);
    this.keyTrapCleanup = installInputKeyTrap(this.panel, {
      onEnter: () => {
        void this.handleSendMessage();
      },
      shouldHandleEnter: (_target, active) => active === this.inputEl,
    });

    if (this.embedded) {
      this.panel.classList.add("qws-msg-panel-embedded");
      this.panel.style.display = "block";
    } else {
      this.installPanelDrag();
      this.btn.onclick = () => {
        if (this.importPending) return;
        this.setEmojiMenu(false);
        const next = this.panel.style.display !== "block";
        this.panel.style.display = next ? "block" : "none";
        this.panelOpen = next;
        if (next) {
          if (!this.panelDetached) {
            this.panel.style.position = "absolute";
            this.panel.style.left = "";
            this.panel.style.top = "";
            this.panel.style.right = "0";
            this.panel.style.bottom = "";
          }
          this.loadFriends(true);
          this.renderAttachments();
          this.updateAttachmentStatus();
          if (this.selectedId) {
            void this.selectConversation(this.selectedId);
          } else {
            this.renderThread();
          }
          this.fitPanelWithinViewport();
        }
        this.updateButtonBadge();
      };

      this.slot.append(this.btn, this.badge, this.panel);
      this.attach();
      this.observeDomForRelocation();

      window.addEventListener("pointerdown", (e) => {
        if (!this.panelOpen) return;
        const t = e.target as Node;
        if (!this.slot.contains(t)) {
          this.panel.style.display = "none";
          this.panelOpen = false;
        }
      });
    }
  }

  async init(): Promise<void> {
    const initial = await playerDatabaseUserId.get();
    this.setMyId(initial);
    playerDatabaseUserId
      .onChangeNow((next) => {
        this.setMyId(next);
      })
      .then((unsub) => {
        this.unsubPlayerId = unsub;
      })
      .catch(() => {});
  }

  destroy(): void {
    try {
      this.stream?.close();
    } catch {}
    try {
      this.presenceStream?.close();
    } catch {}
    try {
      this.mo?.disconnect();
    } catch {}
    try {
      this.keyTrapCleanup?.();
    } catch {}
    try {
      window.removeEventListener(FRIENDS_REFRESH_EVENT, this.handleFriendsRefresh as EventListener);
      window.removeEventListener(FRIEND_REMOVED_EVENT, this.handleFriendRemoved as EventListener);
      window.removeEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate as EventListener);
    } catch {}
    try {
      this.clearImportWatchers();
    } catch {}
    try {
      this.unsubPlayerId?.();
    } catch {}
    try {
      this.slot.remove();
    } catch {}
    if (this.embedded) {
      try {
        this.panel.remove();
      } catch {}
    }
  }

  mount(container: HTMLElement): void {
    if (!this.embedded) return;
    if (!container.contains(this.panel)) {
      container.appendChild(this.panel);
    }
  }

  setActive(active: boolean): void {
    if (!this.embedded) return;
    this.panelOpen = active;
    if (active && this.selectedId) {
      void this.markConversationRead(this.selectedId);
      this.updateFriendRow(this.selectedId);
      this.renderThread({ scrollToBottom: true });
    }
  }

  private setMyId(next: string | null): void {
    const normalized = next ? String(next) : null;
    if (this.myId === normalized) return;
    this.myId = normalized;
    this.groupMemberCache.clear();
    this.groupMembersLoaded.clear();
    this.groupMembersByGroup.clear();
    this.groupOwnerByGroup.clear();
    this.groupReadAt.clear();
    this.groupReadStorageKey = null;
    this.groupIds.clear();
    this.groupIdsLoaded = false;
    this.initialDmSyncDone = false; // Réinitialiser pour attendre la nouvelle sync DB
    if (this.mode === "group" && this.myId) {
      this.loadGroupReadState();
    }
    void this.refreshMyProfile();
    this.resetStream();
    this.resetPresenceStream();
    this.loadFriends(true);
    this.renderFriendList({ preserveScroll: true });
    this.renderThread();
  }

  private async refreshMyProfile(): Promise<void> {
    if (!this.myId) {
      this.myAvatar = null;
      this.myAvatarUrl = null;
      this.myName = null;
      return;
    }
    try {
      const state = await Atoms.root.state.get();
      const players = getPlayersArrayFromState(state);
      const normalized = String(this.myId);
      const me = players.find((p) => {
        const candidate =
          p?.databaseUserId ??
          p?.playerId ??
          p?.id ??
          "";
        return String(candidate) === normalized;
      });
      this.myName =
        typeof me?.name === "string" && me.name ? me.name : this.myName;
      this.myAvatarUrl =
        typeof me?.discordAvatarUrl === "string" ? me.discordAvatarUrl : this.myAvatarUrl;
      const avatarRaw =
        me?.cosmetic?.avatar ??
        null;
      this.myAvatar =
        Array.isArray(avatarRaw) && avatarRaw.length
          ? avatarRaw.map((entry) => String(entry))
          : null;
      this.renderThread();
    } catch {
      // ignore
    }
  }

  private nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  private logCosmetic(message: string, detail?: unknown): void {
    if (!this.cosmeticDebug) return;
    if (detail === undefined) {
      console.debug(`[MessagesOverlay][cosmetic] ${message}`);
    } else {
      console.debug(`[MessagesOverlay][cosmetic] ${message}`, detail);
    }
  }

  private computeThreadFingerprint(
    conv: ConversationState,
    options?: { label?: string; mode?: "dm" | "group" },
  ): string {
    const count = conv.messages.length;
    const label = options?.label ?? "";
    const mode = options?.mode ?? "dm";
    if (!count) {
      return [
        "empty",
        mode,
        label,
        conv.loading ? 1 : 0,
        conv.loadingOlder ? 1 : 0,
      ].join("|");
    }
    const first = conv.messages[0];
    const last = conv.messages[count - 1];
    const lastMeta = last && last.senderId === this.myId
      ? `${last.readAt ?? ""}|${last.deliveredAt ?? ""}`
      : "";
    return [
      mode,
      label,
      count,
      first?.id ?? "",
      last?.id ?? "",
      lastMeta,
      conv.loading ? 1 : 0,
      conv.loadingOlder ? 1 : 0,
    ].join("|");
  }

  private ensureCosmeticBase(): void {
    if (this.cosmeticBaseUrl || this.cosmeticBasePromise) return;
    this.cosmeticBaseStartedAt = this.nowMs();
    this.logCosmetic("Requesting cosmetic base URL");
    this.cosmeticBasePromise = MGAssets.base()
      .then((base) => {
        this.cosmeticBaseUrl = base;
        this.cosmeticBasePromise = null;
        const elapsed = this.cosmeticBaseStartedAt
          ? Math.round(this.nowMs() - this.cosmeticBaseStartedAt)
          : null;
        this.logCosmetic("Cosmetic base resolved", { base, ms: elapsed });
        this.populateCosmeticImages();
        return base;
      })
      .catch((error) => {
        this.cosmeticBasePromise = null;
        this.logCosmetic("Cosmetic base failed", error);
      });
  }

  private buildCosmeticUrl(name: string): string | null {
    if (!this.cosmeticBaseUrl) return null;
    const normalized = normalizeCosmeticName(name);
    if (!normalized) return null;
    const base = this.cosmeticBaseUrl.replace(/\/?$/, "/");
    return `${base}cosmetic/${normalized}`;
  }

  private populateCosmeticImages(): void {
    if (!this.cosmeticBaseUrl) return;
    const imgs = this.panel.querySelectorAll<HTMLImageElement>("img[data-cosmetic]");
    this.logCosmetic("Populating queued cosmetic images", { count: imgs.length });
    imgs.forEach((img) => {
      const name = img.dataset.cosmetic;
      if (!name) return;
      const url = this.buildCosmeticUrl(name);
      if (!url) {
        this.logCosmetic("Missing cosmetic URL", { name });
        return;
      }
      this.logCosmetic("Setting cosmetic image", { name, url });
      setImageSafe(img, url);
      img.removeAttribute("data-cosmetic");
    });
  }

  private buildAvatarElement(
    avatarList: string[] | null | undefined,
    fallbackUrl: string | null | undefined,
    label: string | null | undefined,
  ): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "qws-msg-avatar";

    const list = Array.isArray(avatarList)
      ? avatarList
          .map((entry) => normalizeCosmeticName(entry))
          .filter((entry): entry is string => !!entry)
      : [];

    if (list.length) {
      this.ensureCosmeticBase();
      list.forEach((entry, index) => {
        const img = document.createElement("img");
        img.className = "qws-msg-avatar-layer";
        img.decoding = "async";
        img.loading = "eager";
        img.style.zIndex = String(index + 1);
        if (this.cosmeticDebug) {
          const startedAt = this.nowMs();
          const labelValue = label ?? "unknown";
          img.addEventListener("load", () => {
            const elapsed = Math.round(this.nowMs() - startedAt);
            this.logCosmetic("Cosmetic layer loaded", { name: entry, label: labelValue, ms: elapsed });
          }, { once: true });
          img.addEventListener("error", () => {
            const elapsed = Math.round(this.nowMs() - startedAt);
            this.logCosmetic("Cosmetic layer failed", {
              name: entry,
              label: labelValue,
              ms: elapsed,
              src: img.currentSrc || img.src || null,
            });
          }, { once: true });
        }
        const url = this.buildCosmeticUrl(entry);
        if (url) {
          this.logCosmetic("Cosmetic layer set immediately", { name: entry, url });
          setImageSafe(img, url);
        } else {
          this.logCosmetic("Cosmetic layer deferred (base not ready)", { name: entry });
          img.dataset.cosmetic = entry;
        }
        wrap.appendChild(img);
      });
      return wrap;
    }

    if (fallbackUrl) {
      const img = document.createElement("img");
      img.decoding = "async";
      img.loading = "lazy";
      img.className = "qws-msg-avatar-photo";
      setImageSafe(img, fallbackUrl);
      wrap.appendChild(img);
      return wrap;
    }

    const fallbackLetter = (label ?? "?").trim().slice(0, 1).toUpperCase() || "?";
    wrap.textContent = fallbackLetter;
    return wrap;
  }

  private buildGroupAvatarRow(
    friend: FriendSummary | null,
    groupId: string,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "qws-msg-group-avatars-row";
    this.populateGroupAvatarRow(row, friend, groupId);
    return row;
  }

  private populateGroupAvatarRow(
    row: HTMLDivElement,
    friend: FriendSummary | null,
    groupId: string,
  ): void {
    const members = this.groupMembersByGroup.get(groupId) ?? [];
    const ownerIdRaw =
      this.groupOwnerByGroup.get(groupId) ??
      (friend as any)?.ownerId ??
      (friend as any)?.owner_id ??
      null;
    const ownerId = ownerIdRaw != null ? String(ownerIdRaw) : null;

    let ordered = members;
    if (ownerId) {
      const ownerIndex = members.findIndex((entry) => entry.id === ownerId);
      if (ownerIndex > 0) {
        const ownerEntry = members[ownerIndex];
        ordered = [ownerEntry, ...members.slice(0, ownerIndex), ...members.slice(ownerIndex + 1)];
      }
    }

    const unique: GroupMemberLite[] = [];
    const seen = new Set<string>();
    for (const entry of ordered) {
      if (!entry || !entry.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      unique.push(entry);
      if (unique.length >= 6) break;
    }

    const avatarKey = unique.length
      ? unique
          .map((entry) => {
            const avatarList = Array.isArray(entry.avatar) ? entry.avatar.join(",") : "";
            return `${entry.id}:${entry.avatarUrl ?? ""}:${avatarList}:${entry.name ?? ""}`;
          })
          .join("|")
      : "empty";

    if (row.dataset.avatarKey === avatarKey) {
      return;
    }
    row.dataset.avatarKey = avatarKey;
    row.innerHTML = "";

    if (unique.length === 0) {
      const anon = document.createElement("div");
      anon.className = "qws-msg-avatar qws-msg-group-avatar-anon";
      anon.textContent = "?";
      row.appendChild(anon);
      return;
    }

    for (const entry of unique) {
      const avatarEl = this.buildAvatarElement(
        null,
        entry.avatarUrl ?? null,
        entry.name ?? "",
      );
      row.appendChild(avatarEl);
    }
  }

  private createMessageAvatar(msg: DirectMessage, outgoing: boolean): HTMLDivElement {
    if (outgoing) {
      return this.buildAvatarElement(this.myAvatar, this.myAvatarUrl, this.myName ?? "You");
    }
    if (this.mode === "group") {
      const raw = msg as any;
      const avatarListRaw =
        raw.senderAvatar ??
        raw.sender_avatar ??
        raw.avatar ??
        raw.avatar_list ??
        raw.avatarList ??
        null;
      const avatarUrlRaw =
        raw.discordAvatarUrl ??
        raw.discord_avatar_url ??
        raw.senderAvatarUrl ??
        raw.sender_avatar_url ??
        raw.avatarUrl ??
        raw.avatar_url ??
        null;
      const senderNameRaw =
        raw.senderName ??
        raw.sender_name ??
        raw.playerName ??
        raw.player_name ??
        raw.name ??
        null;
      const avatarList = Array.isArray(avatarListRaw)
        ? avatarListRaw.map((entry) => String(entry))
        : null;
      const avatarUrl = avatarUrlRaw ? String(avatarUrlRaw) : null;
      const senderName = senderNameRaw ? String(senderNameRaw) : null;
      const cached = this.groupMemberCache.get(msg.senderId);
      const cachedList =
        cached?.avatar && cached.avatar.length ? cached.avatar : null;
      const finalAvatarList =
        avatarList && avatarList.length ? avatarList : cachedList;
      const finalAvatarUrl = avatarUrl ?? cached?.avatarUrl ?? null;
      const finalName = senderName ?? cached?.name ?? null;
      if (finalAvatarList || finalAvatarUrl || finalName) {
        return this.buildAvatarElement(
          finalAvatarList,
          finalAvatarUrl,
          finalName ?? msg.senderId,
        );
      }
      return this.buildAvatarElement(null, null, senderName ?? msg.senderId);
    }
    const friend = this.getFriendById(msg.senderId) ?? this.getFriendById(this.selectedId ?? "");
    return this.buildAvatarElement(
      friend?.avatar ?? null,
      friend?.avatarUrl ?? null,
      friend?.playerName ?? msg.senderId,
    );
  }

  private cacheGroupMemberFromMessage(msg: DirectMessage): void {
    if (this.mode !== "group") return;
    const raw = msg as any;
    const senderId = msg.senderId ? String(msg.senderId) : "";
    if (!senderId) return;
    const avatarUrlRaw =
      raw.discordAvatarUrl ??
      raw.discord_avatar_url ??
      raw.senderAvatarUrl ??
      raw.sender_avatar_url ??
      raw.avatarUrl ??
      raw.avatar_url ??
      null;
    const avatarListRaw =
      raw.senderAvatar ??
      raw.sender_avatar ??
      raw.avatar ??
      raw.avatar_list ??
      raw.avatarList ??
      null;
    const senderNameRaw =
      raw.senderName ??
      raw.sender_name ??
      raw.playerName ??
      raw.player_name ??
      raw.name ??
      null;
    const avatar = Array.isArray(avatarListRaw)
      ? avatarListRaw.map((entry) => String(entry))
      : typeof avatarListRaw === "string" && avatarListRaw.trim()
        ? [avatarListRaw.trim()]
        : undefined;
    const avatarUrl = avatarUrlRaw ? String(avatarUrlRaw) : undefined;
    const name = senderNameRaw ? String(senderNameRaw) : undefined;
    if (!avatar && !avatarUrl && !name) return;
    this.groupMemberCache.set(senderId, { avatar, avatarUrl, name });

    const groupId = String(msg.conversationId ?? msg.recipientId ?? "").trim();
    if (groupId) {
      const list = this.groupMembersByGroup.get(groupId) ?? [];
      const idx = list.findIndex((entry) => entry.id === senderId);
      const nextEntry: GroupMemberLite = {
        id: senderId,
        avatar: avatar ?? list[idx]?.avatar,
        avatarUrl: avatarUrl ?? list[idx]?.avatarUrl,
        name: name ?? list[idx]?.name,
      };
      if (idx >= 0) list[idx] = nextEntry;
      else list.push(nextEntry);
      this.groupMembersByGroup.set(groupId, list);
    }
  }

  private async ensureGroupMembers(groupId: string): Promise<void> {
    if (this.mode !== "group") return;
    if (!this.myId || !groupId) return;
    if (this.groupMembersLoaded.has(groupId)) return;
    this.groupMembersLoaded.add(groupId);
    try {
      const details = await fetchGroupDetails(groupId, this.myId);
      if (!details) {
        this.groupMembersLoaded.delete(groupId);
        return;
      }
      const groupMeta = (details as any).group ?? details;
      const ownerIdRaw = groupMeta?.ownerId ?? groupMeta?.owner_id ?? null;
      if (ownerIdRaw) {
        this.groupOwnerByGroup.set(groupId, String(ownerIdRaw));
      }
      const membersRaw =
        (details as any).members ??
        (details as any).groupMembers ??
        (details as any).membersList ??
        [];
      if (!Array.isArray(membersRaw)) {
        this.groupMembersLoaded.delete(groupId);
        return;
      }
      const membersLite: GroupMemberLite[] = [];
      for (const member of membersRaw) {
        if (!member) continue;
        const idRaw = (member as any).playerId ?? (member as any).player_id ?? (member as any).id ?? "";
        const id = String(idRaw ?? "").trim();
        if (!id) continue;
        const avatarUrlRaw =
          (member as any).discordAvatarUrl ??
          (member as any).discord_avatar_url ??
          (member as any).avatarUrl ??
          (member as any).avatar_url ??
          (member as any).discordAvatarUrl ??
          (member as any).discord_avatar_url ??
          null;
        const avatarListRaw =
          (member as any).avatar ??
          (member as any).avatar_list ??
          (member as any).avatarList ??
          (member as any).cosmeticAvatar ??
          (member as any).cosmetic_avatar ??
          null;
        const nameRaw =
          (member as any).name ??
          (member as any).playerName ??
          (member as any).player_name ??
          null;
        const avatar = Array.isArray(avatarListRaw)
          ? avatarListRaw.map((entry) => String(entry))
          : typeof avatarListRaw === "string" && avatarListRaw.trim()
            ? [avatarListRaw.trim()]
            : undefined;
        const avatarUrl = avatarUrlRaw ? String(avatarUrlRaw) : undefined;
        const name = nameRaw ? String(nameRaw) : undefined;
        const prev = this.groupMemberCache.get(id);
        this.groupMemberCache.set(id, {
          avatar: avatar ?? prev?.avatar,
          avatarUrl: avatarUrl ?? prev?.avatarUrl,
          name: name ?? prev?.name,
        });
        membersLite.push({
          id,
          avatar: avatar ?? prev?.avatar,
          avatarUrl: avatarUrl ?? prev?.avatarUrl,
          name: name ?? prev?.name,
        });
      }
      if (membersLite.length) {
        this.groupMembersByGroup.set(groupId, membersLite);
      }
      if (this.selectedId === groupId) {
        this.renderThread({ preserveScroll: true, scrollToBottom: false });
        // Notify callback that group details are loaded (for Add member button)
        if (this.onThreadHeadRender) {
          this.onThreadHeadRender(this.threadHeadEl, this.selectedId);
        }
      }
      // Update just the selected group row, no full list refresh
      this.updateFriendRow(groupId);
    } catch {
      this.groupMembersLoaded.delete(groupId);
    }
  }

  private loadGroupReadState(): void {
    if (this.mode !== "group" || !this.myId) return;
    const key = `qws-group-read:${this.myId}`;
    this.groupReadStorageKey = key;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (!parsed || typeof parsed !== "object") return;
      for (const [gid, ts] of Object.entries(parsed)) {
        const num = Number(ts);
        if (Number.isFinite(num)) this.groupReadAt.set(gid, num);
      }
    } catch {
      // ignore
    }
  }

  private saveGroupReadState(): void {
    if (this.mode !== "group" || !this.groupReadStorageKey) return;
    const payload: Record<string, number> = {};
    for (const [gid, ts] of this.groupReadAt.entries()) {
      if (Number.isFinite(ts)) payload[gid] = ts;
    }
    try {
      localStorage.setItem(this.groupReadStorageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private playNotificationSound(): void {
    if (!getFriendSettings().messageSoundEnabled) return;
    // En mode DM, attendre la première sync DB avant de jouer des sons
    if (this.mode === "dm" && !this.initialDmSyncDone) return;
    const now = Date.now();
    if (now < this.suppressSoundUntil) return;
    if (now - this.lastNotificationSoundAt < this.notificationSoundCooldownMs) return;
    this.lastNotificationSoundAt = now;
    void getAudioUrlSafe(MSG_NOTIFICATION_URL).then((url) => {
      audioPlayer.playAt(url, 0.2);
    });
  }

  private suppressNotificationSound(ms = 2500): void {
    const until = Date.now() + ms;
    if (until > this.suppressSoundUntil) {
      this.suppressSoundUntil = until;
    }
  }

  private createRoomInviteCard(invite: RoomInvitePayload, outgoing: boolean): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "qws-msg-item-card qws-msg-room-invite";

    const iconWrap = document.createElement("div");
    iconWrap.className = "qws-msg-item-icon";
    iconWrap.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const meta = document.createElement("div");
    meta.className = "qws-msg-item-meta";

    const title = document.createElement("div");
    title.className = "qws-msg-item-title";
    title.textContent = invite.roomName || "Join my room";

    const sub = document.createElement("div");
    sub.className = "qws-msg-item-sub";
    if (typeof invite.playersCount === "number" && typeof invite.maxPlayers === "number") {
      sub.textContent = `${invite.playersCount}/${invite.maxPlayers} players`;
    } else {
      sub.textContent = "Room invite";
    }

    meta.append(title, sub);

    const isDiscord = window.location.hostname.endsWith("discordsays.com");
    const isFull = typeof invite.playersCount === "number" && typeof invite.maxPlayers === "number" && invite.playersCount >= invite.maxPlayers;

    const btnWrap = document.createElement("div");
    btnWrap.className = "qws-msg-room-btn-wrap";

    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "qws-msg-room-join-btn";
    joinBtn.textContent = "Join";
    joinBtn.disabled = outgoing || isDiscord || isFull;

    if (outgoing) {
      joinBtn.title = "Cannot join your own room";
    } else if (isFull) {
      joinBtn.title = "Room is full";
    } else if (isDiscord) {
      joinBtn.title = "Cannot join rooms from Discord Activity";
    }

    joinBtn.addEventListener("click", () => {
      if (outgoing || isDiscord || isFull || !invite.roomId) return;
      const roomUrl = `${window.location.origin}/r/${encodeURIComponent(invite.roomId)}`;
      window.location.href = roomUrl;
    });

    btnWrap.appendChild(joinBtn);

    if (isDiscord) {
      const hint = document.createElement("div");
      hint.className = "qws-msg-room-hint";
      hint.textContent = "Can't join rooms on Discord Activity";
      btnWrap.appendChild(hint);
    }

    card.append(iconWrap, meta, btnWrap);
    return card;
  }

  private resetStream(): void {
    if (this.stream) {
      try {
        this.stream.close();
      } catch {}
      this.stream = null;
    }

    if (!this.myId) return;
    this.suppressNotificationSound(5000); // 5 secondes pour laisser le temps à la sync initiale
    if (this.mode === "group") {
      const es = openGroupsStream(this.myId, {
        onConnected: () => {
          this.suppressNotificationSound(5000); // 5 secondes pour laisser le temps à la sync initiale
        },
        onMessage: (payload) => this.handleIncomingGroupMessage(payload),
        onMemberAdded: () => void this.loadGroups(true),
        onMemberRemoved: (payload) => {
          const raw = payload as any;
          const gidRaw =
            raw?.groupId ??
            raw?.group_id ??
            raw?.id ??
            raw?.group?.id ??
            raw?.group?.groupId ??
            raw?.group?.group_id ??
            "";
          const memberRaw =
            raw?.memberId ??
            raw?.member_id ??
            raw?.removedId ??
            raw?.removed_id ??
            raw?.playerId ??
            raw?.player_id ??
            raw?.targetId ??
            raw?.target_id ??
            "";
          const gid = normalizeId(gidRaw);
          const memberId = normalizeId(memberRaw);

          if (this.myId && memberId && memberId === normalizeId(this.myId)) {
            if (gid) {
              this.convs.delete(gid);
              this.convByConversationId.forEach((otherId, convId) => {
                if (normalizeId(otherId) === gid) this.convByConversationId.delete(convId);
              });
              this.groupReadAt.delete(gid);
            }
            if (!gid || this.selectedId === gid) {
              this.selectedId = null;
              this.renderThread();
            }
            this.saveGroupReadState();
            this.updateButtonBadge();
            this.renderFriendList({ preserveScroll: true });
            try {
              window.dispatchEvent(new CustomEvent(GROUPS_REFRESH_EVENT));
            } catch {}
          }
          void this.loadGroups(true);
        },
        onUpdated: () => void this.loadGroups(true),
        onDeleted: (payload) => {
          const gidRaw = (payload as any)?.groupId ?? (payload as any)?.group_id ?? "";
          const gid = normalizeId(gidRaw);
          if (gid) {
            this.convs.delete(gid);
            this.convByConversationId.forEach((otherId, convId) => {
              if (normalizeId(otherId) === gid) this.convByConversationId.delete(convId);
            });
            if (this.selectedId === gid) {
              this.selectedId = null;
              this.renderThread();
            }
          }
          try {
            window.dispatchEvent(new CustomEvent(GROUPS_REFRESH_EVENT));
          } catch {}
          void this.loadGroups(true);
          this.renderFriendList({ preserveScroll: true });
        },
        onError: () => {},
      });
      this.stream = es ?? null;
      return;
    }
    const es = openMessagesStream(this.myId, {
      onConnected: () => {
        this.suppressNotificationSound(5000); // 5 secondes pour laisser le temps à la sync initiale
      },
      onMessage: (msg) => this.handleIncomingMessage(msg),
      onRead: (receipt) => this.handleReadReceipt(receipt),
      onError: () => {},
    });
    this.stream = es ?? null;
  }

  private resetPresenceStream(): void {
    if (this.mode === "group") return;
    if (this.presenceStream) {
      try {
        this.presenceStream.close();
      } catch {}
      this.presenceStream = null;
    }
    if (!this.myId) return;
    this.presenceStream = openPresenceStream(this.myId, (payload) => {
      this.handlePresence(payload);
    });
  }

  private handlePresence(payload: PresencePayload): void {
    if (this.mode === "group") return;
    const id = normalizeId(payload?.playerId);
    if (!id) return;
    let changed = false;
    const next = this.friends.map((friend) => {
      if (normalizeId(friend.playerId) !== id) return friend;
      const nextOnline = Boolean(payload?.online);
      const nextLastEventAt = payload?.lastEventAt ?? friend.lastEventAt;
      const nextRoomId =
        payload?.roomId !== undefined ? payload.roomId : friend.roomId ?? null;
      if (
        friend.isOnline === nextOnline &&
        friend.lastEventAt === nextLastEventAt &&
        (friend.roomId ?? null) === nextRoomId
      ) {
        return friend;
      }
      changed = true;
      return {
        ...friend,
        isOnline: nextOnline,
        lastEventAt: nextLastEventAt,
        roomId: nextRoomId,
      };
    });
    if (changed) {
      this.applyFriends(next, { forceRender: true });
    }
  }

  private ensureConversation(otherIdRaw: string): ConversationState {
    const otherId = normalizeId(otherIdRaw);
    let conv = this.convs.get(otherId);
    if (!conv) {
      conv = {
        otherId,
        conversationId: null,
        messages: [],
        unread: 0,
        lastMessageAt: 0,
        loaded: false,
        loading: false,
        loadingOlder: false,
        hasMore: true,
      };
      this.convs.set(otherId, conv);
    }
    return conv;
  }

  private updateConversationMap(conv: ConversationState): void {
    if (conv.conversationId) {
      this.convByConversationId.set(conv.conversationId, conv.otherId);
    }
  }

  private mergeMessages(
    existing: DirectMessage[],
    incoming: Array<DirectMessage | null | undefined>,
  ): DirectMessage[] {
    const map = new Map<number, DirectMessage>();
    for (const msg of existing) {
      if (typeof msg?.id === "number") map.set(msg.id, msg);
    }
    for (const msg of incoming) {
      if (typeof msg?.id === "number") map.set(msg.id, msg);
    }
    return Array.from(map.values()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  private updateUnreadFromMessages(conv: ConversationState): void {
    // En mode DM, on laisse refreshUnreadCounts gérer les compteurs depuis la DB
    if (this.mode !== "group") return;
    if (!this.myId) return;

    // En mode group, utiliser groupReadAt (localStorage) pour déterminer les messages lus
    const lastRead = this.groupReadAt.get(conv.otherId) ?? 0;
    let unread = 0;
    for (const msg of conv.messages) {
      if (msg.senderId === this.myId) continue;
      const msgTs = parseMessageTime(msg) ?? 0;
      const isRead = Number.isFinite(lastRead) && msgTs <= lastRead;
      if (!isRead) unread += 1;
    }
    conv.unread = unread;
  }

  private handleIncomingMessage(message: DirectMessage): void {
    if (!this.myId) return;
    const normalized = normalizeMessage(message);
    if (!normalized) return;
    const isOutgoing = normalized.senderId === this.myId;
    const otherId = isOutgoing ? normalized.recipientId : normalized.senderId;
    const conv = this.ensureConversation(otherId);
    conv.messages = this.mergeMessages(conv.messages, [normalized]);
    conv.conversationId = normalized.conversationId ?? conv.conversationId;
    conv.lastMessageAt = Math.max(
      conv.lastMessageAt,
      Number.isFinite(Date.parse(normalized.createdAt))
        ? Date.parse(normalized.createdAt)
        : 0,
    );
    this.updateConversationMap(conv);

    if (!isOutgoing) {
      const shouldMarkRead = this.panelOpen && this.selectedId === conv.otherId;
      if (shouldMarkRead) {
        void this.markConversationRead(conv.otherId);
      } else if (!normalized.readAt) {
        // En mode DM, attendre la première sync DB avant d'incrémenter les compteurs
        // pour éviter les notifications fantômes au démarrage
        if (this.mode === "dm" && !this.initialDmSyncDone) {
          // Skip - refreshUnreadCounts va synchroniser les compteurs depuis la DB
        } else {
          conv.unread += 1;
          this.playNotificationSound();
        }
      }
    }

    this.updateButtonBadge();
    if (!this.updateFriendRow(conv.otherId)) {
      this.renderFriendList({ preserveScroll: true });
    }
    if (this.selectedId === conv.otherId) {
      this.renderThread();
    }
  }

  private handleIncomingGroupMessage(payload: unknown): void {
    if (!this.myId) return;
    const normalized = normalizeGroupMessage(payload);
    if (!normalized) return;
    this.cacheGroupMemberFromMessage(normalized);
    const groupId = normalized.conversationId || normalized.recipientId;
    if (!groupId) return;
    if (this.groupIdsLoaded && !this.groupIds.has(groupId)) {
      return;
    }
    const conv = this.ensureConversation(groupId);
    conv.messages = this.mergeMessages(conv.messages, [normalized]);
    conv.conversationId = groupId;
    conv.lastMessageAt = Math.max(
      conv.lastMessageAt,
      Number.isFinite(Date.parse(normalized.createdAt))
        ? Date.parse(normalized.createdAt)
        : 0,
    );
    this.updateConversationMap(conv);

    const isOutgoing = normalized.senderId === this.myId;
    if (!isOutgoing) {
      const shouldMarkRead = this.panelOpen && this.selectedId === conv.otherId;
      const msgTsRaw = parseMessageTime(normalized) || Date.now();
      const lastRead = this.groupReadAt.get(conv.otherId) ?? 0;
      const alreadyRead = Number.isFinite(lastRead) && msgTsRaw <= lastRead;
      if (shouldMarkRead) {
        const nextRead = Math.max(lastRead, msgTsRaw);
        this.groupReadAt.set(conv.otherId, nextRead);
        this.saveGroupReadState();
        void this.markConversationRead(conv.otherId);
      } else if (!alreadyRead) {
        conv.unread += 1;
        this.playNotificationSound();
      }
    }

    this.updateButtonBadge();
    if (!this.updateFriendRow(conv.otherId)) {
      this.renderFriendList({ preserveScroll: true });
    }
    if (this.selectedId === conv.otherId) {
      this.renderThread();
    }
  }

  private handleReadReceipt(receipt: ReadReceipt): void {
    if (this.mode === "group") return;
    if (!receipt?.conversationId) return;
    const otherId = this.convByConversationId.get(receipt.conversationId);
    if (!otherId) return;
    const conv = this.convs.get(otherId);
    if (!conv) return;
    const upTo = Number(receipt.upToId);
    if (!Number.isFinite(upTo)) return;
    const readAt = receipt.readAt ?? new Date().toISOString();
    let changed = false;
    for (const msg of conv.messages) {
      if (msg.senderId === this.myId && msg.id <= upTo) {
        if (!msg.readAt) {
          msg.readAt = readAt;
          changed = true;
        }
      }
    }
    if (changed && this.selectedId === otherId) {
      this.renderThread();
    }
  }

  private computeFriendsFingerprint(friends: FriendSummary[]): string {
    const parts = friends.map((friend) => {
      const avatar = Array.isArray(friend.avatar) ? friend.avatar.map(String).join("|") : "";
      const memberCount =
        (friend as any).memberCount ??
        (friend as any).member_count ??
        (friend as any).membersCount ??
        (friend as any).members_count ??
        "";
      return [
        String(friend.playerId ?? ""),
        friend.playerName ?? "",
        friend.avatarUrl ?? "",
        avatar,
        memberCount,
        friend.isOnline ? "1" : "0",
        friend.lastEventAt ?? "",
      ].join("~");
    });
    parts.sort();
    return parts.join("||");
  }

  private applyFriends(next: FriendSummary[], opts?: { forceRender?: boolean }): void {
    this.friends = next;
    const fingerprint = this.computeFriendsFingerprint(next);
    if (!opts?.forceRender && this.friendsFingerprint === fingerprint) return;
    this.friendsFingerprint = fingerprint;
    this.renderFriendList({ preserveScroll: true });
    if (this.selectedId) {
      this.renderThread({ preserveScroll: true, scrollToBottom: false });
    }
  }

  private async loadFriends(force = false): Promise<void> {
    if (this.mode === "group") {
      await this.loadGroups(force);
      return;
    }
    if (!this.myId) return;
    const cached = getCachedFriendsSummary();
    if (cached.length) {
      this.applyFriends(cached, {
        forceRender: this.friendsFingerprint == null || this.friends.length === 0,
      });
    }

    try {
      const next = await fetchFriendsSummary(this.myId);
      this.applyFriends(next);
      if (force) {
        void this.refreshUnreadCounts(next);
      }
    } catch {
      if (!this.friends.length) {
        this.friends = [];
        this.friendsFingerprint = null;
        this.renderFriendList({ preserveScroll: true });
      } else if (this.selectedId) {
        this.renderThread({ preserveScroll: true, scrollToBottom: false });
      }
    }
  }

  private async loadGroups(_force = false): Promise<void> {
    if (!this.myId) return;
    try {
      const data = await fetchGroups(this.myId);
      const rawGroups = Array.isArray(data) ? data : [];
      for (const group of rawGroups) {
        const idRaw =
          (group as any).id ??
          (group as any).groupId ??
          (group as any).group_id ??
          "";
        const id = normalizeId(idRaw);
        if (!id) continue;

        const ownerIdRaw = (group as any).ownerId ?? (group as any).owner_id ?? null;
        if (ownerIdRaw) {
          this.groupOwnerByGroup.set(id, String(ownerIdRaw));
        }

        const previewRaw =
          (group as any).previewMembers ??
          (group as any).preview_members ??
          null;
        if (Array.isArray(previewRaw)) {
          const membersLite: GroupMemberLite[] = [];
          for (const entry of previewRaw) {
            if (!entry) continue;
            const memberIdRaw =
              (entry as any).playerId ??
              (entry as any).player_id ??
              (entry as any).id ??
              "";
            const memberId = String(memberIdRaw ?? "").trim();
            if (!memberId) continue;
            const nameRaw =
              (entry as any).playerName ??
              (entry as any).player_name ??
              (entry as any).name ??
              null;
            const avatarUrlRaw =
              (entry as any).discordAvatarUrl ??
              (entry as any).discord_avatar_url ??
              (entry as any).avatarUrl ??
              (entry as any).avatar_url ??
              null;
            membersLite.push({
              id: memberId,
              avatarUrl: avatarUrlRaw ? String(avatarUrlRaw) : undefined,
              name: nameRaw ? String(nameRaw) : undefined,
            });
          }
          this.groupMembersByGroup.set(id, membersLite);
        }
      }

      const mapped = rawGroups
        .map(mapGroupToFriendSummary)
        .filter((g): g is FriendSummary => !!g);
      this.applyFriends(mapped, { forceRender: true });
      this.groupIdsLoaded = true;
      const nextIds = new Set<string>(mapped.map((g) => normalizeId(g.playerId)));
      this.groupIds = nextIds;

      // Drop conversations/read markers for groups that no longer exist.
      let removedAny = false;
      for (const [id] of this.convs) {
        if (!nextIds.has(id)) {
          this.convs.delete(id);
          removedAny = true;
        }
      }
      for (const [convId, otherId] of this.convByConversationId) {
        if (!nextIds.has(otherId)) {
          this.convByConversationId.delete(convId);
          removedAny = true;
        }
      }
      for (const key of Array.from(this.groupReadAt.keys())) {
        if (!nextIds.has(key)) {
          this.groupReadAt.delete(key);
          removedAny = true;
        }
      }
      for (const key of Array.from(this.groupMembersByGroup.keys())) {
        if (!nextIds.has(key)) {
          this.groupMembersByGroup.delete(key);
          removedAny = true;
        }
      }
      for (const key of Array.from(this.groupOwnerByGroup.keys())) {
        if (!nextIds.has(key)) {
          this.groupOwnerByGroup.delete(key);
          removedAny = true;
        }
      }
      if (removedAny) {
        if (this.selectedId && !nextIds.has(this.selectedId)) {
          this.selectedId = null;
          this.renderThread();
        }
        this.saveGroupReadState();
        this.updateButtonBadge();
        this.renderFriendList({ preserveScroll: true });
      }
    } catch {
      if (!this.friends.length) {
        this.friends = [];
        this.friendsFingerprint = null;
        this.renderFriendList({ preserveScroll: true });
      } else if (this.selectedId) {
        this.renderThread({ preserveScroll: true, scrollToBottom: false });
      }
    } finally {
      // Débloquer le son pour les groupes après le chargement initial
      if (this.mode === "group" && this.groupIdsLoaded) {
        this.suppressSoundUntil = 0;
      }
    }
  }

  private async refreshUnreadCounts(friends: FriendSummary[]): Promise<void> {
    if (this.mode === "group") return;
    if (!this.myId) return;
    if (this.unreadRefreshInFlight) return;
    const now = Date.now();
    if (now - this.lastUnreadRefreshAt < 1500) return;
    this.unreadRefreshInFlight = true;
    this.lastUnreadRefreshAt = now;

    try {
      for (const friend of friends) {
        const otherId = normalizeId(friend?.playerId);
        if (!otherId) continue;
        const conv = this.ensureConversation(otherId);
        const data = await fetchMessagesThread(this.myId, otherId, {
          limit: THREAD_PAGE_LIMIT,
        });
        const normalized = Array.isArray(data)
          ? data.map(normalizeMessage).filter(Boolean)
          : [];
        if (!normalized.length) {
          conv.unread = 0;
          continue;
        }
        const unread = normalized.filter(
          (msg) => msg.senderId !== this.myId && !msg.readAt,
        ).length;
        const hasReadIncoming = normalized.some(
          (msg) => msg.senderId !== this.myId && !!msg.readAt,
        );
        const isExact =
          normalized.length < THREAD_PAGE_LIMIT || hasReadIncoming;
        conv.unread = isExact ? unread : Math.max(conv.unread, unread);
        conv.conversationId = normalized[0]?.conversationId ?? conv.conversationId;
        const lastTs = normalized.reduce((acc, msg) => {
          const ts = parseMessageTime(msg);
          return ts > acc ? ts : acc;
        }, 0);
        if (lastTs) {
          conv.lastMessageAt = Math.max(conv.lastMessageAt, lastTs);
        }
      }
    } catch {
      // ignore
    } finally {
      this.unreadRefreshInFlight = false;
      if (this.mode === "dm") {
        this.initialDmSyncDone = true;
        // Débloquer le son maintenant que la sync DB est terminée
        this.suppressSoundUntil = 0;
      }
      this.updateButtonBadge();
      this.renderFriendList({ preserveScroll: true });
    }
  }
  private async selectConversation(otherId: string): Promise<void> {
    this.selectedId = otherId;
    const conv = this.ensureConversation(otherId);
    const hadUnreadAtOpen = conv.unread > 0;
    this.updateSelection();
    this.renderThread();
    this.updateSendState();
    if (this.mode === "group") {
      void this.ensureGroupMembers(otherId);
    }

    if (this.myId && !conv.loaded && !conv.loading) {
      conv.loading = true;
      this.renderThread();
      const currentId = otherId;
      void (async () => {
        try {
          const data = this.mode === "group"
            ? await fetchGroupMessages(currentId, this.myId!, {
              limit: THREAD_INITIAL_LIMIT,
            })
            : await fetchMessagesThread(this.myId!, currentId, {
              limit: THREAD_INITIAL_LIMIT,
            });
          const normalized = Array.isArray(data)
            ? data
              .map((msg) =>
                this.mode === "group"
                  ? normalizeGroupMessage({ ...(msg as any), groupId: currentId })
                  : normalizeMessage(msg),
              )
              .filter(Boolean)
            : [];
          if (this.mode === "group") {
            normalized.forEach((msg) => this.cacheGroupMemberFromMessage(msg));
          }
          conv.messages = this.mergeMessages(conv.messages, normalized);
          if (conv.messages.length) {
            conv.conversationId = conv.messages[0]?.conversationId ?? conv.conversationId;
            conv.lastMessageAt = Math.max(
              conv.lastMessageAt,
              ...conv.messages.map((m) =>
                Number.isFinite(Date.parse(m.createdAt)) ? Date.parse(m.createdAt) : 0,
              ),
            );
          }
          conv.hasMore = normalized.length >= THREAD_INITIAL_LIMIT;
          conv.loaded = true;
          this.updateConversationMap(conv);
          this.updateUnreadFromMessages(conv);
        } catch {
        } finally {
          conv.loading = false;
          if (this.selectedId === currentId) {
            this.renderThread();
          }
          this.updateFriendRow(currentId);
          const shouldScroll = this.mode === "group" && (conv.unread > 0 || hadUnreadAtOpen);
          await this.markConversationRead(currentId);
          if (shouldScroll && this.selectedId === currentId) {
            this.scrollThreadToBottom();
          }
        }
      })();
    } else {
      const shouldScroll = this.mode === "group" && hadUnreadAtOpen;
      await this.markConversationRead(otherId);
      this.updateFriendRow(otherId);
      if (shouldScroll && this.selectedId === otherId) {
        this.scrollThreadToBottom();
      }
    }
  }

  private handleThreadScroll(): void {
    if (!this.selectedId) return;
    if (this.threadBodyEl.scrollTop > LOAD_OLDER_THRESHOLD) return;
    void this.loadOlderMessages();
  }

  private async loadOlderMessages(): Promise<void> {
    if (!this.myId || !this.selectedId) return;
    const conv = this.ensureConversation(this.selectedId);
    if (!conv.loaded || conv.loading || conv.loadingOlder) return;
    if (conv.hasMore === false) return;
    if (!conv.messages.length) return;

    const oldestId = conv.messages[0]?.id;
    if (!oldestId) {
      conv.hasMore = false;
      return;
    }

    conv.loadingOlder = true;
    this.renderThread({ preserveScroll: true, scrollToBottom: false });

    try {
      const data = this.mode === "group"
        ? await fetchGroupMessages(conv.otherId, this.myId, {
          beforeId: oldestId,
          limit: THREAD_PAGE_LIMIT,
        })
        : await fetchMessagesThread(this.myId, conv.otherId, {
          beforeId: oldestId,
          limit: THREAD_PAGE_LIMIT,
        });
      const normalized = Array.isArray(data)
        ? data
          .map((msg) =>
            this.mode === "group"
              ? normalizeGroupMessage({ ...(msg as any), groupId: conv.otherId })
              : normalizeMessage(msg),
          )
          .filter(Boolean)
        : [];
      if (this.mode === "group") {
        normalized.forEach((msg) => this.cacheGroupMemberFromMessage(msg));
      }
      if (!normalized.length) {
        conv.hasMore = false;
      } else {
        const olderFound = normalized.some((msg) => msg.id < oldestId);
        if (!olderFound) {
          conv.hasMore = false;
        }
      }
      conv.messages = this.mergeMessages(conv.messages, normalized);
      if (normalized.length < THREAD_PAGE_LIMIT) {
        conv.hasMore = false;
      }
    } catch {
      // ignore
    } finally {
      conv.loadingOlder = false;
      if (this.selectedId === conv.otherId) {
        this.renderThread({ preserveScroll: true, scrollToBottom: false });
      }
    }
  }

  private async markConversationRead(otherId: string): Promise<void> {
    if (!this.myId) return;
    const conv = this.convs.get(otherId);
    if (!conv) return;
    if (this.mode === "group") {
      conv.unread = 0;
      let lastReadAt = Date.now();
      if (conv.messages.length) {
        const last = conv.messages[conv.messages.length - 1];
        const ts = parseMessageTime(last);
        if (ts) lastReadAt = ts;
      }
      this.groupReadAt.set(otherId, lastReadAt);
      this.saveGroupReadState();
      this.updateButtonBadge();
      this.updateFriendRow(otherId);
      return;
    }
    const unreadMsgs = conv.messages.filter(
      (m) => m.senderId !== this.myId && !m.readAt,
    );
    if (!unreadMsgs.length) {
      conv.unread = 0;
      this.updateButtonBadge();
      this.updateFriendRow(otherId);
      return;
    }
    const last = unreadMsgs[unreadMsgs.length - 1];
    if (!last?.id) return;
    try {
      await markMessagesRead({
        playerId: this.myId,
        otherPlayerId: otherId,
        upToId: last.id,
      });
      const readAt = new Date().toISOString();
      for (const msg of conv.messages) {
        if (msg.senderId !== this.myId && msg.id <= last.id) {
          msg.readAt = readAt;
        }
      }
      conv.unread = 0;
      this.updateButtonBadge();
      this.updateFriendRow(otherId);
    } catch {
    }
  }

  private getFriendById(id: string): FriendSummary | null {
    return this.friends.find((f) => normalizeId(f.playerId) === normalizeId(id)) ?? null;
  }

  private buildFriendEntries(): Array<{
    id: string;
    friend: FriendSummary | null;
    unread: number;
    lastMessageAt: number;
    online: boolean;
    lastSeenAt: number;
  }> {
    const entries: Array<{
      id: string;
      friend: FriendSummary | null;
      unread: number;
      lastMessageAt: number;
      online: boolean;
      lastSeenAt: number;
    }> = [];

    const seen = new Set<string>();
    const shouldInclude = (id: string, conv?: ConversationState | null) => {
      if (this.mode === "group") return true;
      if (this.selectedId && id === this.selectedId) return true;
      if (!conv) return false;
      if (conv.lastMessageAt > 0) return true;
      if (conv.messages.length > 0) return true;
      return false;
    };
    for (const friend of this.friends) {
      const id = normalizeId(friend.playerId);
      if (!id) continue;
      const conv = this.convs.get(id);
      if (shouldInclude(id, conv)) {
        entries.push({
          id,
          friend,
          unread: conv?.unread ?? 0,
          lastMessageAt: conv?.lastMessageAt ?? 0,
          online: Boolean(friend.isOnline),
          lastSeenAt: parseLastSeen(friend.lastEventAt),
        });
        seen.add(id);
      }
    }

    if (this.mode !== "group") {
      for (const [id, conv] of this.convs) {
        if (seen.has(id)) continue;
        if (!shouldInclude(id, conv)) continue;
        entries.push({
          id,
          friend: null,
          unread: conv.unread,
          lastMessageAt: conv.lastMessageAt,
          online: false,
          lastSeenAt: 0,
        });
      }
    }

    entries.sort((a, b) => {
      if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
      const nameA = formatFriendName(a.friend, a.id).toLowerCase();
      const nameB = formatFriendName(b.friend, b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return entries;
  }

  private renderFriendList(options?: { preserveScroll?: boolean }): void {
    const preserveScroll = options?.preserveScroll ?? false;
    const scrollTop = preserveScroll ? this.listEl.scrollTop : 0;
    this.listEl.innerHTML = "";
    this.rowById.clear();
    this.listEl.classList.toggle("qws-msg-list-group", this.mode === "group");
    this.onListHeadRender?.(this.listEl);
    const entries = this.buildFriendEntries();
      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "qws-msg-empty";
        empty.textContent = this.mode === "group"
          ? "No groups yet."
          : "No conversations yet.";
        this.listEl.appendChild(empty);
        return;
      }

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "qws-msg-friend";
      if (entry.unread > 0) row.classList.add("unread");
      if (this.selectedId === entry.id) row.classList.add("active");

      let avatarWrap: HTMLDivElement | null = null;
      if (this.mode !== "group") {
        avatarWrap = document.createElement("div");
        avatarWrap.className = "qws-msg-friend-avatar-wrap";
        const avatar = document.createElement("div");
        avatar.className = "qws-msg-friend-avatar";
        if (entry.friend?.avatarUrl) {
          const img = document.createElement("img");
          img.className = "qws-msg-avatar-photo";
          img.decoding = "async";
          img.loading = "lazy";
          setImageSafe(img, entry.friend.avatarUrl);
          img.alt = formatFriendName(entry.friend, entry.id);
          img.width = 32;
          img.height = 32;
          avatar.appendChild(img);
        } else {
          const fallback = document.createElement("span");
          fallback.textContent = formatFriendName(entry.friend, entry.id)
            .charAt(0)
            .toUpperCase();
          avatar.appendChild(fallback);
        }

        avatarWrap.appendChild(avatar);
      }

      const meta = document.createElement("div");
      meta.className = "qws-msg-friend-meta";
      const name = document.createElement("div");
      name.className = "qws-msg-friend-name";
      name.textContent = formatFriendName(entry.friend, entry.id);
      const sub =
        this.mode === "group"
          ? this.buildGroupAvatarRow(entry.friend, entry.id)
          : (() => {
              const el = document.createElement("div");
              el.className = "qws-msg-friend-sub";
              el.textContent = formatStatus(entry.friend, this.mode);
              return el;
            })();
      meta.append(name, sub);

      let dot: HTMLSpanElement | null = null;
      if (entry.friend?.isOnline && this.mode !== "group" && avatarWrap) {
        dot = document.createElement("span");
        dot.className = "qws-msg-status-dot";
        avatarWrap.appendChild(dot);
      }

      if (avatarWrap) {
        row.append(avatarWrap, meta);
      } else {
        row.append(meta);
      }

      let badge: HTMLSpanElement | null = null;
      if (entry.unread > 0) {
        badge = document.createElement("span");
        badge.className = "qws-msg-unread-badge";
        badge.textContent = String(entry.unread);
        row.appendChild(badge);
      }

      let groupCountBadge: HTMLSpanElement | null = null;
      if (this.mode === "group") {
        const count = getGroupMemberCount(entry.friend);
        if (count !== null) {
          groupCountBadge = document.createElement("span");
          groupCountBadge.className = "qws-msg-group-count";
          groupCountBadge.textContent = `${count}/12`;
          row.appendChild(groupCountBadge);
        }
      }

      row.addEventListener("click", () => {
        void this.selectConversation(entry.id);
      });

      this.rowById.set(entry.id, {
        row,
        badge,
        avatarWrap,
        statusDot: dot,
        sub,
        groupCountBadge,
      });

      this.listEl.appendChild(row);
    }

    if (preserveScroll) {
      this.listEl.scrollTop = scrollTop;
    }
  }

  private renderThread(options?: { preserveScroll?: boolean; scrollToBottom?: boolean }): void {
    const preserveScroll = options?.preserveScroll ?? false;
    const prevScrollHeight = preserveScroll ? this.threadBodyEl.scrollHeight : 0;
    const prevScrollTop = preserveScroll ? this.threadBodyEl.scrollTop : 0;

    if (!this.selectedId) {
      this.threadHeadEl.innerHTML = "";
      this.threadBodyEl.innerHTML = "";
      this.statusEl.textContent = "";
      this.lastRenderedThreadKey = null;
      const empty = document.createElement("div");
      empty.className = "qws-msg-empty";
      empty.textContent = this.mode === "group"
        ? "Select a group to start chatting."
        : "Select a friend to start chatting.";
      this.threadBodyEl.appendChild(empty);
      this.setInputState(false);
      this.onThreadHeadRender?.(this.threadHeadEl, null);
      return;
    }

    const threadKey = `${this.mode}:${this.selectedId}`;
    const conv = this.ensureConversation(this.selectedId);
    const friend = this.getFriendById(this.selectedId);
    const label = formatFriendName(friend, this.selectedId);
    const fingerprint = this.computeThreadFingerprint(conv, { label, mode: this.mode });
    const prevFingerprint = this.threadFingerprintById.get(threadKey);
    if (
      prevFingerprint === fingerprint &&
      !conv.loading &&
      !conv.loadingOlder &&
      this.lastRenderedThreadKey === threadKey
    ) {
      return;
    }
    this.threadFingerprintById.set(threadKey, fingerprint);
    this.lastRenderedThreadKey = threadKey;

    this.threadHeadEl.innerHTML = "";
    this.threadBodyEl.innerHTML = "";
    this.statusEl.textContent = "";

    const title = document.createElement("div");
    title.textContent = label;
    title.style.fontWeight = "700";
    this.threadHeadEl.appendChild(title);
    if (this.onThreadHeadRender) {
      this.onThreadHeadRender(this.threadHeadEl, this.selectedId);
    }
    if (conv.loading && !conv.messages.length) {
      const loading = document.createElement("div");
      loading.className = "qws-msg-loading";
      const dots = document.createElement("div");
      dots.className = "qws-msg-loading-dots";
      dots.innerHTML = "<span></span><span></span><span></span>";
      loading.appendChild(dots);
      this.threadBodyEl.appendChild(loading);
      this.setInputState(true);
      return;
    }

    if (!conv.messages.length) {
      const empty = document.createElement("div");
      empty.className = "qws-msg-empty";
      empty.textContent = "No messages yet.";
      this.threadBodyEl.appendChild(empty);
      this.setInputState(true);
      return;
    }

    const messages = conv.messages.slice();
    if (conv.loadingOlder) {
      const loading = document.createElement("div");
      loading.className = "qws-msg-loading";
      const dots = document.createElement("div");
      dots.className = "qws-msg-loading-dots";
      dots.innerHTML = "<span></span><span></span><span></span>";
      loading.appendChild(dots);
      this.threadBodyEl.appendChild(loading);
    }
    if (conv.loading) {
      const loading = document.createElement("div");
      loading.className = "qws-msg-loading";
      const dots = document.createElement("div");
      dots.className = "qws-msg-loading-dots";
      dots.innerHTML = "<span></span><span></span><span></span>";
      loading.appendChild(dots);
      this.threadBodyEl.appendChild(loading);
    }
    const GAP_MS = 10 * 60 * 1000;
    let lastTs = 0;
    let lastDayKey = "";

    for (const msg of messages) {
      const ts = parseMessageTime(msg);
      if (ts) {
        const date = new Date(ts);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if (dayKey !== lastDayKey) {
          this.threadBodyEl.appendChild(createSeparator(formatDayLabel(date)));
          lastDayKey = dayKey;
        } else if (lastTs && ts - lastTs >= GAP_MS) {
          this.threadBodyEl.appendChild(createSeparator(formatTimeLabel(date)));
        }
        lastTs = ts;
      }

      const parsed = decodeItemMessage(msg.body ?? "");
      const roomInvite = decodeRoomInvite(msg.body ?? "");
      const itemPayloads =
        parsed?.items && parsed.items.length
          ? parsed.items
          : null;
      const messageText = roomInvite
        ? (typeof roomInvite.message === "string" ? roomInvite.message : "")
        : (typeof parsed?.message === "string" ? parsed.message : msg.body ?? "");
      const hasMessage = messageText.trim().length > 0;

      const bubble = document.createElement("div");
      bubble.className = "qws-msg-bubble";
      const outgoing = msg.senderId === this.myId;
      bubble.classList.add(outgoing ? "outgoing" : "incoming");
      if (!hasMessage && (itemPayloads || roomInvite)) bubble.classList.add("no-text");
      const content = document.createElement("div");
      content.className = "qws-msg-content";
      content.appendChild(linkifyText(messageText));
      if (!hasMessage) {
        content.style.display = "none";
      }

      let itemStack: HTMLDivElement | null = null;
      if (itemPayloads && itemPayloads.length) {
        itemStack = document.createElement("div");
        itemStack.className = "qws-msg-item-stack";
        for (const item of itemPayloads) {
          itemStack.appendChild(createItemCard(item));
        }
      }

      let roomCard: HTMLDivElement | null = null;
      if (roomInvite) {
        roomCard = this.createRoomInviteCard(roomInvite, outgoing);
      }

      if (itemStack) {
        if (itemPayloads && itemPayloads.length > 1) {
          bubble.classList.add("has-multi-items");
        }
        bubble.append(content, itemStack);
      } else if (roomCard) {
        bubble.append(content, roomCard);
      } else {
        bubble.append(content);
      }

      const avatarEl = this.createMessageAvatar(msg, outgoing);

      const row = document.createElement("div");
      row.className = "qws-msg-row";
      row.classList.add(outgoing ? "outgoing" : "incoming");
      if (outgoing) {
        row.append(bubble, avatarEl);
      } else {
        row.append(avatarEl, bubble);
      }
      this.threadBodyEl.appendChild(row);
    }

    const last = messages[messages.length - 1];
    if (last && last.senderId === this.myId) {
      const hintText = last.readAt
        ? "Read"
        : last.deliveredAt
          ? "Delivered"
          : "";
      if (hintText) {
        const hint = document.createElement("div");
        hint.className = "qws-msg-read-hint";
        hint.textContent = hintText;
        this.threadBodyEl.appendChild(hint);
      }
    }

    this.setInputState(true);
    if (preserveScroll) {
      requestAnimationFrame(() => {
        const newHeight = this.threadBodyEl.scrollHeight;
        this.threadBodyEl.scrollTop = newHeight - prevScrollHeight + prevScrollTop;
      });
    } else if (options?.scrollToBottom !== false) {
      this.scrollThreadToBottom();
    }
  }

  private scrollThreadToBottom(): void {
    requestAnimationFrame(() => {
      this.threadBodyEl.scrollTop = this.threadBodyEl.scrollHeight;
    });
  }

  private canSend(): boolean {
    if (!this.selectedId) return false;
    const hasText = !!this.inputEl.value.trim();
    const hasItem = this.pendingImportItems.length > 0;
    const hasRoomInvite = !!this.pendingRoomInvite;
    return hasText || hasItem || hasRoomInvite;
  }

  private buildMessageBody(): { body: string; usedItems: boolean; usedRoomInvite?: boolean } | null {
    const text = this.inputEl.value.trim();
    const pendingItems = this.pendingImportItems.slice(0, MAX_ATTACHMENTS);
    const pendingRoom = this.pendingRoomInvite;

    if (!text && !pendingItems.length && !pendingRoom) return null;

    if (pendingRoom) {
      const payload: RoomInvitePayload = {
        ...pendingRoom,
        message: text || pendingRoom.message,
      };
      try {
        const body = encodeRoomInvite(payload);
        return { body, usedItems: false, usedRoomInvite: true };
      } catch {
        return null;
      }
    }

    if (!pendingItems.length) {
      return { body: text, usedItems: false };
    }

    const payload: ItemMessagePayload = {
      v: 1,
      kind: "item",
      message: text || "",
      items: pendingItems,
    };
    try {
      const body = encodeItemMessage(payload);
      return { body, usedItems: true };
    } catch {
      return null;
    }
  }

  private computeMaxTextLength(): number {
    const pendingItems = this.pendingImportItems.slice(0, MAX_ATTACHMENTS);
    if (!pendingItems.length) return MAX_MESSAGE_LENGTH;
    let lo = 0;
    let hi = MAX_MESSAGE_LENGTH;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const payload: ItemMessagePayload = {
        v: 1,
        kind: "item",
        message: "x".repeat(mid),
        items: pendingItems,
      };
      let body = "";
      try {
        body = encodeItemMessage(payload);
      } catch {
        body = "";
      }
      if (body.length <= MAX_MESSAGE_LENGTH && body.length > 0) {
        best = mid;
        lo = mid + 1;
      } else if (body.length <= MAX_MESSAGE_LENGTH && body.length === 0) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  private recomputeInputLimit(): void {
    this.maxTextLength = this.computeMaxTextLength();
    this.inputEl.maxLength = this.maxTextLength;
    if (this.inputEl.value.length > this.maxTextLength) {
      this.inputEl.value = this.inputEl.value.slice(0, this.maxTextLength);
    }
    this.updateSendState();
  }

  private getMessageLength(): number {
    const built = this.buildMessageBody();
    return built ? built.body.length : 0;
  }

  private updateCharCount(length?: number): void {
    const len = typeof length === "number" ? length : this.getMessageLength();
    this.charCountEl.textContent = `${len}/${MAX_MESSAGE_LENGTH}`;
    this.charCountEl.classList.toggle("over", len > MAX_MESSAGE_LENGTH);
  }

  private updateSendState(): void {
    const length = this.getMessageLength();
    const overLimit = length > MAX_MESSAGE_LENGTH;
    this.sendBtn.disabled = this.inputEl.disabled || !this.canSend() || overLimit;
    this.inputEl.placeholder = (this.pendingImportItems.length > 0 || this.pendingRoomInvite)
      ? "Add a message (optional)..."
      : "Type a message...";
    this.updateCharCount(length);
    if (!overLimit && this.statusEl.textContent.startsWith("Message too long")) {
      this.statusEl.textContent = "";
      this.updateAttachmentStatus();
    }
  }

  private updateAttachmentStatus(): void {
    const count = this.pendingImportItems.length;
    if (count > 0) {
      if (!this.statusEl.textContent || this.statusEl.textContent.startsWith(ATTACHMENT_STATUS_PREFIX)) {
        this.statusEl.textContent = `${ATTACHMENT_STATUS_PREFIX} ${count}/${MAX_ATTACHMENTS}`;
      }
      return;
    }
    if (this.pendingRoomInvite) {
      if (!this.statusEl.textContent || this.statusEl.textContent.startsWith(ATTACHMENT_STATUS_PREFIX) || this.statusEl.textContent.includes("Room invite")) {
        const roomName = this.pendingRoomInvite.roomName || "Room";
        const playerInfo = typeof this.pendingRoomInvite.playersCount === "number" && typeof this.pendingRoomInvite.maxPlayers === "number"
          ? ` (${this.pendingRoomInvite.playersCount}/${this.pendingRoomInvite.maxPlayers})`
          : "";
        this.statusEl.textContent = `Room invite attached: ${roomName}${playerInfo}`;
      }
      return;
    }
    if (this.statusEl.textContent.startsWith(ATTACHMENT_STATUS_PREFIX) || this.statusEl.textContent.includes("Room invite")) {
      this.statusEl.textContent = "";
    }
  }

  private renderAttachments(): void {
    this.attachmentsEl.innerHTML = "";
    if (!this.pendingImportItems.length) {
      this.attachmentsEl.style.display = "none";
      this.recomputeInputLimit();
      return;
    }
    this.attachmentsEl.style.display = "flex";
    this.pendingImportItems.forEach((item, index) => {
      const chip = document.createElement("div");
      chip.className = "qws-msg-attachment";

      const label = document.createElement("span");
      label.className = "qws-msg-attachment-label";
      label.textContent = getChatItemLabel(item);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "qws-msg-attachment-remove";
      remove.textContent = "×";
      remove.title = "Remove";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        this.pendingImportItems.splice(index, 1);
        this.renderAttachments();
        this.updateSendState();
        this.updateAttachmentStatus();
      });

      chip.append(label, remove);
      this.attachmentsEl.appendChild(chip);
    });
    this.recomputeInputLimit();
  }

  private setInputState(enabled: boolean): void {
    this.inputEl.disabled = !enabled;
    this.updateSendState();
  }

  private async handleImportItems(): Promise<void> {
    if (this.importPending) return;
    if (this.pendingImportItems.length >= MAX_ATTACHMENTS) {
      this.statusEl.textContent = `You can attach up to ${MAX_ATTACHMENTS} items.`;
      return;
    }
    this.pendingRoomInvite = null;
    this.beginImportSuspend();
    try {
      const raw = await Atoms.inventory.myInventory.get();
      const items = extractInventoryItems(raw);
      const storages = extractStorages(raw);
      const storageItems: unknown[] = [];
      for (const storage of storages) {
        const storageList = Array.isArray(storage?.items) ? storage.items : [];
        storageItems.push(...storageList);
      }

      const merged = mergeInventoryItems([...items, ...storageItems]);
      const favoritedItemIds = Array.isArray(raw?.favoritedItemIds)
        ? raw.favoritedItemIds
        : Array.isArray(raw?.inventory?.favoritedItemIds)
          ? raw.inventory.favoritedItemIds
          : [];

      await fakeInventoryShow(
        { items: merged, favoritedItemIds },
        { open: true },
      );

      this.startImportResumeWatchers();
      await this.resetImportSelection();

      try {
        const [currentIndex, modalVal] = await Promise.all([
          Atoms.inventory.myValidatedSelectedItemIndex.get(),
          Atoms.ui.activeModal.get(),
        ]);
        if (
          (typeof currentIndex === "number" &&
            Number.isInteger(currentIndex) &&
            currentIndex >= 0) ||
          !isInventoryOpen(modalVal)
        ) {
          this.resumeFromImport();
        }
      } catch {}
    } catch (error) {
      console.error("[MessagesOverlay] import items failed", error);
      this.statusEl.textContent = "Unable to import inventory.";
      this.resumeFromImport();
    }
  }

  private async handleRoomInvite(): Promise<void> {
    if (this.pendingRoomInvite) {
      this.statusEl.textContent = "You already have a pending room invite.";
      return;
    }

    try {
      const roomId = await getCurrentRoomId();
      if (!roomId) {
        this.statusEl.textContent = "You are not in a room.";
        return;
      }

      const maxPlayers = 6;
      let playersCount = 0;
      try {
        const numPlayers = await Atoms.server.numPlayers.get();
        playersCount = Math.max(1, Math.min(6, Math.floor(Number(numPlayers))));
      } catch {
        playersCount = 1;
      }

      if (playersCount >= maxPlayers) {
        this.statusEl.textContent = "Your room is full. Cannot invite.";
        return;
      }

      const state = await Atoms.root.state.get();
      const players = getPlayersArrayFromState(state);
      const myPlayerId = await Atoms.player.playerId.get();
      const myPlayer = players.find((p) => String(p?.id ?? "") === String(myPlayerId ?? ""));
      const roomName = myPlayer?.name ? `${myPlayer.name}'s room` : undefined;

      this.pendingImportItems = [];
      this.renderAttachments();

      this.pendingRoomInvite = {
        v: 1,
        kind: "room",
        roomId,
        roomName,
        playersCount,
        maxPlayers,
      };

      this.updateAttachmentStatus();
      this.updateSendState();
    } catch (error) {
      console.error("[MessagesOverlay] room invite failed", error);
      this.statusEl.textContent = "Unable to attach room invite.";
    }
  }

  private beginImportSuspend(): void {
    if (this.importPending) return;
    this.importPending = true;
    this.importRestoreOpen = this.panelOpen;
    this.panel.style.display = "none";
    this.panelOpen = false;
    this.importRestoreFriendOverlay = !!document.querySelector(".qws-fo-panel.open");
    if (this.importRestoreFriendOverlay) {
      window.dispatchEvent(new CustomEvent("qws-friend-overlay-close"));
    }
  }

  private startImportResumeWatchers(): void {
    if (!this.importPending) return;
    this.clearImportWatchers();

    Atoms.inventory.myValidatedSelectedItemIndex
      .onChange((next) => {
        if (!this.importPending) return;
        if (typeof next === "number" && Number.isInteger(next) && next >= 0) {
          void this.handleImportSelection(next);
        }
      })
      .then((unsub) => {
        if (!this.importPending) {
          try {
            unsub();
          } catch {}
          return;
        }
        this.importUnsubs.push(unsub);
      })
      .catch(() => {});

    Atoms.ui.activeModal
      .onChange((next) => {
        if (!this.importPending) return;
        if (!isInventoryOpen(next)) {
          this.resumeFromImport();
        }
      })
      .then((unsub) => {
        if (!this.importPending) {
          try {
            unsub();
          } catch {}
          return;
        }
        this.importUnsubs.push(unsub);
      })
      .catch(() => {});
  }

  private clearImportWatchers(): void {
    if (!this.importUnsubs.length) return;
    for (const unsub of this.importUnsubs) {
      try {
        unsub();
      } catch {}
    }
    this.importUnsubs = [];
  }

  private async handleImportSelection(index: number): Promise<void> {
    if (!this.importPending) return;
    try {
      const inv = await Atoms.inventory.myInventory.get();
      const items = Array.isArray(inv?.items)
        ? inv.items
        : Array.isArray(inv?.inventory?.items)
          ? inv.inventory.items
          : [];
      const item = index >= 0 && index < items.length ? items[index] : null;
      const normalized = normalizeChatItem(item);
      console.log("[MessagesOverlay] Selected import item:", normalized ?? item);
      if (normalized) {
        if (this.pendingImportItems.length >= MAX_ATTACHMENTS) {
          this.statusEl.textContent = `You can attach up to ${MAX_ATTACHMENTS} items.`;
        } else {
          this.pendingImportItems.push(normalized);
          this.renderAttachments();
          this.updateAttachmentStatus();
          this.updateSendState();
        }
      } else {
        this.statusEl.textContent = "Unsupported item for chat.";
        this.updateAttachmentStatus();
        this.updateSendState();
      }
    } catch (err) {
      console.warn("[MessagesOverlay] Unable to read selected item", err);
    }
    try {
      await closeInventoryPanel();
    } catch {}
    this.resumeFromImport();
  }

  private async resetImportSelection(): Promise<void> {
    try {
      await Atoms.inventory.mySelectedItemName.set(null);
    } catch {}
    try {
      await Atoms.inventory.myValidatedSelectedItemIndex.set(null);
    } catch {}
    try {
      await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
    } catch {}
  }

  private resumeFromImport(): void {
    if (!this.importPending) return;
    this.clearImportWatchers();
    this.importPending = false;
    if (this.importRestoreFriendOverlay) {
      this.importRestoreFriendOverlay = false;
      window.dispatchEvent(new CustomEvent("qws-friend-overlay-open"));
    }
    const shouldRestore = this.embedded ? true : this.importRestoreOpen;
    if (shouldRestore) {
      this.panel.style.display = "block";
      if (!this.embedded) {
        this.panelOpen = true;
      }
      this.renderThread();
      if (!this.embedded) {
        this.fitPanelWithinViewport();
      }
      this.renderAttachments();
      this.updateSendState();
      this.updateAttachmentStatus();
    }
  }

  openConversation(otherId: string): void {
    if (!otherId) return;
    const conv = this.ensureConversation(otherId);
    if (!conv.lastMessageAt) {
      conv.lastMessageAt = Date.now();
    }
    this.updateConversationMap(conv);
    void this.selectConversation(otherId);
    this.renderFriendList({ preserveScroll: true });
  }

  refresh(): void {
    this.loadFriends(true);
    this.renderFriendList({ preserveScroll: true });
    if (this.selectedId) {
      this.renderThread({ preserveScroll: true, scrollToBottom: false });
    }
  }

  rerenderList(): void {
    this.renderFriendList({ preserveScroll: true });
  }

  getGroupOwner(groupId: string): string | null {
    if (this.mode !== "group") return null;
    return this.groupOwnerByGroup.get(groupId) ?? null;
  }

  private updateButtonBadge(): void {
    let total = 0;
    for (const conv of this.convs.values()) total += conv.unread;
    if (!this.embedded) {
      this.badge.textContent = total ? String(total) : "";
      style(this.badge, { display: total ? "inline-flex" : "none" });
    }
    this.opts.onUnreadChange?.(total);
  }

  private adjustBubbleWidth(
    bubble: HTMLDivElement,
    content: HTMLDivElement,
    timeEl: HTMLDivElement,
    show: boolean,
    itemEl?: HTMLElement | null,
  ): void {
    if (!show) {
      bubble.style.minWidth = "";
      return;
    }
    requestAnimationFrame(() => {
      const parent = bubble.parentElement as HTMLElement | null;
      const maxWidth = parent ? parent.clientWidth * 0.75 : Infinity;
      const styles = getComputedStyle(bubble);
      const pad =
        (parseFloat(styles.paddingLeft) || 0) +
        (parseFloat(styles.paddingRight) || 0);
      const widths: number[] = [];
      if (content.offsetParent !== null) widths.push(content.scrollWidth || 0);
      if (itemEl && itemEl.offsetParent !== null) {
        widths.push(itemEl.scrollWidth || 0);
      }
      widths.push(timeEl.scrollWidth || 0);
      const desired = Math.max(...widths) + pad;
      const clamped = Math.min(desired, maxWidth);
      if (Number.isFinite(clamped) && clamped > 0) {
        bubble.style.minWidth = `${Math.ceil(clamped)}px`;
      }
    });
  }

  private updateSelection(): void {
    for (const [id, state] of this.rowById) {
      state.row.classList.toggle("active", id === this.selectedId);
    }
  }

  private updateFriendRow(id: string): boolean {
    const state = this.rowById.get(id);
    if (!state) return false;
    const friend = this.getFriendById(id);
    const conv = this.convs.get(id);
    const unread = conv?.unread ?? 0;

    if (this.mode === "group") {
      this.populateGroupAvatarRow(state.sub, friend, id);
      const count = getGroupMemberCount(friend);
      if (count !== null) {
        if (!state.groupCountBadge) {
          const badge = document.createElement("span");
          badge.className = "qws-msg-group-count";
          badge.textContent = `${count}/12`;
          state.row.appendChild(badge);
          state.groupCountBadge = badge;
        } else {
          state.groupCountBadge.textContent = `${count}/12`;
        }
      } else if (state.groupCountBadge) {
        state.groupCountBadge.remove();
        state.groupCountBadge = null;
      }
    } else {
      state.sub.textContent = formatStatus(friend, this.mode);
    }

    if (unread > 0) {
      state.row.classList.add("unread");
      if (!state.badge) {
        const badge = document.createElement("span");
        badge.className = "qws-msg-unread-badge";
        badge.textContent = String(unread);
        state.row.appendChild(badge);
        state.badge = badge;
      } else {
        state.badge.textContent = String(unread);
      }
    } else {
      state.row.classList.remove("unread");
      if (state.badge) {
        state.badge.remove();
        state.badge = null;
      }
    }

    const isOnline = this.mode !== "group" && Boolean(friend?.isOnline);
    if (isOnline && !state.statusDot && state.avatarWrap) {
      const dot = document.createElement("span");
      dot.className = "qws-msg-status-dot";
      state.avatarWrap.appendChild(dot);
      state.statusDot = dot;
    } else if (!isOnline && state.statusDot) {
      state.statusDot.remove();
      state.statusDot = null;
    }

    return true;
  }
  private createSlot(): HTMLDivElement {
    const d = document.createElement("div");
    style(d, {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      marginRight: "0",
      pointerEvents: "auto",
      fontFamily: "var(--chakra-fonts-body, GreyCliff CF), system-ui, sans-serif",
      color: "var(--chakra-colors-chakra-body-text, #e7eef7)",
      userSelect: "none",
      zIndex: "var(--chakra-zIndices-PresentableOverlay, 5100)",
    });
    setProps(d, {
      "-webkit-font-smoothing": "antialiased",
      "-webkit-text-size-adjust": "100%",
      "text-rendering": "optimizeLegibility",
    });
    return d;
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Messages");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 20 20");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      '<circle cx="7" cy="6.5" r="3" fill="currentColor"/>' +
      '<circle cx="14.5" cy="7.5" r="2.5" fill="currentColor" opacity="0.75"/>' +
      '<path d="M2 18c0-2.8 2.6-5 6-5h2c3.4 0 6 2.2 6 5v2H2v-2z" fill="currentColor"/>' +
      '<path d="M12.5 18c0-1.6 1.4-2.9 3.2-2.9h0.8c1.8 0 3.2 1.3 3.2 2.9v2h-7.2v-2z" fill="currentColor" opacity="0.75"/>';
    this.iconWrap = document.createElement("div");
    this.iconWrap.appendChild(icon as unknown as Node);
    this.applyFallbackButtonStyles();
    btn.appendChild(this.iconWrap);
    btn.addEventListener("mouseenter", () => {
      if (btn.hasAttribute("style")) btn.style.borderColor = "var(--qws-accent, #7aa2ff)";
    });
    btn.addEventListener("mouseleave", () => {
      if (btn.hasAttribute("style")) btn.style.borderColor = "var(--chakra-colors-chakra-border-color, #ffffff33)";
    });
    return btn;
  }

  private createBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    style(badge, {
      position: "absolute",
      top: "-6px",
      right: "-6px",
      minWidth: "18px",
      height: "18px",
      padding: "0 6px",
      borderRadius: "999px",
      background: "var(--chakra-colors-Red-Magic, #D02128)",
      color: "var(--chakra-colors-Neutral-TrueWhite, #fff)",
      fontSize: "12px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid rgba(0,0,0,.35)",
      lineHeight: "18px",
      pointerEvents: "none",
    });
    return badge;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "qws-msg-panel";

    const head = document.createElement("div");
    head.className = "qws-msg-head";
    head.textContent = this.opts.title ?? (this.mode === "group" ? "Groups" : "Messages");
    this.panelHeadEl = head;

    const body = document.createElement("div");
    body.className = "qws-msg-body";

    this.listEl = document.createElement("div");
    this.listEl.className = "qws-msg-list";

    const thread = document.createElement("div");
    thread.className = "qws-msg-thread";

    this.threadHeadEl = document.createElement("div");
    this.threadHeadEl.className = "qws-msg-thread-head";
    this.threadBodyEl = document.createElement("div");
    this.threadBodyEl.className = "qws-msg-thread-body";

    const inputRow = document.createElement("div");
    inputRow.className = "qws-msg-input";

    const importWrap = document.createElement("div");
    importWrap.className = "qws-msg-import";
    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "qws-msg-import-btn";
    importBtn.textContent = "+";
    importBtn.title = "Import";

    const importMenu = document.createElement("div");
    importMenu.className = "qws-msg-import-menu";
    const importOptions = [
      { id: "item", label: "Import item" },
      { id: "room", label: "Invite to room" },
    ];
    for (const opt of importOptions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label;
      btn.dataset.import = opt.id;
      btn.addEventListener("click", () => {
        importMenu.style.display = "none";
        if (opt.id === "item") {
          void this.handleImportItems();
        } else if (opt.id === "room") {
          void this.handleRoomInvite();
        }
      });
      importMenu.appendChild(btn);
    }

    importBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = importMenu.style.display === "flex";
      importMenu.style.display = open ? "none" : "flex";
    });

    importWrap.append(importBtn, importMenu);
    inputRow.appendChild(importWrap);
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    this.inputEl.maxLength = MAX_MESSAGE_LENGTH;
    this.inputEl.placeholder = "Type a message...";
    this.inputEl.addEventListener("input", () => {
      this.updateSendState();
    });
    const enterHandler = (e: KeyboardEvent) => {
      if (!this.shouldSendOnEnter(e)) return;
      this.consumeEnterEvent(e);
      void this.handleSendMessage();
    };
    this.inputEl.addEventListener("keydown", enterHandler, { capture: true });
    this.inputEl.addEventListener("keypress", enterHandler, { capture: true });
    this.inputEl.addEventListener("keyup", enterHandler, { capture: true });

    const emojiWrap = document.createElement("div");
    emojiWrap.className = "qws-msg-emoji";
    const emojiBtn = document.createElement("button");
    emojiBtn.type = "button";
    emojiBtn.className = "qws-msg-emoji-btn";
    emojiBtn.textContent = "😊";
    emojiBtn.title = "Emoji";
    const emojiMenu = document.createElement("div");
    emojiMenu.className = "qws-msg-emoji-menu";
    const picker = document.createElement("emoji-picker") as HTMLElement;
    picker.className = "qws-msg-emoji-picker";
    picker.classList.add("dark");
    // No data-source needed — installEmojiDataFetchInterceptor() patches
    // window.fetch to serve the data from GM cache (handles GET + HEAD).
    picker.addEventListener("emoji-click", (event: Event) => {
      const detail = (
        event as CustomEvent<{ unicode?: string; emoji?: { unicode?: string } }>
      ).detail;
      const unicode = detail?.unicode ?? detail?.emoji?.unicode ?? "";
      if (unicode) {
        this.insertEmoji(String(unicode));
      }
      this.setEmojiMenu(false);
    });
    emojiMenu.appendChild(picker);
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = this.emojiMenuEl.style.display === "flex";
      this.setEmojiMenu(!open);
      if (!open) {
        importMenu.style.display = "none";
      }
    });
    emojiWrap.append(emojiBtn, emojiMenu);
    this.emojiWrapEl = emojiWrap;
    this.emojiBtnEl = emojiBtn;
    this.emojiMenuEl = emojiMenu;
    const isEmojiTarget = (node: Node | null) => {
      if (!node) return false;
      if (emojiWrap.contains(node)) return true;
      const pickerHost = emojiMenu.querySelector("emoji-picker") as HTMLElement | null;
      const shadow = pickerHost?.shadowRoot ?? null;
      return !!(shadow && node instanceof Node && shadow.contains(node));
    };

    this.sendBtn = document.createElement("button");
    this.sendBtn.type = "button";
    this.sendBtn.className = "qws-msg-send-btn";
    this.sendBtn.textContent = "Send";
    this.sendBtn.disabled = true;
    this.sendBtn.addEventListener("click", () => {
      void this.handleSendMessage();
    });

    this.charCountEl = document.createElement("div");
    this.charCountEl.className = "qws-msg-char-count";
    this.charCountEl.textContent = `0/${MAX_MESSAGE_LENGTH}`;

    inputRow.append(this.inputEl, emojiWrap, this.charCountEl, this.sendBtn);

    this.attachmentsEl = document.createElement("div");
    this.attachmentsEl.className = "qws-msg-attachments";

    this.statusEl = document.createElement("div");
    style(this.statusEl, {
      fontSize: "11px",
      opacity: "0.7",
      padding: "0 10px 8px 10px",
      minHeight: "16px",
    });

    panel.addEventListener("pointerdown", (e) => {
      const target = e.target as Node | null;
      if (importMenu.style.display === "flex" && target && !importWrap.contains(target)) {
        importMenu.style.display = "none";
      }
      if (this.emojiMenuEl.style.display === "flex" && !isEmojiTarget(target)) {
        this.setEmojiMenu(false);
      }
    });

    thread.append(this.threadHeadEl, this.threadBodyEl, inputRow, this.attachmentsEl, this.statusEl);
    body.append(this.listEl, thread);
    panel.append(head, body);

    return panel;
  }

  private async handleSendMessage(): Promise<void> {
    if (this.mode === "group") {
      await this.handleSendGroupMessage();
      return;
    }
    if (!this.myId || !this.selectedId) return;
    const built = this.buildMessageBody();
    if (!built) {
      if (this.pendingImportItems.length) {
        this.statusEl.textContent = "Unable to attach item.";
      }
      return;
    }
    this.sendBtn.disabled = true;
    if (!this.statusEl.textContent.startsWith(ATTACHMENT_STATUS_PREFIX)) {
      this.statusEl.textContent = "";
    }

    if (built.body.length > MAX_MESSAGE_LENGTH) {
      this.statusEl.textContent = `Message too long (${built.body.length}/${MAX_MESSAGE_LENGTH}).`;
      this.updateSendState();
      return;
    }

    const roomId = await getCurrentRoomId();
    if (!roomId) {
      this.statusEl.textContent = "Room id unavailable.";
      this.updateSendState();
      return;
    }

    const body = built.body;
    const usedItems = built.usedItems;
    const usedRoomInvite = built.usedRoomInvite;

    try {
      const msg = await sendMessage({
        fromPlayerId: this.myId,
        toPlayerId: this.selectedId,
        roomId,
        text: body,
      });
      const normalized = normalizeMessage(msg);
      if (normalized) {
        const conv = this.ensureConversation(this.selectedId);
        conv.messages = this.mergeMessages(conv.messages, [normalized]);
        conv.conversationId = normalized.conversationId ?? conv.conversationId;
        conv.lastMessageAt = Math.max(
          conv.lastMessageAt,
          Number.isFinite(Date.parse(normalized.createdAt))
            ? Date.parse(normalized.createdAt)
            : 0,
        );
        this.updateConversationMap(conv);
        this.inputEl.value = "";
        if (usedItems) {
          this.pendingImportItems = [];
          this.renderAttachments();
          this.updateAttachmentStatus();
        }
        if (usedRoomInvite) {
          this.pendingRoomInvite = null;
          this.updateAttachmentStatus();
        }
        this.updateFriendRow(this.selectedId);
        this.updateSelection();
        this.renderThread();
      } else {
        this.statusEl.textContent = "Message failed to send.";
      }
    } catch {
      this.statusEl.textContent = "Message failed to send.";
    } finally {
      this.updateSendState();
    }
  }

  private async handleSendGroupMessage(): Promise<void> {
    if (!this.myId || !this.selectedId) return;
    const built = this.buildMessageBody();
    if (!built) {
      if (this.pendingImportItems.length) {
        this.statusEl.textContent = "Unable to attach item.";
      }
      return;
    }
    this.sendBtn.disabled = true;
    if (!this.statusEl.textContent.startsWith(ATTACHMENT_STATUS_PREFIX)) {
      this.statusEl.textContent = "";
    }

    if (built.body.length > MAX_MESSAGE_LENGTH) {
      this.statusEl.textContent = `Message too long (${built.body.length}/${MAX_MESSAGE_LENGTH}).`;
      this.updateSendState();
      return;
    }

    const body = built.body;
    const usedItems = built.usedItems;
    const usedRoomInvite = built.usedRoomInvite;

    try {
      const msg = await sendGroupMessage({
        groupId: this.selectedId,
        playerId: this.myId,
        text: body,
      });
      const normalized = msg
        ? normalizeGroupMessage({ ...(msg as any), groupId: this.selectedId })
        : null;
      if (normalized) {
        const conv = this.ensureConversation(this.selectedId);
        conv.messages = this.mergeMessages(conv.messages, [normalized]);
        conv.conversationId = this.selectedId;
        conv.lastMessageAt = Math.max(
          conv.lastMessageAt,
          Number.isFinite(Date.parse(normalized.createdAt))
            ? Date.parse(normalized.createdAt)
            : 0,
        );
        this.updateConversationMap(conv);
        this.inputEl.value = "";
        if (usedItems) {
          this.pendingImportItems = [];
          this.renderAttachments();
          this.updateAttachmentStatus();
        }
        if (usedRoomInvite) {
          this.pendingRoomInvite = null;
          this.updateAttachmentStatus();
        }
        this.updateFriendRow(this.selectedId);
        this.updateSelection();
        this.renderThread();
      } else {
        this.statusEl.textContent = "Message failed to send.";
      }
    } catch {
      this.statusEl.textContent = "Message failed to send.";
    } finally {
      this.updateSendState();
    }
  }

  private installScrollGuards(el: HTMLElement) {
    const stop: EventListener = (e) => {
      e.stopPropagation();
    };
    el.addEventListener("wheel", stop, { passive: true, capture: true });
    el.addEventListener("mousewheel", stop, { passive: true, capture: true });
    el.addEventListener("DOMMouseScroll", stop, { passive: true, capture: true });
    el.addEventListener("touchmove", stop, { passive: true, capture: true });
  }

  private installPanelDrag() {
    if (!this.panelHeadEl) return;
    const head = this.panelHeadEl;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rect = this.panel.getBoundingClientRect();
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      const pad = 8;
      const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
      const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
      left = Math.min(Math.max(pad, left), maxLeft);
      top = Math.min(Math.max(pad, top), maxTop);
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
    };

    const onUp = () => {
      dragging = false;
      head.style.cursor = "grab";
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
    };

    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (this.panel.style.display !== "block") return;
      dragging = true;
      this.panelDetached = true;
      const rect = this.panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      this.panel.style.position = "fixed";
      this.panel.style.left = `${rect.left}px`;
      this.panel.style.top = `${rect.top}px`;
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
      head.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private applyFallbackButtonStyles() {
    this.btn.className = "";
    style(this.btn, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "36px",
      padding: "0 12px",
      borderRadius: "var(--chakra-radii-button, 50px)",
      border: "1px solid var(--chakra-colors-chakra-border-color, #ffffff33)",
      background: "var(--qws-panel, #111823cc)",
      backdropFilter: "blur(var(--qws-blur, 8px))",
      color: "var(--qws-text, #e7eef7)",
      boxShadow: "var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45))",
      cursor: "pointer",
      transition: "border-color var(--chakra-transition-duration-fast,150ms) ease",
      outline: "none",
      position: "relative",
    });
    setProps(this.btn, {
      "-webkit-backdrop-filter": "blur(var(--qws-blur, 8px))",
      "-webkit-tap-highlight-color": "transparent",
    });
    style(this.iconWrap, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "100%",
    });
  }

  private shouldSendOnEnter(e: KeyboardEvent): boolean {
    const key = e.key || "";
    const code = e.code || "";
    const keyCode = e.keyCode;
    if (e.isComposing) return false;
    if (e.shiftKey) return false;
    if (e.type !== "keydown") return false;
    if (key !== "Enter" && code !== "Enter" && keyCode !== 13) return false;
    return document.activeElement === this.inputEl;
  }

  private consumeEnterEvent(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  private setEmojiMenu(open: boolean): void {
    this.emojiMenuEl.style.display = open ? "flex" : "none";
    this.emojiBtnEl.classList.toggle("active", open);
  }

  private insertEmoji(emoji: string): void {
    if (!emoji) return;
    const input = this.inputEl;
    const value = input.value;
    const start = typeof input.selectionStart === "number" ? input.selectionStart : value.length;
    const end = typeof input.selectionEnd === "number" ? input.selectionEnd : value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > this.maxTextLength) {
      this.statusEl.textContent = `Message too long (${next.length}/${MAX_MESSAGE_LENGTH}).`;
      this.updateSendState();
      return;
    }
    input.value = next;
    const caret = start + emoji.length;
    input.setSelectionRange(caret, caret);
    input.focus();
    this.updateSendState();
  }

  private closestFlexWithEnoughChildren(el: HTMLElement, minChildren = 3): HTMLElement | null {
    let cur: HTMLElement | null = el;
    while (cur && cur.parentElement) {
      const parent = cur.parentElement as HTMLElement;
      const cs = getComputedStyle(parent);
      if (cs.display.includes("flex") && parent.children.length >= minChildren) return parent;
      cur = parent;
    }
    return null;
  }

  private findToolbarContainer(): HTMLElement | null {
    try {
      const mcFlex = document.querySelector<HTMLElement>(".McFlex.css-13izacw");
      if (mcFlex) return mcFlex;

      const chatBtn = document.querySelector('button[aria-label="Chat"]') as HTMLElement | null;
      const flexFromChat = chatBtn ? this.closestFlexWithEnoughChildren(chatBtn) : null;
      if (flexFromChat) return flexFromChat;

      const canvas = this.findTargetCanvas();
      if (canvas) {
        const flexFromCanvas = this.closestFlexWithEnoughChildren(canvas);
        if (flexFromCanvas) return flexFromCanvas;
        const block = this.findAnchorBlockFromCanvas(canvas);
        if (block && block.parentElement) return block.parentElement as HTMLElement;
      }
      return null;
    } catch {
      return null;
    }
  }

  private applyToolbarLook(toolbar: HTMLElement | null) {
    const refBtn = toolbar?.querySelector("button.chakra-button") as HTMLButtonElement | null;
    if (!refBtn) return;

    this.btn.className = refBtn.className;
    this.btn.removeAttribute("style");
    this.btn.removeAttribute("data-focus-visible-added");

    const refInner = refBtn.querySelector("div") as HTMLElement | null;
    if (refInner) {
      this.iconWrap.className = refInner.className;
      this.iconWrap.removeAttribute("style");
    }

    style(this.iconWrap, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    });
    style(this.btn, { position: "relative" });
  }
  private findNotifierSlot(): HTMLElement | null {
    const fromGlobal = window.__qws_notifier_slot;
    if (fromGlobal && fromGlobal.isConnected) return fromGlobal;
    const el = document.getElementById("qws-notifier-slot");
    return el && el.isConnected ? el : null;
  }

  private attachUnderNotifier(): boolean {
    const notifier = this.findNotifierSlot();
    if (!notifier) return false;
    if (!document.body.contains(this.slot)) document.body.appendChild(this.slot);

    const rect = notifier.getBoundingClientRect();
    const width = this.slot.getBoundingClientRect().width || 42;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const top = rect.bottom + 8;

    style(this.slot, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      right: "",
      bottom: "",
      transform: "",
    });
    return true;
  }

  private findTargetCanvas(): HTMLCanvasElement | null {
    try {
      const c1 = document.querySelector("span[tabindex] canvas") as HTMLCanvasElement | null;
      if (c1) return c1;
      const all = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
      const candidates = all
        .map((c) => ({ c, r: c.getBoundingClientRect() }))
        .filter(({ r }) => r.width <= 512 && r.height <= 512 && r.top < 300)
        .sort((a, b) => (a.r.left - b.r.left) || (a.r.top - b.r.top));
      return candidates[0]?.c ?? null;
    } catch {
      return null;
    }
  }

  private findAnchorBlockFromCanvas(c: HTMLCanvasElement): HTMLElement | null {
    try {
      const tabbable = c.closest("span[tabindex]");
      if (tabbable && tabbable.parentElement) return tabbable.parentElement as HTMLElement;

      let cur: HTMLElement | null = c;
      while (cur && cur.parentElement) {
        const p = cur.parentElement as HTMLElement;
        const cs = getComputedStyle(p);
        if (cs.display.includes("flex") && p.children.length <= 3) return p;
        cur = p;
      }
      return null;
    } catch {
      return null;
    }
  }

  private insertLeftOf(block: Element, el: Element) {
    const parent = block.parentElement;
    if (!parent) return;
    if (!block.isConnected || !parent.isConnected) return;

    const cs = getComputedStyle(parent);
    const isFlex = cs.display.includes("flex");
    const dir = cs.flexDirection || "row";

    try {
      if (isFlex && dir.startsWith("row") && dir.endsWith("reverse")) {
        if (el !== block.nextSibling) parent.insertBefore(el, block.nextSibling);
      } else {
        parent.insertBefore(el, block);
      }
    } catch {}
  }

  private attachFallback(): void {
    const canvas = this.findTargetCanvas();
    const block = canvas ? this.findAnchorBlockFromCanvas(canvas) : null;
    if (!block || !block.parentElement || !block.isConnected) {
      let fixed = document.getElementById("qws-messages-fallback") as HTMLDivElement | null;
      if (!fixed) {
        fixed = document.createElement("div");
        fixed.id = "qws-messages-fallback";
        style(fixed, {
          position: "fixed",
          zIndex: "var(--chakra-zIndices-PresentableOverlay, 5100)",
          top: "calc(10px + var(--sait, 0px))",
          right: "calc(10px + var(--sair, 0px))",
        });
        document.body.appendChild(fixed);
      }
      if (!fixed.contains(this.slot)) fixed.appendChild(this.slot);
      return;
    }

    if (this.slot.parentElement !== block.parentElement ||
      (this.slot.nextElementSibling !== block && block.previousElementSibling !== this.slot)) {
      this.insertLeftOf(block, this.slot);
    }
  }

  private attach(): void {
    const toolbar = this.findToolbarContainer();
    if (toolbar) this.applyToolbarLook(toolbar);
    else this.applyFallbackButtonStyles();
    if (this.attachUnderNotifier()) return;
    this.attachFallback();
  }

  private observeDomForRelocation(): void {
    try {
      this.mo?.disconnect();
      this.mo = new MutationObserver(() => this.attach());
      this.mo.observe(document.body, { childList: true, subtree: true });
      this.attach();
      window.addEventListener("resize", () => this.attach());
    } catch {}
  }

  private fitPanelWithinViewport(): void {
    requestAnimationFrame(() => {
      if (this.panel.style.display !== "block") return;
      if (this.panelDetached) return;
      const rect = this.panel.getBoundingClientRect();
      const padding = 8;
      if (rect.right > window.innerWidth - padding) {
        this.panel.style.right = "0";
        this.panel.style.left = "auto";
      }
      if (rect.left < padding) {
        this.panel.style.left = "0";
        this.panel.style.right = "auto";
      }
    });
  }
}

export async function renderMessagesOverlay(): Promise<void> {
  const prev = window.__qws_cleanup_messages_overlay;
  if (typeof prev === "function") {
    try {
      prev();
    } catch {}
  }

  const overlay = new MessagesOverlay();
  await overlay.init();

  window.__qws_cleanup_messages_overlay = () => {
    try {
      overlay.destroy();
    } catch {}
  };
}
