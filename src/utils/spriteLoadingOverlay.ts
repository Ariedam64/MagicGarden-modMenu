import { pageWindow } from "./page-context";

const STYLE_ID = "mg-sprite-loading-overlay-style";
const STYLE_CONTENT = `
.mg-sprite-loading-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 9, 16, 0.5);
  z-index: 1200;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.mg-sprite-loading-overlay--visible {
  pointer-events: auto;
  opacity: 1;
}
.mg-sprite-loading-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 24px;
  border-radius: 14px;
  background: rgba(15, 20, 35, 0.95);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
}
.mg-sprite-loading-spinner {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: #f7f7ff;
  animation: mg-sprite-spin 1s linear infinite;
}
.mg-sprite-loading-label {
  color: #f7f7ff;
  font-size: 14px;
  text-align: center;
  max-width: 260px;
}
@keyframes mg-sprite-spin {
  to {
    transform: rotate(360deg);
  }
}
`;

const DEFAULT_MESSAGE = "Sprites preloading...";

let overlay: HTMLDivElement | null = null;
let messageEl: HTMLDivElement | null = null;
let counter = 0;

function ensureStyle(): void {
  const doc = pageWindow.document;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_CONTENT;
  const head = doc.head ?? doc.documentElement;
  head?.appendChild(style);
}

function ensureOverlay(): HTMLDivElement | null {
  if (overlay) return overlay;
  const doc = pageWindow.document;
  if (!doc.body && !doc.documentElement) return null;
  ensureStyle();

  overlay = doc.createElement("div");
  overlay.className = "mg-sprite-loading-overlay";

  const inner = doc.createElement("div");
  inner.className = "mg-sprite-loading-inner";

  const spinner = doc.createElement("div");
  spinner.className = "mg-sprite-loading-spinner";

  messageEl = doc.createElement("div");
  messageEl.className = "mg-sprite-loading-label";
  messageEl.textContent = DEFAULT_MESSAGE;

  inner.appendChild(spinner);
  inner.appendChild(messageEl);
  overlay.appendChild(inner);

  const container = doc.body ?? doc.documentElement;
  container?.appendChild(overlay);
  return overlay;
}

export function showSpriteLoadingOverlay(message?: string): void {
  const el = ensureOverlay();
  if (!el) return;
  if (messageEl) {
    messageEl.textContent = message ?? DEFAULT_MESSAGE;
  }
  counter += 1;
  el.classList.add("mg-sprite-loading-overlay--visible");
}

export function hideSpriteLoadingOverlay(): void {
  if (!overlay) return;
  counter = Math.max(0, counter - 1);
  if (counter === 0) {
    overlay.classList.remove("mg-sprite-loading-overlay--visible");
  }
}
