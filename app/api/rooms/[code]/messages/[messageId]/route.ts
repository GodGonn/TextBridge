import { NextResponse } from "next/server";
import { updateRoomMessage } from "@/lib/server-rooms";
import { detectMessageType } from "@/lib/utils";
import { getRequestUser } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ code: string; messageId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, messageId } = await params;
  const password = request.headers.get("x-room-password");
  const body = (await request.json()) as { text?: unknown; is_pinned?: unknown; deleted_at?: unknown };
  const patch: { text?: string; type?: ReturnType<typeof detectMessageType>; is_pinned?: boolean; deleted_at?: string | null } = {};

  if (typeof body.text === "string") {
    const text = body.text.trim();
    if (!text) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    patch.text = text;
    patch.type = detectMessageType(text);
  }
  if (typeof body.is_pinned === "boolean") patch.is_pinned = body.is_pinned;
  if (body.deleted_at === null || typeof body.deleted_at === "string") patch.deleted_at = body.deleted_at;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid changes supplied" }, { status: 400 });
  }
  const user = await getRequestUser(request);
  const result = await updateRoomMessage(code, messageId, password, patch, user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
