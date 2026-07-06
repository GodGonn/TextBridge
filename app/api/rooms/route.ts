import { NextResponse } from "next/server";
import { createRoom } from "@/lib/server-rooms";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    code?: string;
    password?: string;
    isPrivate?: boolean;
    expiresInMinutes?: number | null;
  };
  const result = await createRoom(payload);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.room);
}
