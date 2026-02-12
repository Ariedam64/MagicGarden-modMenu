import { requestApiKey } from "../utils/supabase";
import {
  hasApiKey,
  hasDeclinedApiAuth,
  setApiKey,
  setDeclinedApiAuth,
} from "../utils/localStorage";
import { isDiscordActivityContext } from "../utils/discordCsp";
import { triggerPlayerStateSyncNow } from "../utils/payload";

const AUTH_MODAL_STYLE_ID = "qws-auth-modal-style";
const AUTH_MODAL_ID = "qws-auth-modal";

function ensureAuthModalStyles(): void {
  if (document.getElementById(AUTH_MODAL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = AUTH_MODAL_STYLE_ID;
  style.textContent = `
.qws-auth-overlay{
  position:fixed;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
  background:rgba(6,9,14,0.72);
  backdrop-filter:blur(8px);
  z-index:var(--chakra-zIndices-DialogModal, 7200);
}
.qws-auth-card{
  width:min(640px, 94vw);
  background:radial-gradient(140% 140% at 0% 0%, rgba(28,36,56,0.98), rgba(12,16,26,0.98));
  border:1px solid rgba(148,163,184,0.22);
  border-radius:18px;
  padding:18px 20px 16px;
  color:#e2e8f0;
  box-shadow:0 24px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
  display:flex;
  flex-direction:column;
  gap:12px;
  font-family:var(--chakra-fonts-body, "Space Grotesk"), system-ui, sans-serif;
}
.qws-auth-header{
  display:flex;
  align-items:center;
  gap:12px;
}
.qws-auth-brand{
  font-size:11px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.12em;
  padding:4px 12px;
  border-radius:999px;
  border:1px solid rgba(56,189,248,0.4);
  background:rgba(56,189,248,0.12);
  color:#bae6fd;
  margin-left:auto;
  white-space:nowrap;
}
.qws-auth-icon{
  width:38px;
  height:38px;
  border-radius:12px;
  display:grid;
  place-items:center;
  background:rgba(59,130,246,0.18);
  border:1px solid rgba(59,130,246,0.55);
  color:#dbeafe;
  flex-shrink:0;
}
.qws-auth-icon svg{
  width:22px;
  height:22px;
  display:block;
}
.qws-auth-title{
  font-size:16px;
  font-weight:700;
  color:#f8fafc;
}
.qws-auth-subtitle{
  font-size:12.5px;
  color:rgba(226,232,240,0.7);
}
.qws-auth-hidden{
  display:none !important;
}
.qws-auth-divider{
  height:1px;
  background:linear-gradient(90deg, rgba(148,163,184,0.08), rgba(148,163,184,0.3), rgba(148,163,184,0.08));
}
.qws-auth-section{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-auth-section-title{
  font-size:12px;
  font-weight:600;
  color:#93c5fd;
  letter-spacing:0.02em;
}
.qws-auth-list{
  display:grid;
  gap:6px;
  font-size:12.5px;
  color:rgba(226,232,240,0.82);
}
.qws-auth-item{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-auth-bullet{
  width:18px;
  height:18px;
  border-radius:6px;
  display:grid;
  place-items:center;
  background:rgba(56,189,248,0.12);
  border:1px solid rgba(56,189,248,0.35);
  color:#7dd3fc;
  flex-shrink:0;
}
.qws-auth-bullet svg{
  width:12px;
  height:12px;
  display:block;
}
.qws-auth-link{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  color:#7dd3fc;
  cursor:pointer;
  background:none;
  border:none;
  padding:0;
  text-decoration:none;
}
.qws-auth-link:hover{ color:#bae6fd; }
.qws-auth-link svg{ width:12px; height:12px; }
.qws-auth-unlocks{
  font-size:12.5px;
  color:rgba(226,232,240,0.82);
}
.qws-auth-unlocks strong{ color:#f8fafc; font-weight:600; }
.qws-auth-status{
  font-size:12px;
  color:rgba(251,191,36,0.9);
  min-height:16px;
}
.qws-auth-actions{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.qws-auth-input-row{
  display:grid;
  gap:6px;
}
.qws-auth-input-label{
  font-size:12px;
  color:rgba(226,232,240,0.72);
}
.qws-auth-input{
  width:100%;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.16);
  background:rgba(8,12,20,0.75);
  color:#f8fafc;
  padding:9px 12px;
  font-size:12.5px;
  outline:none;
}
.qws-auth-input:focus{
  border-color:rgba(56,189,248,0.5);
}
.qws-auth-btn{
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.15);
  background:rgba(20,28,40,0.75);
  color:#f8fafc;
  font-weight:600;
  padding:9px 14px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:180px;
  flex:1 1 180px;
  transition:background 140ms ease, border 140ms ease, transform 140ms ease;
}
.qws-auth-btn:hover{ background:rgba(30,41,59,0.8); }
.qws-auth-btn.is-disabled{ opacity:0.6; cursor:not-allowed; }
.qws-auth-btn.primary{
  background:linear-gradient(135deg, #2dd4bf 0%, #38bdf8 100%);
  border-color:transparent;
  color:#0b1020;
}
.qws-auth-btn.ghost{
  background:rgba(148,163,184,0.12);
  border-color:rgba(248,250,252,0.2);
}
`;
  document.head.appendChild(style);
}

function ensureBodyReady(): Promise<void> {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function setButtonEnabled(button: HTMLButtonElement, enabled: boolean) {
  button.disabled = !enabled;
  button.classList.toggle("is-disabled", !enabled);
  button.setAttribute("aria-disabled", (!enabled).toString());
}

function createListItem(text: string, iconSvg: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "qws-auth-item";

  const bullet = document.createElement("span");
  bullet.className = "qws-auth-bullet";
  bullet.innerHTML = iconSvg;

  const label = document.createElement("span");
  label.textContent = text;

  item.append(bullet, label);
  return item;
}

export async function promptApiAuthOnStartup(): Promise<void> {
  if (hasApiKey() || hasDeclinedApiAuth()) return;
  await ensureBodyReady();
  showAuthModal();
}

function showAuthModal(): void {
  if (document.getElementById(AUTH_MODAL_ID)) return;
  ensureAuthModalStyles();

  const overlay = document.createElement("div");
  overlay.id = AUTH_MODAL_ID;
  overlay.className = "qws-auth-overlay";

  const card = document.createElement("div");
  card.className = "qws-auth-card";

  const header = document.createElement("div");
  header.className = "qws-auth-header";

  const icon = document.createElement("div");
  icon.className = "qws-auth-icon";
  icon.innerHTML =
    '<svg viewBox="0 0.5 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
    '<g clip-path="url(#clip0_537_21)">' +
    '<path d="M20.317 4.54101C18.7873 3.82774 17.147 3.30224 15.4319 3.00126C15.4007 2.99545 15.3695 3.00997 15.3534 3.039C15.1424 3.4203 14.9087 3.91774 14.7451 4.30873C12.9004 4.02808 11.0652 4.02808 9.25832 4.30873C9.09465 3.90905 8.85248 3.4203 8.64057 3.039C8.62448 3.01094 8.59328 2.99642 8.56205 3.00126C6.84791 3.30128 5.20756 3.82678 3.67693 4.54101C3.66368 4.54681 3.65233 4.5565 3.64479 4.56907C0.533392 9.29283 -0.31895 13.9005 0.0991801 18.451C0.101072 18.4733 0.11337 18.4946 0.130398 18.5081C2.18321 20.0401 4.17171 20.9701 6.12328 21.5866C6.15451 21.5963 6.18761 21.5847 6.20748 21.5585C6.66913 20.9179 7.08064 20.2424 7.43348 19.532C7.4543 19.4904 7.43442 19.441 7.39186 19.4246C6.73913 19.173 6.1176 18.8662 5.51973 18.5178C5.47244 18.4897 5.46865 18.421 5.51216 18.3881C5.63797 18.2923 5.76382 18.1926 5.88396 18.0919C5.90569 18.0736 5.93598 18.0697 5.96153 18.0813C9.88928 19.9036 14.1415 19.9036 18.023 18.0813C18.0485 18.0687 18.0788 18.0726 18.1015 18.091C18.2216 18.1916 18.3475 18.2923 18.4742 18.3881C18.5177 18.421 18.5149 18.4897 18.4676 18.5178C17.8697 18.8729 17.2482 19.173 16.5945 19.4236C16.552 19.4401 16.533 19.4904 16.5538 19.532C16.9143 20.2414 17.3258 20.9169 17.7789 21.5576C17.7978 21.5847 17.8319 21.5963 17.8631 21.5866C19.8241 20.9701 21.8126 20.0401 23.8654 18.5081C23.8834 18.4946 23.8948 18.4742 23.8967 18.452C24.3971 13.1911 23.0585 8.6212 20.3482 4.57004C20.3416 4.5565 20.3303 4.54681 20.317 4.54101ZM8.02002 15.6802C6.8375 15.6802 5.86313 14.577 5.86313 13.222C5.86313 11.8671 6.8186 10.7639 8.02002 10.7639C9.23087 10.7639 10.1958 11.8768 10.1769 13.222C10.1769 14.577 9.22141 15.6802 8.02002 15.6802ZM15.9947 15.6802C14.8123 15.6802 13.8379 14.577 13.8379 13.222C13.8379 11.8671 14.7933 10.7639 15.9947 10.7639C17.2056 10.7639 18.1705 11.8768 18.1516 13.222C18.1516 14.577 17.2056 15.6802 15.9947 15.6802Z" fill="#758CA3"/>' +
    "</g>" +
    "<defs>" +
    '<clipPath id="clip0_537_21">' +
    '<rect width="24" height="24" fill="white"/>' +
    "</clipPath>" +
    "</defs>" +
    "</svg>";

  const titleWrap = document.createElement("div");

  const title = document.createElement("div");
  title.className = "qws-auth-title";
  title.textContent = "Connect Discord to use Community Hub";

  const subtitle = document.createElement("div");
  subtitle.className = "qws-auth-subtitle";
  subtitle.textContent = "Optional. Skipping will disable social features.";

  titleWrap.append(title, subtitle);

  const brand = document.createElement("span");
  brand.className = "qws-auth-brand";
  brand.textContent = "ARIE'S MOD";

  header.append(icon, titleWrap, brand);

  const dividerTop = document.createElement("div");
  dividerTop.className = "qws-auth-divider";

  const iconCheck =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 12.5l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  const iconUser =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  const iconId =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M4 7.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M8 10.5h4M8 14h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    "</svg>";

  const iconBox =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M3.5 7.5 12 3l8.5 4.5-8.5 4.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M3.5 7.5V16.5L12 21l8.5-4.5V7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M12 12v9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    "</svg>";

  const whySection = document.createElement("div");
  whySection.className = "qws-auth-section";

  const whyTitle = document.createElement("div");
  whyTitle.className = "qws-auth-section-title";
  whyTitle.textContent = "Why this is needed";

  const whyList = document.createElement("div");
  whyList.className = "qws-auth-list";
  whyList.append(
    createListItem("Prevent impersonation and abuse", iconCheck),
    createListItem(
      "Protect leaderboards and community stats from manipulation",
      iconCheck,
    ),
    createListItem("Protect against message interception", iconCheck),
  );

  whySection.append(whyTitle, whyList);

  const dividerMid = document.createElement("div");
  dividerMid.className = "qws-auth-divider";

  const useSection = document.createElement("div");
  useSection.className = "qws-auth-section";

  const useTitle = document.createElement("div");
  useTitle.className = "qws-auth-section-title";
  useTitle.textContent = "What Arie's Mod uses";

  const useList = document.createElement("div");
  useList.className = "qws-auth-list";
  useList.append(
    createListItem(
      "In-game player information used by Community Hub (stats, garden, inventory, etc.)",
      iconBox,
    ),
  );
  useSection.append(useTitle, useList);

  const dividerBottom = document.createElement("div");
  dividerBottom.className = "qws-auth-divider";

  const unlocks = document.createElement("div");
  unlocks.className = "qws-auth-unlocks";
  unlocks.innerHTML =
    "<strong>Unlocks</strong> Public rooms / Friends / Messages / Groups / Leaderboards";

  const isDiscord = isDiscordActivityContext();
  let manualInput: HTMLInputElement | null = null;
  let manualRow: HTMLDivElement | null = null;
  let manualMode = false;

  const status = document.createElement("div");
  status.className = "qws-auth-status";
  status.textContent = "";

  const actions = document.createElement("div");
  actions.className = "qws-auth-actions";

  const refuseBtn = document.createElement("button");
  refuseBtn.type = "button";
  refuseBtn.className = "qws-auth-btn ghost";
  refuseBtn.textContent = "Continue without Discord";

  let authBtn: HTMLButtonElement | null = null;
  if (isDiscord) {
    const inputRow = document.createElement("div");
    inputRow.className = "qws-auth-input-row qws-auth-hidden";
    const inputLabel = document.createElement("div");
    inputLabel.className = "qws-auth-input-label";
    inputLabel.textContent =
      "Discord Activity cannot open popups. Paste your API key here.";
    const input = document.createElement("input");
    input.className = "qws-auth-input";
    input.type = "text";
    input.placeholder = "Paste your API key";
    manualInput = input;
    inputRow.append(inputLabel, input);
    manualRow = inputRow;

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "qws-auth-btn primary";
    openBtn.textContent = "Authenticate with Discord";
    authBtn = openBtn;

    actions.append(refuseBtn, openBtn);
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qws-auth-btn primary";
    btn.textContent = "Authenticate with Discord";
    authBtn = btn;
    actions.append(refuseBtn, btn);
  }

  const cardNodes: HTMLElement[] = [
    header,
    dividerTop,
    whySection,
    dividerMid,
    useSection,
    dividerBottom,
    unlocks,
  ];
  if (manualRow) cardNodes.push(manualRow);
  cardNodes.push(status, actions);
  card.append(...cardNodes);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const closeModal = () => {
    overlay.remove();
  };

  refuseBtn.addEventListener("click", () => {
    setDeclinedApiAuth(true);
    closeModal();
  });

  if (authBtn) {
    authBtn.addEventListener("click", async () => {
      status.textContent = "";
      if (isDiscord) {
        if (!manualMode) {
          manualMode = true;
          if (manualRow) manualRow.classList.remove("qws-auth-hidden");
          authBtn.textContent = "Save API key";
          manualInput?.focus();
          status.textContent = "After logging in, paste your API key below.";
            requestApiKey()
            .then(async (apiKey) => {
              if (!apiKey) return;
              setDeclinedApiAuth(false);
              await triggerPlayerStateSyncNow({ force: true });
              window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
              closeModal();
            })
            .catch(() => {});
          return;
        }

        const key = (manualInput?.value ?? "").trim();
        if (!key) {
          status.textContent = "Please paste your API key.";
          return;
        }
        setApiKey(key);
        setDeclinedApiAuth(false);
        await triggerPlayerStateSyncNow({ force: true });
        window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
        closeModal();
        return;
      }

      setButtonEnabled(authBtn, false);
      setButtonEnabled(refuseBtn, false);
      const originalLabel = authBtn.textContent || "";
      authBtn.textContent = "Authenticating...";

      const apiKey = await requestApiKey();

      if (apiKey) {
        setDeclinedApiAuth(false);
        await triggerPlayerStateSyncNow({ force: true });
        window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
        closeModal();
        return;
      }

      status.textContent =
        "Authentication failed. Please allow popups and try again.";
      authBtn.textContent = originalLabel;
      setButtonEnabled(authBtn, true);
      setButtonEnabled(refuseBtn, true);
    });
  }

  if (manualInput) {
    manualInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      authBtn?.click();
    });
  }
}


