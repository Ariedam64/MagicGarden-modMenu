// Shared helpers for MG* modules (ported from the userscript)
// These utilities intentionally keep the original behaviour/constraints.

// Tampermonkey globals
declare const unsafeWindow: any;
declare function GM_xmlhttpRequest(details: {
  method: "GET";
  url: string;
  responseType?: "arraybuffer" | "blob" | "json" | "text";
  onload?: (response: { status: number; responseText: string; response: any }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}): void;

export const root: any = (typeof unsafeWindow !== "undefined" ? unsafeWindow : window);
export const ORIGIN = "https://magicgarden.gg";

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const tryDo = <T>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

type GmResponse<T = any> = { status: number; response: T; responseText: string };

export function gmGet<T = any>(
  url: string,
  responseType: "text" | "blob" | "arraybuffer" = "text",
): Promise<GmResponse<T>> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== "function") {
      reject(new Error("GM_xmlhttpRequest not available"));
      return;
    }

    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) resolve(r as GmResponse<T>);
        else reject(new Error(`HTTP ${r.status} for ${url}`));
      },
      onerror: () => reject(new Error(`Network error for ${url}`)),
      ontimeout: () => reject(new Error(`Timeout for ${url}`)),
    });
  });
}

export const getJSON = async <T = any>(url: string): Promise<T> =>
  JSON.parse((await gmGet<string>(url, "text")).responseText) as T;

export const getBlob = async (url: string): Promise<Blob> => (await gmGet<Blob>(url, "blob")).response;

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(u);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("Image decode failed"));
    };
    img.src = u;
  });
}

export const joinPath = (base: string, p: string | number | null | undefined): string =>
  base.replace(/\/?$/, "/") + String(p || "").replace(/^\//, "");

export const dirOf = (p: string): string =>
  (p.lastIndexOf("/") >= 0 ? p.slice(0, p.lastIndexOf("/") + 1) : "");

export const relPath = (baseFile: string, p: string | number | null | undefined): string => {
  const s = String(p || "");
  return s.startsWith("/") ? s.slice(1) : dirOf(baseFile) + s;
};

export async function waitWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  while ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 < ms) {
    const out = await Promise.race([p, sleep(50).then(() => null as unknown as T)]);
    if (out !== null) return out;
  }
  throw new Error(`${label} timeout`);
}
