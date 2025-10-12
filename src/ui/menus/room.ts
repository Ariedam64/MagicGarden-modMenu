// src/ui/menus/room.ts
// Affichage des rooms publiques avec rafraîchissement périodique.

import { Menu } from "../menu";
import { RoomService, type PublicRoomDefinition, type PublicRoomStatus } from "../../services/room";

const REFRESH_INTERVAL_MS = 10_000;
const TAB_ID = "public-rooms";
const CUSTOM_TAB_ID = "custom-rooms";
type PlayerFilter = "any" | "empty" | "few" | "crowded" | "full";

export async function renderRoomMenu(root: HTMLElement) {
  const ui = new Menu({ id: "room", compact: true, windowSelector: ".qws-win" });
  ui.addTab(TAB_ID, "🌐 Public Rooms", (view) => renderPublicRoomsTab(view, ui));
  ui.addTab(CUSTOM_TAB_ID, "⭐ Custom Rooms", (view) => renderCustomRoomsTab(view, ui));
  ui.mount(root);
}

function renderPublicRoomsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

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
  container.appendChild(heading);

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
  listWrapper.style.height = "54vh";
  listWrapper.style.maxHeight = "54vh";
  listWrapper.style.overflowY = "auto";
  listWrapper.style.padding = "6px 2px";
  listWrapper.style.borderRadius = "10px";
  listWrapper.style.background = "rgba(12, 13, 20, 0.65)";
  listWrapper.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.04)";
  listWrapper.style.width = "100%";
  listWrapper.style.boxSizing = "border-box";

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.padding = "4px";
  listWrapper.appendChild(list);
  container.appendChild(listWrapper);

  const statusBar = document.createElement("div");
  statusBar.style.fontSize = "12px";
  statusBar.style.opacity = "0.75";
  statusBar.textContent = "Loading rooms…";
  container.appendChild(statusBar);

  let savedScrollTop = 0;
  listWrapper.addEventListener("scroll", () => {
    savedScrollTop = listWrapper.scrollTop;
  });

  let destroyed = false;
  let refreshTimer: number | null = null;
  let requestCounter = 0;
  let firstLoad = true;

  let selectedCategory: string | null = null;
  let selectedPlayerFilter: PlayerFilter = "any";
  let currentRooms: PublicRoomStatus[] = [];

  const filterButtons = new Map<string | null, HTMLButtonElement>();
  let lastRenderedCategories: string[] = [];

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

  const matchesPlayerFilter = (room: PublicRoomStatus) => {
    switch (selectedPlayerFilter) {
      case "any":
        return true;
      case "empty":
        return room.players === 0;
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

  const setCategoryFilter = (category: string | null) => {
    if (selectedCategory === category) return;
    selectedCategory = category;
    savedScrollTop = 0;
    updateFilterButtonStyles();
    renderRooms(currentRooms);
  };

  function createFilterButton(label: string, category: string | null): HTMLButtonElement {
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
    return button;
  }

  function collectCategories(rooms?: Array<{ category: string }>): string[] {
    if (!rooms) return [];
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const room of rooms) {
      if (!room || typeof room.category !== "string") continue;
      const category = room.category.trim();
      if (!category || seen.has(category)) continue;
      seen.add(category);
      categories.push(category);
    }
    return categories;
  }

  function sortCategories(categories: string[]): string[] {
    if (!categories.length) return [];
    const preferred = RoomService.getPublicRoomsCategoryOrder();
    if (!preferred.length) {
      return [...categories];
    }

    const available = new Set(categories);
    const ordered: string[] = [];
    const used = new Set<string>();

    for (const name of preferred) {
      if (available.has(name) && !used.has(name)) {
        ordered.push(name);
        used.add(name);
      }
    }

    for (const name of categories) {
      if (!used.has(name)) {
        ordered.push(name);
        used.add(name);
      }
    }

    return ordered;
  }

  function updateCategoryButtons(rooms?: PublicRoomStatus[]): void {
    const categoriesFromRooms = collectCategories(rooms);
    const sourceCategories = categoriesFromRooms.length
      ? categoriesFromRooms
      : collectCategories(RoomService.getPublicRooms());
    const sortedCategories = sortCategories(sourceCategories);

    const changed =
      filterButtons.size === 0 ||
      sortedCategories.length !== lastRenderedCategories.length ||
      sortedCategories.some((category, index) => category !== lastRenderedCategories[index]);

    if (changed) {
      if (selectedCategory && !sortedCategories.includes(selectedCategory)) {
        selectedCategory = null;
        savedScrollTop = 0;
      }

      categoryButtonContainer.innerHTML = "";
      filterButtons.clear();

      const allButton = createFilterButton("All", null);
      filterButtons.set(null, allButton);
      categoryButtonContainer.appendChild(allButton);

      for (const category of sortedCategories) {
        const button = createFilterButton(category, category);
        filterButtons.set(category, button);
        categoryButtonContainer.appendChild(button);
      }

      lastRenderedCategories = [...sortedCategories];
    }

    updateFilterButtonStyles();
  }

  updateCategoryButtons();

  const renderRooms = (rooms: PublicRoomStatus[]) => {
    currentRooms = rooms;
    updateCategoryButtons(rooms);
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
    { value: "empty", label: "Empty rooms" },
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

  const refreshRooms = async () => {
    if (destroyed) return;
    const currentRequest = ++requestCounter;
    statusBar.textContent = firstLoad ? "Loading rooms…" : "Refreshing rooms…";

    try {
      const rooms = await RoomService.fetchPublicRoomsStatus();
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
      firstLoad = false;
      if (!destroyed) {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshRooms, REFRESH_INTERVAL_MS);
      }
    }
  };

  refreshRooms();

  (view as any).__cleanup__ = () => {
    destroyed = true;
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}

function renderCustomRoomsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

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

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.padding = "4px";
  listWrapper.appendChild(list);
  container.appendChild(listWrapper);

  const statusBar = document.createElement("div");
  statusBar.style.fontSize = "12px";
  statusBar.style.opacity = "0.75";
  statusBar.textContent = "Add a custom room to get started.";
  container.appendChild(statusBar);

  let savedScrollTop = 0;
  listWrapper.addEventListener("scroll", () => {
    savedScrollTop = listWrapper.scrollTop;
  });

  let destroyed = false;
  let refreshTimer: number | null = null;
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
      case "empty":
        return room.players === 0;
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
    { value: "empty", label: "Empty rooms" },
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

  const handleRoomsChanged = () => {
    applyCategoryButtons(RoomService.getCustomRooms());
    refreshRooms();
  };

  const refreshRooms = async () => {
    if (destroyed) return;
    const definitions = RoomService.getCustomRooms();
    applyCategoryButtons(definitions);

    if (!definitions.length) {
      currentRooms = [];
      renderRooms([]);
      statusBar.textContent = "Add a custom room to get started.";
      firstLoad = false;
      if (!destroyed) {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshRooms, REFRESH_INTERVAL_MS);
      }
      return;
    }

    const currentRequest = ++requestCounter;
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
      firstLoad = false;
      if (!destroyed) {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshRooms, REFRESH_INTERVAL_MS);
      }
    }
  };

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
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
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

function createRoomEntry(
  room: PublicRoomStatus,
  ui: Menu,
  options?: {
    onRemove?: () => void;
  },
): HTMLElement {
  const isDiscord = RoomService.isDiscordActivity();
  const currentRoomCode = getCurrentRoomCode();
  const isCurrentRoom = currentRoomCode === room.idRoom;

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "8px";
  wrapper.style.padding = "14px 16px";
  wrapper.style.borderRadius = "14px";
  wrapper.style.background = "linear-gradient(135deg, rgba(30, 33, 46, 0.95), rgba(18, 19, 28, 0.95))";
  wrapper.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.35)";
  wrapper.style.position = "relative";

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
  name.textContent = room.name;
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

  if (badgeRow.childElementCount > 0) {
    wrapper.appendChild(badgeRow);
  }

  return wrapper;
}
