import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  fetchFriendsSummary,
  getCachedFriendsSummary,
  type FriendSummary,
} from "../../../../utils/supabase";
import {
  getFriendSettings,
  onFriendSettingsChange,
} from "../../../../utils/friendSettings";
import { createButton, createFlexRow, createInput, setButtonEnabled } from "../ui";
import { formatLastSeen, normalizeQuery } from "../utils";

type LoadFriendsOptions = {
  force?: boolean;
};

type FriendsTabHandle = {
  root: HTMLDivElement;
  refresh: (opts?: LoadFriendsOptions) => Promise<void>;
  destroy: () => void;
};

type RefreshIndicatorHandle = {
  setVisible: (visible: boolean) => void;
};

const FRIENDS_MENU_REFRESH_STYLE_ID = "friends-menu-refresh-style";

function ensureFriendsMenuRefreshStyle(): void {
  if (document.getElementById(FRIENDS_MENU_REFRESH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FRIENDS_MENU_REFRESH_STYLE_ID;
  style.textContent = `
@keyframes friends-menu-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;
  document.head.appendChild(style);
}

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

function resolveRoomLabel(friend: FriendSummary): string | null {
  if (!friend.roomId) return null;
  return `Room ${friend.roomId}`;
}

function createFriendRow(friend: FriendSummary) {
  const card = document.createElement("div");
  card.className = "qws-fo-friend-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const avatar = document.createElement("div");
  avatar.className = "qws-fo-friend-avatar";

  if (friend.avatarUrl) {
    const img = document.createElement("img");
    img.src = friend.avatarUrl;
    img.alt = friend.playerName ?? friend.playerId ?? "Friend avatar";
    avatar.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    const label = (friend.playerName ?? friend.playerId ?? "F").trim();
    fallback.textContent = label.charAt(0).toUpperCase();
    avatar.appendChild(fallback);
  }

  const header = document.createElement("div");
  header.className = "qws-fo-friend-header";
  const headerInfo = document.createElement("div");
  headerInfo.className = "qws-fo-friend-header-info";

  const nameRow = document.createElement("div");
  nameRow.className = "qws-fo-friend-name-row";
  const nameEl = document.createElement("div");
  nameEl.textContent = friend.playerName ?? friend.playerId ?? "Unknown friend";
  nameEl.className = "qws-fo-friend-name";

  const statusPill = document.createElement("span");
  statusPill.className = "qws-fo-friend-status-pill";
  const dot = document.createElement("span");
  dot.className = "qws-fo-friend-status-dot";
  const isOnline = Boolean(friend.isOnline);
  if (isOnline) statusPill.classList.add("online");
  const statusText = document.createElement("span");
  statusText.textContent = isOnline ? "Online" : "Offline";
  statusPill.append(dot, statusText);

  nameRow.append(nameEl, statusPill);

  const metaRow = document.createElement("div");
  metaRow.className = "qws-fo-friend-meta";
  const lastSeen = formatLastSeen(friend.lastEventAt);
  if (!isOnline) {
    const lastSeenEl = document.createElement("span");
    lastSeenEl.className = "qws-fo-friend-lastseen";
    lastSeenEl.textContent = lastSeen ? `Last seen ${lastSeen}` : "Last seen unknown";
    metaRow.appendChild(lastSeenEl);
  }

  if (isOnline) {
    const roomLabel = resolveRoomLabel(friend);
    if (roomLabel) {
      const room = document.createElement("span");
      room.className = "qws-fo-friend-room-chip";
      room.textContent = roomLabel;
      metaRow.appendChild(room);
    }
  }

  headerInfo.append(nameRow, metaRow);
  header.append(avatar, headerInfo);

  const openInfo = () => {
    if (!friend.playerId) return;
    try {
      window.dispatchEvent(new CustomEvent("qws-friend-info-open", {
        detail: { playerId: friend.playerId, friend },
      }));
    } catch {}
  };
  card.addEventListener("click", openInfo);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInfo();
    }
  });

  card.append(header);
  return card;
}

export function createFriendsTab(): FriendsTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-community-panel qws-fo-community-friends";

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";
  wrap.style.position = wrap.style.position || "relative";
  wrap.style.height = "100%";
  wrap.style.minHeight = "0";

  const controls = createFlexRow({ align: "center", gap: 8 });
  const search = createInput("Search for a friend...");
  search.style.flex = "1";
  search.style.minWidth = "0";
  const refresh = createButton("Refresh", { size: "sm", variant: "ghost" });
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
  list.className = "qws-fo-friends-list";
  list.style.padding = "10px";
  list.style.borderRadius = "12px";
  list.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  list.style.background = "rgba(255, 255, 255, 0.02)";
  list.style.flex = "1";
  list.style.minHeight = "0";
  list.style.overflow = "auto";

  listContainer.appendChild(list);
  wrap.append(controls, statusMessage, listContainer);
  root.appendChild(wrap);

  let friends: FriendSummary[] = [];
  let isLoading = false;
  let destroyed = false;
  list.style.position = list.style.position || "relative";
  const refreshIndicator = createRefreshIndicator(list, listContainer);
  let unsubscribePlayerId: (() => void) | null = null;

  const renderPlaceholder = (text: string) => {
    list.innerHTML = "";
    const placeholder = document.createElement("div");
    placeholder.textContent = text;
    placeholder.style.opacity = "0.6";
    placeholder.style.fontSize = "12px";
    placeholder.style.textAlign = "center";
    list.appendChild(placeholder);
  };

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
    const sorted = filtered.slice().sort((a, b) => {
      const aOnline = Boolean(a.isOnline);
      const bOnline = Boolean(b.isOnline);
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      const aTs = Number.isFinite(Date.parse(a.lastEventAt ?? "")) ? Date.parse(a.lastEventAt ?? "") : 0;
      const bTs = Number.isFinite(Date.parse(b.lastEventAt ?? "")) ? Date.parse(b.lastEventAt ?? "") : 0;
      if (aTs !== bTs) return bTs - aTs;
      const aName = (a.playerName ?? a.playerId ?? "").toLowerCase();
      const bName = (b.playerName ?? b.playerId ?? "").toLowerCase();
      return aName.localeCompare(bName);
    });

    if (!sorted.length) {
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

    for (const friend of sorted) {
      list.appendChild(createFriendRow(friend));
    }
    if (showOnlineOnly) {
      statusMessage.textContent = `${sorted.length} online friend${sorted.length !== 1 ? "s" : ""} shown.`;
    } else {
      statusMessage.textContent = `${sorted.length} friend${sorted.length !== 1 ? "s" : ""} shown.`;
    }
  };

  const updateRefreshControls = () => {
    const enabled = !destroyed && !isLoading;
    setButtonEnabled(refresh, enabled);
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
        const cached = getCachedFriendsSummary();
        if (cached.length) {
          friends = cached;
          statusMessage.textContent = `${friends.length} friends loaded.`;
          return;
        }
      }
      friends = await fetchFriendsSummary(player);
      statusMessage.textContent = friends.length
        ? `${friends.length} friends loaded.`
        : "You have no friends yet.";
    } catch (error) {
      console.error("[FriendOverlay] Failed to load friends", error);
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

  playerDatabaseUserId
    .onChangeNow((next) => {
      if (!next) return;
      void loadFriends({ force: true });
    })
    .then((unsub) => {
      unsubscribePlayerId = unsub;
    })
    .catch(() => {});

  const handleAuthUpdate = () => {
    // Petit délai pour s'assurer que l'API key est bien disponible
    setTimeout(() => {
      void loadFriends({ force: true });
    }, 100);
  };
  window.addEventListener("qws-friend-overlay-auth-update", handleAuthUpdate as EventListener);

  void loadFriends();

  return {
    root,
    refresh: (opts?: LoadFriendsOptions) => loadFriends(opts),
    destroy: () => {
      destroyed = true;
      unsubscribeSettings();
      try {
        unsubscribePlayerId?.();
      } catch {}
      try {
        window.removeEventListener(
          "qws-friend-overlay-auth-update",
          handleAuthUpdate as EventListener,
        );
      } catch {}
    },
  };
}
