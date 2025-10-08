// src/ui/menus/tools.ts
import { Menu } from "../menu";
import { toastSimple } from "../toast";
import { ToolsService, type ExternalTool } from "../../services/tools";

function createTagPill(label: string): HTMLElement {
  const pill = document.createElement("span");
  pill.textContent = label;
  pill.style.display = "inline-flex";
  pill.style.alignItems = "center";
  pill.style.justifyContent = "center";
  pill.style.padding = "2px 8px";
  pill.style.borderRadius = "999px";
  pill.style.background = "#ffffff11";
  pill.style.border = "1px solid #ffffff22";
  pill.style.fontSize = "11px";
  pill.style.letterSpacing = "0.02em";
  pill.style.textTransform = "uppercase";
  pill.style.opacity = "0.8";
  return pill;
}

function renderToolCard(ui: Menu, tool: ExternalTool): HTMLElement {
  const title = `${tool.icon ? `${tool.icon} ` : ""}${tool.title}`;
  const card = ui.card(title, { tone: "muted", align: "stretch" });
  card.root.style.width = "100%";

  const body = card.body;
  body.style.display = "grid";
  body.style.gap = "10px";
  body.style.justifyItems = "stretch";

  const description = document.createElement("p");
  description.textContent = tool.description;
  description.style.margin = "0";
  description.style.fontSize = "13px";
  description.style.lineHeight = "1.45";
  description.style.opacity = "0.9";
  description.style.textAlign = "left";
  body.appendChild(description);

  if (tool.tags?.length) {
    const tags = document.createElement("div");
    tags.style.display = "flex";
    tags.style.flexWrap = "wrap";
    tags.style.gap = "6px";
    tags.style.opacity = "0.85";
    tool.tags.forEach(tag => tags.appendChild(createTagPill(tag)));
    body.appendChild(tags);
  }

  const actions = ui.flexRow({ gap: 8, justify: "end", fullWidth: true });
  actions.style.marginTop = "4px";

  const openBtn = ui.btn("Open tool", {
    variant: "primary",
    icon: "🔗",
    fullWidth: true,
    title: "Open the tool in a new tab",
  });
  openBtn.style.flex = "1 1 auto";
  openBtn.style.minWidth = "0";
  openBtn.onclick = () => {
    const ok = ToolsService.open(tool);
    if (!ok) {
      void toastSimple("Unable to open link", "Please open the address manually.", "error");
    }
  };

  actions.append(openBtn);
  body.appendChild(actions);

  return card.root;
}

