import { Atoms } from "../store/atoms";
import { ensureStore } from "../store/jotai";
import { PlayerService } from "../services/player";
import { toastSimple } from "../ui/toast";
import { audioPlayer } from "../core/audioPlayer";
import { StatsService } from "../services/stats";

/* =============================================================================
 * Inject a styled "Sell all Pets" button next to a detected "Sell X" button
 * Detection rule (NEW):
 *   - Button label (textContent or aria-label) must be EXACTLY 2 words
 *   - First word must be "Sell" (case-insensitive)
 *     e.g. "Sell Chicken", "Sell Cat" → OK
 *     e.g. "Sell all Pets" (3 mots) → IGNORÉ
 *     e.g. "Sell Golden Chicken" (3 mots) → IGNORÉ
 *
 * - SPA-friendly (MutationObserver + optional history hooks)
 * - Idempotent: 1 injected button per root (repositioned if DOM changes)
 * - Back-compat: keep options signatures, but targetText no longer used for detection
 * ==========================================================================='*/

export type InventoryPetItem = {
  id: string;
  itemType: "Pet";
  petSpecies?: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
  inventoryIndex?: number;
  [key: string]: unknown;
};

export type SellAllPetsEventDetail = {
  pets: InventoryPetItem[];
  count: number;
};

export const SELL_ALL_PETS_EVENT = "sell-all-pets:list" as const;

export interface ThemeColors {
  text: string;
  bg: string;
  border: string;
  hoverBg: string;
  hoverBorder: string;
  activeBg: string;
  ring: string;
}

export interface InjectOptions {
  /** Root container selector */
  rootSelector?: string;            // default: '.McFlex.css-1wu1jyg'
  /** Presence gate: must exist inside root */
  checkSelector?: string;           // default: '.McFlex.css-bvyqr8'
  /** Wide selector to find candidate buttons */
  buttonSelectorWide?: string;      // default includes 'button.chakra-button.css-1rizn4y'
  /** Strict selector (classes exactes) as fallback */
  buttonSelectorStrict?: string;    // default: 'button.chakra-button.css-1rizn4y'
  /** Target text (kept for back-compat, NOT used for detection anymore) */
  targetText?: string;              // default: 'Sell Pet'
  /** Label of injected button */
  injectText?: string;              // default: 'Sell all Pets'
  /** ClassName of injected button (used for idempotence) */
  injectedClass?: string;           // default: 'tm-injected-sell-all'
  /** CSS theme for injected button */
  theme?: ThemeColors;
  /** Attach history hooks (pushState/replaceState/popstate) */
  observeHistory?: boolean;         // default: true
  /** Callback for injected button click */
  onClick?: (ev: MouseEvent, ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; }) => void | Promise<void>;
  /** Light logger */
  log?: boolean | ((...args: unknown[]) => void);
}

export interface InjectController {
  stop(): void;
  runOnce(): void;
  isRunning(): boolean;
}

const DEFAULT_THEME: ThemeColors = {
  text:        'var(--chakra-colors-Neutral-TrueWhite, #FFFFFF)',
  bg:          'var(--chakra-colors-Blue-Magic, #0067B4)',
  border:      'var(--chakra-colors-Blue-Light, #48ADF4)',
  hoverBg:     'var(--chakra-colors-Blue-Light, #48ADF4)',
  hoverBorder: 'var(--chakra-colors-Blue-Baby, #25AAE2)',
  activeBg:    'var(--chakra-colors-Blue-Dark, #264093)',
  ring:        'var(--chakra-ring-color, rgba(66,153,225,0.6))',
};

export const DEFAULTS = {
  rootSelector: '.McFlex.css-cj12rt',
  checkSelector: '.McFlex.css-bvyqr8',
  buttonSelectorWide: 'button.chakra-button.css-1rizn4y, button.chakra-button, button.css-1rizn4y',
  buttonSelectorStrict: 'button.chakra-button.css-1rizn4y',
  targetText: 'Sell Pet', // Back-compat only
  injectText: 'Sell all Pets',
  injectedClass: 'tm-injected-sell-all',
  styleId: 'tm-injected-sell-all-style',
} as const;

