// ariesModAPI/cache/friends.ts
// Cache pour les amis et demandes d'ami

import type {
  FriendSummary,
  PlayerView,
  PlayerPrivacyPayload,
  IncomingRequestView,
  FriendRequestOutgoing,
} from "../types";

// ========== Cache Variables ==========

let cachedFriendsView: PlayerView[] | null = null;
let cachedIncomingRequests: IncomingRequestView[] | null = null;
let cachedOutgoingRequests: FriendRequestOutgoing[] | null = null;

// Cache pour les détails complets des joueurs (par playerId)
const cachedPlayerDetails = new Map<string, PlayerView>();

// ========== Getters ==========

export function getCachedFriendsWithViews(): PlayerView[] {
  return cachedFriendsView ? [...cachedFriendsView] : [];
}

/**
 * @deprecated Use getCachedFriendsWithViews() instead
 */
export function getCachedFriendsSummary(): FriendSummary[] {
  // Convert PlayerView back to FriendSummary for API compatibility
  return cachedFriendsView
    ? cachedFriendsView.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        avatarUrl: p.avatarUrl,
        avatar: p.avatar || null,
        lastEventAt: p.lastEventAt,
        isOnline: p.isOnline,
        roomId: p.room,
      }))
    : [];
}

export function getCachedIncomingRequestsWithViews(): IncomingRequestView[] {
  return cachedIncomingRequests ? [...cachedIncomingRequests] : [];
}

export function getCachedOutgoingRequests(): FriendRequestOutgoing[] {
  return cachedOutgoingRequests ? [...cachedOutgoingRequests] : [];
}

export function getCachedPlayerDetails(playerId: string): PlayerView | null {
  return cachedPlayerDetails.get(playerId) || null;
}

// ========== Setters ==========

export function updateFriendsViewCache(friends: PlayerView[]): void {
  cachedFriendsView = friends;
}

/**
 * @deprecated Use updateFriendsViewCache() instead
 */
export function updateFriendsCache(friends: FriendSummary[]): void {
  // Convert FriendSummary to PlayerView and update cachedFriendsView
  cachedFriendsView = friends.map((f) => ({
    playerId: f.playerId,
    playerName: f.playerName,
    avatarUrl: f.avatarUrl,
    avatar: f.avatar,
    coins: null,
    room: f.roomId,
    hasModInstalled: false,
    isOnline: f.isOnline,
    lastEventAt: f.lastEventAt,
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
}

export function updateIncomingRequestsCache(requests: IncomingRequestView[]): void {
  cachedIncomingRequests = requests;
}

export function updateOutgoingRequestsCache(requests: FriendRequestOutgoing[]): void {
  cachedOutgoingRequests = requests;
}

export function updatePlayerDetailsCache(playerId: string, details: PlayerView): void {
  cachedPlayerDetails.set(playerId, details);
}

// ========== Cache Mutations ==========

export function addFriendToCache(friend: FriendSummary): void {
  if (!cachedFriendsView) cachedFriendsView = [];

  const existingIdx = cachedFriendsView.findIndex((f) => f.playerId === friend.playerId);
  const playerView: PlayerView = {
    playerId: friend.playerId,
    playerName: friend.playerName,
    avatarUrl: friend.avatarUrl,
    avatar: friend.avatar,
    coins: null,
    room: friend.roomId,
    hasModInstalled: false,
    isOnline: friend.isOnline,
    lastEventAt: friend.lastEventAt,
    privacy: {
      showGarden: true,
      showInventory: true,
      showCoins: true,
      showActivityLog: true,
      showJournal: true,
      hideRoomFromPublicList: false,
      showStats: true,
    },
  };

  if (existingIdx !== -1) {
    // Merge: SSE data may have richer info (isOnline, roomId) than optimistic entry
    cachedFriendsView = cachedFriendsView.map((f, i) =>
      i === existingIdx ? { ...f, ...playerView } : f,
    );
    return;
  }

  cachedFriendsView = [...cachedFriendsView, playerView];
}

export function removeFriendFromCache(playerId: string): void {
  if (cachedFriendsView) {
    cachedFriendsView = cachedFriendsView.filter((f) => f.playerId !== playerId);
  }
}

export function addIncomingRequestToCache(request: IncomingRequestView): void {
  if (!cachedIncomingRequests) cachedIncomingRequests = [];
  const existingIdx = cachedIncomingRequests.findIndex((r) => r.playerId === request.playerId);
  if (existingIdx !== -1) {
    // Merge: SSE data may have richer info than the optimistic entry
    cachedIncomingRequests = cachedIncomingRequests.map((r, i) =>
      i === existingIdx ? { ...r, ...request } : r,
    );
    return;
  }
  cachedIncomingRequests = [...cachedIncomingRequests, request];
}

export function removeIncomingRequestFromCache(playerId: string): void {
  if (!cachedIncomingRequests) return;
  cachedIncomingRequests = cachedIncomingRequests.filter((r) => r.playerId !== playerId);
}

export function addOutgoingRequestToCache(request: FriendRequestOutgoing): void {
  if (!cachedOutgoingRequests) cachedOutgoingRequests = [];
  const existingIdx = cachedOutgoingRequests.findIndex((r) => r.toPlayerId === request.toPlayerId);
  if (existingIdx !== -1) {
    // Merge: SSE data may have name/avatar that the optimistic entry lacked
    cachedOutgoingRequests = cachedOutgoingRequests.map((r, i) =>
      i === existingIdx ? { ...r, ...request } : r,
    );
    return;
  }
  cachedOutgoingRequests = [...cachedOutgoingRequests, request];
}

export function removeOutgoingRequestFromCache(toPlayerId: string): void {
  if (!cachedOutgoingRequests) return;
  cachedOutgoingRequests = cachedOutgoingRequests.filter((r) => r.toPlayerId !== toPlayerId);
}

export function updateFriendRoomInCache(
  playerId: string,
  room: string | null,
): void {
  if (!cachedFriendsView) return;
  cachedFriendsView = cachedFriendsView.map((f) =>
    f.playerId === playerId ? { ...f, room } : f,
  );
}

export function updateFriendPresenceInCache(
  playerId: string,
  isOnline: boolean,
  lastEventAt: string | null,
  roomId?: string | null,
): void {
  if (!cachedFriendsView) return;
  cachedFriendsView = cachedFriendsView.map((f) =>
    f.playerId === playerId
      ? { ...f, isOnline, lastEventAt, ...(roomId !== undefined ? { room: roomId } : {}) }
      : f,
  );
}

export function updateFriendPrivacyInCache(
  playerId: string,
  privacy: PlayerPrivacyPayload,
): void {
  if (!cachedFriendsView) return;
  cachedFriendsView = cachedFriendsView.map((f) =>
    f.playerId === playerId ? { ...f, privacy } : f,
  );
}

export function updateOutgoingRequestInCache(
  toPlayerId: string,
  updates: Partial<FriendRequestOutgoing>,
): void {
  if (!cachedOutgoingRequests) return;
  cachedOutgoingRequests = cachedOutgoingRequests.map((r) =>
    r.toPlayerId === toPlayerId ? { ...r, ...updates } : r,
  );
}

// ========== Count Helpers ==========

export function getIncomingRequestsCount(): number {
  return cachedIncomingRequests ? cachedIncomingRequests.length : 0;
}
