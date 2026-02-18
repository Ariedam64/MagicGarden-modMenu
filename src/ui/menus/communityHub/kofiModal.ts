// src/ui/menus/communityHub/kofiModal.ts
// Ko-fi support modal — shown when the user clicks the Support button in the nav.

import { detectEnvironment } from "../../../utils/api";
import { style } from "./shared";

declare const GM_openInTab:
  | ((url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

const KOFI_URL = "https://ko-fi.com/E1E11TWTM1";

const CLOSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const COFFEE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;

const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

const SERVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;

const CODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

interface ReasonDef {
  icon: string;
  color: string;
  title: string;
  desc: string;
}

const REASONS: ReasonDef[] = [
  {
    icon: SERVER_SVG,
    color: "#5eead4",
    title: "Server infrastructure",
    desc: "Public rooms, friends, messages and groups all run on a real-time backend I pay for every month. That's the main reason I opened a Ko-fi.",
  },
  {
    icon: CODE_SVG,
    color: "#a78bfa",
    title: "Months of development",
    desc: "This mod has been built and maintained over many months. Every feature took real time to design and ship.",
  },
  {
    icon: HEART_SVG,
    color: "#f472b6",
    title: "Exclusive supporter badge",
    desc: "Supporters get a pink ♥ badge visible on their profile and next to their name everywhere in the Community Hub.",
  },
];

function createReasonRow(reason: ReasonDef): HTMLElement {
  const row = document.createElement("div");
  style(row, {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
  });

  const iconWrap = document.createElement("div");
  iconWrap.innerHTML = reason.icon;
  style(iconWrap, {
    width: "28px",
    height: "28px",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    background: `${reason.color}1a`,
    color: reason.color,
  });

  const textWrap = document.createElement("div");
  const rowTitle = document.createElement("div");
  rowTitle.textContent = reason.title;
  style(rowTitle, { fontWeight: "600", fontSize: "12px", color: "#e7eef7", marginBottom: "3px" });

  const rowDesc = document.createElement("div");
  rowDesc.textContent = reason.desc;
  style(rowDesc, { fontSize: "12px", color: "rgba(231,238,247,0.6)", lineHeight: "1.5" });

  textWrap.append(rowTitle, rowDesc);
  row.append(iconWrap, textWrap);
  return row;
}

export function createKofiModal(onClose: () => void): HTMLElement {
  const environment = detectEnvironment();
  const isDiscord = environment?.surface === "discord";

  const openKofi = () => {
    if (isDiscord && typeof GM_openInTab === "function") {
      GM_openInTab(KOFI_URL, { active: true });
    } else {
      window.open(KOFI_URL, "_blank", "noopener,noreferrer");
    }
  };

  // ── Overlay ──────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  style(overlay, {
    position: "absolute",
    top: "0",
    right: "0",
    bottom: "0",
    left: "0",
    zIndex: "20",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(8,12,18,0.86)",
    backdropFilter: "blur(4px)",
    borderRadius: "18px",
  });

  // Click outside to close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  // ── Card ─────────────────────────────────────────────────────────────────
  const card = document.createElement("div");
  style(card, {
    width: "min(480px, 90%)",
    maxHeight: "min(560px, 85%)",
    overflowY: "auto",
    background: "linear-gradient(160deg, rgba(22,28,42,0.99) 0%, rgba(12,18,28,0.99) 100%)",
    border: "1px solid rgba(244,114,182,0.22)",
    borderRadius: "14px",
    padding: "24px 24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    boxShadow: "0 8px 36px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset",
    position: "relative",
  });

  // ── Close button ─────────────────────────────────────────────────────────
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = CLOSE_SVG;
  style(closeBtn, {
    position: "absolute",
    top: "14px",
    right: "14px",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(231,238,247,0.55)",
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
    padding: "0",
    flexShrink: "0",
  });
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "rgba(239,68,68,0.14)";
    closeBtn.style.borderColor = "rgba(239,68,68,0.3)";
    closeBtn.style.color = "#ef4444";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "rgba(255,255,255,0.04)";
    closeBtn.style.borderColor = "rgba(255,255,255,0.10)";
    closeBtn.style.color = "rgba(231,238,247,0.55)";
  });
  closeBtn.addEventListener("click", onClose);

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingRight: "32px",
  });

  const coffeeWrap = document.createElement("div");
  coffeeWrap.innerHTML = COFFEE_SVG;
  style(coffeeWrap, {
    width: "40px",
    height: "40px",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    background: "rgba(244,114,182,0.12)",
    border: "1px solid rgba(244,114,182,0.25)",
    color: "#f472b6",
  });

  const headerText = document.createElement("div");
  const headerTitle = document.createElement("div");
  headerTitle.textContent = "Support the Mod";
  style(headerTitle, { fontWeight: "700", fontSize: "15px", color: "#e7eef7" });

  const headerSub = document.createElement("div");
  headerSub.textContent = "Help keep the Community Hub alive";
  style(headerSub, { fontSize: "11px", color: "rgba(231,238,247,0.45)", marginTop: "2px" });

  headerText.append(headerTitle, headerSub);
  header.append(coffeeWrap, headerText);

  // ── Reason rows ───────────────────────────────────────────────────────────
  const reasonsList = document.createElement("div");
  style(reasonsList, { display: "flex", flexDirection: "column", gap: "8px" });
  for (const reason of REASONS) {
    reasonsList.appendChild(createReasonRow(reason));
  }

  // ── Ko-fi button ─────────────────────────────────────────────────────────
  const kofiBtn = document.createElement("button");
  kofiBtn.textContent = "☕  Buy me a coffee on Ko-fi";
  style(kofiBtn, {
    marginTop: "2px",
    padding: "11px 20px",
    background: "linear-gradient(135deg, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.10) 100%)",
    border: "1px solid rgba(244,114,182,0.35)",
    borderRadius: "9px",
    color: "#f9a8d4",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "background 150ms ease, border-color 150ms ease, transform 150ms ease",
    letterSpacing: "0.01em",
    width: "100%",
  });
  kofiBtn.addEventListener("mouseenter", () => {
    kofiBtn.style.background = "linear-gradient(135deg, rgba(244,114,182,0.28) 0%, rgba(244,114,182,0.18) 100%)";
    kofiBtn.style.borderColor = "rgba(244,114,182,0.55)";
    kofiBtn.style.transform = "translateY(-1px)";
  });
  kofiBtn.addEventListener("mouseleave", () => {
    kofiBtn.style.background = "linear-gradient(135deg, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.10) 100%)";
    kofiBtn.style.borderColor = "rgba(244,114,182,0.35)";
    kofiBtn.style.transform = "translateY(0)";
  });
  kofiBtn.addEventListener("click", openKofi);

  card.append(closeBtn, header, reasonsList, kofiBtn);
  overlay.appendChild(card);
  return overlay;
}

