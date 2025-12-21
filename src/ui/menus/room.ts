// src/ui/menus/room.ts
// Affichage des rooms publiques avec rafraîchissement lors de l'ouverture du menu.

import { Menu, VTabItem } from "../menu";
import { toastSimple } from "../toast";
import { PlayersService, type Player } from "../../services/players";
import {
  isActivityLogModalOpenAsync,
  isInventoryPanelOpen,
  isJournalModalOpen,
  isStatsModalOpenAsync,
  waitActivityLogModalClosed,
  waitInventoryPanelClosed,
  waitJournalModalClosed,
  waitStatsModalClosed,
} from "../../services/fakeModal";
import { pageWindow } from "../../utils/page-context";
import { fetchAvailableRooms, searchRoomsByPlayerName, type Room as SupabaseRoom } from "../../utils/supabase";
import {
  RoomService,
  type PublicRoomDefinition,
  type PublicRoomStatus,
  type PublicRoomPlayer,
} from "../../services/room";
import { plantCatalog } from "../../data/hardcoded-data.clean";

const ROOM_MENU_STYLE_ID = "mc-room-menu-loading-style";

function ensureRoomMenuStyles(): void {
  if (document.getElementById(ROOM_MENU_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ROOM_MENU_STYLE_ID;
  style.textContent = `
@keyframes room-menu-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.qmm.qmm-room-menu .qmm-tab[data-id="public-rooms"],
.qmm.qmm-room-menu .qmm-tab[data-id="search-player"],
.qmm.qmm-room-menu .qmm-tab[data-id="players"] {
  flex: 0 1 auto;
  min-width: 160px;
}
`;
  document.head.appendChild(style);
}

const TAB_ID = "public-rooms";
const CUSTOM_TAB_ID = "custom-rooms";
const SEARCH_TAB_ID = "search-player";
const PLAYERS_TAB_ID = "players";
type PlayerFilter = "any" | "few" | "crowded" | "full";

export async function renderRoomMenu(root: HTMLElement) {
  const ui = new Menu({
    id: "room",
    compact: true,
    windowSelector: ".qws-win",
    classes: "qmm-room-menu",
  });
  ui.addTab(TAB_ID, "Public Rooms", (view) => renderPublicRoomsTab(view, ui));
  ui.addTab(SEARCH_TAB_ID, "Search Player", (view) => renderSearchPlayerTab(view, ui));
  ui.addTab(PLAYERS_TAB_ID, "Players", (view) => {
    void renderPlayersTab(view).catch(() => {});
  });
  ui.mount(root);
}

function renderPublicRoomsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  ensureRoomMenuStyles();

  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.padding = "12px";
  root.style.boxSizing = "border-box";
  root.style.height = "100%";
  root.style.minHeight = "0";
  view.appendChild(root);

  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gap = "12px";
  container.style.width = "100%";
  container.style.maxWidth = "640px";
  container.style.height = "100%";
  container.style.gridTemplateRows = "max-content max-content 1fr max-content";
  root.appendChild(container);

  const heading = document.createElement("div");
  heading.textContent = "Select a public room to quickly join a game.";
  heading.style.fontSize = "14px";
  heading.style.opacity = "0.9";

  if (RoomService.isDiscordActivity()) {
    const discordWarning = document.createElement("div");
    discordWarning.textContent =
      "You are using Discord: direct join is disabled. Open the official website to join a room.";
    discordWarning.style.fontSize = "13px";
    discordWarning.style.lineHeight = "1.4";
    discordWarning.style.padding = "10px 12px";
    discordWarning.style.borderRadius = "8px";
    discordWarning.style.background = "#2e1f1f";
    discordWarning.style.color = "#ffb4a2";
    discordWarning.style.border = "1px solid rgba(255, 140, 105, 0.35)";
    container.appendChild(discordWarning);
  }

  const headerRow = document.createElement("div");
  headerRow.style.display = "flex";
  headerRow.style.alignItems = "center";
  headerRow.style.gap = "12px";
  headerRow.style.width = "100%";
  headerRow.style.margin = "12px 0 6px";
  headerRow.appendChild(heading);
  container.appendChild(headerRow);

  const listWrapper = document.createElement("div");
  listWrapper.style.height = "54vh";
  listWrapper.style.maxHeight = "54vh";
  listWrapper.style.overflowY = "auto";
  listWrapper.style.padding = "6px 2px";
  listWrapper.style.borderRadius = "10px";
  listWrapper.style.background = "rgba(12, 13, 20, 0.65)";
  listWrapper.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.04)";
  listWrapper.style.width = "100%";
  listWrapper.style.boxSizing = "border-box";
  listWrapper.style.position = "relative";

  const floatingLoadingIndicator = document.createElement("div");
  floatingLoadingIndicator.style.position = "absolute";
  floatingLoadingIndicator.style.top = "14px";
  floatingLoadingIndicator.style.right = "14px";
  floatingLoadingIndicator.style.width = "28px";
  floatingLoadingIndicator.style.height = "28px";
  floatingLoadingIndicator.style.borderRadius = "999px";
  floatingLoadingIndicator.style.display = "flex";
  floatingLoadingIndicator.style.alignItems = "center";
  floatingLoadingIndicator.style.justifyContent = "center";
  floatingLoadingIndicator.style.background = "rgba(14, 16, 25, 0.9)";
  floatingLoadingIndicator.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  floatingLoadingIndicator.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.45)";
  floatingLoadingIndicator.style.opacity = "0";
  floatingLoadingIndicator.style.visibility = "hidden";
  floatingLoadingIndicator.style.pointerEvents = "none";
  floatingLoadingIndicator.style.transition = "opacity 160ms ease, transform 160ms ease";
  floatingLoadingIndicator.style.zIndex = "3";

  const floatingLoadingSpinner = document.createElement("div");
  floatingLoadingSpinner.style.width = "16px";
  floatingLoadingSpinner.style.height = "16px";
  floatingLoadingSpinner.style.borderRadius = "999px";
  floatingLoadingSpinner.style.border = "2px solid rgba(248, 250, 252, 0.16)";
  floatingLoadingSpinner.style.borderTopColor = "#f8fafc";
  floatingLoadingSpinner.style.animation = "room-menu-spin 1s linear infinite";
  floatingLoadingIndicator.appendChild(floatingLoadingSpinner);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.padding = "4px";
  listWrapper.appendChild(list);
  listWrapper.appendChild(floatingLoadingIndicator);
  container.appendChild(listWrapper);

  const updateFloatingLoadingIndicator = () => {
    floatingLoadingIndicator.style.transform = `translateY(${listWrapper.scrollTop}px)`;
  };

  let isFloatingIndicatorVisible = false;

  const setLoadingState = (loading: boolean) => {
    if (loading) {
      isFloatingIndicatorVisible = true;
      updateFloatingLoadingIndicator();
      floatingLoadingIndicator.style.visibility = "visible";
      floatingLoadingIndicator.style.opacity = "1";
    } else {
      isFloatingIndicatorVisible = false;
      floatingLoadingIndicator.style.opacity = "0";
      floatingLoadingIndicator.addEventListener(
        "transitionend",
        () => {
          if (!isFloatingIndicatorVisible) {
            floatingLoadingIndicator.style.visibility = "hidden";
          }
        },
        { once: true },
      );
      window.setTimeout(() => {
        if (!isFloatingIndicatorVisible) {
          floatingLoadingIndicator.style.visibility = "hidden";
        }
      }, 220);
    }
  };

  let savedScrollTop = 0;
  listWrapper.addEventListener("scroll", () => {
    savedScrollTop = listWrapper.scrollTop;
    if (isFloatingIndicatorVisible) {
      updateFloatingLoadingIndicator();
    }
  });

  let destroyed = false;
  let requestCounter = 0;
  let firstLoad = true;

  let selectedPlayerFilter: PlayerFilter = "any";
  let currentRooms: PublicRoomStatus[] = [];

  const refreshButton = ui.btn("Refresh rooms", { size: "sm", icon: "🔄" });
  refreshButton.style.flexShrink = "0";
  refreshButton.setAttribute("aria-label", "Refresh public rooms list");

  const statusBar = document.createElement("div");
  statusBar.style.fontSize = "12px";
  statusBar.style.opacity = "0.75";
  statusBar.style.marginLeft = "auto";
  statusBar.style.textAlign = "right";
  statusBar.textContent = "Loading rooms…";

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "12px";
  footer.style.marginTop = "8px";
  footer.style.width = "100%";
  footer.appendChild(refreshButton);
  footer.appendChild(statusBar);
  container.appendChild(footer);

  let isRefreshing = false;
  const updateRefreshButtonState = () => {
    const enabled = !destroyed && !isRefreshing;
    ui.setButtonEnabled(refreshButton, enabled);
    refreshButton.setAttribute("aria-busy", isRefreshing ? "true" : "false");
  };

  const matchesPlayerFilter = (room: PublicRoomStatus) => {
    switch (selectedPlayerFilter) {
      case "any":
        return true;
      case "few":
        return room.players > 0 && room.players <= 3;
      case "crowded":
        return !room.isFull && room.players >= 4;
      case "full":
        return room.isFull;
      default:
        return true;
    }
  };

  const renderRooms = (rooms: PublicRoomStatus[]) => {
    currentRooms = rooms;
    list.innerHTML = "";

    const visibleRooms = rooms.filter((room) => matchesPlayerFilter(room));

    if (!visibleRooms.length) {
      const empty = document.createElement("div");
      empty.textContent = rooms.length
        ? "No rooms match the selected filter."
        : "No public rooms available.";
      empty.style.padding = "16px";
      empty.style.textAlign = "center";
      empty.style.opacity = "0.7";
      list.appendChild(empty);
    } else {
      for (const room of visibleRooms) {
        list.appendChild(createRoomEntry(room, ui));
      }
    }

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, listWrapper.scrollHeight - listWrapper.clientHeight);
      const nextScroll = Math.min(savedScrollTop, maxScroll);
      listWrapper.scrollTop = nextScroll;
      savedScrollTop = nextScroll;
    });
  };

  const playerFilterContainer = document.createElement("div");
  playerFilterContainer.style.display = "flex";
  playerFilterContainer.style.alignItems = "center";
  playerFilterContainer.style.gap = "6px";
  playerFilterContainer.style.padding = "4px 6px";
  playerFilterContainer.style.background = "rgba(24, 26, 36, 0.85)";
  playerFilterContainer.style.borderRadius = "10px";
  playerFilterContainer.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.05)";

  const playerFilterLabel = document.createElement("span");
  playerFilterLabel.textContent = "Players";
  playerFilterLabel.style.fontSize = "12px";
  playerFilterLabel.style.opacity = "0.75";
  playerFilterLabel.style.paddingLeft = "2px";
  playerFilterContainer.appendChild(playerFilterLabel);

  const playerFilterSelect = document.createElement("select");
  playerFilterSelect.style.background = "rgba(17, 18, 27, 0.95)";
  playerFilterSelect.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  playerFilterSelect.style.color = "#f8fafc";
  playerFilterSelect.style.borderRadius = "8px";
  playerFilterSelect.style.padding = "4px 10px";
  playerFilterSelect.style.fontSize = "12px";
  playerFilterSelect.style.fontWeight = "500";
  playerFilterSelect.style.outline = "none";
  playerFilterSelect.style.cursor = "pointer";
  playerFilterSelect.style.minWidth = "130px";

  const playerFilters: { value: PlayerFilter; label: string }[] = [
    { value: "any", label: "Any players" },
    { value: "few", label: "1 - 3 players" },
    { value: "crowded", label: "4 - 5 players" },
    { value: "full", label: "Full rooms" },
  ];

  for (const option of playerFilters) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    playerFilterSelect.appendChild(opt);
  }

  playerFilterSelect.value = selectedPlayerFilter;
  playerFilterSelect.addEventListener("change", () => {
    selectedPlayerFilter = playerFilterSelect.value as PlayerFilter;
    savedScrollTop = 0;
    renderRooms(currentRooms);
  });

  playerFilterContainer.appendChild(playerFilterSelect);
  playerFilterContainer.style.marginLeft = "auto";
  headerRow.appendChild(playerFilterContainer);

  const refreshRooms = async () => {
    if (destroyed) return;
    const currentRequest = ++requestCounter;
    isRefreshing = true;
    updateRefreshButtonState();
    setLoadingState(true);
    statusBar.textContent = firstLoad ? "Loading rooms..." : "Refreshing rooms...";

    try {
      const available = await fetchAvailableRooms(100);
      if (destroyed || currentRequest !== requestCounter) return;

      const publicRooms = available
        .filter((room) => !room.isPrivate)
        .map(transformSupabaseRoom)
        .sort((a, b) => {
          if (b.players === a.players) {
            return b.lastUpdatedAt - a.lastUpdatedAt;
          }
          return b.players - a.players;
        });

      renderRooms(publicRooms);
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      statusBar.textContent = `Last update: ${time}`;
    } catch (error) {
      if (destroyed || currentRequest !== requestCounter) return;
      statusBar.textContent = `Failed to load rooms: ${String((error as Error)?.message || error)}`;
    } finally {
      if (!destroyed && currentRequest === requestCounter) {
        setLoadingState(false);
      }
      if (currentRequest === requestCounter) {
        isRefreshing = false;
      }
      updateRefreshButtonState();
      firstLoad = false;
    }
  };

  refreshButton.addEventListener("click", () => {
    void refreshRooms();
  });
  updateRefreshButtonState();

  refreshRooms();

  const windowEl = view.closest<HTMLElement>(".qws-win");
  const computeWindowVisible = (win: HTMLElement) =>
    !win.classList.contains("is-hidden") && getComputedStyle(win).display !== "none";

  let visibilityObserver: MutationObserver | null = null;
  if (windowEl) {
    let lastVisible = computeWindowVisible(windowEl);
    visibilityObserver = new MutationObserver(() => {
      if (destroyed) return;
      const isVisible = computeWindowVisible(windowEl);
      if (isVisible && !lastVisible) {
        void refreshRooms();
      }
      lastVisible = isVisible;
    });
    visibilityObserver.observe(windowEl, { attributes: true, attributeFilter: ["class", "style"] });
  }

  const previousCleanup = (view as any).__cleanup__;
  (view as any).__cleanup__ = () => {
    destroyed = true;
    visibilityObserver?.disconnect();
    updateRefreshButtonState();
    if (typeof previousCleanup === "function") {
      try {
        previousCleanup.call(view);
      } catch {}
    }
  };
}

