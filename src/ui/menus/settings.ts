import { Menu } from "../menu";
import { detectEnvironment, EnvironmentInfo } from "../../utils/api";
import { getLocalVersion } from "../../utils/version";
import { gameVersion } from "../../utils/gameVersion";
import {
  AriesBackup,
  deleteBackup,
  exportAllSettings,
  importSettings,
  listBackups,
  loadBackup,
  saveBackup,
  SettingsImportResult,
} from "../../services/settings";
import { pageWindow } from "../../utils/page-context";

declare const GM_download: ((options: { name?: string; url: string; saveAs?: boolean }) => void) | undefined;

function createActionButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.borderRadius = "6px";
  button.style.border = "1px solid rgba(255,255,255,0.2)";
  button.style.background = "rgba(255,255,255,0.04)";
  button.style.color = "inherit";
  button.style.fontWeight = "600";
  button.style.fontSize = "13px";
  button.style.padding = "6px 12px";
  button.style.cursor = "pointer";
  button.addEventListener("mouseenter", () => (button.style.background = "rgba(255,255,255,0.08)"));
  button.addEventListener("mouseleave", () => (button.style.background = "rgba(255,255,255,0.04)"));
  return button;
}

function createStatusLine(): HTMLDivElement {
  const line = document.createElement("div");
  line.style.fontSize = "13px";
  line.style.minHeight = "18px";
  line.style.opacity = "0.9";
  return line;
}

function showStatus(line: HTMLElement, result: SettingsImportResult): void {
  line.textContent = result.message;
  line.style.color = result.success ? "#8bf1b5" : "#ff9c9c";
}

function formatBackupDate(value: number): string {
  return new Date(value).toLocaleDateString();
}

function copyTextToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function downloadJSONFile(filename: string, payload: string): void {
  if (typeof GM_download === "function") {
    try {
      const encoded = encodeURIComponent(payload);
      const url = `data:application/json;charset=utf-8,${encoded}`;
      GM_download({ name: filename, url, saveAs: true });
      return;
    } catch {
      // ignore and fallback
    }
  }

  const win = pageWindow || window;
  const safePayload = JSON.stringify(payload);
  const safeFilename = JSON.stringify(filename);
  const script = `(function(){try{const data=${safePayload};const name=${safeFilename};const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";const parent=document.body||document.documentElement||document;parent.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(e){console.error("[settings] download:",e)}})();`;
  try {
    win.eval(script);
    return;
  } catch {
    // ignore and fallback
  }

  try {
    const doc = (win.document || document) as Document;
    const root: ParentNode | null =
      (doc.body as ParentNode | null) ||
      (doc.documentElement as ParentNode | null) ||
      (document.body as ParentNode | null);
    const blob = new Blob([payload], { type: "application/json" });
    const url = (win.URL || URL).createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    if (root) {
      root.appendChild(a);
    }
    a.click();
    if (root) {
      root.removeChild(a);
    }
    (win.URL || URL).revokeObjectURL(url);
  } catch {
    copyTextToClipboard(payload);
  }
}

function exportBackupData(entry: AriesBackup): void {
  const json = JSON.stringify(entry.data, null, 2);
  const filename = `${entry.name || "aries-backup"}-${entry.id}.json`;
  downloadJSONFile(filename, json);
}

function createBackupRow(entry: AriesBackup, statusLine: HTMLElement, listHolder: HTMLElement): HTMLElement {
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "6px";
  container.style.padding = "10px";
  container.style.borderRadius = "8px";
  container.style.border = "1px solid rgba(255,255,255,0.08)";
  container.style.background = "rgba(255,255,255,0.01)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "baseline";
  header.style.flexWrap = "wrap";
  header.style.gap = "8px";

  const title = document.createElement("div");
  title.textContent = entry.name;
  title.style.fontWeight = "600";
  title.style.fontSize = "13px";

  const date = document.createElement("div");
  date.innerHTML = `<strong>Created:</strong> ${formatBackupDate(entry.timestamp)}`;
  date.style.fontSize = "11px";
  date.style.opacity = "0.65";

  header.append(title, date);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";
  actions.style.flexWrap = "wrap";

  const loadButton = createActionButton("Load");
  loadButton.addEventListener("click", () => {
    const result = loadBackup(entry.id);
    showStatus(statusLine, result);
  });
  const deleteButton = createActionButton("Delete");
  deleteButton.addEventListener("click", () => {
    const result = deleteBackup(entry.id);
    showStatus(statusLine, result);
    refreshBackupList(statusLine, listHolder);
  });
  const exportButton = createActionButton("Export");
  exportButton.addEventListener("click", () => {
    exportBackupData(entry);
    showStatus(statusLine, { success: true, message: "Backup exported." });
  });

  actions.append(loadButton, deleteButton);
  actions.append(exportButton);

  container.append(header, actions);
  return container;
}

