// appendSpanAtEnd.ts
import { startCropPriceWatcherViaGardenObject } from "./cropPrice";
import { coin } from "../data/hardcoded-data.clean";
import { lockerService } from "../services/locker";

export interface AppendOptions {
  rootSelector?: string;   // default: '.McFlex.css-fsggty'
  innerSelector?: string;  // default: '.McFlex.css-1omaybc, .McFlex.css-1c3sifn'
  markerClass?: string;    // default: 'tm-crop-price'
  root?: ParentNode;       // default: document
  log?: boolean | ((...args: unknown[]) => void);
}
export interface AppendController { stop(): void; runOnce(): void; isRunning(): boolean; }

export const DEFAULTS = {
  rootSelector: ".McFlex.css-fsggty",
  innerSelector: ".McFlex.css-1omaybc, .McFlex.css-1c3sifn",
  markerClass: "tm-crop-price",
} as const;

// Pour le skip ciblé
const OMA_SEL = ".McFlex.css-1omaybc";

// Classes internes de notre bloc marqueur
const ICON_CLASS = "tm-crop-price-icon";
const LABEL_CLASS = "tm-crop-price-label";
const LOCK_TEXT_SELECTOR = ":scope > .chakra-text.css-1uvlb8k";
const LOCK_EMOJI = "🔒";
const LOCKED_TEXT_DISPLAY = "inline-flex";
const LOCKED_TEXT_ALIGN = "center";
const DATASET_KEY_COLOR = "tmLockerOriginalColor";
const DATASET_KEY_DISPLAY = "tmLockerOriginalDisplay";
const DATASET_KEY_ALIGN = "tmLockerOriginalAlign";
const DATASET_KEY_TEXT = "tmLockerOriginalHtml";
const LOCK_CONTENT_PREFIX = `${LOCK_EMOJI}\u00A0`;
const LOCK_PREFIX_REGEX = new RegExp(`^${LOCK_EMOJI}(?:\\u00A0|\\s|&nbsp;)*`);

export function startCropValuesObserverFromGardenAtom(options: AppendOptions = {}): AppendController {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { stop() {}, runOnce() {}, isRunning: () => false };
  }

  const ROOT_SEL = options.rootSelector ?? DEFAULTS.rootSelector;
  const INNER_SEL = options.innerSelector ?? DEFAULTS.innerSelector;
  const MARKER   = options.markerClass ?? DEFAULTS.markerClass;
  const ROOT: ParentNode = options.root ?? document;

  const logger: (...args: unknown[]) => void =
    typeof options.log === "function" ? options.log
    : options.log ? (...a: unknown[]) => console.debug("[AppendCropPrice/GO]", ...a)
    : () => {};

  const nfUS = new Intl.NumberFormat("en-US");
  const fmtCoins = (n: number) => nfUS.format(Math.max(0, Math.round(n)));

  let running = true;
  const priceWatcher = startCropPriceWatcherViaGardenObject();
  let lockerHarvestAllowed: boolean | null = null;
  let lockerOff: (() => void) | null = null;

  try {
    lockerHarvestAllowed = lockerService.getCurrentSlotSnapshot().harvestAllowed ?? null;
  } catch {
    lockerHarvestAllowed = null;
  }

  const writePriceOnce = () => {
    if (!running) return;
    const v = priceWatcher.get();
    const text = v == null ? "—" : fmtCoins(v);

    queryAll(ROOT, ROOT_SEL).forEach(rootEl => {
      queryAll(rootEl, INNER_SEL).forEach(inner => {
        if (shouldSkipInner(inner, MARKER)) {
          removeMarker(inner, MARKER);
          updateLockEmoji(inner, false);
          return;
        }
        const locked = lockerHarvestAllowed === false;
        updateLockEmoji(inner, locked);
        ensureSpanAtEnd(inner, text, MARKER);
      });
    });

    logger("render", { value: v });
  };

  const subscribeLocker = () => {
    try {
      lockerOff = lockerService.onSlotInfoChange((event) => {
        lockerHarvestAllowed = event.harvestAllowed ?? null;
        writePriceOnce();
      });
    } catch {
      lockerOff = null;
    }
  };

  subscribeLocker();

  writePriceOnce();
  const off = priceWatcher.onChange(() => writePriceOnce());

  return {
    stop() {
      if (!running) return;
      running = false;
      off?.();
      if (typeof lockerOff === "function") {
        try { lockerOff(); } catch {}
      }
      priceWatcher.stop();
      logger("stopped");
    },
    runOnce() { writePriceOnce(); },
    isRunning() { return running; },
  };
}

