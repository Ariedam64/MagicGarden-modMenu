// api.ts
// Point d'entrée unique pour parler à ton backend ariesmod-api.ariedam.fr

const API_BASE_URL = "https://ariesmod-api.ariedam.fr/";

// Si tu n'as pas les types Tampermonkey, ça évite que TS hurle
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "arraybuffer" | "blob" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
  onprogress?: (response: { status: number; readyState: number; responseText: string; loaded: number; total: number }) => void;
}): { abort(): void };

/** Hosts autorisés par le CSP Discord pour img-src. */
const _SAFE_IMG_HOSTS = ["cdn.discordapp.com", "media.discordapp.net"];
/** Cache des blob: URL générées pour contourner le CSP img-src. */
const _gmImgCache = new Map<string, string>();
/** Requêtes en cours : évite de lancer plusieurs GM fetches pour la même URL. */
const _gmImgPending = new Map<string, HTMLImageElement[]>();
const _extMimeMap: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
};

function _isImgUrlSafe(url: string): boolean {
  if (!url || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return true;
  try {
    const { hostname } = new URL(url);
    return _SAFE_IMG_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

/**
 * Définit img.src de façon sûre vis-à-vis du CSP Discord :
 * les images externes non autorisées sont récupérées via GM_xmlhttpRequest
 * et servies comme blob: URL (autorisées par img-src blob:).
 */
export function setImageSafe(img: HTMLImageElement, url: string | null | undefined): void {
  if (!url) return;
  if (_isImgUrlSafe(url)) {
    img.src = url;
    return;
  }
  const cached = _gmImgCache.get(url);
  if (cached) {
    img.src = cached;
    return;
  }
  // Deduplicate in-flight requests for the same URL
  const pending = _gmImgPending.get(url);
  if (pending) {
    pending.push(img);
    return;
  }
  _gmImgPending.set(url, [img]);
  GM_xmlhttpRequest({
    method: "GET",
    url,
    headers: {},
    responseType: "arraybuffer",
    onload: (res) => {
      const imgs = _gmImgPending.get(url) ?? [];
      _gmImgPending.delete(url);
      if (!res.response) {
        for (const el of imgs) el.src = url;
        return;
      }
      const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "png";
      const mime = _extMimeMap[ext] ?? "image/png";
      const blob = new Blob([res.response as ArrayBuffer], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      _gmImgCache.set(url, blobUrl);
      for (const el of imgs) el.src = blobUrl;
    },
    onerror: () => {
      const imgs = _gmImgPending.get(url) ?? [];
      _gmImgPending.delete(url);
      for (const el of imgs) el.src = url;
    },
  });
}

/** Cache des blob: URL pour les fichiers audio externes (contournement CSP media-src Discord). */
const _gmAudioCache = new Map<string, string>();
/** Requêtes audio en cours : évite de lancer plusieurs GM fetches pour la même URL. */
const _gmAudioPending = new Map<string, Array<(url: string) => void>>();

/**
 * Retourne une URL audio safe pour Discord CSP (media-src 'self' blob: data:).
 * Si on n'est pas sur Discord, retourne l'URL originale.
 * Sinon, fetch via GM et retourne un blob: URL.
 */
export function getAudioUrlSafe(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(url);
      return;
    }
    // Si pas sur Discord, pas besoin de contourner le CSP
    if (!isDiscordActivityContext()) {
      resolve(url);
      return;
    }
    // Si déjà en cache, retourner immédiatement
    const cached = _gmAudioCache.get(url);
    if (cached) {
      resolve(cached);
      return;
    }
    // Si requête en cours, attendre
    const pending = _gmAudioPending.get(url);
    if (pending) {
      pending.push(resolve);
      return;
    }
    _gmAudioPending.set(url, [resolve]);
    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {},
      responseType: "arraybuffer",
      onload: (res) => {
        const callbacks = _gmAudioPending.get(url) ?? [];
        _gmAudioPending.delete(url);
        if (!res.response) {
          for (const cb of callbacks) cb(url);
          return;
        }
        // Déterminer le type MIME (mp3, ogg, wav, etc.)
        const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "mp3";
        const audioMimeMap: Record<string, string> = {
          mp3: "audio/mpeg",
          ogg: "audio/ogg",
          wav: "audio/wav",
          m4a: "audio/mp4",
        };
        const mime = audioMimeMap[ext] ?? "audio/mpeg";
        const blob = new Blob([res.response as ArrayBuffer], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        _gmAudioCache.set(url, blobUrl);
        for (const cb of callbacks) cb(blobUrl);
      },
      onerror: () => {
        const callbacks = _gmAudioPending.get(url) ?? [];
        _gmAudioPending.delete(url);
        for (const cb of callbacks) cb(url);
      },
    });
  });
}

