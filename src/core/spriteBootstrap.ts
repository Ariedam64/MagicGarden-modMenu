import { pageWindow } from "../utils/page-context";
import { Sprites } from "./sprite";

const INITIAL_TIMEOUT_MS = 12_000;
const POLL_INTERVAL_MS = 100;
const LOG_PREFIX = "[SpritesBootstrap]";

let bootPromise: Promise<void> | null = null;
let listening = false;
let refreshScheduled = false;
let ready = false;

export function ensureSpritesReady(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  startListening();

  if (!bootPromise) {
    enqueueBootstrap("initial");
  }

  return bootPromise!;
}

export function areSpritesReady(): boolean {
  return ready;
}

function startListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("mg:sprite-detected", handleSpriteDetected);
}

function handleSpriteDetected(): void {
  if (refreshScheduled || typeof window === "undefined") return;
  refreshScheduled = true;
  window.setTimeout(() => {
    refreshScheduled = false;
    enqueueBootstrap("update");
  }, 150);
}

function enqueueBootstrap(reason: string): void {
  const previous = bootPromise ?? Promise.resolve();
  bootPromise = previous
    .then(() => runBootstrap(reason))
    .then(
      () => {
        ready = true;
      },
      (error) => {
        console.warn(LOG_PREFIX, "preload failed", { reason, error });
      },
    );
}

async function runBootstrap(reason: string): Promise<void> {
  if (typeof window === "undefined") return;

  await waitForTileSources(INITIAL_TIMEOUT_MS);

  if (!hasTileSources()) return;

  console.debug(LOG_PREFIX, "loading sprite caches", { reason });

  const tasks: Promise<unknown>[] = [];
  try {
    tasks.push(
      Sprites.preloadTilesGradually({
        mode: "canvas",
        batchSize: 1,
        delayMs: 30,
      }),
    );
  } catch (error) {
    console.warn(LOG_PREFIX, "preloadTilesGradually threw synchronously", { reason, error });
  }

  try {
    tasks.push(Sprites.loadUI());
  } catch (error) {
    console.warn(LOG_PREFIX, "loadUI threw synchronously", { reason, error });
  }

  if (!tasks.length) return;
}

function hasTileSources(): boolean {
  try {
    const lists = Sprites.lists();
    return lists.tiles.length > 0 || lists.ui.length > 0;
  } catch {
    return false;
  }
}

async function waitForTileSources(timeoutMs: number): Promise<void> {
  if (typeof window === "undefined") return;
  const deadline = Date.now() + timeoutMs;
  while (!hasTileSources() && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      setTimeout(resolve, ms);
    } else {
      window.setTimeout(resolve, ms);
    }
  });
}

