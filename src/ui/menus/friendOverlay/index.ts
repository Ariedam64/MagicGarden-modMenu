import { createMessagesTab, type MessagesTabHandle } from "./tabs/messagesTab";
import { createCommunityTab } from "./tabs/communityTab";
import { createRoomTab } from "./tabs/roomTab";
import { createGroupsTab } from "./tabs/groupsTab";
import { createLeaderboardTab } from "./tabs/leaderboardTab";
import { createSettingsTab } from "./tabs/settingsTab";
import { requestApiKey } from "../../../utils/supabase";
import {
  hasApiKey,
  hasDeclinedApiAuth,
  setApiKey,
  setDeclinedApiAuth,
} from "../../../utils/localStorage";
import { isDiscordActivityContext } from "../../../utils/discordCsp";
import { triggerPlayerStateSyncNow } from "../../../utils/payload";

const STYLE_ID = "qws-friend-overlay-css";

const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
};

type TabId = "messages" | "community" | "room" | "groups" | "leaderboard" | "settings";

declare global {
  interface Window {
    __qws_friend_overlay_last_tab?: TabId;
    __qws_friend_overlay_last_community_tab?: "friends" | "add" | "requests";
    __qws_friend_overlay_last_room_tab?: "public";
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
  const inMessagesOverlay = (node: Element | null) =>
    !!(node && (node as HTMLElement).closest?.(".qws-msg-panel"));

  const handler = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    if (inMessagesOverlay(target) || inMessagesOverlay(active)) return;
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
  overflow:auto;
  scrollbar-gutter:stable;
}
.qws-fo-community-profile.active{
  display:flex;
}
.qws-fo-room{
  display:flex;
  flex-direction:column;
  gap:10px;
  height:100%;
  min-height:0;
}
.qws-fo-room-shell{
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
.qws-fo-room-body{
  flex:1;
  min-height:0;
  display:flex;
  flex-direction:column;
}
.qws-fo-room-panel{
  display:flex;
  flex-direction:column;
  gap:10px;
  flex:1;
  min-height:0;
}
.qws-fo-room-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 12px;
  border-radius:12px;
  background:linear-gradient(135deg, rgba(30,41,59,0.6), rgba(15,23,42,0.85));
  border:1px solid rgba(255,255,255,0.1);
}
.qws-fo-room-header-title{
  font-size:12px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(226,232,240,0.75);
}
.qws-fo-room-header-controls{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-room-filter{
  display:flex;
  align-items:center;
  gap:6px;
  padding:4px 10px;
  border-radius:10px;
  background:rgba(9,12,18,0.75);
  border:1px solid rgba(255,255,255,0.12);
}
.qws-fo-room-filter span{
  font-size:11px;
  color:rgba(226,232,240,0.7);
}
.qws-fo-room-select{
  background:rgba(9,12,18,0.85);
  border:1px solid rgba(255,255,255,0.16);
  color:#f8fafc;
  border-radius:8px;
  padding:4px 22px 4px 8px;
  font-size:12px;
  outline:none;
  cursor:pointer;
}
.qws-fo-room-select:focus{
  border-color:rgba(59,130,246,0.4);
}
.qws-fo-room-alert{
  font-size:12px;
  color:#ffb4a2;
  background:rgba(46,31,31,0.9);
  border:1px solid rgba(255, 140, 105, 0.35);
  padding:8px 10px;
  border-radius:10px;
}
.qws-fo-room-list{
  flex:1;
  min-height:0;
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:10px;
  padding-right:4px;
  scrollbar-gutter:stable;
}
.qws-fo-room-list-inner{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.qws-fo-room-empty{
  font-size:12px;
  color:rgba(226,232,240,0.65);
  text-align:center;
  padding:12px 0;
}
.qws-fo-room-card{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border-radius:12px;
  background:rgba(17,24,39,0.6);
  border:1px solid rgba(255,255,255,0.08);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
}
.qws-fo-room-badge{
  font-size:10px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  padding:2px 8px;
  border-radius:999px;
  border:1px solid;
  flex-shrink:0;
}
.qws-fo-room-badge.is-discord{
  background:rgba(168,85,247,0.18);
  border-color:rgba(168,85,247,0.4);
  color:#e9d5ff;
}
.qws-fo-room-badge.is-web{
  background:rgba(56,189,248,0.18);
  border-color:rgba(56,189,248,0.35);
  color:#bae6fd;
}
.qws-fo-room-id{
  font-size:12px;
  font-weight:600;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  min-width:0;
  flex:1 1 auto;
}
.qws-fo-room-avatars{
  display:flex;
  align-items:center;
  gap:4px;
  flex-shrink:0;
}
.qws-fo-room-avatar{
  width:28px;
  height:28px;
  border-radius:50%;
  overflow:hidden;
  display:grid;
  place-items:center;
  border:1px solid rgba(255,255,255,0.18);
  background:rgba(255,255,255,0.08);
  font-size:11px;
  font-weight:600;
  color:#f8fafc;
}
.qws-fo-room-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-fo-room-avatar.is-empty{
  background:rgba(255,255,255,0.04);
  border-style:dashed;
  color:rgba(226,232,240,0.4);
}
.qws-fo-room-count{
  font-size:12px;
  font-weight:600;
  color:rgba(226,232,240,0.8);
  min-width:44px;
  text-align:right;
}
.qws-fo-room-actions{
  margin-left:auto;
  display:flex;
  align-items:center;
  gap:8px;
  flex-shrink:0;
}
.qws-fo-room-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:11px;
  color:rgba(226,232,240,0.6);
  padding-top:6px;
  border-top:1px solid rgba(255,255,255,0.06);
}
.qws-fo-tab-leaderboard{
  height:100%;
}
.qws-fo-leaderboard-card{
  display:flex;
  flex-direction:column;
  height:100%;
}
.qws-fo-leaderboard-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.qws-fo-leaderboard-head-title{
  font-size:12px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(226,232,240,0.7);
}
.qws-fo-leaderboard-refresh{
  text-transform:none;
  letter-spacing:0;
}
.qws-fo-leaderboard-body{
  display:flex;
  flex-direction:column;
  gap:10px;
  height:100%;
  min-height:0;
}
.qws-fo-leaderboard-tabs{
  display:inline-flex;
  align-items:center;
  gap:4px;
  padding:4px;
  border-radius:999px;
  background:rgba(15,23,42,0.7);
  border:1px solid rgba(255,255,255,0.08);
  width:max-content;
}
.qws-fo-leaderboard-tab{
  border:none;
  background:transparent;
  color:rgba(226,232,240,0.7);
  padding:6px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:600;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  transition:background 120ms ease, border 120ms ease, color 120ms ease;
}
.qws-fo-leaderboard-tab.active{
  background:linear-gradient(120deg, rgba(59,130,246,0.35), rgba(56,189,248,0.28));
  color:#f8fafc;
  box-shadow:0 0 0 1px rgba(125,211,252,0.35) inset;
}
.qws-fo-leaderboard-hint{
  font-size:11px;
  color:rgba(226,232,240,0.6);
  padding-left:4px;
}
.qws-fo-leaderboard-status{
  font-size:11px;
  color:rgba(226,232,240,0.65);
  min-height:14px;
}
.qws-fo-leaderboard-list{
  display:flex;
  flex-direction:column;
  gap:6px;
  flex:1;
  min-height:0;
  overflow:auto;
  padding-right:4px;
}
.qws-fo-leaderboard-row{
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 8px;
  border-radius:10px;
  background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.06);
}
.qws-fo-leaderboard-row.is-me{
  border-color:rgba(59,130,246,0.45);
  background:rgba(59,130,246,0.16);
}
.qws-fo-leaderboard-rank{
  font-size:11px;
  font-weight:700;
  color:rgba(226,232,240,0.8);
  text-align:center;
  width:32px;
}
.qws-fo-leaderboard-rank.is-top1{
  font-weight:800;
  color:#f5d342;
  text-shadow:0 0 6px rgba(245,211,66,0.35);
}
.qws-fo-leaderboard-rank.is-top2{
  font-weight:800;
  color:#d7dbe3;
  text-shadow:0 0 6px rgba(215,219,227,0.28);
}
.qws-fo-leaderboard-rank.is-top3{
  font-weight:800;
  color:#e0a46b;
  text-shadow:0 0 6px rgba(224,164,107,0.28);
}
.qws-fo-leaderboard-avatar{
  width:28px;
  height:28px;
  border-radius:50%;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(255,255,255,0.08);
  font-size:11px;
  font-weight:700;
  color:#f8fafc;
}
.qws-fo-leaderboard-avatar.is-anon{
  background:rgba(148,163,184,0.18);
  color:#e2e8f0;
}
.qws-fo-leaderboard-anon{
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height:100%;
}
.qws-fo-leaderboard-anon svg{
  width:16px;
  height:16px;
  display:block;
}
.qws-fo-leaderboard-avatar img{
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-fo-leaderboard-name{
  font-size:12px;
  font-weight:600;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  min-width:0;
  flex:1;
}
.qws-fo-leaderboard-value{
  font-size:12px;
  font-weight:700;
  color:#e2e8f0;
  text-align:right;
}
.qws-fo-leaderboard-value.is-coins{
  color:var(--chakra-colors-MagicWhite, #f8fafc);
}
.qws-fo-leaderboard-value.is-coin-trillion{
  color:rgb(200, 140, 255);
}
.qws-fo-leaderboard-value.is-coin-billion{
  color:var(--chakra-colors-Blue-Light, #93c5fd);
}
.qws-fo-leaderboard-value.is-coin-million{
  color:var(--chakra-colors-Yellow-Magic, #F3D32B);
}
.qws-fo-leaderboard-value.is-coin-base{
  color:var(--chakra-colors-MagicWhite, #f8fafc);
}
.qws-fo-leaderboard-value.is-eggs{
  color:#93c5fd;
}
.qws-fo-leaderboard-footer{
  margin-top:auto;
  padding-top:10px;
  border-top:1px solid rgba(255,255,255,0.08);
  display:flex;
  flex-direction:column;
  gap:6px;
  font-size:11px;
  color:rgba(226,232,240,0.75);
}
.qws-fo-leaderboard-footer-note{
  text-align:center;
  padding:6px 0;
  color:rgba(226,232,240,0.7);
}
.qws-fo-leaderboard-footer-meta{
  font-weight:700;
  color:#f8fafc;
}
.qws-fo-leaderboard-footer-value{
  font-weight:700;
}
.qws-fo-leaderboard-footer-value.is-coins{
  color:#F3D32B;
}
.qws-fo-leaderboard-footer-value.is-eggs{
  color:#93c5fd;
}
.qws-fo-leaderboard-empty{
  font-size:12px;
  opacity:0.6;
  text-align:center;
  padding:12px 0;
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
.qws-fo-group-search{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-group-search-input{
  width:100%;
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
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:12px 14px;
  border-radius:16px;
  border:1px solid rgba(59,130,246,0.18);
  background:linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.9) 100%);
  box-shadow:0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05);
}
.qws-fo-profile-group::after{
  content:'';
  position:absolute;
  top:-60px;
  right:-40px;
  width:160px;
  height:160px;
  background:radial-gradient(circle, rgba(56,189,248,0.25) 0%, rgba(56,189,248,0) 70%);
  pointer-events:none;
}
.qws-fo-profile-group-title{
  font-size:11px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.1em;
  color:rgba(226,232,240,0.85);
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-profile-group-title::before{
  content:'';
  width:8px;
  height:8px;
  border-radius:999px;
  background:linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
  box-shadow:0 0 0 2px rgba(59,130,246,0.25);
}
.qws-fo-profile-group-row{
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(2,6,23,0.35);
}
.qws-fo-profile-group-select{
  flex:1;
  min-width:0;
  border-radius:10px;
  border:1px solid transparent;
  background:rgba(15,23,42,0.55);
  color:#f8fafc;
  padding:7px 10px;
  font-size:12px;
  outline:none;
}
.qws-fo-profile-group-select:focus{
  border-color:rgba(56,189,248,0.6);
  box-shadow:0 0 0 2px rgba(56,189,248,0.2);
}
.qws-fo-profile-group-row .qws-fo-btn{
  border-radius:12px;
  box-shadow:0 6px 16px rgba(34,211,238,0.2);
}
.qws-fo-profile-group-status{
  font-size:11px;
  color:rgba(226,232,240,0.7);
  display:flex;
  align-items:center;
  gap:6px;
  min-height:14px;
}
.qws-fo-profile-group-status:not(:empty)::before{
  content:'';
  width:6px;
  height:6px;
  border-radius:999px;
  background:rgba(148,163,184,0.7);
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
.qws-fo-profile-leaderboard{
  gap:10px;
}
.qws-fo-profile-leaderboard-grid{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-fo-profile-leaderboard-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(2,6,23,0.35);
}
.qws-fo-profile-leaderboard-label{
  font-size:12px;
  font-weight:600;
  color:#e2e8f0;
}
.qws-fo-profile-leaderboard-meta{
  display:flex;
  align-items:center;
  gap:12px;
}
.qws-fo-profile-leaderboard-rank{
  min-width:38px;
  text-align:center;
}
.qws-fo-profile-leaderboard-value{
  min-width:72px;
  text-align:right;
}
.qws-fo-profile-leaderboard-rank.is-muted,
.qws-fo-profile-leaderboard-value.is-muted{
  color:rgba(226,232,240,0.6);
  font-weight:600;
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
.qws-fo-auth-overlay{
  position:absolute;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  padding:16px;
  background:rgba(7,10,16,0.76);
  backdrop-filter:blur(6px);
  z-index:6;
}
.qws-fo-auth-overlay.is-visible{
  display:flex;
}
.qws-fo-auth-card{
  width:min(520px, 92%);
  background:radial-gradient(140% 140% at 0% 0%, rgba(28,36,56,0.98), rgba(12,16,26,0.98));
  border:1px solid rgba(148,163,184,0.22);
  border-radius:16px;
  padding:16px 18px;
  color:#e2e8f0;
  box-shadow:0 20px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05);
  display:flex;
  flex-direction:column;
  gap:10px;
  font-family:var(--chakra-fonts-body, "Space Grotesk"), system-ui, sans-serif;
}
.qws-fo-auth-header{
  display:flex;
  align-items:center;
  gap:12px;
}
.qws-fo-auth-brand{
  font-size:10px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.12em;
  padding:3px 10px;
  border-radius:999px;
  border:1px solid rgba(56,189,248,0.4);
  background:rgba(56,189,248,0.12);
  color:#bae6fd;
  margin-left:auto;
}
.qws-fo-auth-icon{
  width:36px;
  height:36px;
  border-radius:12px;
  display:grid;
  place-items:center;
  background:rgba(59,130,246,0.18);
  border:1px solid rgba(59,130,246,0.55);
  color:#dbeafe;
  flex-shrink:0;
}
.qws-fo-auth-icon svg{
  width:20px;
  height:20px;
  display:block;
}
.qws-fo-auth-title{
  font-size:15px;
  font-weight:700;
  color:#f8fafc;
}
.qws-fo-auth-subtitle{
  font-size:12px;
  color:rgba(226,232,240,0.72);
}
.qws-fo-auth-hidden{
  display:none !important;
}
.qws-fo-auth-divider{
  height:1px;
  background:linear-gradient(90deg, rgba(148,163,184,0.08), rgba(148,163,184,0.3), rgba(148,163,184,0.08));
}
.qws-fo-auth-section{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-fo-auth-section-title{
  font-size:12px;
  font-weight:600;
  color:#93c5fd;
  letter-spacing:0.02em;
}
.qws-fo-auth-list{
  display:grid;
  gap:6px;
  font-size:12.5px;
  color:rgba(226,232,240,0.82);
}
.qws-fo-auth-item{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-fo-auth-bullet{
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
.qws-fo-auth-bullet svg{
  width:12px;
  height:12px;
  display:block;
}
.qws-fo-auth-unlocks{
  font-size:12.5px;
  color:rgba(226,232,240,0.82);
}
.qws-fo-auth-unlocks strong{ color:#f8fafc; font-weight:600; }
.qws-fo-auth-status{
  font-size:12px;
  color:rgba(251,191,36,0.9);
  min-height:16px;
}
.qws-fo-auth-actions{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.qws-fo-auth-input-row{
  display:grid;
  gap:6px;
}
.qws-fo-auth-input-label{
  font-size:12px;
  color:rgba(226,232,240,0.72);
}
.qws-fo-auth-input{
  width:100%;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.16);
  background:rgba(8,12,20,0.75);
  color:#f8fafc;
  padding:8px 12px;
  font-size:12.5px;
  outline:none;
}
.qws-fo-auth-input:focus{
  border-color:rgba(56,189,248,0.5);
}
.qws-fo-auth-btn{
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.15);
  background:rgba(20,28,40,0.75);
  color:#f8fafc;
  font-weight:600;
  padding:8px 12px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:180px;
  flex:1 1 180px;
  transition:background 140ms ease, border 140ms ease, transform 140ms ease;
}
.qws-fo-auth-btn:hover{ background:rgba(30,41,59,0.8); }
.qws-fo-auth-btn.is-disabled{ opacity:0.6; cursor:not-allowed; }
.qws-fo-auth-btn.primary{
  background:linear-gradient(135deg, #2dd4bf 0%, #38bdf8 100%);
  border-color:transparent;
  color:#0b1020;
}
.qws-fo-auth-btn.ghost{
  background:rgba(148,163,184,0.12);
  border-color:rgba(248,250,252,0.2);
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
  private authGate: HTMLDivElement | null = null;
  private authGateStatus: HTMLDivElement | null = null;
  private authGateAuthBtn: HTMLButtonElement | null = null;
  private authGateManualRow: HTMLDivElement | null = null;
  private authGateManualInput: HTMLInputElement | null = null;
  private authGateSuppressed = false;
  private authGateManualMode = false;
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
  private handleAuthUpdate = () => {
    this.updateAuthGateVisibility();
    this.refreshAuthTabs();
  };
  private refreshAuthTabs(): void {
    this.tabs.get("community")?.refresh?.();
    this.tabs.get("groups")?.refresh?.();
    this.tabs.get("messages")?.refresh?.();
  }
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
    if (
      lastTab === "community" ||
      lastTab === "room" ||
      lastTab === "messages" ||
      lastTab === "groups" ||
      lastTab === "leaderboard" ||
      lastTab === "settings"
    ) {
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
    window.addEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate as EventListener);
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
      window.removeEventListener("qws-friend-overlay-auth-update", this.handleAuthUpdate as EventListener);
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
    this.updateAuthGateVisibility();
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

  private setAuthGateButtonEnabled(
    button: HTMLButtonElement | null,
    enabled: boolean,
  ): void {
    if (!button) return;
    button.disabled = !enabled;
    button.classList.toggle("is-disabled", !enabled);
    button.setAttribute("aria-disabled", (!enabled).toString());
  }

  private ensureAuthGate(): void {
    if (this.authGate) return;

    const overlay = document.createElement("div");
    overlay.className = "qws-fo-auth-overlay";

    const card = document.createElement("div");
    card.className = "qws-fo-auth-card";

    const header = document.createElement("div");
    header.className = "qws-fo-auth-header";

    const icon = document.createElement("div");
    icon.className = "qws-fo-auth-icon";
    icon.innerHTML =
      '<svg viewBox="0 0.5 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
      '<g clip-path="url(#clip0_537_21_fo)">' +
      '<path d="M20.317 4.54101C18.7873 3.82774 17.147 3.30224 15.4319 3.00126C15.4007 2.99545 15.3695 3.00997 15.3534 3.039C15.1424 3.4203 14.9087 3.91774 14.7451 4.30873C12.9004 4.02808 11.0652 4.02808 9.25832 4.30873C9.09465 3.90905 8.85248 3.4203 8.64057 3.039C8.62448 3.01094 8.59328 2.99642 8.56205 3.00126C6.84791 3.30128 5.20756 3.82678 3.67693 4.54101C3.66368 4.54681 3.65233 4.5565 3.64479 4.56907C0.533392 9.29283 -0.31895 13.9005 0.0991801 18.451C0.101072 18.4733 0.11337 18.4946 0.130398 18.5081C2.18321 20.0401 4.17171 20.9701 6.12328 21.5866C6.15451 21.5963 6.18761 21.5847 6.20748 21.5585C6.66913 20.9179 7.08064 20.2424 7.43348 19.532C7.4543 19.4904 7.43442 19.441 7.39186 19.4246C6.73913 19.173 6.1176 18.8662 5.51973 18.5178C5.47244 18.4897 5.46865 18.421 5.51216 18.3881C5.63797 18.2923 5.76382 18.1926 5.88396 18.0919C5.90569 18.0736 5.93598 18.0697 5.96153 18.0813C9.88928 19.9036 14.1415 19.9036 18.023 18.0813C18.0485 18.0687 18.0788 18.0726 18.1015 18.091C18.2216 18.1916 18.3475 18.2923 18.4742 18.3881C18.5177 18.421 18.5149 18.4897 18.4676 18.5178C17.8697 18.8729 17.2482 19.173 16.5945 19.4236C16.552 19.4401 16.533 19.4904 16.5538 19.532C16.9143 20.2414 17.3258 20.9169 17.7789 21.5576C17.7978 21.5847 17.8319 21.5963 17.8631 21.5866C19.8241 20.9701 21.8126 20.0401 23.8654 18.5081C23.8834 18.4946 23.8948 18.4742 23.8967 18.452C24.3971 13.1911 23.0585 8.6212 20.3482 4.57004C20.3416 4.5565 20.3303 4.54681 20.317 4.54101ZM8.02002 15.6802C6.8375 15.6802 5.86313 14.577 5.86313 13.222C5.86313 11.8671 6.8186 10.7639 8.02002 10.7639C9.23087 10.7639 10.1958 11.8768 10.1769 13.222C10.1769 14.577 9.22141 15.6802 8.02002 15.6802ZM15.9947 15.6802C14.8123 15.6802 13.8379 14.577 13.8379 13.222C13.8379 11.8671 14.7933 10.7639 15.9947 10.7639C17.2056 10.7639 18.1705 11.8768 18.1516 13.222C18.1516 14.577 17.2056 15.6802 15.9947 15.6802Z" fill="#758CA3"/>' +
      "</g>" +
      "<defs>" +
      '<clipPath id="clip0_537_21_fo">' +
      '<rect width="24" height="24" fill="white"/>' +
      "</clipPath>" +
      "</defs>" +
      "</svg>";

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "qws-fo-auth-title";
    title.textContent = "Connect Discord to use Community Hub";
    const subtitle = document.createElement("div");
    subtitle.className = "qws-fo-auth-subtitle";
    subtitle.textContent =
      "Community features are disabled until you connect your Discord account.";
    titleWrap.append(title, subtitle);

    const brand = document.createElement("span");
    brand.className = "qws-fo-auth-brand";
    brand.textContent = "ARIE'S MOD";

    header.append(icon, titleWrap, brand);

    const dividerTop = document.createElement("div");
    dividerTop.className = "qws-fo-auth-divider";

    const iconCheck =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M5 12.5l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>";

    const createListItem = (text: string) => {
      const item = document.createElement("div");
      item.className = "qws-fo-auth-item";
      const bullet = document.createElement("span");
      bullet.className = "qws-fo-auth-bullet";
      bullet.innerHTML = iconCheck;
      const label = document.createElement("span");
      label.textContent = text;
      item.append(bullet, label);
      return item;
    };

    const whySection = document.createElement("div");
    whySection.className = "qws-fo-auth-section";
    const whyTitle = document.createElement("div");
    whyTitle.className = "qws-fo-auth-section-title";
    whyTitle.textContent = "Why this is needed";
    const whyList = document.createElement("div");
    whyList.className = "qws-fo-auth-list";
    whyList.append(
      createListItem("Prevent impersonation and abuse"),
      createListItem("Protect leaderboards and community stats from manipulation"),
      createListItem("Protect against message interception"),
    );
    whySection.append(whyTitle, whyList);

    const dividerBottom = document.createElement("div");
    dividerBottom.className = "qws-fo-auth-divider";

    const infoNote = document.createElement("div");
    infoNote.className = "qws-fo-auth-subtitle";
    infoNote.textContent =
      "Arie's Mod collects in-game player information (stats, garden, inventory, etc.) to power Community Hub features.";

    const unlocks = document.createElement("div");
    unlocks.className = "qws-fo-auth-unlocks";
    unlocks.innerHTML =
      "<strong>Unlocks</strong> Public rooms / Friends / Messages / Groups / Leaderboards";

    const isDiscord = isDiscordActivityContext();
    let manualInput: HTMLInputElement | null = null;
    let manualRow: HTMLDivElement | null = null;

    const status = document.createElement("div");
    status.className = "qws-fo-auth-status";
    status.textContent = "";
    this.authGateStatus = status;

    const actions = document.createElement("div");
    actions.className = "qws-fo-auth-actions";

    let authBtn: HTMLButtonElement | null = null;
    let refuseBtn: HTMLButtonElement | null = null;
    if (isDiscord) {
      const inputRow = document.createElement("div");
      inputRow.className = "qws-fo-auth-input-row";
      const inputLabel = document.createElement("div");
      inputLabel.className = "qws-fo-auth-input-label";
      inputLabel.textContent =
        "Discord Activity cannot open popups. Paste your API key here.";
      const input = document.createElement("input");
      input.className = "qws-fo-auth-input";
      input.type = "text";
      input.placeholder = "Paste your API key";
      manualInput = input;
      inputRow.append(inputLabel, input);
      inputRow.classList.add("qws-fo-auth-hidden");
      manualRow = inputRow;

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "qws-fo-auth-btn primary";
      openBtn.textContent = "Authenticate with Discord";
      authBtn = openBtn;
      this.authGateAuthBtn = openBtn;

      const contBtn = document.createElement("button");
      contBtn.type = "button";
      contBtn.className = "qws-fo-auth-btn ghost";
      contBtn.textContent = "Continue without Discord";
      refuseBtn = contBtn;

      actions.append(contBtn, openBtn);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qws-fo-auth-btn primary";
      btn.textContent = "Authenticate with Discord";
      authBtn = btn;
      this.authGateAuthBtn = btn;
      actions.append(btn);
    }

    const cardNodes: HTMLElement[] = [
      header,
      dividerTop,
      whySection,
      dividerBottom,
      infoNote,
      unlocks,
    ];
    if (manualRow) cardNodes.push(manualRow);
    cardNodes.push(status, actions);
    card.append(...cardNodes);
    overlay.appendChild(card);
    this.content.appendChild(overlay);

    if (refuseBtn) {
      refuseBtn.addEventListener("click", () => {
        setDeclinedApiAuth(true);
        this.authGateSuppressed = true;
        this.updateAuthGateVisibility();
      });
    }

    if (authBtn) {
      authBtn.addEventListener("click", async () => {
        status.textContent = "";
        if (isDiscord) {
          if (!this.authGateManualMode) {
            this.authGateManualMode = true;
            if (manualRow) manualRow.classList.remove("qws-fo-auth-hidden");
            authBtn.textContent = "Save API key";
            manualInput?.focus();
            status.textContent = "After logging in, paste your API key below.";
            requestApiKey()
              .then(async (apiKey) => {
                if (!apiKey) return;
                setDeclinedApiAuth(false);
                this.authGateSuppressed = false;
                this.updateAuthGateVisibility();
                await triggerPlayerStateSyncNow({ force: true });
                this.refreshTabsAfterAuth();
                window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
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
          this.authGateSuppressed = false;
          this.updateAuthGateVisibility();
          await triggerPlayerStateSyncNow({ force: true });
          this.refreshTabsAfterAuth();
          window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
          return;
        }

        this.setAuthGateButtonEnabled(authBtn, false);
        const originalLabel = authBtn.textContent || "";
        authBtn.textContent = "Authenticating...";

        const apiKey = await requestApiKey();

        if (apiKey) {
          setDeclinedApiAuth(false);
          this.updateAuthGateVisibility();
          await triggerPlayerStateSyncNow({ force: true });
          this.refreshTabsAfterAuth();
          window.dispatchEvent(new CustomEvent("qws-friend-overlay-auth-update"));
          return;
        }

        status.textContent =
          "Authentication failed. Please allow popups and try again.";
        authBtn.textContent = originalLabel;
        this.setAuthGateButtonEnabled(authBtn, true);
      });
    }

    if (manualInput) {
      manualInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        authBtn?.click();
      });
    }

    this.authGateManualRow = manualRow;
    this.authGateManualInput = manualInput;

    this.authGate = overlay;
  }

  private updateAuthGateVisibility(): void {
    const shouldShow =
      this.panelOpen &&
      !hasApiKey() &&
      hasDeclinedApiAuth() &&
      !this.authGateSuppressed;
    if (shouldShow) {
      this.ensureAuthGate();
      this.authGateManualMode = false;
      if (this.authGateStatus) {
        this.authGateStatus.textContent = "";
      }
      if (this.authGateAuthBtn) {
        this.authGateAuthBtn.textContent = "Authenticate with Discord";
        this.setAuthGateButtonEnabled(this.authGateAuthBtn, true);
        this.authGateAuthBtn.classList.remove("qws-fo-auth-hidden");
      }
      if (this.authGateManualRow) {
        this.authGateManualRow.classList.add("qws-fo-auth-hidden");
      }
      if (this.authGateManualInput) {
        this.authGateManualInput.value = "";
      }
    }
    if (!this.authGate) return;
    this.authGate.classList.toggle("is-visible", shouldShow);
  }

  private refreshTabsAfterAuth(): void {
    for (const tab of this.tabs.values()) {
      tab.refresh?.();
    }
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
        id: "room",
        label: "Rooms",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M4 4h10a2 2 0 0 1 2 2v14H4V4Z" fill="currentColor"/>' +
          '<path d="M14 6h6v14h-6V6Z" fill="currentColor" opacity="0.65"/>' +
          '<circle cx="9" cy="12" r="1.2" fill="#0b1020"/>' +
          "</svg>",
        build: () => {
          const tab = createRoomTab();
          return {
            id: "room",
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
            refresh: tab.refresh,
            destroy: tab.destroy,
          };
        },
      },
      {
        id: "leaderboard",
        label: "Leaderboard",
        icon:
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M7 4h10v3a5 5 0 0 1-4 4.9V14h3v2H8v-2h3v-2.1A5 5 0 0 1 7 7V4Z" fill="currentColor"/>' +
          '<path d="M5 6H3c0 3 2 5 4 5V9A3 3 0 0 1 5 6Z" fill="currentColor" opacity="0.7"/>' +
          '<path d="M19 6h2c0 3-2 5-4 5V9a3 3 0 0 0 2-3Z" fill="currentColor" opacity="0.7"/>' +
          "</svg>",
        build: () => {
          const tab = createLeaderboardTab();
          return {
            id: "leaderboard",
            root: tab.root,
            show: tab.show,
            hide: tab.hide,
            refresh: tab.refresh,
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
