import {
  getCachedFriendsWithViews,
  getCachedIncomingRequestsWithViews,
  getCachedOutgoingRequests,
  fetchModPlayers,
  sendFriendRequest,
  onWelcome,
  getCachedModPlayers,
} from "../../../../ariesModAPI";
import type { ModPlayerSummary } from "../../../../ariesModAPI";
import { style, CH_EVENTS, ensureSharedStyles, createKeyBlocker, createPlayerBadges } from "../shared";

export function createAddFriendsSubTab() {
  ensureSharedStyles();

  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "12px" });

  // Search bar container
  const searchContainer = document.createElement("div");
  style(searchContainer, { display: "flex", gap: "8px", alignItems: "center" });

  const searchBar = document.createElement("input");
  searchBar.type = "text";
  searchBar.placeholder = "Search mod players...";
  style(searchBar, {
    flex: "1",
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

  searchContainer.append(searchBar);

  // Players list container
  const playersList = document.createElement("div");
  playersList.className = "qws-ch-scrollable";
  style(playersList, {
    flex: "1",
    overflow: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "10px",
    alignContent: "start",
    padding: "6px 8px 6px 6px", // Padding to prevent cards from being clipped during hover animations
  });

  let isSearching = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchResults: ModPlayerSummary[] | null = null;
  let lastSearchQuery = "";

  // Determine button state for a player
  const getPlayerButtonState = (playerId: string): "add" | "remove" | "cancel" | "pending" => {
    const friends = getCachedFriendsWithViews();
    const incomingRequests = getCachedIncomingRequestsWithViews();
    const outgoingRequests = getCachedOutgoingRequests();

    if (friends.some((f) => f.playerId === playerId)) return "remove";
    if (outgoingRequests.some((r) => r.toPlayerId === playerId)) return "cancel";
    if (incomingRequests.some((r) => r.playerId === playerId)) return "pending";
    return "add";
  };

  // Render players
  const renderPlayers = () => {
    playersList.innerHTML = "";

    let players: ModPlayerSummary[];

    if (searchResults !== null) {
      players = searchResults;
    } else {
      const cachedModPlayers = getCachedModPlayers();
      const allPlayers = cachedModPlayers || [];

      const sorted = [...allPlayers].sort((a, b) => {
        const aOnline = a.isOnline ?? false;
        const bOnline = b.isOnline ?? false;
        if (aOnline === bOnline) return 0;
        return aOnline ? -1 : 1;
      });

      players = sorted.slice(0, 12);
    }

    if (players.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      empty.textContent = isSearching ? "No players found" : "No mod players available";
      playersList.appendChild(empty);
      return;
    }

    for (const player of players) {
      playersList.appendChild(createAddFriendCard(player, getPlayerButtonState));
    }
  };

  // Search functionality
  const performSearch = async () => {
    const query = searchBar.value.trim();

    if (!query) {
      if (lastSearchQuery) {
        isSearching = true;
        try {
          const players = await fetchModPlayers({ query: "", limit: 12 });
          searchResults = players;
          renderPlayers();
        } catch (error) {
          console.error("[AddFriends] Empty search failed:", error);
          searchResults = [];
          renderPlayers();
        } finally {
          isSearching = false;
        }
      } else {
        isSearching = false;
        renderPlayers();
      }
      return;
    }

    lastSearchQuery = query;
    isSearching = true;

    try {
      const players = await fetchModPlayers({ query, limit: 12 });
      searchResults = players;
      renderPlayers();
    } catch (error) {
      console.error("[AddFriends] Search failed:", error);
      searchResults = [];
      renderPlayers();
    } finally {
      isSearching = false;
    }
  };

  // Auto-search with 300ms debounce
  searchBar.oninput = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(), 300);
  };

  // Initial render
  renderPlayers();

  // Listen for cache updates (debounced to avoid rapid re-renders that cause visual bouncing)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const onRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      renderPlayers();
    }, 80);
  };
  window.addEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRefresh);
  window.addEventListener(CH_EVENTS.FRIENDS_REFRESH, onRefresh);

  // Subscribe to welcome event for mod players
  const unsubWelcome = onWelcome((data) => {
    if (data.modPlayers && data.modPlayers.length > 0) {
      renderPlayers();
    }
  });

  container.append(searchContainer, playersList);

  return {
    root: container,
    destroy() {
      keyBlocker.detach();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRefresh);
      window.removeEventListener(CH_EVENTS.FRIENDS_REFRESH, onRefresh);
      unsubWelcome();
    },
  };
}

