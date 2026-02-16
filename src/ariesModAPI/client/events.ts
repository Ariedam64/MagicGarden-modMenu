// ariesModAPI/client/events.ts
// Unified event stream - choisit automatiquement SSE (web) ou long polling (Discord)

import { isDiscordActivityContext } from "../../utils/discordCsp";
import type { StreamHandle, UnifiedSubscriber } from "../types";
import { openSSEStream } from "./sse";
import { startLongPollStream } from "./longPoll";

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

function dispatchUnifiedEvent(conn: UnifiedConnection, eventName: string, data: any): void {
  for (const sub of conn.subscribers) {
    sub.onEvent(eventName, data);
  }
}

function startUnifiedSSE(conn: UnifiedConnection): void {
  conn.handle = openSSEStream(
    "events/stream",
    (eventName, raw) => {
      const data = safeJsonParse(raw);

      if (eventName === "connected") {
        const payload = data && typeof data === "object" ? (data as any) : { playerId: conn.playerId };

        const lastId = Number(payload.lastEventId);
        if (Number.isFinite(lastId)) {
          conn.lastEventId = Math.max(conn.lastEventId, lastId);
        }

        // Server restart detection is handled in sse.ts
        // We just notify subscribers with the new connection info
        notifyConnected(conn, {
          playerId: payload.playerId ?? conn.playerId,
          lastEventId: Number.isFinite(lastId) ? lastId : undefined,
        });
        return;
      }

      dispatchUnifiedEvent(conn, eventName, data);
    },
    () => {
      // Reset so reconnected SSE will re-process the "connected" event
      conn.connectedNotified = false;
      for (const sub of conn.subscribers) {
        sub.onError?.(new Event("error"));
      }
    },
  );
}

function startUnifiedLongPoll(conn: UnifiedConnection): void {
  const pollHandle = startLongPollStream(
    (evt) => {
      dispatchUnifiedEvent(conn, evt.type, evt.data);
    },
    (payload) => {
      // Server restart detection is handled in longPoll.ts
      // We just update and notify with the current connection info
      conn.lastEventId = payload.lastEventId;
      notifyConnected(conn, {
        playerId: payload.playerId,
        lastEventId: payload.lastEventId,
      });
    },
    () => {
      for (const sub of conn.subscribers) {
        sub.onError?.(new Event("error"));
      }
    },
  );

  conn.handle = {
    close: () => {
      conn.closed = true;
      pollHandle.close();
    },
  };

  conn.pollAbort = () => pollHandle.pause();
  conn.pollKick = () => pollHandle.resume();
}

/**
 * Ouvre un stream d'événements unifié (SSE ou long polling selon le contexte)
 * @param playerId - ID du joueur
 * @param subscriber - Callbacks pour les événements
 * @returns StreamHandle pour fermer la connexion
 */
export function openUnifiedEvents(
  playerId: string,
  subscriber: UnifiedSubscriber,
): StreamHandle {
  let conn = _unifiedConnections.get(playerId);

  if (!conn) {
    const mode = isDiscordActivityContext() ? "poll" : "sse";

    conn = {
      playerId,
      mode,
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

// ========== Pause/Resume for Discord Long Polling ==========

let _pollPauseDepth = 0;

export function pauseDiscordLongPolls(): void {
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

export function resumeDiscordLongPolls(): void {
  if (!isDiscordActivityContext()) return;
  _pollPauseDepth = Math.max(0, _pollPauseDepth - 1);
  if (_pollPauseDepth > 0) return;
  for (const conn of _unifiedConnections.values()) {
    if (conn.mode !== "poll") continue;
    conn.pollPaused = false;
    conn.pollKick?.();
  }
}

export async function withDiscordPollPause<T>(fn: () => Promise<T>): Promise<T> {
  if (!isDiscordActivityContext()) return await fn();
  pauseDiscordLongPolls();
  try {
    return await fn();
  } finally {
    resumeDiscordLongPolls();
  }
}
