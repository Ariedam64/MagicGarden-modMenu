import { sleep } from "./mgCommon";

let gameVersion: string | null = null;

function init(doc?: Document | null): void {
  if (gameVersion !== null) return;
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  if (!d) return;

  const scripts = d.scripts;
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts.item(i) as HTMLScriptElement | null;
    const src = s?.src;
    if (!src) continue;

    const m = src.match(/\/(?:r\/\d+\/)?version\/([^/]+)/);
    if (m && m[1]) {
      gameVersion = m[1];
      return;
    }
  }
}

function get(): string | null {
  init(document);
  return gameVersion;
}

async function wait(timeoutMs: number = 15000): Promise<string> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  while ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 < timeoutMs) {
    init(document);
    if (gameVersion) return gameVersion;
    await sleep(50);
  }
  throw new Error("MGVersion timeout (gameVersion not found)");
}

export const MGVersion = { init, get, wait };
