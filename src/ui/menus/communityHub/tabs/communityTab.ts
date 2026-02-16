import { fetchPlayerDetailsComplete, getIncomingRequestsCount } from "../../../../ariesModAPI";
import type { PlayerView } from "../../../../ariesModAPI";
import { createPlayerDetailView } from "./playerDetailView";
import { stopAnyPreview } from "./playerViewActions";
import { createMyFriendsSubTab } from "./myFriendsSubTab";
import { createAddFriendsSubTab } from "./addFriendsSubTab";
import { createRequestsSubTab } from "./requestsSubTab";
import { style, ensureSharedStyles, createLoadingView, createErrorView, CH_EVENTS } from "../shared";

type SubTabId = "my-friends" | "add-friends" | "requests";

export function createCommunityTab() {
  ensureSharedStyles();

  const root = document.createElement("div");
  style(root, { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" });

  let currentDetailView: HTMLElement | null = null;

  const showPlayerDetail = async (player: PlayerView) => {
    style(tabsHeader, { display: "none" });
    style(tabContainer, { display: "none" });

    const loadingView = createLoadingView(async () => {
      await stopAnyPreview();
      if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
      style(tabsHeader, { display: "flex" });
      style(tabContainer, { display: "block" });
    });
    currentDetailView = loadingView;
    root.appendChild(loadingView);

    const playerDetails = await fetchPlayerDetailsComplete(player.playerId);

    if (!playerDetails) {
      if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
      const errorView = createErrorView("Failed to load player details", async () => {
        await stopAnyPreview();
        if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
        style(tabsHeader, { display: "flex" });
        style(tabContainer, { display: "block" });
      });
      currentDetailView = errorView;
      root.appendChild(errorView);
      return;
    }

    const detailView = await createPlayerDetailView({
      player: playerDetails,
      onBack: async () => {
        await stopAnyPreview();
        if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
        style(tabsHeader, { display: "flex" });
        style(tabContainer, { display: "block" });
      },
    });

    if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
    currentDetailView = detailView;
    root.appendChild(currentDetailView);
  };

  // Sub-tabs header
  const tabsHeader = document.createElement("div");
  style(tabsHeader, {
    display: "flex",
    gap: "8px",
    padding: "0 0 12px 0",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: "12px",
  });

  const tabButtons: Record<SubTabId, HTMLButtonElement> = {
    "my-friends": createTabButton("My Friends", true),
    "add-friends": createTabButton("Add Friends", false),
    "requests": createTabButton("Requests", false),
  };

  // Add badge to Requests button
  const requestsBadge = createSubTabBadge();
  tabButtons["requests"].style.position = "relative";
  tabButtons["requests"].appendChild(requestsBadge);

  tabsHeader.append(tabButtons["my-friends"], tabButtons["add-friends"], tabButtons["requests"]);

  // Build sub-tabs
  const myFriendsTab = createMyFriendsSubTab(showPlayerDetail);
  const addFriendsTab = createAddFriendsSubTab();
  const requestsTab = createRequestsSubTab();

  const tabContents: Record<SubTabId, HTMLElement> = {
    "my-friends": myFriendsTab.root,
    "add-friends": addFriendsTab.root,
    "requests": requestsTab.root,
  };

  // Tab container
  const tabContainer = document.createElement("div");
  style(tabContainer, { flex: "1", overflow: "hidden", position: "relative" });

  for (const [id, content] of Object.entries(tabContents)) {
    style(content, { display: id === "my-friends" ? "flex" : "none", height: "100%" });
    tabContainer.appendChild(content);
  }

  root.append(tabsHeader, tabContainer);

  // Tab switching
  let activeTab: SubTabId = "my-friends";

  const switchTab = (tabId: SubTabId) => {
    if (activeTab === tabId) return;
    style(tabContents[activeTab], { display: "none" });
    tabButtons[activeTab].classList.remove("active");
    style(tabButtons[activeTab], { background: "transparent", color: "#c9d4e6" });

    activeTab = tabId;
    style(tabContents[tabId], { display: "flex" });
    tabButtons[tabId].classList.add("active");
    style(tabButtons[tabId], { background: "rgba(94,234,212,0.18)", color: "#ecfdf5" });
  };

  tabButtons["my-friends"].onclick = () => switchTab("my-friends");
  tabButtons["add-friends"].onclick = () => switchTab("add-friends");
  tabButtons["requests"].onclick = () => switchTab("requests");

  // Update badge count
  const updateRequestsBadge = () => {
    const count = getIncomingRequestsCount();
    if (count <= 0) {
      requestsBadge.style.display = "none";
      return;
    }
    requestsBadge.style.display = "inline-flex";
    requestsBadge.textContent = count > 99 ? "99+" : String(count);
  };

  // Listen to friend requests refresh events
  const onRequestsRefresh = () => updateRequestsBadge();
  window.addEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRequestsRefresh);

  // Initial badge update
  updateRequestsBadge();

  return {
    id: "community" as const,
    root,
    show: () => style(root, { display: "flex" }),
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      window.removeEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRequestsRefresh);
      myFriendsTab.destroy();
      addFriendsTab.destroy();
      requestsTab.destroy();
      root.remove();
    },
  };
}

function createTabButton(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = active ? "active" : "";
  style(btn, {
    flex: "1",
    padding: "8px 16px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    background: active ? "rgba(94,234,212,0.18)" : "transparent",
    color: active ? "#ecfdf5" : "#c9d4e6",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  btn.onmouseenter = () => {
    if (!btn.classList.contains("active")) {
      style(btn, { background: "rgba(94,234,212,0.08)", color: "#e7eef7" });
    }
  };
  btn.onmouseleave = () => {
    if (!btn.classList.contains("active")) {
      style(btn, { background: "transparent", color: "#c9d4e6" });
    }
  };

  return btn;
}

function createSubTabBadge(): HTMLSpanElement {
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
  });
  return badge;
}
