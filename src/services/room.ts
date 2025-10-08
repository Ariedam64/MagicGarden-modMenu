// src/services/room.ts
// Gestion des rooms publiques : lecture des états + join depuis l'UI.

import { publicRooms } from "../data/hardcoded-data.clean.js";
import {
  requestRoomEndpoint,
  joinRoom,
  isDiscordSurface as detectDiscordSurface,
  type JoinRoomResult,
  type RoomInfoPayload,
} from "../utils/api";

const MAX_PLAYERS = 6;

export interface PublicRoomDefinition {
  name: string;
  idRoom: string;
  category: string;
}

export interface PublicRoomStatus extends PublicRoomDefinition {
  players: number;
  capacity: number;
  isFull: boolean;
  lastUpdatedAt: number;
  currentGame?: string;
  error?: string;
}

function deriveCategoryFromName(name: string): string {
  const match = /^([a-zA-Z]+)/.exec(name);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return "other";
}

const PUBLIC_ROOMS: PublicRoomDefinition[] = publicRooms.map((room) => ({
  name: room.name,
  idRoom: room.idRoom,
  category: deriveCategoryFromName(room.name),
}));

const CUSTOM_ROOMS_STORAGE_KEY = "mg.customRooms";

interface StoredCustomRoomDefinition {
  name: string;
  idRoom: string;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizeRoomDefinition(room: StoredCustomRoomDefinition): PublicRoomDefinition | null {
  if (!room) return null;
  const name = typeof room.name === "string" ? room.name.trim() : "";
  const idRoom = typeof room.idRoom === "string" ? room.idRoom.trim() : "";
  if (!name || !idRoom) return null;
  return {
    name,
    idRoom,
    category: deriveCategoryFromName(name),
  } satisfies PublicRoomDefinition;
}

function loadStoredCustomRooms(): PublicRoomDefinition[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CUSTOM_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCustomRoomDefinition[];
    if (!Array.isArray(parsed)) return [];
    const result: PublicRoomDefinition[] = [];
    for (const entry of parsed) {
      const sanitized = sanitizeRoomDefinition(entry);
      if (sanitized) {
        result.push(sanitized);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function persistCustomRooms(rooms: PublicRoomDefinition[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload: StoredCustomRoomDefinition[] = rooms.map((room) => ({
      name: room.name,
      idRoom: room.idRoom,
    }));
    storage.setItem(CUSTOM_ROOMS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignored: persistence failure should not crash the UI.
  }
}

let customRoomsCache: PublicRoomDefinition[] | null = null;

function getCustomRoomsCache(): PublicRoomDefinition[] {
  if (!customRoomsCache) {
    customRoomsCache = loadStoredCustomRooms();
  }
  return customRoomsCache.map((room) => ({ ...room }));
}

function setCustomRoomsCache(rooms: PublicRoomDefinition[]): void {
  customRoomsCache = rooms.map((room) => ({ ...room }));
  persistCustomRooms(customRoomsCache);
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function fetchStatusesFor(definitions: PublicRoomDefinition[]): Promise<PublicRoomStatus[]> {
  const now = Date.now();
  return Promise.all(
    definitions.map(async (def) => {
      try {
        const response = await requestRoomEndpoint<RoomInfoPayload>(def.idRoom, {
          endpoint: "info",
          timeoutMs: 10_000,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload =
          response.parsed ??
          (() => {
            try {
              return JSON.parse(response.body) as RoomInfoPayload;
            } catch {
              return undefined;
            }
          })();

        const players = clampPlayerCount(typeof payload?.numPlayers === "number" ? payload.numPlayers : 0);
        const capacity = MAX_PLAYERS;
        const currentGame =
          typeof payload?.currentGame === "string" && payload.currentGame.trim().length
            ? payload.currentGame.trim()
            : undefined;
        return {
          ...def,
          players,
          capacity,
          isFull: players >= capacity,
          lastUpdatedAt: now,
          currentGame,
        } satisfies PublicRoomStatus;
      } catch (error) {
        const message = normalizeError(error);
        return {
          ...def,
          players: 0,
          capacity: MAX_PLAYERS,
          isFull: false,
          lastUpdatedAt: now,
          error: message,
        } satisfies PublicRoomStatus;
      }
    }),
  );
}

function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PLAYERS, Math.floor(value)));
}

function normalizeError(error: unknown): string {
  if (!error) return "Erreur inconnue.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Erreur inconnue.";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const RoomService = {
  getPublicRooms(): PublicRoomDefinition[] {
    return PUBLIC_ROOMS.map((room) => ({ ...room }));
  },

  getCustomRooms(): PublicRoomDefinition[] {
    return getCustomRoomsCache();
  },

  addCustomRoom(room: { name: string; idRoom: string }):
    | { ok: true; room: PublicRoomDefinition }
    | { ok: false; error: string } {
    const name = typeof room.name === "string" ? room.name.trim() : "";
    const idRoom = typeof room.idRoom === "string" ? room.idRoom.trim() : "";

    if (!name) {
      return { ok: false, error: "Room name is required." };
    }

    if (!idRoom) {
      return { ok: false, error: "Room identifier is required." };
    }

    const normalizedName = normalizeIdentifier(name);
    const normalizedId = normalizeIdentifier(idRoom);

    const allRooms = [...PUBLIC_ROOMS, ...getCustomRoomsCache()];
    if (allRooms.some((existing) => normalizeIdentifier(existing.idRoom) === normalizedId)) {
      return { ok: false, error: "This room already exists." };
    }

    if (allRooms.some((existing) => normalizeIdentifier(existing.name) === normalizedName)) {
      return { ok: false, error: "A room with this name already exists." };
    }

    const definition: PublicRoomDefinition = {
      name,
      idRoom,
      category: deriveCategoryFromName(name),
    };

    const next = [...getCustomRoomsCache(), definition];
    setCustomRoomsCache(next);
    return { ok: true, room: { ...definition } };
  },

  removeCustomRoom(idRoom: string): boolean {
    const normalizedId = normalizeIdentifier(idRoom);
    const rooms = getCustomRoomsCache();
    const filtered = rooms.filter((room) => normalizeIdentifier(room.idRoom) !== normalizedId);
    if (filtered.length === rooms.length) {
      return false;
    }
    setCustomRoomsCache(filtered);
    return true;
  },

  async fetchPublicRoomsStatus(): Promise<PublicRoomStatus[]> {
    const definitions = this.getPublicRooms();
    return fetchStatusesFor(definitions);
  },

  async fetchCustomRoomsStatus(): Promise<PublicRoomStatus[]> {
    const definitions = this.getCustomRooms();
    if (!definitions.length) return [];
    return fetchStatusesFor(definitions);
  },

  canJoinPublicRoom(room: PublicRoomStatus): boolean {
    if (room.error) return false;
    if (room.isFull) return false;
    if (this.isDiscordActivity()) return false;
    return true;
  },

  isDiscordActivity(): boolean {
    return detectDiscordSurface();
  },

  joinPublicRoom(room: Pick<PublicRoomStatus, "idRoom">): JoinRoomResult {
    const result = joinRoom(room.idRoom, { siteFallbackOnDiscord: true, preferSoft:false });
    if (!result.ok) {
    }
    return result;
  },
};

export type RoomServiceType = typeof RoomService;