/** Handle retourné par les fonctions de stream SSE (remplace EventSource). */
export interface StreamHandle {
  close(): void;
}

function isDiscordActivityContext(): boolean {
  try {
    return window.location.hostname.endsWith("discordsays.com");
  } catch {
    return false;
  }
}

/** Known SSE event names across all streams. */
const SSE_EVENT_NAMES = [
  "connected",
  "friend_request",
  "friend_response",
  "friend_cancelled",
  "friend_removed",
  "message",
  "read",
  "ping",
] as const;

function openGMSSEStream(
  url: string,
  onEvent: (eventName: string, data: string) => void,
  onError?: () => void,
): StreamHandle {
  let closed = false;
  let source: EventSource | null = null;
  const tag = (() => {
    try {
      return `[SSE ${new URL(url).pathname.split("/").slice(-2).join("/")}]`;
    } catch {
      return "[SSE]";
    }
  })();

  source = new EventSource(url);

  const handleEvent = (event: Event, name: string) => {
    if (closed) return;
    const data = (event as MessageEvent).data as string;
    onEvent(name, data);
  };

  for (const name of SSE_EVENT_NAMES) {
    source.addEventListener(name, (e) => handleEvent(e, name));
  }

  source.addEventListener("open", () => {
    // connection open
  });

  source.addEventListener("error", (e) => {
    if (closed) return;
    console.warn(tag, "error", e);
    onError?.();
  });

  return {
    close: () => {
      closed = true;
      source?.close();
      source = null;
    },
  };
}

// ---------- Emoji data fetch interceptor (bypass CSP + blob HEAD issue) ----------

const EMOJI_DATA_CDN_PREFIX =
  "https://cdn.jsdelivr.net/npm/emoji-picker-element-data";
let _emojiJson: string | null = null;
let _emojiPending: Array<(json: string | null) => void> = [];
let _emojiInterceptorInstalled = false;

