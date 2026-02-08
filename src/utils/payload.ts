import { Atoms, playerDatabaseUserId } from "../store/atoms";
import type { GardenState } from "../store/atoms";
import { toastSimple } from "../ui/toast";
import { shareGlobal } from "./page-context";
import {
  fetchFriendsWithViews,
  fetchIncomingRequestsWithViews,
  respondFriendRequest,
  sendPlayerState,
  type PlayerView,
} from "./supabase";
import { getFriendSettings, onFriendSettingsChange } from "./friendSettings";
import { readAriesPath } from "./localStorage";
import { getLocalVersion } from "./version";
import { PlayersService } from "../services/players";

export type PlayerPrivacyPayload = {
  showProfile: boolean;
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  hideRoomFromPublicList: boolean;
  showStats: boolean;
};

export type PlayerStatePayload = {
  playerId: string | null;
  playerName: string | null;
  avatarUrl: string | null;
  avatar?: string[] | null;
  modVersion: string | null;
  coins: number | null;
  room: {
    id: string | null;
    isPrivate: boolean | null;
    playersCount: number;
    userSlots: Array<{
      name: string | null;
      discordAvatarUrl: string | null;
      playerId: string | null;
      coins: number | null;
    }>;
  };
  privacy: PlayerPrivacyPayload;
  state: {
    garden: GardenState | null;
    inventory: any | null;
    stats: Record<string, any> | null;
    activityLog: any[] | null;
    journal: any | null;
  };
};

export type BuildPlayerStatePayloadOptions = {
  playerId?: string | null;
  slotIndex?: number;
  roomIsPrivate?: boolean | null;
};

const DEFAULT_PRIVACY: PlayerPrivacyPayload = {
  showProfile: true,
  showGarden: true,
  showInventory: true,
  showCoins: true,
  showActivityLog: true,
  showJournal: true,
  hideRoomFromPublicList: false,
  showStats: true,
};

function clampPlayers(n: unknown): number {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(6, value));
}

function findPlayersDeep(state: any): any[] {
  if (!state || typeof state !== "object") return [];
  const out: any[] = [];
  const seen = new Set<any>();
  const stack = [state];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const key of Object.keys(cur)) {
      const value = (cur as any)[key];
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => item && typeof item === "object")
      ) {
        const looksLikePlayer = value.some(
          (item) => "id" in item && "name" in item,
        );
        if (looksLikePlayer && /player/i.test(key)) {
          out.push(...(value as any[]));
        }
      }
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  const byId = new Map<string, any>();
  for (const entry of out) {
    if (entry?.id) {
      byId.set(String(entry.id), entry);
    }
  }
  return [...byId.values()];
}

function getPlayersArray(state: any): any[] {
  const direct =
    state?.fullState?.data?.players ??
    state?.data?.players ??
    state?.players;
  return Array.isArray(direct) ? direct : findPlayersDeep(state);
}

function getSlotsArray(state: any): any[] {
  const raw =
    state?.child?.data?.userSlots ??
    state?.fullState?.child?.data?.userSlots ??
    state?.data?.userSlots;

  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, any>);
    entries.sort((a, b) => {
      const ai = Number(a[0]);
      const bi = Number(b[0]);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([, value]) => value);
  }

  return [];
}

function selectSlot(
  slots: any[],
  options: BuildPlayerStatePayloadOptions,
): any | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const { slotIndex, playerId } = options;

  if (typeof slotIndex === "number" && Number.isInteger(slotIndex)) {
    const candidate = slots[slotIndex];
    if (candidate && typeof candidate === "object") return candidate;
  }

  const normalizedId = playerId != null ? String(playerId) : null;
  if (normalizedId) {
    for (const slot of slots) {
      if (!slot || typeof slot !== "object") continue;
      if (
        String(
          slot.databaseUserId ??
            slot.playerId ??
            slot.data?.databaseUserId ??
            slot.data?.playerId ??
            "",
        ) === normalizedId
      ) {
        return slot;
      }
    }
  }

  for (const slot of slots) {
    if (!slot || typeof slot !== "object") continue;
    if (slot.playerId || slot.databaseUserId || slot.data) return slot;
  }

  return null;
}

