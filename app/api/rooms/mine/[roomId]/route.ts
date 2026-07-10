import { NextResponse } from "next/server";
import { getBearerToken, getRequestUser } from "@/lib/server-auth";
import { removeSavedRoom } from "@/lib/server-rooms";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const accessToken = getBearerToken(request);
  if (!accessToken) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { roomId } = await params;
  const result = await removeSavedRoom(roomId, user.id, accessToken);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
