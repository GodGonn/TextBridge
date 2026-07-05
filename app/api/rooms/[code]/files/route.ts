import { NextResponse } from "next/server";
import { localStore } from "@/lib/local-store";
import type { BridgeFile } from "@/lib/types";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { code } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(localStore.files.get(room.id) ?? []);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const room = localStore.rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (upload.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Local mode supports files up to 10 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  const dataUrl = `data:${upload.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
  const file: BridgeFile = {
    id: crypto.randomUUID(),
    room_id: room.id,
    file_name: upload.name,
    file_url: dataUrl,
    file_type: upload.type || "application/octet-stream",
    file_size: upload.size,
    created_at: new Date().toISOString(),
    expired_at: null,
    deleted_at: null,
  };

  const files = localStore.files.get(room.id) ?? [];
  files.push(file);
  localStore.files.set(room.id, files);

  return NextResponse.json(file);
}