export function appendSpanToAll(opts: Omit<AppendOptions, "log"> = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const ROOT_SEL = opts.rootSelector ?? DEFAULTS.rootSelector;
  const INNER_SEL = opts.innerSelector ?? DEFAULTS.innerSelector;
  const MARKER   = opts.markerClass ?? DEFAULTS.markerClass;
  const ROOT: ParentNode = opts.root ?? document;

  const watcher = __singletonPriceWatcherGO();
  const nfUS = new Intl.NumberFormat("en-US");
  const fmtCoins = (n: number) => nfUS.format(Math.max(0, Math.round(n)));
  const v = watcher.get();
  const text = v == null ? "—" : fmtCoins(v);
  const locked = (() => {
    try {
      return lockerService.getCurrentSlotSnapshot().harvestAllowed === false;
    } catch {
      return false;
    }
  })();

  queryAll(ROOT, ROOT_SEL).forEach(rootEl => {
    queryAll(rootEl, INNER_SEL).forEach(inner => {
      if (shouldSkipInner(inner, MARKER)) {
        removeMarker(inner, MARKER);
        updateLockEmoji(inner, false);
        return;
      }
      updateLockEmoji(inner, locked);
      ensureSpanAtEnd(inner, text, MARKER);
    });
  });
}

/* ================= helpers ================= */

function queryAll(root: ParentNode, sel: string): Element[] {
  return Array.from(root.querySelectorAll(sel));
}

/** true si inner est un .McFlex.css-1omaybc avec **exactement 1** enfant élément réel (hors span marqueur) */
function shouldSkipInner(inner: Element, markerClass: string): boolean {
  if (!(inner instanceof Element)) return false;
  if (!inner.matches(OMA_SEL)) return false;

  const realChildren = getRealElementChildren(inner, markerClass);
  return realChildren.length === 1;
}

/** Enfants éléments **hors** notre propre span marqueur */
function getRealElementChildren(inner: Element, markerClass: string): Element[] {
  const children = Array.from(inner.children) as Element[];
  return children.filter(
    (el) => !(
      el.tagName === "SPAN" && (
        el.classList.contains(markerClass)
      )
    )
  );
}

function removeMarker(inner: Element, markerClass: string): void {
  const markers = inner.querySelectorAll(`:scope > span.${CSS.escape(markerClass)}`);
  markers.forEach((m) => m.remove());
}

function updateLockEmoji(inner: Element, locked: boolean): void {
  if (!(inner instanceof HTMLElement)) return;

  // Nettoie les anciens spans hérités des versions précédentes
  inner.querySelectorAll(":scope > span.tm-locker-lock-emoji").forEach((node) => node.remove());
  const textTarget = inner.querySelector<HTMLElement>(LOCK_TEXT_SELECTOR)
    ?? inner.querySelector<HTMLElement>(":scope > .chakra-text");

  if (!locked) {
    if (textTarget) {
      restoreTextContent(textTarget);
      restoreTextStyles(textTarget);
    }
    return;
  }

  if (!textTarget) {
    return;
  }

  const originalHtml = storeOriginalTextContent(textTarget);
  storeOriginalTextStyles(textTarget);
  applyLockedTextStyles(textTarget);
  applyLockedTextContent(textTarget, originalHtml);
}

function storeOriginalTextStyles(textTarget: HTMLElement): void {
  if (textTarget.dataset[DATASET_KEY_COLOR] === undefined) {
    textTarget.dataset[DATASET_KEY_COLOR] = textTarget.style.color ?? "";
  }
  if (textTarget.dataset[DATASET_KEY_DISPLAY] === undefined) {
    textTarget.dataset[DATASET_KEY_DISPLAY] = textTarget.style.display ?? "";
  }
  if (textTarget.dataset[DATASET_KEY_ALIGN] === undefined) {
    textTarget.dataset[DATASET_KEY_ALIGN] = textTarget.style.alignItems ?? "";
  }
}

function applyLockedTextStyles(textTarget: HTMLElement): void {
  textTarget.style.display = LOCKED_TEXT_DISPLAY;
  textTarget.style.alignItems = LOCKED_TEXT_ALIGN;
}