function refreshBackupList(statusLine: HTMLElement, listHolder: HTMLElement): void {
  const backups = listBackups();
  listHolder.innerHTML = "";
  if (!backups.length) {
    const empty = document.createElement("div");
    empty.textContent = "No backups saved yet.";
    empty.style.opacity = "0.6";
    listHolder.appendChild(empty);
    return;
  }
  backups.forEach((entry) => {
    const row = createBackupRow(entry, statusLine, listHolder);
    listHolder.appendChild(row);
  });
}

function renderDataTab(view: HTMLElement, ui: Menu): void {
  view.innerHTML = "";

  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";

  const ioCard = ui.card("Import / Export", {
    description: "Import or export the mod settings directly through JSON files.",
  });
  const card = ui.card("Backup", {
    description: "Save our settings directly inside the mod storage for easy restores.",
  });

  ioCard.body.style.display = "flex";
  ioCard.body.style.flexDirection = "column";
  ioCard.body.style.gap = "10px";

  card.body.style.display = "flex";
  card.body.style.flexDirection = "column";
  card.body.style.gap = "10px";

  const ioStatus = createStatusLine();

  const exportButton = createActionButton("Export Settings");
  exportButton.style.width = "100%";
  exportButton.style.boxSizing = "border-box";
  exportButton.addEventListener("click", () => {
    const payload = exportAllSettings();
    const filename = `aries-settings-${Date.now()}.json`;
    downloadJSONFile(filename, payload);
    showStatus(ioStatus, { success: true, message: "Settings exported as JSON file." });
  });

  const importWrapper = document.createElement("div");
  importWrapper.style.display = "flex";
  importWrapper.style.flexDirection = "column";
  importWrapper.style.gap = "8px";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.style.display = "none";

  const fileCard = document.createElement("div");
  Object.assign(fileCard.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "18px 22px",
    width: "100%",
    minHeight: "110px",
    borderRadius: "14px",
    border: "1px dashed #5d6a7d",
    background: "linear-gradient(180deg, #0b141c, #091018)",
    transition: "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer",
    textAlign: "center",
  });
  fileCard.tabIndex = 0;
  fileCard.setAttribute("role", "button");
  fileCard.setAttribute("aria-label", "Import settings JSON");

  const fileCardTitle = document.createElement("div");
  fileCardTitle.textContent = "Import settings";
  Object.assign(fileCardTitle.style, {
    fontWeight: "600",
    fontSize: "14px",
    letterSpacing: "0.02em",
  });

  const fileStatus = document.createElement("div");
  const defaultStatusText = "Drop a JSON file or click to browse.";
  fileStatus.textContent = defaultStatusText;
  Object.assign(fileStatus.style, {
    fontSize: "12px",
    opacity: "0.75",
  });

  fileCard.append(fileCardTitle, fileStatus);

  const setFileCardActive = (active: boolean) => {
    if (active) {
      fileCard.style.borderColor = "#6fc3ff";
      fileCard.style.boxShadow = "0 0 0 3px #6fc3ff22";
      fileCard.style.background = "linear-gradient(180deg, #102030, #0b1826)";
    } else {
      fileCard.style.borderColor = "#5d6a7d";
      fileCard.style.boxShadow = "none";
      fileCard.style.background = "linear-gradient(180deg, #0b141c, #091018)";
    }
  };

  const triggerFileSelect = () => fileInput.click();

  fileCard.addEventListener("mouseenter", () => setFileCardActive(true));
  fileCard.addEventListener("mouseleave", () => setFileCardActive(document.activeElement === fileCard));
  fileCard.addEventListener("focus", () => setFileCardActive(true));
  fileCard.addEventListener("blur", () => setFileCardActive(false));

  fileCard.addEventListener("click", triggerFileSelect);
  fileCard.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      triggerFileSelect();
    }
  });

  fileCard.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    setFileCardActive(true);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  fileCard.addEventListener("dragleave", () => setFileCardActive(document.activeElement === fileCard));

  const displaySelection = (files: FileList | null | undefined) => {
    if (!files || !files.length) {
      fileStatus.textContent = defaultStatusText;
      return;
    }
    fileStatus.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    try {
      const text = await file.text();
      const result = importSettings(text);
      showStatus(ioStatus, result);
    } catch (error) {
      showStatus(ioStatus, {
        success: false,
        message: `Failed to read file (${error instanceof Error ? error.message : "unknown error"}).`,
      });
    } finally {
      fileInput.value = "";
    }
  };

  fileCard.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    const files = ev.dataTransfer?.files || null;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  });

  fileInput.onchange = async () => {
    const files = fileInput.files;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  };

  importWrapper.append(fileInput, fileCard);
  ioCard.body.append(importWrapper, ioStatus, exportButton);
  layout.appendChild(ioCard.root);

  const controlRow = document.createElement("div");
  controlRow.style.display = "flex";
  controlRow.style.gap = "8px";
  controlRow.style.alignItems = "center";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Backup name";
  nameInput.style.flex = "1";
  nameInput.style.borderRadius = "6px";
  nameInput.style.border = "1px solid rgba(255,255,255,0.08)";
  nameInput.style.background = "rgba(255,255,255,0.02)";
  nameInput.style.color = "inherit";
  nameInput.style.padding = "8px 10px";
  nameInput.style.fontSize = "13px";

  const saveButton = createActionButton("Save");
  const controlStatus = createStatusLine();

  const backupListHolder = document.createElement("div");
  backupListHolder.style.display = "flex";
  backupListHolder.style.flexDirection = "column";
  backupListHolder.style.gap = "10px";

  saveButton.addEventListener("click", () => {
    const result = saveBackup(nameInput.value);
    showStatus(controlStatus, result);
    if (result.success) {
      nameInput.value = "";
      refreshBackupList(controlStatus, backupListHolder);
    }
  });

  controlRow.append(nameInput, saveButton);
  card.body.append(controlRow, controlStatus, backupListHolder);
  layout.appendChild(card.root);

  view.appendChild(layout);

  refreshBackupList(controlStatus, backupListHolder);
}

