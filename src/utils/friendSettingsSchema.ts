export type FriendSettings = {
  showOnlineFriendsOnly: boolean;
  autoAcceptIncomingRequests: boolean;
  hideRoomFromPublicList: boolean;
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  showStats: boolean;
};

export const FRIEND_SETTINGS_PATH = "friends.settings";

export const DEFAULT_FRIEND_SETTINGS: FriendSettings = {
  showOnlineFriendsOnly: false,
  autoAcceptIncomingRequests: false,
  hideRoomFromPublicList: false,
  showGarden: true,
  showInventory: true,
  showCoins: true,
  showActivityLog: true,
  showJournal: true,
  showStats: true,
};
