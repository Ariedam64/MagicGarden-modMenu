const STYLE_ID = "qws-chat-component-style";
const MAX_MESSAGE_LENGTH = 1000;

const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const k in props) (el as any)[k] = props[k];
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  isOutgoing?: boolean;
}

export interface ChatConversation {
  id: string;
  displayName: string;
  subtitle?: string;
  avatarUrl?: string;
  unreadCount?: number;
  isOnline?: boolean;
  lastMessageAt?: string;
}

export interface ChatComponentOptions {
  embedded?: boolean;
  onSendMessage?: (conversationId: string, body: string) => void;
  onSelectConversation?: (conversationId: string) => void;
  onCreateConversation?: (name: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Styles
// ─────────────────────────────────────────────────────────────────────────────

function ensureChatComponentStyle(): void {
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const st = existing ?? document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-msg-panel{
  position:absolute;
  top:calc(100% + 8px);
  right:0;
  width:min(760px, 92vw);
  height:min(70vh, 560px);
  max-height:70vh;
  display:none;
  border-radius:12px;
  border:1px solid var(--qws-border, #ffffff22);
  background:var(--qws-panel, #111823cc);
  backdrop-filter:blur(var(--qws-blur, 8px));
  color:var(--qws-text, #e7eef7);
  box-shadow:var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45));
  overflow:hidden;
  z-index:var(--chakra-zIndices-DialogModal, 7010);
}
.qws-msg-panel.qws-msg-panel-embedded{
  position:relative;
  top:auto;
  right:auto;
  left:auto;
  bottom:auto;
  width:100%;
  height:100%;
  max-height:none;
  display:flex;
  flex-direction:column;
  border-radius:16px;
  z-index:auto;
}
.qws-msg-panel.qws-msg-panel-embedded .qws-msg-head{
  cursor:default;
  display:none;
}
.qws-msg-panel.qws-msg-panel-embedded .qws-msg-body{
  height:100%;
}
.qws-msg-panel *{ box-sizing:border-box; }
.qws-msg-head{
  padding:10px 12px;
  font-weight:700;
  border-bottom:1px solid var(--qws-border, #ffffff22);
  display:flex;
  align-items:center;
  gap:8px;
  cursor:grab;
  user-select:none;
}
.qws-msg-body{
  display:grid;
  grid-template-columns:240px 1fr;
  height:calc(100% - 44px);
  min-height:0;
}
.qws-msg-list{
  border-right:1px solid var(--qws-border, #ffffff22);
  overflow:auto;
  padding:8px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend-avatar-wrap{
  display:none;
}
.qws-msg-list.qws-msg-list-group .qws-msg-friend{
  padding-left:10px;
}
.qws-msg-list-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:6px 6px 2px 6px;
}
.qws-msg-list-title{
  font-size:13px;
  font-weight:700;
  color:#e2e8f0;
}
.qws-msg-list-new{
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.6);
  color:#f8fafc;
  border-radius:8px;
  padding:4px 8px;
  font-size:11px;
  font-weight:600;
  cursor:pointer;
  transition:background 120ms ease, border 120ms ease;
}
.qws-msg-list-new:hover{
  background:rgba(59,130,246,0.18);
  border-color:rgba(59,130,246,0.4);
}
.qws-msg-list-create{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:8px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.08);
  background:linear-gradient(180deg, rgba(15,23,42,0.65) 0%, rgba(10,16,28,0.65) 100%);
}
.qws-msg-list-create-row{
  display:flex;
  align-items:center;
  gap:8px;
}
.qws-msg-list-create-field{
  flex:1;
  min-width:0;
  display:flex;
  align-items:center;
  gap:6px;
  padding:6px 8px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(8,12,22,0.6);
  transition:border-color 120ms ease, box-shadow 120ms ease;
}
.qws-msg-list-create-field:focus-within{
  border-color:rgba(122,162,255,.5);
  box-shadow:0 0 0 1px rgba(122,162,255,.25);
}
.qws-msg-list-input{
  flex:1;
  min-width:0;
  border:none;
  background:transparent;
  color:#f8fafc;
  padding:4px 0;
  font-size:13px;
}
.qws-msg-list-input:focus{ outline:none; }
.qws-msg-list-create-actions{
  display:flex;
  align-items:center;
  gap:6px;
}
.qws-msg-list-action{
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(15,23,42,0.5);
  color:#f8fafc;
  border-radius:8px;
  padding:5px 8px;
  font-size:11px;
  font-weight:600;
  cursor:pointer;
  transition:background 120ms ease, border 120ms ease;
}
.qws-msg-list-action:hover{
  background:rgba(59,130,246,0.18);
  border-color:rgba(59,130,246,0.4);
}
.qws-msg-list-action-primary{
  background:rgba(122,162,255,0.9);
  color:#0b1017;
  border-color:rgba(122,162,255,0.9);
}
.qws-msg-list-action-primary:hover{
  background:rgba(142,176,255,0.95);
  border-color:rgba(142,176,255,0.95);
}
.qws-msg-list-action-ghost{
  background:transparent;
  border-color:transparent;
  color:rgba(226,232,240,0.8);
}
.qws-msg-list-action-ghost:hover{
  background:rgba(255,255,255,0.06);
  border-color:rgba(255,255,255,0.12);
}
.qws-msg-list-create-hint{
  font-size:10px;
  color:rgba(226,232,240,0.65);
  padding-left:2px;
}
.qws-msg-thread{
  display:flex;
  flex-direction:column;
  min-height:0;
}
  .qws-msg-thread-head{
    padding:10px 12px;
    border-bottom:1px solid var(--qws-border, #ffffff22);
    display:flex;
    align-items:center;
    gap:8px;
    min-height:44px;
  }
  .qws-msg-thread-actions{
    margin-left:auto;
    display:flex;
    align-items:center;
    gap:6px;
  }
  .qws-msg-thread-action-btn{
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(15,23,42,0.6);
    color:#f8fafc;
    border-radius:8px;
    padding:4px 8px;
    font-size:11px;
    font-weight:600;
    cursor:pointer;
    transition:background 120ms ease, border 120ms ease;
  }
  .qws-msg-thread-action-btn:hover{
    background:rgba(59,130,246,0.18);
    border-color:rgba(59,130,246,0.4);
  }
  .qws-msg-thread-action-btn.qws-msg-thread-add-member{
    background:rgba(34,197,94,0.22);
    border-color:rgba(34,197,94,0.6);
    color:#dcfce7;
  }
  .qws-msg-thread-action-btn.qws-msg-thread-add-member:hover{
    background:rgba(34,197,94,0.32);
    border-color:rgba(34,197,94,0.8);
  }
.qws-msg-thread-body{
  flex:1;
  overflow:auto;
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.qws-msg-input{
  padding:10px;
  border-top:1px solid var(--qws-border, #ffffff22);
  display:flex;
  gap:8px;
  align-items:center;
}
.qws-msg-import{
  position:relative;
  flex:0 0 auto;
}
.qws-msg-import-btn{
  width:32px;
  height:32px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:rgba(255,255,255,0.08);
  color:var(--qws-text, #e7eef7);
  font-weight:700;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.qws-msg-import-menu{
  position:absolute;
  left:0;
  bottom:40px;
  min-width:170px;
  display:none;
  flex-direction:column;
  gap:4px;
  padding:6px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff22);
  background:var(--qws-panel, #111823cc);
  backdrop-filter:blur(var(--qws-blur, 8px));
  box-shadow:var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45));
  z-index:2;
}
.qws-msg-import-menu button{
  text-align:left;
  padding:6px 8px;
  border-radius:8px;
  border:1px solid transparent;
  background:transparent;
  color:var(--qws-text, #e7eef7);
  font-size:12px;
  cursor:pointer;
}
.qws-msg-import-menu button:hover{
  background:rgba(255,255,255,0.08);
  border-color:rgba(255,255,255,0.12);
}
.qws-msg-input-wrapper{
  flex:1;
  position:relative;
  display:flex;
  align-items:center;
}
.qws-msg-emoji{
  position:absolute;
  right:8px;
  top:50%;
  transform:translateY(-50%);
  z-index:1;
}
.qws-msg-emoji-btn{
  width:32px;
  height:32px;
  border-radius:6px;
  border:none;
  background:transparent;
  color:var(--qws-text, #e7eef7);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:18px;
  opacity:0.7;
  transition:opacity 0.15s ease;
}
.qws-msg-emoji-btn:hover{
  opacity:1;
}
.qws-msg-emoji-btn.active{
  opacity:1;
  background:rgba(122,162,255,.15);
}
.qws-msg-emoji-picker{
  position:absolute;
  right:0;
  bottom:40px;
  z-index:10;
  display:none;
}
.qws-msg-emoji-picker.visible{
  display:block;
}
.qws-msg-input input{
  flex:1;
  width:100%;
  padding:10px 44px 10px 12px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:rgba(0,0,0,.42);
  color:#fff;
  outline:none;
  font-size:14px;
}
.qws-msg-char-count{
  font-size:12px;
  opacity:.65;
  white-space:nowrap;
  min-width:65px;
  text-align:right;
}
.qws-msg-char-count.over{
  color:#ff6c84;
  opacity:0.95;
}
.qws-msg-input .qws-msg-send-btn{
  padding:8px 12px;
  border-radius:10px;
  border:1px solid var(--qws-border, #ffffff33);
  background:var(--qws-accent, #7aa2ff);
  color:#0b1017;
  font-weight:700;
  cursor:pointer;
}
.qws-msg-input .qws-msg-send-btn:disabled{
  opacity:.5;
  cursor:not-allowed;
}
`;
  st.textContent += `
.qws-msg-friend{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.06);
  background:rgba(255,255,255,0.02);
  cursor:pointer;
}
.qws-msg-friend.active{
  border-color:#9db7ff66;
  background:rgba(122,162,255,.16);
}
.qws-msg-friend.unread .qws-msg-friend-name{
  font-weight:700;
}
.qws-msg-friend-avatar-wrap{
  width:32px;
  height:32px;
  flex:0 0 32px;
  position:relative;
}
.qws-msg-friend-avatar{
  width:32px;
  height:32px;
  border-radius:50%;
  overflow:hidden;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,0.06);
  font-size:13px;
  font-weight:600;
}
.qws-msg-status-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:#34d399;
  box-shadow:0 0 0 2px rgba(0,0,0,.35);
  position:absolute;
  right:-2px;
  bottom:-2px;
}
.qws-msg-friend-meta{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
  flex:1;
}
.qws-msg-friend-name{
  font-size:14px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-msg-friend-sub{
  font-size:12px;
  opacity:.6;
}
.qws-msg-unread-badge{
  min-width:18px;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:#D02128;
  color:#fff;
  font-size:11px;
  font-weight:700;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.qws-msg-row{
  display:flex;
  gap:8px;
  align-items:center;
  width:100%;
  justify-content:flex-start;
}
.qws-msg-row.outgoing{
  justify-content:flex-end;
}
.qws-msg-avatar{
  width:32px;
  height:32px;
  border-radius:50%;
  overflow:hidden;
  position:relative;
  flex:0 0 32px;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.12);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:13px;
  font-weight:700;
  color:#dbe7f5;
}
.qws-msg-avatar img{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:cover;
}
.qws-msg-bubble{
  max-width:75%;
  padding:10px 12px;
  border-radius:12px;
  font-size:14px;
  line-height:1.4;
  word-wrap:break-word;
  white-space:pre-wrap;
  display:flex;
  flex-direction:column;
  cursor:default;
  position:relative;
}
.qws-msg-content{
  white-space:pre-wrap;
  word-break:break-word;
}
.qws-msg-item-card{
  margin-top:6px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  border-radius:10px;
  background:rgba(0,0,0,0.18);
  border:1px solid rgba(255,255,255,0.08);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
  max-width:100%;
}
.qws-msg-item-icon{
  width:36px;
  height:36px;
  border-radius:10px;
  background:rgba(255,255,255,0.08);
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
  font-weight:700;
  flex:0 0 auto;
  overflow:hidden;
}
.qws-msg-item-meta{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
}
.qws-msg-item-title{
  font-weight:600;
  font-size:12px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qws-msg-item-sub{
  font-size:11px;
  opacity:0.7;
}
.qws-msg-bubble.incoming{
  align-self:flex-start;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.08);
}
.qws-msg-bubble.outgoing{
  align-self:flex-end;
  background:rgba(122,162,255,.22);
  border:1px solid rgba(122,162,255,.45);
}
.qws-msg-loading{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px 0;
  min-height:120px;
}
.qws-msg-loading-dots{
  display:flex;
  gap:6px;
  align-items:center;
}
.qws-msg-loading-dots span{
  width:8px;
  height:8px;
  border-radius:50%;
  background:rgba(255,255,255,0.65);
  display:inline-block;
  animation:qws-msg-bounce 1s ease-in-out infinite;
}
.qws-msg-loading-dots span:nth-child(2){
  animation-delay:0.15s;
}
.qws-msg-loading-dots span:nth-child(3){
  animation-delay:0.3s;
}
@keyframes qws-msg-bounce{
  0%, 80%, 100% { transform:translateY(0); opacity:0.6; }
  40% { transform:translateY(-6px); opacity:1; }
}
.qws-msg-empty{
  opacity:.6;
  font-size:13px;
  text-align:center;
  margin:auto;
}
@media (max-width: 700px){
  .qws-msg-body{
    grid-template-columns:1fr;
    grid-template-rows:160px 1fr;
  }
  .qws-msg-list{
    border-right:none;
    border-bottom:1px solid var(--qws-border, #ffffff22);
  }
}
`;
  if (!existing) {
    document.head.appendChild(st);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Class
// ─────────────────────────────────────────────────────────────────────────────

export class ChatComponent {
  private slot: HTMLDivElement = document.createElement("div");
  private btn: HTMLButtonElement = document.createElement("button");
  private badge: HTMLSpanElement = document.createElement("span");
  private panel: HTMLDivElement = document.createElement("div");

  private listEl: HTMLDivElement = document.createElement("div");
  private threadHeadEl: HTMLDivElement = document.createElement("div");
  private threadBodyEl: HTMLDivElement = document.createElement("div");
  private inputEl: HTMLInputElement = document.createElement("input");
  private sendBtn: HTMLButtonElement = document.createElement("button");
  private emojiBtn: HTMLButtonElement = document.createElement("button");
  private charCountEl: HTMLDivElement = document.createElement("div");

  private opts: ChatComponentOptions;
  private embedded = false;
  private panelOpen = false;
  private selectedConversationId: string | null = null;

  private conversations: ChatConversation[] = [];
  private messagesByConversation = new Map<string, ChatMessage[]>();
  private emojiPickerInstance: any = null;

  private keyHandler = (e: KeyboardEvent) => {
    // Bloquer les touches du jeu quand l'input est focus
    if (document.activeElement === this.inputEl) {
      e.stopPropagation();
    }
  };

  constructor(options: ChatComponentOptions = {}) {
    this.opts = options;
    this.embedded = Boolean(options.embedded);

    ensureChatComponentStyle();
    this.slot = this.createSlot();
    this.btn = this.createButton();
    this.badge = this.createBadge();
    this.panel = this.createPanel();

    // Bloquer les touches du jeu en mode capture
    window.addEventListener("keydown", this.keyHandler, true);
    window.addEventListener("keyup", this.keyHandler, true);

    if (this.embedded) {
      this.panel.classList.add("qws-msg-panel-embedded");
      this.panel.style.display = "block";
    } else {
      this.btn.onclick = () => {
        const next = this.panel.style.display !== "block";
        this.panel.style.display = next ? "block" : "none";
        this.panelOpen = next;
      };
    }
  }

  private createSlot(): HTMLDivElement {
    const slot = document.createElement("div");
    style(slot, {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      position: "relative",
      pointerEvents: "auto",
    });
    return slot;
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = "💬";
    btn.title = "Messages";
    this.applyFallbackButtonStyles();
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
      pointerEvents: "auto",
    });
    setProps(this.btn, {
      "-webkit-font-smoothing": "antialiased",
      "-moz-osx-font-smoothing": "grayscale",
    });
  }

  private createBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    style(badge, {
      position: "absolute",
      top: "-4px",
      right: "-4px",
      minWidth: "18px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "999px",
      background: "#D02128",
      color: "#fff",
      fontSize: "11px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    });
    return badge;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "qws-msg-panel";

    if (!this.embedded) {
      const head = document.createElement("div");
      head.className = "qws-msg-head";
      head.textContent = "Messages";
      panel.appendChild(head);
    }

    const body = document.createElement("div");
    body.className = "qws-msg-body";

    // Left: Conversation list
    this.listEl.className = "qws-msg-list";
    body.appendChild(this.listEl);

    // Right: Thread
    const thread = document.createElement("div");
    thread.className = "qws-msg-thread";

    this.threadHeadEl.className = "qws-msg-thread-head";
    this.threadHeadEl.textContent = "Select a conversation";
    thread.appendChild(this.threadHeadEl);

    this.threadBodyEl.className = "qws-msg-thread-body";
    thread.appendChild(this.threadBodyEl);

    // Input area
    const inputWrap = document.createElement("div");
    inputWrap.className = "qws-msg-input";

    // Import button
    const importWrap = document.createElement("div");
    importWrap.className = "qws-msg-import";

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "qws-msg-import-btn";
    importBtn.textContent = "+";

    const importMenu = document.createElement("div");
    importMenu.className = "qws-msg-import-menu";
    importMenu.style.display = "none";

    const importItemBtn = document.createElement("button");
    importItemBtn.type = "button";
    importItemBtn.textContent = "Import item";
    importItemBtn.onclick = () => {
      console.log("[ChatComponent] Import item clicked");
      importMenu.style.display = "none";
      // TODO: implement item import from game
    };

    const inviteRoomBtn = document.createElement("button");
    inviteRoomBtn.type = "button";
    inviteRoomBtn.textContent = "Invite to room";
    inviteRoomBtn.onclick = () => {
      console.log("[ChatComponent] Invite to room clicked");
      importMenu.style.display = "none";
      // TODO: implement room invitation
    };

    importMenu.appendChild(importItemBtn);
    importMenu.appendChild(inviteRoomBtn);

    importBtn.onclick = () => {
      const isVisible = importMenu.style.display !== "none";
      importMenu.style.display = isVisible ? "none" : "block";
    };

    importWrap.appendChild(importBtn);
    importWrap.appendChild(importMenu);
    inputWrap.appendChild(importWrap);

    // Input wrapper with emoji button inside
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "qws-msg-input-wrapper";

    this.inputEl.placeholder = "Type a message...";
    this.inputEl.maxLength = MAX_MESSAGE_LENGTH;
    this.inputEl.addEventListener("input", () => this.updateCharCount());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });
    inputWrapper.appendChild(this.inputEl);

    // Emoji button and picker
    const emojiWrap = document.createElement("div");
    emojiWrap.className = "qws-msg-emoji";
    this.emojiBtn.className = "qws-msg-emoji-btn";
    this.emojiBtn.type = "button";
    this.emojiBtn.textContent = "😊";

    const emojiPickerWrap = document.createElement("div");
    emojiPickerWrap.className = "qws-msg-emoji-picker";

    this.emojiBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = emojiPickerWrap.classList.contains("visible");
      if (isVisible) {
        emojiPickerWrap.classList.remove("visible");
        this.emojiBtn.classList.remove("active");
        document.removeEventListener("click", closeEmojiPicker);
      } else {
        this.loadEmojiPicker(emojiPickerWrap);
        emojiPickerWrap.classList.add("visible");
        this.emojiBtn.classList.add("active");
        // Close picker when clicking outside
        setTimeout(() => {
          document.addEventListener("click", closeEmojiPicker);
        }, 0);
      }
    };

    const closeEmojiPicker = (e: MouseEvent) => {
      if (!emojiWrap.contains(e.target as Node)) {
        emojiPickerWrap.classList.remove("visible");
        this.emojiBtn.classList.remove("active");
        document.removeEventListener("click", closeEmojiPicker);
      }
    };

    emojiWrap.appendChild(this.emojiBtn);
    emojiWrap.appendChild(emojiPickerWrap);
    inputWrapper.appendChild(emojiWrap);

    inputWrap.appendChild(inputWrapper);

    this.charCountEl.className = "qws-msg-char-count";
    inputWrap.appendChild(this.charCountEl);

    this.sendBtn.className = "qws-msg-send-btn";
    this.sendBtn.textContent = "Send";
    this.sendBtn.onclick = () => this.handleSendMessage();
    inputWrap.appendChild(this.sendBtn);

    thread.appendChild(inputWrap);
    body.appendChild(thread);
    panel.appendChild(body);

    return panel;
  }

  private updateCharCount(): void {
    const len = this.inputEl.value.length;
    this.charCountEl.textContent = `${len}/${MAX_MESSAGE_LENGTH}`;
    this.charCountEl.classList.toggle("over", len > MAX_MESSAGE_LENGTH);
  }

  private async loadEmojiPicker(container: HTMLDivElement): Promise<void> {
    if (this.emojiPickerInstance) return;

    try {
      const { Picker } = await import("emoji-picker-element");
      const picker = new Picker({
        locale: "en",
        dataSource: "https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json",
      });

      // Style the picker
      picker.style.cssText = `
        --background: var(--qws-panel, #111823);
        --border-color: var(--qws-border, #ffffff22);
        --indicator-color: var(--qws-accent, #7aa2ff);
        --input-border-color: var(--qws-border, #ffffff33);
        --input-font-color: var(--qws-text, #e7eef7);
        --input-placeholder-color: rgba(231,238,247,0.5);
        --outline-color: var(--qws-accent, #7aa2ff);
        --category-emoji-size: 1.125rem;
      `;

      // Listen for emoji selection
      picker.addEventListener("emoji-click", (event: any) => {
        const emoji = event.detail.unicode || event.detail.emoji.unicode;
        this.insertEmoji(emoji);
        container.classList.remove("visible");
        this.emojiBtn.classList.remove("active");
      });

      this.emojiPickerInstance = picker;
      container.appendChild(picker);
    } catch (error) {
      console.error("[ChatComponent] Failed to load emoji picker:", error);
    }
  }

  private insertEmoji(emoji: string): void {
    const start = this.inputEl.selectionStart || 0;
    const end = this.inputEl.selectionEnd || 0;
    const text = this.inputEl.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    this.inputEl.value = before + emoji + after;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = start + emoji.length;
    this.inputEl.focus();
    this.updateCharCount();
  }

  private handleSendMessage(): void {
    const body = this.inputEl.value.trim();
    if (!body || !this.selectedConversationId) return;
    if (body.length > MAX_MESSAGE_LENGTH) return;

    this.opts.onSendMessage?.(this.selectedConversationId, body);
    this.inputEl.value = "";
    this.updateCharCount();
  }

  private renderConversationList(): void {
    this.listEl.innerHTML = "";

    if (this.conversations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "qws-msg-empty";
      empty.textContent = "No conversations";
      this.listEl.appendChild(empty);
      return;
    }

    this.conversations.forEach((conv) => {
      const row = document.createElement("div");
      row.className = "qws-msg-friend";
      if (conv.id === this.selectedConversationId) {
        row.classList.add("active");
      }
      if (conv.unreadCount && conv.unreadCount > 0) {
        row.classList.add("unread");
      }

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "qws-msg-friend-avatar-wrap";
      const avatar = document.createElement("div");
      avatar.className = "qws-msg-friend-avatar";
      if (conv.avatarUrl) {
        const img = document.createElement("img");
        img.src = conv.avatarUrl;
        avatar.appendChild(img);
      } else {
        avatar.textContent = conv.displayName.charAt(0).toUpperCase();
      }
      avatarWrap.appendChild(avatar);

      if (conv.isOnline) {
        const dot = document.createElement("span");
        dot.className = "qws-msg-status-dot";
        avatarWrap.appendChild(dot);
      }

      const meta = document.createElement("div");
      meta.className = "qws-msg-friend-meta";
      const name = document.createElement("div");
      name.className = "qws-msg-friend-name";
      name.textContent = conv.displayName;
      meta.appendChild(name);

      if (conv.subtitle) {
        const sub = document.createElement("div");
        sub.className = "qws-msg-friend-sub";
        sub.textContent = conv.subtitle;
        meta.appendChild(sub);
      }

      row.appendChild(avatarWrap);
      row.appendChild(meta);

      if (conv.unreadCount && conv.unreadCount > 0) {
        const badge = document.createElement("span");
        badge.className = "qws-msg-unread-badge";
        badge.textContent = String(conv.unreadCount);
        row.appendChild(badge);
      }

      row.onclick = () => {
        this.selectedConversationId = conv.id;
        this.opts.onSelectConversation?.(conv.id);
        this.renderConversationList();
        this.renderThread();
      };

      this.listEl.appendChild(row);
    });
  }

  private renderThread(): void {
    if (!this.selectedConversationId) {
      this.threadHeadEl.textContent = "Select a conversation";
      this.threadBodyEl.innerHTML = "";
      return;
    }

    const conv = this.conversations.find((c) => c.id === this.selectedConversationId);
    if (conv) {
      this.threadHeadEl.textContent = conv.displayName;
    }

    const messages = this.messagesByConversation.get(this.selectedConversationId) || [];
    this.threadBodyEl.innerHTML = "";

    if (messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "qws-msg-empty";
      empty.textContent = "No messages yet";
      this.threadBodyEl.appendChild(empty);
      return;
    }

    messages.forEach((msg) => {
      const row = document.createElement("div");
      row.className = "qws-msg-row";
      if (msg.isOutgoing) {
        row.classList.add("outgoing");
      }

      if (!msg.isOutgoing) {
        const avatar = document.createElement("div");
        avatar.className = "qws-msg-avatar";
        avatar.textContent = msg.senderId.charAt(0).toUpperCase();
        row.appendChild(avatar);
      }

      const bubble = document.createElement("div");
      bubble.className = "qws-msg-bubble";
      bubble.classList.add(msg.isOutgoing ? "outgoing" : "incoming");

      const content = document.createElement("div");
      content.className = "qws-msg-content";
      content.textContent = msg.body;
      bubble.appendChild(content);

      row.appendChild(bubble);
      this.threadBodyEl.appendChild(row);
    });

    this.threadBodyEl.scrollTop = this.threadBodyEl.scrollHeight;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  public setConversations(conversations: ChatConversation[]): void {
    this.conversations = conversations;
    this.renderConversationList();
  }

  public setMessages(conversationId: string, messages: ChatMessage[]): void {
    this.messagesByConversation.set(conversationId, messages);
    if (this.selectedConversationId === conversationId) {
      this.renderThread();
    }
  }

  public updateBadge(count: number): void {
    if (count > 0) {
      this.badge.textContent = String(count);
      this.badge.style.display = "inline-flex";
    } else {
      this.badge.style.display = "none";
    }
  }

  public mount(parent?: HTMLElement): void {
    if (!this.embedded) {
      this.slot.append(this.btn, this.badge);
      if (parent) {
        parent.appendChild(this.slot);
      }
    }
    if (parent) {
      parent.appendChild(this.panel);
    }
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.keyHandler, true);
    window.removeEventListener("keyup", this.keyHandler, true);
    this.slot.remove();
    this.panel.remove();
  }

  public show(): void {
    this.panel.style.display = "block";
    this.panelOpen = true;
  }

  public hide(): void {
    this.panel.style.display = "none";
    this.panelOpen = false;
  }
}
