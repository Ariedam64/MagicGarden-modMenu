// src/ui/menus/communityHub/tabs/playerAvatar.ts
import { MGVersion } from "../../../../utils/mgVersion";
import { setImageSafe } from "../../../../utils/discordCsp";
import { withDiscordPollPause } from "../../../../ariesModAPI/client/events";

// Cache pour les images d'avatar chargées
const avatarImageCache = new Map<string, HTMLImageElement>();

/**
 * Load an avatar image from URL with caching (Discord CSP-safe)
 * Pauses long polling during image load
 */
async function loadAvatarImage(url: string): Promise<HTMLImageElement> {
  // Check cache first
  if (avatarImageCache.has(url)) {
    return avatarImageCache.get(url)!;
  }

  return withDiscordPollPause(async () => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        avatarImageCache.set(url, img);
        resolve(img);
      };

      img.onerror = () => {
        reject(new Error(`Failed to load avatar image: ${url}`));
      };

      // Use setImageSafe to bypass Discord CSP
      setImageSafe(img, url);
    });
  });
}

/**
 * Build avatar URL from cosmetic filename
 */
function buildAvatarUrl(cosmeticFileName: string): string | null {
  const version = MGVersion.get();
  if (!version) {
    console.warn("[PlayerAvatar] Game version not available yet");
    return null;
  }

  const url = `https://magicgarden.gg/version/${version}/assets/cosmetic/${cosmeticFileName}`;
  return url;
}

/**
 * Create a canvas with the player's avatar by layering cosmetic images
 */
export async function createAvatarCanvas(
  cosmeticFiles: string[],
  size: number = 128
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Load and draw each cosmetic layer
  for (const fileName of cosmeticFiles) {
    try {
      const url = buildAvatarUrl(fileName);
      if (!url) continue;

      const img = await loadAvatarImage(url);
      ctx.drawImage(img, 0, 0, size, size);
    } catch (error) {
      console.error(`[PlayerAvatar] Failed to load cosmetic ${fileName}:`, error);
      // Continue with other layers even if one fails
    }
  }

  return canvas;
}

/**
 * Create an avatar element (wrapper div with canvas inside)
 */
export async function createAvatarElement(
  cosmeticFiles: string[],
  size: number = 128
): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.borderRadius = "12px";
  container.style.overflow = "hidden";
  container.style.flexShrink = "0";

  try {
    // Create a larger canvas for zooming without blur
    const zoomFactor = 2.2;
    const largerSize = Math.round(size * zoomFactor);
    const canvas = await createAvatarCanvas(cosmeticFiles, largerSize);
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.imageRendering = "crisp-edges";
    container.appendChild(canvas);
  } catch (error) {
    console.error("[PlayerAvatar] Failed to create avatar:", error);
    // Show placeholder on error
    container.style.background = "rgba(255,255,255,0.05)";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.color = "rgba(255,255,255,0.3)";
    container.style.fontSize = "12px";
    container.textContent = "?";
  }

  return container;
}
