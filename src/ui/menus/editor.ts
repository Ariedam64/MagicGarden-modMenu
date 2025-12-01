// src/ui/menus/editor.ts
import { Menu } from "../menu";
import { toastSimple } from "../toast";
import { EditorService } from "../../services/editor";

export function renderEditorMenu(container: HTMLElement) {
  const ui = new Menu({ id: "editor", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "grid";
  view.style.gap = "8px";
  view.style.justifyItems = "center";

  const card = ui.card("Editor mode", { tone: "muted", align: "center" });
  card.header.style.display = "none";
  card.root.style.maxWidth = "420px";
  card.body.style.display = "grid";
  card.body.style.gap = "10px";

  const row = ui.flexRow({ align: "center", justify: "between", fullWidth: true });
  const label = ui.label("Editor mode");
  label.style.margin = "0";

  const toggle = ui.switch(EditorService.isEnabled()) as HTMLInputElement;
  toggle.setAttribute("aria-label", "Toggle editor mode");
  toggle.addEventListener("change", () => {
    const on = !!toggle.checked;
    EditorService.setEnabled(on);
  });

  row.append(label, toggle as unknown as HTMLElement);
  card.body.append(row);

  const hint = document.createElement("div");
 hint.textContent = "Sandbox garden editor with every plants and decors unlocked. Build, experiment, and customize without limits";
  hint.style.fontSize = "12px";
  hint.style.opacity = "0.7";
  hint.style.textAlign = "left";
  hint.style.lineHeight = "1.4";
  hint.style.width = "100%";
  card.body.append(hint);

  const kbHint = document.createElement("div");
  kbHint.textContent = "Place/Remove uses your action key. Toggle overlays with U.";
  kbHint.style.fontSize = "11px";
  kbHint.style.opacity = "0.65";
  kbHint.style.textAlign = "center";
  kbHint.style.lineHeight = "1.3";
  kbHint.style.width = "100%";
  card.body.append(kbHint);

  const kbHint2 = document.createElement("div");
  kbHint2.textContent = "Keys are editable in Keybinds > Editor.";
  kbHint2.style.fontSize = "11px";
  kbHint2.style.opacity = "0.65";
  kbHint2.style.textAlign = "center";
  kbHint2.style.lineHeight = "1.3";
  kbHint2.style.width = "100%";
  card.body.append(kbHint2);

  const cleanup = EditorService.onChange((enabled) => {
    toggle.checked = enabled;
    renderSavedList();
  });

  (view as any).__cleanup__ = () => {
    try { cleanup(); } catch {}
  };

  // Saved gardens section
  const sectionCard = (title: string, content: HTMLElement) => {
    const card = ui.card(title, { tone: "muted", align: "center" });
    card.root.style.maxWidth = "520px";
    card.body.style.display = "grid";
    card.body.style.gap = "8px";
    card.body.append(content);
    return card;
  };

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.opacity = "0.7";
  status.style.minHeight = "18px";

  // Current garden controls
  const currentWrap = document.createElement("div");
  currentWrap.style.display = "grid";
  currentWrap.style.gap = "6px";

  const nameInput = ui.inputText("Garden name", "");
  nameInput.placeholder = "Garden name";
  nameInput.style.width = "100%";

  const actionsRow = document.createElement("div");
  actionsRow.style.display = "grid";
  actionsRow.style.gridTemplateColumns = "1fr 1fr";
  actionsRow.style.gap = "8px";

  const saveBtn = ui.btn("Save current garden", {
    variant: "primary",
    fullWidth: true,
    onClick: async () => {
      const fn = (window as any).qwsEditorSaveGarden;
      if (typeof fn !== "function") return;
      const saved = await fn(nameInput.value);
      if (!saved) {
        status.textContent = "Save failed (no garden state found).";
        return;
      }
      status.textContent = `Saved "${saved.name}".`;
      renderSavedList();
    },
  });

  const clearBtn = ui.btn("Clear garden", {
    variant: "secondary",
    fullWidth: true,
    onClick: async () => {
      const fn = (window as any).qwsEditorClearGarden;
      if (typeof fn !== "function") return;
      const ok = await fn();
      status.textContent = ok ? "Garden cleared." : "Clear failed.";
    },
  });

  actionsRow.append(saveBtn, clearBtn);
  currentWrap.append(nameInput, actionsRow);

  // Import section
  const importWrap = document.createElement("div");
  importWrap.style.display = "grid";
  importWrap.style.gap = "6px";

  const importArea = document.createElement("textarea");
  importArea.placeholder = "Paste garden JSON here...";
  importArea.style.width = "100%";
  importArea.style.minHeight = "80px";
  importArea.style.borderRadius = "8px";
  importArea.style.border = "1px solid #2b3441";
  importArea.style.background = "rgba(16,21,28,0.9)";
  importArea.style.color = "#e7eef7";
  importArea.style.padding = "8px";
  importArea.style.fontSize = "12px";
  importArea.style.fontFamily = "monospace";

  const importBtn = ui.btn("Import to saved gardens", {
    variant: "secondary",
    fullWidth: true,
    onClick: async () => {
      const fn = (window as any).qwsEditorImportGarden;
      if (typeof fn !== "function") return;
      const saved = await fn(nameInput.value || "Imported garden", importArea.value);
      if (!saved) {
        status.textContent = "Import failed (invalid JSON).";
        return;
      }
      status.textContent = `Imported "${saved.name}".`;
      renderSavedList();
    },
  });
  importBtn.style.width = "100%";

  importWrap.append(importArea, importBtn);

  // Saved list
  const listWrap = document.createElement("div");
  listWrap.style.display = "grid";
  listWrap.style.gap = "8px";

  const renderSavedList = () => {
    const listFn = (window as any).qwsEditorListSavedGardens;
    const loadFn = (window as any).qwsEditorLoadGarden;
    const delFn = (window as any).qwsEditorDeleteGarden;
    const expFn = (window as any).qwsEditorExportGarden;

    listWrap.innerHTML = "";
    const items = typeof listFn === "function" ? listFn() : [];
    if (!items || !items.length) {
      const empty = document.createElement("div");
      empty.textContent = "No saved gardens yet.";
      empty.style.opacity = "0.7";
      empty.style.fontSize = "12px";
      listWrap.appendChild(empty);
      return;
    }

    const editorOn = EditorService.isEnabled();
    for (const g of items) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto auto";
      row.style.gap = "6px";
      row.style.alignItems = "center";
      row.style.padding = "8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid #2b3441";
      row.style.background = "rgba(16,21,28,0.9)";

      const name = document.createElement("div");
      name.textContent = g.name || "Untitled";
      name.style.fontWeight = "700";
      name.style.fontSize = "13px";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";

      const load = ui.btn("Load", {
        size: "sm",
        onClick: async () => {
          if (!EditorService.isEnabled()) {
            status.textContent = "Enable editor mode to load a garden.";
            return;
          }
          if (typeof loadFn !== "function") return;
          const ok = await loadFn(g.id);
          if (ok) {
            status.textContent = `Loaded "${g.name}".`;
          } else {
            status.textContent = "Load failed.";
          }
        },
      });
      load.disabled = !editorOn;
      if (!editorOn) load.title = "Enable editor mode to load";

      const exp = ui.btn("Export", {
        size: "sm",
        variant: "secondary",
        onClick: async () => {
          if (typeof expFn !== "function") return;
          const json = expFn(g.id);
          if (!json) {
            status.textContent = "Export failed.";
            return;
          }
          try {
            await navigator.clipboard.writeText(json);
            status.textContent = `Exported "${g.name}" to clipboard.`;
            await toastSimple("Editor", `Copied "${g.name}" to clipboard`, "success");
          } catch {
            status.textContent = `Exported "${g.name}". Copy manually.`;
            window.prompt("Garden JSON", json);
          }
        },
      });

      const del = ui.btn("Delete", {
        size: "sm",
        variant: "danger",
        onClick: () => {
          if (typeof delFn !== "function") return;
          const ok = delFn(g.id);
          if (ok) {
            status.textContent = `Deleted "${g.name}".`;
            renderSavedList();
          }
        },
      });

      row.append(name, load, exp, del);
      listWrap.appendChild(row);
    }
  };

  renderSavedList();

  const currentCard = sectionCard("🌱 Current garden", currentWrap);
  const importCard = sectionCard("📥 Import", importWrap);
  const savedCard = sectionCard("💾 Saved gardens", listWrap);
  savedCard.body.append(status);

  view.append(card.root, currentCard.root, importCard.root, savedCard.root);
}
