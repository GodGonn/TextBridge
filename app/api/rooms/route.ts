import { NextResponse } from "next/server";
import { createRoom } from "@/lib/server-rooms";
import { getBearerToken, getRequestUser } from "@/lib/server-auth";
import { consumeRateLimit, getRequestAddress } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = await consumeRateLimit(`create-room:${getRequestAddress(request)}`, 20, 10 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many rooms created. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
    const user = await getRequestUser(request);
    const accessToken = getBearerToken(request);
    const payload = (await request.json().catch(() => ({}))) as {
      code?: string;
      password?: string;
      isPrivate?: boolean;
      expiresInMinutes?: number | null;
    };
    const result = await createRoom({
      ...payload,
      createdBy: user?.id ?? null,
      accessToken: user ? accessToken : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.room);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unknown database error";
    return NextResponse.json({ error: `Could not create room: ${message}` }, { status: 500 });
  }
}