function createAddFriendCard(
  player: ModPlayerSummary,
  getButtonState: (playerId: string) => "add" | "remove" | "cancel" | "pending",
): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    transition: "all 120ms ease",
  });

  card.onmouseenter = () => {
    style(card, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)" });
  };
  card.onmouseleave = () => {
    style(card, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });
  };

  // Check if player is online (use isOnline from player data)
  const isOnline = player.isOnline ?? false;

  // Avatar container with online status
  const avatarWrapper = document.createElement("div");
  style(avatarWrapper, { position: "relative", flexShrink: "0" });

  const avatar = document.createElement("div");
  style(avatar, {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: player.avatarUrl
      ? `url(${player.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
  });

  const onlineIndicator = document.createElement("div");
  style(onlineIndicator, {
    position: "absolute",
    bottom: "0px",
    right: "0px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: isOnline ? "#10b981" : "#ef4444",
    border: "2px solid #0f141e",
    boxShadow: isOnline ? "0 0 8px rgba(16,185,129,0.6)" : "0 0 6px rgba(239,68,68,0.4)",
  });

  avatarWrapper.append(avatar, onlineIndicator);

  // Player info
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
  name.textContent = player.playerName || "Unknown";

  info.append(name);

  const buttonState = getButtonState(player.playerId);

  if (buttonState === "remove") {
    const friendsText = document.createElement("div");
    friendsText.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Already friends
    `;
    style(friendsText, {
      padding: "6px 12px",
      borderRadius: "8px",
      background: "rgba(16,185,129,0.12)",
      color: "#10b981",
      fontSize: "12px",
      fontWeight: "600",
      textAlign: "center",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    card.append(avatarWrapper, info, friendsText);
  } else if (buttonState === "cancel") {
    const requestSentText = document.createElement("div");
    requestSentText.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      Request sent
    `;
    style(requestSentText, {
      padding: "6px 12px",
      borderRadius: "8px",
      background: "rgba(251,191,36,0.12)",
      color: "#fbbf24",
      fontSize: "12px",
      fontWeight: "600",
      textAlign: "center",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    card.append(avatarWrapper, info, requestSentText);
  } else {
    const actionButton = document.createElement("button");

    if (buttonState === "add") {
      actionButton.textContent = "Add Friend";
      style(actionButton, {
        padding: "6px 12px",
        border: "1px solid rgba(94,234,212,0.35)",
        borderRadius: "8px",
        background: "rgba(94,234,212,0.12)",
        color: "#5eead4",
        fontSize: "11px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "all 120ms ease",
        width: "100%",
      });
      actionButton.onmouseenter = () => style(actionButton, { background: "rgba(94,234,212,0.2)" });
      actionButton.onmouseleave = () => style(actionButton, { background: "rgba(94,234,212,0.12)" });
    } else if (buttonState === "pending") {
      actionButton.textContent = "Pending Request";
      style(actionButton, {
        padding: "6px 12px",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(226,232,240,0.5)",
        fontSize: "11px",
        fontWeight: "600",
        cursor: "not-allowed",
        transition: "all 120ms ease",
        width: "100%",
      });
    }

    actionButton.onclick = async (e) => {
      e.stopPropagation();
      if (buttonState === "add") {
        // Bounce the card once on click
        card.style.animation = "none";
        void card.offsetWidth; // force reflow to restart animation
        card.style.animation = "qws-card-bounce 250ms ease";

        actionButton.disabled = true;
        actionButton.textContent = "Sending...";
        style(actionButton, { cursor: "not-allowed", opacity: "0.6" });

        const success = await sendFriendRequest(player.playerId);
        if (!success) {
          console.error(`[AddFriends] Failed to send friend request to ${player.playerName}`);
          actionButton.disabled = false;
          actionButton.textContent = "Add Friend";
          style(actionButton, { cursor: "pointer", opacity: "1" });
        }
      }
    };

    card.append(avatarWrapper, info, actionButton);
  }

  const badgesEl = createPlayerBadges(player.badges, true);
  if (badgesEl) {
    style(badgesEl, {
      position: "absolute",
      top: "8px",
      right: "8px",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-start",
      gap: "3px",
    });
    card.appendChild(badgesEl);
  }

  return card;
}
