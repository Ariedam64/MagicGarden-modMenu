import { createMessagesTab, type MessagesTabHandle } from "./tabs/messagesTab";
import { createCommunityTab } from "./tabs/communityTab";
import { createGroupsTab } from "./tabs/groupsTab";
import { createSettingsTab } from "./tabs/settingsTab";

const STYLE_ID = "qws-friend-overlay-css";

const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
};

type TabId = "messages" | "community" | "groups" | "settings";

declare global {
  interface Window {
    __qws_friend_overlay_last_tab?: TabId;
    __qws_friend_overlay_last_community_tab?: "friends" | "add" | "requests";
  }
}

type TabInstance = {
  id: TabId;
  root: HTMLElement;
  show?: () => void;
  hide?: () => void;
  destroy?: () => void;
  refresh?: () => void;
};

type KeyTrapCleanup = () => void;

function installInputKeyTrap(scope: HTMLElement): KeyTrapCleanup {
  const isEditable = (el: Element | null) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "").toLowerCase();
      return t === "text" || t === "number" || t === "search";
    }
    return el.isContentEditable === true;
  };

  const inScope = (node: Element | null) =>
    !!(node && (scope.contains(node) || (node as HTMLElement).closest?.(".qws-fo-panel")));

  const handler = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    if (!((inScope(target) && isEditable(target)) || (inScope(active) && isEditable(active)))) return;
    ev.stopPropagation();
    (ev as any).stopImmediatePropagation?.();
  };

  const types: (keyof WindowEventMap)[] = ["keydown", "keypress", "keyup"];
  types.forEach((t) => {
    window.addEventListener(t, handler as EventListener, { capture: true });
    document.addEventListener(t, handler as EventListener, { capture: true });
    scope.addEventListener(t, handler as EventListener, { capture: true });
  });

  return () => {
    types.forEach((t) => {
      window.removeEventListener(t, handler as EventListener, { capture: true } as any);
      document.removeEventListener(t, handler as EventListener, { capture: true } as any);
      scope.removeEventListener(t, handler as EventListener, { capture: true } as any);
    });
  };
}

function ensureFriendOverlayStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-fo-panel{
  position:fixed;
  top:50%;
  left:50%;
  width:min(980px, 95vw);
  height:min(78vh, 640px);
  max-height:78vh;
  display:none;
  border-radius:18px;
  border:1px solid rgba(255,255,255,0.14);
  background:linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%);
  backdrop-filter:blur(10px);
  color:#e7eef7;
  box-shadow:0 18px 44px rgba(0,0,0,.45);
  overflow:hidden;
  z-index:var(--chakra-zIndices-DialogModal, 7010);
  opacity:0;
  transform:translate(-50%, calc(-50% + 6px));
  pointer-events:none;
  transition:opacity 180ms ease, transform 180ms ease;
}
.qws-fo-panel.open{
  opacity:1;
  transform:translate(-50%, -50%);
  pointer-events:auto;
}
.qws-fo-panel *{ box-sizing:border-box; }
.qws-fo-head{
  padding:12px 16px;
  font-weight:700;
  letter-spacing:0.01em;
  border-bottom:1px solid rgba(255,255,255,0.08);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  background:linear-gradient(120deg, rgba(22,28,40,0.9), rgba(12,17,26,0.92));
  cursor:grab;
  user-select:none;
}
.qws-fo-title{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:14px;
}
.qws-fo-body{
  display:grid;
  grid-template-columns:180px 1fr;
  height:calc(100% - 48px);
  min-height:0;
}
.qws-fo-nav{
  border-right:1px solid rgba(255,255,255,0.08);
  padding:12px 10px;
  display:flex;
  flex-direction:column;
  gap:6px;
  background:rgba(10,14,20,0.7);
}
.qws-fo-nav-btn{
  border:none;
  background:transparent;
  color:#c9d4e6;
  padding:10px 12px;
  border-radius:12px;
  display:flex;
  align-items:center;
  gap:10px;
  cursor:pointer;
  font-size:12px;
  transition:background 120ms ease, color 120ms ease, border 120ms ease;
  border:1px solid transparent;
  position:relative;
}
.qws-fo-nav-btn:hover{
  background:rgba(94,234,212,0.08);
  color:#e7eef7;
}
.qws-fo-nav-btn.active{
  background:rgba(94,234,212,0.18);
  border-color:rgba(94,234,212,0.35);
  color:#ecfdf5;
}
.qws-fo-nav-icon{
  width:20px;
  height:20px;
  border-radius:8px;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.08);
  font-size:12px;
  color:#dbe7f5;
}
.qws-fo-nav-icon svg{
  width:14px;
  height:14px;
  display:block;
}
.qws-fo-btn__icon svg{
  width:14px;
  height:14px;
  display:block;
}
.qws-fo-nav-badge{
  margin-left:auto;
  min-width:20px;
  height:20px;
  padding:0 6px;
  border-radius:999px;
  background:#ef4444;
  color:#fff;
  font-size:11px;
  font-weight:700;
  display:none;
  align-items:center;
  justify-content:center;
}
.qws-fo-content{
  position:relative;
  overflow:hidden;
  padding:12px;
}
.qws-fo-community{
  display:flex;
  flex-direction:column;
  gap:10px;
  height:100%;
  min-height:0;
}
.qws-fo-community-list{
  display:flex;
  flex-direction:column;
  gap:10px;
  flex:1;
  min-height:0;
}
.qws-fo-community-tabshell{
  display:flex;
  flex-direction:column;
  gap:10px;
  flex:1;
  min-height:0;
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(10,14,20,0.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
}
.qws-fo-community-tabs{
  display:grid;
  grid-template-columns:repeat(3, minmax(0, 1fr));
  align-items:center;
  gap:6px;
  width:100%;
}
.qws-fo-community-tab-btn{
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(17,24,39,0.6);
  color:#e2e8f0;
  padding:6px 10px;
  border-radius:10px;
  font-size:12px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:6px;
  transition:background 120ms ease, border 120ms ease, color 120ms ease;
  position:relative;
  justify-content:center;
  width:100%;
  white-space:nowrap;
}
.qws-fo-community-tab-btn.active{
  background:rgba(59,130,246,0.18);
  border-color:rgba(59,130,246,0.4);
  color:#f8fafc;
}
.qws-fo-community-tab-badge{
  min-width:18px;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:#ef4444;
  color:#fff;
  font-size:11px;
  font-weight:700;
  display:none;
  align-items:center;
  justify-content:center;
}
.qws-fo-community-body{
  flex:1;
  min-height:0;
  position:relative;
  display:flex;
  flex-direction:column;
}
.qws-fo-community-panel{
  display:none;
  flex-direction:column;
  min-height:0;
  height:100%;
}
.qws-fo-community-panel.active{
  display:flex;
}
.qws-fo-community-profile{
  display:none;
  flex-direction:column;
  gap:12px;
  flex:1;
  min-height:0;
}
.qws-fo-community-profile.active{
  display:flex;
}
.qws-fo-groups-layout{
  display:grid;
  grid-template-columns:240px 1fr;
  gap:12px;
  flex:1;
  min-height:0;
}
.qws-fo-groups-list{
  display:flex;
  flex-direction:column;
  gap:8px;
  min-height:0;
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(10,14,20,0.55);
}
.qws-fo-groups-list-title{
  font-size:12px;
  font-weight:700;
  color:#e2e8f0;
}
.qws-fo-groups-create{
  display:flex;
  gap:6px;
  align-items:center;
}
.qws-fo-groups-create .qws-fo-input{
  flex:1;
  min-width:0;
}
.qws-fo-groups-list-status{
  font-size:11px;
  color:rgba(226,232,240,0.7);
}
.qws-fo-groups-list-body{
  display:flex;
  flex-direction:column;
  gap:6px;
  overflow:auto;
  min-height:0;
  padding-right:4px;
}
.qws-fo-groups-empty{
  font-size:12px;
  color:rgba(226,232,240,0.6);
  text-align:center;
  padding:12px 8px;
}
.qws-fo-group-row{
  display:flex;
  flex-direction:column;
  gap:4px;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(15,20,30,0.6);
  cursor:pointer;
  transition:background 140ms ease, border 140ms ease;
}
.qws-fo-group-row:hover{
  border-color:rgba(59,130,246,0.3);
  background:rgba(30,41,59,0.55);
}
.qws-fo-group-row.active{
  border-color:rgba(59,130,246,0.45);
  background:rgba(30,41,59,0.7);
}
.qws-fo-group-row-title{
  font-size:12px;
  font-weight:700;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-group-row-meta{
  font-size:10px;
  color:rgba(226,232,240,0.65);
}
.qws-fo-group-chat{
  display:flex;
  flex-direction:column;
  min-height:0;
  flex:1;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(12,16,24,0.6);
}
.qws-fo-group-head{
  padding:10px 12px;
  border-bottom:1px solid rgba(255,255,255,0.08);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.qws-fo-group-head-left{
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:0;
}
.qws-fo-group-head-title{
  font-size:13px;
  font-weight:700;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-group-head-meta{
  font-size:11px;
  color:rgba(226,232,240,0.6);
}
.qws-fo-group-body{
  display:flex;
  flex-direction:column;
  min-height:0;
  flex:1;
}
.qws-fo-group-messages{
  flex:1;
  min-height:0;
  overflow:auto;
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.qws-fo-group-empty{
  font-size:12px;
  color:rgba(226,232,240,0.6);
  text-align:center;
  margin:auto;
}
.qws-fo-group-message{
  display:flex;
  flex-direction:column;
  gap:3px;
  max-width:80%;
}
.qws-fo-group-message.me{
  align-self:flex-end;
  text-align:right;
}
.qws-fo-group-msg-name{
  font-size:10px;
  color:rgba(226,232,240,0.6);
}
.qws-fo-group-bubble{
  padding:8px 10px;
  border-radius:12px;
  background:rgba(30,41,59,0.7);
  border:1px solid rgba(255,255,255,0.06);
  font-size:12px;
  color:#f8fafc;
  line-height:1.4;
  white-space:pre-wrap;
}
.qws-fo-group-message.me .qws-fo-group-bubble{
  background:rgba(34,211,238,0.18);
  border-color:rgba(34,211,238,0.35);
}
.qws-fo-group-input-row{
  display:flex;
  gap:8px;
  padding:10px;
  border-top:1px solid rgba(255,255,255,0.08);
}
.qws-fo-group-input{
  flex:1;
  min-width:0;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.65);
  color:#f8fafc;
  padding:8px 10px;
  font-size:12px;
}
.qws-fo-group-details{
  flex:1;
  min-height:0;
  overflow:auto;
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.qws-fo-group-hero{
  padding:12px 14px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.1);
  background:linear-gradient(135deg, rgba(30,41,59,0.55), rgba(17,24,39,0.8));
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-fo-group-hero-title{
  font-size:16px;
  font-weight:700;
  color:#f8fafc;
}
.qws-fo-group-hero-meta{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.qws-fo-group-chip{
  padding:3px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.7);
  color:rgba(226,232,240,0.85);
  font-size:11px;
  font-weight:600;
}
.qws-fo-group-section{
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(10,14,20,0.55);
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.qws-fo-group-section-title{
  font-size:11px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.1em;
  color:rgba(147,197,253,0.8);
}
.qws-fo-group-info-grid{
  display:grid;
  gap:8px;
}
.qws-fo-group-info-row{
  display:flex;
  justify-content:space-between;
  gap:10px;
  font-size:12px;
  color:#e2e8f0;
}
.qws-fo-group-info-label{
  font-weight:700;
  color:rgba(226,232,240,0.65);
}
.qws-fo-group-info-value{
  font-weight:600;
  color:#f8fafc;
}
.qws-fo-group-manage-row{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-group-input{
  flex:1;
  min-width:0;
}
.qws-fo-group-danger-hint{
  font-size:11px;
  color:rgba(226,232,240,0.65);
  flex:1;
}
.qws-fo-group-members-list{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.qws-fo-group-member-row{
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(15,23,42,0.6);
}
.qws-fo-group-member-avatar{
  width:32px;
  height:32px;
  border-radius:50%;
  background:rgba(255,255,255,0.08);
  display:grid;
  place-items:center;
  font-size:12px;
  font-weight:700;
  color:#f8fafc;
  flex:0 0 32px;
  overflow:hidden;
  position:relative;
}
.qws-fo-group-member-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-fo-group-member-avatar img.qws-fo-group-member-avatar-layer{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:contain;
  transform:scale(1.8);
  transform-origin:50% 18%;
}
.qws-fo-group-member-text{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
  flex:1;
}
.qws-fo-group-member-name{
  font-size:12px;
  font-weight:600;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-group-member-meta{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:11px;
  color:rgba(226,232,240,0.6);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-group-member-id{
  color:rgba(226,232,240,0.6);
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-group-role-badge{
  padding:2px 6px;
  border-radius:999px;
  border:1px solid rgba(59,130,246,0.35);
  background:rgba(59,130,246,0.18);
  color:#dbeafe;
  font-weight:700;
  text-transform:capitalize;
  white-space:nowrap;
}
.qws-fo-group-member-actions{
  display:flex;
  gap:6px;
  margin-left:auto;
}
.qws-fo-group-modal{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(5, 8, 15, 0.6);
  backdrop-filter:blur(6px);
  z-index:20;
}
.qws-fo-group-modal-card{
  width:min(520px, 92%);
  max-height:80%;
  overflow:auto;
  border-radius:16px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(10,14,20,0.95);
  box-shadow:0 18px 44px rgba(0,0,0,0.5);
  padding:14px;
  display:flex;
  flex-direction:column;
  gap:12px;
}
.qws-fo-group-modal-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.qws-fo-group-modal-title{
  font-size:13px;
  font-weight:700;
  color:#f8fafc;
}
@media (max-width: 820px){
  .qws-fo-groups-layout{
    grid-template-columns:1fr;
  }
  .qws-fo-groups-list{
    max-height:200px;
  }
}
.qws-fo-garden-preview{
  position:fixed;
  inset:0;
  display:none;
  align-items:flex-start;
  justify-content:center;
  background:transparent;
  z-index:var(--chakra-zIndices-DialogModal, 7010);
  pointer-events:none;
  padding-top:60px;
}
.qws-fo-garden-preview.active{
  display:flex;
}
.qws-fo-garden-preview-card{
  pointer-events:auto;
  background:rgba(15,20,30,0.92);
  border:1px solid rgba(255,255,255,0.12);
  border-radius:16px;
  padding:16px 18px;
  min-width:260px;
  display:flex;
  flex-direction:column;
  gap:8px;
  box-shadow:0 16px 40px rgba(0,0,0,0.5);
  text-align:center;
}
.qws-fo-garden-preview-title{
  font-size:14px;
  font-weight:700;
  color:#f8fafc;
}
.qws-fo-garden-preview-actions{
  display:flex;
  justify-content:center;
  margin-top:4px;
}
.qws-fo-profile-top{
  display:flex;
  align-items:center;
  gap:10px;
  justify-content:space-between;
}
.qws-fo-profile-top-left{
  display:flex;
  align-items:center;
  gap:10px;
}
.qws-fo-profile-title{
  font-size:13px;
  font-weight:700;
  color:#e2e8f0;
}
.qws-fo-profile-card{
  border-radius:16px;
  border:1px solid rgba(255,255,255,0.1);
  background:rgba(15,20,30,0.65);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
  padding:14px;
  display:grid;
  gap:14px;
}
.qws-fo-profile-coins{
  display:none;
  align-items:center;
  gap:8px;
  padding:8px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.1);
  background:rgba(15,23,42,0.65);
}
.qws-fo-profile-group{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.1);
  background:rgba(15,23,42,0.5);
}
.qws-fo-profile-group-title{
  font-size:11px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(147,197,253,0.8);
}
.qws-fo-profile-group-row{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-profile-group-select{
  flex:1;
  min-width:0;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.7);
  color:#f8fafc;
  padding:6px 8px;
  font-size:12px;
}
.qws-fo-profile-group-status{
  font-size:11px;
  color:rgba(226,232,240,0.65);
}
.qws-fo-profile-coins-icon{
  width:18px;
  height:18px;
  flex:0 0 18px;
  object-fit:contain;
}
.qws-fo-profile-coins-value{
  font-size:13px;
  font-weight:700;
  color:#f8fafc;
  letter-spacing:0.01em;
}
.qws-fo-profile-header{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
  justify-content:space-between;
  flex-wrap:wrap;
}
.qws-fo-profile-info{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
  flex:1 1 auto;
}
.qws-fo-profile-actions{
  display:flex;
  align-items:center;
  gap:8px;
  flex:0 0 auto;
  margin-left:auto;
}
.qws-fo-profile-remove{
  padding:6px 10px;
  font-size:12px;
}
.qws-fo-chat-btn{
  width:36px;
  height:36px;
  padding:0;
  display:flex;
  align-items:center;
  justify-content:center;
}
.qws-fo-chat-btn .qws-fo-btn__label{
  display:none;
}
.qws-fo-chat-btn .qws-fo-btn__icon{
  margin:0;
  display:flex;
  align-items:center;
  justify-content:center;
}
.qws-fo-chat-btn .qws-fo-btn__icon svg{
  width:16px;
  height:16px;
}
.qws-fo-profile-join{
  display:flex;
  align-items:center;
  gap:6px;
  flex-direction:column;
  align-items:flex-end;
}
.qws-fo-profile-seat{
  padding:3px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.7);
  color:rgba(148,163,184,0.9);
  font-size:11px;
  font-weight:600;
  line-height:1;
  white-space:nowrap;
}
.qws-fo-profile-avatar{
  width:64px;
  height:64px;
  border-radius:16px;
  overflow:hidden;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.06);
  font-weight:700;
  position:relative;
  border:3px solid rgba(148,163,184,0.3);
  transition:border-color 200ms ease;
}
.qws-fo-profile-status-pill.online ~ * .qws-fo-profile-avatar,
.qws-fo-profile-name-row:has(.qws-fo-profile-status-pill.online) ~ * .qws-fo-profile-avatar{
  border-color:rgba(52,211,153,0.5);
  box-shadow:0 0 0 4px rgba(52,211,153,0.1);
}
  font-size:18px;
  color:#f8fafc;
}
.qws-fo-profile-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-fo-profile-headline{
  display:flex;
  flex-direction:column;
  gap:6px;
  min-width:0;
}
.qws-fo-profile-name-row{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.qws-fo-profile-name{
  font-size:16px;
  font-weight:700;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-profile-status-pill{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:3px 10px;
  border-radius:999px;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.02em;
  background:rgba(248,113,113,0.18);
  color:#fecaca;
  border:1px solid rgba(248,113,113,0.35);
}
.qws-fo-profile-status-pill.online{
  background:rgba(52,211,153,0.18);
  color:#bbf7d0;
  border-color:rgba(52,211,153,0.35);
}
.qws-fo-profile-status-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  background:#f87171;
}
.qws-fo-profile-status-pill.online .qws-fo-profile-status-dot{
  background:#34d399;
}
.qws-fo-profile-meta{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  font-size:11px;
  color:rgba(226,232,240,0.7);
}
.qws-fo-profile-chip{
  padding:3px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.7);
  color:rgba(148,163,184,0.9);
  font-size:11px;
  white-space:nowrap;
  overflow:visible;
  text-overflow:clip;
  max-width:none;
}
.qws-fo-profile-grid{
  display:flex;
  flex-direction:column;
  gap:12px;
}
.qws-fo-profile-section{
  border-radius:16px;
  border:1px solid rgba(255,255,255,0.08);
  background:linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(17,24,39,0.7) 100%);
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:12px;
  min-height:0;
  box-shadow:0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
}
.qws-fo-profile-section-title{
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:0.1em;
  color:rgba(147,197,253,0.8);
  font-weight:700;
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-profile-section-title::before{
  content:'';
  width:3px;
  height:12px;
  background:linear-gradient(180deg, #3b82f6, #8b5cf6);
  border-radius:999px;
}
.qws-fo-privacy-list{
  display:grid;
  gap:6px;
}
.qws-fo-privacy-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:12px;
  color:#e2e8f0;
}
.qws-fo-privacy-state{
  padding:2px 8px;
  border-radius:999px;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.02em;
  background:rgba(248,113,113,0.2);
  color:#fecaca;
  border:1px solid rgba(248,113,113,0.35);
}
.qws-fo-privacy-state.allowed{
  background:rgba(52,211,153,0.2);
  color:#bbf7d0;
  border-color:rgba(52,211,153,0.35);
}
.qws-fo-inspect-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
  gap:10px;
}
.qws-fo-inspect-card{
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px;
  padding:16px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.08);
  background:linear-gradient(135deg, rgba(30,41,59,0.4) 0%, rgba(15,23,42,0.6) 100%);
  box-shadow:0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
  cursor:pointer;
  transition:all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow:hidden;
}
.qws-fo-inspect-card::before{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(147,51,234,0.08) 100%);
  opacity:0;
  transition:opacity 200ms ease;
  pointer-events:none;
}
.qws-fo-inspect-card:hover{
  border-color:rgba(147,197,253,0.35);
  transform:translateY(-2px);
  box-shadow:0 8px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
}
.qws-fo-inspect-card:hover::before{
  opacity:1;
}
.qws-fo-inspect-card:active{
  transform:translateY(0px);
  transition:transform 80ms ease;
}
.qws-fo-inspect-card:disabled{
  opacity:0.4;
  cursor:not-allowed;
  transform:none !important;
}
.qws-fo-inspect-card:disabled::before{
  opacity:0 !important;
}
.qws-fo-inspect-icon{
  width:32px;
  height:32px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
  background:rgba(255,255,255,0.08);
  transition:all 200ms ease;
}
.qws-fo-inspect-card:hover .qws-fo-inspect-icon{
  background:rgba(255,255,255,0.14);
  transform:scale(1.1);
}
.qws-fo-inspect-icon svg{
  width:18px;
  height:18px;
  opacity:0.9;
}
.qws-fo-inspect-label{
  font-size:12px;
  font-weight:600;
  color:#e2e8f0;
  text-align:center;
  letter-spacing:0.01em;
}
@media (max-width: 820px){
  .qws-fo-profile-grid{ gap:10px; }
}

.qws-fo-friends-list{
  display:grid;
  gap:10px;
  padding:4px;
  grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
  align-content:start;
}
.qws-fo-friend-card{
  display:grid;
  gap:10px;
  padding:12px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(15,20,30,0.6);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
  transition:background 140ms ease, border 140ms ease, transform 140ms ease;
  cursor:pointer;
  width:min(100%, 260px);
  max-width:260px;
  justify-self:start;
  align-self:start;
  height:auto;
}
.qws-fo-friend-card:hover{
  border-color:rgba(59,130,246,0.35);
  background:rgba(30,41,59,0.45);
  transform:translateY(-1px);
}
.qws-fo-friend-card:focus{
  outline:2px solid rgba(59,130,246,0.35);
  outline-offset:2px;
}
.qws-fo-friend-avatar{
  width:44px;
  height:44px;
  border-radius:12px;
  overflow:hidden;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.06);
  font-weight:700;
  font-size:14px;
  color:#f8fafc;
}
.qws-fo-friend-header{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
}
.qws-fo-friend-header-info{
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:0;
}
.qws-fo-friend-name-row{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.qws-fo-friend-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-fo-friend-main{
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:0;
}
.qws-fo-friend-name{
  font-weight:700;
  font-size:13px;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-fo-friend-status-pill{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:0;
  border-radius:999px;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.02em;
  background:transparent;
  color:rgba(226,232,240,0.7);
  border:none;
}
.qws-fo-friend-status-pill.online{
  background:transparent;
  color:rgba(226,232,240,0.7);
  border:none;
}
.qws-fo-friend-status-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  background:#f87171;
}
.qws-fo-friend-status-pill.online .qws-fo-friend-status-dot{
  background:#34d399;
}
.qws-fo-friend-meta{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  font-size:11px;
  color:rgba(226,232,240,0.7);
  min-width:0;
}
.qws-fo-friend-lastseen{
  white-space:nowrap;
}
.qws-fo-friend-room-chip{
  padding:2px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.7);
  color:rgba(148,163,184,0.9);
  font-size:11px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width:160px;
}
.qws-fo-friend-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
}
.qws-fo-tab{
  position:absolute;
  inset:0;
  opacity:0;
  pointer-events:none;
  transform:translateX(6px);
  transition:opacity 160ms ease, transform 160ms ease;
  display:flex;
  flex-direction:column;
  min-height:0;
  padding:8px;
}
.qws-fo-tab.active{
  opacity:1;
  pointer-events:auto;
  transform:translateX(0);
}

.qws-fo-btn{
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.18);
  background:rgba(20,28,40,0.75);
  color:#f8fafc;
  font-weight:600;
  padding:8px 12px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:6px;
  transition:background 140ms ease, border 140ms ease, transform 140ms ease;
}
.qws-fo-btn:hover{ background:rgba(30,41,59,0.8); }
.qws-fo-btn.is-disabled{ opacity:0.5; cursor:not-allowed; }
.qws-fo-btn--primary{
  background:linear-gradient(135deg, #34d399 0%, #22d3ee 100%);
  border-color:transparent;
  color:#0b1020;
}
.qws-fo-btn--ghost{
  background:rgba(148,163,184,0.12);
  border-color:rgba(248,250,252,0.25);
}
.qws-fo-btn--danger{
  background:rgba(239,68,68,0.16);
  border-color:rgba(239,68,68,0.35);
}
.qws-fo-btn--sm{ padding:6px 10px; font-size:12px; }
.qws-fo-btn--full{ width:100%; justify-content:center; }
.qws-fo-btn__icon{ font-size:12px; opacity:0.9; }
.qws-fo-btn__label{ display:inline-flex; align-items:center; }
.qws-fo-mod-action-btn{
  width:30px;
  height:30px;
  padding:0;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.qws-fo-mod-action-btn .qws-fo-btn__label{
  display:none;
}
.qws-fo-mod-action-btn .qws-fo-btn__icon{
  margin:0;
  display:flex;
  align-items:center;
  justify-content:center;
}
.qws-fo-mod-action-btn .qws-fo-btn__icon svg{
  width:14px;
  height:14px;
}
.qws-fo-mod-action-btn.is-added{
  background:rgba(239,68,68,0.16);
  border-color:rgba(239,68,68,0.35);
  color:#fecaca;
}
.qws-fo-input{
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.18);
  background:rgba(9,12,18,0.7);
  color:#f8fafc;
  padding:8px 10px;
  font-size:12px;
  outline:none;
}
.qws-fo-input::placeholder{ color:rgba(226,232,240,0.6); }
.qws-fo-card{
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(15,20,30,0.6);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
}
.qws-fo-card__head{
  padding:10px 12px;
  font-weight:700;
  font-size:12px;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(226,232,240,0.7);
  border-bottom:1px solid rgba(255,255,255,0.08);
}
.qws-fo-card__body{
  padding:12px;
}
.qws-fo-switch{
  position:relative;
  width:44px;
  height:24px;
  background:rgba(148,163,184,0.3);
  border-radius:999px;
  display:inline-flex;
  align-items:center;
  padding:2px;
  cursor:pointer;
}
.qws-fo-switch input{
  position:absolute;
  opacity:0;
  pointer-events:none;
}
.qws-fo-switch__knob{
  width:20px;
  height:20px;
  border-radius:50%;
  background:#e2e8f0;
  transition:transform 140ms ease, background 140ms ease;
}
.qws-fo-switch input:checked + .qws-fo-switch__knob{
  transform:translateX(20px);
  background:#34d399;
}

.qws-fo-badge{
  position:absolute;
  top:-6px;
  right:-6px;
  min-width:18px;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:#ef4444;
  color:#fff;
  font-size:12px;
  font-weight:700;
  display:none;
  align-items:center;
  justify-content:center;
  border:1px solid rgba(0,0,0,.35);
  line-height:18px;
  pointer-events:none;
}
@media (max-width: 820px){
  .qws-fo-body{ grid-template-columns:1fr; }
  .qws-fo-nav{
    flex-direction:row;
    overflow:auto;
    border-right:none;
    border-bottom:1px solid rgba(255,255,255,0.08);
  }
  .qws-fo-nav-btn{ flex:1 0 auto; }
}
`;
  document.head.appendChild(st);
}

class FriendOverlay {
  private slot: HTMLDivElement = document.createElement("div");
  private btn: HTMLButtonElement = document.createElement("button");
  private iconWrap: HTMLDivElement = document.createElement("div");
  private badge: HTMLSpanElement = document.createElement("span");
  private panel: HTMLDivElement = document.createElement("div");
  private nav: HTMLDivElement = document.createElement("div");
  private content: HTMLDivElement = document.createElement("div");
  private tabs = new Map<TabId, TabInstance>();
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private activeTab: TabId = "community";
  private panelOpen = false;
  private unreadMessages = 0;
  private unreadGroups = 0;
  private pendingRequests = 0;
  private mo: MutationObserver | null = null;
  private panelHeadEl: HTMLDivElement | null = null;
  private panelDetached = false;
  private keyTrapCleanup: KeyTrapCleanup | null = null;
  private handleOverlayOpen = () => this.setOpen(true);
  private handleOverlayClose = () => this.setOpen(false);
  private handleResize = () => {
    this.attach();
    if (this.panelOpen && !this.panelDetached) {
      this.centerPanel();
    }
  };
  private handlePointerDown = (e: PointerEvent) => {
    if (!this.panelOpen) return;
    const t = e.target as Node;
    if (!this.slot.contains(t)) {
      this.setOpen(false);
    }
  };

  constructor() {
    ensureFriendOverlayStyle();
    this.slot = this.createSlot();
    this.btn = this.createButton();
    this.badge = this.createBadge();
    const lastTab = window.__qws_friend_overlay_last_tab;
      if (lastTab === "community" || lastTab === "messages" || lastTab === "groups" || lastTab === "settings") {
        this.activeTab = lastTab;
      }
    this.panel = this.createPanel();
    this.keyTrapCleanup = installInputKeyTrap(this.panel);

    this.btn.onclick = () => {
      const next = !this.panelOpen;
      this.setOpen(next);
    };

    this.slot.append(this.btn, this.badge, this.panel);
    this.attach();
    this.observeDomForRelocation();
    this.installPanelDrag();

    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("qws-friend-overlay-open", this.handleOverlayOpen as EventListener);
    window.addEventListener("qws-friend-overlay-close", this.handleOverlayClose as EventListener);
  }

  destroy(): void {
    try {
      this.mo?.disconnect();
    } catch {}
    try {
      this.keyTrapCleanup?.();
    } catch {}
    try {
      window.removeEventListener("resize", this.handleResize);
    } catch {}
    try {
      this.panelHeadEl = null;
    } catch {}
    try {
      window.removeEventListener("pointerdown", this.handlePointerDown);
    } catch {}
    try {
      window.removeEventListener("qws-friend-overlay-open", this.handleOverlayOpen as EventListener);
      window.removeEventListener("qws-friend-overlay-close", this.handleOverlayClose as EventListener);
    } catch {}
    try {
      this.slot.remove();
    } catch {}
    for (const tab of this.tabs.values()) {
      tab.destroy?.();
    }
  }

  private setOpen(open: boolean): void {
    if (this.panelOpen === open) return;
    this.panelOpen = open;
    if (open) {
      this.panel.style.display = "block";
      if (!this.panelDetached) {
        this.centerPanel();
      }
      requestAnimationFrame(() => this.panel.classList.add("open"));
      this.showTab(this.activeTab);
      const lastCommunityTab = window.__qws_friend_overlay_last_community_tab;
      if (this.activeTab === "community" && lastCommunityTab === "friends") {
        this.tabs.get("community")?.refresh?.();
      }
    } else {
      this.panel.classList.remove("open");
      window.setTimeout(() => {
        if (!this.panelOpen) {
          this.panel.style.display = "none";
        }
      }, 180);
      const active = this.tabs.get(this.activeTab);
      active?.hide?.();
    }
    this.updateButtonBadge();
  }

  private centerPanel(): void {
    this.panel.style.left = "50%";
    this.panel.style.top = "50%";
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
    this.panel.style.transform = this.panel.classList.contains("open")
      ? "translate(-50%, -50%)"
      : "translate(-50%, calc(-50% + 6px))";
  }

  private installPanelDrag(): void {
    if (!this.panelHeadEl) return;
    const head = this.panelHeadEl;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rect = this.panel.getBoundingClientRect();
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      const pad = 10;
      const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
      const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
      left = Math.min(Math.max(pad, left), maxLeft);
      top = Math.min(Math.max(pad, top), maxTop);
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
    };

    const onUp = () => {
      dragging = false;
      head.style.cursor = "grab";
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
    };

    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (!this.panelOpen) return;
      dragging = true;
      this.panelDetached = true;
      const rect = this.panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      this.panel.style.position = "fixed";
      this.panel.style.left = `${rect.left}px`;
      this.panel.style.top = `${rect.top}px`;
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
      this.panel.style.transform = "none";
      head.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private updateButtonBadge(): void {
    const total = this.unreadMessages + this.unreadGroups + this.pendingRequests;
    this.badge.textContent = total ? String(total) : "";
    style(this.badge, { display: total ? "inline-flex" : "none" });
  }

  private setTabBadge(id: TabId, text: string | null): void {
    const btn = this.tabButtons.get(id);
    if (!btn) return;
    let badge = btn.querySelector<HTMLSpanElement>(".qws-fo-nav-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "qws-fo-nav-badge";
      btn.appendChild(badge);
    }
    if (!text) {
      badge.style.display = "none";
      badge.textContent = "";
      return;
    }
    badge.textContent = text;
    badge.style.display = "inline-flex";
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "qws-fo-panel";

    const head = document.createElement("div");
    head.className = "qws-fo-head";
    this.panelHeadEl = head;
    const title = document.createElement("div");
    title.className = "qws-fo-title";
    title.textContent = "Community Hub";
    head.appendChild(title);

    const body = document.createElement("div");
    body.className = "qws-fo-body";

    this.nav = document.createElement("div");
    this.nav.className = "qws-fo-nav";

    this.content = document.createElement("div");
    this.content.className = "qws-fo-content";

    body.append(this.nav, this.content);
    panel.append(head, body);

    this.buildTabs();

    return panel;
  }

  private buildTabs(): void {
    let messagesHandle: MessagesTabHandle | null = null;
    const tabDefs: Array<{ id: TabId; label: string; icon: string; build: () => TabInstance }> = [
      {
        id: "community",
        label: "Friends",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M7 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm10-1a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" fill="currentColor"/>' +
          '<path d="M2.5 20a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 20v.5H2.5V20Z" fill="currentColor"/>' +
          '<path d="M13.5 20a4.5 4.5 0 0 1 4.5-4.5h1A4.5 4.5 0 0 1 23.5 20v.5h-10V20Z" fill="currentColor" opacity="0.7"/>' +
          "</svg>",
        build: () => {
          const tab = createCommunityTab({
            onRequestsCountChange: (count) => {
              this.pendingRequests = count;
              this.setTabBadge("community", count ? String(count) : null);
              this.updateButtonBadge();
            },
            onChat: (playerId) => {
              if (!messagesHandle) return;
              this.showTab("messages");
              messagesHandle.openConversation(playerId);
            },
          });
          return {
            id: "community",
            root: tab.root,
            refresh: tab.refresh,
            show: tab.show,
            hide: tab.hide,
            destroy: tab.destroy,
          };
        },
      },
      {
        id: "groups",
        label: "Groups",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M7.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" fill="currentColor"/>' +
          '<path d="M16.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" fill="currentColor" opacity="0.8"/>' +
          '<path d="M2.5 20a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v.5h-12V20Z" fill="currentColor"/>' +
          '<path d="M12.5 20a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v.5h-12V20Z" fill="currentColor" opacity="0.7"/>' +
          "</svg>",
        build: () => {
          const tab = createGroupsTab({
            onUnreadChange: (total) => {
              this.unreadGroups = total;
              this.setTabBadge("groups", total ? String(total) : null);
              this.updateButtonBadge();
            },
          });
          return {
            id: "groups",
            root: tab.root,
            refresh: tab.refresh,
            show: tab.show,
            hide: tab.hide,
            destroy: tab.destroy,
          };
        },
      },
      {
        id: "messages",
        label: "Messages",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="currentColor"/>' +
          '<circle cx="9" cy="10" r="1.5" fill="#0b1020"/>' +
          '<circle cx="13" cy="10" r="1.5" fill="#0b1020"/>' +
          '<circle cx="17" cy="10" r="1.5" fill="#0b1020"/>' +
          "</svg>",
        build: () => {
          const tab = createMessagesTab({
            onUnreadChange: (total) => {
              this.unreadMessages = total;
              this.setTabBadge("messages", total ? String(total) : null);
              this.updateButtonBadge();
            },
          });
          messagesHandle = tab;
          return {
            id: "messages",
            root: tab.root,
            show: tab.show,
            hide: tab.hide,
            destroy: tab.destroy,
          };
        },
      },
      {
        id: "settings",
        label: "My profile",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" fill="currentColor"/>' +
          '<path d="M4 20a8 8 0 0 1 16 0v.5H4V20Z" fill="currentColor" opacity="0.6"/>' +
          "</svg>",
        build: () => {
          const tab = createSettingsTab();
          return { id: "settings", root: tab.root, destroy: tab.destroy };
        },
      },
    ];

    tabDefs.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qws-fo-nav-btn";
      btn.dataset.tab = def.id;
      const icon = document.createElement("span");
      icon.className = "qws-fo-nav-icon";
      icon.innerHTML = def.icon;
      const label = document.createElement("span");
      label.textContent = def.label;
      btn.append(icon, label);
      btn.addEventListener("click", () => this.showTab(def.id));
      this.nav.appendChild(btn);
      this.tabButtons.set(def.id, btn);

      const instance = def.build();
      instance.root.classList.add("qws-fo-tab");
      this.tabs.set(def.id, instance);
      this.content.appendChild(instance.root);
    });

    this.showTab(this.activeTab, { silent: true });
  }

  private showTab(id: TabId, options: { silent?: boolean } = {}): void {
    this.activeTab = id;
    window.__qws_friend_overlay_last_tab = id;
    for (const [tabId, btn] of this.tabButtons) {
      btn.classList.toggle("active", tabId === id);
    }
    const shouldNotify = this.panelOpen && !options.silent;
    for (const [tabId, tab] of this.tabs) {
      const isActive = tabId === id;
      tab.root.classList.toggle("active", isActive);
      if (shouldNotify) {
        if (isActive) tab.show?.();
        else tab.hide?.();
      }
    }
  }

  private createSlot(): HTMLDivElement {
    const d = document.createElement("div");
    style(d, {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      marginRight: "0",
      pointerEvents: "auto",
      fontFamily: "var(--chakra-fonts-body, GreyCliff CF), 'Space Grotesk', system-ui, sans-serif",
      color: "var(--chakra-colors-chakra-body-text, #e7eef7)",
      userSelect: "none",
      zIndex: "var(--chakra-zIndices-PresentableOverlay, 5100)",
    });
    setProps(d, {
      "-webkit-font-smoothing": "antialiased",
      "-webkit-text-size-adjust": "100%",
      "text-rendering": "optimizeLegibility",
    });
    return d;
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Community Hub");

    // Create SVG icon (same structure as notifier bell, but with friends icon)
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.setAttribute("fill", "currentColor");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      '<path d="M7 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm10-1a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>' +
      '<path d="M2.5 20a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 20v.5H2.5V20Z"/>' +
      '<path d="M13.5 20a4.5 4.5 0 0 1 4.5-4.5h1A4.5 4.5 0 0 1 23.5 20v.5h-10V20Z" opacity="0.7"/>';

    // Create wrapper div (matching notifier's bellWrap structure)
    this.iconWrap = document.createElement("div");
    this.iconWrap.className = "qws-fo-icon-wrap";
    this.iconWrap.appendChild(icon);

    this.applyFallbackButtonStyles();
    btn.appendChild(this.iconWrap);

    btn.addEventListener("mouseenter", () => {
      if (btn.hasAttribute("style")) btn.style.borderColor = "var(--qws-accent, #7aa2ff)";
    });
    btn.addEventListener("mouseleave", () => {
      if (btn.hasAttribute("style")) btn.style.borderColor = "var(--chakra-colors-chakra-border-color, #ffffff33)";
    });

    return btn;
  }

  private applyFallbackButtonStyles(): void {
    this.btn.className = "";
    style(this.btn, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "36px",
      padding: "0 12px",
      borderRadius: "var(--chakra-radii-button, 50px)",
      border: "1px solid var(--chakra-colors-chakra-border-color, #ffffff33)",
      background: "var(--qws-panel, #111823cc)",
      backdropFilter: "blur(var(--qws-blur, 8px))",
      color: "var(--qws-text, #e7eef7)",
      boxShadow: "var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45))",
      cursor: "pointer",
      transition: "border-color var(--chakra-transition-duration-fast,150ms) ease",
      outline: "none",
      position: "relative",
    });
    setProps(this.btn, {
      "-webkit-backdrop-filter": "blur(var(--qws-blur, 8px))",
      "-webkit-tap-highlight-color": "transparent",
    });
    // Style the icon wrapper (matching notifier's bellWrap)
    this.iconWrap.className = "qws-fo-icon-wrap";
    style(this.iconWrap, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "100%",
    });
  }

  private applyToolbarLook(toolbar: HTMLElement | null): void {
    const refBtn = toolbar?.querySelector("button.chakra-button") as HTMLButtonElement | null;
    if (!refBtn) return;

    // Mirror classes from the toolbar buttons for a native look
    this.btn.className = refBtn.className;
    this.btn.removeAttribute("style");
    this.btn.removeAttribute("data-focus-visible-added");

    const refInner = refBtn.querySelector("div") as HTMLElement | null;
    if (refInner) {
      this.iconWrap.className = refInner.className;
      this.iconWrap.removeAttribute("style");
    }

    // Ensure the icon stays centered even if class layout differs
    style(this.iconWrap, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    });
    // Keep a positioning context for badge/panel
    style(this.btn, { position: "relative" });
  }

  private createBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    badge.className = "qws-fo-badge";
    style(badge, { display: "none" });
    return badge;
  }

  private findNotifierSlot(): HTMLElement | null {
    const fromGlobal = (window as unknown as { __qws_notifier_slot?: HTMLElement })
      .__qws_notifier_slot;
    if (fromGlobal && fromGlobal.isConnected) return fromGlobal;
    const el = document.getElementById("qws-notifier-slot");
    return el && el.isConnected ? el : null;
  }

  private closestFlexWithEnoughChildren(el: HTMLElement, minChildren = 3): HTMLElement | null {
    let cur: HTMLElement | null = el;
    while (cur && cur.parentElement) {
      const parent = cur.parentElement as HTMLElement;
      const cs = getComputedStyle(parent);
      if (cs.display.includes("flex") && parent.children.length >= minChildren) return parent;
      cur = parent;
    }
    return null;
  }

  private findToolbarContainer(): HTMLElement | null {
    try {
      const mcFlex = document.querySelector<HTMLElement>(".McFlex.css-13izacw");
      if (mcFlex) return mcFlex;

      const chatBtn = document.querySelector('button[aria-label="Chat"]') as HTMLElement | null;
      const flexFromChat = chatBtn ? this.closestFlexWithEnoughChildren(chatBtn) : null;
      if (flexFromChat) return flexFromChat;

      const canvas = this.findTargetCanvas();
      if (canvas) {
        const flexFromCanvas = this.closestFlexWithEnoughChildren(canvas);
        if (flexFromCanvas) return flexFromCanvas;
        const block = this.findAnchorBlockFromCanvas(canvas);
        if (block && block.parentElement) return block.parentElement as HTMLElement;
      }
      return null;
    } catch { return null; }
  }

  private attachUnderNotifier(): boolean {
    const notifier = this.findNotifierSlot();
    if (!notifier) return false;

    // Use the same toolbar finding logic as notifier
    const toolbar = this.findToolbarContainer();
    if (toolbar) {
      this.applyToolbarLook(toolbar);
    } else {
      this.applyFallbackButtonStyles();
    }
    if (!document.body.contains(this.slot)) document.body.appendChild(this.slot);

    const rect = notifier.getBoundingClientRect();
    const width = this.slot.getBoundingClientRect().width || 42;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const top = rect.bottom + 8;

    style(this.slot, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      right: "",
      bottom: "",
      transform: "",
    });
    return true;
  }

  private findTargetCanvas(): HTMLCanvasElement | null {
    try {
      const c1 = document.querySelector("span[tabindex] canvas") as HTMLCanvasElement | null;
      if (c1) return c1;
      const all = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
      const candidates = all
        .map((c) => ({ c, r: c.getBoundingClientRect() }))
        .filter(({ r }) => r.width <= 512 && r.height <= 512 && r.top < 300)
        .sort((a, b) => (a.r.left - b.r.left) || (a.r.top - b.r.top));
      return candidates[0]?.c ?? null;
    } catch {
      return null;
    }
  }

  private findAnchorBlockFromCanvas(c: HTMLCanvasElement): HTMLElement | null {
    try {
      const tabbable = c.closest("span[tabindex]");
      if (tabbable && tabbable.parentElement) return tabbable.parentElement as HTMLElement;

      let cur: HTMLElement | null = c;
      while (cur && cur.parentElement) {
        const p = cur.parentElement as HTMLElement;
        const cs = getComputedStyle(p);
        if (cs.display.includes("flex") && p.children.length <= 3) return p;
        cur = p;
      }
      return null;
    } catch {
      return null;
    }
  }

  private insertLeftOf(block: Element, el: Element) {
    const parent = block.parentElement;
    if (!parent) return;
    if (!block.isConnected || !parent.isConnected) return;

    const cs = getComputedStyle(parent);
    const isFlex = cs.display.includes("flex");
    const dir = cs.flexDirection || "row";

    try {
      if (isFlex && dir.startsWith("row") && dir.endsWith("reverse")) {
        if (el !== block.nextSibling) parent.insertBefore(el, block.nextSibling);
      } else {
        parent.insertBefore(el, block);
      }
    } catch {}
  }

  private attachFallback(): void {
    const canvas = this.findTargetCanvas();
    const block = canvas ? this.findAnchorBlockFromCanvas(canvas) : null;
    if (!block || !block.parentElement || !block.isConnected) {
      this.applyFallbackButtonStyles();
      let fixed = document.getElementById("qws-friend-overlay-fallback") as HTMLDivElement | null;
      if (!fixed) {
        fixed = document.createElement("div");
        fixed.id = "qws-friend-overlay-fallback";
        style(fixed, {
          position: "fixed",
          zIndex: "var(--chakra-zIndices-PresentableOverlay, 5100)",
          top: "calc(10px + var(--sait, 0px))",
          right: "calc(10px + var(--sair, 0px))",
        });
        document.body.appendChild(fixed);
      }
      if (!fixed.contains(this.slot)) fixed.appendChild(this.slot);
      return;
    }

    this.applyToolbarLook(block.parentElement);
    if (this.slot.parentElement !== block.parentElement ||
      (this.slot.nextElementSibling !== block && block.previousElementSibling !== this.slot)) {
      this.insertLeftOf(block, this.slot);
    }
  }

  private attach(): void {
    if (this.attachUnderNotifier()) return;
    this.attachFallback();
  }

  private observeDomForRelocation(): void {
    try {
      this.mo?.disconnect();
      this.mo = new MutationObserver(() => this.attach());
      this.mo.observe(document.body, { childList: true, subtree: true });
      this.attach();
      window.addEventListener("resize", this.handleResize);
    } catch {}
  }
}

export async function renderFriendOverlay(): Promise<void> {
  const prev = (window as unknown as { __qws_cleanup_friend_overlay?: () => void })
    .__qws_cleanup_friend_overlay;
  if (typeof prev === "function") {
    try {
      prev();
    } catch {}
  }

  const overlay = new FriendOverlay();

  (window as unknown as { __qws_cleanup_friend_overlay?: () => void })
    .__qws_cleanup_friend_overlay = () => {
    try {
      overlay.destroy();
    } catch {}
  };
}
