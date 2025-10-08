// src/store/api.ts
import { ensureStore as ensureJotaiStore, getAtomByLabel, jGet, jSub, jSet } from "./jotai";

export type Unsubscribe = () => void;

export async function ensureStore() {
try { await ensureJotaiStore(); } catch {}
}

/** Lit une valeur d’atom par label. Retourne fallback si indisponible. */
export async function select<T>(label: string, fallback?: T): Promise<T | undefined> {
await ensureStore();
const atom = getAtomByLabel(label);
if (!atom) return fallback;
try { return await jGet<T>(atom); } catch { return fallback; }
}

/** S’abonne à un atom par label. Callback appelé sur changements. */
export async function subscribe<T>(label: string, cb: (value: T) => void): Promise<Unsubscribe> {
await ensureStore();
const atom = getAtomByLabel(label);
if (!atom) return () => {};
const unsub = await jSub(atom, async () => {
try { cb(await jGet<T>(atom)); } catch {}
});
return unsub;
}

/** Push la valeur courante puis écoute. */
export async function subscribeImmediate<T>(label: string, cb: (value: T) => void): Promise<Unsubscribe> {
const first = await select<T>(label);
if (first !== undefined) cb(first as T);
return subscribe<T>(label, cb);
}

export async function set(label: string, value: any) {
  await ensureStore();
  const atom = getAtomByLabel(label);
  if (!atom) return;
  await jSet(atom, value);
}
export const Store = { ensure: ensureStore, select, subscribe, subscribeImmediate, set };
