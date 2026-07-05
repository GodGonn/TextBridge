import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { Room } from "@/lib/types";
import { generateRoomCode } from "@/lib/utils";

export async function POST() {
  let code = generateRoomCode();
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

  return NextResponse.json(room);
}

