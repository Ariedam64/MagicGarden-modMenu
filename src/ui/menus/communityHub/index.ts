import { createMessagesTab } from "./tabs/messagesTab";
import { createCommunityTab } from "./tabs/communityTab";
import { createRoomTab } from "./tabs/roomTab";
import { createGroupsTab } from "./tabs/groupsTab";
import { createLeaderboardTab } from "./tabs/leaderboardTab";
import { createMyProfileTab } from "./tabs/myProfileTab";
import { startInjectGamePanelButton } from "../../../utils/toolbarButton";
import { style, CH_EVENTS, ensureSharedStyles } from "./shared";
import { getTotalFriendUnreadCount, getTotalGroupUnreadCount, getIncomingRequestsCount, hasApiKey } from "../../../ariesModAPI";
import {
  initNotificationSound,
  checkAndPlayNotificationSound,
  cleanupNotificationSound,
} from "./notificationSound";
import { createAuthGate } from "./authGate";
import { createRoomPrivacyNotice, hasSeenRoomPrivacyNotice } from "./roomPrivacyNotice";
import { createKofiModal, createKofiNavEntry } from "./kofiModal";

const STYLE_ID = "qws-community-hub-css";

type TabId = "messages" | "community" | "room" | "groups" | "leaderboard" | "myProfile";

declare global {
  interface Window {
    __qws_community_hub_last_tab?: TabId;
  }
}

type TabInstance = {
  id: TabId;
  root: HTMLElement;
  show?: () => void;
  hide?: () => void;
  destroy?: () => void;
  getTotalUnread?: () => number;
};

function ensureCommunityHubStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-ch-panel{
  position:fixed;
  top:50%;
  left:50%;
  width:min(980px, 95vw);
  height:min(78vh, 640px);
  max-height:78vh;
  display:none;
  border-radius:18px;
  border:1px solid rgba(255,255,255,0.14);
  background:linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%);
  backdrop-filter:blur(10px);
  color:#e7eef7;
  box-shadow:0 18px 44px rgba(0,0,0,.45);
  overflow:hidden;
  z-index:var(--chakra-zIndices-DialogModal, 7010);
  opacity:0;
  transform:translate(-50%, calc(-50% + 6px));
  pointer-events:none;
  transition:opacity 180ms ease, transform 180ms ease;
}
.qws-ch-panel.open{
  opacity:1;
  transform:translate(-50%, -50%);
  pointer-events:auto;
}
.qws-ch-panel *{ box-sizing:border-box; }
.qws-ch-head{
  padding:12px 16px;
  font-weight:700;
  letter-spacing:0.01em;
  border-bottom:1px solid rgba(255,255,255,0.08);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  background:linear-gradient(120deg, rgba(22,28,40,0.9), rgba(12,17,26,0.92));
  user-select:none;
}
.qws-ch-title{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:14px;
}
.qws-ch-body{
  display:grid;
  grid-template-columns:180px 1fr;
  height:calc(100% - 48px);
  min-height:0;
}
.qws-ch-nav{
  border-right:1px solid rgba(255,255,255,0.08);
  padding:12px 10px;
  display:flex;
  flex-direction:column;
  gap:6px;
  background:rgba(10,14,20,0.7);
}
.qws-ch-nav-btn{
  border:none;
  background:transparent;
  color:#c9d4e6;
  padding:10px 12px;
  border-radius:12px;
  display:flex;
  align-items:center;
  gap:10px;
  cursor:pointer;
  font-size:12px;
  transition:background 120ms ease, color 120ms ease, border 120ms ease;
  border:1px solid transparent;
  position:relative;
}
.qws-ch-nav-btn:hover{
  background:rgba(94,234,212,0.08);
  color:#e7eef7;
}
.qws-ch-nav-btn.active{
  background:rgba(94,234,212,0.18);
  border-color:rgba(94,234,212,0.35);
  color:#ecfdf5;
}
.qws-ch-nav-icon{
  width:20px;
  height:20px;
  border-radius:8px;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.08);
  font-size:12px;
  color:#dbe7f5;
}
.qws-ch-nav-icon svg{
  width:14px;
  height:14px;
  display:block;
}
.qws-ch-content{
  position:relative;
  overflow:hidden;
  padding:12px;
}
.qws-ch-close{
  width:32px;
  height:32px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.06);
  color:#e7eef7;
  display:grid;
  place-items:center;
  cursor:pointer;
  transition:background 120ms ease, border 120ms ease;
  flex-shrink:0;
}
.qws-ch-close:hover{
  background:rgba(239,68,68,0.16);
  border-color:rgba(239,68,68,0.35);
}
.qws-ch-close svg{
  width:16px;
  height:16px;
  display:block;
}
@media (max-width: 768px){
  .qws-ch-body{
    grid-template-columns:1fr;
  }
  .qws-ch-nav{
    flex-direction:row;
    overflow:auto;
    border-right:none;
    border-bottom:1px solid rgba(255,255,255,0.08);
  }
  .qws-ch-nav-btn{ flex:1 0 auto; }
}
`;
  (document.head ?? document.documentElement).appendChild(st);
}

class CommunityHub {
  private slot: HTMLDivElement = document.createElement("div");
  private badge: HTMLSpanElement = document.createElement("span");
  private panel: HTMLDivElement = document.createElement("div");
  private nav: HTMLDivElement = document.createElement("div");
  private content: HTMLDivElement = document.createElement("div");
  private authGate: HTMLElement | null = null;
  private roomPrivacyNotice: HTMLElement | null = null;
  private tabs = new Map<TabId, TabInstance>();
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private navBadges = new Map<TabId, HTMLSpanElement>();
  private activeTab: TabId = "community";
  private panelOpen = false;
  private cleanupToolbarButton: (() => void) | null = null;
  private kofiModal: HTMLElement | null = null;
  private kofiNavBtn: HTMLButtonElement | null = null;
  // Safety flags to prevent stale/destroyed instances from acting on events
  private destroyed = false;
  private _isSelfDispatching = false;
  private handleConversationsRefresh = () => {
    if (this.destroyed) return;
    this.updateAllBadges();
  };
  private handleFriendRequestsRefresh = () => {
    if (this.destroyed) return;
    this.updateAllBadges();
  };
  private handleOverlayOpen = () => {
    // Ignore if this instance dispatched the event itself (prevents circular re-entry)
    // or if the instance has been destroyed but removeEventListener somehow failed
    if (this.destroyed || this._isSelfDispatching) return;
    this.setOpen(true);
  };
  private handleOverlayClose = () => {
    if (this.destroyed || this._isSelfDispatching) return;
    this.setOpen(false);
  };
  private handleOpenFriendChat = () => {
    if (this.destroyed) return;
    if (!this.panelOpen) this.setOpen(true);
    this.switchTab("messages");
  };
  private handleOpenGroupChat = () => {
    if (this.destroyed) return;
    if (!this.panelOpen) this.setOpen(true);
    this.switchTab("messages");
  };
  private handleAuthUpdate = () => {
    if (this.destroyed) return;
    if (hasApiKey()) {
      console.log("[CommunityHub] Auth successful, showing tabs");
      this.updateContentVisibility();
    }
  };
  private handleCloseAfterDecline = () => {
    if (this.destroyed) return;
    this.setOpen(false);
  };
  private handlePointerDown = (e: PointerEvent) => {
    if (this.destroyed || !this.panelOpen) return;
    const t = e.target as Node;
    if (!this.slot.contains(t) && !this.isClickOnToolbarButton(e.target as Node)) {
      this.setOpen(false);
    }
  };

  private isClickOnToolbarButton(target: Node): boolean {
    // Check if click is on our toolbar button
    let el = target as HTMLElement | null;
    while (el) {
      if (el instanceof HTMLButtonElement && el.getAttribute("aria-label") === "Community Hub") {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  constructor() {
    ensureCommunityHubStyle();
    ensureSharedStyles();
    this.slot = this.createSlot();
    this.badge = this.createBadge();

    // Initialize notification sound system
    void initNotificationSound();

    const lastTab = window.__qws_community_hub_last_tab;
    if (
      lastTab === "community" ||
      lastTab === "room" ||
      lastTab === "messages" ||
      lastTab === "groups" ||
      lastTab === "leaderboard" ||
      lastTab === "myProfile"
    ) {
      this.activeTab = lastTab;
    }

    this.panel = this.createPanel();

    // Inject button into game toolbar using utility
    // Create SVG icon as data URL
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const iconDataUrl = `data:image/svg+xml;base64,${btoa(iconSvg)}`;

    this.cleanupToolbarButton = startInjectGamePanelButton({
      onClick: () => {
        const next = !this.panelOpen;
        this.setOpen(next);
      },
      iconUrl: iconDataUrl,
      ariaLabel: "Community Hub",
      onMounted: (btn) => {
        // Append the badge as a child of the toolbar button itself
        btn.style.position = "relative";
        btn.style.overflow = "visible";
        btn.appendChild(this.badge);
        this.updateAllBadges();
      },
    });

    this.slot.append(this.panel);
    document.body.appendChild(this.slot);

    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener(CH_EVENTS.OPEN, this.handleOverlayOpen as EventListener);
    window.addEventListener(CH_EVENTS.CLOSE, this.handleOverlayClose as EventListener);
    window.addEventListener(CH_EVENTS.CONVERSATIONS_REFRESH, this.handleConversationsRefresh);
    window.addEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, this.handleFriendRequestsRefresh);
    window.addEventListener(CH_EVENTS.OPEN_FRIEND_CHAT, this.handleOpenFriendChat as EventListener);
    window.addEventListener(CH_EVENTS.OPEN_GROUP_CHAT, this.handleOpenGroupChat as EventListener);
    window.addEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate);
    window.addEventListener("gemini:ch-close-after-decline", this.handleCloseAfterDecline);

    // Initial badge update
    this.updateAllBadges();
  }

  private createSlot(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "qws-ch-slot";
    style(el, {
      position: "fixed",
      top: "0",
      right: "0",
      pointerEvents: "none",
      zIndex: "9999",
    });
    return el;
  }

  private createBadge(): HTMLSpanElement {
    const el = document.createElement("span");
    style(el, {
      position: "absolute",
      top: "-4px",
      right: "-4px",
      minWidth: "18px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "999px",
      background: "#ef4444",
      color: "#fff",
      fontSize: "10px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      zIndex: "1",
      lineHeight: "1",
    });
    return el;
  }

  private updateAllBadges(): void {
    const friendUnread = getTotalFriendUnreadCount();
    const groupUnread = getTotalGroupUnreadCount();
    const messagesUnread = friendUnread + groupUnread;
    const requestsUnread = getIncomingRequestsCount();
    const total = messagesUnread + requestsUnread;

    // Check and play notification sound if count increased
    checkAndPlayNotificationSound(friendUnread, groupUnread, requestsUnread);

    // Update Messages nav badge
    const msgNavBadge = this.navBadges.get("messages");
    if (msgNavBadge) {
      this.setBadgeCount(msgNavBadge, messagesUnread);
    }

    // Update Friends nav badge (requests count)
    const friendsNavBadge = this.navBadges.get("community");
    if (friendsNavBadge) {
      this.setBadgeCount(friendsNavBadge, requestsUnread);
    }

    // Update toolbar badge (total)
    this.setBadgeCount(this.badge, total);
  }

  private setBadgeCount(badge: HTMLSpanElement, count: number): void {
    if (count <= 0) {
      badge.style.display = "none";
      return;
    }
    badge.style.display = "inline-flex";
    badge.textContent = count > 99 ? "99+" : String(count);
  }

  private createNavBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    style(badge, {
      position: "absolute",
      top: "50%",
      right: "8px",
      transform: "translateY(-50%)",
      minWidth: "18px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "999px",
      background: "#ef4444",
      color: "#fff",
      fontSize: "10px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: "1",
      pointerEvents: "none",
    });
    return badge;
  }

  private createPanel(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "qws-ch-panel";

    const head = document.createElement("div");
    head.className = "qws-ch-head";

    const title = document.createElement("div");
    title.className = "qws-ch-title";
    title.textContent = "Community Hub";

    const closeBtn = document.createElement("button");
    closeBtn.className = "qws-ch-close";
    closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = () => this.setOpen(false);

    head.append(title, closeBtn);

    const body = document.createElement("div");
    body.className = "qws-ch-body";

    this.nav = document.createElement("div");
    this.nav.className = "qws-ch-nav";

    this.content = document.createElement("div");
    this.content.className = "qws-ch-content";

    body.append(this.nav, this.content);
    el.append(head, body);

    // Create auth gate
    this.authGate = createAuthGate();
    this.content.appendChild(this.authGate);

    this.buildTabs();

    // Set initial content visibility based on auth status
    this.updateContentVisibility();

    return el;
  }

  private buildTabs(): void {
    const tabDefs: Array<{
      id: TabId;
      label: string;
      icon: string;
      build: () => TabInstance;
    }> = [
      {
        id: "messages",
        label: "Messages",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        build: createMessagesTab,
      },
      {
        id: "community",
        label: "Friends",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        build: createCommunityTab,
      },
      {
        id: "room",
        label: "Rooms",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>`,
        build: createRoomTab,
      },
      {
        id: "groups",
        label: "Groups",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        build: createGroupsTab,
      },
      {
        id: "leaderboard",
        label: "Leaderboard",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        build: createLeaderboardTab,
      },
      {
        id: "myProfile",
        label: "My Profile",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        build: createMyProfileTab,
      },
    ];

    for (const def of tabDefs) {
      const btn = document.createElement("button");
      btn.className = "qws-ch-nav-btn";
      if (def.id === this.activeTab) btn.classList.add("active");

      const iconWrap = document.createElement("div");
      iconWrap.className = "qws-ch-nav-icon";
      iconWrap.innerHTML = def.icon;

      const label = document.createElement("span");
      label.textContent = def.label;

      btn.append(iconWrap, label);
      this.nav.appendChild(btn);
      this.tabButtons.set(def.id, btn);

      // Add nav badge for messages and community (friends) tabs
      if (def.id === "messages" || def.id === "community") {
        const navBadge = this.createNavBadge();
        btn.appendChild(navBadge);
        this.navBadges.set(def.id, navBadge);
      }

      btn.onclick = () => this.switchTab(def.id);

      // Build tab
      const tab = def.build();
      style(tab.root, {
        display: def.id === this.activeTab ? "flex" : "none",
      });

      this.content.appendChild(tab.root);
      this.tabs.set(def.id, tab);
    }

    // Ko-fi support button — pushed to the bottom of the nav
    const { spacer, sep, btn: kofiBtn } = createKofiNavEntry(() => this.openKofiModal());
    this.kofiNavBtn = kofiBtn;
    this.nav.append(spacer, sep, kofiBtn);
  }

  private openKofiModal(): void {
    if (this.kofiModal?.isConnected) return;
    this.kofiModal?.remove();
    this.kofiModal = createKofiModal(() => {
      this.kofiModal?.remove();
      this.kofiModal = null;
    });
    this.panel.appendChild(this.kofiModal);
  }

  private switchTab(id: TabId): void {
    if (this.activeTab === id) return;

    this.tabs.get(this.activeTab)?.hide?.();
    this.tabButtons.get(this.activeTab)?.classList.remove("active");

    this.activeTab = id;
    window.__qws_community_hub_last_tab = id;

    this.tabs.get(id)?.show?.();
    this.tabButtons.get(id)?.classList.add("active");
  }

  private setOpen(open: boolean): void {
    if (this.panelOpen === open) return;

    this.panelOpen = open;

    if (open) {
      // Update content visibility (shows auth gate if no API key, or tabs if authenticated)
      this.updateContentVisibility();

      this.panel.style.display = "block";
      requestAnimationFrame(() => {
        this.panel.classList.add("open");
      });
      // Show room privacy notice if authenticated and not yet seen
      if (hasApiKey()) this.maybeShowRoomPrivacyNotice();
      // Notify tabs (e.g. messagesTab auto-mark-as-read on reopen)
      // Use _isSelfDispatching so handleOverlayOpen ignores this event on the same instance.
      // Since dispatchEvent is synchronous, the flag is guaranteed to be true for the full
      // call chain (including any stale hub that re-dispatches the same event).
      this._isSelfDispatching = true;
      try { window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN)); } finally { this._isSelfDispatching = false; }
    } else {
      this.panel.classList.remove("open");
      setTimeout(() => {
        if (!this.panelOpen) {
          this.panel.style.display = "none";
        }
      }, 200);
      this._isSelfDispatching = true;
      try { window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE)); } finally { this._isSelfDispatching = false; }
    }
  }

  private updateContentVisibility(): void {
    const authenticated = hasApiKey();

    if (authenticated) {
      // Show tabs, hide auth gate
      if (this.authGate) {
        this.authGate.style.display = "none";
      }
      // Show all tab roots and update tab button states
      for (const [id, tab] of this.tabs) {
        tab.root.style.display = id === this.activeTab ? "flex" : "none";
      }
      // Make sure nav buttons are visible and interactive
      for (const btn of this.tabButtons.values()) {
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
      }
    } else {
      // Hide tabs, show auth gate
      if (this.authGate) {
        this.authGate.style.display = "flex";
      }
      // Hide all tab roots
      for (const tab of this.tabs.values()) {
        tab.root.style.display = "none";
      }
      // Make nav buttons visible but slightly dimmed (preview effect)
      for (const btn of this.tabButtons.values()) {
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.5";
      }
      // Ko-fi button is unrelated to auth — keep it fully interactive
      if (this.kofiNavBtn) {
        this.kofiNavBtn.style.pointerEvents = "auto";
        this.kofiNavBtn.style.opacity = "1";
      }
    }
  }

  private maybeShowRoomPrivacyNotice(): void {
    if (hasSeenRoomPrivacyNotice()) return;
    // Skip only if the element is actually in the panel DOM
    if (this.roomPrivacyNotice?.isConnected) return;

    this.roomPrivacyNotice?.remove();
    this.roomPrivacyNotice = createRoomPrivacyNotice(() => {
      this.roomPrivacyNotice?.remove();
      this.roomPrivacyNotice = null;
    });
    this.panel.appendChild(this.roomPrivacyNotice);
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener(CH_EVENTS.OPEN, this.handleOverlayOpen as EventListener);
    window.removeEventListener(CH_EVENTS.CLOSE, this.handleOverlayClose as EventListener);
    window.removeEventListener(CH_EVENTS.CONVERSATIONS_REFRESH, this.handleConversationsRefresh);
    window.removeEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, this.handleFriendRequestsRefresh);
    window.removeEventListener(CH_EVENTS.OPEN_FRIEND_CHAT, this.handleOpenFriendChat as EventListener);
    window.removeEventListener(CH_EVENTS.OPEN_GROUP_CHAT, this.handleOpenGroupChat as EventListener);
    window.removeEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate);
    window.removeEventListener("gemini:ch-close-after-decline", this.handleCloseAfterDecline);

    // Cleanup toolbar button injection
    if (this.cleanupToolbarButton) {
      this.cleanupToolbarButton();
      this.cleanupToolbarButton = null;
    }

    // Cleanup notification sound
    cleanupNotificationSound();

    // Cleanup auth gate
    if (this.authGate) {
      this.authGate.remove();
      this.authGate = null;
    }

    // Cleanup room privacy notice (if dismissed before destroy)
    if (this.roomPrivacyNotice) {
      this.roomPrivacyNotice.remove();
      this.roomPrivacyNotice = null;
    }

    // Cleanup Ko-fi modal
    if (this.kofiModal) {
      this.kofiModal.remove();
      this.kofiModal = null;
    }

    for (const tab of this.tabs.values()) {
      tab.destroy?.();
    }
    this.tabs.clear();
    this.tabButtons.clear();

    this.slot.remove();
  }
}

export async function renderCommunityHub(): Promise<void> {
  const prev = (window as unknown as { __qws_cleanup_community_hub?: () => void })
    .__qws_cleanup_community_hub;
  if (typeof prev === "function") {
    try {
      prev();
    } catch {}
  }

  const hub = new CommunityHub();

  (window as unknown as { __qws_cleanup_community_hub?: () => void })
    .__qws_cleanup_community_hub = () => {
    try {
      hub.destroy();
    } catch {}
  };
}
