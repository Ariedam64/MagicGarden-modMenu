import { createFriendsTab } from "./friendsTab";
import { createRequestsTab } from "./requestsTab";
import { createAddFriendTab } from "./addFriendTab";
import { createButton, setButtonEnabled } from "../ui";
import { coin } from "../../../../data/hardcoded-data.clean";
import {
  fetchPlayersView,
  fetchPlayerView,
  fetchGroups,
  getCachedFriendsSummary,
  openPresenceStream,
  addGroupMember,
  removeFriend,
  setImageSafe,
  type PlayerView,
  type PlayerViewSection,
  type FriendSummary,
  type GroupSummary,
  type PresencePayload,
  type StreamHandle,
} from "../../../../utils/supabase";
import { RoomService } from "../../../../services/room";
import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  fakeActivityLogShow,
  fakeInventoryShow,
  fakeJournalShow,
  fakeStatsShow,
  waitActivityLogModalClosed,
  waitInventoryPanelClosed,
  waitJournalModalClosed,
  waitStatsModalClosed,
} from "../../../../services/fakeModal";
import { skipNextActivityLogHistoryReopen } from "../../../../services/activityLogHistory";
import { toastSimple } from "../../../../ui/toast";
import { formatLastSeen } from "../utils";

const PRESENCE_TOAST_STYLE_ID = "qws-presence-toast-css";
const PRESENCE_TOAST_HOST_ID = "qws-presence-toast-host";
const PRESENCE_TOAST_DURATION_MS = 3500;
const PRESENCE_TOAST_MAX = 3;

