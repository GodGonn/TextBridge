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

const serverSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
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

function toRoomView(room: Room, storageMode: StorageMode): RoomView {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    created_at: room.created_at,
    expired_at: room.expired_at,
    created_by: room.created_by,
    is_private: room.is_private,
    requires_password: Boolean(room.password),
    storage_mode: storageMode,
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

function findLocalRoom(code: string) {
  return localStore.rooms.get(code) ?? null;
}

export async function createRoom(input: RoomCreateInput) {
  let code = input.code?.trim().toUpperCase() || generateRoomCode();
  const password = input.password?.trim() || null;
  const isPrivate = Boolean(input.isPrivate || password);
  const expiredAt = getExpiryDate(input.expiresInMinutes);

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return { ok: false as const, status: 400, error: "Invalid room code" };
  }

  if (serverSupabase) {
    const existing = await findSupabaseRoom(code);
    if (existing) {
      return { ok: false as const, status: 409, error: "Room code already exists" };
    }

    const { data, error } = await serverSupabase
      .from("rooms")
      .insert({
        code,
        password: password ? hashPassword(password) : null,
        is_private: isPrivate,
        expired_at: expiredAt,
      })
      .select("*")
      .single();

    if (!error && data) {
      return { ok: true as const, room: toRoomView(data as Room, "supabase") };
    }
  }

  if (localStore.rooms.has(code)) {
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
  };

  localStore.rooms.set(code, room);
  localStore.messages.set(room.id, []);
  localStore.files.set(room.id, []);

  return { ok: true as const, room: toRoomView(room, "local") };
}

export async function getRoomAccess(codeInput: string, password?: string | null): Promise<RoomAccessResult> {
  const code = normalizeCode(codeInput);

  if (serverSupabase) {
    const room = await findSupabaseRoom(code);
    if (room) {
      if (isExpired(room.expired_at)) {
        return { ok: false, status: 410, error: "This room has expired" };
      }
      if (room.password && !password) {
        return { ok: false, status: 401, error: "Password required", requiresPassword: true };
      }
      if (!passwordsMatch(room.password, password)) {
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

export async function getRoomView(code: string, password?: string | null) {
  const access = await getRoomAccess(code, password);
  if (!access.ok) return access;
  return { ok: true as const, room: toRoomView(access.room, access.storageMode) };
}

export async function getRoomMessages(code: string, password?: string | null) {
  const access = await getRoomAccess(code, password);
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

export async function createRoomMessage(code: string, password: string | null | undefined, textInput: string) {
  const access = await getRoomAccess(code, password);
  if (!access.ok) return access;

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
) {
  const access = await getRoomAccess(code, password);
  if (!access.ok) return access;

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

export async function getRoomFiles(code: string, password?: string | null) {
  const access = await getRoomAccess(code, password);
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

export async function createRoomFile(code: string, password: string | null | undefined, upload: File) {
  const access = await getRoomAccess(code, password);
  if (!access.ok) return access;

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
) {
  const access = await getRoomAccess(code, password);
  if (!access.ok) return access;

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
