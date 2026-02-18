// src/ui/menus/communityHub/roomPrivacyNotice.ts
// One-time informational notice explaining how public rooms work.
// Shown once per user (authenticated) until explicitly dismissed.

import { hasSeenRoomPrivacyNotice, markRoomPrivacyNoticeSeen } from "../../../utils/localStorage";
import { style } from "./shared";

export { hasSeenRoomPrivacyNotice };

const INFO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

export function createRoomPrivacyNotice(onDismiss: () => void): HTMLElement {
  // ── Overlay (fills the panel) ────────────────────────────────────────────
  const overlay = document.createElement("div");
  style(overlay, {
    position: "absolute",
    top: "0",
    right: "0",
    bottom: "0",
    left: "0",
    zIndex: "10",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(8,12,18,0.82)",
    backdropFilter: "blur(4px)",
    borderRadius: "18px",
  });

  // ── Card ─────────────────────────────────────────────────────────────────
  const card = document.createElement("div");
  style(card, {
    width: "min(460px, 88%)",
    background: "linear-gradient(160deg, rgba(20,28,42,0.99) 0%, rgba(12,18,28,0.99) 100%)",
    border: "1px solid rgba(94,234,212,0.22)",
    borderRadius: "14px",
    padding: "26px 26px 22px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    boxShadow: "0 8px 36px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
  });

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  });

  const iconWrap = document.createElement("span");
  iconWrap.innerHTML = INFO_ICON_SVG;
  style(iconWrap, { color: "#5eead4", flexShrink: "0", display: "flex" });

  const title = document.createElement("span");
  title.textContent = "Your room is visible to other mod users";
  style(title, { fontWeight: "700", fontSize: "14px", color: "#e7eef7", lineHeight: "1.3" });

  header.append(iconWrap, title);

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = document.createElement("p");
  body.textContent =
    "By default, your room is set to Public. This is intentional, it's what keeps the Rooms tab alive and lets players discover each other. If you're fine with that, no action needed.";
  style(body, {
    margin: "0",
    fontSize: "13px",
    color: "rgba(231,238,247,0.72)",
    lineHeight: "1.6",
  });

  // ── Steps ─────────────────────────────────────────────────────────────────
  const stepsLabel = document.createElement("p");
  stepsLabel.textContent = "If you want to play privately with friends only:";
  style(stepsLabel, {
    margin: "0",
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
  });

  const stepsList = document.createElement("div");
  style(stepsList, {
    margin: "0",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  });

  const STEPS: [string, string, string][] = [
    ["Go to ", "My Profile → Room Visibility", " and toggle it to Private"],
    ["Make sure ", "every mod user in your room", " does the same. One Public player is enough to make the whole room visible"],
  ];

  for (const [before, bold, after] of STEPS) {
    const p = document.createElement("p");
    style(p, { margin: "0", fontSize: "13px", color: "rgba(231,238,247,0.72)", lineHeight: "1.5" });
    const bSpan = document.createElement("strong");
    bSpan.textContent = bold;
    bSpan.style.color = "#e7eef7";
    p.append(before, bSpan, after);
    stepsList.appendChild(p);
  }

  // ── Tip ──────────────────────────────────────────────────────────────────
  const tip = document.createElement("p");
  const tipEm = document.createElement("em");
  tipEm.textContent =
    "Already left a room but people keep joining? Someone still in the room has it set to Public.";
  tip.appendChild(tipEm);
  style(tip, {
    margin: "0",
    fontSize: "12px",
    color: "rgba(231,238,247,0.48)",
    lineHeight: "1.5",
    borderLeft: "2px solid rgba(94,234,212,0.28)",
    paddingLeft: "10px",
  });

  // ── Dismiss button ────────────────────────────────────────────────────────
  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Got it, don't show again";
  style(dismissBtn, {
    marginTop: "2px",
    padding: "9px 18px",
    background: "rgba(94,234,212,0.1)",
    border: "1px solid rgba(94,234,212,0.28)",
    borderRadius: "8px",
    color: "#5eead4",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 150ms ease, border-color 150ms ease",
    alignSelf: "flex-end",
  });

  dismissBtn.addEventListener("mouseenter", () => {
    dismissBtn.style.background = "rgba(94,234,212,0.18)";
    dismissBtn.style.borderColor = "rgba(94,234,212,0.48)";
  });
  dismissBtn.addEventListener("mouseleave", () => {
    dismissBtn.style.background = "rgba(94,234,212,0.1)";
    dismissBtn.style.borderColor = "rgba(94,234,212,0.28)";
  });
  dismissBtn.addEventListener("click", () => {
    markRoomPrivacyNoticeSeen();
    onDismiss();
  });

  card.append(header, body, stepsLabel, stepsList, tip, dismissBtn);
  overlay.appendChild(card);
  return overlay;
}
