// supabase.ts
// Point d'entrée unique pour parler à tes Edge Functions Supabase
// à utiliser dans ton userscript / overlay.

const SUPABASE_FUNCTION_BASE =
  "https://pquktqrngyxkvrgtfygp.supabase.co/functions/v1/";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxdWt0cXJuZ3l4a3ZyZ3RmeWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTQzMDMsImV4cCI6MjA3NTE5MDMwM30.-d45t6qyEO54iz2SrjaoTUQjeNb6tngDx6pOQL7-Ubg";

// Si tu n'as pas les types Tampermonkey, ça évite que TS hurle
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (response: { status: number; responseText: string }) => void;
  onerror?: (error: any) => void;
}): void;

import type {
  PlayerStatePayload,
  PlayerPrivacyPayload,
} from "./payload";
import { garden, type GardenState } from "../store/atoms";

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
  players_count: number;
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

export interface PlayerView {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  coins: number | null;
  room: any | null;
  hasModInstalled: boolean;
  isOnline: boolean;
  lastEventAt: string | null;
  privacy: PlayerPrivacyPayload;
  state: PlayerViewState;
}

let cachedFriendsView: PlayerView[] | null = null;
let cachedIncomingRequests: PlayerView[] | null = null;

export function getCachedFriendsWithViews(): PlayerView[] {
  return cachedFriendsView ? [...cachedFriendsView] : [];
}

export function getCachedIncomingRequestsWithViews(): PlayerView[] {
  return cachedIncomingRequests ? [...cachedIncomingRequests] : [];
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

// sections possibles pour get-players-view (mappées à l’Edge)
export type PlayerViewSection =
  | "profile"
  | "garden"
  | "inventory"
  | "stats"
  | "activityLog"
  | "journal"
  | "room";

// ---------- Helpers HTTP ----------

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, SUPABASE_FUNCTION_BASE);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function httpGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const url = buildUrl(path, query);

    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            console.error("[supabase] GET parse error:", e, res.responseText);
            resolve({ status: res.status, data: null });
          }
        } else {
          console.error("[supabase] GET error:", res.status, res.responseText);
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        console.error("[supabase] GET request failed:", err);
        resolve({ status: 0, data: null });
      },
    });
  });
}

function httpPost<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve) => {
    const url = buildUrl(path);

    GM_xmlhttpRequest({
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      data: JSON.stringify(body),
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText
              ? (JSON.parse(res.responseText) as T)
              : null;
            resolve({ status: res.status, data: parsed });
          } catch (e) {
            console.error("[supabase] POST parse error:", e, res.responseText);
            resolve({ status: res.status, data: null });
          }
        } else {
          console.error(
            "[supabase] POST error:",
            res.status,
            res.responseText,
          );
          resolve({ status: res.status, data: null });
        }
      },
      onerror: (err) => {
        console.error("[supabase] POST request failed:", err);
        resolve({ status: 0, data: null });
      },
    });
  });
}

// ---------- 1) Envoi du state joueur ----------

export async function sendPlayerState(
  payload: PlayerStatePayload,
): Promise<boolean> {
  const { status } = await httpPost<null>("collect-state", payload);
  if (status === 204) return true;
  if (status === 429) {
    console.warn("[supabase] sendPlayerState rate-limited");
  }
  return false;
}

// ---------- 2) Rooms publiques ----------

export async function fetchAvailableRooms(
  limit = 50,
): Promise<Room[]> {
  const { data } = await httpGet<RoomDto[]>("list-rooms", { limit });
  if (!data || !Array.isArray(data)) return [];

  return data.map((r) => ({
    id: r.id,
    isPrivate: r.is_private,
    playersCount: r.players_count,
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

// ---------- 3) Player view (un / plusieurs) ----------

export async function fetchPlayerView(
  playerId: string,
): Promise<PlayerView | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<PlayerView>("get-player-view", {
    playerId,
  });
  if (status === 404) return null;
  return data;
}

/**
 * Récupère des PlayerView en batch, avec possibilité de limiter les sections.
 *
 * - si options.sections est omis → tout est renvoyé (comportement actuel)
 * - sinon tu peux passer :
 *    ["profile", "room"]
 *    ["profile", "garden"]
 *    etc.
 */
export async function fetchPlayersView(
  playerIds: string[],
  options?: {
    sections?: PlayerViewSection[] | PlayerViewSection;
  },
): Promise<PlayerView[]> {
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
    body.sections = Array.isArray(options.sections)
      ? options.sections
      : [options.sections];
  }

  const { status, data } = await httpPost<PlayerView[]>(
    "get-players-view",
    body,
  );

  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

// ---------- 4) Amis : demandes + réponse ----------

export async function sendFriendRequest(
  fromPlayerId: string,
  toPlayerId: string,
): Promise<boolean> {
  if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-request", {
    fromPlayerId,
    toPlayerId,
  });

  // 204 = ok, 409 = déjà ami / déjà pending / rejeté
  if (status === 204) return true;
  if (status === 409) {
    console.warn("[supabase] friend-request conflict (already exists)");
  }
  return false;
}

export async function respondFriendRequest(params: {
  playerId: string;
  otherPlayerId: string;
  action: FriendAction;
}): Promise<boolean> {
  const { playerId, otherPlayerId, action } = params;
  if (!playerId || !otherPlayerId || playerId === otherPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-respond", {
    playerId,
    otherPlayerId,
    action,
  });

  if (status === 204) return true;
  return false;
}

