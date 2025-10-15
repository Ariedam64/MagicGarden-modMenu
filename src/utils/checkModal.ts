// checkModal.ts
/* eslint-disable no-console */

import { pageWindow, shareGlobal } from "./page-context";

export type ModalWatcherOptions = {
  /** Période de scan en ms (~1 min par défaut) */
  intervalMs?: number;
  /** Affiche des logs utiles dans la console */
  log?: boolean;
};

type BreadFound = { section: HTMLElement; button: HTMLButtonElement };

const DEFAULTS: Required<ModalWatcherOptions> = {
  intervalMs: 60_000,
  log: false,
};

// —— utils ————————————————————————————————————————————————————————

const normalize = (s: string | null | undefined) =>
  (s || "").replace(/\s+/g, " ").trim();

const reGameUpdate = /game\s*update\s+ava?ilab?le/i; // tolère la faute "avaible"
const reDailyBread = /your\s+daily\s+bread/i;

const log = (enabled: boolean, ...args: any[]) => {
  if (enabled) console.log("[checkModal]", ...args);
};

let reloadScheduled = false;

const schedulePageReload = (doLog: boolean) => {
  if (reloadScheduled) return;
  reloadScheduled = true;
  log(doLog, "Game Update: ♻️ rechargement de la page dans un instant...");
  pageWindow.setTimeout(() => {
    log(doLog, "Game Update: 🔄 rechargement maintenant.");
    pageWindow.location.reload();
  }, 500);
};

const isVisible = (el: Element | null): el is HTMLElement => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
  // Vérifie qu'un parent n'est pas hidden
  let cur: HTMLElement | null = el;
  while (cur) {
    const cs2 = getComputedStyle(cur);
    if (cs2.display === "none" || cs2.visibility === "hidden") return false;
    cur = cur.parentElement;
  }
  return true;
};

// —— détection ————————————————————————————————————————————————————

/** Retourne la section du modal Game Update si présente. */
export function findGameUpdateModal(): HTMLElement | null {
  const sections = document.querySelectorAll<HTMLElement>(
    'section.chakra-modal__content[role="dialog"], section.chakra-modal__content[role="alertdialog"]'
  );
  for (const sec of sections) {
    const header = sec.querySelector<HTMLElement>('header.chakra-modal__header');
    const txt = normalize(header?.textContent || sec.textContent || "");
    if (reGameUpdate.test(txt)) return sec;
  }
  return null;
}

/** Retourne la section + bouton du modal Daily Bread si présent. */
export function findBreadModal(): BreadFound | null {
  const sections = document.querySelectorAll<HTMLElement>(
    'section.chakra-modal__content[role="dialog"], section.chakra-modal__content[role="alertdialog"]'
  );

  for (const sec of sections) {
    const txt = normalize(sec.textContent || "");
    if (!reDailyBread.test(txt)) continue;

    // 1) cible exacte demandée
    let btn = sec.querySelector<HTMLButtonElement>('button.chakra-button.css-1o32am8');

    // 2) fallback si la classe change : bouton contenant "Claim"
    if (!btn) {
      const candidates = sec.querySelectorAll<HTMLButtonElement>('button');
      btn = Array.from(candidates).find(b => /claim/i.test(normalize(b.textContent))) ?? null;
    }

    if (btn) return { section: sec, button: btn };
  }

  return null;
}

// —— action ———————————————————————————————————————————————————————

/** Empêche de recliquer en boucle le même bouton. */
const clickedBreadButtons = new WeakSet<HTMLButtonElement>();

function clickBreadIfVisible(btn: HTMLButtonElement, doLog: boolean): boolean {
  if (clickedBreadButtons.has(btn)) {
    log(doLog, "Bread: bouton déjà cliqué (guard).");
    return false;
  }
  // Bouton non désactivé et visible
  const ariaDisabled = btn.getAttribute("aria-disabled");
  if (btn.disabled || ariaDisabled === "true") {
    log(doLog, "Bread: bouton désactivé.");
    return false;
  }
  if (!isVisible(btn)) {
    log(doLog, "Bread: bouton non visible.");
    return false;
  }
  btn.click();
  clickedBreadButtons.add(btn);
  log(doLog, "Bread: ✅ click() envoyé.");
  return true;
}

// —— API publique ————————————————————————————————————————————————

export type CheckResult = {
  gameUpdateFound: boolean;
  breadFound: boolean;
  breadClicked: boolean;
};

/** Exécute un check immédiat (synchrone). */
export function checkOnce(opts?: ModalWatcherOptions): CheckResult {
  const { log: doLog } = { ...DEFAULTS, ...opts };

  // Game Update
  const gameUpdateSec = findGameUpdateModal();
  const gameUpdateFound = !!gameUpdateSec;
  if (gameUpdateFound) {
    log(doLog, "Game Update: ✅ détecté.", gameUpdateSec);
    schedulePageReload(doLog);
  }

  // Daily Bread
  const found = findBreadModal();
  const breadFound = !!found;
  let breadClicked = false;

  if (found) {
    log(doLog, "Daily Bread: ✅ détecté.", found.section);
    breadClicked = clickBreadIfVisible(found.button, doLog);
  }

  if (!gameUpdateFound && !breadFound) log(doLog, "Rien détecté pour l’instant.");
  return { gameUpdateFound, breadFound, breadClicked };
}

export type RunningWatcher = {
  /** Arrête la boucle de scan. */
  stop: () => void;
  /** Force un check immédiat. */
  tick: () => CheckResult;
};

/**
 * Démarre l’observation périodique (~1 min par défaut).
 * - Scan immédiat au démarrage
 * - Puis un scan toutes les `intervalMs`
 */
export function startModalObserver(options?: ModalWatcherOptions): RunningWatcher {
  const { intervalMs, log: doLog } = { ...DEFAULTS, ...options };

  let stopped = false;
  const tick = () => {
    if (stopped) return { gameUpdateFound: false, breadFound: false, breadClicked: false };
    return checkOnce({ log: doLog });
  };

  // Scan immédiat
  tick();

  // Boucle toutes les ~1 min (simple & fiable dans un userscript)
  const timer = pageWindow.setInterval(tick, intervalMs);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    pageWindow.clearInterval(timer);
    log(doLog, "⏹️ Observateur arrêté.");
  };

  log(doLog, `▶️ Observateur démarré (intervalle: ${intervalMs} ms).`);
  return { stop, tick };
}

// —— Optionnel : exposer sur window si pas d’import/bundle —————————
declare global {
  interface Window {
    CheckModal?: {
      startModalObserver: typeof startModalObserver;
      checkOnce: typeof checkOnce;
      findGameUpdateModal: typeof findGameUpdateModal;
      findBreadModal: typeof findBreadModal;
    };
  }
}

const exposed = {
  startModalObserver,
  checkOnce,
  findGameUpdateModal,
  findBreadModal,
};

shareGlobal("CheckModal", exposed);
