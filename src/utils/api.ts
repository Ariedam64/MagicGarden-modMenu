
export type Surface = "discord" | "web";

export interface EnvironmentInfo {
  surface: Surface;
  host: string;
  origin: string;
  isInIframe: boolean;
  platform: "desktop" | "mobile";
}

/** Detect whether the current page is embedded inside Discord or running standalone. */
export function detectEnvironment(): EnvironmentInfo {
  const isInIframe = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();

  const refHost = safeHost(document.referrer);
  const parentLooksDiscord =
    isInIframe && !!refHost && /(^|\.)discord(app)?\.com$/i.test(refHost);

  const host = location.hostname;
  const surface: Surface = parentLooksDiscord ? "discord" : "web";

  const platform: EnvironmentInfo["platform"] =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop";

  return {
    surface,
    host,
    origin: location.origin,
    isInIframe,
    platform,
  };
}

/** Convenience shortcut. */
export function isDiscordSurface(): boolean {
  return detectEnvironment().surface === "discord";
}

export type RoomEndpoint = "info";

/** Build the REST URL for a room endpoint. */
export function buildRoomApiUrl(
  roomIdOrCode: string,
  endpoint: RoomEndpoint = "info"
): string {
  return `${location.origin}/api/rooms/${encodeURIComponent(roomIdOrCode)}/${endpoint}`;
}

export interface RequestRoomOptions {
  jwt?: string;
  preferGM?: boolean;
  timeoutMs?: number;
  endpoint?: RoomEndpoint;
}

export interface RoomInfoPayload {
  roomId?: string;
  numPlayers?: number;
  currentGame?: string;
  [key: string]: unknown;
}

export interface RoomRequestResult<T = unknown> {
  url: string;
  status: number;
  ok: boolean;
  body: string;
  parsed?: T;
}

/** Execute a GET request with the Fetch API and a timeout. */
async function httpGetWithFetch(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs = 10_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers,
      signal: controller.signal,
    });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timeout);
  }
}

function httpGetWithGM(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs = 10_000
) {
  return new Promise<{ status: number; ok: boolean; body: string }>((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== "function") {
      reject(new Error("GM_xmlhttpRequest is not available"));
      return;
    }

    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers,
      timeout: timeoutMs,
      onload: (response) =>
        resolve({
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          body: response.responseText,
        }),
      onerror: (error) => reject(error),
      ontimeout: () => reject(new Error("GM_xmlhttpRequest timed out")),
    });
  });
}

export async function requestRoomEndpoint<T = unknown>(
  roomIdOrCode: string,
  options: RequestRoomOptions = {}
): Promise<RoomRequestResult<T>> {
  const endpoint = options.endpoint ?? "info";
  const url = buildRoomApiUrl(roomIdOrCode, endpoint);
  const headers: Record<string, string> = {};

  if (options.jwt) {
    headers["Authorization"] = `Bearer ${options.jwt}`;
  }

  let rawResponse: { status: number; ok: boolean; body: string } | undefined;

  if (options.preferGM && typeof GM_xmlhttpRequest === "function") {
    rawResponse = await httpGetWithGM(url, headers, options.timeoutMs);
  } else {
    try {
      rawResponse = await httpGetWithFetch(url, headers, options.timeoutMs);
    } catch (error) {
      if (typeof GM_xmlhttpRequest === "function") {
        rawResponse = await httpGetWithGM(url, headers, options.timeoutMs);
      } else {
        throw error;
      }
    }
  }

  let parsed: T | undefined;
  try {
    parsed = JSON.parse(rawResponse.body) as T;
  } catch {
    // Non JSON body – leave `parsed` undefined
  }

  return { url, ...rawResponse, parsed };
}

