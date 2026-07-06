import { NextResponse } from "next/server";
import type { BridgeFile } from "@/lib/types";
import { updateRoomFile } from "@/lib/server-rooms";

type RouteContext = {
  params: Promise<{ code: string; fileId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, fileId } = await params;
  const password = request.headers.get("x-room-password");
  const patch = (await request.json()) as Partial<BridgeFile>;
  const result = await updateRoomFile(code, fileId, password, patch);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
