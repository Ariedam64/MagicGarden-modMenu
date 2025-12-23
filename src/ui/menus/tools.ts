// src/ui/menus/tools.ts
import { Menu } from "../menu";
import { toastSimple } from "../toast";
import { ToolsService, openLink, type ExternalTool } from "../../services/tools";

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
  const isIconUrl = !!tool.icon && /^https?:\/\//i.test(tool.icon);
  const card = ui.card("", { tone: "muted", align: "stretch" });
  card.root.style.width = "100%";

  const body = card.body;
  body.style.display = "grid";
  body.style.gap = "10px";
  body.style.justifyItems = "stretch";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "10px";

  if (isIconUrl) {
    const img = document.createElement("img");
    img.src = tool.icon!;
    img.alt = `${tool.title} icon`;
    img.style.width = "22px";
    img.style.height = "22px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "0";
    img.style.border = "none";
    img.style.background = "none";
    img.style.padding = "0";
    img.style.margin = "0";
    img.style.boxShadow = "none";
    img.style.display = "block";
    img.style.flexShrink = "0";
    img.style.mixBlendMode = "screen";
    img.style.isolation = "isolate";
    header.appendChild(img);
  } else if (tool.icon) {
    const iconSpan = document.createElement("span");
    iconSpan.textContent = tool.icon;
    iconSpan.style.fontSize = "18px";
    header.appendChild(iconSpan);
  }

  const titleText = document.createElement("span");
  titleText.textContent = tool.title;
  titleText.style.fontSize = "15px";
  titleText.style.fontWeight = "700";
  header.appendChild(titleText);

  body.appendChild(header);

  const description = document.createElement("p");
  description.textContent = tool.description;
  description.style.margin = "0";
  description.style.fontSize = "13px";
  description.style.lineHeight = "1.45";
  description.style.opacity = "0.9";
  description.style.textAlign = "left";
  body.appendChild(description);

  if (tool.tags?.length || tool.creators?.length) {
    const metaRow = document.createElement("div");
    metaRow.style.display = "flex";
    metaRow.style.flexWrap = "wrap";
    metaRow.style.alignItems = "center";
    metaRow.style.justifyContent = "space-between";
    metaRow.style.gap = "10px";

    const tags = document.createElement("div");
    tags.style.display = "flex";
    tags.style.flexWrap = "wrap";
    tags.style.gap = "6px";
    tags.style.opacity = "0.85";
    if (tool.tags?.length) {
      tool.tags.forEach(tag => tags.appendChild(createTagPill(tag)));
    }
    metaRow.appendChild(tags);

    if (tool.creators?.length) {
      const creators = document.createElement("div");
      creators.style.display = "flex";
      creators.style.flexWrap = "wrap";
      creators.style.gap = "6px";

      tool.creators.forEach(creatorInfo => {
        const chip = document.createElement("div");
        chip.style.display = "inline-flex";
        chip.style.alignItems = "center";
        chip.style.gap = "8px";
        chip.style.padding = "4px 8px";
        chip.style.background = "#ffffff0c";
        chip.style.border = "1px solid #ffffff18";
        chip.style.borderRadius = "999px";

        if (creatorInfo.avatar) {
          const avatar = document.createElement("img");
          avatar.src = creatorInfo.avatar;
          avatar.alt = creatorInfo.name;
          avatar.style.width = "26px";
          avatar.style.height = "26px";
          avatar.style.borderRadius = "999px";
          avatar.style.objectFit = "cover";
          avatar.style.border = "1px solid #ffffff22";
          chip.appendChild(avatar);
        }

        const name = document.createElement("span");
        name.textContent = creatorInfo.name;
        name.style.fontSize = "12px";
        name.style.fontWeight = "600";
        chip.appendChild(name);

        creators.appendChild(chip);
      });

      metaRow.appendChild(creators);
    }

    body.appendChild(metaRow);
  }

  const actionsRow = ui.flexRow({ gap: 8, justify: "end", fullWidth: true });
  actionsRow.style.marginTop = "4px";

  const shouldShowInlinePreview = tool.showInlinePreview ?? false;
  const openInlinePreview = (url: string, title?: string) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.72)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.padding = "20px";

    const box = document.createElement("div");
    box.style.position = "relative";
    box.style.maxWidth = "90vw";
    box.style.maxHeight = "90vh";
    box.style.background = "#0f1318";
    box.style.border = "1px solid #ffffff22";
    box.style.borderRadius = "12px";
    box.style.boxShadow = "0 20px 50px rgba(0,0,0,0.45)";
    box.style.overflow = "hidden";

    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.position = "absolute";
    close.style.top = "8px";
    close.style.right = "8px";
    close.style.border = "1px solid #ffffff33";
    close.style.borderRadius = "8px";
    close.style.background = "#0009";
    close.style.color = "#fff";
    close.style.width = "32px";
    close.style.height = "32px";
    close.style.cursor = "pointer";
    close.style.fontSize = "16px";
    close.style.lineHeight = "1";
    close.style.display = "grid";
    close.style.placeItems = "center";
    close.style.zIndex = "2";
    close.onclick = () => overlay.remove();

    const img = document.createElement("img");
    img.src = url;
    img.alt = title ?? tool.title;
    img.style.display = "block";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "90vh";
    img.style.objectFit = "contain";
    img.style.transition = "transform 200ms ease";
    img.style.cursor = "zoom-in";

    let zoomed = false;
    let lastOrigin = "center center";
    const toggleZoom = (event?: MouseEvent) => {
      if (!zoomed && event) {
        const rect = img.getBoundingClientRect();
        const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * 100;
        const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * 100;
        lastOrigin = `${x}% ${y}%`;
        img.style.transformOrigin = lastOrigin;
      }
      zoomed = !zoomed;
      img.style.transform = zoomed ? "scale(1.8)" : "scale(1)";
      img.style.cursor = zoomed ? "zoom-out" : "zoom-in";
    };
    img.onclick = (event) => {
      event.stopPropagation();
      toggleZoom(event);
    };

    box.append(close, img);
    overlay.appendChild(box);
    overlay.onclick = (ev) => {
      if (ev.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
  };
  const showActionToast = () => {
    void toastSimple("Unable to open link", "Please open the address manually.", "error");
  };

  if (tool.actions?.length) {
    actionsRow.style.display = "grid";
    actionsRow.style.width = "100%";
    actionsRow.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
    actionsRow.style.alignItems = "stretch";
    actionsRow.style.justifyContent = "stretch";
    tool.actions.forEach(action => {
      const actionBtn = ui.btn(action.label, {
        variant: "primary",
        title: `Open ${action.label}`,
      });
      actionBtn.style.flex = "1 1 0";
      actionBtn.style.minWidth = "0";
      actionBtn.onclick = () => {
        if (action.showInlinePreview) {
          openInlinePreview(action.url, action.label);
          return;
        }
        const ok = openLink(action.url);
        if (!ok) {
          showActionToast();
        }
      };
      actionsRow.append(actionBtn);
    });
  } else {
    const openBtn = ui.btn("Open tool", {
      variant: "primary",
      icon: "🔗",
      fullWidth: true,
      title: "Open the tool in a new tab",
    });
    openBtn.style.flex = "1 1 auto";
    openBtn.style.minWidth = "0";
    openBtn.onclick = () => {
      if (shouldShowInlinePreview) {
        openInlinePreview(tool.url, tool.title);
      } else {
        const ok = ToolsService.open(tool);
        if (!ok) {
          showActionToast();
        }
      }
    };
    actionsRow.append(openBtn);
  }

  body.appendChild(actionsRow);

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
  view.style.maxHeight = "70vh";
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
      empty.style.gridColumn = "1 / -1";
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
  cardsContainer.style.display = "grid";
  cardsContainer.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
  cardsContainer.style.gap = "12px";

  renderList();
  refreshButtonStates();

  wrapper.appendChild(cardsContainer);
  view.appendChild(wrapper);
}
