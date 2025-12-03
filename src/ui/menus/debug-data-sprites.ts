import { Menu } from "../menu";
import { Sprites, type TileInfo, type MutationIconTile } from "../../core/sprite";
import { findTileRefMatch } from "../../data/sprites";
import {
  tileRefsMutationLabels,
  tileRefsMutations,
} from "../../data/hardcoded-data.clean.js";
import { loadTileSheet, normalizeSheetBase } from "../../utils/tileSheet.js";
import type { MutationName } from "../../utils/calculators";
import { createTwoColumns } from "./debug-data-shared";

const COLOR_FILTERS = ["None", "Gold", "Rainbow"] as const;
const CONDITION_MUTATION_KEYS = ["None", "Wet", "Chilled", "Frozen"] as const;

function debugAssetName(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const last = clean.split("/").filter(Boolean).pop() ?? clean;
  return last.replace(/\.[a-z0-9]+$/i, "");
}

function deriveAssetCategory(family: string, url: string): string {
  const base = debugAssetName(url);
  const normalized = (family || "").toLowerCase();
  if (normalized === 'tiles') return base;
  if (normalized === 'cosmetics') {
    return base.split("_")[0] || base;
  }
  try {
    const trimmed = url.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+\//, '');
    const segments = trimmed.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return segments[1].split('.')[0] || base;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function renderSpritesTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");
  const { leftCol, rightCol } = createTwoColumns(view);

  const explorerCard = ui.card("Sprite Explorer", {
    tone: "muted",
    subtitle: "Browse captured assets by manifest family.",
  });
  leftCol.appendChild(explorerCard.root);

  const listCard = ui.card("Assets", {
    tone: "muted",
    subtitle: "Click an entry to open the file in a new tab.",
  });
  rightCol.appendChild(listCard.root);

  const families = ["all", ...Array.from(new Set(Sprites.listFamilies().filter(Boolean))).sort()];
  let selectedFamily = "all";
  let selectedCategory = "all";
  const categoryCache = new Map<string, string[]>();

  const familySelect = ui.select({ width: "100%" });
  families.forEach((family) => {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family === "all" ? "All families" : family;
    familySelect.appendChild(option);
  });
  familySelect.value = selectedFamily;

  const categorySelect = ui.select({ width: "100%" });
  categorySelect.disabled = true;

  const controlsGrid = document.createElement("div");
  controlsGrid.className = "dd-sprite-control-grid";
  controlsGrid.append(
    createSelectControl("Asset family", familySelect),
    createSelectControl("Asset category", categorySelect),
  );
  explorerCard.body.appendChild(controlsGrid);

  const filterPanel = document.createElement("div");
  filterPanel.className = "dd-sprite-filter-panel";
  explorerCard.body.appendChild(filterPanel);

  const colorSegmentRow = document.createElement("div");
  const conditionSegmentRow = document.createElement("div");
  const lightingSegmentRow = document.createElement("div");
  filterPanel.append(colorSegmentRow, conditionSegmentRow, lightingSegmentRow);

  const COLOR_FILTERS_LIST = COLOR_FILTERS;
  const mutationLabelMap = tileRefsMutationLabels as Record<string, string>;
  const CONDITION_OPTIONS = CONDITION_MUTATION_KEYS.map((value) => ({
    value: value as MutationName,
    label: value === "None" ? "None" : mutationLabelMap[value] ?? value,
  }));
const LIGHTING_DEFINITIONS: { id: MutationName; key: string; label: string }[] = [
    { id: "None", key: "None", label: "None" },
    { id: "Dawnlit", key: "Dawnlit", label: mutationLabelMap["Dawnlit"] ?? "Dawnlit" },
    { id: "Ambershine", key: "Amberlit", label: mutationLabelMap["Amberlit"] ?? "Amberlit" },
    { id: "Dawncharged", key: "Dawnbound", label: mutationLabelMap["Dawnbound"] ?? "Dawnbound" },
    { id: "Ambercharged", key: "Amberbound", label: mutationLabelMap["Amberbound"] ?? "Amberbound" },
  ];
  const LIGHTING_OPTIONS = LIGHTING_DEFINITIONS.map((def) => ({
    value: def.id,
    label: def.label,
  }));

  let colorFilter: (typeof COLOR_FILTERS)[number] = "None";
  let conditionFilter: string = "None";
  let lightingFilter: string = "None";
  let lightingSelectionKey: string = "None";

  const categoryMatches = (keyword: string) =>
    selectedFamily === "tiles" && selectedCategory.toLowerCase().includes(keyword);

  const renderSegment = (
    container: HTMLDivElement,
    title: string,
    options: { value: string; label: string }[],
    selected: string,
    onSelect: (value: string) => void,
  ): void => {
    container.innerHTML = "";
    const heading = document.createElement("span");
    heading.className = "dd-sprite-filter-label";
    heading.textContent = title;
    const segment = document.createElement("div");
    segment.className = "dd-sprite-segmented";
    options.forEach(({ value, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dd-sprite-seg-btn";
      btn.textContent = label;
      if (value === selected) btn.classList.add("is-active");
      btn.addEventListener("click", () => {
        onSelect(value);
        renderFilters();
        void updateList();
      });
      segment.append(btn);
    });
    container.append(heading, segment);
  };

  let currentTilesheetUrl: string | null = null;
  let currentTiles: TileInfo<HTMLCanvasElement>[] = [];
  let tileSheetActive = false;
  let visibleAssetUrls: string[] = [];
  let mutationIconsCache: Record<string, MutationIconTile> | null = null;
  const mutationIconsPromise = loadMutationIcons();

  const applyFiltersToCanvas = (
    canvas: HTMLCanvasElement,
    filters: string[] = buildFilterQueue(),
  ): HTMLCanvasElement => {
    let result = canvas;
    for (const filterName of filters) {
      const filtered = Sprites.applyCanvasFilter(result, filterName);
      if (filtered) result = filtered;
    }
    return result;
  };

  const exportCard = ui.card("Export", {
    tone: "muted",
    subtitle: "Download the assets currently visible in the explorer.",
  });
  leftCol.appendChild(exportCard.root);
  const exportBtn = ui.btn("Export visible assets", {
    variant: "primary",
    icon: "⬇",
    onClick: exportVisibleAssets,
  }) as HTMLButtonElement;
  const exportStatus = document.createElement("span");
  exportStatus.className = "dd-sprite-stats";
  exportStatus.textContent = "Select assets to export.";
  const progressWrapper = document.createElement("div");
  progressWrapper.className = "dd-sprite-export-progress";
  const progressBar = document.createElement("div");
  progressBar.className = "dd-sprite-export-progress__bar";
  progressWrapper.append(progressBar);
  exportCard.body.append(exportBtn, exportStatus, progressWrapper);
  let exporting = false;
  const showProgress = (value: number) => {
    progressBar.style.width = `${value}%`;
    progressWrapper.style.opacity = value > 0 && value < 100 ? "1" : "0";
  };

  const getAssetExportBaseName = (): string => {
    const familyPart = selectedFamily === "all" ? "all" : selectedFamily || "assets";
    const categoryPart = selectedCategory && selectedCategory !== "all" ? `-${selectedCategory}` : "";
    const raw = `${familyPart}${categoryPart}`.replace(/[^a-z0-9_-]+/gi, "_");
    return raw || "assets";
  };

  const updateExportStatusText = (): void => {
    if (tileSheetActive) {
      exportStatus.textContent = currentTiles.length
        ? `${currentTiles.length} tiles ready to export.`
        : "Load a tilesheet to export.";
      return;
    }
    if (visibleAssetUrls.length) {
      exportStatus.textContent = `${visibleAssetUrls.length} assets ready to download.`;
      return;
    }
    exportStatus.textContent = "Select assets to export.";
  };

  function triggerDownload(blob: Blob, filename: string): void {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(b);
      }, "image/png");
    });
    triggerDownload(blob, filename);
  }

  async function downloadUrlAsset(url: string): Promise<void> {
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      let name = debugAssetName(url);
      if (!/\.[a-z0-9]+$/i.test(name)) name += ".png";
      triggerDownload(blob, name);
    } catch (error) {
      console.error("[Sprites] Asset download failed", { url, error });
    }
  }

  async function exportVisibleAssets(): Promise<void> {
    if (exporting) return;
    const hasTiles = tileSheetActive && Boolean(currentTilesheetUrl) && currentTiles.length > 0;
    const hasAssets = visibleAssetUrls.length > 0;
    if (!hasTiles && !hasAssets) {
      showProgress(0);
      exportStatus.textContent = "Select assets to export.";
      return;
    }

    exporting = true;
    exportBtn.disabled = true;
    showProgress(0);
    exportStatus.textContent = "Preparing export...";

    try {
      if (hasTiles) {
        const base = normalizeSheetBase(currentTilesheetUrl!);
        const filters = buildFilterQueue();
        await Sprites.exportFilteredTileset({
          tiles: currentTiles,
          filters,
          baseName: base,
          onProgress: (processed, total) => {
            const percent = total ? Math.round((processed / total) * 100) : 0;
            showProgress(percent);
            exportStatus.textContent = `Processing ${processed}/${total} tiles`;
          },
        });
      } else {
        const base = getAssetExportBaseName();
        await Sprites.exportAssets({
          urls: visibleAssetUrls,
          baseName: base,
          onProgress: (processed, total) => {
            const percent = total ? Math.round((processed / total) * 100) : 0;
            showProgress(percent);
            exportStatus.textContent = `Processing ${processed}/${total} assets`;
          },
        });
      }

      showProgress(100);
      exportStatus.textContent = "Export ready — check your downloads.";
      setTimeout(() => showProgress(0), 1_000);
    } catch (error) {
      console.error("[Sprites] Export failed", error);
      exportStatus.textContent = "Export failed (see console).";
      showProgress(0);
    } finally {
      exporting = false;
      exportBtn.disabled = false;
    }
  }

  const renderFilters = (): void => {
    const showColor = categoryMatches("plant") || categoryMatches("pet");
    const showCondition = categoryMatches("plant");
    const showLighting = categoryMatches("plant");
    filterPanel.style.display = showColor ? "" : "none";
    colorSegmentRow.style.display = showColor ? "" : "none";
    conditionSegmentRow.style.display = showCondition ? "" : "none";
    lightingSegmentRow.style.display = showLighting ? "" : "none";

    renderSegment(
      colorSegmentRow,
      "Color",
      COLOR_FILTERS_LIST.map((value) => ({ value, label: value })),
      colorFilter,
      (value) => {
        colorFilter = value as (typeof COLOR_FILTERS_LIST)[number];
      },
    );
    renderSegment(conditionSegmentRow, "Weather", CONDITION_OPTIONS, conditionFilter, (value) => {
      conditionFilter = value;
    });
    renderSegment(lightingSegmentRow, "Lighting", LIGHTING_OPTIONS, lightingFilter, (value) => {
      lightingFilter = value;
      lightingSelectionKey = LIGHTING_DEFINITIONS.find((def) => def.id === value)?.key ?? value;
    });
  };

  const buildFilterQueue = (): string[] => {
    const queue: string[] = [];
    if (colorFilter !== "None") queue.push(colorFilter);
    if (colorFilter === "Gold" || colorFilter === "Rainbow") return queue;
    if (categoryMatches("plant")) {
      if (conditionFilter !== "None") queue.push(conditionFilter);
      if (lightingFilter !== "None") queue.push(lightingFilter);
    }
    return queue;
  };

  renderFilters();

  const stats = document.createElement("p");
  stats.className = "dd-sprite-stats";
  stats.textContent = "Select a family to inspect its assets.";
  explorerCard.body.appendChild(stats);

  const previewArea = document.createElement("div");
  previewArea.className = "dd-sprite-grid";
  listCard.body.appendChild(previewArea);

  const ensureCategories = (family: string): string[] => {
    if (!categoryCache.has(family)) {
      const assets = Sprites.listAssetsForFamily(family);
      const categories = Array.from(new Set(assets.map((url) => deriveAssetCategory(family, url))));
      categories.sort();
      categoryCache.set(family, categories);
    }
    return categoryCache.get(family) ?? [];
  };

  const updateCategoryOptions = () => {
    if (selectedFamily === "all") {
      categorySelect.innerHTML = "";
      const option = document.createElement("option");
      option.value = "all";
      option.textContent = "All categories";
      categorySelect.appendChild(option);
      categorySelect.value = "all";
      categorySelect.disabled = true;
      selectedCategory = "all";
      return;
    }

    const familyHasGroups = selectedFamily === "tiles" || selectedFamily === "cosmetics";
    if (!familyHasGroups) {
      categorySelect.innerHTML = "";
      const option = document.createElement("option");
      option.value = "all";
      option.textContent = "All categories";
      categorySelect.appendChild(option);
      categorySelect.value = "all";
      categorySelect.disabled = true;
      selectedCategory = "all";
      return;
    }

    const categories = ensureCategories(selectedFamily);
    categorySelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All categories";
    categorySelect.appendChild(allOption);
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    if (!categories.length) {
      categorySelect.disabled = true;
      selectedCategory = "all";
    } else {
      categorySelect.disabled = false;
      selectedCategory = categories.includes(selectedCategory) ? selectedCategory : "all";
      categorySelect.value = selectedCategory;
    }
  };

  const updateList = async () => {
    const filterQueue = buildFilterQueue();
    const familyAssets = selectedFamily === "all"
      ? Sprites.lists().all
      : Sprites.listAssetsForFamily(selectedFamily);
    let assets = familyAssets;
    if (selectedFamily !== "all" && selectedCategory !== "all") {
      assets = assets.filter(
        (url) => deriveAssetCategory(selectedFamily, url) === selectedCategory,
      );
    }
    visibleAssetUrls = assets;
    previewArea.innerHTML = "";
    let tileCount: number | null = null;
    const isTileSheetView =
      selectedFamily === "tiles" && selectedCategory !== "all" && assets.length > 0;
    previewArea.classList.toggle("dd-sprite-grid--tiles", isTileSheetView);
    currentTilesheetUrl = null;
    currentTiles = [];
    tileSheetActive = isTileSheetView;
    if (isTileSheetView) {
      const sheetUrl = assets[0];
      const base = normalizeSheetBase(sheetUrl);
      const tiles = await loadTileSheet(base);
      currentTilesheetUrl = sheetUrl;
      currentTiles = tiles;
      tileCount = tiles.length;
      if (!tiles.length) {
        const empty = document.createElement("div");
        empty.className = "dd-sprite-grid__empty";
        empty.textContent = `No tiles could be sliced for ${debugAssetName(sheetUrl)} yet.`;
        previewArea.appendChild(empty);
      } else {
        tiles.forEach((tile) => {
          const item = document.createElement("a");
          item.className = "dd-sprite-grid__item";
          item.href = sheetUrl;
          item.target = "_blank";
          item.rel = "noopener noreferrer";

          const baseCanvas = Sprites.toCanvas(tile as TileInfo);
          const match = findTileRefMatch(tile.sheet, tile.index);
          const isPlantSheet = match?.sheetId === "plants";
          let displayCanvas = applyFiltersToCanvas(baseCanvas, filterQueue);
          if (
            isPlantSheet &&
            filterQueue.length &&
            mutationIconsCache &&
            Object.keys(mutationIconsCache).length > 0
          ) {
            const renderMutations: MutationName[] = [];

if (colorFilter !== "None") {
  renderMutations.push(colorFilter as MutationName);          // Gold / Rainbow
}
if (conditionFilter !== "None") {
  renderMutations.push(conditionFilter as MutationName);      // Wet / Chilled / Frozen
}
if (lightingFilter !== "None") {
  renderMutations.push(lightingFilter as MutationName);       // Dawnlit / Ambershine / Dawncharged / Ambercharged
}

const mutated = Sprites.renderPlantWithMutationsNonTall({
  baseTile: tile as TileInfo,
  mutations: renderMutations,
  mutationIcons: mutationIconsCache!,
});
            if (mutated) displayCanvas = mutated;
          }
          displayCanvas.className = "dd-sprite-grid__img";
          const name = document.createElement("span");
          name.className = "dd-sprite-grid__name";
          const displayNames = match?.entries.map((entry) => entry.displayName).filter(Boolean);
          if (displayNames && displayNames.length) {
            name.textContent = displayNames.join(", ");
          } else {
            name.textContent = `${debugAssetName(tile.url)} #${tile.index + 1}`;
          }

          const meta = document.createElement("span");
          meta.className = "dd-sprite-grid__meta";
          const sheetLabel = match?.sheetLabel ?? tile.sheet;
          meta.textContent = `${sheetLabel} (${tile.col},${tile.row})`;

          item.append(displayCanvas, name, meta);
          item.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const label = match?.sheetLabel ?? debugAssetName(tile.url);
            const tileName = `${label}_#${String(tile.index + 1).padStart(3, "0")}.png`;
            void downloadCanvasAsPng(displayCanvas, tileName);
          });
          previewArea.appendChild(item);
        });
      }
    } else {
      if (!assets.length) {
        const empty = document.createElement("div");
        empty.className = "dd-sprite-grid__empty";
        empty.textContent = "No assets recorded for this selection yet.";
        previewArea.appendChild(empty);
      } else {
        assets.forEach((url) => {
          const item = document.createElement("a");
          item.className = "dd-sprite-grid__item";
          item.href = url;
          item.target = "_blank";
          item.rel = "noopener noreferrer";

          const img = document.createElement("img");
          img.className = "dd-sprite-grid__img";
          img.src = url;
          img.alt = debugAssetName(url);
          img.loading = "lazy";
          img.referrerPolicy = "no-referrer";

          const name = document.createElement("span");
          name.className = "dd-sprite-grid__name";
          name.textContent = debugAssetName(url);

          const meta = document.createElement("span");
          meta.className = "dd-sprite-grid__meta";
          meta.textContent = url;

          item.append(img, name, meta);
          previewArea.appendChild(item);
          item.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            void downloadUrlAsset(url);
          });
        });
      }
    }

    const familyLabel = selectedFamily === "all"
      ? "all families"
      : `family "${selectedFamily}" (${familyAssets.length})`;
    const categoryLabel = (selectedFamily === "all" || selectedCategory === "all")
      ? "all categories"
      : `category "${selectedCategory}"`;
    const summaryCount = tileCount !== null ? `${tileCount} tiles` : `${assets.length} assets`;
    stats.textContent = `${summaryCount} · ${familyLabel} · ${categoryLabel}`;
    updateExportStatusText();
  };

  familySelect.addEventListener("change", () => {
    selectedFamily = familySelect.value || "all";
    selectedCategory = "all";
    colorFilter = "None";
    conditionFilter = "None";
    lightingFilter = "None";
    updateCategoryOptions();
    renderFilters();
    void updateList();
  });

  categorySelect.addEventListener("change", () => {
    selectedCategory = categorySelect.value || "all";
    colorFilter = "None";
    conditionFilter = "None";
    lightingFilter = "None";
    renderFilters();
    void updateList();
  });

  updateCategoryOptions();
  void updateList();
  mutationIconsPromise
    .then((map) => {
      mutationIconsCache = map;
    })
    .catch(() => {
      mutationIconsCache = {};
    })
    .finally(() => {
      void updateList();
    });
}

