// src/ui/notificationOverlay.ts
import { NotifierService, type NotifierRule } from "../../services/notifier";
import { audio, type PlaybackMode, type TriggerOverrides } from "../../utils/audio"; // ← utilise le singleton unifié
import { createShopSprite, type ShopSpriteType } from "../../utils/shopSprites";
import {
  eggNameFromId,          // NEW
  toolNameFromId,         // NEW
  decorNameFromId,
  seedNameFromSpecies
} from "../../utils/catalogIndex";

/* ========= Types min ========= */
type SeedItem  = { itemType: "Seed";  species: string; initialStock: number; canSpawnHere: boolean };
type ToolItem  = { itemType: "Tool";  toolId: string;  initialStock: number; canSpawnHere: boolean };
type EggItem   = { itemType: "Egg";   eggId:  string;  initialStock: number; canSpawnHere: boolean };
type DecorItem = { itemType: "Decor"; decorId:string;  initialStock: number; canSpawnHere: boolean };

type Section<T> = { inventory: T[]; secondsUntilRestock: number };

export type ShopsSnapshot = {
  seed:  Section<SeedItem>;
  tool:  Section<ToolItem>;
  egg:   Section<EggItem>;
  decor: Section<DecorItem>;
};

export type PurchasesSnapshot = {
  seed:  { createdAt: number; purchases: Record<string, number> };
  egg:   { createdAt: number; purchases: Record<string, number> };
  tool:  { createdAt: number; purchases: Record<string, number> };
  decor: { createdAt: number; purchases: Record<string, number> };
};

/* ========= Utils ========= */
const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
};

function iconOf(id: string, size = 24): HTMLElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: `0 0 ${size}px`,
  });

  const [rawType, rawId] = id.split(":") as [string | undefined, string | undefined];
  const type: ShopSpriteType | null =
    rawType === "Seed" || rawType === "Egg" || rawType === "Tool" || rawType === "Decor"
      ? rawType
      : null;

  const fallback =
    type === "Seed" ? "🌱" :
    type === "Egg"  ? "🥚" :
    type === "Tool" ? "🧰" :
    type === "Decor" ? "🏠" : "🔔";

  if (type && rawId) {
    const sprite = createShopSprite(type, rawId, {
      size,
      fallback,
      alt: labelOf(id),
    });
    wrap.appendChild(sprite);
  } else {
    const span = document.createElement("span");
    span.textContent = fallback;
    span.style.fontSize = `${Math.max(10, size - 2)}px`;
    span.setAttribute("aria-hidden", "true");
    wrap.appendChild(span);
  }

  return wrap;
}


function labelOf(id: string): string {
  const [type, raw] = id.split(":") as ["Seed"|"Egg"|"Tool"|"Decor", string];
  switch (type) {
    case "Seed":  return seedNameFromSpecies(raw) ?? raw;
    case "Egg":   return eggNameFromId(raw) ?? raw;
    case "Tool":  return toolNameFromId(raw) ?? raw;
    case "Decor": return decorNameFromId(raw) ?? raw;
    default:      return raw;
  }
}

/* ========= Helpers achat ========= */
function purchasedCountForId(
  id: string,
  purchases: PurchasesSnapshot | null | undefined
): number {
  if (!purchases) return 0;
  const [type, raw] = String(id).split(":") as ["Seed"|"Egg"|"Tool"|"Decor", string];

  const sec =
    type === "Seed" ? purchases.seed :
    type === "Egg"  ? purchases.egg  :
    type === "Tool" ? purchases.tool : purchases.decor;

  if (!sec || !sec.purchases) return 0;
  const n = sec.purchases[raw];
  return typeof n === "number" && n > 0 ? n : 0;
}

/* ========= Overlay (affichage + subs) ========= */
class OverlayBarebone {
  private slot:  HTMLDivElement    = document.createElement("div");
  private btn:   HTMLButtonElement = document.createElement("button");
  private badge: HTMLSpanElement   = document.createElement("span");
  private panel: HTMLDivElement    = document.createElement("div");

  private lastShops: ShopsSnapshot | null = null;
  private lastPurch: PurchasesSnapshot | null = null;

  // Suivi des IDs visibles dans l’overlay (pour loops & diff)
  private prevOverlayIds = new Set<string>();
  private currentOverlayIds = new Set<string>();
  private rulesById = new Map<string, NotifierRule>();

