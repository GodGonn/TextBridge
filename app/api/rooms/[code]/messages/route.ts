import { NextResponse } from "next/server";
import { createRoomMessage, getRoomMessages } from "@/lib/server-rooms";
import { getRequestSender, getRequestUser } from "@/lib/server-auth";
import { consumeRateLimit, getRequestAddress } from "@/lib/rate-limit";

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
  const rateLimit = await consumeRateLimit(`send-message:${getRequestAddress(request)}:${code.toUpperCase()}`, 120, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  const password = request.headers.get("x-room-password");
  const body = (await request.json()) as { text?: string };
  const user = await getRequestUser(request);
  const sender = getRequestSender(request, user?.id ?? null);
  const result = await createRoomMessage(code, password, body.text ?? "", user?.id, sender);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
