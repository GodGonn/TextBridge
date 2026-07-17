import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStore } from "@/lib/local-store";
import type { BridgeFile, BridgeMessage, Room, RoomView } from "@/lib/types";
import { detectMessageType, generateRoomCode } from "@/lib/utils";

type StorageMode = "supabase" | "local";

type RoomCreateInput = {
  code?: string;
  password?: string | null;
  isPrivate?: boolean;
  expiresInMinutes?: number | null;
  createdBy?: string | null;
  accessToken?: string | null;
};

type RoomAccessResult =
  | { ok: true; room: Room; storageMode: StorageMode }
  | {
      ok: false;
      status: 401 | 403 | 404 | 410;
      error: string;
      requiresPassword?: boolean;
    };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServerKey = supabaseSecretKey || supabaseServiceRoleKey || supabaseAnonKey;

const serverSupabase =
  supabaseUrl && supabaseServerKey
    ? createClient(supabaseUrl, supabaseServerKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function isExpired(value: string | null | undefined) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function getExpiryDate(expiresInMinutes?: number | null) {
  if (!expiresInMinutes || expiresInMinutes <= 0) return null;
  return new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
}

function toRoomView(room: Room, storageMode: StorageMode, actorUserId?: string | null): RoomView {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    created_at: room.created_at,
    expired_at: room.expired_at,
    created_by: room.created_by,
    is_private: room.is_private,
    is_locked: Boolean(room.is_locked),
    requires_password: Boolean(room.password),
    storage_mode: storageMode,
    is_owner: Boolean(actorUserId && room.created_by === actorUserId),
  };
}

function passwordsMatch(storedHash: string | null, password?: string | null) {
  if (!storedHash) return true;
  if (!password) return false;

  const incomingHash = Buffer.from(hashPassword(password));
  const savedHash = Buffer.from(storedHash);

  return incomingHash.length === savedHash.length && timingSafeEqual(incomingHash, savedHash);
}

function filterActiveMessages(messages: BridgeMessage[]) {
  return messages.filter((message) => !message.deleted_at && !isExpired(message.expired_at));
}

function filterActiveFiles(files: BridgeFile[]) {
  return files.filter((file) => !file.deleted_at && !isExpired(file.expired_at));
}

async function findSupabaseRoom(code: string) {
  if (!serverSupabase) return null;
  const { data, error } = await serverSupabase.from("rooms").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data as Room | null;
}

function createUserSupabase(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureSavedRoom(userId: string, room: Room, accessToken: string) {
  const userSupabase = createUserSupabase(accessToken);
  if (!userSupabase || room.expired_at) return;

  const { error: userError } = await userSupabase.from("users").upsert(
    { id: userId },
    { onConflict: "id", ignoreDuplicates: false },
  );
  if (userError) throw userError;

  const { error: memberError } = await userSupabase.from("room_members").upsert(
    { room_id: room.id, user_id: userId, role: room.created_by === userId ? "owner" : "member" },
    { onConflict: "room_id,user_id", ignoreDuplicates: false },
  );
  if (memberError) throw memberError;
}

function findLocalRoom(code: string) {
  return localStore.rooms.get(code) ?? null;
}

export async function createRoom(input: RoomCreateInput) {
  const requestedCode = input.code?.trim().toUpperCase() || null;
  let code = requestedCode || generateRoomCode();
  const password = input.password?.trim() || null;
  const isPrivate = Boolean(input.isPrivate || password);
  const expiredAt = getExpiryDate(input.expiresInMinutes);

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return { ok: false as const, status: 400, error: "Invalid room code" };
  }

  if (serverSupabase) {
    const attempts = requestedCode ? 1 : 8;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) code = generateRoomCode();

      const { data, error } = await serverSupabase
        .from("rooms")
        .insert({
          code,
          password: password ? hashPassword(password) : null,
          is_private: isPrivate,
          expired_at: expiredAt,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error?.code === "23505") {
        if (requestedCode) return { ok: false as const, status: 409, error: "Room code already exists" };
        continue;
      }
      if (error || !data) {
        return { ok: false as const, status: 500, error: error?.message ?? "Could not create Supabase room" };
      }
      if (input.createdBy && input.accessToken && !expiredAt) {
        await ensureSavedRoom(input.createdBy, data as Room, input.accessToken);
      }
      return { ok: true as const, room: toRoomView(data as Room, "supabase", input.createdBy) };
    }

    return { ok: false as const, status: 503, error: "Could not generate a unique room code" };
  }

  if (requestedCode && localStore.rooms.has(code)) {
    return { ok: false as const, status: 409, error: "Room code already exists" };
  }

  while (localStore.rooms.has(code)) {
    code = generateRoomCode();
  }

  const room: Room = {
    id: crypto.randomUUID(),
    code,
    name: null,
    password: password ? hashPassword(password) : null,
    created_at: new Date().toISOString(),
    expired_at: expiredAt,
    created_by: null,
    is_private: isPrivate,
    is_locked: false,
  };

  localStore.rooms.set(code, room);
  localStore.messages.set(room.id, []);
  localStore.files.set(room.id, []);

  return { ok: true as const, room: toRoomView(room, "local") };
}