function createSelectControl(labelText: string, select: HTMLSelectElement): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'dd-sprite-control';
  const label = document.createElement('span');
  label.className = 'dd-sprite-control__label';
  label.textContent = labelText;
  wrapper.append(label, select);
  return wrapper;
}

async function loadMutationIcons(): Promise<Record<string, MutationIconTile>> {
  const icons: Record<string, MutationIconTile> = {};
  const tiles = await loadTileSheet("mutations");

  // 1) mapping depuis les tileRefs du jeu vers les mutations logiques que ton core utilise
  const TILE_REF_TO_MUTATION_NAME: Record<string, MutationName> = {
    Wet: "Wet",
    Chilled: "Chilled",
    Frozen: "Frozen",
    Dawnlit: "Dawnlit",
    Amberlit: "Ambershine",
    Dawnbound: "Dawncharged",
    Amberbound: "Ambercharged",
  };

  for (const [key, rawIndex] of Object.entries(tileRefsMutations)) {
    if (typeof rawIndex !== "number") continue;
    const index = rawIndex > 0 ? rawIndex - 1 : rawIndex;
    const tile = tiles.find((t) => t.index === index);
    if (!tile) continue;

    // clé brute = tileRef (toujours utile pour debug)
    icons[key] = { tile };

    // clé logique = nom de mutation pour le rendu
    const logical = TILE_REF_TO_MUTATION_NAME[key];
    if (logical) {
      icons[logical] = { tile };
    }
  }

  console.debug("[Sprites] mutationIcons loaded", {
    keys: Object.keys(icons),
  });

  return icons;
}




