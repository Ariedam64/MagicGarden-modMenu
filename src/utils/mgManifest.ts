import { getJSON, joinPath } from "./mgCommon";
import { MGAssets } from "./mgAssets";

const cache = new Map<string, Promise<any>>();

async function load(baseUrl?: string): Promise<any> {
  const b = baseUrl || (await MGAssets.base());
  if (cache.has(b)) return cache.get(b)!;

  const p = getJSON(joinPath(b, "manifest.json"));
  cache.set(b, p);
  return p;
}

function getBundle(manifest: any, name: string): any | null {
  return (manifest?.bundles || []).find((x: any) => x?.name === name) || null;
}

function listJsonFromBundle(bundle: any): string[] {
  const out = new Set<string>();
  for (const asset of bundle?.assets || []) {
    for (const src of asset?.src || []) {
      if (typeof src === "string" && src.endsWith(".json") && src !== "manifest.json") out.add(src);
    }
  }
  return Array.from(out);
}

export const MGManifest = { load, getBundle, listJsonFromBundle };
