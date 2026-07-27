export type PendingShare = {
  id: "pending";
  title: string;
  text: string;
  url: string;
  files: File[];
  createdAt: string;
  targetRoomCode: string | null;
};

const DATABASE_NAME = "textbridge-share-target";
const STORE_NAME = "shares";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingShare(payload: PendingShare) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(payload);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getPendingShare() {
  const database = await openDatabase();
  const payload = await new Promise<PendingShare | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("pending");
    request.onsuccess = () => resolve((request.result as PendingShare | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return payload;
}

export async function assignPendingShareRoom(roomCode: string) {
  const payload = await getPendingShare();
  if (!payload) return false;
  await savePendingShare({ ...payload, targetRoomCode: roomCode.trim().toUpperCase() });
  return true;
}

export async function clearPendingShare() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete("pending");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function getSharedText(payload: Pick<PendingShare, "title" | "text" | "url">) {
  return Array.from(new Set([payload.title, payload.text, payload.url].map((value) => value.trim()).filter(Boolean))).join("\n");
}
