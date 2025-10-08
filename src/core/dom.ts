// dom.ts

export type Predicate = (el: Element) => boolean;
export type SelectorOrPredicate = string | Predicate;

export interface DisconnectHandle { disconnect(): void }
export interface OffHandle { off(): void }

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Résout quand le DOM est prêt (DOMContentLoaded). */
export const ready: Promise<void> = new Promise(res => {
  if (document.readyState !== "loading") res();
  else addEventListener("DOMContentLoaded", () => res(), { once: true });
});

/** Raccourcis selecteurs */
export const $ = <T extends Element = Element>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = Element>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

/** Injecte du CSS dans <head>. */
export function addStyle(css: string): HTMLStyleElement {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
  return s;
}

/** Uniformise string/predicate en predicate. */
function toPredicate(selOrFn: SelectorOrPredicate): Predicate {
  if (typeof selOrFn === "function") return selOrFn;
  if (typeof selOrFn === "string") return (el: Element) => el.matches?.(selOrFn) ?? false;
  throw new Error("Selector or predicate required");
}

export interface WaitForOpts {
  root?: ParentNode;
  timeout?: number;          // ms (0 = pas de timeout)
  includeExisting?: boolean; // true par défaut
}

/** Attends qu’un élément correspondant apparaisse (sélecteur ou prédicat). */
export async function waitFor<T extends Element = Element>(
  selOrFn: SelectorOrPredicate,
  { root = document, timeout = 30_000, includeExisting = true }: WaitForOpts = {}
): Promise<T> {
  const pred = toPredicate(selOrFn);

  // 1) existant ?
  if (includeExisting && "querySelectorAll" in root) {
    for (const el of (root as ParentNode & Document | Element).querySelectorAll("*")) {
      if (pred(el)) return el as T;
    }
  }

  // 2) mutations
  let timer: number | undefined;
  const t0 = Date.now();

  return new Promise<T>((resolve, reject) => {
    const obs = new MutationObserver(muts => {
      for (const m of muts) for (const n of Array.from(m.addedNodes)) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        if (pred(el)) { cleanup(); return resolve(el as T); }
        el.querySelectorAll?.("*").forEach(child => {
          if (!el.isConnected) return; // sécurité
          if (pred(child)) { cleanup(); return resolve(child as T); }
        });
      }
    });
    obs.observe(root, { childList: true, subtree: true });

    const cleanup = () => { obs.disconnect(); if (timer) window.clearTimeout(timer); };

    if (timeout > 0) {
      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(`waitFor timeout after ${Date.now() - t0}ms`));
      }, timeout);
    }
  });
}

export interface OnAddedOpts {
  root?: ParentNode;
  callForExisting?: boolean; // true par défaut
}

/** Callback pour CHAQUE élément ajouté qui matche (fonctionne sur DOM dynamique). */
export function onAdded(
  selOrFn: SelectorOrPredicate,
  cb: (el: Element) => void,
  { root = document, callForExisting = true }: OnAddedOpts = {}
): DisconnectHandle {
  const pred = toPredicate(selOrFn);
  const seen = new WeakSet<Element>();

  const consider = (el: Element) => {
    if (seen.has(el)) return;
    if (pred(el)) { seen.add(el); cb(el); }
  };

  if (callForExisting && "querySelectorAll" in root) {
    (root as Document | Element).querySelectorAll("*").forEach(consider);
  }

  const obs = new MutationObserver(muts => {
    for (const m of muts) for (const n of Array.from(m.addedNodes)) {
      if (n.nodeType !== 1) continue;
      const el = n as Element;
      consider(el);
      el.querySelectorAll?.("*").forEach(consider);
    }
  });
  obs.observe(root, { childList: true, subtree: true });

  return { disconnect: () => obs.disconnect() };
}

/** Callback quand des éléments correspondants sont supprimés du DOM. */
export function onRemoved(
  selOrFn: SelectorOrPredicate,
  cb: (el: Element) => void,
  { root = document }: { root?: ParentNode } = {}
): DisconnectHandle {
  const pred = toPredicate(selOrFn);
  const obs = new MutationObserver(muts => {
    for (const m of muts) for (const n of Array.from(m.removedNodes)) {
      if (n.nodeType !== 1) continue;
      const el = n as Element;
      if (pred(el)) cb(el);
      el.querySelectorAll?.("*").forEach(child => { if (pred(child)) cb(child); });
    }
  });
  obs.observe(root, { childList: true, subtree: true });
  return { disconnect: () => obs.disconnect() };
}

export interface DelegateOpts {
  root?: Element | Document;
  capture?: boolean;
}

/** Délégation d’événements (capte aussi les éléments futurs). */
export function delegate<K extends keyof DocumentEventMap>(
  selector: SelectorOrPredicate,
  type: K,
  handler: (this: Element, ev: DocumentEventMap[K]) => void,
  { root = document, capture = false }: DelegateOpts = {}
): OffHandle {
  const pred = toPredicate(selector);
  const listener = (ev: Event) => {
    let el = ev.target as Element | null;
    while (el && el !== root && el.nodeType === 1) {
      if (pred(el)) { handler.call(el, ev as DocumentEventMap[K]); break; }
      el = el.parentElement;
    }
  };
  root.addEventListener(type, listener as EventListener, { capture });
  return { off: () => root.removeEventListener(type, listener as EventListener, { capture }) };
}

export interface WatchOpts {
  attributes?: boolean;
  attributeFilter?: string[];
  characterData?: boolean;
  subtree?: boolean;
}

/** Observe le texte/attributs d’un élément et rappelle cb. */
export function watch(el: Node, cb: (el: Node) => void, opts: WatchOpts = {}): DisconnectHandle {
  const { attributes = false, attributeFilter, characterData = true, subtree = false } = opts;
  const obs = new MutationObserver(() => cb(el));
  obs.observe(el, { attributes, attributeFilter, characterData, subtree });
  return { disconnect: () => obs.disconnect() };
}

/** Déclenche cb quand l’élément devient visible (IntersectionObserver). */
export function whenVisible(
  el: Element,
  cb: (entry: IntersectionObserverEntry) => void,
  { threshold = 0.01, once = false }: { threshold?: number; once?: boolean } = {}
): DisconnectHandle {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { cb(e); if (once) io.disconnect(); }
  }, { threshold });
  io.observe(el);
  return { disconnect: () => io.disconnect() };
}

/* ===========================
   Helpers bonus (optionnels)
   =========================== */

/** Parse un timer style "1h 5m 44s" → secondes restantes (null si non détecté, 0 si prêt). */
export function parseRemaining(s: string | null | undefined): number | null {
  if (!s) return null;
  const str = s.trim().toLowerCase();
  if (/ready|prêt|harvest/i.test(str)) return 0;
  let h = 0, m = 0, sec = 0;
  const H = str.match(/(\d+)\s*h/); if (H) h = +H[1];
  const M = str.match(/(\d+)\s*m/); if (M) m = +M[1];
  const S = str.match(/(\d+)\s*s/); if (S) sec = +S[1];
  if (!H && !M && !S) return null;
  return h * 3600 + m * 60 + sec;
}
export const pad2 = (n: number) => n.toString().padStart(2, "0");
export const formatClock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