// ---------- 5) Amis : liste + pending ----------

export async function fetchFriendsIds(
  playerId: string,
): Promise<string[]> {
  if (!playerId) return [];

  const { status, data } = await httpGet<{
    playerId: string;
    friends: string[];
  }>("list-friends", { playerId });

  if (status !== 200 || !data || !Array.isArray(data.friends)) return [];
  return data.friends;
}

export async function fetchFriendsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const friendIds = await fetchFriendsIds(playerId);
  if (friendIds.length === 0) {
    cachedFriendsView = [];
    return [];
  }

  // Pour les friends, généralement tu as surtout besoin du profil + room
  const result = await fetchPlayersView(friendIds, { sections: ["profile","room"] });
  cachedFriendsView = result;
  return [...result];
}

export async function fetchFriendRequests(
  playerId: string,
): Promise<FriendRequestsResult> {
  if (!playerId) {
    return { playerId: "", incoming: [], outgoing: [] };
  }

  const { status, data } = await httpGet<FriendRequestsResult>(
    "list-friend-requests",
    { playerId },
  );

  if (status !== 200 || !data) {
    return { playerId, incoming: [], outgoing: [] };
  }

  return {
    playerId: data.playerId,
    incoming: Array.isArray(data.incoming) ? data.incoming : [],
    outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
  };
}

export async function fetchIncomingRequestsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const { incoming } = await fetchFriendRequests(playerId);
  const ids = incoming.map((r) => r.fromPlayerId);
  if (ids.length === 0) {
    cachedIncomingRequests = [];
    return [];
  }

  // Pour les requêtes entrantes, profil + room suffisent largement
  const result = await fetchPlayersView(ids, { sections: ["profile"] });
  cachedIncomingRequests = result;
  return [...result];
}

export async function fetchOutgoingRequestsWithViews(
  playerId: string,
): Promise<PlayerView[]> {
  const { outgoing } = await fetchFriendRequests(playerId);
  const ids = outgoing.map((r) => r.toPlayerId);
  if (ids.length === 0) return [];

  return fetchPlayersView(ids, { sections: ["profile"] });
}

export async function removeFriend(
  playerId: string,
  otherPlayerId: string,
): Promise<boolean> {
  if (!playerId || !otherPlayerId || playerId === otherPlayerId) {
    return false;
  }

  const { status } = await httpPost<null>("friend-remove", {
    playerId,
    otherPlayerId,
  });

  return status === 204;
}


// ---------- 6) Recherche de joueurs via les rooms publiques ----------

export async function searchPlayersByName(
  rawQuery: string,
  options?: {
    limitRooms?: number;       // combien de rooms max on fetch
    minQueryLength?: number;   // longueur minimale du pseudo
  },
): Promise<PlayerRoomResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;

  if (query.length < minLen) {
    // On évite de lancer une requête Supabase pour "a" ou "x"
    return [];
  }

  const limitRooms = options?.limitRooms ?? 200;
  const qLower = query.toLowerCase();

  // 1) On récupère les rooms publiques + leurs userSlots
  const rooms = await fetchAvailableRooms(limitRooms);

  // 2) On parcourt tout, on filtre sur les noms qui matchent
  const map = new Map<string, PlayerRoomResult>();

  for (const room of rooms) {
    if (!room.userSlots || room.userSlots.length === 0) continue;

    for (const slot of room.userSlots) {
      if (!slot.name) continue;

      const nameLower = slot.name.toLowerCase();
      if (!nameLower.includes(qLower)) continue;

      // Pas de playerId dispo ici, donc clé = roomId + name
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
  options?: {
    limitRooms?: number;      // combien de rooms max on fetch
    minQueryLength?: number;  // longueur minimale de la query
  },
): Promise<RoomSearchResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;

  if (query.length < minLen) {
    return [];
  }

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
      results.push({
        room,
        matchedSlots,
      });
    }
  }

  console.log(results);

  return results;
}