function _emojiMakeResponse(json: string, method: string): Response {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(json, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Installe un intercepteur sur window.fetch pour servir les données
 * emoji-picker-element depuis le cache GM (contourne CSP + HEAD sur blob:).
 * Idempotent — à appeler le plus tôt possible (avant tout emoji-picker dans le DOM).
 */
export function installEmojiDataFetchInterceptor(): void {
  if (_emojiInterceptorInstalled) return;
  _emojiInterceptorInstalled = true;

  const _origFetch = window.fetch.bind(window);
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (!url.startsWith(EMOJI_DATA_CDN_PREFIX)) {
      return _origFetch(input, init);
    }
    const method = (
      init?.method ??
      (input instanceof Request ? (input as Request).method : "GET")
    ).toUpperCase();
    if (_emojiJson) {
      return Promise.resolve(_emojiMakeResponse(_emojiJson, method));
    }
    // Queue until GM fetch completes
    return new Promise<Response>((resolve) => {
      _emojiPending.push((json) => {
        resolve(
          json
            ? _emojiMakeResponse(json, method)
            : new Response(null, { status: 503 }),
        );
      });
    });
  };

  GM_xmlhttpRequest({
    method: "GET",
    url: `${EMOJI_DATA_CDN_PREFIX}@^1/en/emojibase/data.json`,
    headers: {},
    onload: (res) => {
      if (res.status >= 200 && res.status < 300 && res.responseText) {
        _emojiJson = res.responseText;
        for (const cb of _emojiPending) cb(_emojiJson);
      } else {
        console.error("[api] emoji fetch failed:", res.status);
        for (const cb of _emojiPending) cb(null);
      }
      _emojiPending = [];
    },
    onerror: (err) => {
      console.error("[api] emoji fetch error:", err);
      for (const cb of _emojiPending) cb(null);
      _emojiPending = [];
    },
  });
}

import type {
  PlayerStatePayload,
  PlayerPrivacyPayload,
} from "./payload";
import { type GardenState } from "../store/atoms";

// ---------- Types côté client ----------

export interface RoomUserSlot {
  name: string;
  avatarUrl: string | null;
}

export interface RoomSearchResult {
  room: Room;
  matchedSlots: RoomUserSlot[];
}

export interface Room {
  id: string;
  isPrivate: boolean;
  playersCount: number;
  lastUpdatedAt: string;
  lastUpdatedByPlayerId: string | null;
  userSlots?: RoomUserSlot[];
}

interface RoomDto {
  id: string;
  is_private: boolean;
  players_count: number | null;
  last_updated_at: string;
  last_updated_by_player_id: string | null;
  user_slots?: Array<{
    name: string;
    avatar_url?: string | null;
  }>;
}

export interface PlayerViewState {
  garden: GardenState | null;
  inventory: any | null;
  stats: Record<string, any> | null;
  activityLog: any[] | null;
  journal: any | null;
  activityLogs?: any[] | null;
}

export interface PlayerView {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  avatar?: string[] | null;
  coins: number | null;
  room: any | null;
  hasModInstalled: boolean;
  modVersion?: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  privacy: PlayerPrivacyPayload;
  // Sur /get-player-view (single) présent, sur /get-players-view parfois absent selon sections
  state?: PlayerViewState;
}

export interface FriendSummary {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  lastEventAt: string | null;
  isOnline: boolean;
  roomId: string | null;
}

const ONLINE_THRESHOLD_MS = 6 * 60 * 1000;

function computeIsOnline(lastEventAt: string | null): boolean {
  if (!lastEventAt) return false;
  const ts = Date.parse(lastEventAt);
  return Number.isFinite(ts) && Date.now() - ts <= ONLINE_THRESHOLD_MS;
}

let cachedFriendsSummary: FriendSummary[] | null = null;
let cachedFriendsView: PlayerView[] | null = null;
let cachedIncomingRequests: PlayerView[] | null = null;
let cachedOutgoingRequests: FriendRequestOutgoing[] | null = null;

export function getCachedFriendsSummary(): FriendSummary[] {
  return cachedFriendsSummary ? [...cachedFriendsSummary] : [];
}

export function getCachedFriendsWithViews(): PlayerView[] {
  return cachedFriendsView ? [...cachedFriendsView] : [];
}

export function getCachedIncomingRequestsWithViews(): PlayerView[] {
  return cachedIncomingRequests ? [...cachedIncomingRequests] : [];
}

export function getCachedOutgoingRequests(): FriendRequestOutgoing[] {
  return cachedOutgoingRequests ? [...cachedOutgoingRequests] : [];
}

export type FriendAction = "accept" | "reject";

export interface FriendRequestIncoming {
  fromPlayerId: string;
  otherPlayerId: string;
  createdAt: string;
}

export interface FriendRequestOutgoing {
  toPlayerId: string;
  otherPlayerId: string;
  createdAt: string;
}

export interface FriendRequestStreamConnected {
  playerId: string;
}

export interface FriendRequestStreamRequest {
  requesterId: string;
  targetId: string;
  createdAt: string;
}

export interface FriendRequestStreamResponse {
  requesterId: string;
  responderId: string;
  action: FriendAction;
  updatedAt: string;
}

export interface FriendRequestStreamCancelled {
  requesterId: string;
  targetId: string;
}

export interface FriendRequestStreamAccepted {
  requesterId: string;
  responderId: string;
  updatedAt: string;
}

export interface FriendRequestStreamRejected {
  requesterId: string;
  responderId: string;
  updatedAt: string;
}

export interface FriendRequestStreamRemoved {
  removerId: string;
  removedId: string;
  removedAt: string;
}

export interface FriendRequestsStreamHandlers {
  onConnected?: (payload: FriendRequestStreamConnected) => void;
  onRequest?: (payload: FriendRequestStreamRequest) => void;
  onResponse?: (payload: FriendRequestStreamResponse) => void;
  onCancelled?: (payload: FriendRequestStreamCancelled) => void;
  onAccepted?: (payload: FriendRequestStreamAccepted) => void;
  onRejected?: (payload: FriendRequestStreamRejected) => void;
  onRemoved?: (payload: FriendRequestStreamRemoved) => void;
  onError?: (event: Event) => void;
}
export interface FriendRequestsResult {
  playerId: string;
  incoming: FriendRequestIncoming[];
  outgoing: FriendRequestOutgoing[];
}

export interface PlayerRoomResult {
  playerName: string;
  avatarUrl: string | null;
  roomId: string;
  roomPlayersCount: number;
}

export interface ModPlayerSummary {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  avatar: string[] | null;
  lastEventAt: string | null;
}

// sections possibles pour get-players-view
export type PlayerViewSection =
  | "profile"
  | "garden"
  | "inventory"
  | "stats"
  | "activityLog"
  | "journal"
  | "room";

// ---------- Helpers HTTP ----------

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function httpGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const url = buildUrl(path, query);
    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {},
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            console.error("[api] GET parse error:", e, res.responseText);
            resolve({ status: res.status, data: null });
          }
        } else {
          console.error("[api] GET error:", res.status, res.responseText);
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        console.error("[api] GET request failed:", err);
        resolve({ status: 0, data: null });
      },
    });
  });
}

