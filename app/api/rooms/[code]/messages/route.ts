import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { BridgeMessage } from "@/lib/types";
import { detectMessageType } from "@/lib/utils";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { code } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(localStore.messages.get(room.id) ?? []);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const message: BridgeMessage = {
    id: crypto.randomUUID(),
    room_id: room.id,
    text,
    type: detectMessageType(text),
    is_pinned: false,
    created_at: new Date().toISOString(),
    expired_at: null,
    deleted_at: null,
  };

  const messages = localStore.messages.get(room.id) ?? [];
  messages.push(message);
  localStore.messages.set(room.id, messages);

  return NextResponse.json(message);
}