export async function renderToolsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "tools", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "flex";
  view.style.flexDirection = "column";
  view.style.gap = "12px";
  view.style.alignItems = "center"; // centre le wrapper (au lieu de stretch)
  view.style.padding = "8px";
  view.style.width = "100%";
  view.style.maxHeight = "54vh";
  view.style.overflowY = "auto";
  view.style.overflowX = "auto"; // sécurité si écran < largeur fixe

  // --- largeur fixe du wrapper ---
  const WRAPPER_WIDTH = 720; // ajuste selon ton besoin (px)

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "12px";
  wrapper.style.width = `${WRAPPER_WIDTH}px`;
  wrapper.style.minWidth = `${WRAPPER_WIDTH}px`;
  wrapper.style.maxWidth = `${WRAPPER_WIDTH}px`;
  wrapper.style.boxSizing = "border-box";
  wrapper.style.alignSelf = "center"; // s'aligne au centre dans la view

  const intro = ui.card("🧰 Community tools", {
    tone: "muted",
    align: "stretch",
  });
  const introText = document.createElement("p");
  introText.textContent = "Discover community-made helpers to plan, calculate, and simplify your Magic Garden adventures.";
  introText.style.margin = "0";
  introText.style.fontSize = "13px";
  introText.style.lineHeight = "1.5";
  introText.style.opacity = "0.9";
  introText.style.textAlign = "left";
  intro.body.appendChild(introText);

  wrapper.appendChild(intro.root);

  const allTools = ToolsService.list();

  const filterSection = document.createElement("div");
  filterSection.style.display = "flex";
  filterSection.style.flexDirection = "column";
  filterSection.style.gap = "8px";
  filterSection.style.background = "#ffffff08";
  filterSection.style.border = "1px solid #ffffff11";
  filterSection.style.borderRadius = "12px";
  filterSection.style.padding = "12px";

  const filterTitle = document.createElement("span");
  filterTitle.textContent = "Filter by tags";
  filterTitle.style.fontSize = "12px";
  filterTitle.style.letterSpacing = "0.05em";
  filterTitle.style.textTransform = "uppercase";
  filterTitle.style.opacity = "0.75";
  filterTitle.style.fontWeight = "600";

  const filterControls = document.createElement("div");
  filterControls.style.display = "flex";
  filterControls.style.flexWrap = "wrap";
  filterControls.style.gap = "8px";

  const selectedTags = new Set<string>();
  const tagButtons = new Map<string, HTMLButtonElement>();
  let allButton: HTMLButtonElement;
  let cardsContainer: HTMLDivElement;

  const filterBtnBaseStyle = (btn: HTMLButtonElement) => {
    btn.type = "button";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "4px 10px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid";
    btn.style.background = "#ffffff11";
    btn.style.borderColor = "#ffffff22";
    btn.style.fontSize = "11px";
    btn.style.fontWeight = "600";
    btn.style.letterSpacing = "0.03em";
    btn.style.textTransform = "uppercase";
    btn.style.color = "inherit";
    btn.style.opacity = "0.85";
    btn.style.cursor = "pointer";
    btn.style.transition = "background 120ms ease, border-color 120ms ease, opacity 120ms ease";
  };

  const setActiveState = (btn: HTMLButtonElement, active: boolean) => {
    if (active) {
      btn.style.background = "#2d8cff33";
      btn.style.borderColor = "#2d8cff66";
      btn.style.opacity = "1";
    } else {
      btn.style.background = "#ffffff11";
      btn.style.borderColor = "#ffffff22";
      btn.style.opacity = "0.85";
    }
  };

  const renderList = () => {
    cardsContainer.innerHTML = "";
    const filtered = selectedTags.size
      ? allTools.filter(tool => tool.tags?.some(tag => selectedTags.has(tag)))
      : allTools;

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No tools match the selected tags yet.";
      empty.style.margin = "12px 0 0";
      empty.style.fontSize = "13px";
      empty.style.opacity = "0.75";
      empty.style.textAlign = "center";
      cardsContainer.appendChild(empty);
      return;
    }

    filtered.forEach(tool => {
      cardsContainer.appendChild(renderToolCard(ui, tool));
    });
  };

  const refreshButtonStates = () => {
    tagButtons.forEach((btn, tag) => {
      setActiveState(btn, selectedTags.has(tag));
    });
    setActiveState(allButton, selectedTags.size === 0);
  };

  const handleToggle = (tag: string) => {
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
    } else {
      selectedTags.add(tag);
    }
    refreshButtonStates();
    renderList();
  };

  allButton = document.createElement("button");
  allButton.textContent = "All";
  filterBtnBaseStyle(allButton);
  allButton.onclick = () => {
    if (selectedTags.size === 0) return;
    selectedTags.clear();
    refreshButtonStates();
    renderList();
  };
  filterControls.appendChild(allButton);

  ToolsService.tags().forEach(tag => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    filterBtnBaseStyle(btn);
    btn.onclick = () => handleToggle(tag);
    filterControls.appendChild(btn);
    tagButtons.set(tag, btn);
  });

  filterSection.appendChild(filterTitle);
  filterSection.appendChild(filterControls);
  wrapper.appendChild(filterSection);

  cardsContainer = document.createElement("div");
  cardsContainer.style.display = "flex";
  cardsContainer.style.flexDirection = "column";
  cardsContainer.style.gap = "12px";

  renderList();
  refreshButtonStates();

  wrapper.appendChild(cardsContainer);
  view.appendChild(wrapper);
}