function createInfoRow(ui: Menu, label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr auto";
  row.style.alignItems = "baseline";
  row.style.gap = "12px";

  const labelEl = ui.label(label);
  labelEl.style.fontSize = "12px";
  labelEl.style.opacity = "0.8";

  const valueEl = document.createElement("div");
  valueEl.style.textAlign = "right";
  valueEl.style.fontSize = "13px";
  valueEl.style.fontWeight = "600";
  valueEl.style.wordBreak = "break-word";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function getWindowSizeLabel(win: Window | null): string {
  if (!win) return "n/a";
  const width = typeof win.innerWidth === "number" ? Math.floor(win.innerWidth) : null;
  const height = typeof win.innerHeight === "number" ? Math.floor(win.innerHeight) : null;
  if (width === null || height === null) {
    return "unknown";
  }
  return `${width} x ${height}`;
}

function describeSurface(env: EnvironmentInfo | null): string {
  if (!env) return "n/a";
  return env.surface === "discord" ? "Discord" : "Web";
}

function describePlatform(env: EnvironmentInfo | null, nav: Navigator | null): string {
  if (!env) return "n/a";
  if (env.platform === "desktop") {
    return "Desktop";
  }
  if (env.platform === "mobile") {
    const ua = nav?.userAgent ?? "";
    if (/tablet|ipad|playbook|silk|kindle/i.test(ua)) {
      return "Mobile (Tablet)";
    }
    if (/mobile|iphone|ipod|android/i.test(ua)) {
      return "Mobile (Phone)";
    }
    return "Mobile";
  }
  return env.platform;
}

function detectOsLabel(nav: Navigator | null): string {
  const platform = nav?.platform ?? "";
  const userAgent = nav?.userAgent ?? "";
  const target = `${platform} ${userAgent}`.toLowerCase();
  if (!target.trim()) {
    return "n/a";
  }
  if (/windows/.test(target)) return "Windows";
  if (/mac os|macintosh|darwin/.test(target)) return "macOS";
  if (/android/.test(target) && !/windows/.test(target)) return "Android";
  if (/iphone|ipad|ipod/.test(target)) return "iOS";
  if (/linux/.test(target) && !/android/.test(target)) return "Linux";
  if (/cros/.test(target)) return "Chrome OS";
  if (/freebsd/.test(target)) return "FreeBSD";
  if (/sunos|solaris/.test(target)) return "Solaris";
  return nav?.platform || nav?.userAgent || "Unknown";
}

function renderInfosTab(view: HTMLElement, ui: Menu): void {
  view.innerHTML = "";

  const safeWindow = typeof window !== "undefined" ? window : null;
  const safeNavigator = typeof navigator !== "undefined" ? navigator : null;
  const safeLocation = typeof location !== "undefined" ? location : null;

  const environment = safeWindow ? detectEnvironment() : null;
  const resolvedGameVersion = gameVersion ?? "unknown";
  const resolvedModVersion = getLocalVersion() ?? "unknown";

  const infoCard = ui.card("Runtime infos");
  infoCard.body.style.display = "flex";
  infoCard.body.style.flexDirection = "column";
  infoCard.body.style.gap = "10px";

  const infoRows = [
    { label: "Mod version", value: resolvedModVersion },
    { label: "Game version", value: resolvedGameVersion },
    { label: "Window size", value: getWindowSizeLabel(safeWindow) },
    {
      label: "Host",
      value: environment?.host ?? safeLocation?.hostname ?? "n/a",
    },
    { label: "Surface", value: describeSurface(environment) },
    { label: "Platform", value: describePlatform(environment, safeNavigator) },
    { label: "OS", value: detectOsLabel(safeNavigator) },
  ];

  infoRows.forEach((entry) => {
    infoCard.body.appendChild(createInfoRow(ui, entry.label, entry.value));
  });

  view.appendChild(infoCard.root);
}

export function renderSettingsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "settings", compact: true });
  ui.mount(container);
  ui.addTabs([
    { id: "settings-data", title: "Settings", render: (root) => renderDataTab(root, ui) },
    { id: "settings-infos", title: "Infos", render: (root) => renderInfosTab(root, ui) },
  ]);
  ui.switchTo("settings-data");
}
