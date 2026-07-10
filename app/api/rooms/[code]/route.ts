import { NextResponse } from "next/server";
import { getRoomView } from "@/lib/server-rooms";
import { getBearerToken, getRequestUser } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
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