export async function getPlayersRoom(
  roomIdOrCode: string,
  options: Omit<RequestRoomOptions, "endpoint"> = {}
): Promise<number> {
  const response = await requestRoomEndpoint<RoomInfoPayload>(roomIdOrCode, {
    ...options,
    endpoint: "info",
  });

  if (!response.ok) {
    throw new Error(
      `Impossible de récupérer les joueurs de la room ${roomIdOrCode} (HTTP ${response.status}).`
    );
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

  if (!payload || typeof payload.numPlayers !== "number" || !Number.isFinite(payload.numPlayers)) {
    throw new Error(`Réponse invalide pour la room ${roomIdOrCode}: numPlayers absent.`);
  }

  return Math.max(0, Math.floor(payload.numPlayers));
}

export function logRoomResult(
  label: string,
  roomIdOrCode: string,
  response: Awaited<ReturnType<typeof requestRoomEndpoint>>
) {
  const timestamp = new Date().toLocaleTimeString();
  const header = `[${timestamp}] ${label} room=${roomIdOrCode} status=${response.status} ok=${response.ok}`;

  if (response.parsed !== undefined) {
    // eslint-disable-next-line no-console
    console.log(header, "\nURL:", response.url, "\nJSON:", response.parsed);
  } else {
    // eslint-disable-next-line no-console
    console.log(header, "\nURL:", response.url, "\nBody:", response.body.slice(0, 1000));
  }
}

export function extractJwtFromUrl(urlLike: string): string | undefined {
  try {
    const url = new URL(urlLike);
    const raw = url.searchParams.get("jwt");
    if (!raw) return undefined;

    let token = decodeURIComponent(raw);
    token = token.replace(/^%22|%22$/g, "");
    token = token.replace(/^"+|"+$/g, "");
    return token;
  } catch {
    return undefined;
  }
}

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/* ───────────────────────────── JOIN BY CODE ───────────────────────────── */

export interface JoinRoomOptions {
  /** Prefer SPA navigation (history + popstate) when possible. */
  preferSoft?: boolean;
  /** Perform a full reload when the soft navigation fails. Defaults to `true`. */
  hardIfSoftFails?: boolean;
  /**
   * Discord activities do not support switching rooms by code.
   * When `true`, redirect the user to the official website instead.
   */
  siteFallbackOnDiscord?: boolean;
  /** Open the site fallback in a new tab instead of the current window. */
  openInNewTab?: boolean;
}

export type JoinRoomMode = "soft" | "hard" | "site-fallback" | "noop" | "discord-unsupported";

export interface JoinRoomResult {
  ok: boolean;
  mode: JoinRoomMode;
  url?: string;
  message?: string;
}

/** Build a SPA (soft) URL pointing to `/r/<code>` while preserving the current query string. */
function buildSoftJoinUrl(roomCode: string): string {
  const merged = new URLSearchParams(location.search);
  const url = new URL(location.href);
  url.pathname = `/r/${encodeURIComponent(roomCode)}`;
  url.search = merged.toString();
  return url.toString();
}

/** Build a full reload URL pointing to `/r/<code>`. */
function buildHardJoinUrl(roomCode: string): string {
  return buildSoftJoinUrl(roomCode);
}

/**
 * Join a room by code or ID.
 * - On the official website we prefer SPA navigation when possible.
 * - On the Discord activity we either return an explicit unsupported message or
 *   redirect to the site if `siteFallbackOnDiscord` is enabled.
 */
export function joinRoom(roomCode: string, options: JoinRoomOptions = {}): JoinRoomResult {
  const env = detectEnvironment();
  const isDiscord = env.surface === "discord";
  const preferSoft = options.preferSoft ?? !isDiscord;
  const hardIfSoftFails = options.hardIfSoftFails ?? true;

  if (isDiscord) {
    if (options.siteFallbackOnDiscord) {
      const fallback = `https://magiccircle.gg/r/${encodeURIComponent(roomCode)}`;
      if (options.openInNewTab) {
        window.open(fallback, "_blank", "noopener,noreferrer");
      } else {
        location.assign(fallback);
      }
      return {
        ok: true,
        mode: "site-fallback",
        url: fallback,
        message: "Discord activity does not support room switching by code, redirecting to the official site.",
      };
    }

    return {
      ok: false,
      mode: "discord-unsupported",
      message: "Discord activity does not support joining a room by code. Open the website or use an activity invite.",
    };
  }

  const softUrl = buildSoftJoinUrl(roomCode);

  if (preferSoft) {
    try {
      const url = new URL(softUrl);
      if (url.origin === location.origin) {
        history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        // eslint-disable-next-line no-console
        console.log("[joinRoom] soft →", url.toString());
        return { ok: true, mode: "soft", url: url.toString() };
      }
    } catch {
      // Ignore and potentially fall back to a hard reload.
    }

    if (!hardIfSoftFails) {
      return {
        ok: false,
        mode: "noop",
        url: softUrl,
        message: "Soft navigation failed because the origins differ.",
      };
    }
  }

  const hardUrl = buildHardJoinUrl(roomCode);
  // eslint-disable-next-line no-console
  console.log("[joinRoom] hard →", hardUrl);
  location.assign(hardUrl);
  return { ok: true, mode: "hard", url: hardUrl };
}

/* ------------------------------------------------------------------ */
/* ---------------------------- Usage example ----------------------- */
/* ------------------------------------------------------------------ */
/*
(async () => {
  const env = detectEnvironment();
  console.log("[env]", env, "isDiscord?", isDiscordSurface());

  const room = "2";

  const response = await requestRoomEndpoint(room);
  logRoomResult("GET /info", room, response);

  const joinResult = joinRoom(room, { siteFallbackOnDiscord: true, openInNewTab: true });
  console.log("[joinRoom] result:", joinResult);
})();
*/
