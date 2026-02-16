// ariesModAPI/streams/messages.ts
// Stream d'événements pour les messages privés (DM)

import { openUnifiedEvents } from "../client/events";
import type {
  StreamHandle,
  MessagesStreamHandlers,
  DirectMessage,
  ReadReceipt,
} from "../types";

function safeJsonParse(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Ouvre un stream pour les événements de messages privés
 * @param playerId - ID du joueur
 * @param handlers - Handlers pour les événements
 * @returns StreamHandle pour fermer la connexion
 */
export function openMessagesStream(
  playerId: string,
  handlers: MessagesStreamHandlers = {},
): StreamHandle | null {
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