const DEFAULT_SUPABASE_ROOM_CAPACITY = 6;
// Discord room IDs follow the shape `I-<19 digits>-<type>-<18+ digits>[-<18+ digits>]`.
const DISCORD_ROOM_ID_REGEX = /^I-\d{17,19}-[A-Z]{2,3}-\d{17,19}(?:-\d{17,19})?$/i;

function getPublicRoomCategory(roomId: string): "Discord" | "Web" {
  return DISCORD_ROOM_ID_REGEX.test(roomId) ? "Discord" : "Web";
}

function transformSupabaseRoom(room: SupabaseRoom): PublicRoomStatus {
  const rawCount = Number.isFinite(room.playersCount) ? Math.floor(room.playersCount) : 0;
  const players = Math.max(0, rawCount);
  const capacity = DEFAULT_SUPABASE_ROOM_CAPACITY;
  const parsedTimestamp = Number.isFinite(Date.parse(room.lastUpdatedAt))
    ? Date.parse(room.lastUpdatedAt)
    : Date.now();

  const playerDetails: PublicRoomPlayer[] = (room.userSlots ?? []).map((slot, index) => {
    const name = slot?.name?.trim();
    return {
      name: name && name.length ? name : "Unknown player",
      isConnected: true,
      discordAvatarUrl: slot?.avatarUrl ?? undefined,
      isHost: index === 0,
    };
  });

  return {
    name: room.id,
    idRoom: room.id,
    category: getPublicRoomCategory(room.id),
    players: Math.min(players, capacity),
    capacity,
    isFull: players >= capacity,
    lastUpdatedAt: parsedTimestamp,
    hostPlayerId: room.lastUpdatedByPlayerId ?? undefined,
    playerDetails,
  };
}

function renderCustomRoomsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  ensureRoomMenuStyles();

  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.padding = "12px";
  root.style.boxSizing = "border-box";
  root.style.height = "100%";
  root.style.minHeight = "0";
  view.appendChild(root);

  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gap = "12px";
  container.style.width = "100%";
  container.style.maxWidth = "640px";
  container.style.height = "100%";
  container.style.maxHeight = "100%";
  container.style.minHeight = "0";
  container.style.gridTemplateRows = "max-content max-content max-content 1fr max-content";
  root.appendChild(container);

  const heading = document.createElement("div");
  heading.textContent = "Save your favourite rooms and access them quickly.";
  heading.style.fontSize = "14px";
  heading.style.opacity = "0.9";
  container.appendChild(heading);

  const manageCard = document.createElement("div");
  manageCard.style.display = "grid";
  manageCard.style.gap = "10px";
  manageCard.style.padding = "16px";
  manageCard.style.borderRadius = "12px";
  manageCard.style.background = "rgba(20, 22, 32, 0.95)";
  manageCard.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.05)";
  container.appendChild(manageCard);

  const manageTitle = document.createElement("div");
  manageTitle.textContent = "Add a custom room";
  manageTitle.style.fontWeight = "600";
  manageTitle.style.fontSize = "14px";
  manageCard.appendChild(manageTitle);

  const manageForm = document.createElement("form");
  manageForm.style.display = "grid";
  manageForm.style.gap = "10px";
  manageCard.appendChild(manageForm);

  const fieldsRow = document.createElement("div");
  fieldsRow.style.display = "grid";
  fieldsRow.style.gap = "10px";
  fieldsRow.style.gridTemplateColumns = "minmax(180px, 1fr) minmax(160px, 1fr) auto";
  fieldsRow.style.alignItems = "center";
  manageForm.appendChild(fieldsRow);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Room name";
  nameInput.required = true;
  nameInput.style.background = "rgba(15, 16, 24, 0.95)";
  nameInput.style.border = "1px solid rgba(148, 163, 184, 0.25)";
  nameInput.style.borderRadius = "10px";
  nameInput.style.padding = "10px 12px";
  nameInput.style.fontSize = "13px";
  nameInput.style.color = "#f8fafc";
  nameInput.style.width = "100%";
  nameInput.autocomplete = "off";
  fieldsRow.appendChild(nameInput);

  const idInput = document.createElement("input");
  idInput.type = "text";
  idInput.placeholder = "Room code";
  idInput.required = true;
  idInput.style.background = "rgba(15, 16, 24, 0.95)";
  idInput.style.border = "1px solid rgba(148, 163, 184, 0.25)";
  idInput.style.borderRadius = "10px";
  idInput.style.padding = "10px 12px";
  idInput.style.fontSize = "13px";
  idInput.style.color = "#f8fafc";
  idInput.style.width = "100%";
  idInput.autocomplete = "off";
  fieldsRow.appendChild(idInput);

  const addBtn = ui.btn("Add room", { size: "sm", variant: "primary" });
  addBtn.type = "submit";
  addBtn.style.whiteSpace = "nowrap";
  fieldsRow.appendChild(addBtn);

  const formFeedback = document.createElement("div");
  formFeedback.style.fontSize = "12px";
  formFeedback.style.opacity = "0.85";
  formFeedback.style.minHeight = "16px";
  manageForm.appendChild(formFeedback);

  const hint = document.createElement("div");
  hint.textContent = "Custom rooms are stored locally in your browser.";
  hint.style.fontSize = "12px";
  hint.style.opacity = "0.65";
  manageCard.appendChild(hint);

  if (RoomService.isDiscordActivity()) {
    const discordWarning = document.createElement("div");
    discordWarning.textContent =
      "You are using Discord: direct join is disabled. Open the official website to join a room.";
    discordWarning.style.fontSize = "13px";
    discordWarning.style.lineHeight = "1.4";
    discordWarning.style.padding = "10px 12px";
    discordWarning.style.borderRadius = "8px";
    discordWarning.style.background = "#2e1f1f";
    discordWarning.style.color = "#ffb4a2";
    discordWarning.style.border = "1px solid rgba(255, 140, 105, 0.35)";
    container.appendChild(discordWarning);
  }

  const filterBar = document.createElement("div");
  filterBar.style.display = "flex";
  filterBar.style.flexWrap = "wrap";
  filterBar.style.alignItems = "center";
  filterBar.style.gap = "8px";
  filterBar.style.margin = "12px 0 6px";
  filterBar.style.width = "100%";
  container.appendChild(filterBar);

  const listWrapper = document.createElement("div");
  listWrapper.style.height = "36vh";
  listWrapper.style.maxHeight = "36vh";
  listWrapper.style.overflowY = "auto";
  listWrapper.style.padding = "6px 2px";
  listWrapper.style.borderRadius = "10px";
  listWrapper.style.background = "rgba(12, 13, 20, 0.65)";
  listWrapper.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.04)";
  listWrapper.style.width = "100%";
  listWrapper.style.boxSizing = "border-box";
  listWrapper.style.position = "relative";

  const floatingLoadingIndicator = document.createElement("div");
  floatingLoadingIndicator.style.position = "absolute";
  floatingLoadingIndicator.style.top = "14px";
  floatingLoadingIndicator.style.right = "14px";
  floatingLoadingIndicator.style.width = "28px";
  floatingLoadingIndicator.style.height = "28px";
  floatingLoadingIndicator.style.borderRadius = "999px";
  floatingLoadingIndicator.style.display = "flex";
  floatingLoadingIndicator.style.alignItems = "center";
  floatingLoadingIndicator.style.justifyContent = "center";
  floatingLoadingIndicator.style.background = "rgba(14, 16, 25, 0.9)";
  floatingLoadingIndicator.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  floatingLoadingIndicator.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.45)";
  floatingLoadingIndicator.style.opacity = "0";
  floatingLoadingIndicator.style.visibility = "hidden";
  floatingLoadingIndicator.style.pointerEvents = "none";
  floatingLoadingIndicator.style.transition = "opacity 160ms ease, transform 160ms ease";
  floatingLoadingIndicator.style.zIndex = "3";

  const floatingLoadingSpinner = document.createElement("div");
  floatingLoadingSpinner.style.width = "16px";
  floatingLoadingSpinner.style.height = "16px";
  floatingLoadingSpinner.style.borderRadius = "999px";
  floatingLoadingSpinner.style.border = "2px solid rgba(248, 250, 252, 0.16)";
  floatingLoadingSpinner.style.borderTopColor = "#f8fafc";
  floatingLoadingSpinner.style.animation = "room-menu-spin 1s linear infinite";
  floatingLoadingIndicator.appendChild(floatingLoadingSpinner);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.padding = "4px";
  listWrapper.appendChild(list);
  listWrapper.appendChild(floatingLoadingIndicator);
  container.appendChild(listWrapper);

  const updateFloatingLoadingIndicator = () => {
    floatingLoadingIndicator.style.transform = `translateY(${listWrapper.scrollTop}px)`;
  };

  let isFloatingIndicatorVisible = false;

  const setLoadingState = (loading: boolean) => {
    if (loading) {
      isFloatingIndicatorVisible = true;
      updateFloatingLoadingIndicator();
      floatingLoadingIndicator.style.visibility = "visible";
      floatingLoadingIndicator.style.opacity = "1";
    } else {
      isFloatingIndicatorVisible = false;
      floatingLoadingIndicator.style.opacity = "0";
      floatingLoadingIndicator.addEventListener(
        "transitionend",
        () => {
          if (!isFloatingIndicatorVisible) {
            floatingLoadingIndicator.style.visibility = "hidden";
          }
        },
        { once: true },
      );
      window.setTimeout(() => {
        if (!isFloatingIndicatorVisible) {
          floatingLoadingIndicator.style.visibility = "hidden";
        }
      }, 220);
    }
  };

  const refreshButton = ui.btn("Refresh rooms", { size: "sm", icon: "🔄" });
  refreshButton.style.flexShrink = "0";
  refreshButton.setAttribute("aria-label", "Refresh custom rooms list");

  const statusBar = document.createElement("div");
  statusBar.style.fontSize = "12px";
  statusBar.style.opacity = "0.75";
  statusBar.textContent = "Add a custom room to get started.";

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "12px";
  footer.style.marginTop = "8px";
  footer.style.width = "100%";
  footer.appendChild(refreshButton);
  footer.appendChild(statusBar);
  container.appendChild(footer);

  let savedScrollTop = 0;
  listWrapper.addEventListener("scroll", () => {
    savedScrollTop = listWrapper.scrollTop;
    if (isFloatingIndicatorVisible) {
      updateFloatingLoadingIndicator();
    }
  });

  let destroyed = false;
  let requestCounter = 0;
  let firstLoad = true;

  let selectedCategory: string | null = null;
  let selectedPlayerFilter: PlayerFilter = "any";
  let currentRooms: PublicRoomStatus[] = [];

  const filterButtons = new Map<string | null, HTMLButtonElement>();

  const categoryButtonContainer = document.createElement("div");
  categoryButtonContainer.style.display = "flex";
  categoryButtonContainer.style.flexWrap = "wrap";
  categoryButtonContainer.style.alignItems = "center";
  categoryButtonContainer.style.gap = "8px";
  filterBar.appendChild(categoryButtonContainer);

  const updateFilterButtonStyles = () => {
    for (const [category, button] of filterButtons) {
      const isActive = category === selectedCategory;
      button.dataset.active = isActive ? "true" : "false";
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.style.opacity = isActive ? "1" : "0.7";
    }
  };

  const createFilterButton = (label: string, category: string | null) => {
    const button = ui.btn(label, { size: "sm", variant: "ghost" });
    button.addEventListener("click", () => {
      if (category === null) {
        setCategoryFilter(null);
      } else if (selectedCategory === category) {
        setCategoryFilter(null);
      } else {
        setCategoryFilter(category);
      }
    });
    filterButtons.set(category, button);
    categoryButtonContainer.appendChild(button);
  };

  const applyCategoryButtons = (definitions: PublicRoomDefinition[]) => {
    const seen = new Set<string>();
    for (const room of definitions) {
      if (room.category) {
        seen.add(room.category);
      }
    }
    const categories = Array.from(seen);
    const preferredOrder = RoomService.getPublicRoomsCategoryOrder();
    if (preferredOrder.length) {
      const indexMap = new Map(preferredOrder.map((name, index) => [name, index]));
      categories.sort((a, b) => {
        const indexA = indexMap.get(a);
        const indexB = indexMap.get(b);
        if (indexA === undefined && indexB === undefined) return a.localeCompare(b);
        if (indexA === undefined) return 1;
        if (indexB === undefined) return -1;
        return indexA - indexB;
      });
    } else {
      categories.sort((a, b) => a.localeCompare(b));
    }

    filterButtons.clear();
    categoryButtonContainer.innerHTML = "";
    createFilterButton("All", null);
    let selectedCategoryExists = selectedCategory === null;
    for (const category of categories) {
      createFilterButton(category, category);
      if (category === selectedCategory) {
        selectedCategoryExists = true;
      }
    }
    if (!selectedCategoryExists) {
      selectedCategory = null;
    }
    updateFilterButtonStyles();
  };

  const setCategoryFilter = (category: string | null) => {
    if (selectedCategory === category) return;
    selectedCategory = category;
    savedScrollTop = 0;
    updateFilterButtonStyles();
    renderRooms(currentRooms);
  };

  const matchesPlayerFilter = (room: PublicRoomStatus) => {
    switch (selectedPlayerFilter) {
      case "any":
        return true;
      case "few":
        return room.players > 0 && room.players <= 3;
      case "crowded":
        return !room.isFull && room.players >= 4;
      case "full":
        return room.isFull;
      default:
        return true;
    }
  };

  const renderRooms = (rooms: PublicRoomStatus[]) => {
    currentRooms = rooms;
    list.innerHTML = "";

    const visibleRooms = rooms.filter((room) => {
      if (selectedCategory !== null && room.category !== selectedCategory) {
        return false;
      }
      if (!matchesPlayerFilter(room)) {
        return false;
      }
      return true;
    });

    if (!visibleRooms.length) {
      const empty = document.createElement("div");
      const hasDefinitions = RoomService.getCustomRooms().length > 0;
      empty.textContent = hasDefinitions
        ? "No rooms match the selected filter."
        : "No custom rooms yet. Add one above.";
      empty.style.padding = "16px";
      empty.style.textAlign = "center";
      empty.style.opacity = "0.7";
      list.appendChild(empty);
    } else {
      for (const room of visibleRooms) {
        const entry = createRoomEntry(room, ui, {
          onRemove: () => {
            if (!RoomService.removeCustomRoom(room.idRoom)) return;
            savedScrollTop = 0;
            handleRoomsChanged();
          },
        });
        list.appendChild(entry);
      }
    }

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, listWrapper.scrollHeight - listWrapper.clientHeight);
      const nextScroll = Math.min(savedScrollTop, maxScroll);
      listWrapper.scrollTop = nextScroll;
      savedScrollTop = nextScroll;
    });
  };

  const playerFilterContainer = document.createElement("div");
  playerFilterContainer.style.display = "flex";
  playerFilterContainer.style.alignItems = "center";
  playerFilterContainer.style.gap = "6px";
  playerFilterContainer.style.marginLeft = "auto";
  playerFilterContainer.style.padding = "4px 6px";
  playerFilterContainer.style.background = "rgba(24, 26, 36, 0.85)";
  playerFilterContainer.style.borderRadius = "10px";
  playerFilterContainer.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.05)";

  const playerFilterLabel = document.createElement("span");
  playerFilterLabel.textContent = "Players";
  playerFilterLabel.style.fontSize = "12px";
  playerFilterLabel.style.opacity = "0.75";
  playerFilterLabel.style.paddingLeft = "2px";
  playerFilterContainer.appendChild(playerFilterLabel);

  const playerFilterSelect = document.createElement("select");
  playerFilterSelect.style.background = "rgba(17, 18, 27, 0.95)";
  playerFilterSelect.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  playerFilterSelect.style.color = "#f8fafc";
  playerFilterSelect.style.borderRadius = "8px";
  playerFilterSelect.style.padding = "4px 10px";
  playerFilterSelect.style.fontSize = "12px";
  playerFilterSelect.style.fontWeight = "500";
  playerFilterSelect.style.outline = "none";
  playerFilterSelect.style.cursor = "pointer";
  playerFilterSelect.style.minWidth = "130px";

  const playerFilters: { value: PlayerFilter; label: string }[] = [
    { value: "any", label: "Any players" },
    { value: "few", label: "1 – 3 players" },
    { value: "crowded", label: "4 – 5 players" },
    { value: "full", label: "Full rooms" },
  ];

  for (const option of playerFilters) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    playerFilterSelect.appendChild(opt);
  }

  playerFilterSelect.value = selectedPlayerFilter;
  playerFilterSelect.addEventListener("change", () => {
    selectedPlayerFilter = playerFilterSelect.value as PlayerFilter;
    savedScrollTop = 0;
    renderRooms(currentRooms);
  });

  playerFilterContainer.appendChild(playerFilterSelect);
  filterBar.appendChild(playerFilterContainer);

  let isRefreshing = false;
  const updateRefreshButtonState = () => {
    const enabled = !destroyed && !isRefreshing;
    ui.setButtonEnabled(refreshButton, enabled);
    refreshButton.setAttribute("aria-busy", isRefreshing ? "true" : "false");
  };
  updateRefreshButtonState();

  const handleRoomsChanged = () => {
    applyCategoryButtons(RoomService.getCustomRooms());
    refreshRooms();
  };

  const refreshRooms = async () => {
    if (destroyed) return;
    const definitions = RoomService.getCustomRooms();
    applyCategoryButtons(definitions);

    if (!definitions.length) {
      setLoadingState(false);
      currentRooms = [];
      renderRooms([]);
      statusBar.textContent = "Add a custom room to get started.";
      isRefreshing = false;
      updateRefreshButtonState();
      firstLoad = false;
      return;
    }

    const currentRequest = ++requestCounter;
    isRefreshing = true;
    updateRefreshButtonState();
    setLoadingState(true);
    statusBar.textContent = firstLoad ? "Loading rooms…" : "Refreshing rooms…";

    try {
      const rooms = await RoomService.fetchCustomRoomsStatus();
      if (destroyed || currentRequest !== requestCounter) return;
      renderRooms(rooms);
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      statusBar.textContent = `Last update: ${time}`;
    } catch (error) {
      if (destroyed || currentRequest !== requestCounter) return;
      statusBar.textContent = `Failed to load rooms: ${String((error as Error)?.message || error)}`;
    } finally {
      if (!destroyed && currentRequest === requestCounter) {
        setLoadingState(false);
      }
      if (currentRequest === requestCounter) {
        isRefreshing = false;
      }
      updateRefreshButtonState();
      firstLoad = false;
    }
  };

  refreshButton.addEventListener("click", () => {
    void refreshRooms();
  });

  manageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = RoomService.addCustomRoom({ name: nameInput.value, idRoom: idInput.value });
    if (!result.ok) {
      formFeedback.textContent = result.error;
      formFeedback.style.color = "#fda4af";
      return;
    }

    formFeedback.textContent = `Added room “${result.room.name}”.`;
    formFeedback.style.color = "#86efac";
    nameInput.value = "";
    idInput.value = "";
    nameInput.focus();
    handleRoomsChanged();
  });

  applyCategoryButtons(RoomService.getCustomRooms());
  refreshRooms();

  (view as any).__cleanup__ = () => {
    destroyed = true;
    updateRefreshButtonState();
  };
}

function renderSearchPlayerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  ensureRoomMenuStyles();

  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.padding = "12px";
  root.style.boxSizing = "border-box";
  root.style.height = "100%";
  view.appendChild(root);

  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gap = "12px";
  container.style.width = "100%";
  container.style.maxWidth = "640px";
  container.style.gridTemplateRows = "max-content max-content max-content 1fr";
  container.style.height = "100%";
  root.appendChild(container);

  const heading = document.createElement("div");
  heading.textContent = "Search for a player across all available rooms.";
  heading.style.fontSize = "14px";
  heading.style.opacity = "0.9";
  container.appendChild(heading);

  const description = document.createElement("div");
  description.textContent = "Enter at least three characters to look for matching player names.";
  description.style.fontSize = "12px";
  description.style.opacity = "0.72";
  description.style.lineHeight = "1.45";
  container.appendChild(description);

  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.flexWrap = "wrap";
  form.style.alignItems = "center";
  form.style.gap = "8px";
  container.appendChild(form);

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Player name…";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.style.flex = "1";
  searchInput.style.minWidth = "200px";
  searchInput.style.padding = "10px 12px";
  searchInput.style.borderRadius = "10px";
  searchInput.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  searchInput.style.background = "rgba(17, 18, 27, 0.95)";
  searchInput.style.color = "#f8fafc";
  searchInput.style.fontSize = "13px";
  searchInput.style.fontWeight = "500";
  searchInput.style.outline = "none";
  searchInput.style.boxShadow = "0 6px 16px rgba(15, 23, 42, 0.45)";
  form.appendChild(searchInput);

  const searchButton = ui.btn("Search", { size: "sm", icon: "search", variant: "primary" });
  searchButton.type = "submit";
  searchButton.style.flexShrink = "0";
  searchButton.title = "Search for a player across rooms";
  form.appendChild(searchButton);

  const statusMessage = document.createElement("div");
  statusMessage.style.fontSize = "12px";
  statusMessage.style.opacity = "0.75";
  statusMessage.style.minHeight = "18px";
  statusMessage.textContent = "Enter a player name to search across rooms.";
  container.appendChild(statusMessage);

  const listWrapper = document.createElement("div");
  listWrapper.style.height = "54vh";
  listWrapper.style.maxHeight = "54vh";
  listWrapper.style.overflowY = "auto";
  listWrapper.style.padding = "6px 2px";
  listWrapper.style.borderRadius = "10px";
  listWrapper.style.background = "rgba(12, 13, 20, 0.65)";
  listWrapper.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.04)";
  listWrapper.style.width = "100%";
  listWrapper.style.boxSizing = "border-box";
  listWrapper.style.position = "relative";

  const floatingLoadingIndicator = document.createElement("div");
  floatingLoadingIndicator.style.position = "absolute";
  floatingLoadingIndicator.style.top = "14px";
  floatingLoadingIndicator.style.right = "14px";
  floatingLoadingIndicator.style.width = "28px";
  floatingLoadingIndicator.style.height = "28px";
  floatingLoadingIndicator.style.borderRadius = "999px";
  floatingLoadingIndicator.style.display = "flex";
  floatingLoadingIndicator.style.alignItems = "center";
  floatingLoadingIndicator.style.justifyContent = "center";
  floatingLoadingIndicator.style.background = "rgba(14, 16, 25, 0.9)";
  floatingLoadingIndicator.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  floatingLoadingIndicator.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.45)";
  floatingLoadingIndicator.style.opacity = "0";
  floatingLoadingIndicator.style.visibility = "hidden";
  floatingLoadingIndicator.style.pointerEvents = "none";
  floatingLoadingIndicator.style.transition = "opacity 160ms ease, transform 160ms ease";
  floatingLoadingIndicator.style.zIndex = "3";

  const floatingLoadingSpinner = document.createElement("div");
  floatingLoadingSpinner.style.width = "16px";
  floatingLoadingSpinner.style.height = "16px";
  floatingLoadingSpinner.style.borderRadius = "999px";
  floatingLoadingSpinner.style.border = "2px solid rgba(248, 250, 252, 0.16)";
  floatingLoadingSpinner.style.borderTopColor = "#f8fafc";
  floatingLoadingSpinner.style.animation = "room-menu-spin 1s linear infinite";
  floatingLoadingIndicator.appendChild(floatingLoadingSpinner);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.padding = "4px";
  listWrapper.appendChild(list);
  listWrapper.appendChild(floatingLoadingIndicator);
  container.appendChild(listWrapper);

  const renderEmptyState = (message: string) => {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.textContent = message;
    empty.style.padding = "16px";
    empty.style.textAlign = "center";
    empty.style.opacity = "0.7";
    empty.style.fontSize = "13px";
    list.appendChild(empty);
  };

  renderEmptyState("Search results will appear here.");

  const updateFloatingLoadingIndicator = () => {
    floatingLoadingIndicator.style.transform = `translateY(${listWrapper.scrollTop}px)`;
  };

  let isFloatingIndicatorVisible = false;
  const setLoadingState = (loading: boolean) => {
    if (loading) {
      isFloatingIndicatorVisible = true;
      updateFloatingLoadingIndicator();
      floatingLoadingIndicator.style.visibility = "visible";
      floatingLoadingIndicator.style.opacity = "1";
    } else {
      isFloatingIndicatorVisible = false;
      floatingLoadingIndicator.style.opacity = "0";
      floatingLoadingIndicator.addEventListener(
        "transitionend",
        () => {
          if (!isFloatingIndicatorVisible) {
            floatingLoadingIndicator.style.visibility = "hidden";
          }
        },
        { once: true },
      );
      window.setTimeout(() => {
        if (!isFloatingIndicatorVisible) {
          floatingLoadingIndicator.style.visibility = "hidden";
        }
      }, 220);
    }
  };

  listWrapper.addEventListener("scroll", () => {
    if (isFloatingIndicatorVisible) {
      updateFloatingLoadingIndicator();
    }
  });

  let isLoading = false;
  let destroyed = false;
  let requestCounter = 0;
  let lastQueryLabel = "";

  const updateSearchButtonState = () => {
    const hasQuery = searchInput.value.trim().length >= 3;
    ui.setButtonEnabled(searchButton, hasQuery && !isLoading);
    searchButton.setAttribute("aria-busy", isLoading ? "true" : "false");
  };

  const normalizeSearchText = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return trimmed
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  };

  const createHighlightMatcher = (players: PublicRoomPlayer[]) => {
    const ids = new Set<string>();
    const databaseIds = new Set<string>();
    const names = new Set<string>();

    for (const player of players) {
      if (player.id) ids.add(player.id);
      if (player.databaseUserId) databaseIds.add(player.databaseUserId);
      names.add(normalizeSearchText(player.name));
    }

    return (player: PublicRoomPlayer) => {
      if (player.id && ids.has(player.id)) return true;
      if (player.databaseUserId && databaseIds.has(player.databaseUserId)) return true;
      return names.has(normalizeSearchText(player.name));
    };
  };

  type SearchMatch = { room: PublicRoomStatus; players: PublicRoomPlayer[] };

  const performSearch = async (rawQuery: string) => {
    const trimmedQuery = rawQuery.trim();
    const normalizedQuery = normalizeSearchText(trimmedQuery);

    if (!normalizedQuery) {
      statusMessage.textContent = "Enter a player name to search across rooms.";
      renderEmptyState("Search results will appear here.");
      lastQueryLabel = "";
      return;
    }

    if (trimmedQuery.length < 3) {
      statusMessage.textContent = "Please enter at least three characters.";
      renderEmptyState("Type a longer name to search for players.");
      lastQueryLabel = "";
      return;
    }

    const currentRequest = ++requestCounter;
    isLoading = true;
    updateSearchButtonState();
    setLoadingState(true);
    statusMessage.textContent = "Searching players...";

    try {
      const results = await searchRoomsByPlayerName(trimmedQuery, {
        limitRooms: 200,
        minQueryLength: 3,
      });

      if (destroyed || currentRequest !== requestCounter) return;

      if (!results.length) {
        statusMessage.textContent = `No players found matching "${trimmedQuery}".`;
        renderEmptyState("No rooms contain a player with this name.");
        lastQueryLabel = trimmedQuery;
        return;
      }

      const matches = results
        .map((result) => {
          const baseRoom = transformSupabaseRoom(result.room);
          const matchedPlayers: PublicRoomPlayer[] = result.matchedSlots?.map((slot) => ({
            name: slot.name?.trim() || "Unknown player",
            isConnected: true,
            isHost: false,
            discordAvatarUrl: slot.avatarUrl ?? undefined,
          })) ?? [];

          return {
            room: baseRoom,
            players: matchedPlayers,
          } satisfies SearchMatch;
        })
        .filter((match) => match.players.length > 0);

      if (!matches.length) {
        statusMessage.textContent = `No players found matching "${trimmedQuery}".`;
        renderEmptyState("No rooms contain a player with this name.");
        lastQueryLabel = trimmedQuery;
        return;
      }

      matches.sort((a, b) => {
        const diffPlayers = b.room.players - a.room.players;
        if (diffPlayers !== 0) return diffPlayers;
        if (b.players.length !== a.players.length) {
          return b.players.length - a.players.length;
        }
        return a.room.name.localeCompare(b.room.name);
      });

      const totalPlayers = matches.reduce((sum, match) => sum + match.players.length, 0);
      const roomsLabel = matches.length === 1 ? "room" : "rooms";
      const playersLabel = totalPlayers === 1 ? "player" : "players";
      statusMessage.textContent = `Found ${totalPlayers} ${playersLabel} in ${matches.length} ${roomsLabel}.`;

      list.innerHTML = "";
      let isFirstMatch = true;
      for (const match of matches) {
        const highlightMatcher = createHighlightMatcher(match.players);
        const entry = createRoomEntry(match.room, ui, {
          highlightPlayers: highlightMatcher,
          defaultDetailsOpen: true,
          scrollHighlightedPlayersIntoView: isFirstMatch,
        });
        list.appendChild(entry);
        isFirstMatch = false;
      }

      lastQueryLabel = trimmedQuery;
    } catch (error) {
      if (destroyed || currentRequest !== requestCounter) return;
      const message = (error as Error)?.message || String(error);
      statusMessage.textContent = `Search failed: ${message}`;
      renderEmptyState("Unable to complete the search. Please try again.");
    } finally {
      if (!destroyed && currentRequest === requestCounter) {
        isLoading = false;
        setLoadingState(false);
        updateSearchButtonState();
      }
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void performSearch(searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    updateSearchButtonState();
    const trimmed = searchInput.value.trim();
    if (!trimmed && lastQueryLabel) {
      statusMessage.textContent = "Enter a player name to search across rooms.";
      renderEmptyState("Search results will appear here.");
      lastQueryLabel = "";
    } else if (!isLoading && trimmed.length > 0 && trimmed.length < 3) {
      statusMessage.textContent = "Type at least three characters to start a search.";
    }
  });

  updateSearchButtonState();

  (view as any).__cleanup__ = () => {
    destroyed = true;
  };
}

