// api.ts
// Point d'entrée unique pour parler à ton backend ariesmod-api.ariedam.fr

import { isDiscordActivityContext } from "./discordCsp";
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from "./localStorage";
export {
  setImageSafe,
  getAudioUrlSafe,
  installEmojiDataFetchInterceptor,
} from "./discordCsp";

const API_BASE_URL = "https://ariesmod-api.ariedam.fr/";
const API_ORIGIN = API_BASE_URL.replace(/\/$/, "");

// Si tu n'as pas les types Tampermonkey, ça évite que TS hurle
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "arraybuffer" | "blob" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
  onprogress?: (response: { status: number; readyState: number; responseText: string; loaded: number; total: number }) => void;
}): { abort(): void };

declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

export { clearApiKey, getApiKey, hasApiKey, setApiKey };

const hasCommunityAccess = (): boolean => hasApiKey();

/**
 * Ouvre une popup Discord OAuth pour obtenir une API key.
 * Retourne une Promise qui se résout avec l'API key ou null si échec.
 */
export function requestApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const authUrl = `${API_ORIGIN}/auth/discord/login`;

    const width = 600;
    const height = 700;
    const screenW = typeof screen !== "undefined" ? screen.width : window.innerWidth;
    const screenH = typeof screen !== "undefined" ? screen.height : window.innerHeight;
    const left = Math.max(0, Math.floor((screenW - width) / 2));
    const top = Math.max(0, Math.floor((screenH - height) / 2));

    const preferGmTab = isDiscordActivityContext();
    const popup = preferGmTab
      ? null
      : window.open(
          authUrl,
          "aries_discord_auth",
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`,
        );

    let openedWithGm = false;
    if (!popup) {
      if (typeof GM_openInTab === "function") {
        try {
          GM_openInTab(authUrl, { active: true, insert: true, setParent: true });
          openedWithGm = true;
          console.warn("[Auth] Popup blocked. Opened Discord auth in a new tab.");
        } catch (error) {
          console.warn("[Auth] GM_openInTab failed:", error);
        }
      }
      if (!openedWithGm) {
        console.error("Failed to open Discord auth popup - popup blocked?");
        resolve(null);
        return;
      }
    }

    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    let checkClosed: number | null = null;
    let pollKey: number | null = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (checkClosed !== null) {
        clearInterval(checkClosed);
        checkClosed = null;
      }
      if (pollKey !== null) {
        clearInterval(pollKey);
        pollKey = null;
      }
      window.removeEventListener("message", handleMessage);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      console.warn("Discord auth popup timed out");
      finish(null);
    }, 5 * 60 * 1000);

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== API_ORIGIN) return;
      const data = event.data as { type?: string; apiKey?: string; discordId?: string; discordUsername?: string };
      if (!data || data.type !== "aries_discord_auth" || !data.apiKey) return;

      cleanup();

      const apiKey = String(data.apiKey);
      const discordId = data.discordId ? String(data.discordId) : "";
      const discordUsername = data.discordUsername ? String(data.discordUsername) : "";

      console.log(`[Auth] Successfully authenticated as ${discordUsername} (${discordId})`);
      setApiKey(apiKey);

      try {
        popup.close();
      } catch {}

      finish(apiKey);
    };

    window.addEventListener("message", handleMessage);

    if (popup) {
      checkClosed = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        finish(null);
      }, 500);
    } else if (openedWithGm) {
      pollKey = window.setInterval(() => {
        const key = getApiKey();
        if (!key) return;
        cleanup();
        finish(key);
      }, 800);
    }
  });
}

/**
 * S'assure qu'on a une API key valide.
 * Si pas de clé, ouvre la popup Discord OAuth.
 */
export async function ensureApiKey(): Promise<string | null> {
  const existingKey = getApiKey();
  if (existingKey) return existingKey;

  console.log("[Auth] No API key found, requesting Discord authentication...");
  const newKey = await requestApiKey();

  if (!newKey) {
    console.error("[Auth] Failed to obtain API key");
    return null;
  }

  return newKey;
}

/** Handle retourné par les fonctions de stream SSE (remplace EventSource). */
export interface StreamHandle {
  close(): void;
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
  "presence",
  "group_message",
  "group_member_added",
  "group_member_removed",
  "group_updated",
  "group_deleted",
] as const;

function openGMSSEStream(
  url: string,
  onEvent: (eventName: string, data: string) => void,
  onError?: () => void,
): StreamHandle {
  let closed = false;
  let source: EventSource | null = null;
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

// ---------- Unified events (SSE + long-poll) ----------

interface UnifiedEvent {
  id: number;
  type: string;
  data: any;
  ts: string;
}

interface UnifiedPollResponse {
  playerId: string;
  lastEventId: number;
  events: UnifiedEvent[];
}

type UnifiedSubscriber = {
  onConnected?: (payload: { playerId: string; lastEventId?: number }) => void;
  onEvent: (eventName: string, data: any) => void;
  onError?: (event: Event) => void;
};

type UnifiedConnection = {
  playerId: string;
  mode: "sse" | "poll";
  subscribers: Set<UnifiedSubscriber>;
  handle: StreamHandle | null;
  lastEventId: number;
  connectedNotified: boolean;
  closed: boolean;
  pollPaused: boolean;
  pollAbort?: () => void;
  pollKick?: () => void;
  pollRunning: boolean;
  pollToken: number;
};

const _unifiedConnections = new Map<string, UnifiedConnection>();

function safeJsonParse(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function notifyConnected(
  conn: UnifiedConnection,
  payload: { playerId: string; lastEventId?: number },
): void {
  if (conn.connectedNotified) return;
  conn.connectedNotified = true;
  for (const sub of conn.subscribers) {
    sub.onConnected?.(payload);
  }
}

function dispatchUnifiedEvent(
  conn: UnifiedConnection,
  eventName: string,
  data: any,
): void {
  for (const sub of conn.subscribers) {
    sub.onEvent(eventName, data);
  }
}

function startUnifiedSSE(conn: UnifiedConnection): void {
  const url = buildUrl("events/stream", { playerId: conn.playerId });

  conn.handle = openGMSSEStream(
    url,
    (eventName, raw) => {
      const data = safeJsonParse(raw);

      if (eventName === "connected") {
        const payload =
          data && typeof data === "object"
            ? (data as any)
            : { playerId: conn.playerId };

        const lastId = Number(payload.lastEventId);
        if (Number.isFinite(lastId)) {
          conn.lastEventId = Math.max(conn.lastEventId, lastId);
        }

        notifyConnected(conn, {
          playerId: payload.playerId ?? conn.playerId,
          lastEventId: Number.isFinite(lastId) ? lastId : undefined,
        });
        return;
      }

      dispatchUnifiedEvent(conn, eventName, data);
    },
    () => {
      for (const sub of conn.subscribers) {
        sub.onError?.(new Event("error"));
      }
    },
  );
}

type GmLongPollResult<T> = {
  status: number;
  data: T | null;
  aborted?: boolean;
};

function gmLongPoll<T>(
  url: string,
): { abort: () => void; promise: Promise<GmLongPollResult<T>> } {
  let aborted = false;
  let req: { abort(): void } | null = null;
  const promise = new Promise<GmLongPollResult<T>>((resolve) => {
    req = GM_xmlhttpRequest({
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
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        if (aborted) {
          resolve({ status: 0, data: null, aborted: true });
          return;
        }
        resolve({ status: 0, data: null });
      },
    });
  });

  return {
    abort: () => {
      aborted = true;
      try {
        req?.abort();
      } catch {}
    },
    promise,
  };
}

function startUnifiedLongPoll(conn: UnifiedConnection): void {
  const POLL_TIMEOUT_MS = 25000;
  let backoff = 1000;
  const BACKOFF_MAX = 30000;
  let inFlight: { abort: () => void } | null = null;

  const schedule = (delay: number) => {
    if (conn.closed || conn.pollPaused) return;
    setTimeout(poll, delay);
  };

  const poll = async (): Promise<void> => {
    if (conn.closed || conn.pollPaused || conn.pollRunning) return;
    conn.pollRunning = true;
    const token = ++conn.pollToken;

    const url = buildUrl("events/poll", {
      playerId: conn.playerId,
      since: conn.lastEventId,
      timeoutMs: POLL_TIMEOUT_MS,
    });
    const pollReq = gmLongPoll<UnifiedPollResponse>(url);
    inFlight = { abort: pollReq.abort };
    const { status, data, aborted } = await pollReq.promise;
    inFlight = null;
    conn.pollRunning = false;

    if (conn.closed || conn.pollPaused || aborted || token !== conn.pollToken) return;

    if (status === 200 && data) {
      const lastId = Number(data.lastEventId);
      if (Number.isFinite(lastId)) {
        conn.lastEventId = Math.max(conn.lastEventId, lastId);
      }

      notifyConnected(conn, {
        playerId: data.playerId ?? conn.playerId,
        lastEventId: Number.isFinite(lastId) ? lastId : undefined,
      });

      if (Array.isArray(data.events)) {
        for (const evt of data.events) {
          if (!evt || typeof evt.type !== "string") continue;
          if (typeof evt.id === "number") {
            conn.lastEventId = Math.max(conn.lastEventId, evt.id);
          }
          dispatchUnifiedEvent(conn, evt.type, evt.data);
        }
      }

      backoff = 1000;
      schedule(0);
      return;
    }

    for (const sub of conn.subscribers) {
      sub.onError?.(new Event("error"));
    }

    schedule(backoff);
    backoff = Math.min(BACKOFF_MAX, Math.floor(backoff * 1.7));
  };

  poll();

  conn.handle = {
    close: () => {
      conn.closed = true;
      conn.pollToken += 1;
      conn.pollRunning = false;
      inFlight?.abort();
    },
  };

  conn.pollAbort = () => {
    conn.pollToken += 1;
    conn.pollRunning = false;
    inFlight?.abort();
  };

  conn.pollKick = () => {
    if (conn.closed || conn.pollPaused || conn.pollRunning) return;
    poll();
  };
}

function openUnifiedEvents(
  playerId: string,
  subscriber: UnifiedSubscriber,
): StreamHandle {
  let conn = _unifiedConnections.get(playerId);
  if (!conn) {
    conn = {
      playerId,
      mode: isDiscordActivityContext() ? "poll" : "sse",
      subscribers: new Set<UnifiedSubscriber>(),
      handle: null,
      lastEventId: 0,
      connectedNotified: false,
      closed: false,
      pollPaused: false,
      pollRunning: false,
      pollToken: 0,
    };
    _unifiedConnections.set(playerId, conn);

    if (conn.mode === "poll") {
      startUnifiedLongPoll(conn);
    } else {
      startUnifiedSSE(conn);
    }
  }

  conn.subscribers.add(subscriber);

  return {
    close: () => {
      conn!.subscribers.delete(subscriber);
      if (conn!.subscribers.size === 0) {
        conn!.closed = true;
        conn!.handle?.close();
        _unifiedConnections.delete(playerId);
      }
    },
  };
}

let _pollPauseDepth = 0;

function pauseDiscordLongPolls(): void {
  if (!isDiscordActivityContext()) return;
  _pollPauseDepth += 1;
  for (const conn of _unifiedConnections.values()) {
    if (conn.mode !== "poll") continue;
    conn.pollPaused = true;
    conn.pollToken += 1;
    conn.pollRunning = false;
    conn.pollAbort?.();
  }
}

function resumeDiscordLongPolls(): void {
  if (!isDiscordActivityContext()) return;
  _pollPauseDepth = Math.max(0, _pollPauseDepth - 1);
  if (_pollPauseDepth > 0) return;
  for (const conn of _unifiedConnections.values()) {
    if (conn.mode !== "poll") continue;
    conn.pollPaused = false;
    conn.pollKick?.();
  }
}

async function withDiscordPollPause<T>(fn: () => Promise<T>): Promise<T> {
  if (!isDiscordActivityContext()) return await fn();
  pauseDiscordLongPolls();
  try {
    return await fn();
  } finally {
    resumeDiscordLongPolls();
  }
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

export interface PlayerLeaderboardEntry {
  rank: number | null;
  total: number | null;
  value: number | null;
  row?: LeaderboardRow | null;
  coins?: number | null;
  eggsHatched?: number | null;
}

export interface PlayerLeaderboard {
  coins?: PlayerLeaderboardEntry | null;
  eggsHatched?: PlayerLeaderboardEntry | null;
  eggs?: PlayerLeaderboardEntry | null;
}

export interface PlayerView {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  avatar?: string[] | null;
  coins: number | null;
  leaderboard?: PlayerLeaderboard | null;
  room: any | null;
  hasModInstalled: boolean;
  modVersion?: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  privacy: PlayerPrivacyPayload;
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

export interface LeaderboardRow {
  playerId: string | null;
  playerName: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  coins: number | null;
  eggsHatched: number | null;
  lastEventAt: string | null;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
}

export interface LeaderboardRankResponse {
  rank: number;
  total: number;
  row: LeaderboardRow | null;
}

export type PlayerViewSection =
  | "profile"
  | "garden"
  | "inventory"
  | "stats"
  | "activityLog"
  | "journal"
  | "leaderboard"
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

async function fetchJson<T>(
  url: string,
  options: RequestInit,
  label: "GET" | "POST" | "PATCH" | "DELETE",
): Promise<{ status: number; data: T | null }> {
  try {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: options.credentials ?? "omit",
    });
    const text = await res.text();
    let parsed: T | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as T;
      } catch (e) {
      }
    }
    return { status: res.status, data: parsed };
  } catch (err) {
    throw err;
  }
}

function gmGet<T>(
  url: string,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        resolve({ status: 0, data: null });
      },
    });
  });
}

function gmPost<T>(
  url: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    GM_xmlhttpRequest({
      method: "POST",
      url,
      headers,
      data: JSON.stringify(body),
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        resolve({ status: 0, data: null });
      },
    });
  });
}

function gmPatch<T>(
  url: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    GM_xmlhttpRequest({
      method: "PATCH",
      url,
      headers,
      data: JSON.stringify(body),
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        resolve({ status: 0, data: null });
      },
    });
  });
}

function gmDelete<T>(
  url: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    GM_xmlhttpRequest({
      method: "DELETE",
      url,
      headers,
      data: body !== undefined ? JSON.stringify(body) : undefined,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        resolve({ status: 0, data: null });
      },
    });
  });
}

async function httpGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<{ status: number; data: T | null }> {
  const url = buildUrl(path, query);
  if (!isDiscordActivityContext()) {
    try {
      return await fetchJson<T>(url, { method: "GET" }, "GET");
    } catch {
      // fallback to GM
    }
  }
  return withDiscordPollPause(() => gmGet<T>(url));
}

async function httpPost<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  const url = buildUrl(path);
  if (!isDiscordActivityContext()) {
    try {
      return await fetchJson<T>(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "POST",
      );
    } catch {
      // fallback to GM
    }
  }
  return withDiscordPollPause(() => gmPost<T>(url, body));
}

async function httpPatch<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  const url = buildUrl(path);
  if (!isDiscordActivityContext()) {
    try {
      return await fetchJson<T>(
        url,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "PATCH",
      );
    } catch {
      // fallback to GM
    }
  }
  return withDiscordPollPause(() => gmPatch<T>(url, body));
}

async function httpDelete<T>(
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  const url = buildUrl(path);
  if (!isDiscordActivityContext()) {
    try {
      return await fetchJson<T>(
        url,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        "DELETE",
      );
    } catch {
      // fallback to GM
    }
  }
  return withDiscordPollPause(() => gmDelete<T>(url, body));
}

// ---------- 1) Player State ----------

export async function sendPlayerState(
  payload: PlayerStatePayload | null,
): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  if (!payload) return false;

  const { playerId, avatarUrl, ...cleanPayload } = payload as any;

  const { status } = await httpPost<null>('collect-state', cleanPayload);
  if (status === 204) return true;
  if (status === 429) {
    console.error('[api] sendPlayerState rate-limited');
  } else if (status === 401) {
    console.error('[api] sendPlayerState unauthorized - invalid or missing API key');
  }
  return false;
}

// ---------- 2) Rooms publiques ----------

export async function fetchAvailableRooms(limit = 50): Promise<Room[]> {
  if (!hasCommunityAccess()) return [];
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

// ---------- 3) Player view ----------

export async function fetchPlayerView(playerId: string): Promise<PlayerView | null> {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;
  const { status, data } = await httpGet<PlayerView>("get-player-view", { playerId });
  if (status === 404) return null;
  return data;
}

export async function fetchPlayersView(
  playerIds: string[],
  options?: { sections?: PlayerViewSection[] | PlayerViewSection },
): Promise<PlayerView[]> {
  if (!hasCommunityAccess()) return [];
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
    body.sections = Array.isArray(options.sections) ? options.sections : [options.sections];
  }

  const { status, data } = await httpPost<PlayerView[]>("get-players-view", body);
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

// ---------- 4) Friends ----------

export async function sendFriendRequest(toPlayerId: string): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  if (!toPlayerId) return false;

  const { status } = await httpPost<null>("friend-request", { toPlayerId });
  if (status === 204) return true;
  if (status === 409) console.warn("[api] friend-request conflict (already exists)");
  else if (status === 401) console.error('[api] sendFriendRequest unauthorized');
  return false;
}

export async function respondFriendRequest(params: {
  otherPlayerId: string;
  action: FriendAction;
}): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { otherPlayerId, action } = params;
  if (!otherPlayerId) return false;

  const { status } = await httpPost<null>("friend-respond", { otherPlayerId, action });
  if (status === 204) return true;
  if (status === 401) console.error('[api] respondFriendRequest unauthorized');
  return false;
}

export async function cancelFriendRequest(otherPlayerId: string): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  if (!otherPlayerId) return false;

  const { status } = await httpPost<null>("friend-cancel", { otherPlayerId });
  if (status === 401) console.error('[api] cancelFriendRequest unauthorized');
  return status === 204;
}

export async function removeFriend(otherPlayerId: string): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  if (!otherPlayerId) return false;

  const { status } = await httpPost<null>("friend-remove", { otherPlayerId });
  if (status === 401) console.error('[api] removeFriend unauthorized');
  return status === 204;
}

export async function fetchFriendsSummary(
  playerId: string, // kept for API compatibility, no longer used
): Promise<FriendSummary[]> {
  if (!hasCommunityAccess()) {
    cachedFriendsSummary = [];
    return [];
  }
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
  }>("list-friends");

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

export async function fetchFriendsIds(playerId: string): Promise<string[]> {
  const friends = await fetchFriendsSummary(playerId);
  return friends.map((f) => f.playerId);
}

export async function fetchFriendsWithViews(playerId: string): Promise<PlayerView[]> {
  const friendIds = await fetchFriendsIds(playerId);
  if (friendIds.length === 0) {
    cachedFriendsView = [];
    return [];
  }

  const result = await fetchPlayersView(friendIds, { sections: ["profile", "room"] });
  cachedFriendsView = result;
  return [...result];
}

export async function fetchFriendRequests(
  playerId: string, // kept for API compatibility, no longer used
): Promise<FriendRequestsResult> {
  if (!hasCommunityAccess()) {
    cachedOutgoingRequests = [];
    return { playerId, incoming: [], outgoing: [] };
  }
  if (!playerId) return { playerId: "", incoming: [], outgoing: [] };

  const { status, data } = await httpGet<FriendRequestsResult>("list-friend-requests");
  if (status !== 200 || !data) return { playerId, incoming: [], outgoing: [] };

  const result: FriendRequestsResult = {
    playerId: data.playerId ?? playerId,
    incoming: Array.isArray(data.incoming) ? data.incoming : [],
    outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
  };
  cachedOutgoingRequests = result.outgoing;
  return result;
}

export async function fetchIncomingRequestsWithViews(playerId: string): Promise<PlayerView[]> {
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

export async function fetchOutgoingRequestsWithViews(playerId: string): Promise<PlayerView[]> {
  const { outgoing } = await fetchFriendRequests(playerId);
  const ids = outgoing.map((r) => r.toPlayerId);
  if (ids.length === 0) return [];
  return fetchPlayersView(ids, { sections: ["profile"] });
}

export function openFriendRequestsStream(
  playerId: string,
  handlers: FriendRequestsStreamHandlers = {},
): StreamHandle | null {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onConnected: (payload) => {
      handlers.onConnected?.({ playerId: payload.playerId ?? playerId });
    },
    onError: (event) => {
      handlers.onError?.(event);
    },
    onEvent: (eventName, data) => {
      const parsed = safeJsonParse(data);
      switch (eventName) {
        case "friend_request":
          handlers.onRequest?.(parsed as FriendRequestStreamRequest);
          break;
        case "friend_response": {
          const resp = parsed as FriendRequestStreamResponse;
          handlers.onResponse?.(resp);
          if (resp.action === "accept") {
            handlers.onAccepted?.({
              requesterId: resp.requesterId,
              responderId: resp.responderId,
              updatedAt: resp.updatedAt,
            });
          } else if (resp.action === "reject") {
            handlers.onRejected?.({
              requesterId: resp.requesterId,
              responderId: resp.responderId,
              updatedAt: resp.updatedAt,
            });
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
    },
  });
}

// ---------- 5) Leaderboards ----------

export async function fetchLeaderboardCoins(limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  if (!hasCommunityAccess()) return [];
  const { status, data } = await httpGet<LeaderboardResponse>("leaderboard/coins", { limit, offset });
  if (status !== 200 || !data || !Array.isArray(data.rows)) return [];
  return data.rows;
}

export async function fetchLeaderboardEggsHatched(limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  if (!hasCommunityAccess()) return [];
  const { status, data } = await httpGet<LeaderboardResponse>("leaderboard/eggs-hatched", { limit, offset });
  if (status !== 200 || !data || !Array.isArray(data.rows)) return [];
  return data.rows;
}

export async function fetchLeaderboardCoinsRank(playerId: string): Promise<LeaderboardRankResponse | null> {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>("leaderboard/coins/rank", { playerId });
  if (status !== 200 || !data) return null;
  return data;
}

export async function fetchLeaderboardEggsHatchedRank(playerId: string): Promise<LeaderboardRankResponse | null> {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>("leaderboard/eggs-hatched/rank", { playerId });
  if (status !== 200 || !data) return null;
  return data;
}

// ---------- 6) Search ----------

export async function searchPlayersByName(
  rawQuery: string,
  options?: { limitRooms?: number; minQueryLength?: number },
): Promise<PlayerRoomResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;
  if (query.length < minLen) return [];

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
  options?: { limitRooms?: number; minQueryLength?: number },
): Promise<RoomSearchResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;
  if (query.length < minLen) return [];

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
      results.push({ room, matchedSlots });
    }
  }

  return results;
}

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

// ---------- 7) Groups ----------

export interface GroupSummary {
  id: string;
  name: string;
  ownerId: string;
  memberCount?: number;
  membersCount?: number;
  previewMembers?: Array<{
    playerId: string;
    playerName?: string | null;
    discordAvatarUrl?: string | null;
    avatarUrl?: string | null;
  }>;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
  [key: string]: any;
}

export interface GroupMember {
  playerId: string;
  name?: string | null;
  avatarUrl?: string | null;
  avatar?: string[] | null;
  joinedAt?: string;
  role?: "owner" | "member";
  [key: string]: any;
}

export interface GroupDetails {
  group?: GroupSummary;
  members?: GroupMember[];
  [key: string]: any;
}

export interface GroupMessage {
  id: number;
  groupId: string;
  senderId: string;
  text?: string;
  body?: string;
  createdAt: string;
  [key: string]: any;
}

export async function createGroup(params: {
  ownerId: string;
  name: string;
}): Promise<GroupSummary | null> {
  if (!hasCommunityAccess()) return null;
  const { ownerId, name } = params;
  if (!ownerId || !name) return null;
  const { status, data } = await httpPost<GroupSummary>("groups", { ownerId, name });
  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error('[api] createGroup unauthorized');
  return null;
}

export async function fetchGroups(playerId: string): Promise<GroupSummary[]> {
  if (!hasCommunityAccess()) return [];
  if (!playerId) return [];
  const { status, data } = await httpGet<GroupSummary[] | { playerId?: string; groups?: GroupSummary[] }>(
    "groups",
    { playerId },
  );
  if (status !== 200 || !data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.groups)) return data.groups;
  return [];
}

export async function fetchGroupDetails(groupId: string, playerId: string): Promise<GroupDetails | null> {
  if (!hasCommunityAccess()) return null;
  if (!groupId || !playerId) return null;
  const { status, data } = await httpGet<GroupDetails>(`groups/${groupId}`, { playerId });
  if (status !== 200 || !data) return null;
  return data;
}

export async function updateGroupName(params: { groupId: string; name: string }): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { groupId, name } = params;
  if (!groupId || !name) return false;
  const { status } = await httpPatch<null>(`groups/${groupId}`, { name });
  if (status === 401) console.error('[api] updateGroupName unauthorized');
  return status >= 200 && status < 300;
}

export async function deleteGroup(params: { groupId: string }): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { groupId } = params;
  if (!groupId) return false;
  const { status } = await httpDelete<null>(`groups/${groupId}`, {});
  if (status === 401) console.error('[api] deleteGroup unauthorized');
  return status >= 200 && status < 300;
}

export async function addGroupMember(params: { groupId: string; memberId: string }): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { groupId, memberId } = params;
  if (!groupId || !memberId) return false;
  const { status } = await httpPost<null>(`groups/${groupId}/members`, { memberId });
  if (status === 401) console.error('[api] addGroupMember unauthorized');
  return status >= 200 && status < 300;
}

export async function removeGroupMember(params: { groupId: string; memberId: string }): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { groupId, memberId } = params;
  if (!groupId || !memberId) return false;
  const { status } = await httpDelete<null>(`groups/${groupId}/members/${memberId}`, {});
  if (status === 401) console.error('[api] removeGroupMember unauthorized');
  return status >= 200 && status < 300;
}

export async function leaveGroup(params: { groupId: string }): Promise<boolean> {
  if (!hasCommunityAccess()) return false;
  const { groupId } = params;
  if (!groupId) return false;
  const { status } = await httpPost<null>(`groups/${groupId}/leave`, {});
  if (status === 401) console.error('[api] leaveGroup unauthorized');
  return status >= 200 && status < 300;
}

export async function sendGroupMessage(params: { groupId: string; text: string }): Promise<GroupMessage | null> {
  if (!hasCommunityAccess()) return null;
  const { groupId, text } = params;
  if (!groupId || !text) return null;
  const { status, data } = await httpPost<GroupMessage>(`groups/${groupId}/messages`, { text });
  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error('[api] sendGroupMessage unauthorized');
  return null;
}

export async function fetchGroupMessages(
  groupId: string,
  playerId: string,
  options?: { afterId?: number; beforeId?: number; limit?: number },
): Promise<GroupMessage[]> {
  if (!hasCommunityAccess()) return [];
  if (!groupId || !playerId) return [];
  const { status, data } = await httpGet<GroupMessage[]>(`groups/${groupId}/messages`, {
    playerId,
    afterId: options?.afterId,
    beforeId: options?.beforeId,
    limit: options?.limit,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

export interface GroupEventHandlers {
  onConnected?: (payload: { playerId: string; lastEventId?: number }) => void;
  onMessage?: (payload: any) => void;
  onMemberAdded?: (payload: any) => void;
  onMemberRemoved?: (payload: any) => void;
  onUpdated?: (payload: any) => void;
  onDeleted?: (payload: any) => void;
  onError?: (event: Event) => void;
}

export function openGroupsStream(
  playerId: string,
  handlers: GroupEventHandlers = {},
): StreamHandle | null {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onConnected: (payload) => {
      handlers.onConnected?.(payload);
    },
    onError: (event) => {
      handlers.onError?.(event);
    },
    onEvent: (eventName, data) => {
      const parsed = safeJsonParse(data);
      switch (eventName) {
        case "group_message":
          handlers.onMessage?.(parsed);
          break;
        case "group_member_added":
          handlers.onMemberAdded?.(parsed);
          break;
        case "group_member_removed":
          handlers.onMemberRemoved?.(parsed);
          break;
        case "group_updated":
          handlers.onUpdated?.(parsed);
          break;
        case "group_deleted":
          handlers.onDeleted?.(parsed);
          break;
        default:
          break;
      }
    },
  });
}

// ---------- 8) Messages (DM) ----------

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

export interface PresencePayload {
  playerId: string;
  online: boolean;
  lastEventAt: string;
  roomId: string | null;
}

export function openMessagesStream(
  playerId: string,
  handlers: MessagesStreamHandlers = {},
): StreamHandle | null {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onConnected: (payload) => {
      handlers.onConnected?.({ playerId: payload.playerId ?? playerId });
    },
    onError: (event) => {
      handlers.onError?.(event);
    },
    onEvent: (eventName, data) => {
      const parsed = safeJsonParse(data);
      switch (eventName) {
        case "message":
          handlers.onMessage?.(parsed as DirectMessage);
          break;
        case "read":
          handlers.onRead?.(parsed as ReadReceipt);
          break;
        default:
          break;
      }
    },
  });
}

export function openPresenceStream(
  playerId: string,
  onPresence: (payload: PresencePayload) => void,
): StreamHandle | null {
  if (!hasCommunityAccess()) return null;
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onEvent: (eventName, data) => {
      if (eventName !== "presence") return;
      const parsed = safeJsonParse(data);
      onPresence(parsed as PresencePayload);
    },
  });
}

export async function sendMessage(params: {
  toPlayerId: string;
  roomId: string;
  text: string;
}): Promise<DirectMessage | null> {
  if (!hasCommunityAccess()) return null;
  const { toPlayerId, roomId, text } = params;
  if (!toPlayerId || !roomId || !text) return null;

  const { status, data } = await httpPost<DirectMessage>("messages/send", {
    toPlayerId,
    roomId,
    text,
  });

  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error('[api] sendMessage unauthorized - invalid or missing API key');
  return null;
}

export async function fetchMessagesThread(
  playerId: string,
  otherPlayerId: string,
  options?: { afterId?: number; beforeId?: number; limit?: number },
): Promise<DirectMessage[]> {
  if (!hasCommunityAccess()) return [];
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
  otherPlayerId: string;
  upToId: number;
}): Promise<number> {
  if (!hasCommunityAccess()) return 0;
  const { otherPlayerId, upToId } = params;
  if (!otherPlayerId || !upToId) return 0;

  const { status, data } = await httpPost<MessagesReadResult>("messages/read", {
    otherPlayerId,
    upToId,
  });

  if (status !== 200 || !data) {
    if (status === 401) console.error('[api] markMessagesRead unauthorized');
    return 0;
  }
  return data.updated ?? 0;
}
