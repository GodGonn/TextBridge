import { NextResponse } from "next/server";
import { createRoomMessage, getRoomMessages } from "@/lib/server-rooms";
import { getRequestUser } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const user = await getRequestUser(request);
  const result = await getRoomMessages(code, password, user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.items);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const body = (await request.json()) as { text?: string };
  const user = await getRequestUser(request);
  const result = await createRoomMessage(code, password, body.text ?? "", user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
