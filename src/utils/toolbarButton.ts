// Inject a resilient button into the game's top-right toolbar
// Strategy: detect toolbar by known aria-label buttons, clone existing button styles,
// and append our button as the last item. Uses MutationObserver for resilience.

type Options = {
  onClick: () => void;
  iconUrl?: string;
  ariaLabel?: string;
  onMounted?: (btn: HTMLButtonElement) => void;
};

const KNOWN_ARIA = ["Chat", "Leaderboard", "Stats", "Open Activity Log"];
const PREFERRED_REF_ARIA = "Stats";

export function startInjectGamePanelButton(opts: Options): () => void {
  const { onClick, iconUrl = "", ariaLabel = "" } = opts;

  let mountedBtn: HTMLButtonElement | null = null;
  let mountedWrap: HTMLDivElement | null = null;
  let isMounting = false;
  let mounted = false;

  // Safe CSS.escape fallback
  const esc = (v: string) => {
    try {
      return typeof CSS?.escape === "function" ? CSS.escape(v) : v.replace(/"/g, '\\"');
    } catch {
      return v;
    }
  };

  // Find toolbar root by climbing up from known buttons
  function findToolbarRoot(): HTMLElement | null {
    const selector = KNOWN_ARIA.map(a => `button[aria-label="${esc(a)}"]`).join(",");
    const anyBtn = document.querySelector(selector);
    if (!anyBtn) return null;

    let parent = anyBtn.parentElement;
    while (parent && parent !== document.body) {
      const count = KNOWN_ARIA.reduce(
        (acc, a) => acc + parent!.querySelectorAll(`button[aria-label="${esc(a)}"]`).length,
        0
      );
      if (count >= 2) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  // Get reference button and wrapper for cloning
  function getReference(root: HTMLElement) {
    const all = Array.from(root.querySelectorAll<HTMLButtonElement>("button[aria-label]"));
    if (!all.length) return { refBtn: null, refWrapper: null };

    // Exclude our own buttons
    const filtered = all.filter(
      b => b.dataset.qwsBtn !== "true" && b.getAttribute("aria-label") !== ariaLabel
    );
    const list = filtered.length ? filtered : all;

    // Prefer Stats button, otherwise second-to-last
    const preferred = list.find(
      b => b.getAttribute("aria-label")?.toLowerCase() === PREFERRED_REF_ARIA.toLowerCase()
    );
    const idx = list.length >= 2 ? list.length - 2 : list.length - 1;
    const refBtn = preferred || list[idx];

    const parent = refBtn?.parentElement;
    const refWrapper =
      parent?.parentElement === root && parent.tagName === "DIV" ? parent : null;

    return { refBtn, refWrapper };
  }

  // Clone button from reference
  function cloneButton(ref: HTMLButtonElement): HTMLButtonElement {
    const btn = ref.cloneNode(false) as HTMLButtonElement;
    btn.type = "button";
    btn.setAttribute("aria-label", ariaLabel);
    btn.title = ariaLabel;
    btn.dataset.qwsBtn = "true";
    btn.style.pointerEvents = "auto";
    btn.removeAttribute("id");

    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "QWS";
      Object.assign(img.style, {
        pointerEvents: "none",
        userSelect: "none",
        width: "60%",
        height: "60%",
        objectFit: "contain",
        display: "block",
        margin: "auto",
      });
      btn.appendChild(img);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        onClick();
      } catch {}
    });

    return btn;
  }

  // Mount button into toolbar
  function mount(): boolean {
    if (isMounting) return false;
    isMounting = true;

    try {
      const root = findToolbarRoot();
      if (!root) return false;

      const { refBtn, refWrapper } = getReference(root);
      if (!refBtn) return false;

      // Find or create wrapper
      if (!mountedWrap) {
        mountedWrap = root.querySelector<HTMLDivElement>('div[data-qws-wrapper="true"]');
        if (!mountedWrap && refWrapper) {
          mountedWrap = refWrapper.cloneNode(false) as HTMLDivElement;
          mountedWrap.dataset.qwsWrapper = "true";
          mountedWrap.removeAttribute("id");
        }
      }

      // Find or create button
      if (!mountedBtn) {
        mountedBtn =
          mountedWrap?.querySelector<HTMLButtonElement>('button[data-qws-btn="true"]') || null;
        if (!mountedBtn) {
          mountedBtn = cloneButton(refBtn);
          if (mountedWrap) {
            mountedWrap.appendChild(mountedBtn);
          } else {
            root.appendChild(mountedBtn);
          }
        }
      }

      // Append wrapper to toolbar if needed
      if (mountedWrap && mountedWrap.parentElement !== root) {
        root.appendChild(mountedWrap);
      }

      // Verify button is in DOM
      const inDOM = document.contains(mountedBtn);
      if (inDOM && !mounted) {
        mounted = true;
        console.log("[ToolbarButton] Mounted:", ariaLabel);
        try { opts.onMounted?.(mountedBtn); } catch {}
      }

      return inDOM;
    } finally {
      isMounting = false;
    }
  }

  // Mutation observer with debounced retry
  const host = document.getElementById("App") || document.body;
  let timer: number | null = null;

  const observer = new MutationObserver(() => {
    // Skip if already mounted and in DOM
    if (mounted && mountedBtn && document.contains(mountedBtn)) return;

    // Reset if button was removed
    if (mountedBtn && !document.contains(mountedBtn)) {
      console.warn("[ToolbarButton] Removed from DOM, retrying:", ariaLabel);
      mounted = false;
      mountedBtn = null;
      mountedWrap = null;
    }

    // Debounced retry
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      mount();
    }, 100);
  });

  // Polling fallback: check every 2 seconds if button is still mounted
  // This catches edge cases where MutationObserver misses DOM changes
  const pollingInterval = window.setInterval(() => {
    // If button should be mounted but isn't in DOM, remount
    if (mounted && mountedBtn && !document.contains(mountedBtn)) {
      console.warn("[ToolbarButton] Detected missing button (polling), remounting:", ariaLabel);
      mounted = false;
      mountedBtn = null;
      mountedWrap = null;
      mount();
    }
    // If not mounted at all, try mounting (handles toolbar appearing late)
    else if (!mounted || !mountedBtn) {
      mount();
    }
  }, 2000);

  // Initial mount
  mount();

  // Start observing
  observer.observe(host, { childList: true, subtree: true });

  // Return cleanup function
  return () => {
    observer.disconnect();
    clearInterval(pollingInterval);
    mountedWrap?.remove();
    mountedBtn = null;
    mountedWrap = null;
  };
}
