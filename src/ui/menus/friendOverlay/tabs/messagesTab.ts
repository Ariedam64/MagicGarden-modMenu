import { MessagesOverlay } from "../../messagesOverlay";

export type MessagesTabHandle = {
  root: HTMLDivElement;
  show: () => void;
  hide: () => void;
  refresh: () => void;
  openConversation: (playerId: string) => void;
  destroy: () => void;
};

export function createMessagesTab(options: {
  onUnreadChange?: (total: number) => void;
}): MessagesTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-tab qws-fo-tab-messages";

  const messages = new MessagesOverlay({
    embedded: true,
    onUnreadChange: options.onUnreadChange,
  });

  messages.mount(root);
  void messages.init();

  return {
    root,
    show: () => messages.setActive(true),
    hide: () => messages.setActive(false),
    refresh: () => messages.refresh(),
    openConversation: (playerId: string) => messages.openConversation(playerId),
    destroy: () => messages.destroy(),
  };
}
