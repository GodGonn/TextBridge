import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { BridgeFile } from "@/lib/types";

type RouteContext = {
  params: Promise<{ code: string; fileId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { code, fileId } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const patch = (await request.json()) as Partial<BridgeFile>;
  const files = localStore.files.get(room.id) ?? [];
  const nextFiles = files.map((file) => (file.id === fileId ? { ...file, ...patch } : file));
  const updated = nextFiles.find((file) => file.id === fileId);

  if (!updated) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  localStore.files.set(room.id, nextFiles);

  return NextResponse.json(updated);
}
