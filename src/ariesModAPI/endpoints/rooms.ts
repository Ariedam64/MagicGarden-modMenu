// ariesModAPI/endpoints/rooms.ts
// Endpoints pour les rooms publiques

import { httpGet } from "../client/http";
import type { Room } from "../types";

interface RoomDto {
  id: string;
  is_private: boolean;
  players_count: number | null;
  last_updated_at: string;
  last_updated_by_player_id: string | null;
  user_slots?: Array<{
    name: string;
    avatar_url?: string | null;
  }>;
}

/**
 * Récupère la liste des rooms publiques disponibles
 * @param limit - Nombre maximum de rooms à récupérer (défaut: 50)
 * @returns Liste des rooms publiques
 */
export async function fetchAvailableRooms(limit = 50): Promise<Room[]> {
  const { data } = await httpGet<RoomDto[]>("rooms", { limit });
  if (!data || !Array.isArray(data)) return [];

  return data.map((r) => ({
    id: r.id,
    isPrivate: r.is_private,
    playersCount: r.players_count ?? 0,
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