export async function getRoomAccess(codeInput: string, password?: string | null, actorUserId?: string | null): Promise<RoomAccessResult> {
  const code = normalizeCode(codeInput);

  if (serverSupabase) {
    const room = await findSupabaseRoom(code);
    if (room) {
      if (isExpired(room.expired_at)) {
        return { ok: false, status: 410, error: "This room has expired" };
      }
      const isOwner = Boolean(actorUserId && actorUserId === room.created_by);
      if (room.password && !password && !isOwner) {
        return { ok: false, status: 401, error: "Password required", requiresPassword: true };
      }
      if (!isOwner && !passwordsMatch(room.password, password)) {
        return { ok: false, status: 403, error: "Incorrect password", requiresPassword: true };
      }
      return { ok: true, room, storageMode: "supabase" };
    }
  }

  const room = findLocalRoom(code);
  if (!room) {
    return { ok: false, status: 404, error: "Room not found" };
  }
  if (isExpired(room.expired_at)) {
    return { ok: false, status: 410, error: "This room has expired" };
  }
  if (room.password && !password) {
    return { ok: false, status: 401, error: "Password required", requiresPassword: true };
  }
  if (!passwordsMatch(room.password, password)) {
    return { ok: false, status: 403, error: "Incorrect password", requiresPassword: true };
  }

  return { ok: true, room, storageMode: "local" };
}

export async function getRoomView(
  code: string,
  password?: string | null,
  actorUserId?: string | null,
  accessToken?: string | null,
) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;
  if (actorUserId && accessToken && access.storageMode === "supabase") {
    await ensureSavedRoom(actorUserId, access.room, accessToken);
  }
  return { ok: true as const, room: toRoomView(access.room, access.storageMode, actorUserId) };
}

export async function getRoomMessages(code: string, password?: string | null, actorUserId?: string | null) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;

  if (access.storageMode === "supabase" && serverSupabase) {
    const { data, error } = await serverSupabase
      .from("messages")
      .select("*")
      .eq("room_id", access.room.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      return { ok: false as const, status: 500, error: error.message };
    }

    return { ok: true as const, items: filterActiveMessages((data ?? []) as BridgeMessage[]) };
  }

  return { ok: true as const, items: filterActiveMessages(localStore.messages.get(access.room.id) ?? []) };
}

function canWriteToRoom(room: Room, actorUserId?: string | null) {
  return !room.is_locked || Boolean(actorUserId && actorUserId === room.created_by);
}

export async function createRoomMessage(code: string, password: string | null | undefined, textInput: string, actorUserId?: string | null) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;
  if (!canWriteToRoom(access.room, actorUserId)) {
    return { ok: false as const, status: 423, error: "This room is locked by its owner" };
  }

  const text = textInput.trim();
  if (!text) {
    return { ok: false as const, status: 400, error: "Text is required" };
  }

  if (access.storageMode === "supabase" && serverSupabase) {
    const { data, error } = await serverSupabase
      .from("messages")
      .insert({
        room_id: access.room.id,
        text,
        type: detectMessageType(text),
        is_pinned: false,
        expired_at: access.room.expired_at,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false as const, status: 500, error: error?.message ?? "Create message failed" };
    }

    return { ok: true as const, item: data as BridgeMessage };
  }

  const message: BridgeMessage = {
    id: crypto.randomUUID(),
    room_id: access.room.id,
    text,
    type: detectMessageType(text),
    is_pinned: false,
    created_at: new Date().toISOString(),
    expired_at: access.room.expired_at,
    deleted_at: null,
  };

  const messages = localStore.messages.get(access.room.id) ?? [];
  messages.push(message);
  localStore.messages.set(access.room.id, messages);

  return { ok: true as const, item: message };
}

