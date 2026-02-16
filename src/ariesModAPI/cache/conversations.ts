// ariesModAPI/cache/conversations.ts
// Cache pour les conversations (DM friends + groups)

import type { DirectMessage, GroupMessage } from "../types";

// ========== Types ==========

export type MessageStatus = "pending" | "sent" | "read";

export interface CachedDirectMessage extends DirectMessage {
  _status?: MessageStatus;
}

export interface CachedGroupMessage extends GroupMessage {
  _status?: MessageStatus;
}

export interface CachedFriendConversation {
  conversationId: string;
  otherPlayerId: string;
  otherPlayerName: string | null;
  otherPlayerAvatarUrl: string | null;
  messages: CachedDirectMessage[];
  unreadCount: number;
}

export interface CachedGroupConversation {
  groupId: number;
  groupName: string;
  messages: CachedGroupMessage[];
  unreadCount: number;
}

// ========== Friend Conversations Cache ==========

let _cachedFriendConversations: CachedFriendConversation[] | null = null;

export function getCachedFriendConversations(): CachedFriendConversation[] {
  return _cachedFriendConversations ? [..._cachedFriendConversations] : [];
}

export function updateFriendConversationsCache(convs: CachedFriendConversation[]): void {
  _cachedFriendConversations = convs;
}

export function getCachedFriendConversationMessages(conversationId: string): CachedDirectMessage[] {
  if (!_cachedFriendConversations) return [];
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  return conv ? [...conv.messages] : [];
}

export function addMessageToFriendConversationCache(conversationId: string, msg: DirectMessage, status: MessageStatus = "sent"): void {
  if (!_cachedFriendConversations) return;
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  if (!conv) return;

  // 1) Check if message already exists by real ID
  const existingIndex = conv.messages.findIndex((m) => m.id === msg.id);
  if (existingIndex !== -1) {
    conv.messages[existingIndex] = { ...conv.messages[existingIndex], ...msg, _status: status };
    return;
  }

  // 2) Check for a matching pending message (negative ID, same sender + body)
  //    This handles SSE arriving before HTTP response
  const pendingIndex = conv.messages.findIndex(
    (m) => m.id < 0 && m.senderId === msg.senderId && m.body === msg.body,
  );
  if (pendingIndex !== -1) {
    conv.messages[pendingIndex] = { ...msg, _status: status };
    return;
  }

  // 3) Brand new message
  conv.messages.push({ ...msg, _status: status });
}

export function removeFriendConversationFromCache(otherPlayerId: string): void {
  if (!_cachedFriendConversations) return;
  _cachedFriendConversations = _cachedFriendConversations.filter(
    (c) => c.otherPlayerId !== otherPlayerId && c.conversationId !== otherPlayerId,
  );
}

export function removeMessageFromFriendConversationCache(conversationId: string, messageId: number): void {
  if (!_cachedFriendConversations) return;
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  if (!conv) return;
  conv.messages = conv.messages.filter((m) => m.id !== messageId);
}

export function updatePendingFriendMessage(conversationId: string, pendingId: number, newMsg: DirectMessage): void {
  if (!_cachedFriendConversations) return;
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  if (!conv) return;

  const pendingIndex = conv.messages.findIndex((m) => m.id === pendingId);
  if (pendingIndex === -1) return; // Pending already replaced by SSE

  // Check if the real message already exists (from SSE arriving between add and now)
  const realIndex = conv.messages.findIndex((m) => m.id === newMsg.id);
  if (realIndex !== -1 && realIndex !== pendingIndex) {
    conv.messages.splice(pendingIndex, 1);
  } else {
    conv.messages[pendingIndex] = { ...newMsg, _status: "sent" };
  }
}

export function markFriendConversationAsRead(conversationId: string, upToId: number, readAt: string, currentPlayerId: string): void {
  if (!_cachedFriendConversations) return;
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  if (!conv) return;
  conv.unreadCount = 0;

  for (const msg of conv.messages) {
    if (msg.id <= upToId && !msg.readAt) {
      msg.readAt = readAt;
    }
  }

  // Find the newest outgoing message that was read (sent by currentPlayer)
  let newestOutgoingReadId = 0;
  for (const msg of conv.messages) {
    if (msg.senderId === currentPlayerId && msg.id <= upToId && msg.id > newestOutgoingReadId) {
      newestOutgoingReadId = msg.id;
    }
  }

  if (newestOutgoingReadId > 0) {
    for (const msg of conv.messages) {
      if (msg.id === newestOutgoingReadId && msg._status === "sent") {
        msg._status = "read";
      }
    }
  }
}

// ========== Group Conversations Cache ==========

let _cachedGroupConversations: CachedGroupConversation[] | null = null;

export function getCachedGroupConversations(): CachedGroupConversation[] {
  return _cachedGroupConversations ? [..._cachedGroupConversations] : [];
}

export function updateGroupConversationsCache(convs: CachedGroupConversation[]): void {
  _cachedGroupConversations = convs;
}

export function getCachedGroupConversationMessages(groupId: number): CachedGroupMessage[] {
  if (!_cachedGroupConversations) return [];
  const conv = _cachedGroupConversations.find((c) => c.groupId === groupId);
  return conv ? [...conv.messages] : [];
}

