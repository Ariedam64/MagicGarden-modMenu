import { ORIGIN } from "./mgCommon";
import { MGVersion } from "./mgVersion";

let _baseP: Promise<string> | null = null;
let _base: string | null = null;

async function base(): Promise<string> {
  if (_base) return _base;
  if (_baseP) return _baseP;

  _baseP = (async () => {
    const gv = await MGVersion.wait(15000);
    _base = `${ORIGIN}/version/${gv}/assets/`;
    return _base;
  })();

  return _baseP;
}

async function url(rel: string): Promise<string> {
  const b = await base();
  return b.replace(/\/?$/, "/") + String(rel || "").replace(/^\//, "");
}

export const MGAssets = { base, url };
