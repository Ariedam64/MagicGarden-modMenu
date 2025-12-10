import { Menu } from "../menu";
import { player, playerDatabaseUserId } from "../../store/atoms";
import {
  fetchFriendsWithViews,
  fetchIncomingRequestsWithViews,
  fetchPlayersView,
  getCachedFriendsWithViews,
  getCachedIncomingRequestsWithViews,
  respondFriendRequest,
  removeFriend,
  sendFriendRequest,
  type PlayerView,
  type PlayerViewSection,
} from "../../utils/supabase";
import {
  getFriendSettings,
  onFriendSettingsChange,
  patchFriendSettings,
  type FriendSettings,
} from "../../utils/friendSettings";
import { RoomService } from "../../services/room";
import {
  fakeInventoryShow,
  fakeActivityLogShow,
  fakeStatsShow,
  fakeJournalShow,
} from "../../services/fakeModal";
import { skipNextActivityLogHistoryReopen } from "../../services/activityLogHistory";
import { toastSimple } from "../../ui/toast";

type LoadFriendsOptions = {
  force?: boolean;
};

const FRIENDS_MENU_REFRESH_STYLE_ID = "friends-menu-refresh-style";

function ensureFriendsMenuRefreshStyle(): void {
  if (document.getElementById(FRIENDS_MENU_REFRESH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FRIENDS_MENU_REFRESH_STYLE_ID;
  style.textContent = `
@keyframes friends-menu-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
`;
  document.head.appendChild(style);
}

type RefreshIndicatorHandle = {
  setVisible: (visible: boolean) => void;
};

function createRefreshIndicator(
  scrollTarget: HTMLElement,
  container: HTMLElement,
  offsetY = 14
): RefreshIndicatorHandle {
  ensureFriendsMenuRefreshStyle();
  const computedPosition = container.style.position || "";
  if (!computedPosition || computedPosition === "static") {
    container.style.position = "relative";
  }

  const indicator = document.createElement("div");
  Object.assign(indicator.style, {
    position: "absolute",
    top: `${offsetY}px`,
    right: "14px",
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(14, 16, 25, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.45)",
    opacity: "0",
    visibility: "hidden",
    pointerEvents: "none",
    transition: "opacity 160ms ease, transform 160ms ease",
    zIndex: "3",
  } as CSSStyleDeclaration);

  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    width: "16px",
    height: "16px",
    borderRadius: "999px",
    border: "2px solid rgba(248, 250, 252, 0.16)",
    borderTopColor: "#f8fafc",
    animation: "friends-menu-spin 1s linear infinite",
  } as CSSStyleDeclaration);
  indicator.appendChild(spinner);

  container.appendChild(indicator);

  let isVisible = false;
  let hideTimeout: number | null = null;

  const hide = () => {
    if (hideTimeout) {
      window.clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    indicator.style.opacity = "0";
    const onTransitionEnd = () => {
      if (!isVisible) {
        indicator.style.visibility = "hidden";
      }
    };
    indicator.addEventListener("transitionend", onTransitionEnd, { once: true });
    hideTimeout = window.setTimeout(() => {
      if (!isVisible) {
        indicator.style.visibility = "hidden";
      }
      hideTimeout = null;
    }, 220);
  };

  const setVisible = (next: boolean) => {
    if (next) {
      if (hideTimeout) {
        window.clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      isVisible = true;
      indicator.style.visibility = "visible";
      indicator.style.opacity = "1";
    } else if (isVisible) {
      isVisible = false;
      hide();
    }
  };

  return { setVisible };
}

type GardenPreviewState = {
  button: HTMLButtonElement;
  playerId: string;
};

let activeGardenPreview: GardenPreviewState | null = null;

async function stopActiveGardenPreview(keepButton?: HTMLButtonElement): Promise<void> {
  if (!activeGardenPreview) return;
  const clearFn = (window as any).qwsEditorClearFriendGardenPreview;
  if (typeof clearFn === "function") {
    try {
      await clearFn();
    } catch (error) {
      console.error("[FriendsMenu] clear garden preview", error);
    }
  }
  const prevButton = activeGardenPreview.button;
  if (!keepButton || keepButton !== prevButton) {
    const defaultLabel = prevButton.dataset.gardenDefaultLabel ?? "Garden";
    prevButton.textContent = defaultLabel;
  }
  activeGardenPreview = null;
}

let refreshAllFriends: ((options?: LoadFriendsOptions) => Promise<void>) | null =
  null;
let refreshIncomingRequests: ((options?: { force?: boolean }) => Promise<void>) | null =
  null;

function formatLastSeen(timestamp?: string | null): string | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (deltaSeconds < 60) {
    return deltaSeconds <= 15 ? "just now" : `${deltaSeconds}s`;
  }
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCoinAmount(value: number | string | null): string | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric == null || !Number.isFinite(numeric)) return null;
  const abs = Math.abs(numeric);
  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  for (const { threshold, suffix } of units) {
    if (abs >= threshold) {
      const normalized = numeric / threshold;
      return `${normalized.toFixed(2)}${suffix}`;
    }
  }
  return numeric.toLocaleString("en-US");
}

function createPrivacyBadge(label: string, enabled: boolean): HTMLElement {
  const badge = document.createElement("span");
  badge.textContent = label;
  badge.style.fontSize = "16px";
  badge.style.lineHeight = "1";
  badge.style.opacity = enabled ? "1" : "0.3";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.width = "auto";
  badge.style.height = "auto";
  badge.style.fontWeight = "500";
  return badge;
}