  private shopUpdates = 0;
  private purchasesUpdates = 0;
  private bootArmed = false;
  private justRestocked = false;

  private mo: MutationObserver | null = null;

  // Items à afficher dans l’overlay (déjà filtrés)
  private rows: Array<{ id: string; qty: number }> = [];

  constructor() {
    this.slot = this.createSlot();
    this.btn = this.createButton();
    this.ensureBellCSS();
    this.badge = this.createBadge();
    this.panel = this.createPanel();
    this.installScrollGuards(this.panel);

    // Prime audio au premier clic utilisateur + toggle panel
    let primedOnce = false;
    this.btn.onclick = async () => {
      if (!primedOnce) {
        primedOnce = true;
        try { await audio.prime(); } catch {}
      }
      const on = this.panel.style.display !== "block";
      this.panel.style.display = on ? "block" : "none";
      if (on) this.renderPanel();
      this.updateBellWiggle();
    };

    this.slot.append(this.btn, this.badge, this.panel);
    this.attachLeftOfTargetCanvas();
    this.observeDomForRelocation();

    // Fermer en cliquant dehors
    window.addEventListener("pointerdown", (e) => {
      if (this.panel.style.display !== "block") return;
      const t = e.target as Node;
      if (!this.slot.contains(t)) this.panel.style.display = "none";
    });

    // Brancher le “purchase checker” pour le mode “Until purchase”
    audio.setPurchaseChecker((itemId) => {
      if (!itemId) return false;
      if (this.currentOverlayIds.has(itemId)) return false;
      return purchasedCountForId(itemId, this.lastPurch) > 0;
    });
  }

  destroy() {
    try { this.mo?.disconnect(); } catch {}
    try { this.slot.remove(); } catch {}
    // Stop toutes les boucles audio liées à l’overlay
    try { audio.stopAllLoops(); } catch {}
  }

  private ensureBellCSS() {
    if (document.getElementById("qws-bell-anim-css")) return;
    const style = document.createElement("style");
    style.id = "qws-bell-anim-css";
    style.textContent = `
@keyframes qwsBellShake {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(-16deg); }
  20% { transform: rotate(12deg); }
  30% { transform: rotate(-10deg); }
  40% { transform: rotate(8deg); }
  50% { transform: rotate(-6deg); }
  60% { transform: rotate(4deg); }
  70% { transform: rotate(-2deg); }
  80% { transform: rotate(1deg); }
  100% { transform: rotate(0deg); }
}

/* Classe appliquée sur le span cloche quand il y a des items dans l'overlay */
.qws-bell--wiggle {
  animation: qwsBellShake 1.2s ease-in-out infinite;
  transform-origin: 50% 0%;
  display: inline-block;
}

/* Respecte l'accessibilité */
@media (prefers-reduced-motion: reduce) {
  .qws-bell--wiggle { animation: none !important; }
}
`;
    document.head.appendChild(style);
  }

  /* ========= SETTERS (subs) ========= */
  setShops(s: ShopsSnapshot) {
    const prev = this.lastShops;
    this.lastShops = s;
    this.shopUpdates++;

    // reset si le compteur de restock remonte dans au moins une section
    this.justRestocked = !!(prev && (
      (prev.seed?.secondsUntilRestock  ?? 0) < (s.seed?.secondsUntilRestock  ?? 0) ||
      (prev.tool?.secondsUntilRestock  ?? 0) < (s.tool?.secondsUntilRestock  ?? 0) ||
      (prev.egg?.secondsUntilRestock   ?? 0) < (s.egg?.secondsUntilRestock   ?? 0) ||
      (prev.decor?.secondsUntilRestock ?? 0) < (s.decor?.secondsUntilRestock ?? 0)
    ));

    this.recompute();
  }

  setPurchases(p: PurchasesSnapshot) {
    this.lastPurch = p;
    this.purchasesUpdates++;
    this.recompute();
  }

  notifyStateUpdated() {
    void this.recompute();
  }

  setRules(rules: Record<string, NotifierRule>) {
    this.rulesById.clear();
    for (const [id, rule] of Object.entries(rules)) {
      if (!id || !rule) continue;
      this.rulesById.set(id, { ...rule });
    }
    this.refreshActiveLoops();
  }

