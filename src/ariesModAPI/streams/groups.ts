// ariesModAPI/streams/groups.ts
// Stream d'événements pour les groupes — avec mise à jour inline du cache

import { openUnifiedEvents } from "../client/events";
import { fetchGroups } from "../endpoints/groups";
import { updateCachedGroups } from "../cache/welcome";
import { removeGroupConversationFromCache } from "../cache/conversations";
import { getCurrentPlayerId } from "../init";
import type { StreamHandle, GroupEventHandlers } from "../types";

function safeJsonParse(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// ── Debounced group refresh ──────────────────────────────────────────────────
// Multiple events can arrive in quick succession (e.g. bulk role changes).
// We debounce to avoid N re-fetches and N dispatches.

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGroupsRefresh(): void {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    _refreshTimer = null;
    try {
      const groups = await fetchGroups();
      if (groups) {
        updateCachedGroups(groups as any);
      }
      window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
    } catch (error) {
      console.error("[GroupsStream] Failed to refresh groups cache:", error);
    }
  }, 300);
}

// ── Stream opener ────────────────────────────────────────────────────────────

/**
 * Ouvre un stream pour les événements de groupes
 * @param playerId - ID du joueur
 * @param handlers - Handlers optionnels pour les événements
 * @returns StreamHandle pour fermer la connexion
 */
export function openGroupsStream(
  playerId: string,
  handlers: GroupEventHandlers = {},
): StreamHandle | null {
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
          scheduleGroupsRefresh();
          handlers.onMemberAdded?.(parsed);
          break;

        case "group_member_removed": {
          // If we are the one removed, clean up conversation cache
          const removedPlayerId = parsed.member?.playerId;
          const currentId = getCurrentPlayerId();
          if (parsed.groupId && removedPlayerId && currentId && removedPlayerId === currentId) {
            removeGroupConversationFromCache(Number(parsed.groupId));
            try {
              window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            } catch {}
          }
          scheduleGroupsRefresh();
          handlers.onMemberRemoved?.(parsed);
          break;
        }

        case "group_updated":
          scheduleGroupsRefresh();
          handlers.onUpdated?.(parsed);
          break;

        case "group_deleted":
          if (parsed.groupId) {
            removeGroupConversationFromCache(Number(parsed.groupId));
            try {
              window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            } catch {}
          }
          scheduleGroupsRefresh();
          handlers.onDeleted?.(parsed);
          break;

        case "group_role_changed":
          scheduleGroupsRefresh();
          handlers.onRoleChanged?.(parsed);
          break;

        case "group_read":
          handlers.onRead?.(parsed);
          break;

        default:
          break;
      }
    },
  });
}
