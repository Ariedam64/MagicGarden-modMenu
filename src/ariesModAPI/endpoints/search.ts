// ariesModAPI/endpoints/search.ts
// Endpoints pour la recherche de joueurs et rooms

import { fetchAvailableRooms } from "./rooms";
import type { PlayerRoomResult, RoomSearchResult, ModPlayerSummary } from "../types";
import { httpGet } from "../client/http";

/**
 * Recherche des joueurs par nom à travers toutes les rooms
 * @param rawQuery - Requête de recherche
 * @param options - Options de recherche
 * @returns Liste des résultats de recherche
 */
export async function searchPlayersByName(
  rawQuery: string,
  options?: { limitRooms?: number; minQueryLength?: number },
): Promise<PlayerRoomResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;
  if (query.length < minLen) return [];

  const limitRooms = options?.limitRooms ?? 200;
  const qLower = query.toLowerCase();
  const rooms = await fetchAvailableRooms(limitRooms);

  const map = new Map<string, PlayerRoomResult>();

  for (const room of rooms) {
    if (!room.userSlots || room.userSlots.length === 0) continue;

    for (const slot of room.userSlots) {
      if (!slot.name) continue;

      const nameLower = slot.name.toLowerCase();
      if (!nameLower.includes(qLower)) continue;

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

/**
 * Recherche des rooms par nom de joueur
 * @param rawQuery - Requête de recherche
 * @param options - Options de recherche
 * @returns Liste des rooms contenant des joueurs correspondants
 */
export async function searchRoomsByPlayerName(
  rawQuery: string,
  options?: { limitRooms?: number; minQueryLength?: number },
): Promise<RoomSearchResult[]> {
  const query = rawQuery.trim();
  const minLen = options?.minQueryLength ?? 2;
  if (query.length < minLen) return [];

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
      results.push({ room, matchedSlots });
    }
  }

  return results;
}

/**
 * Récupère la liste des joueurs avec le mod installé
 * @param options - Options de recherche
 * @returns Liste des joueurs avec le mod
 */
export async function fetchModPlayers(options?: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<ModPlayerSummary[]> {
  const { status, data } = await httpGet<ModPlayerSummary[]>("list-mod-players", {
    query: options?.query,
    limit: options?.limit,
    offset: options?.offset,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}
