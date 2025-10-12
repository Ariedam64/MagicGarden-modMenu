import { isDiscordSurface } from "./api";
import { pageWindow } from "./page-context";

const ROOMS_JSON_URL =
  "https://raw.githubusercontent.com/Ariedam64/MagicGarden-modMenu/refs/heads/main/rooms.json";

interface FetchOptions extends RequestInit {
  cache?: RequestCache;
}

/* ✅ Type explicite de la fonction GM_xhr */
type GmXhr = <TContext = any>(
  details: Tampermonkey.Request<TContext>
) => Tampermonkey.AbortHandle<void>;

/* ✅ Retourne GmXhr | undefined (plus de clash de types) */
function resolveGmXhr(): GmXhr | undefined {
  // GM_xmlhttpRequest global (Tampermonkey)
  if (typeof GM_xmlhttpRequest === "function") {
    return GM_xmlhttpRequest as GmXhr;
  }
  // GM.xmlHttpRequest (Greasemonkey)
  if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") {
    return GM.xmlHttpRequest.bind(GM) as unknown as GmXhr;
  }
  return undefined;
}

async function fetchTextWithFetch(url: string, options?: FetchOptions): Promise<string> {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) {
    throw new Error(`Failed to load remote resource: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function fetchTextWithGM(url: string, options?: FetchOptions): Promise<string> {
  const xhr = resolveGmXhr();
  if (!xhr) {
    throw new Error("GM_xmlhttpRequest not available");
  }

  return await new Promise<string>((resolve, reject) => {
    xhr({
      method: "GET",
      url,
      headers: options?.headers as Record<string, string> | undefined,
      onload: (res: Tampermonkey.Response<any>) => {
        if (res.status >= 200 && res.status < 300) {
          resolve(res.responseText ?? "");
        } else {
          reject(new Error(`GM_xmlhttpRequest failed: ${res.status}`));
        }
      },
      onerror: (res: Tampermonkey.ErrorResponse) => {
        reject(new Error(res.error ?? "GM_xmlhttpRequest error"));
      },
      ontimeout: () => reject(new Error("GM_xmlhttpRequest timeout")),
      onabort: () => reject(new Error("GM_xmlhttpRequest aborted")),
    } as Tampermonkey.Request<any>);
  });
}

async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const preferGM = isDiscordSurface();
  const hasGM = !!resolveGmXhr();

  if (preferGM && hasGM) {
    return await fetchTextWithGM(url, options);
  }

  try {
    return await fetchTextWithFetch(url, options);
  } catch (error) {
    if (hasGM) {
      return await fetchTextWithGM(url, options);
    }
    throw error;
  }
}

export interface RemoteRoomsPayload {
  publicRooms?: Record<string, string[]>;
  [key: string]: unknown;
}

export async function fetchRemoteRooms(): Promise<RemoteRoomsPayload> {
  const text = await fetchText(ROOMS_JSON_URL);
  try {
    return JSON.parse(text) as RemoteRoomsPayload;
  } catch (error) {
    throw new Error("Failed to parse rooms JSON", { cause: error });
  }
}

export async function logRemoteRooms(): Promise<void> {
  try {
    const rooms = await fetchRemoteRooms();
    const logger = (pageWindow?.console ?? console);
    logger.log("[MagicGarden] Remote rooms:", rooms);
  } catch (error) {
    console.error("[MagicGarden] Unable to retrieve rooms list:", error);
  }
}