/** Start the observer */
export function startInjectSellAllPets(options: InjectOptions = {}): InjectController {
  if (!isBrowser()) return noSSRController();

  const ROOT_SEL   = options.rootSelector      ?? DEFAULTS.rootSelector;
  const CHECK_SEL  = options.checkSelector     ?? DEFAULTS.checkSelector;
  const BTN_WIDE   = options.buttonSelectorWide  ?? DEFAULTS.buttonSelectorWide;
  const BTN_STRICT = options.buttonSelectorStrict ?? DEFAULTS.buttonSelectorStrict;
  const BTN_TEXT   = options.targetText        ?? DEFAULTS.targetText;     // kept for signature
  const INJ_TEXT   = options.injectText        ?? DEFAULTS.injectText;
  const INJ_CLASS  = options.injectedClass     ?? DEFAULTS.injectedClass;
  const THEME      = options.theme             ?? DEFAULT_THEME;
  const OBS_HIST   = options.observeHistory ?? true;

  const logger: (...args: unknown[]) => void =
    typeof options.log === 'function'
      ? options.log
      : options.log
      ? (...a: unknown[]) => console.debug('[injectSellAllPets]', ...a)
      : () => {};

  const HANDLE     = options.onClick ?? createDefaultClickHandler(logger);

  ensureStyle(INJ_CLASS, THEME);

  let running = true;
  let pending = false;

  const processAll = () => {
    if (!running || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      try {
        document.querySelectorAll(ROOT_SEL).forEach(root => processRoot(root as HTMLElement));
      } finally {
        pending = false;
      }
    });
  };

  function processRoot(root: HTMLElement) {
    const gate = root.querySelector(CHECK_SEL);
    if (!gate) { cleanup(root, INJ_CLASS); return; }

    const target = findTargetButton(root, BTN_WIDE, BTN_STRICT, BTN_TEXT);
    if (!target) { cleanup(root, INJ_CLASS); return; }

    ensureInjectedNextTo(target, INJ_CLASS, INJ_TEXT, (ev, ctx) => {
      safeInvokeClick(HANDLE, ev, ctx, logger);
    });
  }

  // Mutation observer
  const mo = new MutationObserver(processAll);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Initial pass
  processAll();

  // History hooks (optional)
  let unhookHistory: (() => void) | null = null;
  if (OBS_HIST) {
    unhookHistory = hookHistory(processAll);
  }

  return {
    stop() {
      if (!running) return;
      running = false;
      mo.disconnect();
      unhookHistory?.();
      logger('stopped');
    },
    runOnce() { processAll(); },
    isRunning() { return running; },
  };
}

/** One-shot pass without installing observers */
export function injectSellAllPetsOnce(options: Omit<InjectOptions, 'observeHistory' | 'log'> = {}): void {
  if (!isBrowser()) return;

  const ROOT_SEL   = options.rootSelector      ?? DEFAULTS.rootSelector;
  const CHECK_SEL  = options.checkSelector     ?? DEFAULTS.checkSelector;
  const BTN_WIDE   = options.buttonSelectorWide  ?? DEFAULTS.buttonSelectorWide;
  const BTN_STRICT = options.buttonSelectorStrict ?? DEFAULTS.buttonSelectorStrict;
  const BTN_TEXT   = options.targetText        ?? DEFAULTS.targetText;     // kept for signature
  const INJ_TEXT   = options.injectText        ?? DEFAULTS.injectText;
  const INJ_CLASS  = options.injectedClass     ?? DEFAULTS.injectedClass;
  const THEME      = options.theme             ?? DEFAULT_THEME;
  const logger: (...args: unknown[]) => void = () => {};
  const HANDLE     = options.onClick ?? createDefaultClickHandler(logger);

  ensureStyle(INJ_CLASS, THEME);

  document.querySelectorAll(ROOT_SEL).forEach(root => {
    const gate = (root as Element).querySelector(CHECK_SEL);
    if (!gate) { cleanup(root as Element, INJ_CLASS); return; }
    const target = findTargetButton(root as Element, BTN_WIDE, BTN_STRICT, BTN_TEXT);
    if (!target) { cleanup(root as Element, INJ_CLASS); return; }
    ensureInjectedNextTo(target, INJ_CLASS, INJ_TEXT, (ev, ctx) => { safeInvokeClick(HANDLE, ev, ctx, logger); });
  });
}

