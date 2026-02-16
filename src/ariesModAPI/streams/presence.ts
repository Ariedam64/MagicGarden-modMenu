// ariesModAPI/streams/presence.ts
// Stream d'événements pour la présence des joueurs (online/offline)

import { openUnifiedEvents } from "../client/events";
import { updateFriendPresenceInCache } from "../cache/friends";
import { updateGroupMemberPresenceInCache } from "../cache/welcome";
import type { StreamHandle, PresencePayload } from "../types";

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
 * Ouvre un stream pour les événements de présence.
 * Met à jour le cache friends et dispatch un refresh UI automatiquement.
 */
export function openPresenceStream(
  playerId: string,
  onPresence?: (payload: PresencePayload) => void,
): StreamHandle | null {
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onEvent: (eventName, data) => {
      if (eventName !== "presence") return;
      const parsed = safeJsonParse(data) as PresencePayload;

      // Update friend + group member caches with presence data
      if (parsed.playerId) {
        updateFriendPresenceInCache(
          parsed.playerId,
          parsed.online ?? false,
          parsed.lastEventAt ?? null,
          parsed.roomId,
        );
        updateGroupMemberPresenceInCache(
          parsed.playerId,
          parsed.online ?? false,
          parsed.lastEventAt ?? null,
          parsed.roomId,
        );

        // Notify UI
        try {
          window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
          window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
          window.dispatchEvent(new CustomEvent("qws:presence-updated", { detail: parsed }));
        } catch {}
      }

      // Forward to optional handler
      onPresence?.(parsed);
    },
  });
}
