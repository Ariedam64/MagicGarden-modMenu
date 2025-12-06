import { readAriesPath, writeAriesPath } from "./localStorage";
import {
  DEFAULT_FRIEND_SETTINGS,
  FRIEND_SETTINGS_PATH,
  type FriendSettings,
} from "./friendSettingsSchema";

export type { FriendSettings } from "./friendSettingsSchema";

const subscribers = new Set<(settings: FriendSettings) => void>();
let currentSettings: FriendSettings | null = null;
let initialized = false;

function persistSettings(settings: FriendSettings) {
  try {
    writeAriesPath(FRIEND_SETTINGS_PATH, settings);
  } catch {
    /* ignore */
  }
}

function ensureSettingsInitialized(): FriendSettings {
  if (initialized && currentSettings) {
    return currentSettings;
  }
  initialized = true;
  const stored = readAriesPath<Partial<FriendSettings>>(FRIEND_SETTINGS_PATH);
  const next = buildSettings(stored);
  currentSettings = next;
  if (!stored) {
    persistSettings(next);
  }
  return next;
}

function notifySubscribers(next: FriendSettings) {
  for (const cb of subscribers) {
    try {
      cb(next);
    } catch (error) {
      console.error("[FriendSettings] subscriber error", error);
    }
  }
}

function buildSettings(raw?: Partial<FriendSettings>): FriendSettings {
  return { ...DEFAULT_FRIEND_SETTINGS, ...(raw ?? {}) };
}

export function getFriendSettings(): FriendSettings {
  return ensureSettingsInitialized();
}

export function setFriendSettings(settings: FriendSettings): FriendSettings {
  ensureSettingsInitialized();
  const next = buildSettings(settings);
  currentSettings = next;
  notifySubscribers(next);
  persistSettings(next);
  return next;
}

export function patchFriendSettings(patch: Partial<FriendSettings>): FriendSettings {
  const base = ensureSettingsInitialized();
  return setFriendSettings({ ...base, ...patch });
}

export function onFriendSettingsChange(cb: (settings: FriendSettings) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
