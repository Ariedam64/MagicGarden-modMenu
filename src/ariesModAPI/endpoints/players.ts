// ariesModAPI/endpoints/players.ts
// Endpoints pour les vues de joueurs

import { httpGet, httpPost } from "../client/http";
import type { PlayerView, PlayerViewSection } from "../types";

/**
 * Récupère la vue d'un joueur spécifique
 * @param playerId - ID du joueur
 * @returns Vue du joueur ou null si non trouvé
 */
export async function fetchPlayerView(playerId: string): Promise<PlayerView | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<PlayerView>("get-player-view", { playerId });
  if (status === 404) return null;
  return data;
}

/**
 * Récupère les vues de plusieurs joueurs
 * @param playerIds - Liste des IDs de joueurs
 * @param options - Options de sections à inclure
 * @returns Liste des vues de joueurs
 */
export async function fetchPlayersView(
  playerIds: string[],
  options?: { sections?: PlayerViewSection[] | PlayerViewSection },
): Promise<PlayerView[]> {
  const ids = Array.from(
    new Set(
      (playerIds ?? []).map((x) => String(x).trim()).filter((x) => x.length >= 3),
    ),
  );
  if (ids.length === 0) return [];

  const body: any = { playerIds: ids };
  if (options?.sections) {
    body.sections = Array.isArray(options.sections)
      ? options.sections
      : [options.sections];
  }

  const { status, data } = await httpPost<PlayerView[]>("get-players-view", body);
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

/**
 * Récupère les détails complets d'un joueur avec toutes les sections disponibles
 * @param playerId - ID du joueur
 * @returns PlayerView complet ou null si erreur
 */
export async function fetchPlayerDetailsComplete(playerId: string): Promise<PlayerView | null> {
  if (!playerId) return null;

  const { status, data } = await httpGet<PlayerView>("get-player-view", {
    playerId,
  });

  if (status === 404) return null;
  return data;
}
