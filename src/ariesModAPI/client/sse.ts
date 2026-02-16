// ariesModAPI/client/sse.ts
// Server-Sent Events (SSE) client pour Web (non-Discord)

import { getApiKey } from "../../utils/localStorage";
import type { StreamHandle } from "../types";
import { buildUrl } from "./http";
import { SSE_RECONNECT_DELAY, LONG_POLL_BACKOFF_MAX } from "../config";

/**
 * Minimum stream lifetime (ms) before we consider it a "stable" connection
 * and reset the backoff. Prevents rapid reconnect loops when the server
 * accepts + immediately closes (e.g. during restart).
 */
const MIN_STABLE_STREAM_MS = 10_000;

/**
 * Ouvre un stream SSE avec reconnexion automatique.
 * - Une seule connexion active à la fois (guard `running`)
 * - `onError` appelé UNE SEULE FOIS par cycle de déconnexion
 * - Backoff exponentiel, ne se reset que si le stream est stable > 10s
 */
export function openSSEStream(
  path: string,
  onEvent: (eventName: string, data: string) => void,
  onError?: () => void,
): StreamHandle {
  let closed = false;
  let running = false;
  let wasConnected = false;
  let abortController: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = SSE_RECONNECT_DELAY;
  let knownServerSessionId: string | null = null;

  const url = buildUrl(path);

  const scheduleReconnect = () => {
    if (closed) return;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(startStream, backoff);
    backoff = Math.min(LONG_POLL_BACKOFF_MAX, Math.floor(backoff * 1.5));
  };

  /** Notify disconnect once per connection cycle, not on every retry */
  const notifyDisconnect = () => {
    if (!wasConnected) return;
    wasConnected = false;
    onError?.();
  };

  const startStream = async () => {
    reconnectTimer = null;
    if (closed || running) return;
    running = true;

    const apiKey = getApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    abortController = new AbortController();

    try {
      const response = await fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        running = false;
        notifyDisconnect();
        scheduleReconnect();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "";
      let currentEventData = "";
      const streamStartedAt = Date.now();

      const processLine = (line: string) => {
        if (!line.trim()) {
          if (currentEventType && currentEventData) {
            wasConnected = true;

            // Detect server restart via serverSessionId in "connected" event
            if (currentEventType === "connected") {
              try {
                const payload = JSON.parse(currentEventData);
                if (payload.serverSessionId) {
                  if (
                    knownServerSessionId !== null &&
                    payload.serverSessionId !== knownServerSessionId
                  ) {
                    console.log(
                      "[SSE] 🔄 Server restart detected! Session changed from",
                      knownServerSessionId,
                      "to",
                      payload.serverSessionId,
                    );
                    knownServerSessionId = payload.serverSessionId;
                  } else if (knownServerSessionId === null) {
                    knownServerSessionId = payload.serverSessionId;
                  }
                }
              } catch (e) {
                console.error("[SSE] Error parsing connected event:", e);
              }
            }

            // Isolate event handler errors — they must NEVER crash the stream
            try {
              onEvent(currentEventType, currentEventData);
            } catch (e) {
              console.error(`[SSE] Handler error for "${currentEventType}":`, e);
            }
          }
          currentEventType = "";
          currentEventData = "";
          return;
        }

        if (line.startsWith("event:")) {
          currentEventType = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          const data = line.substring(5).trim();
          currentEventData += (currentEventData ? "\n" : "") + data;
        }
      };

      while (!closed) {
        const { done, value } = await reader.read();
        if (done || closed) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      }

      running = false;

      // Only reset backoff if the stream was stable for a meaningful duration
      if (wasConnected && Date.now() - streamStartedAt > MIN_STABLE_STREAM_MS) {
        backoff = SSE_RECONNECT_DELAY;
      }

      if (!closed) {
        notifyDisconnect();
        scheduleReconnect();
      }
    } catch (err) {
      running = false;
      if (!closed) {
        notifyDisconnect();
        scheduleReconnect();
      }
    }
  };

  startStream();

  return {
    close: () => {
      closed = true;
      running = false;
      wasConnected = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        abortController?.abort();
      } catch {}
      abortController = null;
    },
  };
}
