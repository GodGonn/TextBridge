import { NextResponse } from "next/server";
import { createRoomMessage, getRoomMessages } from "@/lib/server-rooms";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const result = await getRoomMessages(code, password);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.items);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const body = (await request.json()) as { text?: string };
  const result = await createRoomMessage(code, password, body.text ?? "");

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
