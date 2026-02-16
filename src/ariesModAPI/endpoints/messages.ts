// ariesModAPI/endpoints/messages.ts
// Endpoints pour les messages privés (DM)

import { httpGet, httpPost } from "../client/http";
import type { DirectMessage, MessagesReadResult } from "../types";

/**
 * Envoie un message privé à un joueur
 * @param params - Paramètres du message
 * @returns Le message envoyé ou null en cas d'erreur
 */
export async function sendMessage(params: {
  toPlayerId: string;
  text: string;
}): Promise<DirectMessage | null> {
  const { toPlayerId, text } = params;
  if (!toPlayerId || !text) return null;

  const { status, data } = await httpPost<DirectMessage>("messages/send", {
    toPlayerId,
    text,
  });

  if (status >= 200 && status < 300 && data) return data;
  if (status === 401)
    console.error("[api] sendMessage unauthorized - invalid or missing API key");
  return null;
}

/**
 * Récupère le fil de conversation avec un joueur
 * @param otherPlayerId - ID de l'autre joueur
 * @param options - Options de pagination
 * @returns Liste des messages
 */
export async function fetchMessagesThread(
  otherPlayerId: string,
  options?: { afterId?: number; beforeId?: number; limit?: number },
): Promise<DirectMessage[]> {
  if (!otherPlayerId) return [];
  const { status, data } = await httpGet<DirectMessage[]>("messages/thread", {
    otherPlayerId,
    afterId: options?.afterId,
    beforeId: options?.beforeId,
    limit: options?.limit,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

/**
 * Marque des messages comme lus dans une conversation
 * @param params - Paramètres de lecture
 * @returns Nombre de messages marqués comme lus
 */
export async function markMessagesRead(params: {
  otherPlayerId: string;
  upToId: number;
}): Promise<number> {
  const { otherPlayerId, upToId } = params;
  if (!otherPlayerId || !upToId) return 0;

  const { status, data } = await httpPost<MessagesReadResult>("messages/read", {
    otherPlayerId,
    upToId,
  });

  if (status !== 200 || !data) {
    if (status === 401) console.error("[api] markMessagesRead unauthorized");
    return 0;
  }
  return data.updated ?? 0;
}