export function ensureGroupConversationExists(groupId: number, groupName?: string): void {
  if (!_cachedGroupConversations) _cachedGroupConversations = [];
  const existing = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (existing) {
    if (groupName && !existing.groupName) existing.groupName = groupName;
    return;
  }
  _cachedGroupConversations.push({
    groupId,
    groupName: groupName || "",
    messages: [],
    unreadCount: 0,
  });
}

/**
 * Initialise une conversation de groupe à partir des données reçues via
 * l'événement `group_member_added` (conversation enrichie pour le nouveau membre).
 */
export function initGroupConversationFromEvent(
  groupId: number,
  groupName: string,
  messages: GroupMessage[],
  unreadCount: number,
): void {
  if (!_cachedGroupConversations) _cachedGroupConversations = [];
  const existing = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (existing) {
    if (groupName) existing.groupName = groupName;
    // Only populate if empty (don't overwrite existing data)
    if (existing.messages.length === 0) {
      existing.messages = messages.map((m) => ({ ...m, _status: "sent" as MessageStatus }));
      existing.unreadCount = unreadCount;
    }
    return;
  }
  _cachedGroupConversations.push({
    groupId,
    groupName: groupName || "",
    messages: messages.map((m) => ({ ...m, _status: "sent" as MessageStatus })),
    unreadCount,
  });
}

export function addMessageToGroupConversationCache(groupId: number, msg: GroupMessage, status: MessageStatus = "sent"): void {
  // Auto-create conversation entry if it doesn't exist yet (e.g. newly created group)
  ensureGroupConversationExists(groupId);
  const conv = _cachedGroupConversations!.find((c) => c.groupId === groupId);
  if (!conv) return;

  // 1) Check if message already exists by real ID
  const existingIndex = conv.messages.findIndex((m) => m.id === msg.id);
  if (existingIndex !== -1) {
    conv.messages[existingIndex] = { ...conv.messages[existingIndex], ...msg, _status: status };
    return;
  }

  // 2) Check for a matching pending message (negative ID, same sender + body)
  const pendingIndex = conv.messages.findIndex(
    (m) => m.id < 0 && m.senderId === msg.senderId && (m.body === msg.body || (m as Record<string, unknown>).text === msg.body),
  );
  if (pendingIndex !== -1) {
    conv.messages[pendingIndex] = { ...msg, _status: status };
    return;
  }

  // 3) Brand new message
  conv.messages.push({ ...msg, _status: status });
}

export function removeMessageFromGroupConversationCache(groupId: number, messageId: number): void {
  if (!_cachedGroupConversations) return;
  const conv = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (!conv) return;
  conv.messages = conv.messages.filter((m) => m.id !== messageId);
}

export function updatePendingGroupMessage(groupId: number, pendingId: number, newMsg: GroupMessage): void {
  if (!_cachedGroupConversations) return;
  const conv = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (!conv) return;

  const pendingIndex = conv.messages.findIndex((m) => m.id === pendingId);
  if (pendingIndex === -1) return; // Pending already replaced by SSE

  // Check if the real message already exists (from SSE)
  const realIndex = conv.messages.findIndex((m) => m.id === newMsg.id);
  if (realIndex !== -1 && realIndex !== pendingIndex) {
    conv.messages.splice(pendingIndex, 1);
  } else {
    conv.messages[pendingIndex] = { ...newMsg, _status: "sent" };
  }
}

export function markGroupConversationAsRead(
  groupId: number,
  readerId?: string,
  messageId?: number,
  currentPlayerId?: string,
): void {
  if (!_cachedGroupConversations) return;
  const conv = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (!conv) return;

  // No reader info → simple unread reset (called from UI)
  if (!readerId || !currentPlayerId) {
    conv.unreadCount = 0;
    return;
  }

  // Reader is us (SSE echo) → reset unread
  if (readerId === currentPlayerId) {
    conv.unreadCount = 0;
    return;
  }

  // Reader is someone else → mark our outgoing messages as "read" up to messageId
  if (messageId) {
    for (const msg of conv.messages) {
      if (msg.senderId === currentPlayerId && msg.id <= messageId && msg._status === "sent") {
        msg._status = "read";
      }
    }
  }
}

export function removeGroupConversationFromCache(groupId: number): void {
  if (!_cachedGroupConversations) return;
  _cachedGroupConversations = _cachedGroupConversations.filter((c) => c.groupId !== groupId);
}

// ========== Unread Count Helpers ==========

export function incrementFriendConversationUnread(conversationId: string): void {
  if (!_cachedFriendConversations) return;
  const conv = _cachedFriendConversations.find((c) => c.conversationId === conversationId);
  if (conv) {
    conv.unreadCount = (conv.unreadCount ?? 0) + 1;
  }
}

export function incrementGroupConversationUnread(groupId: number): void {
  if (!_cachedGroupConversations) return;
  const conv = _cachedGroupConversations.find((c) => c.groupId === groupId);
  if (conv) {
    conv.unreadCount = (conv.unreadCount ?? 0) + 1;
  }
}

export function getTotalFriendUnreadCount(): number {
  if (!_cachedFriendConversations) return 0;
  return _cachedFriendConversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
}

export function getTotalGroupUnreadCount(): number {
  if (!_cachedGroupConversations) return 0;
  return _cachedGroupConversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
}