function httpPost<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const url = buildUrl(path);
    GM_xmlhttpRequest({
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify(body),
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            console.error("[api] POST parse error:", e, res.responseText);
            resolve({ status: res.status, data: null });
          }
        } else {
          console.error("[api] POST error:", res.status, res.responseText);
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        console.error("[api] POST request failed:", err);
        resolve({ status: 0, data: null });
      },
    });
  });
}


/**
 * À appeler toutes les 60s côté jeu.
 * - Si le payload a changé depuis le dernier appel -> on envoie.
 * - Si le payload est identique -> on n'envoie qu'une fois toutes les 5 minutes
 *   (5e appel identique).
 */
export async function sendPlayerState(
  payload: PlayerStatePayload | null,
): Promise<boolean> {
  if (!payload) {
    return false;
  }

  const { status } = await httpPost<null>('collect-state', payload);
  if (status === 204) return true;
  if (status === 429) {
    console.error('[api] sendPlayerState rate-limited');
  }
  return false;
}

// ---------- 2) Rooms publiques ----------

export async function fetchAvailableRooms(
  limit = 50,
): Promise<Room[]> {
  const { data } = await httpGet<RoomDto[]>("rooms", { limit });
  if (!data || !Array.isArray(data)) return [];

  return data.map((r) => ({
    id: r.id,
    isPrivate: r.is_private,
    playersCount: r.players_count ?? 0,
    lastUpdatedAt: r.last_updated_at,
    lastUpdatedByPlayerId: r.last_updated_by_player_id,
    userSlots: Array.isArray(r.user_slots)
      ? r.user_slots.map((slot) => ({
          name: slot.name,
          avatarUrl: slot.avatar_url ?? null,
        }))
      : undefined,
  }));
}

