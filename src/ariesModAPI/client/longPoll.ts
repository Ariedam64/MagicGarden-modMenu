// ariesModAPI/client/longPoll.ts
// Long polling client pour Discord Activity (GM_xmlhttpRequest)

import { getApiKey } from "../../utils/localStorage";
import { LONG_POLL_TIMEOUT, LONG_POLL_BACKOFF_MAX } from "../config";
import type { StreamHandle, UnifiedPollResponse } from "../types";
import { buildUrl } from "./http";

// Déclaration GM_xmlhttpRequest
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "arraybuffer" | "blob" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
}): { abort(): void };

type GmLongPollResult<T> = {
  status: number;
  data: T | null;
  aborted?: boolean;
};

/**
 * Effectue une requête long polling via GM_xmlhttpRequest
 */
function gmLongPoll<T>(url: string): {
  abort: () => void;
  promise: Promise<GmLongPollResult<T>>;
} {
  let aborted = false;
  let req: { abort(): void } | null = null;

  const apiKey = getApiKey();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const promise = new Promise<GmLongPollResult<T>>((resolve) => {
    req = GM_xmlhttpRequest({
      method: "GET",
      url,
      headers,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText ? (JSON.parse(res.responseText) as T) : null;
            resolve({ status: res.status, data: parsed });
          } catch {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: () => {
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

/**
 * Démarre un stream long polling
 * @param onEvent - Callback pour chaque événement reçu
 * @param onConnected - Callback appelé lors de la première connexion réussie
 * @param onError - Callback en cas d'erreur
 */
export function startLongPollStream(
  onEvent: (event: { id: number; type: string; data: any; ts: string }) => void,
  onConnected?: (payload: { playerId: string; lastEventId: number }) => void,
  onError?: () => void,
): StreamHandle & {
  getLastEventId: () => number;
  pause: () => void;
  resume: () => void;
  kick: () => void;
} {
  let closed = false;
  let paused = false;
  let running = false;
  let token = 0;
  let lastEventId = 0;
  let backoff = 1000;
  let inFlight: { abort: () => void } | null = null;
  let knownServerSessionId: string | null = null;

  const schedule = (delay: number) => {
    if (closed || paused) return;
    setTimeout(poll, delay);
  };

  const poll = async (): Promise<void> => {
    if (closed || paused || running) return;
    running = true;
    const currentToken = ++token;

    const url = buildUrl("events/poll", {
      since: lastEventId,
      timeoutMs: LONG_POLL_TIMEOUT,
    });

    const pollReq = gmLongPoll<UnifiedPollResponse>(url);
    inFlight = { abort: pollReq.abort };
    const { status, data, aborted } = await pollReq.promise;
    inFlight = null;
    running = false;

    if (closed || paused || aborted || currentToken !== token) return;

    if (status === 200 && data) {
      // Detect server restart via serverSessionId
      if (knownServerSessionId !== null && data.serverSessionId !== knownServerSessionId) {
        console.log(
          "[Long Poll] 🔄 Server restart detected! Session changed from",
          knownServerSessionId,
          "to",
          data.serverSessionId,
        );

        // Reset client state
        lastEventId = 0;
        knownServerSessionId = data.serverSessionId;

        // Reconnect immediately to receive welcome event
        backoff = 1000;
        schedule(0);
        return;
      }

      // First connection: store the session ID
      if (knownServerSessionId === null) {
        knownServerSessionId = data.serverSessionId;
      }

      // Use the server's lastEventId as the source of truth
      const eventId = Number(data.lastEventId);
      if (Number.isFinite(eventId)) {
        lastEventId = eventId;
      }

      // Notify connected on first successful poll
      onConnected?.({
        playerId: data.playerId,
        lastEventId,
      });

      // Process events
      if (Array.isArray(data.events)) {
        for (const evt of data.events) {
          if (!evt || typeof evt.type !== "string") continue;
          onEvent(evt);
        }
      }

      backoff = 1000;
      schedule(0);
      return;
    }

    // Error
    onError?.();
    schedule(backoff);
    backoff = Math.min(LONG_POLL_BACKOFF_MAX, Math.floor(backoff * 1.7));
  };

  // Start polling
  poll();

  return {
    close: () => {
      closed = true;
      token += 1;
      running = false;
      inFlight?.abort();
    },
    getLastEventId: () => lastEventId,
    pause: () => {
      paused = true;
      token += 1;
      running = false;
      inFlight?.abort();
    },
    resume: () => {
      if (closed) return;
      paused = false;
      if (!running) {
        poll();
      }
    },
    kick: () => {
      if (closed || paused || running) return;
      poll();
    },
  };
}
