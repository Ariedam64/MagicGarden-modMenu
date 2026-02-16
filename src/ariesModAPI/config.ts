// ariesModAPI/config.ts
// Configuration de l'API Aries Mod

export const API_BASE_URL = "https://ariesmod-api.ariedam.fr/";
export const API_ORIGIN = API_BASE_URL.replace(/\/$/, "");

// Timeouts
export const DEFAULT_HTTP_TIMEOUT = 120000; // 2 minutes
export const SSE_RECONNECT_DELAY = 5000; // 5 secondes
export const LONG_POLL_TIMEOUT = 25000; // 25 secondes
export const LONG_POLL_BACKOFF_MAX = 30000; // 30 secondes

// Rate limiting & AFK
export const MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND = 5; // 5 ticks * 60s = 5 min
export const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 secondes