function restoreTextStyles(textTarget: HTMLElement): void {
  const originalColor = textTarget.dataset[DATASET_KEY_COLOR];
  if (originalColor !== undefined) {
    if (originalColor) {
      textTarget.style.color = originalColor;
    } else {
      textTarget.style.removeProperty("color");
    }
    delete textTarget.dataset[DATASET_KEY_COLOR];
  } else {
    textTarget.style.removeProperty("color");
  }

  const originalDisplay = textTarget.dataset[DATASET_KEY_DISPLAY];
  if (originalDisplay !== undefined) {
    if (originalDisplay) {
      textTarget.style.display = originalDisplay;
    } else {
      textTarget.style.removeProperty("display");
    }
    delete textTarget.dataset[DATASET_KEY_DISPLAY];
  } else {
    textTarget.style.removeProperty("display");
  }

  const originalAlign = textTarget.dataset[DATASET_KEY_ALIGN];
  if (originalAlign !== undefined) {
    if (originalAlign) {
      textTarget.style.alignItems = originalAlign;
    } else {
      textTarget.style.removeProperty("align-items");
    }
    delete textTarget.dataset[DATASET_KEY_ALIGN];
  } else {
    textTarget.style.removeProperty("align-items");
  }
}

function storeOriginalTextContent(textTarget: HTMLElement): string {
  const sanitizedHtml = stripLockPrefix(textTarget.innerHTML);
  textTarget.dataset[DATASET_KEY_TEXT] = sanitizedHtml;
  return sanitizedHtml;
}

function applyLockedTextContent(textTarget: HTMLElement, originalHtml?: string): void {
  const baseHtml = originalHtml ?? textTarget.dataset[DATASET_KEY_TEXT] ?? stripLockPrefix(textTarget.innerHTML);
  const desiredHtml = `${LOCK_CONTENT_PREFIX}${baseHtml}`;
  if (textTarget.innerHTML !== desiredHtml) {
    textTarget.innerHTML = desiredHtml;
  }
}

function restoreTextContent(textTarget: HTMLElement): void {
  const originalHtml = textTarget.dataset[DATASET_KEY_TEXT];
  if (originalHtml !== undefined) {
    textTarget.innerHTML = originalHtml;
    delete textTarget.dataset[DATASET_KEY_TEXT];
    return;
  }

  const currentHtml = textTarget.innerHTML;
  const sanitizedHtml = stripLockPrefix(currentHtml);
  if (sanitizedHtml !== currentHtml) {
    textTarget.innerHTML = sanitizedHtml;
  }
}

function stripLockPrefix(content: string): string {
  return content.replace(LOCK_PREFIX_REGEX, "");
}

function ensureSpanAtEnd(inner: Element, text: string, markerClass: string): void {
  // Récupère/instancie le span marqueur
  const spans = Array.from(
    inner.querySelectorAll(`:scope > span.${CSS.escape(markerClass)}`)
  ) as HTMLSpanElement[];

  let span: HTMLSpanElement | null = spans[0] ?? null;

  // Supprime les doublons éventuels
  for (let i = 1; i < spans.length; i++) spans[i].remove();

  if (!span) {
    span = document.createElement("span") as HTMLSpanElement;
    span.className = markerClass;
  }

  // Style du conteneur (jaune)
  span.style.display = "block";
  span.style.marginTop = "6px";
  span.style.fontWeight = "700";
  span.style.color = "#FFD84D";
  span.style.fontSize = "14px";

  // — Icône (img) + label interne séparé —
  let icon = span.querySelector<HTMLImageElement>(`:scope > img.${ICON_CLASS}`);
  if (!icon) {
    icon = document.createElement("img");
    icon.className = ICON_CLASS;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    // Styles de l'icône
    icon.style.width = "18px";
    icon.style.height = "18px";
    icon.style.display = "inline-block";
    icon.style.verticalAlign = "middle";
    icon.style.marginRight = "6px";
    icon.style.userSelect = "none";
    icon.style.pointerEvents = "none";
    span.insertBefore(icon, span.firstChild);
  }
  // met à jour la source (au cas où tu changes d’icône dynamiquement)
  if (icon.src !== coin.img64) icon.src = coin.img64;

  let label = span.querySelector<HTMLSpanElement>(`:scope > span.${LABEL_CLASS}`);
  if (!label) {
    label = document.createElement("span");
    label.className = LABEL_CLASS;
    // le label hérite la couleur/typo du conteneur
    label.style.display = "inline";
    span.appendChild(label);
  }
  if (label.textContent !== text) label.textContent = text;

  if (inner.lastElementChild !== span) inner.appendChild(span);
}

// singleton pour appendSpanToAll()
let __goWatcher: ReturnType<typeof startCropPriceWatcherViaGardenObject> | null = null;
function __singletonPriceWatcherGO() {
  if (!__goWatcher) __goWatcher = startCropPriceWatcherViaGardenObject();
  return __goWatcher;
}