function createFriendRow(ui: Menu, friend: PlayerView) {
  const card = document.createElement("div");
  card.style.display = "grid";
  card.style.gridTemplateColumns = "1fr";
  card.style.alignItems = "stretch";
  card.style.gap = "8px";
  card.style.padding = "10px 12px";
  card.style.borderRadius = "10px";
  card.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  card.style.background = "rgba(255, 255, 255, 0.02)";
  card.style.boxShadow = "0 1px 0 rgba(0, 0, 0, 0.35) inset";
  card.style.cursor = "default";

  const roomInfo = friend.room ?? {};
  const roomIsPrivate =
    Boolean(roomInfo.isPrivate) ||
    Boolean(roomInfo.is_private) ||
    Boolean(friend.privacy?.hideRoomFromPublicList);
  const joinRoomId =
    typeof roomInfo.id === "string"
      ? roomInfo.id.trim()
      : typeof roomInfo.roomId === "string"
      ? roomInfo.roomId.trim()
      : null;
  const rawPlayerCount =
    roomInfo.playersCount ?? roomInfo.players_count ?? roomInfo.players ?? null;
  const playersCount =
    Number.isFinite(Number(rawPlayerCount)) && rawPlayerCount !== null
      ? Math.floor(Number(rawPlayerCount))
      : null;
  const isFriendOnline = Boolean(friend.isOnline);
  const isDiscordTarget = RoomService.isDiscordActivity();
  const ROOM_CAPACITY = 6;
  const seatsLeft =
    typeof playersCount === "number"
      ? Math.max(0, ROOM_CAPACITY - playersCount)
      : null;
  const canJoinRoom =
    Boolean(joinRoomId) &&
    typeof playersCount === "number" &&
    seatsLeft !== null &&
    seatsLeft > 0 &&
    !isDiscordTarget &&
    !roomIsPrivate &&
    isFriendOnline;
  const joinButtonTitle = roomIsPrivate
    ? "Room is private"
    : !isFriendOnline
    ? "Player is offline"
    : isDiscordTarget
    ? "Joining rooms is disabled on Discord"
    : playersCount !== null && playersCount >= 6
    ? "Room is full"
    : "Unable to join this room";

  const avatar = document.createElement("div");
  avatar.style.width = "48px";
  avatar.style.height = "48px";
  avatar.style.display = "grid";
  avatar.style.placeItems = "center";
  avatar.style.borderRadius = "50%";
  avatar.style.background = "rgba(255, 255, 255, 0.07)";
  avatar.style.fontWeight = "600";
  avatar.style.fontSize = "14px";
  avatar.style.color = "#f8fafc";
  avatar.style.overflow = "hidden";

  if (friend.avatarUrl) {
    const img = document.createElement("img");
    img.src = friend.avatarUrl;
    img.alt = friend.playerName ?? friend.playerId ?? "Friend avatar";
    img.width = 48;
    img.height = 48;
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    avatar.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    const label = (friend.playerName ?? friend.playerId ?? "F").trim();
    fallback.textContent = label.charAt(0).toUpperCase();
    fallback.style.fontSize = "15px";
    avatar.appendChild(fallback);
  }

  const infoColumn = document.createElement("div");
  infoColumn.style.display = "grid";
  infoColumn.style.gridTemplateColumns = "52px 1fr";
  infoColumn.style.alignItems = "center";
  infoColumn.style.gap = "10px";
  infoColumn.style.minWidth = "0";

  const textGrid = document.createElement("div");
  textGrid.style.display = "grid";
  textGrid.style.gridTemplateColumns = "1fr auto";
  textGrid.style.alignItems = "stretch";
  textGrid.style.gap = "12px";

  const textStack = document.createElement("div");
  textStack.style.display = "grid";
  textStack.style.gap = "4px";
  textStack.style.minWidth = "0";
  textStack.style.alignItems = "flex-start";

  const nameEl = document.createElement("div");
  nameEl.textContent = friend.playerName ?? friend.playerId ?? "Unknown friend";
  nameEl.style.fontWeight = "600";
  nameEl.style.fontSize = "13px";
  nameEl.style.whiteSpace = "nowrap";
  nameEl.style.overflow = "hidden";
  nameEl.style.textOverflow = "ellipsis";
  nameEl.style.flex = "1";

  const statusRow = document.createElement("div");
  statusRow.style.display = "flex";
  statusRow.style.alignItems = "center";
  statusRow.style.gap = "6px";

  const statusIndicator = document.createElement("span");
  statusIndicator.style.width = "10px";
  statusIndicator.style.height = "10px";
  statusIndicator.style.borderRadius = "50%";
  statusIndicator.style.background = isFriendOnline ? "#34d399" : "#f87171";
  statusIndicator.style.display = "inline-block";

  const statusText = document.createElement("span");
  statusText.textContent = isFriendOnline ? "Online" : "Offline";
  statusText.style.fontSize = "11px";
  statusText.style.opacity = "0.7";

  statusRow.append(statusIndicator, statusText);

  const metaColumn = document.createElement("div");
  metaColumn.style.display = "flex";
  metaColumn.style.flexDirection = "column";
  metaColumn.style.alignItems = "flex-end";
  metaColumn.style.justifyContent = "flex-start";
  metaColumn.style.height = "100%";
  metaColumn.style.minHeight = "38px";
  metaColumn.style.alignSelf = "stretch";
  metaColumn.style.gap = "4px";

  const lastSeenText = formatLastSeen(friend.lastEventAt);
  let lastSeenEl: HTMLDivElement | null = null;
  if (lastSeenText) {
    lastSeenEl = document.createElement("div");
    lastSeenEl.style.fontSize = "11px";
    lastSeenEl.style.opacity = "0.65";
    lastSeenEl.style.whiteSpace = "nowrap";
    lastSeenEl.textContent = `Last seen ${lastSeenText}`;
  }

  textStack.append(nameEl, statusRow);
  if (lastSeenEl) {
    textStack.append(lastSeenEl);
  }
  textGrid.append(textStack, metaColumn);
  infoColumn.append(avatar, textGrid);

  const actionBlock = document.createElement("div");
  actionBlock.style.display = "grid";
  actionBlock.style.justifyItems = "end";
  actionBlock.style.alignItems = "end";
  actionBlock.style.alignContent = "stretch";
  actionBlock.style.gridAutoFlow = "row";
  actionBlock.style.gridTemplateRows = "repeat(3, min-content)";
  actionBlock.style.gap = "6px";

  const chevron = document.createElement("span");
  chevron.textContent = "▾";
  chevron.style.display = "inline-block";
  chevron.style.transition = "transform 0.2s ease";
  chevron.style.transform = "rotate(-90deg)";

  const detailsBtn = ui.btn("Details", { size: "sm", variant: "ghost", icon: chevron });
  detailsBtn.style.minWidth = "86px";
  detailsBtn.style.justifyContent = "center";
  detailsBtn.title =
    "Show friend privacy badges and coins information when available.";

  const joinButton = ui.btn("Join", { size: "sm", variant: "primary" });
  joinButton.style.minWidth = "86px";
  joinButton.style.boxShadow = "0 4px 10px rgba(56, 189, 248, 0.35)";
  ui.setButtonEnabled(joinButton, canJoinRoom);
  joinButton.title = joinButtonTitle;
  joinButton.addEventListener("click", () => {
    if (!canJoinRoom || !joinRoomId) return;
    RoomService.joinPublicRoom({ idRoom: joinRoomId });
  });
  const joinControl = document.createElement("div");
  joinControl.style.display = "grid";
  joinControl.style.gap = "4px";
  joinControl.style.justifyItems = "center";
  joinControl.append(joinButton);
  const seatsInfo = document.createElement("div");
  seatsInfo.style.fontSize = "11px";
  seatsInfo.style.opacity = "0.6";
  seatsInfo.style.whiteSpace = "nowrap";
  seatsInfo.style.textAlign = "center";
  seatsInfo.style.margin = "0";
  if (roomIsPrivate) {
    seatsInfo.textContent = "Private";
  } else if (!isFriendOnline) {
    seatsInfo.textContent = "";
  } else if (seatsLeft !== null) {
    seatsInfo.textContent =
      seatsLeft > 0 ? `${seatsLeft} slot${seatsLeft === 1 ? "" : "s"} left` : "Room full";
  } else {
    seatsInfo.textContent = "";
  }
  joinControl.appendChild(seatsInfo);
  actionBlock.append(detailsBtn, joinControl);

  const rowHeader = document.createElement("div");
  rowHeader.style.display = "grid";
  rowHeader.style.gridTemplateColumns = "minmax(0, 1fr) auto";
  rowHeader.style.alignItems = "stretch";
  rowHeader.style.gap = "10px";
  rowHeader.append(infoColumn, actionBlock);

  const detailsContainer = document.createElement("div");
  detailsContainer.style.overflow = "hidden";
  detailsContainer.style.maxHeight = "0";
  detailsContainer.style.opacity = "0";
  detailsContainer.style.marginTop = "0";
  detailsContainer.style.transition = "max-height 160ms ease, opacity 160ms ease, margin-top 160ms ease";

  const coinsText = formatCoinAmount(friend.coins);
  const detailsContent = document.createElement("div");
  detailsContent.style.display = "grid";
  detailsContent.style.gridTemplateColumns = "minmax(0, 1fr)";
  detailsContent.style.alignItems = "stretch";
  detailsContent.style.gap = "6px";
  detailsContent.style.padding = "6px 0 0 0";

  const badgesRow = document.createElement("div");
  badgesRow.style.display = "flex";
  badgesRow.style.alignItems = "center";
  badgesRow.style.gap = "0";
  badgesRow.style.flexWrap = "nowrap";
  badgesRow.style.minHeight = "0";
  badgesRow.style.justifyContent = "flex-start";
  badgesRow.style.width = "auto";
  [
    { label: "💰", enabled: Boolean(friend.privacy?.showCoins) },
    { label: "🎒", enabled: Boolean(friend.privacy?.showInventory) },
    { label: "🌱", enabled: Boolean(friend.privacy?.showGarden) },
    { label: "📋", enabled: Boolean(friend.privacy?.showActivityLog) },
    { label: "📰", enabled: Boolean(friend.privacy?.showJournal) },
    { label: "📊", enabled: Boolean(friend.privacy?.showStats) },
  ].forEach(({ label, enabled }) => {
    badgesRow.append(createPrivacyBadge(label, enabled));
  });

  if (coinsText) {
    const coinsRow = document.createElement("div");
    coinsRow.style.display = "flex";
    coinsRow.style.justifyContent = "flex-start";
    const coinsEl = document.createElement("div");
    coinsEl.textContent = `${coinsText} coins`;
    coinsEl.style.fontSize = "12px";
    coinsEl.style.opacity = "0.8";
    coinsEl.style.whiteSpace = "nowrap";
    coinsEl.style.justifySelf = "start";
    coinsRow.append(coinsEl);
    detailsContent.append(coinsRow);
  }
  if (joinRoomId && isFriendOnline) {
    const roomRow = document.createElement("div");
    roomRow.style.display = "flex";
    roomRow.style.alignItems = "center";
    roomRow.style.gap = "8px";
    roomRow.style.paddingRight = "16px";
    const roomLabel = document.createElement("span");
    roomLabel.textContent = "Room";
    roomLabel.style.fontSize = "12px";
    roomLabel.style.fontWeight = "600";
    roomLabel.style.opacity = "0.8";
    const roomValue = document.createElement("span");
    roomValue.textContent = joinRoomId;
    roomValue.style.fontSize = "12px";
    roomValue.style.opacity = "0.9";
    roomValue.style.whiteSpace = "nowrap";
    roomRow.append(roomLabel);
    if (roomIsPrivate) {
      const lockIcon = document.createElement("span");
      lockIcon.textContent = "🔒";
      lockIcon.style.fontSize = "12px";
      lockIcon.style.opacity = "0.8";
      lockIcon.style.display = "inline-flex";
      lockIcon.style.alignItems = "center";
      lockIcon.style.justifyContent = "center";
      lockIcon.style.lineHeight = "1";
      lockIcon.title = "Room is private";
      roomRow.append(lockIcon);
    } else {
      roomRow.append(roomValue);
    }
    detailsContent.append(roomRow);
  }
  const privacyRow = document.createElement("div");
  privacyRow.style.display = "flex";
  privacyRow.style.alignItems = "center";
  privacyRow.style.gap = "8px";
  const privacyLabel = document.createElement("span");
  privacyLabel.textContent = "Privacy";
  privacyLabel.style.fontSize = "12px";
  privacyLabel.style.fontWeight = "600";
  privacyLabel.style.opacity = "0.8";
  privacyRow.append(privacyLabel, badgesRow);
  detailsContent.append(privacyRow);

  const styleDetailButton = (btn: HTMLButtonElement) => {
    btn.style.textTransform = "none";
    btn.style.padding = "6px 10px";
    btn.style.background = "rgba(148, 163, 184, 0.12)";
    btn.style.color = "#f8fafc";
    btn.style.border = "1px solid rgba(248, 250, 252, 0.3)";
    btn.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.2)";
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(248, 250, 252, 0.12)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(148, 163, 184, 0.12)";
    });
  };

  let gardenToggleBtn: HTMLButtonElement | null = null;
  const buttonRow = ui.flexRow({ gap: 6, align: "center" });
  buttonRow.style.flexWrap = "wrap";
  buttonRow.style.marginTop = "4px";
  buttonRow.style.justifyContent = "flex-start";
  buttonRow.style.alignSelf = "flex-start";

  const detailButton = (
    label: string,
    section: PlayerViewSection,
    resolver: (view: PlayerView | undefined) => any,
    showModal: (payload: any) => Promise<void>,
  ) => {
    const btn = ui.btn(label, { size: "sm", variant: "ghost" });
    styleDetailButton(btn);
    btn.addEventListener("click", async () => {
      if (!friend.playerId) return;
      btn.disabled = true;
      try {
        const views = await fetchPlayersView([friend.playerId], { sections: [section] });
        const view = views[0];
        const payload = resolver(view);
        if (!payload) {
          await toastSimple(label, `${label} data unavailable.`, "info");
          return;
        }
        await showModal(payload);
      } catch (error) {
        console.error(`[FriendsMenu] Failed to load ${label.toLowerCase()}`, error);
        await toastSimple(label, `Unable to load ${label.toLowerCase()}.`, "error");
      } finally {
        btn.disabled = false;
      }
    });
    return btn;
  };

  buttonRow.appendChild(
    detailButton(
      "Inventory",
      "inventory",
      (view) => view?.state?.inventory ?? null,
      (payload) => fakeInventoryShow(payload, { open: true }),
    ),
  );
  gardenToggleBtn = ui.btn("Garden", { size: "sm", variant: "ghost" });
  styleDetailButton(gardenToggleBtn);
  gardenToggleBtn.dataset.gardenDefaultLabel = "Garden";
  const setGardenButtonLabel = (label: string) => {
    if (gardenToggleBtn) {
      gardenToggleBtn.textContent = label;
    }
  };

  gardenToggleBtn.addEventListener("click", async () => {
    if (!gardenToggleBtn) return;
    const isActive = activeGardenPreview?.button === gardenToggleBtn;
    gardenToggleBtn.disabled = true;
    const resetLabel = () => setGardenButtonLabel("Garden");
    if (isActive) {
      try {
        await stopActiveGardenPreview(gardenToggleBtn);
      } finally {
        gardenToggleBtn.disabled = false;
        resetLabel();
      }
      return;
    }

    gardenToggleBtn.textContent = "Loading...";
    await stopActiveGardenPreview();
    try {
      if (!friend.playerId) {
        await toastSimple("Garden", "Player ID unavailable.", "error");
        return;
      }
      const [view] = await fetchPlayersView([friend.playerId], { sections: ["garden"] });
      const gardenData = view?.state?.garden ?? null;
      if (!gardenData) {
        await toastSimple("Garden", "Garden data unavailable.", "info");
        return;
      }
      const previewFn = (window as any).qwsEditorPreviewFriendGarden;
      if (typeof previewFn !== "function") {
        await toastSimple("Garden", "Garden preview unavailable.", "error");
        return;
      }
      const applied = await previewFn(gardenData);
      if (!applied) {
        await toastSimple("Garden", "Unable to preview garden.", "error");
        return;
      }
      activeGardenPreview = { button: gardenToggleBtn, playerId: friend.playerId };
      setGardenButtonLabel("Stop garden");
    } catch (error) {
      console.error("[FriendsMenu] garden preview failed", error);
      await stopActiveGardenPreview();
      await toastSimple("Garden", "Unable to load garden.", "error");
    } finally {
      gardenToggleBtn.disabled = false;
      if (activeGardenPreview?.button !== gardenToggleBtn) {
        resetLabel();
      }
    }
  });
  buttonRow.appendChild(gardenToggleBtn);
  buttonRow.appendChild(
    detailButton(
      "Activity Log",
      "activityLog",
      (view) => view?.state?.activityLog ?? view?.state?.activityLogs ?? null,
      (payload) => {
        skipNextActivityLogHistoryReopen();
        return fakeActivityLogShow(payload, { open: true });
      },
    ),
  );
  buttonRow.appendChild(
    detailButton(
      "Stats",
      "stats",
      (view) => view?.state?.stats ?? null,
      (payload) => fakeStatsShow(payload, { open: true }),
    ),
  );
  buttonRow.appendChild(
    detailButton(
      "Journal",
      "journal",
      (view) => view?.state?.journal ?? null,
      (payload) => fakeJournalShow(payload, { open: true }),
    ),
  );
  detailsContent.append(buttonRow);

  const removeFriendBtn = ui.btn("Remove friend", { size: "sm", variant: "danger" });
  removeFriendBtn.style.textTransform = "none";
  removeFriendBtn.style.padding = "6px 10px";
  removeFriendBtn.style.alignSelf = "flex-start";
  removeFriendBtn.addEventListener("click", async () => {
    const targetId = friend.playerId;
    if (!targetId) return;
    const me = await playerDatabaseUserId.get();
    if (!me) return;
    const original = removeFriendBtn.textContent;
    removeFriendBtn.disabled = true;
    removeFriendBtn.textContent = "Removing...";
    try {
      const removed = await removeFriend(me, targetId);
      if (removed) {
        removeFriendBtn.textContent = "Removed";
        void refreshAllFriends?.({ force: true });
      } else {
        removeFriendBtn.textContent = original;
      }
    } catch (error) {
      console.error("[FriendsMenu] removeFriend", error);
      removeFriendBtn.textContent = original;
    } finally {
      removeFriendBtn.disabled = false;
    }
  });
  detailsContent.append(removeFriendBtn);
  detailsContainer.append(detailsContent);

  const labelSpan = detailsBtn.querySelector<HTMLSpanElement>(".label");
  let detailsExpanded = false;
  const applyDetailsState = () => {
    if (detailsExpanded) {
      const targetHeight = `${detailsContent.scrollHeight}px`;
      detailsContainer.style.maxHeight = targetHeight;
      detailsContainer.style.opacity = "1";
      detailsContainer.style.marginTop = "6px";
      detailsBtn.setAttribute("aria-expanded", "true");
      if (labelSpan) labelSpan.textContent = "Hide details";
      chevron.style.transform = "rotate(0deg)";
    } else {
      detailsContainer.style.maxHeight = "0";
      detailsContainer.style.opacity = "0";
      detailsContainer.style.marginTop = "0";
      detailsBtn.setAttribute("aria-expanded", "false");
      if (labelSpan) labelSpan.textContent = "Details";
      chevron.style.transform = "rotate(-90deg)";
    }
  };

  detailsBtn.addEventListener("click", () => {
    detailsExpanded = !detailsExpanded;
    applyDetailsState();
    if (!detailsExpanded && gardenToggleBtn) {
      void (async () => {
        await stopActiveGardenPreview(gardenToggleBtn);
        setGardenButtonLabel("Garden");
      })();
    }
  });

  applyDetailsState();

  card.append(rowHeader, detailsContainer);
  return card;
}

function renderAllTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";
  wrap.style.position = wrap.style.position || "relative";
  wrap.style.height = "100%";
  wrap.style.minHeight = "0";

  const controls = ui.flexRow({ align: "center", gap: 8 });
  const search = ui.inputText("Search for a friend...");
  search.style.flex = "1";
  search.style.minWidth = "0";
  const refresh = ui.btn("Refresh", { size: "sm", variant: "ghost" });
  refresh.style.background = "rgba(248, 250, 252, 0.08)";
  refresh.style.color = "#f8fafc";
  refresh.style.border = "1px solid rgba(248, 250, 252, 0.15)";
  refresh.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
  controls.append(search, refresh);

  const statusMessage = document.createElement("div");
  statusMessage.style.fontSize = "12px";
  statusMessage.style.opacity = "0.7";
  statusMessage.textContent = "Loading friends...";

  const listContainer = document.createElement("div");
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "column";
  listContainer.style.flex = "1";
  listContainer.style.minHeight = "0";
  listContainer.style.position = "relative";

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "8px";
  list.style.padding = "10px";
  list.style.borderRadius = "10px";
  list.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  list.style.background = "rgba(255, 255, 255, 0.02)";
  list.style.flex = "1";
  list.style.minHeight = "0";
  list.style.overflow = "auto";

  listContainer.appendChild(list);
  wrap.append(controls, statusMessage, listContainer);
  view.appendChild(wrap);

  let friends: PlayerView[] = [];
  let isLoading = false;
  let destroyed = false;
  list.style.position = list.style.position || "relative";
  const refreshIndicator = createRefreshIndicator(list, listContainer);

  const renderPlaceholder = (text: string) => {
    list.innerHTML = "";
    const placeholder = document.createElement("div");
    placeholder.textContent = text;
    placeholder.style.opacity = "0.6";
    placeholder.style.fontSize = "12px";
    placeholder.style.textAlign = "center";
    list.appendChild(placeholder);
  };

  const normalizeQuery = (term: string) => term.trim().toLowerCase();

  const renderList = (options: { force?: boolean } = {}) => {
    if (destroyed) return;
    const shouldForce = options.force ?? true;
    if (isLoading && friends.length && !shouldForce) {
      return;
    }
    list.innerHTML = "";
    if (isLoading) {
      renderPlaceholder("Loading friends...");
      return;
    }
    const showOnlineOnly = getFriendSettings().showOnlineFriendsOnly;
    const query = normalizeQuery(search.value);
    const matching = friends.filter((friend) => {
      const label = (friend.playerName ?? friend.playerId ?? "").toLowerCase();
      return label.includes(query);
    });
    const filtered = showOnlineOnly ? matching.filter((friend) => Boolean(friend.isOnline)) : matching;

    if (!filtered.length) {
      if (friends.length === 0) {
        renderPlaceholder("You have no friends yet.");
        statusMessage.textContent = "No friends available.";
      } else if (query.length > 0) {
        renderPlaceholder("No friends match that search.");
        statusMessage.textContent = `${friends.length} friends loaded.`;
      } else if (showOnlineOnly) {
        renderPlaceholder("No online friends right now.");
        statusMessage.textContent = `${friends.length} friends loaded (online filter).`;
      } else {
        renderPlaceholder("Nothing to show.");
        statusMessage.textContent = `${friends.length} friends loaded.`;
      }
      return;
    }

    for (const friend of filtered) {
      list.appendChild(createFriendRow(ui, friend));
    }
    if (showOnlineOnly) {
      statusMessage.textContent = `${filtered.length} online friend${filtered.length !== 1 ? "s" : ""} shown.`;
    } else {
      statusMessage.textContent = `${filtered.length} friend${filtered.length !== 1 ? "s" : ""} shown.`;
    }
  };

  const updateRefreshControls = () => {
    const enabled = !destroyed && !isLoading;
    ui.setButtonEnabled(refresh, enabled);
    refresh.setAttribute("aria-busy", isLoading ? "true" : "false");
  };

  const loadFriends = async (options?: LoadFriendsOptions) => {
    if (destroyed) return;
    isLoading = true;
    statusMessage.textContent = friends.length ? "Refreshing friends..." : "Loading friends...";
    refreshIndicator.setVisible(true);
    updateRefreshControls();
    renderList({ force: friends.length === 0 });

    try {
      const player = await playerDatabaseUserId.get();
      if (!player) {
        friends = [];
        statusMessage.textContent = "Player ID unavailable.";
        renderPlaceholder("Unable to identify your player.");
        return;
      }
      if (!options?.force) {
        const cached = getCachedFriendsWithViews();
        if (cached.length) {
          friends = cached;
        statusMessage.textContent = `${friends.length} friends loaded.`;
        return;
      }
    }
    friends = await fetchFriendsWithViews(player);
    statusMessage.textContent = friends.length
      ? `${friends.length} friends loaded.`
      : "You have no friends yet.";
  } catch (error) {
    console.error("[FriendsMenu] Failed to load friends", error);
    friends = [];
    statusMessage.textContent = "Failed to load friends.";
    renderPlaceholder("Unable to load friends.");
    return;
  } finally {
    isLoading = false;
    refreshIndicator.setVisible(false);
    updateRefreshControls();
    renderList({ force: true });
  }
};

  search.addEventListener("input", () => {
    renderList({ force: true });
  });

  refresh.addEventListener("click", () => {
    void loadFriends({ force: true });
  });

  const unsubscribeSettings = onFriendSettingsChange(() => {
    if (!destroyed) {
      renderList({ force: true });
    }
  });

  refreshAllFriends = loadFriends;
  void loadFriends();

  (view as any).__cleanup__ = () => {
    destroyed = true;
    unsubscribeSettings();
    if (refreshAllFriends === loadFriends) {
      refreshAllFriends = null;
    }
  };
}

function renderAddFriendTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";
  layout.style.height = "100%";
  layout.style.minHeight = "0";
  layout.style.flex = "1";

  const profileCard = ui.card("My profile");
  profileCard.body.style.display = "grid";
  profileCard.body.style.gap = "12px";

  const profileHeader = document.createElement("div");
  profileHeader.style.display = "flex";
  profileHeader.style.alignItems = "center";
  profileHeader.style.gap = "12px";

  const avatarWrapper = document.createElement("div");
  avatarWrapper.style.width = "48px";
  avatarWrapper.style.height = "48px";
  avatarWrapper.style.borderRadius = "50%";
  avatarWrapper.style.background = "rgba(255, 255, 255, 0.04)";
  avatarWrapper.style.display = "flex";
  avatarWrapper.style.alignItems = "center";
  avatarWrapper.style.justifyContent = "center";
  avatarWrapper.style.overflow = "hidden";
  avatarWrapper.style.border = "1px solid rgba(255, 255, 255, 0.08)";

  const avatarImg = document.createElement("img");
  avatarImg.alt = "Player avatar";
  avatarImg.style.width = "100%";
  avatarImg.style.height = "100%";
  avatarImg.style.objectFit = "cover";
  avatarImg.style.borderRadius = "50%";
  avatarImg.style.display = "none";
  const avatarFallback = document.createElement("span");
  avatarFallback.style.fontSize = "18px";
  avatarFallback.style.fontWeight = "600";
  avatarFallback.style.color = "#f8fafc";
  avatarFallback.style.display = "block";
  avatarWrapper.append(avatarImg, avatarFallback);

  const profileText = document.createElement("div");
  profileText.style.display = "grid";
  profileText.style.gap = "4px";
  profileText.style.flex = "1";

  const profileNameLabel = document.createElement("div");
  profileNameLabel.textContent = "Loading profile...";
  profileNameLabel.style.fontSize = "14px";
  profileNameLabel.style.fontWeight = "600";

  const profileIdLabel = document.createElement("div");
  profileIdLabel.textContent = "Loading player ID...";
  profileIdLabel.style.fontSize = "12px";
  profileIdLabel.style.opacity = "0.8";

  profileText.append(profileNameLabel, profileIdLabel);
  profileHeader.append(avatarWrapper, profileText);
  profileCard.body.appendChild(profileHeader);

  const formCard = ui.card("Add friend");
  formCard.body.style.display = "flex";
  formCard.body.style.flexDirection = "column";
  formCard.body.style.gap = "10px";

  const input = ui.inputText("Player ID");
  input.style.width = "100%";

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.opacity = "0.7";
  status.style.minHeight = "18px";

  const submit = ui.btn("Send request", { variant: "primary", fullWidth: true });
  submit.disabled = true;
  submit.title = "Waiting for profile info...";

  formCard.body.append(input, status, submit);

  layout.append(profileCard.root, formCard.root);
  view.appendChild(layout);

  let myId: string | null = null;
  let isSending = false;

  const updateSubmitState = () => {
    const target = input.value.trim();
    submit.disabled = isSending || !myId || !target;
  };

  input.addEventListener("input", updateSubmitState);

  submit.addEventListener("click", async () => {
    if (!myId) {
      status.textContent = "Player ID missing.";
      return;
    }
    const target = input.value.trim();
    if (!target) {
      status.textContent = "Enter a player ID or name.";
      return;
    }

    isSending = true;
    updateSubmitState();
    status.textContent = "Sending request...";

    try {
      const sent = await sendFriendRequest(myId, target);
      status.textContent = sent
        ? "Friend request sent."
        : "Unable to send request (maybe already friends).";
      if (sent) {
        input.value = "";
      }
    } catch (error) {
      console.error("[FriendsMenu] sendFriendRequest failed", error);
      status.textContent = "Failed to send request.";
    } finally {
      isSending = false;
      updateSubmitState();
    }
  });

  const updateProfileInfo = async () => {
    const [resolved, playerInfo] = await Promise.all([
      playerDatabaseUserId.get(),
      player.get(),
    ]);
    myId = resolved;
    const displayName = (playerInfo?.name ?? "").trim();
    profileNameLabel.textContent = displayName || "Your profile";
    profileIdLabel.textContent = resolved
      ? `Player ID: ${resolved}`
      : "Player ID unavailable.";

    const avatarUrl = (playerInfo?.discordAvatarUrl ?? "").trim();
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "";
      avatarFallback.style.display = "none";
    } else {
      avatarImg.src = "";
      avatarImg.style.display = "none";
      const fallbackLabel = (displayName || resolved || "P").trim();
      avatarFallback.textContent = fallbackLabel
        ? fallbackLabel.charAt(0).toUpperCase()
        : "P";
      avatarFallback.style.display = "";
    }

    updateSubmitState();
  };

  void updateProfileInfo();
}

function renderFriendRequestsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  const card = ui.card("Incoming requests");
  card.root.style.display = "flex";
  card.root.style.flexDirection = "column";
  card.root.style.height = "100%";
  card.root.style.minHeight = "0";
  card.body.style.display = "flex";
  card.body.style.flexDirection = "column";
  card.body.style.gap = "10px";
  card.body.style.flex = "1";
  card.body.style.minHeight = "0";

  const controls = ui.flexRow({ justify: "end", align: "center" });
  const requestsRefresh = ui.btn("Refresh", { size: "sm", variant: "ghost" });
  requestsRefresh.style.background = "rgba(248, 250, 252, 0.08)";
  requestsRefresh.style.color = "#f8fafc";
  requestsRefresh.style.border = "1px solid rgba(248, 250, 252, 0.15)";
  requestsRefresh.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
  requestsRefresh.title = "Reload friend requests";
  requestsRefresh.addEventListener("click", () => {
    void loadRequests({ force: true });
  });
  controls.appendChild(requestsRefresh);
  card.body.appendChild(controls);

  const requestsStatus = document.createElement("div");
  requestsStatus.style.fontSize = "12px";
  requestsStatus.style.opacity = "0.8";
  requestsStatus.textContent = "";
  card.body.appendChild(requestsStatus);

  const requestsListWrapper = document.createElement("div");
  requestsListWrapper.style.position = requestsListWrapper.style.position || "relative";
  requestsListWrapper.style.flex = "1";
  requestsListWrapper.style.display = "flex";
  requestsListWrapper.style.flexDirection = "column";
  requestsListWrapper.style.minHeight = "0";

  const requestsList = document.createElement("div");
  requestsList.style.display = "grid";
  requestsList.style.gap = "8px";
  requestsList.style.flex = "1";
  requestsList.style.minHeight = "0";
  requestsList.style.overflow = "auto";
  requestsListWrapper.appendChild(requestsList);
  card.body.appendChild(requestsListWrapper);

  requestsList.style.position = requestsList.style.position || "relative";
  const requestsIndicator = createRefreshIndicator(requestsList, requestsListWrapper);

  view.appendChild(card.root);

  let myId: string | null = null;
  let requests: PlayerView[] = [];
  let loadingRequests = false;
  let destroyedRequests = false;
  const requestActionInProgress = new Set<string>();
  const updateRequestsRefreshControls = () => {
    const enabled = !destroyedRequests && !loadingRequests;
    ui.setButtonEnabled(requestsRefresh, enabled);
    requestsRefresh.setAttribute("aria-busy", loadingRequests ? "true" : "false");
  };
  updateRequestsRefreshControls();

  const getRequestsStatusText = (): string => {
    if (loadingRequests) {
      return requests.length
        ? "Refreshing friend requests..."
        : "Loading incoming friend requests...";
    }
    if (!requests.length) {
      return "No incoming friend requests.";
    }
    return `${requests.length} pending request${requests.length > 1 ? "s" : ""}.`;
  };

  const renderRequestsPlaceholder = (message: string) => {
    const placeholder = document.createElement("div");
    placeholder.textContent = message;
    placeholder.style.opacity = "0.6";
    placeholder.style.fontSize = "12px";
    placeholder.style.textAlign = "center";
    placeholder.style.minHeight = "48px";
    requestsList.appendChild(placeholder);
  };

  const updateRequestsStatusText = () => {
    if (!requests.length) {
      requestsStatus.textContent = "";
      return;
    }
    requestsStatus.textContent = loadingRequests
      ? "Refreshing friend requests..."
      : `${requests.length} pending request${requests.length > 1 ? "s" : ""}.`;
  };

  const renderRequests = (options: { force?: boolean } = {}) => {
    if (destroyedRequests) return;
    const shouldForce = options.force ?? true;
    if (loadingRequests && requests.length && !shouldForce) {
      updateRequestsStatusText();
      return;
    }
    requestsList.innerHTML = "";
    if (loadingRequests && !requests.length) {
      renderRequestsPlaceholder(getRequestsStatusText());
      updateRequestsStatusText();
      return;
    }
    if (!requests.length) {
      renderRequestsPlaceholder(getRequestsStatusText());
      updateRequestsStatusText();
      return;
    }

    for (const request of requests) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "40px 1fr auto";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "8px 12px";
      row.style.borderRadius = "10px";
      row.style.background = "rgba(255, 255, 255, 0.03)";
      row.style.border = "1px solid rgba(255, 255, 255, 0.04)";

      const avatar = document.createElement("div");
      avatar.style.width = "36px";
      avatar.style.height = "36px";
      avatar.style.borderRadius = "50%";
      avatar.style.display = "grid";
      avatar.style.placeItems = "center";
      avatar.style.background = "rgba(255, 255, 255, 0.05)";
      if (request.avatarUrl) {
        const img = document.createElement("img");
        img.src = request.avatarUrl;
        img.alt = request.playerName ?? request.playerId ?? "Friend request avatar";
        img.width = 36;
        img.height = 36;
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        avatar.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        const label = (request.playerName ?? request.playerId ?? "F").trim();
        fallback.textContent = label.charAt(0).toUpperCase();
        fallback.style.fontWeight = "600";
        fallback.style.fontSize = "15px";
        avatar.appendChild(fallback);
      }

      const info = document.createElement("div");
      info.style.display = "flex";
      info.style.flexDirection = "column";
      info.style.gap = "2px";

      const nameEl = document.createElement("div");
      nameEl.textContent = request.playerName ?? request.playerId ?? "Unknown player";
      nameEl.style.fontWeight = "600";
      nameEl.style.fontSize = "13px";

      const subEl = document.createElement("div");
      subEl.textContent = request.room?.id ? `In room ${request.room.id}` : "No room information";
      subEl.style.fontSize = "11px";
      subEl.style.opacity = "0.7";

      info.append(nameEl, subEl);

      const actions = ui.flexRow({ gap: 4, align: "center" });
      const reject = ui.btn("❌", { size: "sm" });
      reject.title = "Reject request";
      const accept = ui.btn("✅", { size: "sm" });
      accept.title = "Accept request";

      const applyAction = (action: "accept" | "reject") => {
        return async () => {
          if (!myId || !request.playerId) return;
          if (requestActionInProgress.has(request.playerId)) return;
          requestActionInProgress.add(request.playerId);
          requestsStatus.textContent = `${action === "accept" ? "Accepting" : "Rejecting"} ${request.playerName ?? request.playerId}...`;
          try {
            await respondFriendRequest({
              playerId: myId,
              otherPlayerId: request.playerId,
              action,
            });
          } catch (error) {
            console.error("[FriendsMenu] respondFriendRequest", error);
          } finally {
            requestActionInProgress.delete(request.playerId);
            await loadRequests({ force: true });
            void refreshAllFriends?.({ force: true });
          }
        };
      };

      reject.addEventListener("click", applyAction("reject"));
      accept.addEventListener("click", applyAction("accept"));

      actions.append(reject, accept);

      row.append(avatar, info, actions);
      requestsList.appendChild(row);
    }
    updateRequestsStatusText();
  };

  async function loadRequests(options?: { force?: boolean }) {
    if (destroyedRequests) return;
    if (!myId) {
      requestsStatus.textContent = "Waiting for player ID to load requests...";
      requestsList.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.textContent = "Waiting for player ID to load requests.";
      placeholder.style.opacity = "0.6";
      placeholder.style.fontSize = "12px";
      placeholder.style.textAlign = "center";
      requestsList.appendChild(placeholder);
      return;
    }
    loadingRequests = true;
    requestsIndicator.setVisible(true);
    updateRequestsRefreshControls();
    renderRequests({ force: requests.length === 0 });
    try {
      if (!options?.force) {
        const cached = getCachedIncomingRequestsWithViews();
        if (cached.length) {
          requests = cached;
          return;
        }
      }
      requests = await fetchIncomingRequestsWithViews(myId);
    } catch (error) {
      console.error("[FriendsMenu] fetchIncomingRequestsWithViews", error);
      requests = [];
    } finally {
      loadingRequests = false;
      requestsIndicator.setVisible(false);
      updateRequestsRefreshControls();
      renderRequests({ force: true });
    }
  }

  refreshIncomingRequests = loadRequests;

  const refreshPlayerId = async () => {
    const resolved = await playerDatabaseUserId.get();
    myId = resolved;
    if (!resolved) {
      requestsStatus.textContent = "Waiting for player ID to load requests...";
      requestsList.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.textContent = "Waiting for player ID to load requests.";
      placeholder.style.opacity = "0.6";
      placeholder.style.fontSize = "12px";
      placeholder.style.textAlign = "center";
      requestsList.appendChild(placeholder);
      return;
    }
    await loadRequests();
  };

  void refreshPlayerId();

  (view as any).__cleanup__ = () => {
    destroyedRequests = true;
    if (refreshIncomingRequests === loadRequests) {
      refreshIncomingRequests = null;
    }
  };
}

function renderSettingsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  const settings = getFriendSettings();
  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";
  layout.style.height = "100%";
  layout.style.minHeight = "0";
  layout.style.flex = "1";

  const globalCard = ui.card("Global settings");
  globalCard.body.style.display = "grid";
  globalCard.body.style.gap = "12px";

  const privacyCard = ui.card("Privacy");
  privacyCard.body.style.display = "grid";
  privacyCard.body.style.gap = "12px";

  const applyPatch = (patch: Partial<FriendSettings>) => patchFriendSettings(patch);

  const buildToggleRow = (
    label: string,
    checked: boolean,
    description: string | undefined,
    onToggle: (next: boolean) => void,
  ) => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "12px";

    const text = document.createElement("div");
    text.style.display = "grid";
    text.style.gap = "2px";

    const labelEl = document.createElement("div");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "600";
    labelEl.style.fontSize = "13px";

    if (description) {
      const descriptionEl = document.createElement("div");
      descriptionEl.textContent = description;
      descriptionEl.style.fontSize = "12px";
      descriptionEl.style.opacity = "0.7";
      text.append(labelEl, descriptionEl);
    } else {
      text.append(labelEl);
    }

    const toggle = ui.switch(checked);
    toggle.addEventListener("input", () => {
      onToggle(toggle.checked);
    });

    row.append(text, toggle);
    return row;
  };

  globalCard.body.append(
    buildToggleRow(
      "Show online friends only",
      settings.showOnlineFriendsOnly,
      undefined,
      (next) => applyPatch({ showOnlineFriendsOnly: next }),
    ),
    buildToggleRow(
      "Make my room private",
      settings.hideRoomFromPublicList,
      "Prevents friends from joining and hides your room from the public list.",
      (next) => applyPatch({ hideRoomFromPublicList: next }),
    ),
  );

  privacyCard.body.append(
    buildToggleRow(
      "Friends can view my garden",
      settings.showGarden,
      undefined,
      (next) => applyPatch({ showGarden: next }),
    ),
    buildToggleRow(
      "Friends can view my inventory",
      settings.showInventory,
      undefined,
      (next) => applyPatch({ showInventory: next }),
    ),
    buildToggleRow(
      "Friends can see my coins",
      settings.showCoins,
      undefined,
      (next) => applyPatch({ showCoins: next }),
    ),
    buildToggleRow(
      "Friends can see my activity log",
      settings.showActivityLog,
      undefined,
      (next) => applyPatch({ showActivityLog: next }),
    ),
    buildToggleRow(
      "Friends can view my journal",
      settings.showJournal,
      undefined,
      (next) => applyPatch({ showJournal: next }),
    ),
    buildToggleRow(
      "Friends can see my stats",
      settings.showStats,
      undefined,
      (next) => applyPatch({ showStats: next }),
    ),
  );

  layout.append(globalCard.root, privacyCard.root);
  view.appendChild(layout);
}

