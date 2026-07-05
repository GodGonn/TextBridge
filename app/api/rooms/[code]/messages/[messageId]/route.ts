import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { BridgeMessage } from "@/lib/types";

type RouteContext = {
  params: Promise<{ code: string; messageId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, messageId } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const patch = (await request.json()) as Partial<BridgeMessage>;
  const messages = localStore.messages.get(room.id) ?? [];
  const nextMessages = messages.map((message) =>
    message.id === messageId ? { ...message, ...patch } : message,
  );
  const updated = nextMessages.find((message) => message.id === messageId);

  if (!updated) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  localStore.messages.set(room.id, nextMessages);

  return NextResponse.json(updated);
}

