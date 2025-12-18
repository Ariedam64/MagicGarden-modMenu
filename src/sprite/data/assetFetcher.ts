// Networking helpers (ported from userscript GM_xmlhttpRequest flow)
import { joinPath, relPath } from '../utils/path';
import type { ManifestBundle } from '../types';

declare const GM_xmlhttpRequest:
  | ((
      options: {
        method: 'GET';
        url: string;
        responseType: 'text' | 'blob' | 'json';
        onload: (resp: { status: number; responseText: string; response: any }) => void;
        onerror: () => void;
        ontimeout: () => void;
      },
    ) => void)
  | undefined;

function fetchFallback(url: string, type: 'text' | 'blob' | 'json') {
  return fetch(url)
    .then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      if (type === 'blob') return { status: res.status, response: await res.blob(), responseText: '' };
      const text = await res.text();
      return {
        status: res.status,
        response: type === 'json' ? JSON.parse(text) : text,
        responseText: text,
      };
    })
    .catch(err => {
      throw new Error(`Network (${url}): ${err instanceof Error ? err.message : String(err)}`);
    });
}

export function gm(url: string, type: 'text' | 'blob' | 'json' = 'text') {
  // Prefer the userscript API when available (respects @connect/CSP in page).
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise<any>((resolve, reject) =>
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: type,
        onload: r =>
          r.status >= 200 && r.status < 300
            ? resolve(r)
            : reject(new Error(`HTTP ${r.status} (${url})`)),
        onerror: () => reject(new Error(`Network (${url})`)),
        ontimeout: () => reject(new Error(`Timeout (${url})`)),
      })
    );
  }

  // Fallback to fetch only when GM_xmlhttpRequest is unavailable.
  return fetchFallback(url, type);
}

export const getJSON = async <T = any>(url: string): Promise<T> =>
  JSON.parse((await gm(url, 'text')).responseText);

export const getBlob = async (url: string) => (await gm(url, 'blob')).response;

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode fail'));
    };
    img.src = url;
  });
}

export function extractAtlasJsons(manifest: ManifestBundle) {
  const jsons = new Set<string>();
  for (const bundle of manifest.bundles || []) {
    for (const asset of bundle.assets || []) {
      for (const src of asset.src || []) {
        if (typeof src !== 'string') continue;
        if (!src.endsWith('.json')) continue;
        if (src === 'manifest.json') continue;
        if (src.startsWith('audio/')) continue;
        jsons.add(src);
      }
    }
  }
  return jsons;
}

export async function loadAtlasJsons(base: string, manifest: ManifestBundle) {
  const jsons = extractAtlasJsons(manifest);
  const seen = new Set<string>();
  const data: Record<string, any> = {};

  const loadOne = async (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const json = await getJSON<any>(joinPath(base, path));
    data[path] = json;
    if (json?.meta?.related_multi_packs) {
      for (const rel of json.meta.related_multi_packs) {
        await loadOne(relPath(path, rel));
      }
    }
  };

  for (const p of jsons) {
    await loadOne(p);
  }

  return data;
}
