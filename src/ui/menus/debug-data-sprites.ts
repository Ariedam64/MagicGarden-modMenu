import { Menu } from "../menu";
import { createTwoColumns } from "./debug-data-shared";
import { attachSpriteIcon } from "../spriteIconCache";
import { MUT_G1, MUT_G2, MUT_G3, type MutationName } from "../../sprite/settings";

type SpriteListEntry = { key?: string; isAnim?: boolean; count?: number };

type SpriteServiceHandle = {
  ready?: Promise<unknown>;
  list?: (category?: string) => SpriteListEntry[];
  state?: { cats?: Map<string, unknown> | Record<string, unknown>; loaded?: boolean };
  renderToDataURL?: (arg: any, type?: string, quality?: number) => Promise<string | null> | string | null;
  renderToCanvas?: (params: { category: string; id: string; mutations?: string[] }) => HTMLCanvasElement | null;
};

const SPRITE_FAMILY_ID = "sprite";
const ANY_CATEGORY = "all";
const MAX_VISIBLE_SPRITES = 400;
const SPRITE_ICON_SIZE = 96;

let spriteServicePromise: Promise<SpriteServiceHandle | null> | null = null;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function resolveGlobalSpriteService(): SpriteServiceHandle | null {
  const root: any = (globalThis as any).unsafeWindow || globalThis;
  return root?.__MG_SPRITE_SERVICE__ ?? null;
}

async function waitForSpriteService(): Promise<SpriteServiceHandle | null> {
  const timeoutMs = 8_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const svc = resolveGlobalSpriteService();
    if (svc) {
      try {
        if (svc.ready && typeof svc.ready.then === "function") {
          await svc.ready;
        }
      } catch {
        /* ignore readiness errors */
      }
      return svc;
    }
    await sleep(200);
  }
  return null;
}

async function acquireSpriteService(force = false): Promise<SpriteServiceHandle | null> {
  if (force) {
    spriteServicePromise = null;
  }
  if (!spriteServicePromise) {
    spriteServicePromise = waitForSpriteService();
  }
  const svc = await spriteServicePromise;
  if (!svc) {
    spriteServicePromise = null;
    return null;
  }
  return svc;
}

type ParsedSpriteKey = {
  category: string;
  id: string;
  full: string;
};

function parseSpriteKey(key: string): ParsedSpriteKey {
  const safe = String(key || "");
  const parts = safe.split("/").filter(Boolean);
  const start = parts[0] === "sprite" || parts[0] === "sprites" ? 1 : 0;
  const category = parts[start] ?? "misc";
  const id = parts.slice(start + 1).join("/") || parts[parts.length - 1] || safe;
  const full = parts.slice(start).join("/") || safe;
  return { category, id, full };
}

function buildSpriteCandidates(parsed: ParsedSpriteKey): string[] {
  const variants = [parsed.id, parsed.full];
  const compact = parsed.id.replace(/\W+/g, "");
  if (compact && compact !== parsed.id) {
    variants.push(compact);
  }
  return Array.from(new Set(variants.filter(Boolean)));
}

