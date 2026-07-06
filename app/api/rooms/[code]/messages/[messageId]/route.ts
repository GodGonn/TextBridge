import { NextResponse } from "next/server";
import type { BridgeMessage } from "@/lib/types";
import { updateRoomMessage } from "@/lib/server-rooms";

type RouteContext = {
  params: Promise<{ code: string; messageId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, messageId } = await params;
  const password = request.headers.get("x-room-password");
  const patch = (await request.json()) as Partial<BridgeMessage>;
  const result = await updateRoomMessage(code, messageId, password, patch);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