  /* ========= Core compute ========= */
  private buildTriggerOverrides(rule?: NotifierRule | null): TriggerOverrides | null {
    if (!rule) return null;
    const overrides: TriggerOverrides = {};
    if (rule.sound) overrides.sound = rule.sound;
    if (rule.playbackMode === "loop" || rule.playbackMode === "oneshot") {
      overrides.mode = rule.playbackMode;
    }
    if (rule.stopMode === "purchase") overrides.stop = { mode: "purchase" };
    else if (rule.stopMode === "manual") overrides.stop = { mode: "manual" };
    if (rule.loopIntervalMs != null && Number.isFinite(rule.loopIntervalMs)) {
      overrides.loopIntervalMs = Math.max(150, Math.floor(Number(rule.loopIntervalMs)));
    }
    return Object.keys(overrides).length ? overrides : null;
  }

  private triggerMany(ids: Iterable<string>) {
    type TriggerEntry = {
      id: string;
      overrides: TriggerOverrides;
      mode: PlaybackMode;
      soundKey: string;
    };

    const entries: TriggerEntry[] = [];

    for (const id of ids) {
      const overrides = this.buildTriggerOverrides(this.rulesById.get(id)) ?? {};
      const mode = this.resolvePlaybackMode(id);
      const soundKey = overrides.sound
        ? `sound:${overrides.sound.trim().toLowerCase()}`
        : "sound:__default__";
      entries.push({ id, overrides, mode, soundKey });
    }

    if (!entries.length) return;

    const grouped = new Map<string, { loops: TriggerEntry[]; oneshots: TriggerEntry[] }>();

    for (const entry of entries) {
      const bucket = grouped.get(entry.soundKey) ?? { loops: [], oneshots: [] };
      if (entry.mode === "loop") bucket.loops.push(entry);
      else bucket.oneshots.push(entry);
      grouped.set(entry.soundKey, bucket);
    }

    for (const { loops, oneshots } of grouped.values()) {
      if (loops.length) {
        for (const entry of loops) {
          audio.trigger(entry.id, entry.overrides, "shops").catch(() => {});
        }
        continue; // oneshots sharing the sound are skipped when a loop exists
      }

      if (oneshots.length) {
        const first = oneshots[0];
        audio.trigger(first.id, first.overrides, "shops").catch(() => {});
      }
    }
  }

  private triggerWithRule(id: string) {
    this.triggerMany([id]);
  }

  private resolvePlaybackMode(id: string): PlaybackMode {
    const rule = this.rulesById.get(id);
    const baseMode = audio.getPlaybackMode("shops");
    if (!rule) return baseMode;
    if (rule.playbackMode === "loop") return "loop";
    if (rule.playbackMode === "oneshot") return "oneshot";
    if ((rule.stopMode || rule.loopIntervalMs != null) && baseMode === "loop") return "loop";
    return baseMode;
  }

  private refreshActiveLoops() {
    if (!this.currentOverlayIds.size) return;
    const loopIds: string[] = [];
    for (const id of this.currentOverlayIds) {
      if (this.resolvePlaybackMode(id) === "loop") {
        audio.stopLoop(id);
        loopIds.push(id);
      }
    }
    if (loopIds.length) this.triggerMany(loopIds);
  }

