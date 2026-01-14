// src/ui/menus/misc.ts
import { Menu } from "../menu";
import { MiscService, DEFAULT_SEED_DELETE_DELAY_MS, DEFAULT_DECOR_DELETE_DELAY_MS } from "../../services/misc";
import { Atoms } from "../../store/atoms";

/* ---------------- helpers ---------------- */
const formatShortDuration = (seconds: number) => {
  if (seconds <= 0) return "Instant";
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (r === 0) return `${m} min`;
  return `${m} min ${r} s`;
};

/* ---------------- number formatting (US) ---------------- */
const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

const formatDurationShort = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
};

const formatFinishTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

const buildEstimateSentence = (count: number, delayMs: number, finishTimestamp: number | null): string => {
  if (count <= 0 || delayMs <= 0) return "";
  const durationMs = count * (delayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
  const durationText = formatDurationShort(durationMs);
  if (!finishTimestamp) return ` · Estimated time ${durationText}`;
  return ` · Estimated time ${durationText} (${formatFinishTime(finishTimestamp)})`;
};

/* ---------------- entry ---------------- */

export async function renderMiscMenu(container: HTMLElement) {
  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "grid";
  view.style.gap = "8px";
  view.style.minHeight = "0";
  view.style.justifyItems = "center";

  /* ===== Section: Auto reco ===== */
  const secAutoReco = (() => {
    const card = ui.card("🔄 Auto reconnect on session conflict", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "480px";
    card.body.style.display = "grid";
    card.body.style.gap = "10px";

    const header = ui.flexRow({ align: "center", justify: "between", fullWidth: true });
    const toggleWrap = document.createElement("div");
    toggleWrap.style.display = "inline-flex";
    toggleWrap.style.alignItems = "center";
    toggleWrap.style.gap = "8px";
    const toggleLabel = ui.label("Activate");
    toggleLabel.style.margin = "0";
    const toggle = ui.switch(MiscService.readAutoRecoEnabled(false)) as HTMLInputElement;
    toggleWrap.append(toggleLabel, toggle as unknown as HTMLElement);
    header.append(toggleWrap);

    const initialSeconds = Math.round(MiscService.getAutoRecoDelayMs() / 1000);
    const sliderRow = ui.flexRow({ align: "center", gap: 10, justify: "between", fullWidth: true });
    const sliderLabel = ui.label("Reconnect after");
    sliderLabel.style.margin = "0";
    const slider = ui.slider(0, 300, 30, initialSeconds) as HTMLInputElement;
    slider.style.flex = "1";
    const sliderValue = document.createElement("div");
    sliderValue.style.minWidth = "72px";
    sliderValue.style.textAlign = "right";
    sliderValue.textContent = formatShortDuration(initialSeconds);
    sliderRow.append(sliderLabel, slider, sliderValue);

    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.35";

    const clampSeconds = (value: number) =>
      Math.max(0, Math.min(300, Math.round(value / 30) * 30));

    const syncToggle = () => {
      const on = !!toggle.checked;
      slider.disabled = !on;
      MiscService.writeAutoRecoEnabled(on);
      hint.textContent = on
        ? "Automatically log back in if this account is disconnected because it was opened in another session."
        : "Auto reconnect on session conflict is turned off.";
    };

    const updateSlider = (raw: number, persist: boolean) => {
      const seconds = clampSeconds(raw);
      slider.value = String(seconds);
      sliderValue.textContent = formatShortDuration(seconds);
      if (persist) MiscService.setAutoRecoDelayMs(seconds * 1000);
      syncToggle();
    };

    toggle.addEventListener("change", syncToggle);
    slider.addEventListener("input", () => updateSlider(Number(slider.value), false));
    slider.addEventListener("change", () => updateSlider(Number(slider.value), true));

    syncToggle();

    card.body.append(header, sliderRow, hint);
    return card.root;
  })();

  /* ===== Section: Player controls (Ghost + Delay on same line) ===== */
  const secPlayer = (() => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.flexWrap = "wrap";

    const pair = (labelText: string, controlEl: HTMLElement, labelId?: string) => {
      const wrap = document.createElement("div");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";

      const lab = ui.label(labelText);
      lab.style.fontSize = "13px";
      lab.style.margin = "0";
      lab.style.justifySelf = "start";
      if (labelId) (lab as any).id = labelId;

      wrap.append(lab, controlEl);
      return wrap;
    };

    const ghostSwitch = ui.switch(MiscService.readGhostEnabled(false)) as HTMLInputElement;
    (ghostSwitch as any).id = "player.ghostMode";
    const ghostPair = pair("Ghost", ghostSwitch as unknown as HTMLElement, "label.ghost");

    const delayInput = ui.inputNumber(10, 1000, 5, 50) as HTMLInputElement;
    (delayInput as any).id = "player.moveDelay";
    const delayWrap = ((delayInput as any).wrap ?? delayInput) as HTMLElement;
    (delayWrap as any).style && ((delayWrap as any).style.margin = "0");
    (delayInput as any).style && ((delayInput as any).style.width = "84px");
    const delayPair = pair("Delay (ms)", delayWrap, "label.delay");

    row.append(ghostPair, delayPair);

    const ghost = MiscService.createGhostController();
    delayInput.value = String(MiscService.getGhostDelayMs());
    delayInput.addEventListener("change", () => {
      const v = Math.max(10, Math.min(1000, Math.floor(Number(delayInput.value) || 50)));
      delayInput.value = String(v);
      ghost.setSpeed?.(v);
      MiscService.setGhostDelayMs(v);
    });

    if (ghostSwitch.checked) ghost.start();
    ghostSwitch.onchange = () => {
      const on = !!ghostSwitch.checked;
      MiscService.writeGhostEnabled(on);
      on ? ghost.start() : ghost.stop();
    };

    (row as any).__cleanup__ = () => { try { ghost.stop(); } catch {} };

    const card = ui.card("🎮 Player controls", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(row);
    return card.root;
  })();

  /* ===== Section: Inventory slot reserve ===== */
  const secInventoryReserve = (() => {
    const card = ui.card("Inventory slot reserve", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.style.display = "grid";
    card.body.style.gap = "8px";

    const row = ui.flexRow({ align: "center", justify: "between", fullWidth: true });
    const toggleWrap = document.createElement("div");
    toggleWrap.style.display = "inline-flex";
    toggleWrap.style.alignItems = "center";
    toggleWrap.style.gap = "8px";
    const toggleLabel = ui.label("Keep 1 slot free");
    toggleLabel.style.margin = "0";
    const toggle = ui.switch(MiscService.readInventorySlotReserveEnabled(false)) as HTMLInputElement;
    toggleWrap.append(toggleLabel, toggle as unknown as HTMLElement);
    row.append(toggleWrap);

    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.fontSize = "12px";
    hint.textContent = "Blocks actions that would add a new inventory entry at 99/100. Mostly useful for pet swapping.";

    toggle.addEventListener("change", () => {
      MiscService.writeInventorySlotReserveEnabled(!!toggle.checked);
    });

    card.body.append(row, hint);
    return card.root;
  })();

  /* ===== Section: Seed deleter ===== */
  const secSeed = (() => {
    const grid = ui.formGrid({ columnGap: 6, rowGap: 6 });
    grid.style.gridTemplateColumns = "1fr";

    const selRow = document.createElement("div");
    selRow.style.display = "flex";
    selRow.style.alignItems = "center";
    selRow.style.justifyContent = "flex-start";
    selRow.style.gap = "8px";
    selRow.style.gridColumn = "1 / -1";

    const selLabel = ui.label("Selected");
    selLabel.style.fontSize = "13px";
    selLabel.style.margin = "0";

    const selValue = document.createElement("div");
    selValue.id = "misc.seedDeleter.summary";
    selValue.style.fontSize = "13px";
    selValue.style.opacity = "0.9";
    selValue.textContent = "0 species - 0 seeds";

    selRow.append(selLabel, selValue);
    grid.append(selRow);

    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.alignItems = "center";
    actionsRow.style.gap = "8px";
    actionsRow.style.justifyContent = "flex-start";
    actionsRow.style.gridColumn = "1 / -1";

    const actLabel = ui.label("Actions");
    actLabel.style.fontSize = "13px";
    actLabel.style.margin = "0";

    const actions = ui.flexRow({ gap: 6 });
    const btnSelect = ui.btn("Select seeds", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    actionsRow.append(actLabel, actions);
    grid.append(actionsRow);

    const statusLabel = ui.label("Status");
    statusLabel.style.fontSize = "13px";
    statusLabel.style.margin = "0";
    statusLabel.style.justifySelf = "start";

    const statusLine = document.createElement("div");
    statusLine.style.fontSize = "13px";
    statusLine.style.fontWeight = "600";
    statusLine.style.color = "#f9f9f9";
    statusLine.style.whiteSpace = "nowrap";
    statusLine.textContent = "Idle";

    const controlRow = ui.flexRow({ gap: 6 });
    const btnPause = ui.btn("Pause", { size: "sm" });
    const btnPlay = ui.btn("Play", { size: "sm" });
    const btnStop = ui.btn("Stop", { size: "sm", variant: "ghost" });
    btnPause.onclick = () => { MiscService.pauseSeedDeletion(); updateSeedControlState(); };
    btnPlay.onclick = () => { MiscService.resumeSeedDeletion(); updateSeedControlState(); };
    btnStop.onclick = () => { MiscService.cancelSeedDeletion(); updateSeedControlState(); };
    controlRow.append(btnPause, btnPlay, btnStop);

    const seedStatus = { species: "—", done: 0, total: 0, remaining: 0 };
    const describeSeedStatus = () => {
      const running = MiscService.isSeedDeletionRunning();
      const paused = MiscService.isSeedDeletionPaused();
      const target = seedStatus.species || "—";
      const base = `${target} (${seedStatus.done}/${seedStatus.total})`;
      if (!running) return "Idle";
      return paused ? `Paused · ${base}` : base;
    };
    const updateSeedStatusUI = () => {
      statusLine.textContent = describeSeedStatus();
    };
    const updateSeedControlState = () => {
      const running = MiscService.isSeedDeletionRunning();
      const paused = MiscService.isSeedDeletionPaused();
      btnPause.disabled = !running || paused;
      btnPlay.disabled = !running || !paused;
      btnStop.disabled = !running;
      updateSeedStatusUI();
    };

    let seedEstimatedFinish: number | null = null;
    let seedSummaryTimer: number | null = null;
    const clearSeedSummaryTimer = () => {
      if (seedSummaryTimer !== null) {
        clearTimeout(seedSummaryTimer);
        seedSummaryTimer = null;
      }
    };
    const scheduleSeedSummaryRefresh = () => {
      clearSeedSummaryTimer();
      seedSummaryTimer = window.setTimeout(() => updateSummaryUI(), 1000);
    };

    const onSeedProgress = (event: CustomEvent) => {
      const detail = event.detail;
      seedStatus.species = detail.species;
      seedStatus.done = detail.done;
      seedStatus.total = detail.total;
      seedStatus.remaining = detail.remainingForSpecies;
      updateSeedStatusUI();
      updateSeedControlState();
    };
    const onSeedComplete = () => {
      seedStatus.species = "—";
      seedStatus.done = 0;
      seedStatus.total = 0;
      seedStatus.remaining = 0;
      updateSeedStatusUI();
      updateSeedControlState();
    };
    const onSeedPaused = () => updateSeedControlState();
    const onSeedResumed = () => updateSeedControlState();
    window.addEventListener("qws:seeddeleter:progress", onSeedProgress as EventListener);
    window.addEventListener("qws:seeddeleter:done", onSeedComplete as EventListener);
    window.addEventListener("qws:seeddeleter:error", onSeedComplete as EventListener);
    window.addEventListener("qws:seeddeleter:paused", onSeedPaused as EventListener);
    window.addEventListener("qws:seeddeleter:resumed", onSeedResumed as EventListener);
    const cleanupSeedListeners = () => {
      window.removeEventListener("qws:seeddeleter:progress", onSeedProgress as EventListener);
      window.removeEventListener("qws:seeddeleter:done", onSeedComplete as EventListener);
      window.removeEventListener("qws:seeddeleter:error", onSeedComplete as EventListener);
      window.removeEventListener("qws:seeddeleter:paused", onSeedPaused as EventListener);
      window.removeEventListener("qws:seeddeleter:resumed", onSeedResumed as EventListener);
    };

    updateSeedStatusUI();
    updateSeedControlState();

    const statusRow = document.createElement("div");
    statusRow.style.display = "flex";
    statusRow.style.alignItems = "center";
    statusRow.style.gap = "8px";
    statusRow.style.gridColumn = "1 / -1";
    statusRow.append(statusLabel, controlRow, statusLine);
    grid.append(statusRow);

    function readSelection() {
      const sel = MiscService.getCurrentSeedSelection?.() || [];
      const speciesCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, speciesCount, totalQty };
    }
    function updateSummaryUI() {
      const { speciesCount, totalQty } = readSelection();
      const seedDelayMs = DEFAULT_SEED_DELETE_DELAY_MS;
      const estimateMs = totalQty * (seedDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      const isRunning = MiscService.isSeedDeletionRunning();
      const finishTimestamp = isRunning
        ? seedEstimatedFinish
        : estimateMs > 0
          ? Date.now() + estimateMs
          : null;
      const estimateText = buildEstimateSentence(totalQty, seedDelayMs, finishTimestamp);
      selValue.textContent = `${speciesCount} species - ${formatNum(totalQty)} seeds${estimateText}`;
      const has = speciesCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
      if (!isRunning && totalQty > 0) {
        scheduleSeedSummaryRefresh();
      } else {
        clearSeedSummaryTimer();
      }
    }

    btnSelect.onclick = async () => {
      try {
        await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
      } catch {}
      await MiscService.openSeedSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearSeedSelection?.(); } catch {}
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      const { totalQty } = readSelection();
      const seedDelayMs = DEFAULT_SEED_DELETE_DELAY_MS;
      const estimateMs = totalQty * (seedDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      seedEstimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
      clearSeedSummaryTimer();
      const deletionPromise = MiscService.deleteSelectedSeeds({ delayMs: seedDelayMs });
      updateSummaryUI();
      await deletionPromise;
      seedEstimatedFinish = null;
      updateSummaryUI();
    };

    const card = ui.card("Seed deleter", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(grid);
    (card.root as any).__cleanup__ = () => {
      clearSeedSummaryTimer();
      cleanupSeedListeners();
    };
    return card.root;
  })();
  /* ===== Section: Decor deleter ===== */
  const secDecor = (() => {
    const grid = ui.formGrid({ columnGap: 6, rowGap: 6 });
    grid.style.gridTemplateColumns = "1fr";

    const selRow = document.createElement("div");
    selRow.style.display = "flex";
    selRow.style.alignItems = "center";
    selRow.style.justifyContent = "flex-start";
    selRow.style.gap = "8px";
    selRow.style.gridColumn = "1 / -1";

    const selLabel = ui.label("Selected");
    selLabel.style.fontSize = "13px";
    selLabel.style.margin = "0";

    const selValue = document.createElement("div");
    selValue.id = "misc.decorDeleter.summary";
    selValue.style.fontSize = "13px";
    selValue.style.opacity = "0.9";
    selValue.textContent = "0 decor - 0 items";

    selRow.append(selLabel, selValue);
    grid.append(selRow);

    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.alignItems = "center";
    actionsRow.style.gap = "8px";
    actionsRow.style.justifyContent = "flex-start";
    actionsRow.style.gridColumn = "1 / -1";

    const actLabel = ui.label("Actions");
    actLabel.style.fontSize = "13px";
    actLabel.style.margin = "0";

    const actions = ui.flexRow({ gap: 6 });
    const btnSelect = ui.btn("Select decor", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    actionsRow.append(actLabel, actions);
    grid.append(actionsRow);


    const statusLabel = ui.label("Status");
    statusLabel.style.fontSize = "13px";
    statusLabel.style.margin = "0";
    statusLabel.style.justifySelf = "start";

    const statusLine = document.createElement("div");
    statusLine.style.fontSize = "13px";
    statusLine.style.fontWeight = "600";
    statusLine.style.color = "#f9f9f9";
    statusLine.style.whiteSpace = "nowrap";
    statusLine.textContent = "Idle";

    const controlRow = ui.flexRow({ gap: 6 });
    const btnPause = ui.btn("Pause", { size: "sm" });
    const btnPlay = ui.btn("Play", { size: "sm" });
    const btnStop = ui.btn("Stop", { size: "sm", variant: "ghost" });
    btnPause.onclick = () => { MiscService.pauseDecorDeletion(); updateDecorControlState(); };
    btnPlay.onclick = () => { MiscService.resumeDecorDeletion(); updateDecorControlState(); };
    btnStop.onclick = () => { MiscService.cancelDecorDeletion(); updateDecorControlState(); };
    controlRow.append(btnPause, btnPlay, btnStop);

    const decorStatus = { name: "—", done: 0, total: 0, remaining: 0 };
    const describeDecorStatus = () => {
      const running = MiscService.isDecorDeletionRunning();
      const paused = MiscService.isDecorDeletionPaused();
      const target = decorStatus.name || "—";
      const base = `${target} (${decorStatus.done}/${decorStatus.total})`;
      if (!running) return "Idle";
      return paused ? `Paused · ${base}` : base;
    };
    const updateDecorStatusUI = () => {
      statusLine.textContent = describeDecorStatus();
    };
    const updateDecorControlState = () => {
      const running = MiscService.isDecorDeletionRunning();
      const paused = MiscService.isDecorDeletionPaused();
      btnPause.disabled = !running || paused;
      btnPlay.disabled = !running || !paused;
      btnStop.disabled = !running;
      updateDecorStatusUI();
    };

    const onDecorProgress = (event: CustomEvent) => {
      const detail = event.detail;
      decorStatus.name = detail.decorId;
      decorStatus.done = detail.done;
      decorStatus.total = detail.total;
      decorStatus.remaining = detail.remainingForDecor;
      updateDecorStatusUI();
      updateDecorControlState();
    };
    const onDecorComplete = () => {
      decorStatus.name = "—";
      decorStatus.done = 0;
      decorStatus.total = 0;
      decorStatus.remaining = 0;
      updateDecorStatusUI();
      updateDecorControlState();
    };
    const onDecorPaused = () => updateDecorControlState();
    const onDecorResumed = () => updateDecorControlState();
    window.addEventListener("qws:decordeleter:progress", onDecorProgress as EventListener);
    window.addEventListener("qws:decordeleter:done", onDecorComplete as EventListener);
    window.addEventListener("qws:decordeleter:error", onDecorComplete as EventListener);
    window.addEventListener("qws:decordeleter:paused", onDecorPaused as EventListener);
    window.addEventListener("qws:decordeleter:resumed", onDecorResumed as EventListener);
    const cleanupDecorListeners = () => {
      window.removeEventListener("qws:decordeleter:progress", onDecorProgress as EventListener);
      window.removeEventListener("qws:decordeleter:done", onDecorComplete as EventListener);
      window.removeEventListener("qws:decordeleter:error", onDecorComplete as EventListener);
      window.removeEventListener("qws:decordeleter:paused", onDecorPaused as EventListener);
      window.removeEventListener("qws:decordeleter:resumed", onDecorResumed as EventListener);
    };

    updateDecorStatusUI();
    updateDecorControlState();

    let decorEstimatedFinish: number | null = null;
    let decorSummaryTimer: number | null = null;
    const clearDecorSummaryTimer = () => {
      if (decorSummaryTimer !== null) {
        clearTimeout(decorSummaryTimer);
        decorSummaryTimer = null;
      }
    };
    const scheduleDecorSummaryRefresh = () => {
      clearDecorSummaryTimer();
      decorSummaryTimer = window.setTimeout(() => updateSummaryUI(), 1000);
    };

    const statusRow = document.createElement("div");
    statusRow.style.display = "flex";
    statusRow.style.alignItems = "center";
    statusRow.style.gap = "8px";
    statusRow.style.gridColumn = "1 / -1";
    statusRow.append(statusLabel, controlRow, statusLine);
    grid.append(statusRow);

    function readSelection() {
      const sel = MiscService.getCurrentDecorSelection?.() || [];
      const decorCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, decorCount, totalQty };
    }
    function updateSummaryUI() {
      const { decorCount, totalQty } = readSelection();
      const decorDelayMs = DEFAULT_DECOR_DELETE_DELAY_MS * 2;
      const estimateMs = totalQty * (decorDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      const isRunning = MiscService.isDecorDeletionRunning();
      const finishTimestamp = isRunning
        ? decorEstimatedFinish
        : estimateMs > 0
          ? Date.now() + estimateMs
          : null;
      const estimateText = buildEstimateSentence(totalQty, decorDelayMs, finishTimestamp);
      selValue.textContent = decorCount + " decor - " + formatNum(totalQty) + " items" + estimateText;
      const has = decorCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
      if (!isRunning && totalQty > 0) {
        scheduleDecorSummaryRefresh();
      } else {
        clearDecorSummaryTimer();
      }
    }

    btnSelect.onclick = async () => {
      try {
        await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
      } catch {}
      await MiscService.openDecorSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      const { totalQty } = readSelection();
      const decorDelayMs = DEFAULT_DECOR_DELETE_DELAY_MS * 2;
      const estimateMs = totalQty * (decorDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      decorEstimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
      clearDecorSummaryTimer();
      const deletionPromise = MiscService.deleteSelectedDecor?.({ delayMs: DEFAULT_DECOR_DELETE_DELAY_MS });
      updateSummaryUI();
      if (deletionPromise) await deletionPromise;
      decorEstimatedFinish = null;
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearDecorSelection?.(); } catch {}
      updateSummaryUI();
    };

    const card = ui.card("Decor deleter", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(grid);
    (card.root as any).__cleanup__ = () => {
      clearDecorSummaryTimer();
      cleanupDecorListeners();
    };
    return card.root;
  })();
  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "8px";
  content.style.justifyItems = "center";
  content.append(secAutoReco, secPlayer, secInventoryReserve, secSeed, secDecor);

  view.appendChild(content);

  (view as any).__cleanup__ = () => {
    try { (secPlayer as any).__cleanup__?.(); } catch {}
    try { (secSeed as any).__cleanup__?.(); } catch {}
    try { (secDecor as any).__cleanup__?.(); } catch {}
  };
}
