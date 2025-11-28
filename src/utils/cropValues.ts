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
  innerSelector: ".McFlex.css-1l3zq7, .McFlex css-11dqzw",
  markerClass: "tm-crop-price",
} as const;

// Pour le skip ciblé
const OMA_SEL = ".McFlex.css-1omaybc";

// Classes internes de notre bloc marqueur
const ICON_CLASS = "tm-crop-price-icon";
const LABEL_CLASS = "tm-crop-price-label";
const LOCK_TEXT_SELECTOR = ":scope > .chakra-text.css-1uvlb8k";
const TOOLTIP_ROOT_CLASS = "css-115gc9o";
const LOCK_EMOJI = "🔒";
const LOCK_BORDER_STYLE = "2px solid rgb(188, 53, 215)";
const LOCK_BORDER_RADIUS = "15px";
const LOCK_ICON_CLASS = "tm-locker-tooltip-lock-icon";
const DATASET_KEY_COLOR = "tmLockerOriginalColor";
const DATASET_KEY_DISPLAY = "tmLockerOriginalDisplay";
const DATASET_KEY_ALIGN = "tmLockerOriginalAlign";
const DATASET_KEY_TEXT = "tmLockerOriginalHtml";
const DATASET_KEY_BORDER = "tmLockerOriginalBorder";
const DATASET_KEY_BORDER_RADIUS = "tmLockerOriginalBorderRadius";
const DATASET_KEY_POSITION = "tmLockerOriginalPosition";
const DATASET_KEY_OVERFLOW = "tmLockerOriginalOverflow";
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
  const tooltipRoot = inner.closest<HTMLElement>(`.${TOOLTIP_ROOT_CLASS}`);

  if (!locked) {
    if (textTarget) {
      restoreTextContent(textTarget);
      restoreTextStyles(textTarget);
    }
    if (tooltipRoot) {
      restoreTooltipStyles(tooltipRoot);
      removeLockIcon(tooltipRoot);
    }
    return;
  }

  if (textTarget) {
    restoreTextContent(textTarget);
  }

  if (tooltipRoot) {
    storeOriginalTooltipStyles(tooltipRoot);
    applyLockedTooltipStyles(tooltipRoot);
    ensureLockIcon(tooltipRoot);
  }
}

function restoreTextStyles(textTarget: HTMLElement): void {
  restoreStyleFromDataset(textTarget, DATASET_KEY_COLOR, "color");
  restoreStyleFromDataset(textTarget, DATASET_KEY_DISPLAY, "display");
  restoreStyleFromDataset(textTarget, DATASET_KEY_ALIGN, "align-items");
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

function restoreStyleFromDataset(el: HTMLElement, datasetKey: string, cssProperty: string): void {
  const datasetMap = el.dataset as Record<string, string | undefined>;
  const originalValue = datasetMap[datasetKey];
  if (originalValue === undefined) return;

  if (originalValue) {
    el.style.setProperty(cssProperty, originalValue);
  } else {
    el.style.removeProperty(cssProperty);
  }

  delete datasetMap[datasetKey];
}

function storeOriginalTooltipStyles(tooltip: HTMLElement): void {
  if (tooltip.dataset[DATASET_KEY_BORDER] === undefined) {
    tooltip.dataset[DATASET_KEY_BORDER] = tooltip.style.border ?? "";
  }
  if (tooltip.dataset[DATASET_KEY_BORDER_RADIUS] === undefined) {
    tooltip.dataset[DATASET_KEY_BORDER_RADIUS] = tooltip.style.borderRadius ?? "";
  }
  if (tooltip.dataset[DATASET_KEY_OVERFLOW] === undefined) {
    tooltip.dataset[DATASET_KEY_OVERFLOW] = tooltip.style.overflow ?? "";
  }
}

function applyLockedTooltipStyles(tooltip: HTMLElement): void {
  tooltip.style.border = LOCK_BORDER_STYLE;
  tooltip.style.borderRadius = LOCK_BORDER_RADIUS;
  tooltip.style.overflow = "visible";

  const computedPosition = typeof window !== "undefined"
    ? window.getComputedStyle(tooltip).position
    : tooltip.style.position || "static";
  if (computedPosition === "static") {
    if (tooltip.dataset[DATASET_KEY_POSITION] === undefined) {
      tooltip.dataset[DATASET_KEY_POSITION] = tooltip.style.position ?? "";
    }
    tooltip.style.position = "relative";
  }
}

function restoreTooltipStyles(tooltip: HTMLElement): void {
  const originalBorder = tooltip.dataset[DATASET_KEY_BORDER];
  if (originalBorder !== undefined) {
    if (originalBorder) {
      tooltip.style.border = originalBorder;
    } else {
      tooltip.style.removeProperty("border");
    }
    delete tooltip.dataset[DATASET_KEY_BORDER];
  } else {
    tooltip.style.removeProperty("border");
  }

  const originalBorderRadius = tooltip.dataset[DATASET_KEY_BORDER_RADIUS];
  if (originalBorderRadius !== undefined) {
    if (originalBorderRadius) {
      tooltip.style.borderRadius = originalBorderRadius;
    } else {
      tooltip.style.removeProperty("border-radius");
    }
    delete tooltip.dataset[DATASET_KEY_BORDER_RADIUS];
  } else {
    tooltip.style.removeProperty("border-radius");
  }

  const originalOverflow = tooltip.dataset[DATASET_KEY_OVERFLOW];
  if (originalOverflow !== undefined) {
    if (originalOverflow) {
      tooltip.style.overflow = originalOverflow;
    } else {
      tooltip.style.removeProperty("overflow");
    }
    delete tooltip.dataset[DATASET_KEY_OVERFLOW];
  } else {
    tooltip.style.removeProperty("overflow");
  }

  const originalPosition = tooltip.dataset[DATASET_KEY_POSITION];
  if (originalPosition !== undefined) {
    if (originalPosition) {
      tooltip.style.position = originalPosition;
    } else {
      tooltip.style.removeProperty("position");
    }
    delete tooltip.dataset[DATASET_KEY_POSITION];
  } else if (tooltip.style.position === "relative") {
    tooltip.style.removeProperty("position");
  }
}

function ensureLockIcon(tooltip: HTMLElement): void {
  let icon = tooltip.querySelector<HTMLElement>(`:scope > span.${LOCK_ICON_CLASS}`);
  if (!icon) {
    icon = document.createElement("span");
    icon.className = LOCK_ICON_CLASS;
    tooltip.append(icon);
  }

  icon.textContent = LOCK_EMOJI;
  icon.style.position = "absolute";
  icon.style.top = "0";
  icon.style.right = "0";
  icon.style.left = "";
  icon.style.transform = "translate(50%, -50%)";
  icon.style.fontSize = "18px";
  icon.style.padding = "2px 8px";
  icon.style.borderRadius = "999px";
  icon.style.border = "none";
  icon.style.background = "transparent";
  icon.style.color = "white";
  icon.style.pointerEvents = "none";
  icon.style.userSelect = "none";
  icon.style.zIndex = "1";
}

function removeLockIcon(tooltip: HTMLElement): void {
  tooltip.querySelectorAll(`:scope > span.${LOCK_ICON_CLASS}`).forEach((node) => node.remove());
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