  private async recompute() {
    if (!this.lastShops || !this.lastPurch) return;

    // ===== 1) Calcul overlay (popup + stock restant > 0)
    const out: Array<{ id: string; qty: number }> = [];

    const consider = (id: string, initialStock: number, canSpawnHere: boolean) => {
      if (!canSpawnHere) return;
      const pref = (NotifierService.getPref?.(id) as any) || {};
      if (!pref.popup) return; // overlay = source de vérité
      const bought = purchasedCountForId(id, this.lastPurch!);
      const remaining = Math.max(initialStock - bought, 0);
      if (remaining > 0) out.push({ id, qty: remaining });
    };

    for (const it of this.lastShops.seed.inventory)  consider(`Seed:${it.species}`, it.initialStock, it.canSpawnHere);
    for (const it of this.lastShops.tool.inventory)  consider(`Tool:${it.toolId}`,   it.initialStock, it.canSpawnHere);
    for (const it of this.lastShops.egg.inventory)   consider(`Egg:${it.eggId}`,     it.initialStock, it.canSpawnHere);
    for (const it of this.lastShops.decor.inventory) consider(`Decor:${it.decorId}`, it.initialStock, it.canSpawnHere);

    // ---- Render (badge / panel) + MAJ cloche
    this.rows = out;
    this.renderBadge();
    if (this.panel.style.display === "block") this.renderPanel();
    this.updateBellWiggle();

    // ===== 2) Gate de boot (stabilité initiale)
    const overlayIds = new Set(out.map(r => r.id));
    this.currentOverlayIds = overlayIds;
    const shopEmpty =
      (this.lastShops.seed?.inventory?.length ?? 0) +
      (this.lastShops.tool?.inventory?.length ?? 0) +
      (this.lastShops.egg?.inventory?.length ?? 0)  +
      (this.lastShops.decor?.inventory?.length ?? 0) === 0;

    const ready = this.shopUpdates >= 3 && this.purchasesUpdates >= 2 && !shopEmpty;

    if (!this.bootArmed) {
      if (!ready) {
        // baseline: on garde les ids tels quels sans jouer
        this.prevOverlayIds = overlayIds;
        return;
      }
      // Armement du boot: s'il y a déjà des items suivis visibles, on déclenche pour chacun
      this.bootArmed = true;
      if (overlayIds.size > 0) {
        this.triggerMany(overlayIds);
      }
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // ===== 3) Après boot

    // Si overlay vide → stop toutes les boucles et baseline
    if (overlayIds.size === 0) {
      audio.stopAllLoops();
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // a) Reset (restock) détecté → redémarrer les loops pour tous les items visibles
    if (this.justRestocked) {
      // On redémarre (trigger) tous les ids courants
      this.triggerMany(overlayIds);
      // Et on stoppe d'éventuelles boucles d'IDs qui ont disparu
      for (const oldId of this.prevOverlayIds) {
        if (!overlayIds.has(oldId)) audio.stopLoop(oldId);
      }
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // b) Sinon, on déclenche sur les NOUVEAUX IDs et on coupe ceux sortis
    const newIds: string[] = [];
    for (const id of overlayIds) {
      if (!this.prevOverlayIds.has(id)) {
        newIds.push(id);
      }
    }
    if (newIds.length) this.triggerMany(newIds);
    for (const oldId of this.prevOverlayIds) {
      if (!overlayIds.has(oldId)) {
        audio.stopLoop(oldId);
      }
    }

    this.prevOverlayIds = overlayIds;
    this.justRestocked = false;

    // (en mode oneshot, trigger joue 1x; en mode loop, ça démarre la boucle)
    // pas besoin de bip global de plus.
  }

  /* ========= Render ========= */
  private renderBadge() {
    const n = this.rows.length;
    this.badge.textContent = n ? String(n) : "";
    style(this.badge, { display: n ? "inline-flex" : "none" });
  }

  private renderPanel() {
    this.panel.replaceChildren();

    const head = document.createElement("div");
    head.textContent = "Tracked items available";
    style(head, {
      fontWeight: "700",
      opacity: "0.9",
      padding: "4px 2px",
      borderBottom: "1px solid var(--qws-border-2, #ffffff14)",
      marginBottom: "4px",
    });
    this.panel.appendChild(head);

    if (!this.rows.length) {
      const empty = document.createElement("div");
      empty.textContent = "No tracked items are available.";
      style(empty, { opacity: "0.75", padding: "8px 2px" });
      this.panel.appendChild(empty);
      return;
    }

    for (const r of this.rows) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "24px 1fr max-content",
        alignItems: "center",
        gap: "8px",
        padding: "6px 4px",
        borderBottom: "1px solid var(--qws-border-2, #ffffff14)",
      });

      const icon = iconOf(r.id, 24);

      const title = document.createElement("div");
      title.textContent = labelOf(r.id);
      Object.assign(title.style, {
        fontWeight: "600",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "var(--qws-text, #e7eef7)",
      });

      const qty = document.createElement("div");
      qty.textContent = `×${r.qty}`;
      Object.assign(qty.style, {
        fontVariantNumeric: "tabular-nums",
        opacity: "0.9",
        color: "var(--qws-text-dim, #b9c3cf)",
      });

      row.append(icon, title, qty);
      this.panel.appendChild(row);
    }
  }