export async function runSellAllPetsFlow(
  logger: (...args: unknown[]) => void = () => {}
): Promise<void> {
  const pets = await runDefaultSellAllPetsAction(logger);
  if (pets.length === 0) return;
  await sellPetsFromInventory(pets, logger);
}

/* ======================== inventory extraction logic ======================== */

export async function getUnfavoritedInventoryPets(): Promise<InventoryPetItem[]> {
  try { await ensureStore(); } catch {}

  const [inventory, favoriteIds] = await Promise.all([
    Atoms.inventory.myInventory.get().catch(() => null),
    Atoms.inventory.favoriteIds.get().catch(() => [] as string[]),
  ]);

  const favSet = new Set(
    Array.isArray(favoriteIds)
      ? favoriteIds.filter((id): id is string => typeof id === 'string')
      : []
  );

  const items = Array.isArray((inventory as any)?.items)
    ? (inventory as any).items as any[]
    : [];

  const availablePets: InventoryPetItem[] = [];

  items.forEach((item, index) => {
    if (!isInventoryPetItem(item)) return;
    if (favSet.has(item.id)) return;

    console.log("[sellAllPets] inventory index", index, item);
    availablePets.push({ ...item, inventoryIndex: index });
  });

  return availablePets;
}

function createDefaultClickHandler(logger: (...args: unknown[]) => void) {
  return async () => {
    const pets = await runDefaultSellAllPetsAction(logger);
    if (pets.length === 0) return;
    await sellPetsFromInventory(pets, logger);
  };
}

async function runDefaultSellAllPetsAction(
  logger: (...args: unknown[]) => void
): Promise<InventoryPetItem[]> {
  const pets = await getUnfavoritedInventoryPets();
  const detail: SellAllPetsEventDetail = { pets, count: pets.length };

  (globalThis as any).__sellAllPetsCandidates = pets;

  try { logger('collected-non-favorite-pets', detail); } catch {}

  try {
    (globalThis as any).dispatchEvent?.(
      new CustomEvent<SellAllPetsEventDetail>(SELL_ALL_PETS_EVENT, { detail })
    );
  } catch {}

  return pets;
}

async function sellPetsFromInventory(
  pets: InventoryPetItem[],
  logger: (...args: unknown[]) => void
): Promise<void> {
  const toSell = pets.filter((pet) => typeof pet?.id === 'string' && pet.id.trim().length > 0);


  if (toSell.length === 0) {
    try { logger('no-sellable-pets', { requested: pets.length }); } catch {}
    try { (globalThis as any).__sellAllPetsResult = { attempted: 0, sold: 0, failures: [] }; } catch {}
    return;
  }

  const failures: { pet: InventoryPetItem; error: unknown }[] = [];
  let sold = 0;

  const totalValue = await computeTotalPetSellValue(toSell, logger);
  try { logger('sell-pets:total-value', { attempted: toSell.length, totalValue }); } catch {}

  for (const pet of toSell) {
    try { logger('sell-pet:start', { id: pet.id, pet }); } catch {}
    try {
      await PlayerService.sellPet(pet.id);
      sold += 1;
      StatsService.incrementShopStat("petsSoldCount");
      
      void (async () => {
        try {
          const total = await Atoms.pets.totalPetSellPrice.get();
          const value = Number(total);
          if (Number.isFinite(value) && value > 0) {
            StatsService.incrementShopStat("petsSoldValue", value);
          }
        } catch (error) {
          console.error("[SellPet] Unable to read pet sell price", error);
        }
      })();
      try { logger('sell-pet:success', { id: pet.id, pet }); } catch {}
    } catch (error) {
      failures.push({ pet, error });
      try { logger('sell-pet:error', { id: pet.id, error, pet }); } catch {}
    }
  }

  if (failures.length === 0) {
    toastSimple("Sell all Pets", `${sold} pets have been sold for ${totalValue} coins!`, "success");
  }

  try {
    (globalThis as any).__sellAllPetsResult = { attempted: toSell.length, sold, failures };
  } catch {}

  audioPlayer.playSellNotification()
  try { logger('sell-pets:complete', { attempted: toSell.length, sold, failures }); } catch {}
}

