import type { GroupSummary } from "../../../../ariesModAPI";
import { createGroup, fetchGroups, fetchPublicGroups } from "../../../../ariesModAPI/endpoints/groups";
import { updateCachedGroups, updateCachedPublicGroups } from "../../../../ariesModAPI";
import { createMyGroupsSubTab } from "./myGroupsSubTab";
import { createPublicGroupsSubTab } from "./publicGroupsSubTab";
import { createGroupDetailView } from "./groupDetailView";
import { createGroupCreateView } from "./groupCreateView";
import { style, ensureSharedStyles, CH_EVENTS } from "../shared";

type SubTabId = "my-groups" | "public-groups";

export function createGroupsTab() {
  ensureSharedStyles();

  const root = document.createElement("div");
  style(root, { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" });

  let currentDetailView: HTMLElement | null = null;

  const showGroupDetail = async (group: GroupSummary) => {
    style(tabsHeader, { display: "none" });
    style(tabContainer, { display: "none" });

    const loadingView = createLoadingView(async () => {
      if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
      style(tabsHeader, { display: "flex" });
      style(tabContainer, { display: "block" });
    });
    currentDetailView = loadingView;
    root.appendChild(loadingView);

    const detailView = await createGroupDetailView({
      group,
      onBack: async () => {
        if (currentDetailView) {
          const cleanup = (currentDetailView as any).__cleanup;
          if (typeof cleanup === "function") cleanup();
          currentDetailView.remove();
          currentDetailView = null;
        }
        style(tabsHeader, { display: "flex" });
        style(tabContainer, { display: "block" });
      },
    });

    if (currentDetailView) { currentDetailView.remove(); currentDetailView = null; }
    currentDetailView = detailView;
    root.appendChild(currentDetailView);
  };

  const showGroupCreate = () => {
    style(tabsHeader, { display: "none" });
    style(tabContainer, { display: "none" });

    const createView = createGroupCreateView({
      onBack: () => {
        if (currentDetailView) {
          // Call cleanup if it exists
          const cleanup = (currentDetailView as any).__cleanup;
          if (typeof cleanup === "function") cleanup();
          currentDetailView.remove();
          currentDetailView = null;
        }
        style(tabsHeader, { display: "flex" });
        style(tabContainer, { display: "block" });
      },
      onCreate: async (name: string, isPublic: boolean) => {
        // Show loading state
        const loadingView = createLoadingView(() => {
          // Cancel - just go back
          if (currentDetailView) {
            const cleanup = (currentDetailView as any).__cleanup;
            if (typeof cleanup === "function") cleanup();
            currentDetailView.remove();
            currentDetailView = null;
          }
          style(tabsHeader, { display: "flex" });
          style(tabContainer, { display: "block" });
        });

        // Replace create view with loading view
        if (currentDetailView) {
          const cleanup = (currentDetailView as any).__cleanup;
          if (typeof cleanup === "function") cleanup();
          currentDetailView.remove();
        }
        currentDetailView = loadingView;
        root.appendChild(loadingView);

        // Update loading text
        const loadingText = loadingView.querySelector("div:nth-child(2)") as HTMLElement;
        if (loadingText) loadingText.textContent = "Creating group...";

        // Call API
        const result = await createGroup({ name, isPublic });

        // Remove loading view
        if (currentDetailView) {
          currentDetailView.remove();
          currentDetailView = null;
        }

        if (result) {
          // Success - fetch and update appropriate caches
          const [myGroups, publicGroups] = await Promise.all([
            fetchGroups(),
            isPublic ? fetchPublicGroups() : Promise.resolve([]),
          ]);

          // Update caches
          updateCachedGroups(myGroups as any);
          if (isPublic && publicGroups.length > 0) {
            updateCachedPublicGroups(publicGroups as any);
          }

          // Trigger refresh event to update UI
          window.dispatchEvent(new CustomEvent(CH_EVENTS.GROUPS_REFRESH));

          // Go back to list
          style(tabsHeader, { display: "flex" });
          style(tabContainer, { display: "block" });
        } else {
          // Error - show error message
          console.error("[groups] Failed to create group");
          // TODO: Show error toast/notification
          // For now, just go back
          style(tabsHeader, { display: "flex" });
          style(tabContainer, { display: "block" });
        }
      },
    });

    currentDetailView = createView;
    root.appendChild(createView);
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
    "my-groups": createTabButton("My Groups", true),
    "public-groups": createTabButton("Public Groups", false),
  };

  tabsHeader.append(tabButtons["my-groups"], tabButtons["public-groups"]);

  // Build sub-tabs
  const myGroupsTab = createMyGroupsSubTab(showGroupDetail, showGroupCreate);
  const publicGroupsTab = createPublicGroupsSubTab(showGroupDetail);

  const tabContents: Record<SubTabId, HTMLElement> = {
    "my-groups": myGroupsTab.root,
    "public-groups": publicGroupsTab.root,
  };

  // Tab container
  const tabContainer = document.createElement("div");
  style(tabContainer, { flex: "1", overflow: "hidden", position: "relative" });

  for (const [id, content] of Object.entries(tabContents)) {
    style(content, { display: id === "my-groups" ? "flex" : "none", height: "100%" });
    tabContainer.appendChild(content);
  }

  root.append(tabsHeader, tabContainer);

  // Tab switching
  let activeTab: SubTabId = "my-groups";

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

  tabButtons["my-groups"].onclick = () => switchTab("my-groups");
  tabButtons["public-groups"].onclick = () => switchTab("public-groups");

  return {
    id: "groups" as const,
    root,
    show: () => style(root, { display: "flex" }),
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      myGroupsTab.destroy?.();
      publicGroupsTab.destroy?.();
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

function createLoadingView(onBack: () => void): HTMLElement {
  const view = document.createElement("div");
  style(view, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "16px",
  });

  const spinner = document.createElement("div");
  style(spinner, {
    width: "32px",
    height: "32px",
    border: "3px solid rgba(94,234,212,0.2)",
    borderTop: "3px solid #5eead4",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  });

  const text = document.createElement("div");
  style(text, {
    fontSize: "13px",
    color: "rgba(226,232,240,0.7)",
  });
  text.textContent = "Loading group...";

  const backBtn = document.createElement("button");
  style(backBtn, {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  });
  backBtn.textContent = "Cancel";
  backBtn.onclick = onBack;

  view.append(spinner, text, backBtn);

  return view;
}