function extractSpriteCategories(service: SpriteServiceHandle | null): string[] {
  if (!service) return [];
  const cats = service.state?.cats;
  let values: string[] = [];
  if (cats instanceof Map) {
    values = Array.from(cats.keys());
  } else if (cats && typeof cats === "object") {
    values = Object.keys(cats);
  }
  if (!values.length && typeof service.list === "function") {
    try {
      const fallback = service.list("any" as any) ?? [];
      const collected = new Set<string>();
      fallback.forEach(entry => {
        const parsed = parseSpriteKey(entry?.key ?? "");
        if (parsed.category) collected.add(parsed.category);
      });
      values = Array.from(collected);
    } catch {
      values = [];
    }
  }
  return values
    .map(value => value.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

const sanitizeFileComponent = (value: string): string =>
  value.replace(/[^a-z0-9_\-]+/gi, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "sprite";

const buildSpriteFilename = (parsed: ParsedSpriteKey, mutations: MutationName[]): string => {
  const mutSegment = mutations.length ? `-${mutations.map(m => sanitizeFileComponent(m)).join("_")}` : "";
  return `${sanitizeFileComponent(parsed.category)}-${sanitizeFileComponent(parsed.id)}${mutSegment}.png`;
};

type ColorSelection = "None" | (typeof MUT_G1)[number];
type ConditionSelection = "None" | (typeof MUT_G2)[number];
type LightingSelection = "None" | (typeof MUT_G3)[number];

const COLOR_SELECTIONS: ColorSelection[] = ["None", ...MUT_G1];
const CONDITION_SELECTIONS: ConditionSelection[] = ["None", ...MUT_G2];
const LIGHTING_SELECTIONS: LightingSelection[] = ["None", ...MUT_G3];

type MutationFilterState = {
  color: ColorSelection;
  condition: ConditionSelection;
  lighting: LightingSelection;
};

type MutationGroupKey = "color" | "condition" | "lighting";

type SpriteCardRecord = { entry: SpriteListEntry; parsed: ParsedSpriteKey };

export function renderSpritesTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  const explorerCard = ui.card("Sprite Explorer", {
    tone: "muted",
    subtitle: "Browse captured sprites via the runtime sprite service.",
  });
  leftCol.appendChild(explorerCard.root);

  const listCard = ui.card("Sprites", {
    tone: "muted",
    subtitle: "Preview sprites for the selected category.",
  });
  rightCol.appendChild(listCard.root);

  const familySelect = ui.select({ width: "100%" });
  const families = [{ value: SPRITE_FAMILY_ID, label: "Sprite catalog" }];
  families.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    familySelect.appendChild(option);
  });
  familySelect.value = SPRITE_FAMILY_ID;

  const categorySelect = ui.select({ width: "100%" });
  categorySelect.disabled = true;

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search name or key";
  searchInput.className = "dd-sprite-search";

  const reloadBtn = ui.btn("Reload sprites", {
    size: "sm",
    variant: "ghost",
    onClick: () => {
      void updateList(true);
    },
  }) as HTMLButtonElement;
  const downloadBtnLabel = "Download visible sprites";
  const downloadBtn = ui.btn(downloadBtnLabel, {
    size: "sm",
    variant: "primary",
    onClick: () => {
      void downloadVisibleSprites();
    },
  }) as HTMLButtonElement;
  downloadBtn.disabled = true;

  const controlsGrid = document.createElement("div");
  controlsGrid.className = "dd-sprite-control-grid";
  controlsGrid.append(
    createSelectControl("Asset family", familySelect),
    createSelectControl("Asset category", categorySelect),
    createSelectControl("Search", searchInput),
  );
  explorerCard.body.appendChild(controlsGrid);
  const actionRow = document.createElement("div");
  actionRow.className = "dd-sprite-actions";
  actionRow.append(reloadBtn, downloadBtn);
  explorerCard.body.appendChild(actionRow);

  const mutationFilters: MutationFilterState = { color: "None", condition: "None", lighting: "None" };
  let mutationGroupContainers: Record<MutationGroupKey, HTMLDivElement> | null = null;

  const mutationCard = ui.card("Mutations", {
    tone: "muted",
    subtitle: "Apply color or weather overlays to the previews.",
  });
  leftCol.appendChild(mutationCard.root);
  const mutationBody = document.createElement("div");
  mutationBody.className = "dd-sprite-mutation-card";
  mutationCard.body.appendChild(mutationBody);
  mutationGroupContainers = {
    color: document.createElement("div"),
    condition: document.createElement("div"),
    lighting: document.createElement("div"),
  };
  mutationGroupContainers.color.className = "dd-sprite-mutation-group";
  mutationGroupContainers.condition.className = "dd-sprite-mutation-group";
  mutationGroupContainers.lighting.className = "dd-sprite-mutation-group";
  mutationBody.append(
    mutationGroupContainers.color,
    mutationGroupContainers.condition,
    mutationGroupContainers.lighting,
  );
  renderMutationControls();

  const stats = document.createElement("p");
  stats.className = "dd-sprite-stats";
  stats.textContent = "Waiting for sprite service…";
  explorerCard.body.appendChild(stats);

  const previewArea = document.createElement("div");
  previewArea.className = "dd-sprite-grid";
  const previewWrap = document.createElement("div");
  previewWrap.className = "dd-sprite-grid-wrap";
  previewWrap.appendChild(previewArea);
  listCard.body.appendChild(previewWrap);

  let selectedFamily = SPRITE_FAMILY_ID;
  let selectedCategory = ANY_CATEGORY;
  let searchTerm = "";
  let spriteCategories: string[] = [];
  let listRequestId = 0;
  let retryTimer: number | null = null;
  let searchDebounce: number | null = null;
  let visibleSpriteRecords: SpriteCardRecord[] = [];
  let downloadInProgress = false;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void updateList();
    }, 2_000);
  };

  const applySpriteCategories = (categories: string[]) => {
    spriteCategories = categories;
    categorySelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = ANY_CATEGORY;
    allOption.textContent = categories.length ? "All categories" : "No categories";
    categorySelect.appendChild(allOption);
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    const valid = categories.includes(selectedCategory);
    selectedCategory = valid ? selectedCategory : ANY_CATEGORY;
    categorySelect.value = selectedCategory;
    categorySelect.disabled = !categories.length;
  };

  const renderEmptyState = (message: string) => {
    previewArea.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dd-sprite-grid__empty";
    empty.textContent = message;
    previewArea.appendChild(empty);
  };

  const getActiveMutations = (): MutationName[] => {
    const active: MutationName[] = [];
    if (mutationFilters.color !== "None") active.push(mutationFilters.color);
    if (mutationFilters.condition !== "None") active.push(mutationFilters.condition);
    if (mutationFilters.lighting !== "None") active.push(mutationFilters.lighting);
    return active;
  };

  function renderMutationControls(): void {
    if (!mutationGroupContainers) return;
    renderMutationGroup(
      "color",
      COLOR_SELECTIONS,
      "Color",
      mutationGroupContainers.color,
    );
    renderMutationGroup(
      "condition",
      CONDITION_SELECTIONS,
      "Weather",
      mutationGroupContainers.condition,
    );
    renderMutationGroup(
      "lighting",
      LIGHTING_SELECTIONS,
      "Lighting",
      mutationGroupContainers.lighting,
    );
  }

  function renderMutationGroup(
    key: MutationGroupKey,
    options: readonly ("None" | MutationName)[],
    label: string,
    container: HTMLElement,
  ): void {
    container.innerHTML = "";
    const heading = document.createElement("span");
    heading.className = "dd-sprite-mutation-group-title";
    heading.textContent = label;
    const row = document.createElement("div");
    row.className = "dd-sprite-mutation-buttons";
    options.forEach(option => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dd-sprite-mutation-btn";
      btn.textContent = option === "None" ? "None" : option;
      if (mutationFilters[key] === option) {
        btn.classList.add("active");
      }
      btn.setAttribute("aria-pressed", mutationFilters[key] === option ? "true" : "false");
      btn.addEventListener("click", () => {
        if (mutationFilters[key] === option) return;
        mutationFilters[key] = option as any;
        renderMutationControls();
        if (visibleSpriteRecords.length) {
          renderSpriteCards(visibleSpriteRecords);
        }
      });
      row.appendChild(btn);
    });
    container.append(heading, row);
  };

  function renderSpriteCards(records: SpriteCardRecord[]): void {
    if (!records.length) {
      renderEmptyState("No sprites match the current filters.");
      return;
    }
    const activeMutations = getActiveMutations();
    previewArea.innerHTML = "";
    records.forEach(record => {
      const { entry, parsed } = record;
      const card = document.createElement("div");
      card.className = "dd-sprite-grid__item";
      card.title = entry?.key ?? parsed.full;

      const imgWrap = document.createElement("div");
      imgWrap.className = "dd-sprite-grid__img";
      imgWrap.style.setProperty("--sprite-size", `${SPRITE_ICON_SIZE}px`);

      const iconSlot = document.createElement("span");
      iconSlot.className = "dd-sprite-grid__icon";
      iconSlot.textContent = "…";
      imgWrap.appendChild(iconSlot);

      attachSpriteIcon(
        iconSlot,
        [parsed.category],
        buildSpriteCandidates(parsed),
        SPRITE_ICON_SIZE,
        "debug-sprites",
        { mutations: activeMutations },
      );

      const nameEl = document.createElement("span");
      nameEl.className = "dd-sprite-grid__name";
      const animSuffix =
        entry?.isAnim && typeof entry.count === "number" ? ` (anim ${entry.count})` : entry?.isAnim ? " (anim)" : "";
      nameEl.textContent = `${parsed.id}${animSuffix}`;

      const meta = document.createElement("span");
      meta.className = "dd-sprite-grid__meta";
      meta.textContent = entry?.key ?? parsed.full;

      card.append(imgWrap, nameEl, meta);
      const triggerDownload = () => {
        if (downloadInProgress) return;
        void downloadSpriteRecord(record, undefined, getActiveMutations());
      };
      card.addEventListener("click", triggerDownload);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerDownload();
        }
      });
      card.tabIndex = 0;
      previewArea.appendChild(card);
    });
  }

  const updateList = async (forceService = false) => {
    const token = ++listRequestId;
    stats.textContent = "Loading sprites…";
    const service = await acquireSpriteService(forceService);
    if (token !== listRequestId) return;
    if (!service) {
      renderEmptyState("Sprite service not ready. Waiting…");
      stats.textContent = "Sprite service not ready yet.";
      scheduleRetry();
      return;
    }
    clearRetry();

    if (!spriteCategories.length || forceService) {
      const categories = extractSpriteCategories(service);
      applySpriteCategories(categories);
    }

    if (selectedFamily !== SPRITE_FAMILY_ID) {
      renderEmptyState("No assets for this family.");
      stats.textContent = "Select the sprite family to browse sprites.";
      return;
    }

    const catArg = selectedCategory === ANY_CATEGORY ? ("any" as any) : (selectedCategory as any);
    let sprites: SpriteListEntry[] = [];
    try {
      sprites = typeof service.list === "function" ? service.list(catArg) ?? [] : [];
    } catch (error) {
      console.error("[DebugSprites] Failed to list sprites", error);
      renderEmptyState("Failed to list sprites (see console).");
      stats.textContent = "Listing sprites failed.";
      return;
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = !normalizedSearch
      ? sprites
      : sprites.filter(entry => {
          const parsed = parseSpriteKey(entry?.key ?? "");
          const label = `${parsed.category}/${parsed.id}`.toLowerCase();
          return label.includes(normalizedSearch) || (entry?.key ?? "").toLowerCase().includes(normalizedSearch);
        });

    const limited = filtered.slice(0, MAX_VISIBLE_SPRITES);
    const records = limited.map(entry => ({ entry, parsed: parseSpriteKey(entry?.key ?? "") }));
    visibleSpriteRecords = records;
    if (!downloadInProgress) {
      downloadBtn.textContent = downloadBtnLabel;
    }
    downloadBtn.disabled = !records.length || downloadInProgress;
    if (!records.length) {
      renderEmptyState("No sprites match the current filters.");
    } else {
      renderSpriteCards(records);
    }

    const clipped = filtered.length > MAX_VISIBLE_SPRITES;
    const categoryLabel =
      selectedCategory === ANY_CATEGORY ? "all categories" : `category "${selectedCategory}"`;
    stats.textContent = clipped
      ? `Showing ${limited.length}/${filtered.length} sprites for ${categoryLabel}.`
      : `${filtered.length} sprites for ${categoryLabel}.`;
  };

  familySelect.addEventListener("change", () => {
    selectedFamily = familySelect.value || SPRITE_FAMILY_ID;
    void updateList();
  });

  categorySelect.addEventListener("change", () => {
    selectedCategory = categorySelect.value || ANY_CATEGORY;
    void updateList();
  });

  searchInput.addEventListener("input", () => {
    if (searchDebounce !== null) {
      clearTimeout(searchDebounce);
    }
    searchDebounce = window.setTimeout(() => {
      searchDebounce = null;
      searchTerm = searchInput.value || "";
      void updateList();
    }, 150);
  });

  void updateList();

async function downloadSpriteRecord(
  record: SpriteCardRecord,
  svc?: SpriteServiceHandle | null,
  mutations?: MutationName[],
): Promise<boolean> {
  const activeMutations = mutations ?? getActiveMutations();
  const dataUrl = await renderRecordToDataUrl(record, svc, activeMutations);
  if (!dataUrl) return false;
  triggerDataUrlDownload(
    dataUrl,
    buildSpriteFilename(record.parsed, activeMutations),
  );
  return true;
}

async function downloadVisibleSprites(): Promise<void> {
  if (!visibleSpriteRecords.length || downloadInProgress) return;
  downloadInProgress = true;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Preparing zip...";
  try {
    const service = await acquireSpriteService();
    if (!service) return;
    const activeMutations = getActiveMutations();
    const files: { name: string; dataUrl: string }[] = [];
    for (const record of visibleSpriteRecords) {
      const dataUrl = await renderRecordToDataUrl(record, service, activeMutations);
      if (!dataUrl) continue;
      files.push({ name: buildSpriteFilename(record.parsed, activeMutations), dataUrl });
      downloadBtn.textContent = `Collected ${files.length}/${visibleSpriteRecords.length}`;
    }
    if (!files.length) return;
    downloadBtn.textContent = "Bundling zip...";
    const zipBlob = await packFilesToZip(files);
    triggerBlobDownload(zipBlob, `sprites-${Date.now()}.zip`);
  } finally {
    downloadInProgress = false;
    downloadBtn.textContent = downloadBtnLabel;
    downloadBtn.disabled = !visibleSpriteRecords.length;
  }
}

async function renderRecordToDataUrl(
  record: SpriteCardRecord,
  svc?: SpriteServiceHandle | null,
  mutations?: MutationName[],
): Promise<string | null> {
  const service = svc ?? (await acquireSpriteService());
  if (!service?.renderToDataURL) return null;
  try {
    const dataUrl = await service.renderToDataURL(
      {
        category: record.parsed.category,
        id: record.parsed.id,
        mutations: mutations ?? getActiveMutations(),
      },
      "image/png",
    );
    return dataUrl ?? null;
  } catch (error) {
    console.error("[DebugSprites] download failed", { key: record.entry.key, error });
    return null;
  }
}

async function packFilesToZip(files: { name: string; dataUrl: string }[]): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const fileEntries: { nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let offset = 0;
  for (const file of files) {
    const { bytes: data, crc32 } = dataUrlToBytesAndCrc(file.dataUrl);
    const nameBytes = new TextEncoder().encode(file.name);
    const localHeader = buildZipLocalHeader(nameBytes, data.length, crc32);
    fileEntries.push({ nameBytes, data, crc: crc32, offset });
    chunks.push(localHeader, data);
    offset += localHeader.length + data.length;
  }

  const centralRecords: Uint8Array[] = [];
  fileEntries.forEach(entry => {
    centralRecords.push(
      buildZipCentralDirectory(entry.nameBytes, entry.data.length, entry.crc, entry.offset),
    );
  });
  const centralDirectory = concatUint8Arrays(centralRecords);
  const endRecord = buildZipEndRecord(fileEntries.length, centralDirectory.length, offset);
  return new Blob([...chunks, centralDirectory, endRecord].map(chunk => chunk.slice()), {
    type: "application/zip",
  });
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_FLAGS = 0;
const ZIP_METHOD_STORE = 0;

function buildZipLocalHeader(nameBytes: Uint8Array, size: number, crc32: number): Uint8Array {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint32(offset, LOCAL_HEADER_SIGNATURE, true);
  offset += 4;
  view.setUint16(offset, ZIP_VERSION, true);
  offset += 2;
  view.setUint16(offset, ZIP_FLAGS, true);
  offset += 2;
  view.setUint16(offset, ZIP_METHOD_STORE, true);
  offset += 2;
  view.setUint16(offset, 0, true); // mod time
  offset += 2;
  view.setUint16(offset, 0, true); // mod date
  offset += 2;
  view.setUint32(offset, crc32 >>> 0, true);
  offset += 4;
  view.setUint32(offset, size, true);
  offset += 4;
  view.setUint32(offset, size, true);
  offset += 4;
  view.setUint16(offset, nameBytes.length, true);
  offset += 2;
  view.setUint16(offset, 0, true); // extra length
  const out = new Uint8Array(buffer);
  out.set(nameBytes, offset);
  return out;
}

function buildZipCentralDirectory(
  nameBytes: Uint8Array,
  size: number,
  crc32: number,
  offset: number,
): Uint8Array {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  let pos = 0;
  view.setUint32(pos, CENTRAL_DIR_SIGNATURE, true);
  pos += 4;
  view.setUint16(pos, ZIP_VERSION, true);
  pos += 2;
  view.setUint16(pos, ZIP_VERSION, true);
  pos += 2;
  view.setUint16(pos, ZIP_FLAGS, true);
  pos += 2;
  view.setUint16(pos, ZIP_METHOD_STORE, true);
  pos += 2;
  view.setUint16(pos, 0, true);
  pos += 2;
  view.setUint16(pos, 0, true);
  pos += 2;
  view.setUint32(pos, crc32 >>> 0, true);
  pos += 4;
  view.setUint32(pos, size, true);
  pos += 4;
  view.setUint32(pos, size, true);
  pos += 4;
  view.setUint16(pos, nameBytes.length, true);
  pos += 2;
  view.setUint16(pos, 0, true); // extra
  pos += 2;
  view.setUint16(pos, 0, true); // comment
  pos += 2;
  view.setUint16(pos, 0, true); // disk number
  pos += 2;
  view.setUint16(pos, 0, true); // internal attrs
  pos += 2;
  view.setUint32(pos, 0, true); // external attrs
  pos += 4;
  view.setUint32(pos, offset, true);
  pos += 4;
  const out = new Uint8Array(buffer);
  out.set(nameBytes, pos);
  return out;
}

function buildZipEndRecord(
  fileCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  let pos = 0;
  view.setUint32(pos, END_SIGNATURE, true);
  pos += 4;
  view.setUint16(pos, 0, true); // disk number
  pos += 2;
  view.setUint16(pos, 0, true); // disk with central dir
  pos += 2;
  view.setUint16(pos, fileCount, true);
  pos += 2;
  view.setUint16(pos, fileCount, true);
  pos += 2;
  view.setUint32(pos, centralSize, true);
  pos += 4;
  view.setUint32(pos, centralOffset, true);
  pos += 4;
  view.setUint16(pos, 0, true); // comment length
  return new Uint8Array(buffer);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach(arr => {
    result.set(arr, offset);
    offset += arr.length;
  });
  return result;
}

function dataUrlToBytesAndCrc(dataUrl: string): { bytes: Uint8Array; crc32: number } {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, crc32: crc32(bytes) };
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return ~crc >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function triggerDataUrlDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
}

function createSelectControl(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "dd-sprite-control";
  const label = document.createElement("span");
  label.className = "dd-sprite-control__label";
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}
