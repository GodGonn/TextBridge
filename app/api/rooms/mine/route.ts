import { NextResponse } from "next/server";
import { getBearerToken, getRequestUser } from "@/lib/server-auth";
import { getOwnedRooms } from "@/lib/server-rooms";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const accessToken = getBearerToken(request);
  if (!accessToken) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const result = await getOwnedRooms(user.id, accessToken);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.items);
}