function resolvePlayer(
  players: any[],
  slot: any,
  options: BuildPlayerStatePayloadOptions,
): any | null {
  const candidate =
    options.playerId ??
    slot?.playerId ??
    slot?.databaseUserId ??
    slot?.data?.playerId ??
    slot?.data?.databaseUserId ??
    null;
  const normalized = candidate != null ? String(candidate) : null;

  if (normalized) {
    for (const player of players) {
      if (!player || typeof player !== "object") continue;
      if (String(player.id ?? "") === normalized) return player;
      if (String(player.databaseUserId ?? "") === normalized) return player;
    }
  }

  return players[0] ?? null;
}

function normalizeActivityLog(slotData: any): any[] | null {
  const logs =
    slotData?.activityLog ??
    slotData?.activityLogs ??
    slotData?.activitylog;
  return Array.isArray(logs) ? logs : null;
}

export async function buildPlayerStatePayload(
  options: BuildPlayerStatePayloadOptions = {},
): Promise<PlayerStatePayload | null> {
  try {
    const state = await Atoms.root.state.get();
    if (!state || typeof state !== "object") return null;

    const settings = getFriendSettings();
    const privacy: PlayerPrivacyPayload = {
      showProfile: DEFAULT_PRIVACY.showProfile,
      showGarden: settings.showGarden,
      showInventory: settings.showInventory,
      showCoins: settings.showCoins,
      showActivityLog: settings.showActivityLog,
      showJournal: settings.showJournal,
      showStats: settings.showStats,
      hideRoomFromPublicList: settings.hideRoomFromPublicList,
    };

    const players = getPlayersArray(state);
    const normalizedPlayers = Array.isArray(players) ? players : [];
    const slots = getSlotsArray(state).filter((slot) => !!slot);

    const coinsById = new Map<string, number | null>();
    for (const slot of slots) {
      const slotData = slot?.data ?? slot;
      const candidateId =
        slotData?.databaseUserId ??
        slot?.databaseUserId ??
        slotData?.playerId ??
        slot?.playerId ??
        null;
      if (candidateId == null) continue;
      const normalizedSlotId = String(candidateId);
      const coinCandidate =
        slotData?.coinsCount ??
        slotData?.data?.coinsCount ??
        slot?.coinsCount ??
        slot?.data?.coinsCount ??
        slotData?.coins ??
        slot?.coins ??
        null;
      const coinValue = Number(coinCandidate);
      coinsById.set(
        normalizedSlotId,
        Number.isFinite(coinValue) ? coinValue : null,
      );
    }

    const userSlots = normalizedPlayers.map((player) => {
      const playerDatabaseId =
        player?.databaseUserId ??
        player?.playerId ??
        player?.id ??
        null;
      const normalizedPlayerId =
        playerDatabaseId != null ? String(playerDatabaseId) : null;
      const slotId =
        normalizedPlayerId ??
        (typeof player?.id === "string" || typeof player?.id === "number"
          ? String(player.id)
          : null);
      const coins = slotId ? coinsById.get(slotId) ?? null : null;
      return {
        name: typeof player?.name === "string" ? player.name : null,
        discordAvatarUrl:
          typeof player?.discordAvatarUrl === "string"
            ? player.discordAvatarUrl
            : null,
        playerId: slotId,
        coins,
      };
    });

    const myDatabaseUserId = await playerDatabaseUserId.get();
    if (slots.length === 0) return null;

    const slot = selectSlot(slots, {
      ...options,
      playerId: options.playerId ?? myDatabaseUserId ?? undefined,
    });
    if (!slot || typeof slot !== "object") return null;

    const slotData = slot.data ?? slot;
    if (!slotData || typeof slotData !== "object") return null;

    const resolvedPlayer = resolvePlayer(normalizedPlayers, slot, options);

    const playerId =
      slot.databaseUserId ??
      resolvedPlayer?.databaseUserId ??
      slot.playerId ??
      (resolvedPlayer?.id ?? null);

    const playerName =
      resolvedPlayer?.name ?? slotData?.name ?? slot?.name ?? null;

    const avatarUrl =
      resolvedPlayer?.discordAvatarUrl ??
      slotData?.discordAvatarUrl ??
      slot?.discordAvatarUrl ??
      null;
    const avatarRaw =
      resolvedPlayer?.cosmetic?.avatar ??
      slotData?.cosmetic?.avatar ??
      slot?.cosmetic?.avatar ??
      null;
    const avatar =
      Array.isArray(avatarRaw) && avatarRaw.length > 0
        ? avatarRaw.map((entry) => String(entry))
        : null;

    const coinCandidate =
      slotData?.coinsCount ??
      slot?.coinsCount ??
      slotData?.coins ??
      slot?.coins ??
      null;
    const coinValue = Number(coinCandidate);
    const coinsRaw = Number.isFinite(coinValue) ? coinValue : null;

    const roomId =
      (state?.data?.roomId as string) ??
      (state?.fullState?.data?.roomId as string) ??
      (state?.roomId as string) ??
      null;

    let playersCount =
      normalizedPlayers.length > 0 ? normalizedPlayers.length : slots.length;
    try {
      const atomValue = await Atoms.server.numPlayers.get();
      playersCount = clampPlayers(atomValue);
    } catch {
      // fallback sur derived count
    }

    const persistedActivityLog = readAriesPath<any[]>("activityLog.history");
    const activityLog = Array.isArray(persistedActivityLog)
      ? persistedActivityLog
      : normalizeActivityLog(slotData);

    const journalEntry =
      slotData?.journal ??
      slotData?.data?.journal ??
      slot?.journal ??
      slot?.data?.journal ??
      null;

    const localVersion = getLocalVersion();
    const modVersion = localVersion ? `Arie's mod ${localVersion}` : null;
    console.log("MOD VERSION: ", modVersion)


    const payload: PlayerStatePayload = {
      playerId: playerId != null ? String(playerId) : null,
      playerName: privacy.showProfile ? playerName : null,
      avatarUrl: privacy.showProfile ? avatarUrl : null,
      avatar: privacy.showProfile ? avatar : null,
      modVersion: modVersion,
      coins: privacy.showCoins ? coinsRaw : null,
      room: {
        id: roomId,
        isPrivate: privacy.hideRoomFromPublicList ?? null,
        playersCount,
        userSlots,
      },
      privacy,
      state: {
        garden: privacy.showGarden ? slotData?.garden ?? null : null,
        inventory: privacy.showInventory
          ? slotData?.inventory ?? slot?.inventory ?? null
          : null,
        stats:
          privacy.showStats &&
          typeof slotData?.stats === "object" &&
          slotData?.stats
            ? slotData.stats
            : null,
        activityLog: privacy.showActivityLog ? activityLog : null,
        journal: privacy.showJournal ? journalEntry : null,
      },
    };

    return payload;
  } catch (error) {
    console.error("[PlayerPayload] buildPlayerStatePayload failed", error);
    return null;
  }
}

