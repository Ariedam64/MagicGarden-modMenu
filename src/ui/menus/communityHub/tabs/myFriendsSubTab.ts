import { getCachedFriendsWithViews } from "../../../../ariesModAPI";
import type { PlayerView } from "../../../../ariesModAPI";
import { style, CH_EVENTS, ensureSharedStyles, formatRelativeTime, createKeyBlocker, createRoomBadge } from "../shared";

export function createMyFriendsSubTab(showPlayerDetail: (player: PlayerView) => void) {
  ensureSharedStyles();

  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "12px" });

  // Search bar
  const searchBar = document.createElement("input");
  searchBar.type = "text";
  searchBar.placeholder = "Search friends...";
  style(searchBar, {
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 150ms ease",
  });

  // Block game inputs when search bar is focused
  const keyBlocker = createKeyBlocker(() => document.activeElement === searchBar);
  keyBlocker.attach();

  searchBar.onfocus = () => style(searchBar, { borderColor: "rgba(94,234,212,0.35)" });
  searchBar.onblur = () => style(searchBar, { borderColor: "rgba(255,255,255,0.12)" });

  // Friends list container
  const friendsList = document.createElement("div");
  friendsList.className = "qws-ch-scrollable";
  style(friendsList, {
    flex: "1",
    overflow: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "10px",
    alignContent: "start",
    padding: "6px 8px 6px 6px", // Padding to prevent cards from being clipped during hover animations
  });

  // Render friends
  const renderFriends = (filter: string = "") => {
    friendsList.innerHTML = "";
    const friends = getCachedFriendsWithViews();

    const filtered = filter
      ? friends.filter((f) => f.playerName?.toLowerCase().includes(filter.toLowerCase()))
      : friends;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      empty.textContent = filter ? "No friends found" : "No friends yet";
      friendsList.appendChild(empty);
      return;
    }

    // Sort: online friends first
    const sorted = [...filtered].sort((a, b) => {
      if (a.isOnline === b.isOnline) return 0;
      return a.isOnline ? -1 : 1;
    });

    for (const friend of sorted) {
      friendsList.appendChild(createFriendCard(friend, showPlayerDetail));
    }
  };

  // Initial render
  renderFriends();

  // Search functionality
  searchBar.oninput = () => renderFriends(searchBar.value);

  // Listen for cache updates
  const onFriendsRefresh = () => renderFriends(searchBar.value);
  window.addEventListener(CH_EVENTS.FRIENDS_REFRESH, onFriendsRefresh);

  container.append(searchBar, friendsList);

  return {
    root: container,
    destroy() {
      keyBlocker.detach();
      window.removeEventListener(CH_EVENTS.FRIENDS_REFRESH, onFriendsRefresh);
    },
  };
}

function createFriendCard(friend: PlayerView, onClick: (player: PlayerView) => void): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  card.onclick = () => onClick(friend);

  card.onmouseenter = () => {
    style(card, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)", transform: "translateY(-2px)" });
  };
  card.onmouseleave = () => {
    style(card, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", transform: "translateY(0)" });
  };

  // Avatar container with online status
  const avatarWrapper = document.createElement("div");
  style(avatarWrapper, { position: "relative", flexShrink: "0" });

  const avatar = document.createElement("div");
  style(avatar, {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: friend.avatarUrl
      ? `url(${friend.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
  });

  // Online status indicator
  const onlineIndicator = document.createElement("div");
  style(onlineIndicator, {
    position: "absolute",
    bottom: "0px",
    right: "0px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: friend.isOnline ? "#10b981" : "#ef4444",
    border: "2px solid #0f141e",
    boxShadow: friend.isOnline ? "0 0 8px rgba(16,185,129,0.6)" : "0 0 6px rgba(239,68,68,0.4)",
  });

  avatarWrapper.append(avatar, onlineIndicator);

  // Friend info
  const info = document.createElement("div");
  style(info, { display: "flex", flexDirection: "column", gap: "2px", alignItems: "center", width: "100%" });

  const name = document.createElement("div");
  style(name, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    textAlign: "center",
  });
  name.textContent = friend.playerName || "Unknown";

  const status = document.createElement("div");
  style(status, {
    fontSize: "11px",
    color: friend.isOnline ? "#5eead4" : "rgba(226,232,240,0.5)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    textAlign: "center",
  });

  if (friend.isOnline) {
    status.appendChild(createRoomBadge(friend.room));
  } else {
    if (friend.lastEventAt) {
      status.textContent = `Last seen ${formatRelativeTime(friend.lastEventAt)}`;
    } else {
      status.textContent = "";
    }
  }

  info.append(name, status);
  card.append(avatarWrapper, info);
  return card;
}
