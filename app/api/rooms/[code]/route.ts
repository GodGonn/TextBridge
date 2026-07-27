import { NextResponse } from "next/server";
import { getRoomView } from "@/lib/server-rooms";
import { getBearerToken, getRequestUser } from "@/lib/server-auth";
import { consumeRateLimit, getRequestAddress } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const rateLimit = consumeRateLimit(`open-room:${getRequestAddress(request)}:${code.toUpperCase()}`, 30, 5 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many room access attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  const password = request.headers.get("x-room-password");
  const user = await getRequestUser(request);
  const result = await getRoomView(code, password, user?.id, getBearerToken(request));

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, requiresPassword: result.requiresPassword ?? false },
      { status: result.status },
    );
  }

  return NextResponse.json(result.room);
}