const STATE_KEYS: Array<keyof PlayerStatePayload["state"]> = [
  "garden",
  "inventory",
  "stats",
  "activityLog",
  "journal",
];

function sanitizeActivityLogForCompare(
  log: PlayerStatePayload["state"]["activityLog"] | undefined | null,
): PlayerStatePayload["state"]["activityLog"] | null {
  if (!Array.isArray(log)) return null;
  return log.filter((entry) => entry?.action !== "feedPet");
}

function sanitizeStateForComparison(
  state: PlayerStatePayload["state"],
): PlayerStatePayload["state"] {
  const sanitizedActivityLog = sanitizeActivityLogForCompare(
    state.activityLog ?? null,
  );
  if (sanitizedActivityLog === state.activityLog) {
    return state;
  }
  return {
    ...state,
    activityLog: sanitizedActivityLog,
  };
}

/**
 * Snapshot complet du payload pour comparaison :
 * - privacy, coins, room...
 * - state nettoyé pour éviter le bruit
 */
function snapshotPayloadForComparison(
  payload: PlayerStatePayload,
): string | null {
  try {
    const sanitizedState = sanitizeStateForComparison(payload.state);
    const clone: PlayerStatePayload = {
      ...payload,
      state: sanitizedState,
    };
    return JSON.stringify(clone);
  } catch (error) {
    console.error(
      "[PlayerPayload] Failed to snapshot payload for comparison",
      error,
    );
    return null;
  }
}

