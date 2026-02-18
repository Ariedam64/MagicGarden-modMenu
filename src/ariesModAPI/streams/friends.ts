// ariesModAPI/streams/friends.ts
// Stream d'événements pour les demandes d'ami

import { openUnifiedEvents } from "../client/events";
import type {
  StreamHandle,
  FriendRequestsStreamHandlers,
  FriendRequestStreamRequest,
  FriendRequestStreamResponse,
  FriendRequestStreamCancelled,
  FriendRequestStreamRemoved,
} from "../types";
import {
  addIncomingRequestToCache,
  removeIncomingRequestFromCache,
  addOutgoingRequestToCache,
  removeOutgoingRequestFromCache,
  updateOutgoingRequestInCache,
  addFriendToCache,
  removeFriendFromCache,
  updateFriendPrivacyInCache,
  updateFriendRoomInCache,
  updateFriendsViewCache,
  updateIncomingRequestsCache,
  updateOutgoingRequestsCache,
} from "../cache/friends";
import { updateFriendConversationsCache, updateGroupConversationsCache, markFriendConversationAsRead, markGroupConversationAsRead, addMessageToFriendConversationCache, addMessageToGroupConversationCache, incrementFriendConversationUnread, incrementGroupConversationUnread, initGroupConversationFromEvent, removeFriendConversationFromCache } from "../cache/conversations";
import { notifyWelcome, updateCachedGroupMembers, updateGroupMemberPresenceInCache, updateGroupMemberRoomInCache } from "../cache/welcome";
import { getCurrentPlayerId, updateCurrentPlayerId } from "../init";

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
 * Ouvre un stream pour les événements de demandes d'ami
 * @param playerId - ID du joueur
 * @param handlers - Handlers pour les événements
 * @returns StreamHandle pour fermer la connexion
 */
