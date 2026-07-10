import { NextResponse } from "next/server";
import { createRoomFile, getRoomFiles } from "@/lib/server-rooms";
import { getRequestUser } from "@/lib/server-auth";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const user = await getRequestUser(request);
  const result = await getRoomFiles(code, password, user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.items);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const password = request.headers.get("x-room-password");
  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const user = await getRequestUser(request);
  const result = await createRoomFile(code, password, upload, user?.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
