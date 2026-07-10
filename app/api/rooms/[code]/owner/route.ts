import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/server-auth";
import { updateOwnedRoom, type OwnerRoomAction } from "@/lib/server-rooms";

type RouteContext = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { code } = await params;
  const body = (await request.json().catch(() => null)) as OwnerRoomAction | null;
  const validActions = ["set_lock", "rotate_password", "extend_expiry", "make_permanent", "clear_room"];
  if (!body || !validActions.includes(body.action)) {
    return NextResponse.json({ error: "Invalid owner action" }, { status: 400 });
  }

  const result = await updateOwnedRoom(code, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.room);
}
