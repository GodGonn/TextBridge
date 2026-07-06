import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { Room } from "@/lib/types";
import { generateRoomCode } from "@/lib/utils";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { code?: string };
  let code = payload.code?.trim().toUpperCase() || generateRoomCode();

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  if (localStore.rooms.has(code)) {
    return NextResponse.json({ error: "Room code already exists" }, { status: 409 });
  }

  while (localStore.rooms.has(code)) {
    code = generateRoomCode();
  }

  const room: Room = {
    id: crypto.randomUUID(),
    code,
    name: null,
    password: null,
    created_at: new Date().toISOString(),
    expired_at: null,
    created_by: null,
    is_private: false,
  };

  localStore.rooms.set(code, room);
  localStore.messages.set(room.id, []);
  localStore.files.set(room.id, []);

  return NextResponse.json(room);
}
