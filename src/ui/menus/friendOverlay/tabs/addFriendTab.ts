import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  cancelFriendRequest,
  fetchFriendRequests,
  fetchFriendsSummary,
  fetchModPlayers,
  getCachedFriendsSummary,
  removeFriend,
  sendFriendRequest,
  type ModPlayerSummary,
} from "../../../../utils/supabase";
import { toastSimple } from "../../../../ui/toast";
import { createButton, createCard, createFlexRow, createInput } from "../ui";
import { formatLastSeen } from "../utils";

type AddFriendTabHandle = {
  root: HTMLDivElement;
  destroy: () => void;
};

const FRIENDS_REFRESH_EVENT = "qws-friends-refresh";

export function createAddFriendTab(): AddFriendTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-community-panel qws-fo-community-add";

  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";
  layout.style.height = "100%";
  layout.style.minHeight = "0";
  layout.style.flex = "1";

  const modCard = createCard("Mod players");
  modCard.body.style.display = "flex";
  modCard.body.style.flexDirection = "column";
  modCard.body.style.gap = "8px";
  modCard.body.style.flex = "1";
  modCard.body.style.minHeight = "0";

  const modControls = createFlexRow({ align: "center", gap: 8 });
  const modSearch = createInput("Search mod players...");
  modSearch.style.flex = "1";
  modSearch.style.minWidth = "0";
  const modRefresh = createButton("Refresh", { size: "sm", variant: "ghost" });
  modRefresh.style.background = "rgba(248, 250, 252, 0.08)";
  modRefresh.style.color = "#f8fafc";
  modRefresh.style.border = "1px solid rgba(248, 250, 252, 0.15)";
  modRefresh.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
  modRefresh.title = "Reload mod players list";
  modControls.append(modSearch, modRefresh);

  const modStatus = document.createElement("div");
  modStatus.style.fontSize = "12px";
  modStatus.style.opacity = "0.7";
  modStatus.style.minHeight = "18px";

  const modList = document.createElement("div");
  modList.style.display = "grid";
  modList.style.gap = "6px";
  modList.style.gridTemplateColumns = "repeat(auto-fill, 230px)";
  modList.style.flex = "1";
  modList.style.minHeight = "0";
  modList.style.overflow = "auto";
  modList.style.paddingRight = "4px";
  modList.style.alignContent = "start";
  modList.style.justifyItems = "start";
  modList.style.alignItems = "start";

  modCard.body.append(modControls, modStatus, modList);

  modCard.root.style.display = "flex";
  modCard.root.style.flexDirection = "column";
  modCard.root.style.flex = "1";
  modCard.root.style.minHeight = "0";

  layout.append(modCard.root);
  root.appendChild(layout);

  let myId: string | null = null;
  let modPlayers: ModPlayerSummary[] = [];
  let modLoading = false;
  let modDestroyed = false;
  let modSearchTimer: number | null = null;
  const modRequestPending = new Set<string>();
  let friendIds = new Set<string>();
  let outgoingRequestIds = new Set<string>();
  let unsubscribePlayerId: (() => void) | null = null;

  const renderModPlayers = () => {
    if (modDestroyed) return;
    modList.innerHTML = "";

    if (modLoading) {
      const loading = document.createElement("div");
      loading.textContent = "Loading mod players...";
      loading.style.opacity = "0.6";
      loading.style.fontSize = "12px";
      loading.style.textAlign = "center";
      modList.appendChild(loading);
      return;
    }

    if (!modPlayers.length) {
      const empty = document.createElement("div");
      empty.textContent = "No mod players found.";
      empty.style.opacity = "0.6";
      empty.style.fontSize = "12px";
      empty.style.textAlign = "center";
      modList.appendChild(empty);
      return;
    }

    for (const entry of modPlayers) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "32px 1fr auto";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "8px";
      row.style.background = "rgba(255, 255, 255, 0.03)";
      row.style.border = "1px solid rgba(255, 255, 255, 0.05)";
      row.style.alignSelf = "start";
      row.style.height = "auto";
      row.style.width = "min(100%, 230px)";
      row.style.justifySelf = "start";

      const avatar = document.createElement("div");
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.borderRadius = "50%";
      avatar.style.display = "grid";
      avatar.style.placeItems = "center";
      avatar.style.background = "rgba(255, 255, 255, 0.05)";
      avatar.style.overflow = "hidden";

      if (entry.avatarUrl) {
        const img = document.createElement("img");
        img.src = entry.avatarUrl;
        img.alt = entry.playerName ?? entry.playerId;
        img.width = 32;
        img.height = 32;
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        avatar.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        const label = (entry.playerName || entry.playerId || "P").trim();
        fallback.textContent = label.charAt(0).toUpperCase();
        fallback.style.fontWeight = "600";
        fallback.style.fontSize = "13px";
        avatar.appendChild(fallback);
      }

      const text = document.createElement("div");
      text.style.display = "grid";
      text.style.gap = "2px";
      text.style.minWidth = "0";

      const nameEl = document.createElement("div");
      nameEl.textContent = entry.playerName || entry.playerId;
      nameEl.style.fontWeight = "600";
      nameEl.style.fontSize = "12px";
      nameEl.style.whiteSpace = "nowrap";
      nameEl.style.overflow = "hidden";
      nameEl.style.textOverflow = "ellipsis";

      const lastEventAt = entry.lastEventAt ? Date.parse(entry.lastEventAt) : NaN;
      const ONLINE_THRESHOLD_MS = 6 * 60 * 1000;
      const isOnline =
        Number.isFinite(lastEventAt) && Date.now() - lastEventAt <= ONLINE_THRESHOLD_MS;
      const status = document.createElement("div");
      status.style.display = "inline-flex";
      status.style.alignItems = "center";
      status.style.gap = "6px";
      status.style.fontSize = "11px";
      status.style.opacity = "0.75";
      const dot = document.createElement("span");
      dot.style.width = "6px";
      dot.style.height = "6px";
      dot.style.borderRadius = "999px";
      dot.style.background = isOnline ? "#34d399" : "rgba(148,163,184,0.7)";
      dot.style.boxShadow = "0 0 0 2px rgba(15,23,42,0.6)";
      const statusLabel = document.createElement("span");
      statusLabel.textContent = isOnline ? "Online" : "Offline";
      status.append(dot, statusLabel);
      text.append(nameEl, status);

      const targetId = entry.playerId;
      const isSelf = !!myId && targetId === myId;
      const isPending = modRequestPending.has(targetId);
      const isFriend = friendIds.has(targetId);
      const hasOutgoing = outgoingRequestIds.has(targetId);
      const isAdded = isFriend || hasOutgoing;

      const iconWrap = document.createElement("span");
      iconWrap.innerHTML = isAdded
        ? '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

      const addBtn = createButton("", { size: "sm", variant: "ghost", icon: iconWrap });
      addBtn.classList.add("qws-fo-mod-action-btn");
      if (isAdded) addBtn.classList.add("is-added");

      if (!myId) {
        addBtn.disabled = true;
        addBtn.title = "Player ID unavailable.";
      } else if (isSelf) {
        addBtn.disabled = true;
        addBtn.title = "You cannot add yourself.";
      } else if (isPending) {
        addBtn.disabled = true;
        addBtn.title = "Sending request...";
      } else if (isFriend) {
        addBtn.title = "Remove friend";
      } else if (hasOutgoing) {
        addBtn.title = "Cancel request";
      }

      addBtn.addEventListener("click", async () => {
        if (!myId || !targetId || isSelf || modRequestPending.has(targetId)) return;
        modRequestPending.add(targetId);
        renderModPlayers();
        try {
          if (isFriend) {
            const ok = await removeFriend(targetId);
            if (ok) {
              friendIds.delete(targetId);
              await toastSimple("Friends", `Removed ${entry.playerName ?? targetId}.`, "success");
            } else {
              await toastSimple("Friends", "Unable to remove friend.", "info");
            }
          } else if (hasOutgoing) {
            const ok = await cancelFriendRequest(targetId);
            if (ok) {
              outgoingRequestIds.delete(targetId);
              await toastSimple("Friend request", `Request to ${entry.playerName ?? targetId} cancelled.`, "success");
            } else {
              await toastSimple("Friend request", "Unable to cancel request.", "info");
            }
          } else {
            const sent = await sendFriendRequest(targetId);
            if (sent) {
              outgoingRequestIds.add(targetId);
              await toastSimple("Friend request", `Request sent to ${entry.playerName ?? targetId}.`, "success");
            } else {
              await toastSimple("Friend request", "Unable to send request.", "info");
            }
          }
        } catch (error) {
          console.error("[FriendOverlay] mod list action", error);
          await toastSimple("Friends", "Action failed.", "error");
        } finally {
          modRequestPending.delete(targetId);
          renderModPlayers();
        }
      });

      row.append(avatar, text, addBtn);
      modList.appendChild(row);
    }
  };

  const loadModPlayers = async () => {
    if (modDestroyed) return;
    modLoading = true;
    modStatus.textContent = modSearch.value.trim()
      ? "Searching mod players..."
      : "Loading latest mod players...";
    renderModPlayers();
    try {
      const query = modSearch.value.trim();
      const result = await fetchModPlayers({
        query: query.length ? query : undefined,
        limit: 18,
        offset: 0,
      });
      modPlayers = result;
      modStatus.textContent = modPlayers.length
        ? `Showing ${modPlayers.length} mod player${modPlayers.length > 1 ? "s" : ""}.`
        : "No mod players found.";
    } catch (error) {
      console.error("[FriendOverlay] fetchModPlayers failed", error);
      modPlayers = [];
      modStatus.textContent = "Failed to load mod players.";
    } finally {
      modLoading = false;
      renderModPlayers();
    }
  };

  modSearch.addEventListener("input", () => {
    if (modSearchTimer) {
      window.clearTimeout(modSearchTimer);
    }
    modSearchTimer = window.setTimeout(() => {
      modSearchTimer = null;
      void loadModPlayers();
    }, 300);
  });
  modRefresh.addEventListener("click", () => {
    void loadModPlayers();
  });

  async function refreshFriendIds(skipCache = false): Promise<void> {
    if (!myId) {
      friendIds = new Set();
      return;
    }
    if (!skipCache) {
      const cached = getCachedFriendsSummary();
      if (cached.length) {
        friendIds = new Set(cached.map((f) => String(f.playerId ?? "")).filter(Boolean));
        renderModPlayers();
      }
    }
    try {
      const friends = await fetchFriendsSummary(myId);
      friendIds = new Set(friends.map((f) => String(f.playerId ?? "")).filter(Boolean));
    } catch {
      // ignore
    } finally {
      renderModPlayers();
    }
  }

  async function refreshOutgoingRequests(): Promise<void> {
    if (!myId) {
      outgoingRequestIds = new Set();
      return;
    }
    try {
      const result = await fetchFriendRequests(myId);
      outgoingRequestIds = new Set(result.outgoing.map((r) => r.toPlayerId).filter(Boolean));
    } catch {
      // ignore
    } finally {
      renderModPlayers();
    }
  }

  const handleFriendsRefresh = () => {
    // Skip cache — it's guaranteed stale at this point (refreshAllFriends fires concurrently as void)
    void refreshFriendIds(true);
    void refreshOutgoingRequests();
  };

  window.addEventListener(FRIENDS_REFRESH_EVENT, handleFriendsRefresh);

  playerDatabaseUserId
    .onChangeNow((next) => {
      myId = next ? String(next) : null;
      void refreshFriendIds();
      void refreshOutgoingRequests();
      renderModPlayers();
    })
    .then((unsub) => {
      unsubscribePlayerId = unsub;
    })
    .catch(() => {});

  void loadModPlayers();

  return {
    root,
    destroy: () => {
      modDestroyed = true;
      window.removeEventListener(FRIENDS_REFRESH_EVENT, handleFriendsRefresh);
      try {
        unsubscribePlayerId?.();
      } catch {}
      if (modSearchTimer) {
        window.clearTimeout(modSearchTimer);
        modSearchTimer = null;
      }
    },
  };
}
