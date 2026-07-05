import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { code } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(room);
}

