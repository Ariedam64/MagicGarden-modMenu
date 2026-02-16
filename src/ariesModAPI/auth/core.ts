// ariesModAPI/auth/core.ts
// Authentification Discord OAuth pour obtenir l'API key

import { isDiscordActivityContext } from "../../utils/discordCsp";
import { getApiKey, hasApiKey, setApiKey } from "../../utils/localStorage";
import { API_ORIGIN } from "../config";

// Déclaration GM_openInTab
declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

/**
 * Ouvre une popup Discord OAuth pour obtenir une API key.
 * @returns Promise qui se résout avec l'API key ou null si échec.
 */
export function requestApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const authUrl = `${API_ORIGIN}/auth/discord/login`;

    const width = 600;
    const height = 700;
    const screenW = typeof screen !== "undefined" ? screen.width : window.innerWidth;
    const screenH = typeof screen !== "undefined" ? screen.height : window.innerHeight;
    const left = Math.max(0, Math.floor((screenW - width) / 2));
    const top = Math.max(0, Math.floor((screenH - height) / 2));

    const preferGmTab = isDiscordActivityContext();
    const popup = preferGmTab
      ? null
      : window.open(
          authUrl,
          "aries_discord_auth",
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`,
        );

    let openedWithGm = false;
    if (!popup) {
      if (typeof GM_openInTab === "function") {
        try {
          GM_openInTab(authUrl, { active: true, insert: true, setParent: true });
          openedWithGm = true;
          console.warn("[Auth] Popup blocked. Opened Discord auth in a new tab.");
        } catch (error) {
          console.warn("[Auth] GM_openInTab failed:", error);
        }
      }
      if (!openedWithGm) {
        console.error("Failed to open Discord auth popup - popup blocked?");
        resolve(null);
        return;
      }
    }

    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    let checkClosed: number | null = null;
    let pollKey: number | null = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (checkClosed !== null) {
        clearInterval(checkClosed);
        checkClosed = null;
      }
      if (pollKey !== null) {
        clearInterval(pollKey);
        pollKey = null;
      }
      window.removeEventListener("message", handleMessage);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      console.warn("Discord auth popup timed out");
      finish(null);
    }, 5 * 60 * 1000);

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== API_ORIGIN) return;
      const data = event.data as {
        type?: string;
        apiKey?: string;
        discordId?: string;
        discordUsername?: string;
      };
      if (!data || data.type !== "aries_discord_auth" || !data.apiKey) return;

      cleanup();

      const apiKey = String(data.apiKey);
      const discordId = data.discordId ? String(data.discordId) : "";
      const discordUsername = data.discordUsername ? String(data.discordUsername) : "";

      console.log(`[Auth] Successfully authenticated as ${discordUsername} (${discordId})`);
      setApiKey(apiKey);

      try {
        popup?.close();
      } catch {}

      finish(apiKey);
    };

    window.addEventListener("message", handleMessage);

    if (popup) {
      checkClosed = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        finish(null);
      }, 500);
    } else if (openedWithGm) {
      pollKey = window.setInterval(() => {
        const key = getApiKey();
        if (!key) return;
        cleanup();
        finish(key);
      }, 800);
    }
  });
}

/**
 * S'assure qu'on a une API key valide.
 * Si pas de clé, ouvre la popup Discord OAuth.
 */
export async function ensureApiKey(): Promise<string | null> {
  const existingKey = getApiKey();
  if (existingKey) return existingKey;

  console.log("[Auth] No API key found, requesting Discord authentication...");
  const newKey = await requestApiKey();

  if (!newKey) {
    console.error("[Auth] Failed to obtain API key");
    return null;
  }

  return newKey;
}

/**
 * Vérifie si l'utilisateur a une API key
 */
export { hasApiKey, getApiKey, setApiKey };
