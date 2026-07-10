import { NextResponse } from "next/server";
import { updateRoomFile } from "@/lib/server-rooms";
import { getRequestUser } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ code: string; fileId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, fileId } = await params;
  const password = request.headers.get("x-room-password");
  const body = (await request.json()) as { deleted_at?: unknown };
  if (body.deleted_at !== null && typeof body.deleted_at !== "string") {
    return NextResponse.json({ error: "No valid changes supplied" }, { status: 400 });
  }
  const patch = { deleted_at: body.deleted_at };
  const user = await getRequestUser(request);
  const result = await updateRoomFile(code, fileId, password, patch, user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
