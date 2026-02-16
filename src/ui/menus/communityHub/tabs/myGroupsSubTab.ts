import { getWelcomeCache } from "../../../../ariesModAPI";
import type { GroupSummary } from "../../../../ariesModAPI";
import { style, CH_EVENTS, ensureSharedStyles, createKeyBlocker } from "../shared";

export function createMyGroupsSubTab(
  showGroupDetail: (group: GroupSummary) => void,
  showGroupCreate: () => void,
) {
  ensureSharedStyles();

  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "12px" });

  // Search bar
  const searchBar = document.createElement("input");
  searchBar.type = "text";
  searchBar.placeholder = "Search my groups...";
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
  });

  // Render groups
  const renderGroups = (filter: string = "") => {
    groupsList.innerHTML = "";
    const welcome = getWelcomeCache();
    const groups = welcome?.groups || [];

    const filtered = filter
      ? groups.filter((g) => g.name?.toLowerCase().includes(filter.toLowerCase()))
      : groups;

    // Always show create card first (unless filtering)
    if (!filter) {
      groupsList.appendChild(createGroupCreateCard(showGroupCreate));
    }

    if (filtered.length === 0 && filter) {
      const empty = document.createElement("div");
      style(empty, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
        gridColumn: "1 / -1",
      });
      empty.textContent = "No groups found";
      groupsList.appendChild(empty);
      return;
    }

    // Sort: by updated_at descending (most recent first)
    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    for (const group of sorted) {
      groupsList.appendChild(createGroupCard(group, showGroupDetail));
    }
  };

  // Initial render
  renderGroups();

  // Search functionality
  searchBar.oninput = () => renderGroups(searchBar.value);

  // Listen for cache updates
  const onGroupsRefresh = () => renderGroups(searchBar.value);
  window.addEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);

  container.append(searchBar, groupsList);

  return {
    root: container,
    destroy() {
      keyBlocker.detach();
      window.removeEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);
    },
  };
}

function createGroupCard(group: GroupSummary, onClick: (group: GroupSummary) => void): HTMLElement {
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

  // Header with icon, name and role badge
  const header = document.createElement("div");
  style(header, { display: "flex", alignItems: "center", gap: "8px" });

  // Public/Private icon
  const visibilityIcon = document.createElement("div");
  style(visibilityIcon, {
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    color: "rgba(226,232,240,0.5)",
  });

  if (group.isPublic) {
    visibilityIcon.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    `;
  } else {
    visibilityIcon.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    `;
  }

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

  // Role badge
  const roleBadge = document.createElement("div");
  style(roleBadge, {
    padding: "2px 8px",
    borderRadius: "6px",
    fontSize: "10px",
    fontWeight: "600",
    textTransform: "uppercase",
    flexShrink: "0",
  });

  if (group.role === "owner") {
    style(roleBadge, { background: "rgba(251,191,36,0.2)", color: "#fbbf24" });
    roleBadge.textContent = "Owner";
  } else if (group.role === "admin") {
    style(roleBadge, { background: "rgba(139,92,246,0.2)", color: "#a78bfa" });
    roleBadge.textContent = "Admin";
  } else {
    style(roleBadge, { background: "rgba(94,234,212,0.2)", color: "#5eead4" });
    roleBadge.textContent = "Member";
  }

  header.append(visibilityIcon, name, roleBadge);

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
      background: member.avatarUrl || member.discordAvatarUrl
        ? `url(${member.avatarUrl || member.discordAvatarUrl}) center/cover`
        : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
      border: "2px solid #0f141e",
      marginLeft: i > 0 ? "-8px" : "0",
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
  const count = group.memberCount || group.membersCount || 0;
  memberCount.textContent = `${count} member${count !== 1 ? 's' : ''}`;

  avatarsRow.append(avatarsContainer, memberCount);

  // Build card structure
  card.append(header, avatarsRow);

  return card;
}

function createGroupCreateCard(onClick: () => void): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "14px",
    border: "2px dashed rgba(94,234,212,0.3)",
    borderRadius: "12px",
    background: "rgba(94,234,212,0.05)",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  card.onclick = onClick;

  card.onmouseenter = () => {
    style(card, { background: "rgba(94,234,212,0.12)", borderColor: "rgba(94,234,212,0.5)", transform: "translateY(-2px)" });
  };
  card.onmouseleave = () => {
    style(card, { background: "rgba(94,234,212,0.05)", borderColor: "rgba(94,234,212,0.3)", transform: "translateY(0)" });
  };

  // Plus icon
  const icon = document.createElement("div");
  style(icon, {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "rgba(94,234,212,0.15)",
    display: "grid",
    placeItems: "center",
    color: "#5eead4",
    fontSize: "20px",
    fontWeight: "300",
  });
  icon.textContent = "+";

  // Label
  const label = document.createElement("div");
  style(label, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#5eead4",
  });
  label.textContent = "Create Group";

  card.append(icon, label);

  return card;
}