// ---------- 3) Player view (un / plusieurs) ----------

export async function fetchPlayerView(
  playerId: string,
): Promise<PlayerView | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<PlayerView>("get-player-view", {
    playerId,
  });
  if (status === 404) return null;
  return data;
}

/**
 * Récupère des PlayerView en batch, avec possibilité de limiter les sections.
 */
export async function fetchPlayersView(
  playerIds: string[],
  options?: {
    sections?: PlayerViewSection[] | PlayerViewSection;
  },
): Promise<PlayerView[]> {
  const ids = Array.from(
    new Set(
      (playerIds ?? [])
        .map((x) => String(x).trim())
        .filter((x) => x.length >= 3),
    ),
  );
  if (ids.length === 0) return [];

  const body: any = { playerIds: ids };

  if (options?.sections) {
    body.sections = Array.isArray(options.sections)
      ? options.sections
      : [options.sections];
  }

  const { status, data } = await httpPost<PlayerView[]>(
    "get-players-view",
    body,
  );

  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

// ---------- 4) Amis : demandes + réponse ----------

export async function sendFriendRequest(
  fromPlayerId: string,
  toPlayerId: string,
): Promise<boolean> {
  if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-request", {
    fromPlayerId,
    toPlayerId,
  });

  if (status === 204) return true;
  if (status === 409) {
    console.warn("[api] friend-request conflict (already exists)");
  }
  return false;
}

export async function respondFriendRequest(params: {
  playerId: string;
  otherPlayerId: string;
  action: FriendAction;
}): Promise<boolean> {
  const { playerId, otherPlayerId, action } = params;
  if (!playerId || !otherPlayerId || playerId === otherPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-respond", {
    playerId,
    otherPlayerId,
    action,
  });

  if (status === 204) return true;
  return false;
}

// ---------- 5) Amis : liste + pending ----------

export async function fetchFriendsSummary(
  playerId: string,
): Promise<FriendSummary[]> {
  if (!playerId) return [];

  const { status, data } = await httpGet<{
    playerId: string;
    friends: Array<{
      playerId: string;
      name: string | null;
      avatarUrl: string | null;
      avatar: string[] | null;
      lastEventAt: string | null;
      roomId: string | null;
    }>;
  }>("list-friends", { playerId });

  if (status !== 200 || !data || !Array.isArray(data.friends)) {
    cachedFriendsSummary = [];
    return [];
  }

  const result: FriendSummary[] = data.friends.map((f) => ({
    playerId: f.playerId,
    playerName: f.name,
    avatarUrl: f.avatarUrl,
    avatar: Array.isArray(f.avatar) ? f.avatar : null,
    lastEventAt: f.lastEventAt,
    isOnline: computeIsOnline(f.lastEventAt),
    roomId: f.roomId,
  }));

  cachedFriendsSummary = result;
  return [...result];
}

export async function fetchFriendsIds(
  playerId: string,
): Promise<string[]> {
  const friends = await fetchFriendsSummary(playerId);
  return friends.map((f) => f.playerId);
}

export async function fetchFriendsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const friendIds = await fetchFriendsIds(playerId);
  if (friendIds.length === 0) {
    cachedFriendsView = [];
    return [];
  }

  const result = await fetchPlayersView(friendIds, {
    sections: ["profile", "room"],
  });
  cachedFriendsView = result;
  return [...result];
}

export async function fetchFriendRequests(
  playerId: string,
): Promise<FriendRequestsResult> {
  if (!playerId) {
    return { playerId: "", incoming: [], outgoing: [] };
  }

  const { status, data } = await httpGet<FriendRequestsResult>(
    "list-friend-requests",
    { playerId },
  );

  if (status !== 200 || !data) {
    return { playerId, incoming: [], outgoing: [] };
  }

  const result: FriendRequestsResult = {
    playerId: data.playerId ?? playerId,
    incoming: Array.isArray(data.incoming) ? data.incoming : [],
    outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
  };
  cachedOutgoingRequests = result.outgoing;
  return result;
}