function getCurrentRoomCode(): string | null {
  const match = /^\/r\/([^/]+)/.exec(location.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

const DISCORD_ROOM_DISPLAY_MAX_LENGTH = 12;

function formatRoomNameForDisplay(room: PublicRoomStatus): string {
  if (room.category === "Discord" && room.name.length > DISCORD_ROOM_DISPLAY_MAX_LENGTH) {
    return `${room.name.slice(0, DISCORD_ROOM_DISPLAY_MAX_LENGTH)}\u2026`;
  }
  return room.name;
}

type GuildPlantBadge = {
  plantId: string;
  predicate: (guildId: string) => boolean;
};

const DISCORD_GUILD_ID_REGEX = /^i-\d{17,19}-[a-z]{2,3}-(\d{17,19})(?:-\d{17,19})?$/i;
const GUILD_PLANT_BADGES: GuildPlantBadge[] = Object.entries(plantCatalog as Record<string, any>)
  .map(([plantId, entry]) => {
    const fn = (entry as any)?.seed?.getCanSpawnInGuild;
    if (typeof fn !== "function") return null;
    return { plantId, predicate: fn as (guildId: string) => boolean };
  })
  .filter((v): v is GuildPlantBadge => Boolean(v));

function extractDiscordGuildId(roomId: string): string | null {
  const match = DISCORD_GUILD_ID_REGEX.exec(roomId);
  if (match) return match[1];

  const parts = roomId.split("-");
  if (parts.length >= 4 && /^i$/i.test(parts[0])) {
    return parts[3] || null;
  }
  return null;
}

function getGuildPlantBadgesForRoom(roomId: string): string[] {
  const guildId = extractDiscordGuildId(roomId);
  if (!guildId || !GUILD_PLANT_BADGES.length) return [];
  const badges: string[] = [];
  for (const entry of GUILD_PLANT_BADGES) {
    try {
      if (entry.predicate(guildId)) badges.push(entry.plantId);
    } catch {}
  }
  return badges;
}

function createRoomEntry(
  room: PublicRoomStatus,
  ui: Menu,
  options?: {
    onRemove?: () => void;
    highlightPlayers?: (player: PublicRoomPlayer) => boolean;
    defaultDetailsOpen?: boolean;
    scrollHighlightedPlayersIntoView?: boolean;
  },
): HTMLElement {
  const isDiscord = RoomService.isDiscordActivity();
  const currentRoomCode = getCurrentRoomCode();
  const isCurrentRoom = currentRoomCode === room.idRoom;
  const playerDetails = Array.isArray(room.playerDetails) ? room.playerDetails : [];
  const plantBadges =
    room.category === "Discord"
      ? getGuildPlantBadgesForRoom(room.idRoom || room.name)
      : [];

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "8px";
  wrapper.style.padding = "14px 16px";
  wrapper.style.borderRadius = "14px";
  wrapper.style.background = "linear-gradient(135deg, rgba(30, 33, 46, 0.95), rgba(18, 19, 28, 0.95))";
  wrapper.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.35)";
  wrapper.style.position = "relative";

  const detailsContainer = document.createElement("div");
  detailsContainer.style.overflow = "hidden";
  detailsContainer.style.maxHeight = "0";
  detailsContainer.style.opacity = "0";
  detailsContainer.style.transition = "max-height 0.25s ease, opacity 0.2s ease, margin-top 0.2s ease";
  detailsContainer.style.marginTop = "0";

  const detailsContent = document.createElement("div");
  detailsContent.style.display = "grid";
  detailsContent.style.gap = "10px";
  detailsContent.style.paddingTop = "12px";
  detailsContent.style.paddingLeft = "6px";
  detailsContent.style.paddingRight = "6px";
  detailsContent.style.paddingBottom = "4px";
  detailsContent.style.borderTop = "1px solid rgba(148, 163, 184, 0.16)";
  detailsContainer.appendChild(detailsContent);

  const detailsTitle = document.createElement("div");
  detailsTitle.textContent = "Players";
  detailsTitle.style.fontSize = "13px";
  detailsTitle.style.fontWeight = "600";
  detailsTitle.style.letterSpacing = "0.02em";
  detailsTitle.style.color = "#e2e8f0";
  detailsContent.appendChild(detailsTitle);

  const highlightedPlayerElements: HTMLElement[] = [];

  if (playerDetails.length) {
    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0";
    list.style.display = "grid";
    list.style.gap = "10px";
    list.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";

    for (const player of playerDetails) {
      const item = document.createElement("li");
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "12px";
      item.style.padding = "6px 0";

      const avatarWrapper = document.createElement("div");
      avatarWrapper.style.width = "36px";
      avatarWrapper.style.height = "36px";
      avatarWrapper.style.borderRadius = "999px";
      avatarWrapper.style.overflow = "hidden";
      avatarWrapper.style.flexShrink = "0";
      avatarWrapper.style.display = "grid";
      avatarWrapper.style.placeItems = "center";
      avatarWrapper.style.border = "1px solid rgba(148, 163, 184, 0.25)";
      avatarWrapper.style.background =
        "linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(14, 165, 233, 0.2))";

      if (player.discordAvatarUrl) {
        const img = document.createElement("img");
        img.src = player.discordAvatarUrl;
        img.alt = `${player.name}'s avatar`;
        img.loading = "lazy";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        avatarWrapper.appendChild(img);
      } else {
        const initials = document.createElement("span");
        initials.textContent = player.name.charAt(0)?.toUpperCase() || "?";
        initials.style.fontWeight = "600";
        initials.style.fontSize = "14px";
        initials.style.color = "#e2e8f0";
        avatarWrapper.appendChild(initials);
      }

      const playerInfo = document.createElement("div");
      playerInfo.style.display = "grid";
      playerInfo.style.gap = "4px";

      const nameRow = document.createElement("div");
      nameRow.style.display = "flex";
      nameRow.style.alignItems = "center";
      nameRow.style.gap = "8px";

      const playerName = document.createElement("div");
      playerName.textContent = player.name;
      playerName.style.fontWeight = "600";
      playerName.style.fontSize = "14px";
      playerName.style.color = "#f8fafc";
      nameRow.appendChild(playerName);

      const statusRow = document.createElement("div");
      statusRow.style.display = "flex";
      statusRow.style.alignItems = "center";
      statusRow.style.gap = "10px";
      statusRow.style.fontSize = "11px";
      statusRow.style.color = "rgba(226, 232, 240, 0.75)";

      const presence = document.createElement("span");
      presence.style.display = "inline-flex";
      presence.style.alignItems = "center";
      presence.style.gap = "6px";

      const presenceDot = document.createElement("span");
      presenceDot.style.width = "8px";
      presenceDot.style.height = "8px";
      presenceDot.style.borderRadius = "999px";
      presenceDot.style.background = player.isConnected ? "#34d399" : "#f97316";
      presence.appendChild(presenceDot);
      presence.append(player.isConnected ? "Online" : "Offline");

      statusRow.appendChild(presence);

      playerInfo.append(nameRow, statusRow);
      item.append(avatarWrapper, playerInfo);

      if (options?.highlightPlayers?.(player)) {
        item.style.background = "rgba(34, 197, 94, 0.12)";
        item.style.borderRadius = "12px";
        item.style.padding = "10px";
        item.style.margin = "-2px";
        item.style.boxShadow = "inset 0 0 0 1px rgba(34, 197, 94, 0.35)";
        avatarWrapper.style.border = "1px solid rgba(74, 222, 128, 0.65)";
        playerName.style.color = "#bbf7d0";
        statusRow.style.color = "rgba(190, 242, 100, 0.85)";
        presenceDot.style.background = "#4ade80";
        item.dataset.highlightedPlayer = "true";
        highlightedPlayerElements.push(item);
      }

      list.appendChild(item);
    }

    detailsContent.appendChild(list);
  } else {
    const emptyState = document.createElement("div");
    emptyState.textContent = room.error
      ? "Player details unavailable."
      : "No player details available.";
    emptyState.style.fontSize = "12px";
    emptyState.style.color = "rgba(226, 232, 240, 0.7)";
    detailsContent.appendChild(emptyState);
  }

  const accentColor = (() => {
    if (room.error) return "rgba(248, 180, 127, 0.9)";
    if (room.isFull) return "rgba(248, 113, 113, 0.85)";
    if (room.players <= 5) return "rgba(74, 222, 128, 0.75)";
    return "rgba(96, 165, 250, 0.45)";
  })();

  wrapper.style.setProperty("--accent-color", accentColor);
  wrapper.style.outline = "2px solid transparent";
  wrapper.style.outlineOffset = "0";
  wrapper.style.border = "1px solid rgba(255, 255, 255, 0.05)";
  wrapper.style.boxShadow =
    "0 10px 20px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 0 2px var(--accent-color)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexWrap = "wrap";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";

  const nameBlock = document.createElement("div");
  nameBlock.style.display = "grid";
  nameBlock.style.gap = "6px";

  const nameRow = document.createElement("div");
  nameRow.style.display = "flex";
  nameRow.style.alignItems = "center";
  nameRow.style.gap = "10px";

  const name = document.createElement("div");
  name.textContent = formatRoomNameForDisplay(room);
  name.title = room.name;
  name.style.fontWeight = "600";
  name.style.fontSize = "16px";
  name.style.letterSpacing = "0.01em";
  name.style.color = "#f8fafc";

  const categoryPill = document.createElement("span");
  categoryPill.textContent = room.category;
  categoryPill.style.fontSize = "11px";
  categoryPill.style.letterSpacing = "0.08em";
  categoryPill.style.textTransform = "uppercase";
  categoryPill.style.padding = "4px 8px";
  categoryPill.style.borderRadius = "999px";
  categoryPill.style.background = "rgba(148, 163, 184, 0.12)";
  categoryPill.style.border = "1px solid rgba(148, 163, 184, 0.22)";
  categoryPill.style.color = "#cbd5f5";

  nameRow.append(name, categoryPill);
  nameBlock.appendChild(nameRow);

  if (room.currentGame && room.currentGame.toLowerCase() !== "quinoa") {
    const gameLabel = document.createElement("div");
    gameLabel.textContent = room.currentGame;
    gameLabel.style.fontSize = "12px";
    gameLabel.style.opacity = "0.7";
    gameLabel.style.color = "#e0f2fe";
    nameBlock.appendChild(gameLabel);
  }

  const occupancyBlock = document.createElement("div");
  occupancyBlock.style.display = "grid";
  occupancyBlock.style.gap = "6px";
  occupancyBlock.style.minWidth = "120px";

  const meter = document.createElement("div");
  meter.style.position = "relative";
  meter.style.height = "20px";
  meter.style.borderRadius = "999px";
  meter.style.background = "rgba(255, 255, 255, 0.08)";
  meter.style.overflow = "hidden";
  meter.style.display = "flex";
  meter.style.alignItems = "center";
  meter.style.justifyContent = "center";
  meter.style.fontWeight = "600";
  meter.style.fontSize = "12px";
  meter.style.color = "#f8fafc";
  meter.style.fontVariantNumeric = "tabular-nums";
  meter.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.55)";

  const meterFill = document.createElement("div");
  meterFill.style.position = "absolute";
  meterFill.style.left = "0";
  meterFill.style.top = "0";
  meterFill.style.bottom = "0";
  meterFill.style.height = "100%";
  meterFill.style.width = `${Math.min(100, (room.players / room.capacity) * 100)}%`;
  meterFill.style.background = room.isFull
    ? "linear-gradient(90deg, #ef4444, #f87171)"
    : "linear-gradient(90deg, #34d399, #2dd4bf)";
  meterFill.style.borderRadius = "inherit";
  meter.appendChild(meterFill);

  const meterLabel = document.createElement("span");
  meterLabel.textContent = `${room.players} / ${room.capacity} players`;
  meterLabel.style.position = "relative";
  meterLabel.style.zIndex = "1";
  meter.appendChild(meterLabel);
  occupancyBlock.appendChild(meter);

  const actionBlock = document.createElement("div");
  actionBlock.style.display = "grid";
  actionBlock.style.justifyItems = "end";
  actionBlock.style.gap = "6px";

  const chevron = document.createElement("span");
  chevron.textContent = "▾";
  chevron.style.display = "inline-block";
  chevron.style.transition = "transform 0.2s ease";
  chevron.style.transform = "rotate(-90deg)";

  const detailsBtn = ui.btn("Details", { size: "sm", variant: "ghost", icon: chevron });
  detailsBtn.style.minWidth = "86px";
  detailsBtn.style.justifyContent = "center";
  detailsBtn.title = playerDetails.length
    ? "Show the players currently in this room."
    : room.error
    ? "Player details unavailable."
    : "No player details available.";
  actionBlock.appendChild(detailsBtn);

  const joinBtn = ui.btn("Join", { size: "sm", variant: "primary" });
  joinBtn.style.minWidth = "86px";
  joinBtn.style.boxShadow = "0 4px 10px rgba(56, 189, 248, 0.35)";
  actionBlock.appendChild(joinBtn);

  if (options?.onRemove) {
    const removeBtn = ui.btn("Remove", { size: "sm", variant: "danger" });
    removeBtn.style.minWidth = "86px";
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onRemove?.();
    });
    removeBtn.title = `Remove ${room.name} from custom rooms`;
    actionBlock.appendChild(removeBtn);
  }

  const reasons: string[] = [];
  if (room.error) reasons.push("Status unavailable");
  if (room.isFull) reasons.push("Room is full");
  if (isDiscord) reasons.push("Join is blocked on Discord");
  if (isCurrentRoom) reasons.push("Already in this room");

  const canJoin = !isCurrentRoom && RoomService.canJoinPublicRoom(room);
  ui.setButtonEnabled(joinBtn, canJoin);
  joinBtn.title = canJoin ? `Join ${room.name}` : reasons.join(" · ");

  joinBtn.addEventListener("click", () => {
    if (isCurrentRoom) return;
    if (!RoomService.canJoinPublicRoom(room)) return;
    RoomService.joinPublicRoom(room);
  });

  const labelSpan = detailsBtn.querySelector<HTMLSpanElement>(".label");
  let detailsExpanded = options?.defaultDetailsOpen ?? false;
  const applyDetailsState = () => {
    if (detailsExpanded) {
      const targetHeight = `${detailsContent.scrollHeight}px`;
      detailsContainer.style.maxHeight = targetHeight;
      detailsContainer.style.opacity = "1";
      detailsContainer.style.marginTop = "8px";
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
  });

  header.append(nameBlock, occupancyBlock, actionBlock);
  wrapper.appendChild(header);

  const badgeRow = document.createElement("div");
  badgeRow.style.display = "flex";
  badgeRow.style.flexWrap = "wrap";
  badgeRow.style.gap = "6px";

  const addBadge = (label: string, color: string, background: string) => {
    const badge = document.createElement("span");
    badge.textContent = label;
    badge.style.fontSize = "11px";
    badge.style.padding = "4px 8px";
    badge.style.borderRadius = "999px";
    badge.style.fontWeight = "600";
    badge.style.letterSpacing = "0.04em";
    badge.style.textTransform = "uppercase";
    badge.style.color = color;
    badge.style.background = background;
    badge.style.border = `1px solid ${color}33`;
    badgeRow.appendChild(badge);
  };

  if (isCurrentRoom) {
    addBadge("Current room", "#86efac", "rgba(34, 197, 94, 0.12)");
  }

  if (room.error) {
    addBadge("Status unavailable", "#fbbf24", "rgba(250, 204, 21, 0.1)");
  }

  if (isDiscord) {
    addBadge("Discord activity", "#facc15", "rgba(251, 191, 36, 0.12)");
  }

  if (room.category === "Discord" && plantBadges.length) {
    for (const badge of plantBadges) {
      addBadge(badge, "#93c5fd", "rgba(147, 197, 253, 0.14)");
    }
  }

  if (badgeRow.childElementCount > 0) {
    wrapper.appendChild(badgeRow);
  }

  wrapper.appendChild(detailsContainer);
  applyDetailsState();

  if (detailsExpanded || options?.scrollHighlightedPlayersIntoView) {
    window.requestAnimationFrame(() => {
      if (!detailsExpanded) return;
      applyDetailsState();

      if (options?.scrollHighlightedPlayersIntoView && highlightedPlayerElements.length) {
        const target = highlightedPlayerElements[0];
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      }
    });
  }

  return wrapper;
}