async function computeTotalPetSellValue(
  pets: InventoryPetItem[],
  logger: (...args: unknown[]) => void
): Promise<string> {
  if (!pets.length) return "";

  const selectionSnapshot = await captureInventorySelection();
  let total = 0;

  for (const pet of pets) {
    const index = getInventoryIndex(pet);
    if (index === null) continue;

    try {
      await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(index);
    } catch (error) {
      try { logger('sell-pet:selection-error', { id: pet.id, index, error, pet }); } catch {}
      continue;
    }

    const value = await readSellPriceForSelection(index, pet, logger);
    if (value !== null) {
      total += value;
    }
  }

  await restoreInventorySelection(selectionSnapshot, logger);

  return total.toLocaleString("en-US");
}

type InventorySelectionSnapshot = { value: number | null; valid: boolean };

async function captureInventorySelection(): Promise<InventorySelectionSnapshot> {
  try {
    const value = await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.get();
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return { value, valid: true };
    }
    if (value === null) {
      return { value: null, valid: true };
    }
  } catch {}
  return { value: null, valid: false };
}

async function restoreInventorySelection(
  snapshot: InventorySelectionSnapshot,
  logger: (...args: unknown[]) => void
): Promise<void> {
  if (!snapshot.valid) return;
  try {
    await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(snapshot.value);
  } catch (error) {
    try { logger('sell-pet:selection-restore-error', error); } catch {}
  }
}

function getInventoryIndex(pet: InventoryPetItem): number | null {
  const idx = pet.inventoryIndex;
  if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0) return idx;
  return null;
}

async function readSellPriceForSelection(
  index: number,
  pet: InventoryPetItem,
  logger: (...args: unknown[]) => void,
  attempts = 3,
  delayMs = 50
): Promise<number | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const value = await Atoms.pets.totalPetSellPrice.get();
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
    } catch (error) {
      if (attempt === attempts - 1) {
        try { logger('sell-pet:price-read-error', { id: pet.id, index, error, pet }); } catch {}
      }
    }

    if (attempt < attempts - 1) {
      await delay(delayMs);
    }
  }

  try { logger('sell-pet:price-missing', { id: pet.id, index, pet }); } catch {}
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeInvokeClick(
  handler: NonNullable<InjectOptions['onClick']>,
  ev: MouseEvent,
  ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; },
  logger: (...args: unknown[]) => void,
): void {
  try {
    const result = handler(ev, ctx);
    if (isPromiseLike(result)) {
      result.catch((err) => logClickError(err, logger));
    }
  } catch (err) {
    logClickError(err, logger);
  }
}

function logClickError(error: unknown, logger: (...args: unknown[]) => void) {
  try { logger('sell-all-click-error', error); } catch {}
}