  /* ========= DOM bits ========= */
  private createSlot(): HTMLDivElement {
    const d = document.createElement("div");
    d.id = "qws-notifier-slot";
    style(d, {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      marginRight: "var(--chakra-space-2, 0.5rem)",
      pointerEvents: "auto",
      fontFamily: "var(--chakra-fonts-body, GreyCliff CF), system-ui, sans-serif",
      color: "var(--chakra-colors-chakra-body-text, #e7eef7)",
      userSelect: "none",
    });
    setProps(d, {
      "-webkit-font-smoothing": "antialiased",
      "-webkit-text-size-adjust": "100%",
      "text-rendering": "optimizeLegibility",
    });
    return d;
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Notifications");
    const bell = document.createElement("span");
    bell.className = "qws-bell";
    bell.textContent = "🔔";
    bell.setAttribute("aria-hidden", "true");
    style(btn, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "36px",
      padding: "0 12px",
      borderRadius: "var(--chakra-radii-button, 50px)",
      border: "1px solid var(--chakra-colors-chakra-border-color, #ffffff33)",
      background: "var(--qws-panel, #111823cc)",
      backdropFilter: "blur(var(--qws-blur, 8px))",
      color: "var(--qws-text, #e7eef7)",
      boxShadow: "var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45))",
      cursor: "pointer",
      transition: "border-color var(--chakra-transition-duration-fast,150ms) ease",
      outline: "none",
      position: "relative",
    });
    setProps(btn, {
      "-webkit-backdrop-filter": "blur(var(--qws-blur, 8px))",
      "-webkit-tap-highlight-color": "transparent",
    });
    btn.appendChild(bell);
    btn.addEventListener("mouseenter", () => { btn.style.borderColor = "var(--qws-accent, #7aa2ff)"; });
    btn.addEventListener("mouseleave", () => { btn.style.borderColor = "var(--chakra-colors-chakra-border-color, #ffffff33)"; });
    return btn;
  }

  private updateBellWiggle() {
    const bell = this.btn.querySelector(".qws-bell") as HTMLElement | null;
    if (!bell) return;
    // Shake seulement si l’overlay a au moins 1 item ET que le panneau est fermé
    const shouldWiggle = (this.rows.length > 0) && (this.panel.style.display !== "block");
    bell.classList.toggle("qws-bell--wiggle", shouldWiggle);
  }

  private createBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    style(badge, {
      position: "absolute",
      top: "-6px",
      right: "-6px",
      minWidth: "18px",
      height: "18px",
      padding: "0 6px",
      borderRadius: "999px",
      background: "var(--chakra-colors-Red-Magic, #D02128)",
      color: "var(--chakra-colors-Neutral-TrueWhite, #fff)",
      fontSize: "12px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid rgba(0,0,0,.35)",
      lineHeight: "18px",
      pointerEvents: "none",
    });
    return badge;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Tracked items available");
    style(panel, {
      position: "absolute",
      top: "calc(100% + var(--chakra-space-2, 0.5rem))",
      right: "0",
      width: "min(280px, 70vw)",        // ← largeur réduite (était 360px)
      maxHeight: "50vh",
      overflow: "auto",
      overscrollBehavior: "contain",     // ← empêche le scroll de “remonter” au jeu
      touchAction: "pan-y",              // ← gestes tactiles = scroll vertical, pas zoom/pan global
      borderRadius: "var(--chakra-radii-card, 12px)",
      border: "1px solid var(--qws-border, #ffffff22)",
      background: "var(--qws-panel, #111823cc)",
      backdropFilter: "blur(var(--qws-blur, 8px))",
      color: "var(--qws-text, #e7eef7)",
      boxShadow: "var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45))",
      padding: "8px",
      display: "none",
      zIndex: "var(--chakra-zIndices-DialogModal, 7010)",
    });
    setProps(panel, { "-webkit-backdrop-filter": "blur(var(--qws-blur, 8px))" });
    return panel;
  }

  private installScrollGuards(el: HTMLElement) {
    const stop = (e: Event) => {
      // On laisse le scroll par défaut (pas de preventDefault),
      // mais on empêche le wheel d'aller jusqu'au canvas/jeu.
      e.stopPropagation();
    };
    // Souris/trackpad
    el.addEventListener("wheel", stop, { passive: true, capture: true });
    // Compat anciens events
    el.addEventListener("mousewheel", stop as any, { passive: true, capture: true } as any);
    el.addEventListener("DOMMouseScroll", stop as any, { passive: true, capture: true } as any);
    // Tactile
    el.addEventListener("touchmove", stop, { passive: true, capture: true });
  }

  /* ========= Anchoring ========= */
  private findTargetCanvas(): HTMLCanvasElement | null {
    try {
      const c1 = document.querySelector('span[tabindex] canvas') as HTMLCanvasElement | null;
      if (c1) return c1;
      const all = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
      const candidates = all
        .map(c => ({ c, r: c.getBoundingClientRect() }))
        .filter(({ r }) => r.width <= 512 && r.height <= 512 && r.top < 300)
        .sort((a, b) => (a.r.left - b.r.left) || (a.r.top - b.r.top));
      return candidates[0]?.c ?? null;
    } catch { return null; }
  }

  private findAnchorBlockFromCanvas(c: HTMLCanvasElement): HTMLElement | null {
    try {
      const tabbable = c.closest("span[tabindex]");
      if (tabbable && tabbable.parentElement) return tabbable.parentElement as HTMLElement;

      let cur: HTMLElement | null = c;
      while (cur && cur.parentElement) {
        const p = cur.parentElement as HTMLElement;
        const cs = getComputedStyle(p);
        if (cs.display.includes("flex") && p.children.length <= 3) return p;
        cur = p;
      }
      return null;
    } catch { return null; }
  }

  private insertLeftOf(block: Element, el: Element) {
    const parent = block.parentElement;
    if (!parent) return;
    if (!(block as any).isConnected || !(parent as any).isConnected) return;

    const cs = getComputedStyle(parent);
    const isFlex = cs.display.includes("flex");
    const dir = cs.flexDirection || "row";

    try {
      if (isFlex && dir.startsWith("row") && dir.endsWith("reverse")) {
        if (el !== block.nextSibling) parent.insertBefore(el, block.nextSibling);
      } else {
        parent.insertBefore(el, block);
      }
    } catch {}
  }

  private attachLeftOfTargetCanvas() {
    try {
      const canvas = this.findTargetCanvas();
      const block = canvas ? this.findAnchorBlockFromCanvas(canvas) : null;

      if (!block || !block.parentElement || !(block as any).isConnected) {
        let fixed = document.getElementById("qws-notifier-fallback") as HTMLDivElement | null;
        if (!fixed) {
          fixed = document.createElement("div");
          fixed.id = "qws-notifier-fallback";
          style(fixed, {
            position: "fixed",
            zIndex: "var(--chakra-zIndices-PresentableOverlay, 5100)",
            top: "calc(10px + var(--sait, 0px))",
            right: "calc(10px + var(--sair, 0px))",
          });
          document.body.appendChild(fixed);
        }
        if (!fixed.contains(this.slot)) fixed.appendChild(this.slot);
        return;
      }

      if (this.slot.parentElement !== block.parentElement ||
          (this.slot.nextElementSibling !== block && block.previousElementSibling !== this.slot)) {
        this.insertLeftOf(block, this.slot);
      }
    } catch {}
  }

  private observeDomForRelocation() {
    try {
      this.mo?.disconnect();
      this.mo = new MutationObserver(() => this.attachLeftOfTargetCanvas());
      this.mo.observe(document.body, { childList: true, subtree: true });
      this.attachLeftOfTargetCanvas();
    } catch {}
  }
}

/* ===== Mount + SUBS ===== */
export async function renderOverlay() {
  const overlay = new OverlayBarebone();

  const unsubPurch = await NotifierService.onPurchasesChangeNow((p) => overlay.setPurchases(p));
  const unsubShops = await NotifierService.onShopsChangeNow((s) => overlay.setShops(s));
  const unsubState = await NotifierService.onChangeNow(() => overlay.notifyStateUpdated());
  const unsubRules = await NotifierService.onRulesChangeNow((rules) => overlay.setRules(rules));

  (window as any).__qws_cleanup_notifier = () => {
    try { unsubShops(); } catch {}
    try { unsubPurch(); } catch {}
    try { unsubState(); } catch {}
    try { unsubRules(); } catch {}
    try { overlay.destroy(); } catch {}
  };
}