/* ---------------- Lecture/state ---------------- */

async function readPlayers(): Promise<Player[]> { return PlayersService.list(); }

const NF_US_INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function truncateLabel(s: string, max = 22) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

const vItem = (p: Player): VTabItem => ({
  id: p.id,
  title: truncateLabel(p.name || p.id, 9),
  subtitle: p.isConnected ? "Online" : "Offline",
  avatarUrl: p.discordAvatarUrl || "",
  statusColor: p.isConnected ? "#48d170" : "#999a",
});

/* ---------------- Menu ---------------- */

async function renderPlayersTab(root: HTMLElement) {
  const ui = new Menu({ id: "players", compact: true, windowSelector: ".qws-win"});
  ui.mount(root);

  const panel = ui.root.querySelector(".qmm-views") as HTMLElement;

  const { root: split, left, right } = ui.split2("260px");
  panel.appendChild(split);

  // left/right: layout flex & overflow corrects
  split.style.height = "100%";
  split.style.minHeight = "0";

  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.minHeight = "0"; // cl├® pour autoriser le overflow interne

  right.style.minHeight = "0";
  right.style.overflow = "auto";

  const vt = ui.vtabs({
    filterPlaceholder: "Find player…",
    onSelect: (_id, item) => renderRight(item?.id || null),
    fillAvailableHeight: true,
  });

  // vtabs en colonne, occupe tout l'espace du panneau gauche
  vt.root.style.display = "flex";
  vt.root.style.flexDirection = "column";
  vt.root.style.flex = "1 1 auto";
  vt.root.style.minHeight = "0";

  left.appendChild(vt.root);

  // --- petites retouches de la barre de filtre (input + ic├┤ne)
  const filter = vt.root.querySelector(".filter") as HTMLElement | null;
  if (filter) {
    filter.remove();
  }

  async function renderRight(playerId: string | null) {
    right.innerHTML = "";
    const p = playerId ? players.find(x => x.id === playerId) || null : null;
    if (!p) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.textContent = "Select a player on the left.";
      right.appendChild(empty);
      return;
    }

    // Conteneur (grid) pour empiler les sections
    const col = document.createElement("div");
    col.style.display = "grid";
    col.style.gridAutoRows = "min-content";
    col.style.justifyItems = "center";
    col.style.gap = "10px";
    col.style.overflow = "auto";
    right.appendChild(col);

    // ===== Profile =====
    const prof = document.createElement("div");
    prof.style.display = "grid";
    prof.style.gap = "8px";
    prof.style.justifyItems = "center";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "12px";

    const avatar = document.createElement("img");
    avatar.src = p.discordAvatarUrl || "";
    avatar.alt = p.name;
    avatar.width = 48; avatar.height = 48;
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";
    avatar.style.border = "1px solid #4446";

    const title = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.textContent = p.name || p.id;
    nameEl.style.fontWeight = "600";
    nameEl.style.fontSize = "16px";
    const sub = document.createElement("div");
    sub.style.opacity = "0.8";
    sub.style.fontSize = "12px";
    sub.textContent = p.isConnected ? "Online" : "Offline";
    title.append(nameEl, sub);

    head.append(avatar, title);

    const info = document.createElement("div");
    info.style.opacity = "0.9";

    prof.append(head, info);
    col.appendChild(prof);

         // ===== Informations =====
    const infoWrap = document.createElement("div");
    infoWrap.style.display = "grid";
    infoWrap.style.gap = "6px";
    infoWrap.style.justifySelf = "stretch";
    infoWrap.style.width = "100%";

    // lignes align├®es ├á gauche
    const invValueRow = ui.flexRow({ justify: "start", fullWidth: true, gap: 6 });
    const invLabel = document.createElement("div");
    invLabel.textContent = "Inventory: ";
    invLabel.style.fontSize = "14px";
    invLabel.style.opacity = "0.85";
    const invValue = document.createElement("div");
    invValue.textContent = "…";
    invValue.style.fontSize = "15px";
    invValue.style.fontWeight = "700";
    invValue.style.color = "#FFD84D";
    invValueRow.append(invLabel, invValue);

    const gardenValueRow = ui.flexRow({ justify: "start", fullWidth: true, gap: 6 });
    const gardenLabel = document.createElement("div");
    gardenLabel.textContent = "Garden: ";
    gardenLabel.style.fontSize = "14px";
    gardenLabel.style.opacity = "0.85";
    const gardenValue = document.createElement("div");
    gardenValue.textContent = "…";
    gardenValue.style.fontWeight = "700";
    gardenValue.style.fontSize = "15px";
    gardenValue.style.color = "#FFD84D";
    gardenValueRow.append(gardenLabel, gardenValue);

    // injecte dans la section
    infoWrap.append(invValueRow, gardenValueRow);
    const infoCard = ui.card("🌱 Crops values", { tone: "muted", align: "center" });
    infoCard.body.append(infoWrap);
    col.appendChild(infoCard.root);

    // ===== Editor =====
    const editorCard = ui.card("✏️ Editor", { tone: "muted", align: "center" });
    editorCard.body.style.display = "grid";
    editorCard.body.style.gap = "8px";

    const savePlayerBtn = ui.btn("Save player garden", {
      fullWidth: true,
      onClick: async () => {
        try {
          const saveFn =
            (window as any).qwsEditorSaveGardenForPlayer ||
            (pageWindow as any)?.qwsEditorSaveGardenForPlayer;
          if (typeof saveFn !== "function") {
            await toastSimple("Save garden", "Editor save unavailable", "error");
            return;
          }
          const name = `${p.name || p.id || "Player"}'s garden`;
          const saved = await saveFn(p.id, name);
          if (!saved) {
            await toastSimple("Save garden", "Save failed (no garden state)", "error");
            return;
          }
          await toastSimple(`Saved "${saved.name}".`, "success");
        } catch {
          await toastSimple(`Save failed`, "error");
        }
      },
    });

    editorCard.body.append(savePlayerBtn);
    col.appendChild(editorCard.root);

    // ===== Teleport =====
    const teleRow = ui.flexRow({ justify: "center" });
    const btnToPlayer = ui.btn("To player", { size: "sm" });
    btnToPlayer.style.minWidth = "120px";
    const btnToGarden = ui.btn("To garden", { size: "sm" });
    btnToGarden.style.minWidth = "120px";

    btnToPlayer.onclick = async () => {
      try {
        const fn = (PlayersService as any).teleportToPlayer ?? (PlayersService as any).teleportTo;
        await fn.call(PlayersService, p.id);
      } catch (e: any) {
        await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
      }
    };
    btnToGarden.onclick = async () => {
      try {
        const fn = (PlayersService as any).teleportToGarden ?? (PlayersService as any).tptogarden;
        await fn.call(PlayersService, p.id);
      } catch (e: any) {
        await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
      }
    };

    teleRow.append(btnToPlayer, btnToGarden);
    const teleportCard = ui.card("🌌 Teleport", { tone: "muted", align: "center" });
    teleportCard.body.append(teleRow);
    col.appendChild(teleportCard.root);

    // ===== Inspect (ex-Inventory) =====
    const invRow = ui.flexRow({ justify: "center" });
    const btnInv = ui.btn("Inventory", { size: "sm" });
    btnInv.style.minWidth = "120px";
    const btnJournal = ui.btn("Journal", { size: "sm" });
    btnJournal.style.minWidth = "120px";
    const btnStats = ui.btn("Stats", { size: "sm" });
    btnStats.style.minWidth = "120px";
    const btnActivityLog = ui.btn("Activity log", { size: "sm" });
    btnActivityLog.style.minWidth = "120px";

    // Conserve la logique existante pour ouvrir l’aperçu d’inventaire
    btnInv.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openInventoryPreview(p.id, p.name);
        if (await isInventoryPanelOpen()) {
          await waitInventoryPanelClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    btnJournal.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openJournalLog(p.id, p.name);
        if (await isJournalModalOpen()) {
          await waitJournalModalClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    btnStats.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openStatsModal(p.id, p.name);
        if (await isStatsModalOpenAsync()) {
          await waitStatsModalClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    btnActivityLog.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openActivityLogModal(p.id, p.name);
        if (await isActivityLogModalOpenAsync()) {
          await waitActivityLogModalClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    const inspectGrid = document.createElement("div");
    inspectGrid.style.display = "grid";
    inspectGrid.style.gap = "6px";

    const activityRow = ui.flexRow({ justify: "center" });

    invRow.append(btnInv, btnJournal);
    activityRow.append(btnStats, btnActivityLog);

    inspectGrid.append(invRow, activityRow);
    const inspectCard = ui.card("🔍 Inspect", { tone: "muted", align: "center" });
    inspectCard.body.append(inspectGrid);
    col.appendChild(inspectCard.root);

    // ===== Fun =====
    const funWrap = document.createElement("div");
    funWrap.style.display = "grid";
    funWrap.style.gap = "10px";

    const followRow = ui.flexRow({ justify: "center" });
    followRow.style.gap = "16px";

    const playerFollowGroup = document.createElement("div");
    playerFollowGroup.style.display = "flex";
    playerFollowGroup.style.alignItems = "center";
    playerFollowGroup.style.gap = "8px";

    const label = document.createElement("div");
    label.textContent = "Follow player";
    label.style.fontSize = "14px";
    label.style.opacity = "0.85";
    const sw = ui.switch(PlayersService.isFollowing(p.id));
    (sw as HTMLInputElement).addEventListener("change", async () => {
      try {
        if ((sw as HTMLInputElement).checked) {
          await PlayersService.startFollowing(p.id);
          await toastSimple("Follow", "Enabled.", "success");
        } else {
          PlayersService.stopFollowing();
          await toastSimple("Follow", "Disable.", "info");
        }
      } catch (e: any) {
        await toastSimple("Follow", e?.message || "Error", "error");
        (sw as HTMLInputElement).checked = !(sw as HTMLInputElement).checked;
      }
    });
    playerFollowGroup.append(label, sw as HTMLElement);

    const petFollowGroup = document.createElement("div");
    petFollowGroup.style.display = "flex";
    petFollowGroup.style.alignItems = "center";
    petFollowGroup.style.gap = "4px";

    const petsLabel = document.createElement("div");
    petsLabel.textContent = "Pet follow";
    petsLabel.style.fontSize = "14px";
    petsLabel.style.opacity = "0.85";
    const petsSwitch = ui.switch(PlayersService.isPetFollowing(p.id));
    (petsSwitch as HTMLInputElement).addEventListener("change", async () => {
      try {
        if ((petsSwitch as HTMLInputElement).checked) {
          await PlayersService.startPetFollowing(p.id);
        } else {
          await PlayersService.stopPetFollowing();
        }
      } catch (e: any) {
        await toastSimple("Pet follow", e?.message || "Error", "error");
        (petsSwitch as HTMLInputElement).checked = !(petsSwitch as HTMLInputElement).checked;
      }
    });
    petFollowGroup.append(petsLabel, petsSwitch as HTMLElement);

    followRow.append(playerFollowGroup, petFollowGroup);

    funWrap.append(followRow);
    const funCard = ui.card("🎉 Fun", { tone: "muted", align: "center" });
    funCard.body.append(funWrap);
    col.appendChild(funCard.root);

    // Remplissage asynchrone depuis le service
    (async () => {
      try {
        const total = await PlayersService.getInventoryValue(p.id);
        invValue.textContent = `${NF_US_INT.format(Math.round(total))}`;
        invValue.title = "Total inventory value";
      } catch {
        invValue.textContent = "—";
      }
      try {
        const total = await PlayersService.getGardenValue(p.id);
        gardenValue.textContent = `${NF_US_INT.format(Math.round(total))}`;
        gardenValue.title = "Total garden value";
      } catch {
        gardenValue.textContent = "—";
      }
    })();
  }
  

  let players: Player[] = [];

  /** ------- DIFF MINIMAL (inclut gardenPosition) ------- **/
  let lastSig = "";
  function signature(ps: Player[]) {
    return ps.map(p =>
      `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}|${p.inventory?.items?.length ?? 0}`
    ).join(";");
  }

  async function refreshAll(keepSelection = true) {
    const prevSel = vt.getSelected()?.id ?? null;

    const next = await readPlayers();
    const sig = signature(next);
    if (sig === lastSig) {
      return;
    }
    lastSig = sig;

    players = next;
    vt.setItems(players.map(vItem));

    const sel = (keepSelection && prevSel && players.some(p => p.id === prevSel))
      ? prevSel
      : (players[0]?.id ?? null);
    if (sel !== null) vt.select(sel); else renderRight(null);
  }
  /** ----- FIN DIFF MINIMAL ----- **/

  await PlayersService.onChange(() => { refreshAll(true).catch(() => {}); });

  await refreshAll(true);
}


