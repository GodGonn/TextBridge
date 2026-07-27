const CACHE_NAME = "textbridge-shell-v1";
const SHARE_DB = "textbridge-share-target";
const SHARE_STORE = "shares";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/share", "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  ]));
});

function openShareDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARE_STORE)) {
        request.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedPayload(payload) {
  const database = await openShareDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(SHARE_STORE, "readwrite");
    transaction.objectStore(SHARE_STORE).put(payload);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function handleShare(request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item) => item instanceof File && item.size > 0);
  await saveSharedPayload({
    id: "pending",
    title: String(formData.get("title") || ""),
    text: String(formData.get("text") || ""),
    url: String(formData.get("url") || ""),
    files,
    createdAt: new Date().toISOString(),
    targetRoomCode: null,
  });
  return Response.redirect(new URL("/share", self.location.origin), 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShare(event.request).catch(() => Response.redirect(new URL("/share?error=share", self.location.origin), 303)));
    return;
  }

  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response || caches.match("/"))));
  }
});
