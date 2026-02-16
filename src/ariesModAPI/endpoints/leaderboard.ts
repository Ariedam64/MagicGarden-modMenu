// ariesModAPI/endpoints/leaderboard.ts
// Endpoints pour les leaderboards

import { httpGet } from "../client/http";
import type { LeaderboardRow, LeaderboardResponse, LeaderboardRankResponse } from "../types";

/**
 * Récupère le leaderboard des coins
 * @param params - Paramètres optionnels (query, limit, offset)
 * @returns Liste des entrées du leaderboard
 */
export async function fetchLeaderboardCoins(params?: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<LeaderboardRow[]> {
  const { query, limit = 15, offset = 0 } = params || {};
  const queryParams: Record<string, string | number> = { limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  const { status, data } = await httpGet<LeaderboardResponse>("leaderboard/coins", queryParams);
  if (status !== 200 || !data || !Array.isArray(data.rows)) return [];
  return data.rows;
}

/**
 * Récupère le leaderboard des œufs éclos
 * @param params - Paramètres optionnels (query, limit, offset)
 * @returns Liste des entrées du leaderboard
 */
export async function fetchLeaderboardEggsHatched(params?: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<LeaderboardRow[]> {
  const { query, limit = 15, offset = 0 } = params || {};
  const queryParams: Record<string, string | number> = { limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  const { status, data } = await httpGet<LeaderboardResponse>(
    "leaderboard/eggs-hatched",
    queryParams,
  );
  if (status !== 200 || !data || !Array.isArray(data.rows)) return [];
  return data.rows;
}

/**
 * Récupère le rang d'un joueur dans le leaderboard des coins
 * @param playerId - ID du joueur
 * @returns Rang du joueur ou null
 */
export async function fetchLeaderboardCoinsRank(
  playerId: string,
): Promise<LeaderboardRankResponse | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>("leaderboard/coins/rank", {
    playerId,
  });
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Récupère le rang d'un joueur dans le leaderboard des œufs éclos
 * @param playerId - ID du joueur
 * @returns Rang du joueur ou null
 */
export async function fetchLeaderboardEggsHatchedRank(
  playerId: string,
): Promise<LeaderboardRankResponse | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>(
    "leaderboard/eggs-hatched/rank",
    { playerId },
  );
  if (status !== 200 || !data) return null;
  return data;
}