function isPromiseLike<T = unknown>(value: any): value is PromiseLike<T> {
  return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

function isInventoryPetItem(item: any): item is InventoryPetItem {
  return !!item && item.itemType === 'Pet' && typeof item.id === 'string';
}

/* =============================== helpers =============================== */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function noSSRController(): InjectController {
  return { stop() {}, runOnce() {}, isRunning: () => false };
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Get a meaningful label from the button (prefers textContent, falls back to aria-label). */
function getLabel(el: Element): string {
  const t = norm(el.textContent);
  if (t) return t;
  const a = norm(el.getAttribute('aria-label'));
  return a;
}

/** Split into words via spaces (robust to nested spans/icons). */
function getWords(label: string): string[] {
  return label.trim().split(/\s+/).filter(Boolean);
}

/** True if label is exactly 2 words and starts with "Sell" (case-insensitive). */
function isSellTwoWordLabel(label: string): boolean {
  const words = getWords(label);
  return words.length === 2 && /^sell$/i.test(words[0]);
}

/** NEW detection: pick any button whose label/aria-label is exactly two words, starting with "Sell". */
function findTargetButton(
  scope: Element,
  btnWide: string,
  btnStrict: string,
  _btnText: string // kept for signature/back-compat, not used
): HTMLButtonElement | null {
  const all = Array.from(new Set([
    ...Array.from(scope.querySelectorAll(btnWide)),
    ...Array.from(scope.querySelectorAll(btnStrict)),
  ]))
    .filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement)
    .filter((b) => !b.classList.contains(DEFAULTS.injectedClass)); // ignore our injected button

  const target = all.find((b) => isSellTwoWordLabel(getLabel(b)));
  return target ?? null;
}

function ensureInjectedNextTo(
  targetBtn: HTMLButtonElement,
  injectedClass: string,
  injectedText: string,
  onClick: (ev: MouseEvent, ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; }) => void
): void {
  const parent = (targetBtn.parentElement || targetBtn.closest('.McFlex, .css-0') || targetBtn.parentNode) as HTMLElement | null;
  if (!parent) return;

  // Idempotence: reuse if exists
  let injected = parent.querySelector(`.${injectedClass}`) as HTMLButtonElement | null;
  if (injected) {
    if (targetBtn.nextElementSibling !== injected) {
      parent.insertBefore(injected, targetBtn.nextSibling);
    }
    if (injected.textContent !== injectedText) injected.textContent = injectedText;
    return;
  }

  injected = document.createElement('button');
  injected.type = 'button';
  injected.className = `${injectedClass} chakra-button`;
  injected.textContent = injectedText;
  injected.setAttribute('aria-label', injectedText);
  injected.title = injectedText;

  // spacing next to source button
  injected.style.marginLeft = '8px';

  // Align nicely when parent is not flex
  const cs = getComputedStyle(parent);
  if (cs.display !== 'flex') {
    injected.style.display = 'inline-flex';
    injected.style.alignItems = 'center';
  }

  injected.addEventListener('click', (ev) => onClick(ev, {
    host: targetBtn.closest('.McFlex.css-1wu1jyg'),
    targetBtn,
    injectedBtn: injected!,
  }));

  parent.insertBefore(injected, targetBtn.nextSibling);
}

function cleanup(root: Element, injectedClass: string): void {
  root.querySelectorAll(`.${injectedClass}`).forEach((n) => n.remove());
}

function ensureStyle(injectedClass: string, theme: ThemeColors) {
  const STYLE_ID = `${injectedClass}-style`;
  if (document.getElementById(STYLE_ID)) return;

  const css = `
.${injectedClass}{
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  cursor: pointer;
  display: inline-flex;
  appearance: none;
  align-items: center;
  justify-content: center;
  user-select: none;
  white-space: nowrap;
  vertical-align: middle;

  outline: transparent solid 2px;
  outline-offset: 2px;
  line-height: 1.2;

  border-radius: 15px;                        /* aligns with provided design */
  font-weight: 700;
  height: auto;
  min-width: var(--chakra-sizes-10, 2.5rem);
  box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px;
  transform: translateY(0px);
  transition: 0.2s;

  border: 2px solid ${theme.border};
  color: ${theme.text};
  background: ${theme.bg};

  text-transform: none;
  overflow: hidden;
  font-size: 20px;
  padding-inline-start: var(--chakra-space-4, 1rem);
  padding-inline-end: var(--chakra-space-4, 1rem);
  padding-top: var(--chakra-space-3, 0.75rem);
  padding-bottom: var(--chakra-space-3, 0.75rem);

  -webkit-tap-highlight-color: transparent;
}
.${injectedClass}:hover{
  transform: translateY(-1px);
  background: ${theme.hoverBg};
  border-color: ${theme.hoverBorder};
}
.${injectedClass}:active{
  transform: translateY(1px);
  background: ${theme.activeBg};
}
.${injectedClass}:focus-visible{
  box-shadow: 0 0 0 3px ${theme.ring};
}
`.trim();

  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}

function hookHistory(onNavigate: () => void): () => void {
  const p = history.pushState?.bind(history);
  const r = history.replaceState?.bind(history);
  const wrap = <T extends (...a: any[]) => any>(fn?: T): T | undefined =>
    fn ? (function (this: unknown, ...args: Parameters<T>) {
      const ret = fn.apply(this, args as any);
      onNavigate();
      return ret;
    } as T) : fn;

  if (p) history.pushState = wrap(p)!;
  if (r) history.replaceState = wrap(r)!;
  const onPop = () => onNavigate();
  window.addEventListener('popstate', onPop);

  return () => {
    if (p) history.pushState = p;
    if (r) history.replaceState = r;
    window.removeEventListener('popstate', onPop);
  };
}