export async function fetchIncomingRequestsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const { incoming } = await fetchFriendRequests(playerId);
  const ids = incoming.map((r) => r.fromPlayerId);
  if (ids.length === 0) {
    cachedIncomingRequests = [];
    return [];
  }

  const result = await fetchPlayersView(ids, { sections: ["profile"] });
  cachedIncomingRequests = result;
  return [...result];
}

export async function fetchOutgoingRequestsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const { outgoing } = await fetchFriendRequests(playerId);
  const ids = outgoing.map((r) => r.toPlayerId);
  if (ids.length === 0) return [];

  return fetchPlayersView(ids, { sections: ["profile"] });
}

function openDiscordFriendRequestsPoller(
  playerId: string,
  handlers: FriendRequestsStreamHandlers,
): StreamHandle {
  const LOG = "[friend-poll]";
  let closed = false;
  let prevIncomingKeys = new Set<string>();
  let prevOutgoingKeys = new Set<string>();
  let prevFriendKeys = new Set<string>();
  let initialized = false;
  let pollCount = 0;

  handlers.onConnected?.({ playerId });

  async function poll() {
    if (closed) return;
    pollCount++;
    try {
      const [result, friendIds] = await Promise.all([
        fetchFriendRequests(playerId),
        fetchFriendsIds(playerId),
      ]);

      const newIncomingKeys = new Set(result.incoming.map((r) => r.fromPlayerId));
      const newOutgoingKeys = new Set(result.outgoing.map((r) => r.toPlayerId));
      const newFriendKeys = new Set(friendIds);

      if (initialized) {
        // New incoming requests
        for (const req of result.incoming) {
          if (!prevIncomingKeys.has(req.fromPlayerId)) {
            handlers.onRequest?.({ requesterId: req.fromPlayerId, targetId: playerId, createdAt: req.createdAt });
          }
        }
        // Cancelled incoming requests
        for (const key of prevIncomingKeys) {
          if (!newIncomingKeys.has(key)) {
            handlers.onCancelled?.({ requesterId: key, targetId: playerId });
          }
        }
        // Outgoing request disappeared → accepted or rejected
        for (const key of prevOutgoingKeys) {
          if (!newOutgoingKeys.has(key)) {
            const now = new Date().toISOString();
            if (newFriendKeys.has(key)) {
              handlers.onAccepted?.({ requesterId: playerId, responderId: key, updatedAt: now });
            } else {
              handlers.onRejected?.({ requesterId: playerId, responderId: key, updatedAt: now });
            }
          }
        }
        // Friend removed us
        for (const key of prevFriendKeys) {
          if (!newFriendKeys.has(key)) {
            handlers.onRemoved?.({ removerId: key, removedId: playerId, removedAt: new Date().toISOString() });
          }
        }
      }

      prevIncomingKeys = newIncomingKeys;
      prevOutgoingKeys = newOutgoingKeys;
      prevFriendKeys = newFriendKeys;
      initialized = true;
    } catch (e) {
      console.error(LOG, "poll error:", e);
    }
    if (!closed) setTimeout(poll, 5000);
  }

  poll();
  return { close: () => { closed = true; } };
}

