import type { BridgeFile, BridgeMessage, Room } from "@/lib/types";

type Store = {
  rooms: Map<string, Room>;
  messages: Map<string, BridgeMessage[]>;
  files: Map<string, BridgeFile[]>;
};

const globalStore = globalThis as typeof globalThis & {
  textBridgeStore?: Store;
};

export const localStore =
  globalStore.textBridgeStore ??
  (globalStore.textBridgeStore = {
    rooms: new Map<string, Room>(),
    messages: new Map<string, BridgeMessage[]>(),
    files: new Map<string, BridgeFile[]>(),
  });
