import { getCachedPublicGroups, updateCachedPublicGroups, onWelcome } from "../../../../ariesModAPI";
import type { GroupSummary } from "../../../../ariesModAPI";
import { fetchPublicGroups } from "../../../../ariesModAPI/endpoints/groups";
import { style, CH_EVENTS, ensureSharedStyles, createKeyBlocker, formatTimestamp } from "../shared";

export function createPublicGroupsSubTab(showGroupDetail: (group: GroupSummary) => void) {
  ensureSharedStyles();

  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "12px" });

  // State variables
  let isLoading = false;
  let lastRefreshTime: Date | null = null;

  // Top controls (search bar + refresh button)
  const controlsContainer = document.createElement("div");
  style(controlsContainer, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  });

  // Search bar
  const searchBar = document.createElement("input");
  searchBar.type = "text";
  searchBar.placeholder = "Search public groups...";
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

  // Refresh button
  const refreshButton = document.createElement("button");
  refreshButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  `;
  style(refreshButton, {
    padding: "10px 16px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(94,234,212,0.12)",
    color: "#5eead4",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });

  refreshButton.onmouseenter = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.2)",
      borderColor: "rgba(94,234,212,0.35)",
    });
  };

  refreshButton.onmouseleave = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.12)",
      borderColor: "rgba(255,255,255,0.12)",
    });
  };

  controlsContainer.append(searchBar, refreshButton);

  // Footer with last refresh timestamp
  const footer = document.createElement("div");
  style(footer, {
    padding: "8px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    fontSize: "11px",
    color: "rgba(226,232,240,0.4)",
    textAlign: "center",
  });

  const updateFooterTimestamp = () => {
    if (lastRefreshTime) {
      footer.textContent = formatTimestamp(lastRefreshTime);
    } else {
      footer.textContent = "—";
    }
  };

  updateFooterTimestamp();

  // Groups list container
  const groupsList = document.createElement("div");
  groupsList.className = "qws-ch-scrollable";
  style(groupsList, {
    flex: "1",
    overflow: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px",
    alignContent: "start",
    padding: "6px 8px 6px 6px", // Padding to prevent cards from being clipped during hover animations
    position: "relative",
  });

  // Render groups
  const renderGroups = (filter: string = "") => {
    groupsList.innerHTML = "";

    if (isLoading) {
      const loading = document.createElement("div");
      style(loading, {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      loading.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(94,234,212,0.5)" stroke-width="2" stroke-dasharray="15 5" fill="none"/>
        </svg>
        <div>Loading public groups...</div>
      `;
      groupsList.appendChild(loading);
      return;
    }

    const publicGroups = getCachedPublicGroups() || [];

    const filtered = filter
      ? publicGroups.filter((g) => g.name?.toLowerCase().includes(filter.toLowerCase()))
      : publicGroups;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
        gap: "8px",
      });

      const icon = document.createElement("div");
      icon.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      `;

      const text = document.createElement("div");
      text.textContent = filter ? "No public groups found" : "No public groups available";

      empty.append(icon, text);
      groupsList.appendChild(empty);
      return;
    }

    // Sort: by updated_at descending (most recent activity first)
    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    for (const group of sorted) {
      // Convert public group to GroupSummary format (id: number -> string)
      const groupSummary: GroupSummary = {
        ...group,
        id: String(group.id),
        isPublic: true,
      };
      groupsList.appendChild(createPublicGroupCard(groupSummary, showGroupDetail));
    }
  };

  // Load public groups from API
  const loadPublicGroups = async () => {
    isLoading = true;
    renderGroups(searchBar.value);

    try {
      const publicGroups = await fetchPublicGroups();

      // Update cache
      updateCachedPublicGroups(publicGroups as any);

      // Update last refresh timestamp
      lastRefreshTime = new Date();
      updateFooterTimestamp();

      // Trigger refresh event to update UI
      window.dispatchEvent(new CustomEvent(CH_EVENTS.GROUPS_REFRESH));

      isLoading = false;
      renderGroups(searchBar.value);
    } catch (error) {
      console.error("[PublicGroups] Failed to load public groups:", error);
      isLoading = false;
      renderGroups(searchBar.value);
    }
  };

  // Initial render
  renderGroups();

  // Refresh button click
  refreshButton.onclick = () => {
    loadPublicGroups();
  };

  // Search functionality
  searchBar.oninput = () => renderGroups(searchBar.value);

  // Listen for cache updates
  const onGroupsRefresh = () => renderGroups(searchBar.value);
  window.addEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);

  // Subscribe to welcome event to set initial timestamp
  const unsubscribeWelcome = onWelcome((data) => {
    if (data.publicGroups !== undefined) {
      // Set timestamp to when we received the welcome event (even if list is empty)
      lastRefreshTime = new Date();
      updateFooterTimestamp();
    }
  });

  container.append(controlsContainer, groupsList, footer);

  return {
    root: container,
    destroy() {
      keyBlocker.detach();
      window.removeEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);
      unsubscribeWelcome();
    },
  };
}

function createPublicGroupCard(group: GroupSummary, onClick: (group: GroupSummary) => void): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  card.onclick = () => onClick(group);

  card.onmouseenter = () => {
    style(card, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)", transform: "translateY(-2px)" });
  };
  card.onmouseleave = () => {
    style(card, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", transform: "translateY(0)" });
  };

  // Header with name and public badge
  const header = document.createElement("div");
  style(header, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });

  const name = document.createElement("div");
  style(name, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: "1",
  });
  name.textContent = group.name || "Unnamed Group";

  // Public badge
  const publicBadge = document.createElement("div");
  style(publicBadge, {
    padding: "2px 8px",
    borderRadius: "6px",
    fontSize: "10px",
    fontWeight: "600",
    textTransform: "uppercase",
    flexShrink: "0",
    background: "rgba(94,234,212,0.2)",
    color: "#5eead4",
  });
  publicBadge.textContent = "Public";

  header.append(name, publicBadge);

  // Preview avatars (max 3)
  const avatarsRow = document.createElement("div");
  style(avatarsRow, { display: "flex", alignItems: "center", gap: "6px" });

  const previewMembers = group.previewMembers || [];
  const avatarsContainer = document.createElement("div");
  style(avatarsContainer, { display: "flex", marginLeft: "-4px" });

  for (let i = 0; i < Math.min(3, previewMembers.length); i++) {
    const member = previewMembers[i];
    const avatar = document.createElement("div");
    style(avatar, {
      width: "28px",
      height: "28px",
      borderRadius: "50%",
      background: member.discordAvatarUrl
        ? `url(${member.discordAvatarUrl}) center/cover`
        : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
      border: "2px solid #0f141e",
      marginLeft: i > 0 ? "-8px" : "0",
      flexShrink: "0",
    });
    avatarsContainer.appendChild(avatar);
  }

  // Member count
  const memberCount = document.createElement("div");
  style(memberCount, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.6)",
    marginLeft: "auto",
  });
  const count = group.memberCount || 0;
  memberCount.textContent = `${count} member${count !== 1 ? 's' : ''}`;

  avatarsRow.append(avatarsContainer, memberCount);

  card.append(header, avatarsRow);

  return card;
}
