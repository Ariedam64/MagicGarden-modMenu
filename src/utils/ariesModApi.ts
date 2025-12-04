// src/utils/ariesModApi.ts
import { pageWindow, shareGlobal } from "./page-context";
import { PlayerService } from "../services/player";
import { EditorService } from "../services/editor";
import { PetsService } from "../services/pets";
import { StatsService } from "../services/stats";
import { lockerService } from "../services/locker";
import { MiscService } from "../services/misc";
import { NotifierService } from "../services/notifier";
import { RoomService } from "../services/room";

export type AriesModServices = {
  PlayerService: typeof PlayerService;
  EditorService: typeof EditorService;
  PetsService: typeof PetsService;
  StatsService: typeof StatsService;
  lockerService: typeof lockerService;
  MiscService: typeof MiscService;
  NotifierService: typeof NotifierService;
  RoomService: typeof RoomService;
};

export type AriesModApi = {
  readyAt: number;
  services: AriesModServices;
  antiAfkController?: ReturnType<typeof import("./antiafk").createAntiAfkController>;
};

export type AriesModPageContext = {
  AriesMod?: AriesModApi;
};

export const pageContext = pageWindow as AriesModPageContext;

function buildDefaultServices(): AriesModServices {
  return {
    PlayerService,
    EditorService,
    PetsService,
    StatsService,
    lockerService,
    MiscService,
    NotifierService,
    RoomService,
  };
}

export function createAriesModApi(services?: AriesModServices): AriesModApi {
  return {
    readyAt: Date.now(),
    services: services ?? buildDefaultServices(),
  };
}

export function installAriesModApi(api?: AriesModApi): AriesModApi {
  const resolved = api ?? createAriesModApi();
  pageContext.AriesMod = resolved;
  shareGlobal("AriesMod", resolved);
  return resolved;
}

declare global {
  interface Window {
    AriesMod: AriesModApi;
  }
}
