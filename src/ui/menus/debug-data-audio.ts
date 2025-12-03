import { Menu } from "../menu";
import { audioPlayer, type SfxInfo } from "../../core/audioPlayer";
import { copy, createTwoColumns, safeRegex } from "./debug-data-shared";

export function renderAudioPlayerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  let infoList: SfxInfo[] = [];
  let groupEntries: Array<[string, string[]]> = [];
  let visibleSounds: SfxInfo[] = [];

  const overviewCard = ui.card("🎧 Audio player", {
    tone: "muted",
    subtitle: "Inspect detected sounds, auto groups and Howler status.",
  });
  leftCol.appendChild(overviewCard.root);

  const summary = document.createElement("div");
  summary.className = "dd-audio-summary";
  const summarySounds = document.createElement("div");
  const summaryGroups = document.createElement("div");
  const summarySources = document.createElement("div");
  summary.append(summarySounds, summaryGroups, summarySources);

  const volumeLine = document.createElement("div");
  volumeLine.className = "dd-audio-volume";
  const finalLine = document.createElement("div");
  finalLine.className = "dd-audio-volume";

  const overviewError = ui.errorBar();

  const actionsRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const btnScan = ui.btn("Rescan sounds", {
    icon: "🔄",
    variant: "primary",
    onClick: () => { void refreshAll({ rescan: true }); },
  }) as HTMLButtonElement;
  const btnRefresh = ui.btn("Refresh snapshot", {
    icon: "🔁",
    onClick: () => { void refreshAll(); },
  }) as HTMLButtonElement;
  const btnCopyJson = ui.btn("Copy JSON", {
    icon: "📋",
    onClick: () => copy(audioPlayer.exportJSON()),
  }) as HTMLButtonElement;
  actionsRow.append(btnScan, btnRefresh, btnCopyJson);

  overviewCard.body.append(summary, volumeLine, finalLine, overviewError.el, actionsRow);

  const groupsCard = ui.card("🎛️ Groups", {
    tone: "muted",
    subtitle: "Browse auto-generated groups and play random variations.",
  });
  leftCol.appendChild(groupsCard.root);

  const groupToolbar = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const groupFilter = ui.inputText("filter groups (regex)", "");
  groupFilter.classList.add("dd-grow");
  const btnGroupClear = ui.btn("Clear", {
    icon: "🧹",
    onClick: () => {
      groupFilter.value = "";
      renderGroups();
      groupFilter.focus();
    },
  }) as HTMLButtonElement;
  groupToolbar.append(groupFilter, btnGroupClear);

  const groupInfo = document.createElement("p");
  groupInfo.className = "dd-card-description";
  groupInfo.style.margin = "0";

  const groupList = document.createElement("div");
  groupList.className = "dd-audio-list";

  const groupEmpty = document.createElement("div");
  groupEmpty.className = "dd-audio-empty";
  groupEmpty.textContent = "No groups match the current filter.";

  groupsCard.body.append(groupToolbar, groupInfo, groupList, groupEmpty);

  const soundsCard = ui.card("🔉 Sounds", {
    tone: "muted",
    subtitle: "Inspect detected files and trigger playback.",
  });
  rightCol.appendChild(soundsCard.root);

  const soundToolbar = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const soundFilter = ui.inputText("filter sounds (regex)", "");
  soundFilter.classList.add("dd-grow");
  const btnSoundClear = ui.btn("Clear", {
    icon: "🧹",
    onClick: () => {
      soundFilter.value = "";
      renderSounds();
      soundFilter.focus();
    },
  }) as HTMLButtonElement;
  const btnCopyVisible = ui.btn("Copy visible URLs", {
    icon: "📋",
    onClick: () => {
      if (!visibleSounds.length) return;
      copy(visibleSounds.map((s) => s.url).join("\n"));
    },
  }) as HTMLButtonElement;
  soundToolbar.append(soundFilter, btnSoundClear, btnCopyVisible);

  const soundInfo = document.createElement("p");
  soundInfo.className = "dd-card-description";
  soundInfo.style.margin = "0";

  const soundList = document.createElement("div");
  soundList.className = "dd-audio-list";

  const soundEmpty = document.createElement("div");
  soundEmpty.className = "dd-audio-empty";
  soundEmpty.textContent = "No sounds match the current filter.";

  soundsCard.body.append(soundToolbar, soundInfo, soundList, soundEmpty);

  groupFilter.addEventListener("input", () => renderGroups());
  groupFilter.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderGroups();
    }
  });

  soundFilter.addEventListener("input", () => renderSounds());
  soundFilter.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderSounds();
    }
  });

  let busy = false;

  function labelForSound(info: SfxInfo): string {
    return info.logicalName || info.name || fileNameFromUrl(info.url);
  }

  function fileNameFromUrl(url: string): string {
    try {
      return new URL(url, location.href).pathname.split("/").pop() || url;
    } catch {
      return url;
    }
  }

  function formatNumber(value: number | null | undefined, digits = 3): string {
    return value == null || Number.isNaN(value) || !Number.isFinite(value) ? "—" : value.toFixed(digits);
  }

  function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean) {
    const setter = (btn as any).setEnabled;
    if (typeof setter === "function") setter(enabled);
    else btn.disabled = !enabled;
  }

  const scanLabel = btnScan.querySelector(".label") as HTMLElement | null;
  const defaultScanText = scanLabel?.textContent ?? "Rescan sounds";

  function setScanButtonLoading(loading: boolean) {
    setButtonEnabled(btnScan, !loading);
    if (scanLabel) scanLabel.textContent = loading ? "Scanning…" : defaultScanText;
  }

  function refreshData() {
    infoList = audioPlayer.info().slice().sort((a, b) => labelForSound(a).localeCompare(labelForSound(b)));
    groupEntries = Object.entries(audioPlayer.groups()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function updateOverview() {
    const sources = new Set<string>();
    infoList.forEach((info) => {
      (info.sources || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((src) => sources.add(src));
    });
    const vol = audioPlayer.getGameSfxVolume();
    const howlerGlobal = (window as any)?.Howler;
    let howlerMaster: number | null = null;
    try {
      if (howlerGlobal && typeof howlerGlobal.volume === "function") {
        const val = howlerGlobal.volume();
        if (typeof val === "number" && Number.isFinite(val)) howlerMaster = val;
      }
    } catch {
      /* ignore */
    }
    const howlerCount = Array.isArray(howlerGlobal?._howls) ? howlerGlobal._howls.length : 0;

    summarySounds.innerHTML = `<strong>${infoList.length}</strong> sounds detected`;
    summaryGroups.innerHTML = `<strong>${groupEntries.length}</strong> auto groups`;
    summarySources.innerHTML = `<strong>${sources.size}</strong> unique source tags`;

    volumeLine.textContent = `Atom raw: ${formatNumber(vol.raw)} (clamped ${formatNumber(vol.clamped)})`;
    let suffix = "";
    if (howlerMaster != null) {
      suffix = ` · Howler master ${formatNumber(howlerMaster)}`;
      if (howlerCount) suffix += ` (${howlerCount} howl${howlerCount === 1 ? "" : "s"})`;
    } else if (howlerCount) {
      suffix = ` · ${howlerCount} howl${howlerCount === 1 ? "" : "s"} registered`;
    }
    finalLine.textContent = `Final output volume: ${formatNumber(vol.vol)}${suffix}`;
  }

  function renderGroups() {
    const rx = safeRegex(groupFilter.value.trim() || ".*");
    const infoByUrl = new Map(infoList.map((info) => [info.url, info] as const));
    groupList.innerHTML = "";
    let visible = 0;

    const matches = (value?: string | null) => !!value && rx.test(value);

    for (const [name, urls] of groupEntries) {
      const include = matches(name) || urls.some((url) => {
        const info = infoByUrl.get(url);
        return matches(url) || matches(info?.logicalName) || matches(info?.name);
      });
      if (!include) continue;
      visible++;

      const sampleUrl = urls[0] || "";
      const sampleInfo = infoByUrl.get(sampleUrl);

      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";

      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = name;

      const meta = document.createElement("div");
      meta.className = "dd-audio-meta";
      const parts: string[] = [];
      parts.push(`${urls.length} variation${urls.length === 1 ? "" : "s"}`);
      if (sampleInfo?.name) parts.push(`Sample: ${sampleInfo.name}`);
      if (sampleInfo?.sources) parts.push(`Sources: ${sampleInfo.sources}`);
      meta.textContent = parts.join(" • ");

      const urlEl = document.createElement("div");
      urlEl.className = "dd-audio-url";
      urlEl.textContent = sampleUrl || "(no sample)";

      infoWrap.append(title, meta, urlEl);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: false, align: "center" });
      actions.className = "dd-audio-actions";

      const playBtn = ui.btn("Play", {
        icon: "▶️",
        size: "sm",
        onClick: () => { audioPlayer.playGroup(name, { random: true }); },
      }) as HTMLButtonElement;
      const copyBtn = ui.btn("Copy URLs", {
        icon: "📋",
        size: "sm",
        onClick: () => copy(urls.join("\n")),
      }) as HTMLButtonElement;
      const openBtn = sampleUrl
        ? (ui.btn("Open", {
            icon: "🔗",
            size: "sm",
            onClick: () => { try { window.open(sampleUrl, "_blank", "noopener,noreferrer"); } catch {} },
          }) as HTMLButtonElement)
        : null;

      actions.append(playBtn, copyBtn);
      if (openBtn) actions.append(openBtn);
      row.appendChild(actions);

      groupList.appendChild(row);
    }

    groupInfo.textContent = groupEntries.length
      ? `${visible} / ${groupEntries.length} groups shown.`
      : "No groups have been detected yet. Run a rescan to populate the cache.";
    groupList.style.display = visible ? "" : "none";
    groupEmpty.textContent = groupEntries.length
      ? "No groups match the current filter."
      : "No groups detected yet. Run a rescan to populate the cache.";
    groupEmpty.style.display = visible ? "none" : "block";
    setButtonEnabled(btnGroupClear, groupFilter.value.trim().length > 0);
  }

  function renderSounds() {
    const rx = safeRegex(soundFilter.value.trim() || ".*");
    visibleSounds = [];
    soundList.innerHTML = "";
    const matches = (value?: string | null) => !!value && rx.test(value);

    for (const info of infoList) {
      if (!(matches(info.logicalName) || matches(info.name) || matches(info.sources) || matches(info.url))) continue;
      visibleSounds.push(info);

      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";

      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = labelForSound(info);

      const meta = document.createElement("div");
      meta.className = "dd-audio-meta";
      const parts: string[] = [];
      if (info.name && info.name !== info.logicalName) parts.push(`File: ${info.name}`);
      if (info.logicalName) parts.push(`Logical: ${info.logicalName}`);
      if (info.sources) parts.push(`Sources: ${info.sources}`);
      meta.textContent = parts.join(" • ");

      const urlEl = document.createElement("div");
      urlEl.className = "dd-audio-url";
      urlEl.textContent = info.url;

      infoWrap.append(title, meta, urlEl);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: false, align: "center" });
      actions.className = "dd-audio-actions";

      const playBtn = ui.btn("Play", {
        icon: "▶️",
        size: "sm",
        onClick: () => { audioPlayer.playUrl(info.url); },
      }) as HTMLButtonElement;
      const copyBtn = ui.btn("Copy", {
        icon: "📋",
        size: "sm",
        onClick: () => copy(info.url),
      }) as HTMLButtonElement;
      const openBtn = ui.btn("Open", {
        icon: "🔗",
        size: "sm",
        onClick: () => { try { window.open(info.url, "_blank", "noopener,noreferrer"); } catch {} },
      }) as HTMLButtonElement;

      actions.append(playBtn, copyBtn, openBtn);
      row.appendChild(actions);

      soundList.appendChild(row);
    }

    soundInfo.textContent = infoList.length
      ? `${visibleSounds.length} / ${infoList.length} sounds shown.`
      : "No sounds have been detected yet. Run a rescan to populate the cache.";
    soundList.style.display = visibleSounds.length ? "" : "none";
    soundEmpty.textContent = infoList.length
      ? "No sounds match the current filter."
      : "No sounds detected yet. Run a rescan to populate the cache.";
    soundEmpty.style.display = visibleSounds.length ? "none" : "block";
    setButtonEnabled(btnCopyVisible, visibleSounds.length > 0);
    setButtonEnabled(btnSoundClear, soundFilter.value.trim().length > 0);
  }

  async function refreshAll(opts: { rescan?: boolean } = {}) {
    if (busy) return;
    busy = true;
    const { rescan = false } = opts;
    overviewError.clear();
    if (rescan) setScanButtonLoading(true); else setButtonEnabled(btnScan, false);
    setButtonEnabled(btnRefresh, false);
    let scanError: unknown = null;

    try {
      if (rescan) {
        try {
          await audioPlayer.scan();
        } catch (err) {
          scanError = err;
        }
      }
      refreshData();
      updateOverview();
      renderGroups();
      renderSounds();
      if (scanError) {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        overviewError.show(`Scan failed: ${message}`);
        console.error("[debug] audio scan failed", scanError);
      }
    } finally {
      if (rescan) setScanButtonLoading(false); else setButtonEnabled(btnScan, true);
      setButtonEnabled(btnRefresh, true);
      busy = false;
    }
  }

  void refreshAll();
}