function tryStringifyValue(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function logPlayerStatePayload(
  options?: BuildPlayerStatePayloadOptions,
): Promise<PlayerStatePayload | null> {
  return buildPlayerStatePayload(options);
}

shareGlobal("buildPlayerStatePayload", buildPlayerStatePayload);
shareGlobal("logPlayerStatePayload", logPlayerStatePayload);

let gameReadyWatcherInitialized = false;
let gameReadyTriggered = false;
let preferredReportingIntervalMs: number | undefined;
let friendRefreshLoopStarted = false;
const autoAcceptedRequestIds = new Set<string>();
let autoAcceptTimer: ReturnType<typeof setInterval> | null = null;
let autoAcceptWatcherInitialized = false;
let autoAcceptSettingsUnsubscribe: (() => void) | null = null;

async function warmSupabaseInitialFetch(): Promise<void> {
  try {
    const dbId = await playerDatabaseUserId.get();
    if (!dbId) return;
    const requests = await fetchIncomingRequestsWithViews(dbId);
    const acceptedCount = await maybeAutoAcceptIncomingRequests(
      dbId,
      requests,
    );
    if (acceptedCount > 0) {
      await fetchIncomingRequestsWithViews(dbId);
    }
    await fetchFriendsWithViews(dbId);
  } catch (error) {
    console.error(
      "[PlayerPayload] Failed to prefetch friends data",
      error,
    );
  }
}

async function maybeAutoAcceptIncomingRequests(
  playerId: string,
  requests: PlayerView[],
): Promise<number> {
  if (!requests || !requests.length) return 0;
  const { autoAcceptIncomingRequests } = getFriendSettings();
  if (!autoAcceptIncomingRequests) return 0;

  let acceptedCount = 0;
  for (const request of requests) {
    const otherId = request?.playerId;
    if (!otherId) continue;
    if (autoAcceptedRequestIds.has(otherId)) continue;
    try {
      const wasAccepted = await respondFriendRequest({
        playerId,
        otherPlayerId: otherId,
        action: "accept",
      });
      if (wasAccepted) {
        autoAcceptedRequestIds.add(otherId);
        acceptedCount += 1;
        void toastSimple(
          "Friends",
          `Auto-accepted incoming request from ${
            request.playerName ?? otherId
          }.`,
          "success",
        );
      }
    } catch (error) {
      console.error("[PlayerPayload] auto-accept request failed", error);
    }
  }
  return acceptedCount;
}

function startFriendDataRefreshLoop(): void {
  if (friendRefreshLoopStarted) return;
  friendRefreshLoopStarted = true;
  void warmSupabaseInitialFetch();
}

async function pollIncomingRequestsForAutoAccept(): Promise<void> {
  try {
    const playerId = await playerDatabaseUserId.get();
    if (!playerId) return;
    const requests = await fetchIncomingRequestsWithViews(playerId);
    await maybeAutoAcceptIncomingRequests(playerId, requests);
  } catch (error) {
    console.error("[PlayerPayload] auto-accept poll failed", error);
  }
}

function stopAutoAcceptLoop(): void {
  if (autoAcceptTimer === null) return;
  clearInterval(autoAcceptTimer);
  autoAcceptTimer = null;
}

function startAutoAcceptLoopIfEnabled(): void {
  const { autoAcceptIncomingRequests } = getFriendSettings();
  if (!autoAcceptIncomingRequests) {
    stopAutoAcceptLoop();
    return;
  }
  if (autoAcceptTimer !== null) return;
  void pollIncomingRequestsForAutoAccept();
  autoAcceptTimer = setInterval(() => {
    void pollIncomingRequestsForAutoAccept();
  }, 60_000);
}

function startAutoAcceptWatcher(): void {
  if (autoAcceptWatcherInitialized) return;
  autoAcceptWatcherInitialized = true;
  startAutoAcceptLoopIfEnabled();
  autoAcceptSettingsUnsubscribe = onFriendSettingsChange(() => {
    startAutoAcceptLoopIfEnabled();
  });
}

function stopAutoAcceptWatcher(): void {
  if (autoAcceptSettingsUnsubscribe) {
    autoAcceptSettingsUnsubscribe();
    autoAcceptSettingsUnsubscribe = null;
  }
  stopAutoAcceptLoop();
}

async function tryInitializeReporting(state?: any): Promise<void> {
  if (gameReadyTriggered) return;
  const snapshot = state ?? (await Atoms.root.state.get());
  const players = Array.isArray(snapshot?.data?.players)
    ? snapshot.data.players
    : [];
  if (players.length === 0) return;
  gameReadyTriggered = true;
  startPlayerStateReporting(preferredReportingIntervalMs);
  startFriendDataRefreshLoop();
}

export function startPlayerStateReportingWhenGameReady(
  intervalMs?: number,
): void {
  if (gameReadyWatcherInitialized) return;
  gameReadyWatcherInitialized = true;
  preferredReportingIntervalMs = intervalMs;
  void tryInitializeReporting();
  void Atoms.root.state.onChange((next) => {
    void tryInitializeReporting(next);
  });
  startAutoAcceptWatcher();
}

// ---------- Heartbeat + AFK logic ----------

let payloadReportingTimer: ReturnType<typeof setInterval> | null = null;
let isPayloadReporting = false;
let lastSentPayloadSnapshot: string | null = null;
let unchangedSnapshotCount = 0;

// 5 ticks * 60s = 5 min AFK keep-alive
const MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND = 5;

/**
 * Tick de heartbeat :
 * - build payload
 * - si null ou playerId invalide → rien
 * - compare snapshot complet avec le dernier envoyé
 *   - change → envoi
 *   - identique → on skip sauf toutes les 5 fois (keep-alive)
 */
async function buildAndSendPlayerState(): Promise<void> {
  if (isPayloadReporting) return;
  isPayloadReporting = true;
  try {
    const payload = await buildPlayerStatePayload();
    if (!payload) {
      return;
    }

    if (!payload.playerId || payload.playerId.length < 3) {
      return;
    }

    const snapshot = snapshotPayloadForComparison(payload);

    let mustSend = false;

    if (snapshot === null) {
      // On ne peut pas snapshot → on envoie pour ne pas rester coincé
      mustSend = true;
    } else if (lastSentPayloadSnapshot === null) {
      // Premier envoi
      mustSend = true;
    } else if (snapshot !== lastSentPayloadSnapshot) {
      // Payload différent
      mustSend = true;
    } else if (
      unchangedSnapshotCount + 1 >=
      MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND
    ) {
      // 5ème tick identique → keep-alive AFK
      mustSend = true;
    }

    if (!mustSend) {
      if (snapshot !== null) {
        unchangedSnapshotCount += 1;
      }
      return;
    }

    const ok = await sendPlayerState(payload);
    if (ok) {
      if (snapshot !== null) {
        lastSentPayloadSnapshot = snapshot;
        unchangedSnapshotCount = 0;
      }
    } else {
    }
  } catch (error) {
    console.error("[PlayerPayload] Failed to send payload:", error);
  } finally {
    isPayloadReporting = false;
  }
}

/**
 * Heartbeat :
 * - par défaut toutes les 60s
 * - envoi immédiat au démarrage
 */
export function startPlayerStateReporting(intervalMs = 60_000): void {
  if (payloadReportingTimer !== null) return;
  const normalizedMs =
    Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000;

  void buildAndSendPlayerState();
  payloadReportingTimer = setInterval(() => {
    void buildAndSendPlayerState();
  }, normalizedMs);
}

export function stopPlayerStateReporting(): void {
  if (payloadReportingTimer === null) return;
  clearInterval(payloadReportingTimer);
  payloadReportingTimer = null;
}