export async function updateRoomMessage(
  code: string,
  messageId: string,
  password: string | null | undefined,
  patch: Partial<BridgeMessage>,
  actorUserId?: string | null,
) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;
  if (!canWriteToRoom(access.room, actorUserId)) {
    return { ok: false as const, status: 423, error: "This room is locked by its owner" };
  }

  if (access.storageMode === "supabase" && serverSupabase) {
    const { data, error } = await serverSupabase
      .from("messages")
      .update(patch)
      .eq("id", messageId)
      .eq("room_id", access.room.id)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false as const, status: 404, error: error?.message ?? "Message not found" };
    }

    return { ok: true as const, item: data as BridgeMessage };
  }

  const messages = localStore.messages.get(access.room.id) ?? [];
  const nextMessages = messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message));
  const updated = nextMessages.find((message) => message.id === messageId);

  if (!updated) {
    return { ok: false as const, status: 404, error: "Message not found" };
  }

  localStore.messages.set(access.room.id, nextMessages);
  return { ok: true as const, item: updated };
}

export async function getRoomFiles(code: string, password?: string | null, actorUserId?: string | null) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;

  if (access.storageMode === "supabase" && serverSupabase) {
    const { data, error } = await serverSupabase
      .from("files")
      .select("*")
      .eq("room_id", access.room.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      return { ok: false as const, status: 500, error: error.message };
    }

    return { ok: true as const, items: filterActiveFiles((data ?? []) as BridgeFile[]) };
  }

  return { ok: true as const, items: filterActiveFiles(localStore.files.get(access.room.id) ?? []) };
}

export async function createRoomFile(code: string, password: string | null | undefined, upload: File, actorUserId?: string | null) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;
  if (!canWriteToRoom(access.room, actorUserId)) {
    return { ok: false as const, status: 423, error: "This room is locked by its owner" };
  }

  if (access.storageMode === "supabase" && serverSupabase) {
    const storagePath = `${access.room.id}/${crypto.randomUUID()}-${upload.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await serverSupabase.storage.from("textbridge-files").upload(storagePath, upload, {
      contentType: upload.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      return { ok: false as const, status: 500, error: uploadError.message };
    }

    const { data: publicData } = serverSupabase.storage.from("textbridge-files").getPublicUrl(storagePath);
    const { data, error } = await serverSupabase
      .from("files")
      .insert({
        room_id: access.room.id,
        file_name: upload.name,
        file_url: publicData.publicUrl,
        file_type: upload.type || "application/octet-stream",
        file_size: upload.size,
        expired_at: access.room.expired_at,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false as const, status: 500, error: error?.message ?? "Upload failed" };
    }

    return { ok: true as const, item: data as BridgeFile };
  }

  if (upload.size > 10 * 1024 * 1024) {
    return { ok: false as const, status: 400, error: "Local mode supports files up to 10 MB" };
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  const dataUrl = `data:${upload.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
  const file: BridgeFile = {
    id: crypto.randomUUID(),
    room_id: access.room.id,
    file_name: upload.name,
    file_url: dataUrl,
    file_type: upload.type || "application/octet-stream",
    file_size: upload.size,
    created_at: new Date().toISOString(),
    expired_at: access.room.expired_at,
    deleted_at: null,
  };

  const files = localStore.files.get(access.room.id) ?? [];
  files.push(file);
  localStore.files.set(access.room.id, files);

  return { ok: true as const, item: file };
}

export async function updateRoomFile(
  code: string,
  fileId: string,
  password: string | null | undefined,
  patch: Partial<BridgeFile>,
  actorUserId?: string | null,
) {
  const access = await getRoomAccess(code, password, actorUserId);
  if (!access.ok) return access;
  if (!canWriteToRoom(access.room, actorUserId)) {
    return { ok: false as const, status: 423, error: "This room is locked by its owner" };
  }

  if (access.storageMode === "supabase" && serverSupabase) {
    const { data, error } = await serverSupabase
      .from("files")
      .update(patch)
      .eq("id", fileId)
      .eq("room_id", access.room.id)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false as const, status: 404, error: error?.message ?? "File not found" };
    }

    return { ok: true as const, item: data as BridgeFile };
  }

  const files = localStore.files.get(access.room.id) ?? [];
  const nextFiles = files.map((file) => (file.id === fileId ? { ...file, ...patch } : file));
  const updated = nextFiles.find((file) => file.id === fileId);

  if (!updated) {
    return { ok: false as const, status: 404, error: "File not found" };
  }

  localStore.files.set(access.room.id, nextFiles);
  return { ok: true as const, item: updated };
}

