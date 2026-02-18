// src/ui/menus/communityHub/shared.ts
// Shared utilities for the Community Hub module

// ── Style helper ────────────────────────────────────────────────────────────
export const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, s);

// ── Event name constants (single source of truth, qws: prefix) ─────────────
export const CH_EVENTS = {
  OPEN: "qws:community-hub-open",
  CLOSE: "qws:community-hub-close",
  FRIENDS_REFRESH: "qws:friends-refresh",
  FRIEND_REQUESTS_REFRESH: "qws:friend-requests-refresh",
  PRIVACY_UPDATED: "qws:privacy-updated",
  ROOM_CHANGED: "qws:room-changed",
  CONVERSATIONS_REFRESH: "qws:conversations-refresh",
  GROUPS_REFRESH: "qws:groups-refresh",
  OPEN_FRIEND_CHAT: "qws:open-friend-chat",
  OPEN_GROUP_CHAT: "qws:open-group-chat",
  PRESENCE_UPDATED: "qws:presence-updated",
} as const;

// ── Unified CSS injection (scrollbar + spinner, injected once) ──────────────
const SHARED_STYLE_ID = "qws-ch-shared-css";

export function ensureSharedStyles(): void {
  if (document.getElementById(SHARED_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = SHARED_STYLE_ID;
  st.textContent = `
/* Standard scrollbar (8px, teal accent) */
.qws-ch-scrollable::-webkit-scrollbar { width: 8px; }
.qws-ch-scrollable::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.03);
  border-radius: 4px;
}
.qws-ch-scrollable::-webkit-scrollbar-thumb {
  background: rgba(94,234,212,0.2);
  border-radius: 4px;
  transition: background 150ms ease;
}
.qws-ch-scrollable::-webkit-scrollbar-thumb:hover {
  background: rgba(94,234,212,0.35);
}
.qws-ch-scrollable {
  scrollbar-width: thin;
  scrollbar-color: rgba(94,234,212,0.2) rgba(255,255,255,0.03);
}
/* Narrow variant (6px, transparent track) */
.qws-ch-scrollable-narrow::-webkit-scrollbar { width: 6px; }
.qws-ch-scrollable-narrow::-webkit-scrollbar-track { background: transparent; }
.qws-ch-scrollable-narrow::-webkit-scrollbar-thumb {
  background: rgba(94,234,212,0.18);
  border-radius: 3px;
}
.qws-ch-scrollable-narrow::-webkit-scrollbar-thumb:hover {
  background: rgba(94,234,212,0.32);
}
.qws-ch-scrollable-narrow {
  scrollbar-width: thin;
  scrollbar-color: rgba(94,234,212,0.18) transparent;
}
/* Spinner */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
/* Card bounce (triggered on click only) */
@keyframes qws-card-bounce {
  0%   { transform: translateY(0); }
  30%  { transform: translateY(-4px); }
  60%  { transform: translateY(1px); }
  100% { transform: translateY(0); }
}
/* Preview animations */
@keyframes qws-preview-slide-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes qws-preview-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;
  document.head.appendChild(st);
}

// ── Time formatting ─────────────────────────────────────────────────────────

export function formatRelativeTime(isoOrDate: string | Date): string {
  try {
    const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "a while ago";
  }
}

export function formatRelativeTimeShort(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return "";
  }
}

export function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatTimestamp(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
}

// ── Loading view ────────────────────────────────────────────────────────────

export function createLoadingView(onBack: () => void | Promise<void>): HTMLElement {
  ensureSharedStyles();

  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "16px" });

  const header = document.createElement("div");
  style(header, { display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)" });

  const backButton = document.createElement("button");
  backButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block;"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  style(backButton, { padding: "8px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", background: "rgba(255,255,255,0.03)", color: "#e7eef7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms ease" });
  backButton.onclick = onBack;

  const headerTitle = document.createElement("div");
  style(headerTitle, { fontSize: "16px", fontWeight: "700", color: "#e7eef7" });
  headerTitle.textContent = "Loading...";

  header.append(backButton, headerTitle);

  const loadingContent = document.createElement("div");
  style(loadingContent, { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "1", gap: "16px" });

  const spinner = document.createElement("div");
  style(spinner, { width: "40px", height: "40px", border: "4px solid rgba(255,255,255,0.1)", borderTop: "4px solid #5eead4", borderRadius: "50%", animation: "spin 1s linear infinite" });

  const loadingText = document.createElement("div");
  style(loadingText, { fontSize: "14px", color: "rgba(226,232,240,0.7)" });
  loadingText.textContent = "Loading player details...";

  loadingContent.append(spinner, loadingText);
  container.append(header, loadingContent);
  return container;
}

// ── Error view ──────────────────────────────────────────────────────────────

export function createErrorView(message: string, onBack: () => void | Promise<void>): HTMLElement {
  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "16px" });

  const header = document.createElement("div");
  style(header, { display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)" });

  const backButton = document.createElement("button");
  backButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block;"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  style(backButton, { padding: "8px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", background: "rgba(255,255,255,0.03)", color: "#e7eef7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms ease" });
  backButton.onclick = onBack;

  const headerTitle = document.createElement("div");
  style(headerTitle, { fontSize: "16px", fontWeight: "700", color: "#e7eef7" });
  headerTitle.textContent = "Error";

  header.append(backButton, headerTitle);

  const errorContent = document.createElement("div");
  style(errorContent, { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "1", gap: "16px" });

  const errorIcon = document.createElement("div");
  style(errorIcon, { fontSize: "48px", color: "#ef4444" });
  errorIcon.textContent = "\u26A0";

  const errorText = document.createElement("div");
  style(errorText, { fontSize: "14px", color: "rgba(226,232,240,0.7)", textAlign: "center" });
  errorText.textContent = message;

  errorContent.append(errorIcon, errorText);
  container.append(header, errorContent);
  return container;
}

// ── Room badge (reusable) ────────────────────────────────────────────────────

const ROOM_SVG = `<svg width="10" height="10" viewBox="1 2 22 21" fill="none" style="display:block;flex-shrink:0;"><path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22V12h6v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const LOCK_SVG = `<svg width="10" height="10" viewBox="0 0 12 14" fill="none" style="display:block;flex-shrink:0;"><path d="M10 6H9V4C9 2.346 7.654 1 6 1C4.346 1 3 2.346 3 4V6H2C1.448 6 1 6.448 1 7V12C1 12.552 1.448 13 2 13H10C10.552 13 11 12.552 11 12V7C11 6.448 10.552 6 10 6ZM4 4C4 2.897 4.897 2 6 2C7.103 2 8 2.897 8 4V6H4V4Z" fill="currentColor"/></svg>`;

/**
 * Creates a styled room badge.
 * - roomId provided → house icon + room ID (truncated)
 * - roomId null/empty → lock icon (private room)
 */
export function createRoomBadge(roomId: string | null | undefined): HTMLElement {
  const badge = document.createElement("span");
  style(badge, {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "6px",
    fontSize: "10px",
    fontWeight: "600",
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    border: roomId
      ? "1px solid rgba(94,234,212,0.2)"
      : "1px solid rgba(226,232,240,0.15)",
    background: roomId
      ? "rgba(94,234,212,0.08)"
      : "rgba(226,232,240,0.05)",
    color: roomId ? "#5eead4" : "rgba(226,232,240,0.5)",
  });

  if (roomId) {
    const icon = document.createElement("span");
    icon.innerHTML = ROOM_SVG;
    style(icon, { display: "inline-flex", alignItems: "center", flexShrink: "0", marginTop: "-1px" });

    const text = document.createElement("span");
    style(text, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "1" });
    text.textContent = roomId;

    badge.append(icon, text);
  } else {
    const icon = document.createElement("span");
    icon.innerHTML = LOCK_SVG;
    style(icon, { display: "inline-flex", alignItems: "center", flexShrink: "0" });

    const text = document.createElement("span");
    text.textContent = "Private";

    badge.append(icon, text);
  }

  return badge;
}

// ── Player badges ────────────────────────────────────────────────────────────

const HEART_SVG = `<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="display:block;flex-shrink:0;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
const CODE_SVG = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

interface BadgeConfig {
  label: string;
  svg: string;
  color: string;
  border: string;
  bg: string;
}

const BADGE_CONFIGS: Record<string, BadgeConfig> = {
  supporter: {
    label: "Supporter",
    svg: HEART_SVG,
    color: "#f472b6",
    border: "rgba(244,114,182,0.3)",
    bg: "rgba(244,114,182,0.1)",
  },
  mod_creator: {
    label: "Mod Creator",
    svg: CODE_SVG,
    color: "#a78bfa",
    border: "rgba(167,139,250,0.3)",
    bg: "rgba(167,139,250,0.1)",
  },
};

/**
 * Renders a row of badge chips for the given badge keys.
 * Returns null if there are no known badges to display.
 * @param iconOnly - If true, renders only the icon (no label text).
 */
export function createPlayerBadges(badges: string[] | null | undefined, iconOnly = false): HTMLElement | null {
  if (!badges || badges.length === 0) return null;

  const knownBadges = badges.filter((b) => b in BADGE_CONFIGS);
  if (knownBadges.length === 0) return null;

  const row = document.createElement("div");
  style(row, {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "4px",
  });

  for (const badgeKey of knownBadges) {
    const cfg = BADGE_CONFIGS[badgeKey];
    const chip = document.createElement("span");
    style(chip, {
      display: "inline-flex",
      alignItems: "center",
      gap: iconOnly ? "0px" : "3px",
      padding: iconOnly ? "3px" : "2px 6px",
      borderRadius: iconOnly ? "50%" : "6px",
      fontSize: "10px",
      fontWeight: "600",
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
    });

    const icon = document.createElement("span");
    icon.innerHTML = cfg.svg;
    style(icon, { display: "inline-flex", alignItems: "center" });
    chip.appendChild(icon);

    if (!iconOnly) {
      const label = document.createElement("span");
      label.textContent = cfg.label;
      chip.appendChild(label);
    } else {
      chip.title = cfg.label;
    }

    row.appendChild(chip);
  }

  return row;
}

// ── Game input blocker ──────────────────────────────────────────────────────

export function createKeyBlocker(shouldBlock: () => boolean) {
  const handler = (e: KeyboardEvent) => {
    if (shouldBlock()) e.stopPropagation();
  };
  return {
    handler,
    attach() {
      window.addEventListener("keydown", handler, true);
      window.addEventListener("keyup", handler, true);
    },
    detach() {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("keyup", handler, true);
    },
  };
}