const ensurePresenceToastStyles = (): void => {
  if (document.getElementById(PRESENCE_TOAST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRESENCE_TOAST_STYLE_ID;
  style.textContent = `
.qws-presence-toasts{
  position:fixed;
  top:calc(14px + var(--sait, 0px));
  right:calc(14px + var(--sair, 0px));
  display:flex;
  flex-direction:column;
  gap:8px;
  z-index:var(--chakra-zIndices-PresentableOverlay, 5100);
  pointer-events:none;
}
.qws-presence-toast{
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 12px;
  border-radius:12px;
  background:rgba(12, 16, 30, 0.92);
  border:1px solid rgba(255, 255, 255, 0.12);
  box-shadow:0 10px 26px rgba(0,0,0,0.35);
  color:#f8fafc;
  font-size:12px;
  font-weight:600;
  letter-spacing:0.2px;
  pointer-events:auto;
  animation:qws-presence-enter 220ms ease;
}
.qws-presence-toast[data-state="leaving"]{
  animation:qws-presence-exit 180ms ease forwards;
}
.qws-presence-avatar{
  width:32px;
  height:32px;
  flex:0 0 32px;
  border-radius:50%;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(255,255,255,0.08);
  color:#f8fafc;
  font-weight:700;
  font-size:12px;
}
.qws-presence-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:50% 20%;
  transform:scale(1.08);
  transform-origin:50% 20%;
}
.qws-presence-text{
  display:flex;
  flex-direction:column;
  min-width:0;
}
.qws-presence-name{
  font-size:12.5px;
  font-weight:700;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-presence-sub{
  font-size:11px;
  font-weight:600;
  color:rgba(226,232,240,0.72);
}
@keyframes qws-presence-enter{
  from{opacity:0; transform:translateX(12px);}
  to{opacity:1; transform:translateX(0);}
}
@keyframes qws-presence-exit{
  from{opacity:1; transform:translateX(0);}
  to{opacity:0; transform:translateX(12px);}
}
@media (prefers-reduced-motion: reduce){
  .qws-presence-toast{ animation:none; }
  .qws-presence-toast[data-state="leaving"]{ animation:none; opacity:0; }
}
  `;
  document.head.appendChild(style);
};

const getPresenceToastHost = (): HTMLDivElement => {
  let host = document.getElementById(PRESENCE_TOAST_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = PRESENCE_TOAST_HOST_ID;
    host.className = "qws-presence-toasts";
    document.body.appendChild(host);
  }
  return host;
};

type CommunitySubTab = "friends" | "add" | "requests";

type CommunityTabHandle = {
  root: HTMLDivElement;
  show: () => void;
  hide: () => void;
  refresh: () => void;
  destroy: () => void;
};

export function createCommunityTab(options: {
  onRequestsCountChange?: (count: number) => void;
  onChat?: (playerId: string, friend?: PlayerView) => void;
}): CommunityTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-tab qws-fo-tab-community";

  const layout = document.createElement("div");
  layout.className = "qws-fo-community";

  const tabsRow = document.createElement("div");
  tabsRow.className = "qws-fo-community-tabs";

  const body = document.createElement("div");
  body.className = "qws-fo-community-body";

  const listWrap = document.createElement("div");
  listWrap.className = "qws-fo-community-list";

  const profileWrap = document.createElement("div");
  profileWrap.className = "qws-fo-community-profile";

  const friendsTab = createFriendsTab();
  const addTab = createAddFriendTab();
  const requestsTab = createRequestsTab({
    onCountChange: (count) => {
      setRequestsBadge(count);
      options.onRequestsCountChange?.(count);
    },
    onAccept: () => {
      void friendsTab.refresh({ force: true });
    },
    onRemoved: () => {
      void friendsTab.refresh({ force: true });
    },
  });

  const panels: Record<CommunitySubTab, HTMLElement> = {
    friends: friendsTab.root,
    add: addTab.root,
    requests: requestsTab.root,
  };

  Object.values(panels).forEach((panel) => body.appendChild(panel));

  const tabButtons = new Map<CommunitySubTab, HTMLButtonElement>();
  const tabDefs: Array<{ id: CommunitySubTab; label: string }> = [
    { id: "friends", label: "Friend list" },
    { id: "add", label: "Add friend" },
    { id: "requests", label: "Requests" },
  ];

  let activeTab: CommunitySubTab = "friends";
  const storedTab = (window as unknown as { __qws_friend_overlay_last_community_tab?: CommunitySubTab })
    .__qws_friend_overlay_last_community_tab;
  if (storedTab === "friends" || storedTab === "add" || storedTab === "requests") {
    activeTab = storedTab;
  }

  const setRequestsBadge = (count: number) => {
    const btn = tabButtons.get("requests");
    if (!btn) return;
    let badge = btn.querySelector<HTMLSpanElement>(".qws-fo-community-tab-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "qws-fo-community-tab-badge";
      btn.appendChild(badge);
    }
    if (!count) {
      badge.style.display = "none";
      badge.textContent = "";
    } else {
      badge.textContent = String(count);
      badge.style.display = "inline-flex";
    }
  };

  const setActiveTab = (id: CommunitySubTab) => {
    activeTab = id;
    (window as unknown as { __qws_friend_overlay_last_community_tab?: CommunitySubTab })
      .__qws_friend_overlay_last_community_tab = id;
    tabButtons.forEach((btn, tabId) => {
      btn.classList.toggle("active", tabId === id);
    });
    Object.entries(panels).forEach(([tabId, panel]) => {
      panel.classList.toggle("active", tabId === id);
    });
  };

  tabDefs.forEach((def) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qws-fo-community-tab-btn";
    btn.textContent = def.label;
    btn.addEventListener("click", () => setActiveTab(def.id));
    tabsRow.appendChild(btn);
    tabButtons.set(def.id, btn);
  });

  const tabsShell = document.createElement("div");
  tabsShell.className = "qws-fo-community-tabshell";
  tabsShell.append(tabsRow, body);

  listWrap.append(tabsShell);
  layout.append(listWrap, profileWrap);
  root.appendChild(layout);

  setActiveTab(activeTab);

  let profileOpen = false;
  let activeFriend: PlayerView | null = null;
  let activeGardenPlayerId: string | null = null;
  let presenceStream: StreamHandle | null = null;
  let presenceUnsub: (() => void) | null = null;
  const presenceState = new Map<string, boolean>();
  let currentPlayerId: string | null = null;
  let ownerGroups: GroupSummary[] = [];
  let ownerGroupsLoaded = false;
  let ownerGroupsLoading = false;

  const normalizePresenceId = (value: string | null | undefined) =>
    value ? String(value).trim() : "";

  const seedPresenceState = () => {
    presenceState.clear();
    const cached = getCachedFriendsSummary();
    for (const friend of cached) {
      const id = normalizePresenceId(friend.playerId);
      if (id) presenceState.set(id, Boolean(friend.isOnline));
    }
  };

  const showOnlineToast = (friend: FriendSummary) => {
    const label = friend.playerName ?? friend.playerId ?? "Friend";
    const host = getPresenceToastHost();
    ensurePresenceToastStyles();

    while (host.childElementCount >= PRESENCE_TOAST_MAX) {
      host.lastElementChild?.remove();
    }

    const toast = document.createElement("div");
    toast.className = "qws-presence-toast";

    const avatar = document.createElement("div");
    avatar.className = "qws-presence-avatar";
    const avatarUrl = friend.avatarUrl ?? "";
    if (avatarUrl) {
      const img = document.createElement("img");
      img.alt = label;
      img.decoding = "async";
      setImageSafe(img, avatarUrl);
      avatar.appendChild(img);
    } else {
      avatar.textContent = label.trim().slice(0, 1).toUpperCase() || "?";
    }

    const text = document.createElement("div");
    text.className = "qws-presence-text";
    const name = document.createElement("div");
    name.className = "qws-presence-name";
    name.textContent = label;
    const sub = document.createElement("div");
    sub.className = "qws-presence-sub";
    sub.textContent = "is online";
    text.append(name, sub);

    toast.append(avatar, text);
    host.prepend(toast);

    const clear = () => {
      if (!toast.isConnected) return;
      toast.setAttribute("data-state", "leaving");
      window.setTimeout(() => {
        toast.remove();
        if (!host.childElementCount && host.parentElement) host.remove();
      }, 200);
    };
    const timer = window.setTimeout(clear, PRESENCE_TOAST_DURATION_MS);
    toast.addEventListener("click", () => {
      window.clearTimeout(timer);
      clear();
    });
  };

  const handlePresence = (payload: PresencePayload) => {
    const id = normalizePresenceId(payload?.playerId);
    if (!id) return;
    const cached = getCachedFriendsSummary();
    const friend = cached.find((f) => normalizePresenceId(f.playerId) === id);
    const nextOnline = Boolean(payload?.online);
    const prevOnline = presenceState.get(id);
    presenceState.set(id, nextOnline);

    void friendsTab.refresh({ force: true });

    if (friend && prevOnline === false && nextOnline) {
      showOnlineToast(friend);
    }
  };

  const resetPresenceStream = (playerId: string | null) => {
    if (presenceStream) {
      try {
        presenceStream.close();
      } catch {}
      presenceStream = null;
    }
    presenceState.clear();
    if (!playerId) return;
    seedPresenceState();
    presenceStream = openPresenceStream(playerId, handlePresence);
  };
  const previewOverlay = document.createElement("div");
  previewOverlay.className = "qws-fo-garden-preview";
  const previewCard = document.createElement("div");
  previewCard.className = "qws-fo-garden-preview-card";
  const previewTitle = document.createElement("div");
  previewTitle.className = "qws-fo-garden-preview-title";
  const previewActions = document.createElement("div");
  previewActions.className = "qws-fo-garden-preview-actions";
  const previewStopBtn = createButton("Stop preview", { size: "sm", variant: "danger" });
  previewActions.appendChild(previewStopBtn);
  previewCard.append(previewTitle, previewActions);
  previewOverlay.appendChild(previewCard);
  document.body.appendChild(previewOverlay);

  const backBtn = createButton("Back", { size: "sm", variant: "ghost" });
  const profileTitle = document.createElement("div");
  profileTitle.className = "qws-fo-profile-title";
  profileTitle.textContent = "Friend profile";
  const profileTop = document.createElement("div");
  profileTop.className = "qws-fo-profile-top";
  const profileTopLeft = document.createElement("div");
  profileTopLeft.className = "qws-fo-profile-top-left";
  profileTopLeft.append(backBtn, profileTitle);
  const removeBtn = createButton("Remove this friend", { size: "sm", variant: "danger" });
  removeBtn.classList.add("qws-fo-profile-remove");
  removeBtn.title = "Remove friend";
  profileTop.append(profileTopLeft, removeBtn);

  const profileCard = document.createElement("div");
  profileCard.className = "qws-fo-profile-card";

  const profileHeader = document.createElement("div");
  profileHeader.className = "qws-fo-profile-header";
  const profileInfo = document.createElement("div");
  profileInfo.className = "qws-fo-profile-info";
  const profileAvatar = document.createElement("div");
  profileAvatar.className = "qws-fo-profile-avatar";
  const profileAvatarImg = document.createElement("img");
  profileAvatarImg.alt = "Friend avatar";
  profileAvatarImg.style.display = "none";
  const profileAvatarFallback = document.createElement("span");
  profileAvatar.append(profileAvatarImg, profileAvatarFallback);

  const profileHeadline = document.createElement("div");
  profileHeadline.className = "qws-fo-profile-headline";
  const profileNameRow = document.createElement("div");
  profileNameRow.className = "qws-fo-profile-name-row";
  const profileName = document.createElement("div");
  profileName.className = "qws-fo-profile-name";
  const profileStatus = document.createElement("span");
  profileStatus.className = "qws-fo-profile-status-pill";
  const profileStatusDot = document.createElement("span");
  profileStatusDot.className = "qws-fo-profile-status-dot";
  const profileStatusText = document.createElement("span");
  profileStatus.append(profileStatusDot, profileStatusText);
  profileNameRow.append(profileName, profileStatus);

  const profileMeta = document.createElement("div");
  profileMeta.className = "qws-fo-profile-meta";

  profileHeadline.append(profileNameRow, profileMeta);
  profileInfo.append(profileAvatar, profileHeadline);

  const profileActions = document.createElement("div");
  profileActions.className = "qws-fo-profile-actions";
  const joinWrap = document.createElement("div");
  joinWrap.className = "qws-fo-profile-join";
  const joinBtn = createButton("Join room", { size: "sm", variant: "primary" });
  const joinBtnLabel = joinBtn.querySelector<HTMLSpanElement>(".qws-fo-btn__label");
  const seatInfo = document.createElement("span");
  seatInfo.className = "qws-fo-profile-seat";
  joinWrap.append(joinBtn, seatInfo);
  const chatIcon = document.createElement("span");
  chatIcon.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="currentColor"/>' +
    '<circle cx="9" cy="10" r="1.5" fill="#0b1020"/>' +
    '<circle cx="13" cy="10" r="1.5" fill="#0b1020"/>' +
    '<circle cx="17" cy="10" r="1.5" fill="#0b1020"/>' +
    "</svg>";
  const chatBtn = createButton("", { size: "sm", variant: "ghost", icon: chatIcon });
  chatBtn.setAttribute("aria-label", "Chat");
  chatBtn.classList.add("qws-fo-chat-btn");
  profileActions.append(joinWrap, chatBtn);

  profileHeader.append(profileInfo, profileActions);

  const profileGrid = document.createElement("div");
  profileGrid.className = "qws-fo-profile-grid";

  const inspectSection = document.createElement("div");
  inspectSection.className = "qws-fo-profile-section";
  const inspectTitle = document.createElement("div");
  inspectTitle.className = "qws-fo-profile-section-title";
  inspectTitle.textContent = "Inspect";
  const inspectGrid = document.createElement("div");
  inspectGrid.className = "qws-fo-inspect-grid";
  inspectSection.append(inspectTitle, inspectGrid);

  const profileCoins = document.createElement("div");
  profileCoins.className = "qws-fo-profile-coins";
  const profileCoinsIcon = document.createElement("img");
  profileCoinsIcon.className = "qws-fo-profile-coins-icon";
  profileCoinsIcon.alt = "Coins";
  profileCoinsIcon.src = coin.img64;
  const profileCoinsValue = document.createElement("span");
  profileCoinsValue.className = "qws-fo-profile-coins-value";
  profileCoins.append(profileCoinsIcon, profileCoinsValue);

  const groupInvite = document.createElement("div");
  groupInvite.className = "qws-fo-profile-group";
  const groupInviteTitle = document.createElement("div");
  groupInviteTitle.className = "qws-fo-profile-group-title";
  groupInviteTitle.textContent = "Invite to group";
  const groupInviteRow = document.createElement("div");
  groupInviteRow.className = "qws-fo-profile-group-row";
  const groupSelect = document.createElement("select");
  groupSelect.className = "qws-fo-profile-group-select";
  const groupInviteBtn = createButton("Invite", { size: "sm", variant: "primary" });
  groupInviteRow.append(groupSelect, groupInviteBtn);
  const groupInviteStatus = document.createElement("div");
  groupInviteStatus.className = "qws-fo-profile-group-status";
  groupInvite.append(groupInviteTitle, groupInviteRow, groupInviteStatus);

  profileGrid.append(inspectSection);
  profileCard.append(profileHeader, profileCoins, groupInvite, profileGrid);
  profileWrap.append(profileTop, profileCard);

  const runInspect = async (
    section: PlayerViewSection,
    label: string,
    resolver: (view: PlayerView | undefined) => unknown,
    showModal: (payload: unknown) => Promise<void>,
    waitClose: () => Promise<boolean>,
  ) => {
    if (!activeFriend?.playerId) return;
    let didClose = false;
    try {
      const views = await fetchPlayersView([activeFriend.playerId], { sections: [section] });
      const view = views[0];
      const payload = resolver(view);
      if (!payload) {
        await toastSimple(label, `${label} data unavailable.`, "info");
        return;
      }
      try {
        window.dispatchEvent(new CustomEvent("qws-friend-overlay-close"));
        didClose = true;
      } catch {}
      await showModal(payload);
      await waitClose();
    } catch (error) {
      console.error(`[FriendOverlay] Failed to load ${label.toLowerCase()}`, error);
      await toastSimple(label, `Unable to load ${label.toLowerCase()}.`, "error");
    } finally {
      if (didClose) {
        try {
          window.dispatchEvent(new CustomEvent("qws-friend-overlay-open"));
        } catch {}
      }
    }
  };

  const createInspectCard = (label: string, iconContent: string | { category: string; id: string | string[] }): HTMLButtonElement => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "qws-fo-inspect-card";
    const icon = document.createElement("div");
    icon.className = "qws-fo-inspect-icon";

    if (typeof iconContent === "string") {
      icon.innerHTML = iconContent;
    } else {
      const spriteContainer = document.createElement("span");
      spriteContainer.style.display = "flex";
      spriteContainer.style.alignItems = "center";
      spriteContainer.style.justifyContent = "center";
      spriteContainer.style.width = "100%";
      spriteContainer.style.height = "100%";
      icon.appendChild(spriteContainer);
      attachSpriteIcon(spriteContainer, [iconContent.category], iconContent.id, 28, "friend-inspect", {
        onNoSpriteFound: (meta) => {
          console.warn("[FriendOverlay] Sprite not found:", meta);
        },
      });
    }

    const labelEl = document.createElement("div");
    labelEl.className = "qws-fo-inspect-label";
    labelEl.textContent = label;
    card.append(icon, labelEl);
    return card;
  };

  const gardenIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 12c-1.5-2-4-3-6-3 0 3 1 6 6 6s6-3 6-6c-2 0-4.5 1-6 3z"/></svg>';
  const inventoryIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
  const statsIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>';
  const journalIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8"/><path d="M8 11h6"/></svg>';
  const activityIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';

  const gardenBtn = createInspectCard("Garden", gardenIcon);
  const inventoryBtn = createInspectCard("Inventory", inventoryIcon);
  const statsBtn = createInspectCard("Stats", statsIcon);
  const journalBtn = createInspectCard("Journal", journalIcon);
  const activityBtn = createInspectCard("Activity", activityIcon);
  inspectGrid.append(gardenBtn, inventoryBtn, statsBtn, journalBtn, activityBtn);

  let joinRoomId: string | null = null;

  const setGardenPreviewUI = (open: boolean, friendLabel?: string | null) => {
    previewOverlay.classList.toggle("active", open);
    if (open) {
      const name = friendLabel?.trim() || "this friend";
      previewTitle.textContent = `Previewing ${name}'s garden`;
    } else {
      previewTitle.textContent = "";
    }
  };

  const stopGardenPreview = async () => {
    const clearFn = (window as unknown as { qwsEditorClearFriendGardenPreview?: () => Promise<void> })
      .qwsEditorClearFriendGardenPreview;
    if (typeof clearFn === "function") {
      try {
        await clearFn();
      } catch {}
    }
    activeGardenPlayerId = null;
    gardenBtn.textContent = "Garden";
    setGardenPreviewUI(false);
    try {
      window.dispatchEvent(new CustomEvent("qws-friend-overlay-open"));
    } catch {}
  };

  const previewGarden = async () => {
    if (!activeFriend?.playerId) return;
    const clearFn = (window as unknown as { qwsEditorClearFriendGardenPreview?: () => Promise<void> })
      .qwsEditorClearFriendGardenPreview;
    const previewFn = (window as unknown as { qwsEditorPreviewFriendGarden?: (data: unknown) => Promise<boolean> })
      .qwsEditorPreviewFriendGarden;
    if (activeGardenPlayerId === activeFriend.playerId && typeof clearFn === "function") {
      await stopGardenPreview();
      return;
    }
    if (typeof previewFn !== "function") {
      await toastSimple("Garden", "Garden preview unavailable.", "error");
      return;
    }
    const views = await fetchPlayersView([activeFriend.playerId], { sections: ["garden"] });
    const gardenData = views[0]?.state?.garden ?? null;
    if (!gardenData) {
      await toastSimple("Garden", "Garden data unavailable.", "info");
      return;
    }
    const applied = await previewFn(gardenData);
    if (applied) {
      activeGardenPlayerId = activeFriend.playerId;
      gardenBtn.textContent = "Stop garden";
      setGardenPreviewUI(true, activeFriend.playerName ?? activeFriend.playerId);
      try {
        window.dispatchEvent(new CustomEvent("qws-friend-overlay-close"));
      } catch {}
    }
  };

  gardenBtn.addEventListener("click", () => void previewGarden());
  previewStopBtn.addEventListener("click", () => void stopGardenPreview());
  inventoryBtn.addEventListener("click", () => void runInspect(
    "inventory",
    "Inventory",
    (view) => view?.state?.inventory ?? null,
    (payload) => fakeInventoryShow(payload, { open: true }),
    () => waitInventoryPanelClosed(),
  ));
  statsBtn.addEventListener("click", () => void runInspect(
    "stats",
    "Stats",
    (view) => view?.state?.stats ?? null,
    (payload) => fakeStatsShow(payload, { open: true }),
    () => waitStatsModalClosed(),
  ));
  journalBtn.addEventListener("click", () => void runInspect(
    "journal",
    "Journal",
    (view) => view?.state?.journal ?? null,
    (payload) => fakeJournalShow(payload, { open: true }),
    () => waitJournalModalClosed(),
  ));
  activityBtn.addEventListener("click", () => void runInspect(
    "activityLog",
    "Activity log",
    (view) => view?.state?.activityLog ?? view?.state?.activityLogs ?? null,
    (payload) => {
      skipNextActivityLogHistoryReopen();
      return fakeActivityLogShow(payload, { open: true });
    },
    () => waitActivityLogModalClosed(),
  ));

  joinBtn.addEventListener("click", () => {
    if (!joinRoomId) return;
    RoomService.joinPublicRoom({ idRoom: joinRoomId });
  });

  chatBtn.addEventListener("click", () => {
    if (!activeFriend?.playerId) return;
    options.onChat?.(activeFriend.playerId, activeFriend);
  });

  removeBtn.addEventListener("click", async () => {
    if (!activeFriend?.playerId) return;
    const me = await playerDatabaseUserId.get();
    if (!me) return;
    removeBtn.disabled = true;
    try {
      await removeFriend(me, activeFriend.playerId);
      window.dispatchEvent(new CustomEvent("qws-friends-refresh"));
      void friendsTab.refresh({ force: true });
      setProfileOpen(false);
    } catch (error) {
      console.error("[FriendOverlay] removeFriend failed", error);
      await toastSimple("Remove friend", "Unable to remove friend.", "error");
    } finally {
      removeBtn.disabled = false;
    }
  });

  const resolveGroupId = (group: GroupSummary) =>
    (group.id ?? (group as any).groupId ?? (group as any).group_id ?? "").toString();

  const resolveGroupName = (group: GroupSummary) =>
    (group.name ?? (group as any).group_name ?? "Untitled group").toString();

  const resolveGroupCount = (group: GroupSummary) => {
    const raw =
      (group as any).memberCount ??
      (group as any).member_count ??
      (group as any).membersCount ??
      (group as any).members_count ??
      (group as any).members?.length ??
      null;
    const num = Number(raw);
    return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : null;
  };

  const renderGroupInvite = () => {
    const hasFriend = Boolean(activeFriend?.playerId);
    groupInvite.style.display = hasFriend ? "flex" : "none";
    if (!hasFriend) return;

    groupSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = ownerGroupsLoading
      ? "Loading groups..."
      : ownerGroups.length
        ? "Select a group..."
        : "No groups available";
    placeholder.disabled = true;
    placeholder.selected = true;
    groupSelect.appendChild(placeholder);

    for (const group of ownerGroups) {
      const id = resolveGroupId(group);
      if (!id) continue;
      const opt = document.createElement("option");
      opt.value = id;
      const count = resolveGroupCount(group);
      opt.textContent = count !== null
        ? `${resolveGroupName(group)} (${count}/12)`
        : resolveGroupName(group);
      groupSelect.appendChild(opt);
    }

    const enableInvite = Boolean(activeFriend?.playerId) && ownerGroups.length > 0 && !ownerGroupsLoading;
    setButtonEnabled(groupInviteBtn, enableInvite);
    groupSelect.disabled = !enableInvite;
    groupInviteStatus.textContent = ownerGroupsLoading
      ? "Loading your groups..."
      : ownerGroups.length
        ? "Select a group to invite this friend."
        : "Create a group to invite friends.";
  };

  const ensureOwnerGroupsLoaded = async () => {
    if (ownerGroupsLoading || ownerGroupsLoaded) return;
    ownerGroupsLoading = true;
    renderGroupInvite();
    try {
      const me = currentPlayerId ?? await playerDatabaseUserId.get();
      if (!me) {
        ownerGroups = [];
        ownerGroupsLoaded = true;
        return;
      }
      const groups = await fetchGroups(me);
      ownerGroups = (groups ?? []).filter((g) => {
        const role = String((g as any).role ?? "").toLowerCase();
        if (role === "owner") return true;
        const ownerId = (g as any).ownerId ?? (g as any).owner_id;
        return ownerId ? String(ownerId) === String(me) : false;
      });
      ownerGroupsLoaded = true;
    } finally {
      ownerGroupsLoading = false;
      renderGroupInvite();
    }
  };

  groupInviteBtn.addEventListener("click", async () => {
    const friendId = activeFriend?.playerId ?? null;
    const groupId = groupSelect.value;
    if (!friendId || !groupId) return;
    const me = currentPlayerId ?? await playerDatabaseUserId.get();
    if (!me) return;
    setButtonEnabled(groupInviteBtn, false);
    groupInviteStatus.textContent = "Sending invite...";
    try {
      const ok = await addGroupMember({
        groupId,
        playerId: me,
        memberId: friendId,
      });
      if (!ok) {
        await toastSimple("Groups", "Unable to add member.", "error");
        groupInviteStatus.textContent = "Invite failed.";
        return;
      }
      await toastSimple("Groups", "Member added.", "success");
      groupInviteStatus.textContent = "Invite sent.";
      ownerGroupsLoaded = false;
      void ensureOwnerGroupsLoaded();
    } finally {
      renderGroupInvite();
    }
  });

  const updateProfile = (friend: PlayerView) => {
    activeFriend = friend;
    const displayName = friend.playerName ?? friend.playerId ?? "Unknown friend";
    const roomInfo = friend.room ?? {};
    const roomIsPrivate =
      Boolean((roomInfo as { isPrivate?: boolean }).isPrivate) ||
      Boolean((roomInfo as { is_private?: boolean }).is_private) ||
      Boolean(friend.privacy?.hideRoomFromPublicList);
    const roomLabelRaw =
      typeof (roomInfo as { id?: unknown }).id === "string"
        ? (roomInfo as { id: string }).id.trim()
        : typeof (roomInfo as { roomId?: unknown }).roomId === "string"
          ? (roomInfo as { roomId: string }).roomId.trim()
          : "";
    profileName.textContent = displayName;
    profileStatus.classList.toggle("online", Boolean(friend.isOnline));
    profileStatusText.textContent = friend.isOnline ? "Online" : "Offline";

    const fallbackLetter = displayName.trim().slice(0, 1).toUpperCase() || "?";
    if (friend.avatarUrl) {
      profileAvatarImg.src = friend.avatarUrl;
      profileAvatarImg.style.display = "";
      profileAvatarFallback.style.display = "none";
    } else {
      profileAvatarImg.src = "";
      profileAvatarImg.style.display = "none";
      profileAvatarFallback.textContent = fallbackLetter;
      profileAvatarFallback.style.display = "";
    }

    profileMeta.innerHTML = "";
    if (!friend.isOnline) {
      const lastSeen = formatLastSeen(friend.lastEventAt);
      const seenText = document.createElement("span");
      seenText.className = "qws-fo-profile-chip";
      seenText.textContent = lastSeen ? `Last seen ${lastSeen}` : "Last seen unknown";
      profileMeta.appendChild(seenText);
    } else {
      if (roomLabelRaw) {
        const roomChip = document.createElement("span");
        roomChip.className = "qws-fo-profile-chip";
        roomChip.textContent = roomIsPrivate ? "Private room" : `Room ${roomLabelRaw}`;
        profileMeta.appendChild(roomChip);
      }
    }

    const allowGarden = Boolean(friend.privacy?.showGarden);
    const allowInventory = Boolean(friend.privacy?.showInventory);
    const allowStats = Boolean(friend.privacy?.showStats);
    const allowJournal = Boolean(friend.privacy?.showJournal);
    const allowActivity = Boolean(friend.privacy?.showActivityLog);
    const inspectButtons = [
      { btn: gardenBtn, allow: allowGarden, title: "Inspect garden" },
      { btn: inventoryBtn, allow: allowInventory, title: "Inspect inventory" },
      { btn: statsBtn, allow: allowStats, title: "Inspect stats" },
      { btn: journalBtn, allow: allowJournal, title: "Inspect journal" },
      { btn: activityBtn, allow: allowActivity, title: "Inspect activity log" },
    ];
    let visibleInspect = 0;
    inspectButtons.forEach(({ btn, allow, title }) => {
      btn.style.display = allow ? "" : "none";
      setButtonEnabled(btn, allow);
      btn.title = allow ? title : "Hidden by privacy";
      if (allow) visibleInspect += 1;
    });
    inspectSection.style.display = visibleInspect ? "flex" : "none";

    const gardenLabel = gardenBtn.querySelector(".qws-fo-inspect-label");
    if (gardenLabel) {
      if (activeGardenPlayerId !== friend.playerId) {
        gardenLabel.textContent = "Garden";
      } else {
        gardenLabel.textContent = "Stop garden";
      }
    }

    joinRoomId = roomLabelRaw || null;

    const rawPlayerCount =
      (roomInfo as { playersCount?: unknown }).playersCount ??
      (roomInfo as { players_count?: unknown }).players_count ??
      (roomInfo as { players?: unknown }).players ??
      null;
    const playersCount =
      rawPlayerCount != null && Number.isFinite(Number(rawPlayerCount))
        ? Math.floor(Number(rawPlayerCount))
        : null;
    const ROOM_CAPACITY = 6;
    const seatsLeft =
      typeof playersCount === "number"
        ? Math.max(0, ROOM_CAPACITY - playersCount)
        : null;
    const isOnline = Boolean(friend.isOnline);
    const isDiscordTarget = RoomService.isDiscordActivity();

    const canJoinRoom =
      Boolean(joinRoomId) &&
      !isDiscordTarget &&
      !roomIsPrivate &&
      isOnline &&
      (playersCount == null || seatsLeft === null || seatsLeft > 0);
    const joinButtonTitle = roomIsPrivate
      ? "Room is private"
      : !isOnline
        ? "Player is offline"
        : isDiscordTarget
          ? "Joining rooms is disabled on Discord"
          : playersCount !== null && playersCount >= ROOM_CAPACITY
            ? "Room is full"
            : "Unable to join this room";

    setButtonEnabled(joinBtn, canJoinRoom);
    joinBtn.title = canJoinRoom ? "Join room" : joinButtonTitle;
    const countLabel = isOnline && typeof playersCount === "number"
      ? `${playersCount}/${ROOM_CAPACITY}`
      : "";
    const joinLabel = countLabel ? `Join room (${countLabel})` : "Join room";
    if (joinBtnLabel) {
      joinBtnLabel.textContent = joinLabel;
    } else {
      joinBtn.textContent = joinLabel;
    }
    seatInfo.textContent = "";
    seatInfo.style.display = "none";

    const coinsValue = Number(friend.coins);
    if (Number.isFinite(coinsValue)) {
      profileCoinsValue.textContent = coinsValue.toLocaleString("en-US");
      profileCoins.style.display = "flex";
    } else {
      profileCoinsValue.textContent = "";
      profileCoins.style.display = "none";
    }
    setButtonEnabled(chatBtn, Boolean(friend.playerId));
    chatBtn.title = friend.playerId ? "Open chat" : "Player ID unavailable";
    void ensureOwnerGroupsLoaded();
    renderGroupInvite();
  };

  const setProfileOpen = (open: boolean) => {
    profileOpen = open;
    listWrap.style.display = open ? "none" : "flex";
    profileWrap.classList.toggle("active", open);
  };

  const handleFriendOpen = (event: Event) => {
    const detail = (event as CustomEvent<{ playerId?: string; friend?: FriendSummary | PlayerView }>).detail;
    if (!detail) return;
    const targetId = detail.playerId ?? (detail.friend as { playerId?: string } | undefined)?.playerId;
    if (!targetId) return;

    // Show immediately with available data, then enrich with full PlayerView
    const partial = detail.friend;
    updateProfile({
      playerId: targetId,
      playerName: (partial as { playerName?: string | null } | undefined)?.playerName ?? targetId,
      avatarUrl: (partial as { avatarUrl?: string | null } | undefined)?.avatarUrl ?? null,
      avatar: (partial as { avatar?: string[] | null } | undefined)?.avatar ?? null,
      lastEventAt: (partial as { lastEventAt?: string | null } | undefined)?.lastEventAt ?? null,
      isOnline: (partial as { isOnline?: boolean } | undefined)?.isOnline ?? false,
      privacy: (partial as { privacy?: Record<string, unknown> } | undefined)?.privacy ?? {},
      room: (partial as { room?: unknown } | undefined)?.room ?? null,
      coins: null,
    } as PlayerView);
    setProfileOpen(true);

    // Fetch full data in the background to get room info
    void fetchPlayerView(targetId).then((full) => {
      if (full && profileOpen) updateProfile(full);
    });
  };

  backBtn.addEventListener("click", () => setProfileOpen(false));
  window.addEventListener("qws-friend-info-open", handleFriendOpen as EventListener);

  playerDatabaseUserId
    .onChangeNow((next) => {
      const id = next ? String(next) : null;
      currentPlayerId = id;
      ownerGroupsLoaded = false;
      resetPresenceStream(id);
    })
    .then((unsub) => {
      presenceUnsub = unsub;
    })
    .catch(() => {});

  return {
    root,
    show: () => {
      if (profileOpen) return;
    },
    hide: () => {
      // keep state when switching/closing
    },
    refresh: () => {
      void friendsTab.refresh({ force: true });
    },
    destroy: () => {
      window.removeEventListener("qws-friend-info-open", handleFriendOpen as EventListener);
      friendsTab.destroy();
      addTab.destroy();
      requestsTab.destroy();
      try {
        presenceUnsub?.();
      } catch {}
      if (presenceStream) {
        try {
          presenceStream.close();
        } catch {}
        presenceStream = null;
      }
      previewOverlay.remove();
    },
  };
}