export function openFriendRequestsStream(
  playerId: string,
  handlers: FriendRequestsStreamHandlers = {},
): StreamHandle | null {
  if (!playerId) return null;

  return openUnifiedEvents(playerId, {
    onConnected: (payload) => {
      // Update the global current player ID when connected
      if (payload.playerId) {
        updateCurrentPlayerId(payload.playerId);
      }
      handlers.onConnected?.({ playerId: payload.playerId ?? playerId });
    },
    onError: (event) => {
      handlers.onError?.(event);
    },
    onEvent: (eventName, data) => {
      const parsed = safeJsonParse(data);
      switch (eventName) {
        case "welcome": {
          // IMPORTANT: Store the complete welcome payload in cache (includes modPlayers, publicRooms, etc.)
          notifyWelcome(parsed);

          // Convert WelcomeFriend to PlayerView
          const friends = (parsed.friends || []).map((f: any) => ({
            playerId: f.playerId,
            playerName: f.name || null,
            avatarUrl: f.avatarUrl || null,
            avatar: f.avatar || null,
            coins: null,
            room: f.roomId || null,
            hasModInstalled: false,
            isOnline: f.isOnline || false,
            lastEventAt: f.lastEventAt || null,
            badges: f.badges || null,
            privacy: {
              showGarden: true,
              showInventory: true,
              showCoins: true,
              showActivityLog: true,
              showJournal: true,
              hideRoomFromPublicList: false,
              showStats: true,
            },
          }));
          updateFriendsViewCache(friends);

          // Convert incoming requests to IncomingRequestView
          const incomingRequests = (parsed.friendRequests?.incoming || []).map((r: any) => ({
            playerId: r.otherPlayerId,
            playerName: r.playerName || null,
            avatarUrl: r.avatarUrl || null,
            avatar: null,
            coins: null,
            room: null,
            hasModInstalled: false,
            isOnline: false,
            lastEventAt: null,
            badges: r.badges || null,
            privacy: {
              showGarden: true,
              showInventory: true,
              showCoins: true,
              showActivityLog: true,
              showJournal: true,
              hideRoomFromPublicList: false,
              showStats: true,
            },
            createdAt: r.createdAt,
          }));
          updateIncomingRequestsCache(incomingRequests);

          // Update outgoing requests
          const outgoingRequests = (parsed.friendRequests?.outgoing || []).map((r: any) => ({
            toPlayerId: r.otherPlayerId,
            otherPlayerId: r.otherPlayerId,
            playerName: r.playerName || null,
            avatarUrl: r.avatarUrl || null,
            badges: r.badges || null,
            createdAt: r.createdAt,
          }));
          updateOutgoingRequestsCache(outgoingRequests);

          // Cache friend conversations from welcome
          const convData = parsed.conversations || {};
          const friendConvs = (convData.friends || []).map((c: any) => ({
            conversationId: c.conversationId,
            otherPlayerId: c.otherPlayerId,
            otherPlayerName: c.otherPlayerName || null,
            otherPlayerAvatarUrl: c.otherPlayerAvatarUrl || null,
            messages: (c.messages || []).map((m: any) => ({
              id: m.id,
              conversationId: c.conversationId,
              senderId: m.senderId,
              recipientId: m.recipientId,
              body: m.body,
              createdAt: m.createdAt,
              deliveredAt: m.deliveredAt || m.createdAt,
              readAt: m.readAt || null,
            })),
            unreadCount: c.unreadCount ?? 0,
          }));
          updateFriendConversationsCache(friendConvs);

          // Cache group conversations from welcome
          const groupConvs = (convData.groups || []).map((g: any) => ({
            groupId: Number(g.groupId),
            groupName: g.groupName || "",
            messages: (g.messages || []).map((m: any) => ({
              id: m.id,
              groupId: String(g.groupId),
              senderId: m.senderId,
              senderName: m.senderName || m.playerName || null,
              senderAvatarUrl: m.senderAvatarUrl || m.avatarUrl || m.discordAvatarUrl || null,
              body: m.body || m.text || "",
              createdAt: m.createdAt,
              readAt: m.readAt || null,
            })),
            unreadCount: g.unreadCount ?? 0,
          }));
          updateGroupConversationsCache(groupConvs);

          // Cache group members from welcome
          const groupMembers = (parsed.groupMembers || []).map((m: any) => ({
            playerId: m.playerId,
            name: m.name || null,
            avatarUrl: m.avatarUrl || null,
            avatar: m.avatar || null,
            badges: m.badges || null,
            lastEventAt: m.lastEventAt || null,
            roomId: m.roomId ?? null,
            isOnline: m.isOnline || false,
            groupIds: m.groupIds || [],
          }));
          updateCachedGroupMembers(groupMembers);

          // Notify UI to refresh all tabs (initial load)
          try {
            window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
            window.dispatchEvent(new CustomEvent("qws:friend-requests-refresh"));
            window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
          } catch {}
          break;
        }
        case "friend_request": {
          const req = parsed as FriendRequestStreamRequest;
          // Get the real current player ID (playerId from stream might be "auto")
          const currentPlayerId = getCurrentPlayerId() || playerId;
          // Update cache
          if (req.targetId === currentPlayerId) {
            // We're the target, add to incoming
            addIncomingRequestToCache({
              playerId: req.requesterId,
              playerName: req.requesterName || null,
              avatarUrl: req.requesterAvatarUrl || null,
              avatar: null,
              coins: null,
              room: null,
              hasModInstalled: false,
              isOnline: false,
              lastEventAt: null,
              badges: req.requesterBadges || null,
              privacy: {
                showGarden: true,
                showInventory: true,
                showCoins: true,
                showActivityLog: true,
                showJournal: true,
                hideRoomFromPublicList: false,
                showStats: true,
              },
              createdAt: req.createdAt,
            });
          } else if (req.requesterId === currentPlayerId) {
            // We're the requester, update or add to outgoing
            const existing = {
              toPlayerId: req.targetId,
              otherPlayerId: req.targetId,
              playerName: req.targetName || null,
              avatarUrl: req.targetAvatarUrl || null,
              badges: req.targetBadges || null,
              createdAt: req.createdAt,
            };
            addOutgoingRequestToCache(existing);
          }
          // Notify UI to refresh requests only (not friends list)
          try {
            window.dispatchEvent(new CustomEvent("qws:friend-requests-refresh"));
          } catch {}
          handlers.onRequest?.(req);
          break;
        }
        case "friend_response": {
          const resp = parsed as FriendRequestStreamResponse;
          // Get the real current player ID (playerId from stream might be "auto")
          const currentPlayerId = getCurrentPlayerId() || playerId;
          // Remove from incoming/outgoing caches
          if (resp.requesterId === currentPlayerId) {
            // We sent the request, remove from outgoing
            removeOutgoingRequestFromCache(resp.responderId);
          } else if (resp.responderId === currentPlayerId) {
            // We received the request, remove from incoming
            removeIncomingRequestFromCache(resp.requesterId);
          }
          // If accepted, add to friends cache
          if (resp.action === "accept") {
            const isRequester = resp.requesterId === currentPlayerId;
            const otherId = isRequester ? resp.responderId : resp.requesterId;
            const otherName = isRequester ? resp.responderName : resp.requesterName;
            const otherAvatar = isRequester ? resp.responderAvatarUrl : resp.requesterAvatarUrl;
            const otherIsOnline = isRequester ? resp.responderIsOnline : resp.requesterIsOnline;
            const otherRoomId = isRequester ? resp.responderRoomId : resp.requesterRoomId;
            const otherBadges = isRequester ? resp.responderBadges : resp.requesterBadges;
            addFriendToCache({
              playerId: otherId,
              playerName: otherName || null,
              avatarUrl: otherAvatar || null,
              avatar: null,
              lastEventAt: resp.updatedAt,
              isOnline: otherIsOnline ?? false,
              roomId: otherRoomId ?? null,
              badges: otherBadges || null,
            });
            // Notify UI: friends list changed (new friend added)
            try {
              window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
            } catch {}
          }
          // Notify UI: requests list changed (request accepted or rejected)
          try {
            window.dispatchEvent(new CustomEvent("qws:friend-requests-refresh"));
          } catch {}
          handlers.onResponse?.(resp);
          if (resp.action === "accept") {
            handlers.onAccepted?.({
              requesterId: resp.requesterId,
              requesterName: resp.requesterName,
              requesterAvatarUrl: resp.requesterAvatarUrl,
              responderId: resp.responderId,
              responderName: resp.responderName,
              responderAvatarUrl: resp.responderAvatarUrl,
              updatedAt: resp.updatedAt,
            });
          } else if (resp.action === "reject") {
            handlers.onRejected?.({
              requesterId: resp.requesterId,
              requesterName: resp.requesterName,
              requesterAvatarUrl: resp.requesterAvatarUrl,
              responderId: resp.responderId,
              responderName: resp.responderName,
              responderAvatarUrl: resp.responderAvatarUrl,
              updatedAt: resp.updatedAt,
            });
          }
          break;
        }
        case "friend_cancelled": {
          const cancelled = parsed as FriendRequestStreamCancelled;
          // Get the real current player ID (playerId from stream might be "auto")
          const currentPlayerId = getCurrentPlayerId() || playerId;
          // Remove from incoming/outgoing caches
          if (cancelled.requesterId === currentPlayerId) {
            // We cancelled, remove from outgoing
            removeOutgoingRequestFromCache(cancelled.targetId);
          } else if (cancelled.targetId === currentPlayerId) {
            // They cancelled, remove from incoming
            removeIncomingRequestFromCache(cancelled.requesterId);
          }
          // Notify UI: requests list changed (request cancelled)
          try {
            window.dispatchEvent(new CustomEvent("qws:friend-requests-refresh"));
          } catch {}
          handlers.onCancelled?.(cancelled);
          break;
        }
        case "friend_removed": {
          const removed = parsed as FriendRequestStreamRemoved;
          // Get the real current player ID (playerId from stream might be "auto")
          const currentPlayerId = getCurrentPlayerId() || playerId;
          // Remove from friends cache
          const otherId =
            removed.removerId === currentPlayerId ? removed.removedId : removed.removerId;
          removeFriendFromCache(otherId);
          // Remove conversation with this friend
          removeFriendConversationFromCache(otherId);
          // Notify UI to refresh
          try {
            window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
            window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
          } catch {}
          handlers.onRemoved?.(removed);
          break;
        }
        case "privacy_updated": {
          // Update friend + group member privacy in cache
          if (parsed.playerId && parsed.privacy) {
            updateFriendPrivacyInCache(parsed.playerId, parsed.privacy);
          }
          // If hideRoomFromPublicList changed, roomId may become null for group members
          if (parsed.playerId && parsed.privacy?.hideRoomFromPublicList) {
            updateGroupMemberRoomInCache(parsed.playerId, null);
          }
          // Notify UIs
          try {
            window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
            window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
            window.dispatchEvent(
              new CustomEvent("qws:privacy-updated", { detail: parsed }),
            );
          } catch {}
          break;
        }
        case "room_changed": {
          // A friend or group member changed room
          if (parsed.playerId) {
            updateFriendRoomInCache(parsed.playerId, parsed.roomId ?? null);
            updateGroupMemberRoomInCache(parsed.playerId, parsed.roomId ?? null);
          }
          try {
            window.dispatchEvent(new CustomEvent("qws:friends-refresh"));
            window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
            window.dispatchEvent(
              new CustomEvent("qws:room-changed", { detail: parsed }),
            );
          } catch {}
          break;
        }
        case "read": {
          // Friend DM read receipt: { conversationId, readerId, upToId, readAt }
          if (parsed.conversationId && parsed.upToId) {
            const currentPlayerId = getCurrentPlayerId() || playerId;
            markFriendConversationAsRead(parsed.conversationId, parsed.upToId, parsed.readAt, currentPlayerId);
          }
          try {
            window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
          } catch {}
          break;
        }
        case "group_read": {
          // Group read receipt: { groupId, readerId, reader, messageId, readAt }
          if (parsed.groupId) {
            const currentPlayerId = getCurrentPlayerId() || playerId;
            markGroupConversationAsRead(
              Number(parsed.groupId),
              parsed.readerId,
              parsed.messageId,
              currentPlayerId,
            );
          }
          try {
            window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
          } catch {}
          break;
        }
        case "message": {
          // New friend DM: { conversationId, senderId, recipientId, body, createdAt, id, deliveredAt, readAt }
          if (parsed.conversationId && parsed.id) {
            const currentPlayerId = getCurrentPlayerId() || playerId;
            const msg = {
              id: parsed.id,
              conversationId: parsed.conversationId,
              senderId: parsed.senderId,
              recipientId: parsed.recipientId,
              body: parsed.body,
              createdAt: parsed.createdAt,
              deliveredAt: parsed.deliveredAt || parsed.createdAt,
              readAt: parsed.readAt || null,
            };
            addMessageToFriendConversationCache(parsed.conversationId, msg);
            // Increment unread if message is from someone else (not our own send)
            if (parsed.senderId !== currentPlayerId) {
              incrementFriendConversationUnread(parsed.conversationId);
            }
            try {
              window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            } catch {}
          }
          break;
        }
        case "group_member_added": {
          // Someone was added to a group.
          // If we are the new member, the event includes a `conversation` field with messages + unreadCount.
          if (parsed.groupId && parsed.conversation) {
            const messages = (parsed.conversation.messages || []).map((m: any) => ({
              id: m.id,
              groupId: String(parsed.groupId),
              senderId: m.senderId,
              senderName: m.senderName || m.playerName || null,
              senderAvatarUrl: m.senderAvatarUrl || m.avatarUrl || m.discordAvatarUrl || null,
              body: m.body || m.text || "",
              createdAt: m.createdAt,
              readAt: m.readAt || null,
            }));
            initGroupConversationFromEvent(
              Number(parsed.groupId),
              parsed.groupName || "",
              messages,
              parsed.conversation.unreadCount ?? 0,
            );
          }
          try {
            window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            window.dispatchEvent(new CustomEvent("qws:groups-refresh"));
          } catch {}
          break;
        }
        case "group_message": {
          // New group message: { groupId, message: { id, senderId, sender: { name, avatarUrl }, body, createdAt } }
          if (parsed.groupId && parsed.message) {
            const currentPlayerId = getCurrentPlayerId() || playerId;
            const sender = parsed.message.sender;
            const msg = {
              id: parsed.message.id,
              groupId: String(parsed.groupId),
              senderId: parsed.message.senderId,
              senderName: sender?.name || parsed.message.senderName || parsed.message.playerName || null,
              senderAvatarUrl: sender?.avatarUrl || parsed.message.senderAvatarUrl || parsed.message.avatarUrl || null,
              body: parsed.message.body || parsed.message.text || "",
              createdAt: parsed.message.createdAt,
            };
            addMessageToGroupConversationCache(Number(parsed.groupId), msg);
            // Increment unread if message is from someone else
            if (parsed.message.senderId !== currentPlayerId) {
              incrementGroupConversationUnread(Number(parsed.groupId));
            }
            try {
              window.dispatchEvent(new CustomEvent("qws:conversations-refresh"));
            } catch {}
          }
          break;
        }
        case "presence": {
          // Ignore presence events for now (handled elsewhere or not needed)
          break;
        }
        default:
          break;
      }
    },
  });
}