/**
 * Creates the Ko-fi support entry for the community hub sidebar.
 * Returns a spacer (flex: 1 to push content to bottom), a separator line,
 * and the actual button — append all three to the nav in order.
 */
export function createKofiNavEntry(onClick: () => void): {
  spacer: HTMLDivElement;
  sep: HTMLDivElement;
  btn: HTMLButtonElement;
} {
  const spacer = document.createElement("div");
  spacer.style.flex = "1";

  const sep = document.createElement("div");
  style(sep, {
    height: "1px",
    background: "rgba(255,255,255,0.07)",
    margin: "0 2px 2px",
  });

  const btn = document.createElement("button");
  btn.className = "qws-ch-nav-btn";

  const iconWrap = document.createElement("div");
  iconWrap.className = "qws-ch-nav-icon";
  iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;
  style(iconWrap, {
    background: "rgba(244,114,182,0.12)",
    color: "#f472b6",
  });

  const label = document.createElement("span");
  label.textContent = "Support";
  label.style.color = "#f9a8d4";

  btn.style.justifyContent = "center";

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(244,114,182,0.10)";
    btn.style.borderColor = "rgba(244,114,182,0.22)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    btn.style.borderColor = "transparent";
  });
  btn.addEventListener("click", onClick);

  btn.append(iconWrap, label);

  return { spacer, sep, btn };
}