export async function getOwnedRooms(userId: string, accessToken: string) {
  const userSupabase = createUserSupabase(accessToken);
  if (!userSupabase) return { ok: true as const, items: [] as RoomView[] };

  const { data: memberRows, error: memberError } = await userSupabase
    .from("room_members")
    .select("role, rooms(*)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (memberError) return { ok: false as const, status: 500, error: memberError.message };

  const roomMap = new Map<string, RoomView>();
  for (const row of (memberRows ?? []) as Array<{ rooms: Room | Room[] | null }>) {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    if (!room || room.expired_at) continue;
    roomMap.set(room.id, toRoomView(room, "supabase", userId));
  }

  return {
    ok: true as const,
    items: Array.from(roomMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  };
}

export async function removeSavedRoom(roomId: string, userId: string, accessToken: string) {
  const userSupabase = createUserSupabase(accessToken);
  if (!userSupabase) {
    return { ok: false as const, status: 503, error: "Saved rooms require Supabase" };
  }

  const { data, error } = await userSupabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data) return { ok: false as const, status: 404, error: "Saved room not found" };
  return { ok: true as const };
}

export type OwnerRoomAction =
  | { action: "set_lock"; locked: boolean }
  | { action: "rotate_password"; password: string }
  | { action: "extend_expiry"; minutes: number }
  | { action: "make_permanent" }
  | { action: "clear_room" };

export async function updateOwnedRoom(codeInput: string, userId: string, input: OwnerRoomAction) {
  const code = normalizeCode(codeInput);
  const room = serverSupabase ? await findSupabaseRoom(code) : findLocalRoom(code);

  if (!room) return { ok: false as const, status: 404, error: "Room not found" };
  if (room.created_by !== userId) return { ok: false as const, status: 403, error: "Only the room owner can do this" };
  if (!serverSupabase) return { ok: false as const, status: 503, error: "Owner controls require Supabase" };

  if (input.action === "clear_room") {
    const deletedAt = new Date().toISOString();
    const { data: storedFiles, error: storedFilesError } = await serverSupabase
      .from("files")
      .select("file_url")
      .eq("room_id", room.id)
      .is("deleted_at", null);
    if (storedFilesError) return { ok: false as const, status: 500, error: storedFilesError.message };

    const marker = "/storage/v1/object/public/textbridge-files/";
    const storagePaths = (storedFiles ?? []).flatMap(({ file_url }) => {
      const markerIndex = file_url.indexOf(marker);
      return markerIndex >= 0 ? [decodeURIComponent(file_url.slice(markerIndex + marker.length))] : [];
    });
    if (storagePaths.length > 0) {
      const { error: storageError } = await serverSupabase.storage.from("textbridge-files").remove(storagePaths);
      if (storageError) return { ok: false as const, status: 500, error: storageError.message };
    }

    const [messagesResult, filesResult] = await Promise.all([
      serverSupabase.from("messages").update({ deleted_at: deletedAt }).eq("room_id", room.id).is("deleted_at", null),
      serverSupabase.from("files").update({ deleted_at: deletedAt }).eq("room_id", room.id).is("deleted_at", null),
    ]);
    const error = messagesResult.error || filesResult.error;
    if (error) return { ok: false as const, status: 500, error: error.message };
    return { ok: true as const, room: toRoomView(room, "supabase", userId) };
  }

  let patch: Partial<Room> = {};
  if (input.action === "set_lock") {
    if (typeof input.locked !== "boolean") return { ok: false as const, status: 400, error: "Lock state is required" };
    patch = { is_locked: input.locked };
  }
  if (input.action === "rotate_password") {
    if (typeof input.password !== "string") return { ok: false as const, status: 400, error: "Password is required" };
    const password = input.password.trim();
    if (password.length < 4) return { ok: false as const, status: 400, error: "Password must contain at least 4 characters" };
    patch = { password: hashPassword(password), is_private: true };
  }
  if (input.action === "extend_expiry") {
    if (!Number.isFinite(input.minutes) || input.minutes < 1 || input.minutes > 525_600) {
      return { ok: false as const, status: 400, error: "Expiry extension is invalid" };
    }
    const base = room.expired_at && new Date(room.expired_at).getTime() > Date.now() ? new Date(room.expired_at).getTime() : Date.now();
    patch = { expired_at: new Date(base + input.minutes * 60_000).toISOString() };
  }
  if (input.action === "make_permanent") patch = { expired_at: null };

  const { data, error } = await serverSupabase.from("rooms").update(patch).eq("id", room.id).eq("created_by", userId).select("*").single();
  if (error || !data) return { ok: false as const, status: 500, error: error?.message ?? "Could not update room" };
  return { ok: true as const, room: toRoomView(data as Room, "supabase", userId) };
}