export function renderFriendsMenu(root: HTMLElement) {
  const ui = new Menu({ id: "friends", compact: true });
  ui.mount(root);
  ui.root.style.width = "480px";
  ui.root.style.maxWidth = "520px";
  ui.root.style.minWidth = "380px";
  ui.root.style.height = "640px";
  ui.root.style.maxHeight = "90vh";
  ui.root.style.flexDirection = "column";

  const views = ui.root.querySelector(".qmm-views") as HTMLElement | null;
  if (views) {
    views.style.flex = "1";
    views.style.maxHeight = "none";
    views.style.minHeight = "0";
  }
  ui.addTabs([
    { id: "friends-all", title: "Friend list", render: (view) => renderAllTab(view, ui) },
    { id: "friends-add", title: "Add friend", render: (view) => renderAddFriendTab(view, ui) },
    { id: "friends-requests", title: "Request", render: (view) => renderFriendRequestsTab(view, ui) },
    { id: "friends-settings", title: "Settings", render: (view) => renderSettingsTab(view, ui) },
  ]);
  ui.switchTo("friends-all");
  ui.on("tab:change", (id) => {
    if (id === "friends-all" && refreshAllFriends) {
      void refreshAllFriends({ force: true });
    }
    if (id === "friends-requests" && refreshIncomingRequests) {
      void refreshIncomingRequests({ force: true });
    }
  });

  const windowEl = ui.root.closest<HTMLElement>(".qws-win");
  if (windowEl) {
    let lastVisible = windowEl.style.display !== "none";
    const observer = new MutationObserver(() => {
      const isVisible = windowEl.style.display !== "none";
      if (isVisible && !lastVisible) {
        void refreshAllFriends?.({ force: true });
      }
      lastVisible = isVisible;
    });
    observer.observe(windowEl, { attributes: true, attributeFilter: ["style"] });
    const previousCleanup = (root as any).__cleanup__;
    (root as any).__cleanup__ = () => {
      observer.disconnect();
      if (typeof previousCleanup === "function") {
        previousCleanup.call(root);
      }
    };
  }
}
