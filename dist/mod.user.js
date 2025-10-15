// ==UserScript==
// @name         Mod Install Check
// @namespace    Romann.mods
// @version      1.0.0
// @description  Shows a big popup to confirm the mod is installed
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__MOD_INSTALL_CHECK_SHOWN__) return;
  window.__MOD_INSTALL_CHECK_SHOWN__ = true;

  const showPopup = () => {
    const css = `
      #modInstallOverlay {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.65);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      #modInstallOverlay .box {
        background: #0f1318; color: #fff;
        padding: 26px 30px; border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.45);
        text-align: center; max-width: 92vw;
        border: 1px solid rgba(255,255,255,.15);
      }
      #modInstallOverlay .title {
        font-size: 28px; font-weight: 900; letter-spacing: .02em;
        margin: 0 0 8px 0;
      }
      #modInstallOverlay .subtitle {
        font-size: 14px; opacity: .85; margin: 0 0 14px 0;
      }
      #modInstallOverlay .btn {
        margin-top: 8px; padding: 10px 16px; border-radius: 999px;
        border: 1px solid #7aa2ff; background: #1a2644; color: #fff; font-weight: 700;
        cursor: pointer;
      }
      #modInstallOverlay .btn:focus { outline: 2px solid #7aa2ff; outline-offset: 2px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'modInstallOverlay';
    overlay.innerHTML = `
      <div class="box" role="dialog" aria-label="Mod installation status">
        <div class="title">The mod has been installed!</div>
        <div class="subtitle">If you can read this, your setup works.</div>
        <button class="btn" type="button">Close</button>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

    setTimeout(() => { if (document.contains(overlay)) close(); }, 6000);
  };

  const ready = () => {
    if (document.body) { showPopup(); }
    else {
      new MutationObserver((_m, obs) => {
        if (document.body) { obs.disconnect(); showPopup(); }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();