export function openFriendRequestsStream(
  playerId: string,
  handlers: FriendRequestsStreamHandlers = {},
): StreamHandle | null {
  if (!playerId) return null;
  if (isDiscordActivityContext()) return openDiscordFriendRequestsPoller(playerId, handlers);

  const url = buildUrl("friend-requests/stream", { playerId });

  const LOG = "[friend-stream]";
  return openGMSSEStream(
    url,
    (eventName, data) => {
      try {
        const parsed = JSON.parse(data);
        switch (eventName) {
          case "connected":
            handlers.onConnected?.(parsed as FriendRequestStreamConnected);
            break;
          case "friend_request":
            handlers.onRequest?.(parsed as FriendRequestStreamRequest);
            break;
          case "friend_response": {
            const resp = parsed as FriendRequestStreamResponse;
            handlers.onResponse?.(resp);
            if (resp.action === "accept") {
              handlers.onAccepted?.({ requesterId: resp.requesterId, responderId: resp.responderId, updatedAt: resp.updatedAt });
            } else if (resp.action === "reject") {
              handlers.onRejected?.({ requesterId: resp.requesterId, responderId: resp.responderId, updatedAt: resp.updatedAt });
            }
            break;
          }
          case "friend_cancelled":
            handlers.onCancelled?.(parsed as FriendRequestStreamCancelled);
            break;
          case "friend_removed":
            handlers.onRemoved?.(parsed as FriendRequestStreamRemoved);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error(LOG, "parse error:", e, "raw:", data);
      }
    },
    () => {
      handlers.onError?.(new Event("error"));
    },
  );
}

export async function cancelFriendRequest(
  playerId: string,
  otherPlayerId: string,
): Promise<boolean> {
  if (!playerId || !otherPlayerId || playerId === otherPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-cancel", {
    playerId,
    otherPlayerId,
  });

  return status === 204;
}

export async function removeFriend(
  playerId: string,
  otherPlayerId: string,
): Promise<boolean> {
  if (!playerId || !otherPlayerId || playerId === otherPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-remove", {
    playerId,
    otherPlayerId,
  });

  return status === 204;
}

// ---------- 6) Recherche de joueurs via les rooms publiques ----------

export async function searchPlayersByName(
  rawQuery: string,
  options?: {
    limitRooms?: number;
    minQueryLength?: number;
  },
): Promise<PlayerRoomResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;

  if (query.length < minLen) {
    return [];
  }

  const limitRooms = options?.limitRooms ?? 200;
  const qLower = query.toLowerCase();

  const rooms = await fetchAvailableRooms(limitRooms);

  const map = new Map<string, PlayerRoomResult>();

  for (const room of rooms) {
    if (!room.userSlots || room.userSlots.length === 0) continue;

    for (const slot of room.userSlots) {
      if (!slot.name) continue;

      const nameLower = slot.name.toLowerCase();
      if (!nameLower.includes(qLower)) continue;

      const key = `${room.id}::${slot.name}`;
      if (map.has(key)) continue;

      map.set(key, {
        playerName: slot.name,
        avatarUrl: slot.avatarUrl,
        roomId: room.id,
        roomPlayersCount: room.playersCount,
      });
    }
  }

  return Array.from(map.values());
}

export async function searchRoomsByPlayerName(
  rawQuery: string,
  options?: {
    limitRooms?: number;
    minQueryLength?: number;
  },
): Promise<RoomSearchResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;

  if (query.length < minLen) {
    return [];
  }

  const limitRooms = options?.limitRooms ?? 200;
  const qLower = query.toLowerCase();

  const rooms = await fetchAvailableRooms(limitRooms);

  const results: RoomSearchResult[] = [];

  for (const room of rooms) {
    if (!room.userSlots || room.userSlots.length === 0) continue;

    const matchedSlots = room.userSlots.filter((slot) => {
      if (!slot.name) return false;
      return slot.name.toLowerCase().includes(qLower);
    });

    if (matchedSlots.length > 0) {
      results.push({
        room,
        matchedSlots,
      });
    }
  }

  return results;
}

// ---------- 6b) Mod players list ----------

export async function fetchModPlayers(options?: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<ModPlayerSummary[]> {
  const { status, data } = await httpGet<ModPlayerSummary[]>("list-mod-players", {
    query: options?.query,
    limit: options?.limit,
    offset: options?.offset,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

// ---------- 7) Messages (DM) ----------

export interface DirectMessage {
  id: number;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  deliveredAt: string;
  readAt: string | null;
}

export interface MessagesReadResult {
  updated: number;
}

export interface ReadReceipt {
  conversationId: string;
  readerId: string;
  upToId: number;
  readAt: string;
}

export interface MessagesStreamHandlers {
  onConnected?: (payload: { playerId: string }) => void;
  onMessage?: (message: DirectMessage) => void;
  onRead?: (receipt: ReadReceipt) => void;
  onError?: (event: Event) => void;
}

function openDiscordMessagesPoller(
  playerId: string,
  handlers: MessagesStreamHandlers,
): StreamHandle {
  let closed = false;
  let since = new Date().toISOString();
  const seenIds = new Set<number>();

  handlers.onConnected?.({ playerId });

  async function poll() {
    if (closed) return;
    try {
      const { status, data } = await httpGet<DirectMessage[]>("messages/poll", { playerId, since });
      if (status === 200 && Array.isArray(data)) {
        for (const msg of data) {
          const numId = Number(msg?.id);
          if (!isNaN(numId) && !seenIds.has(numId)) {
            seenIds.add(numId);
            const normalized = { ...msg, id: numId };
            if (normalized.createdAt > since) since = normalized.createdAt;
            handlers.onMessage?.(normalized);
          }
        }
      }
    } catch {}
    if (!closed) setTimeout(poll, 2000);
  }

  poll();
  return { close: () => { closed = true; } };
}

export function openMessagesStream(
  playerId: string,
  handlers: MessagesStreamHandlers = {},
): StreamHandle | null {
  if (!playerId) return null;
  if (isDiscordActivityContext()) return openDiscordMessagesPoller(playerId, handlers);

  const url = buildUrl("messages/stream", { playerId });

  const MLOG = "[messages-stream]";
  return openGMSSEStream(
    url,
    (eventName, data) => {
      try {
        const parsed = JSON.parse(data);
        switch (eventName) {
          case "connected":
            handlers.onConnected?.(parsed);
            break;
          case "message":
            handlers.onMessage?.(parsed as DirectMessage);
            break;
          case "read":
            handlers.onRead?.(parsed as ReadReceipt);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error(MLOG, "parse error:", e, "raw:", data);
      }
    },
    () => {
      handlers.onError?.(new Event("error"));
    },
  );
}

export async function sendMessage(params: {
  fromPlayerId: string;
  toPlayerId: string;
  roomId: string;
  text: string;
}): Promise<DirectMessage | null> {
  const { fromPlayerId, toPlayerId, roomId, text } = params;
  if (!fromPlayerId || !toPlayerId || !roomId || !text) return null;
  if (fromPlayerId === toPlayerId) return null;

  const { status, data } = await httpPost<DirectMessage>("messages/send", {
    fromPlayerId,
    toPlayerId,
    roomId,
    text,
  });

  if (status >= 200 && status < 300 && data) return data;
  return null;
}

export async function fetchMessagesThread(
  playerId: string,
  otherPlayerId: string,
  options?: { afterId?: number; beforeId?: number; limit?: number },
): Promise<DirectMessage[]> {
  if (!playerId || !otherPlayerId) return [];
  const { status, data } = await httpGet<DirectMessage[]>("messages/thread", {
    playerId,
    otherPlayerId,
    afterId: options?.afterId,
    beforeId: options?.beforeId,
    limit: options?.limit,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

export async function markMessagesRead(params: {
  playerId: string;
  otherPlayerId: string;
  upToId: number;
}): Promise<number> {
  const { playerId, otherPlayerId, upToId } = params;
  if (!playerId || !otherPlayerId || !upToId) return 0;

  const { status, data } = await httpPost<MessagesReadResult>(
    "messages/read",
    { playerId, otherPlayerId, upToId },
  );

  if (status !== 200 || !data) return 0;
  return data.updated ?? 0;
}
