import { NextResponse } from "next/server";
import { createRoomFile, getRoomFiles } from "@/lib/server-rooms";
import { getRequestSender, getRequestUser } from "@/lib/server-auth";
import { consumeRateLimit, getRequestAddress } from "@/lib/rate-limit";
import { MAX_UPLOAD_REQUEST_BYTES, MAX_SUPABASE_UPLOAD_BYTES } from "@/lib/upload-limits";

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
  const rateLimit = await consumeRateLimit(`upload-file:${getRequestAddress(request)}:${code.toUpperCase()}`, 30, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: "Upload request is too large. The file limit is 100 MB." }, { status: 413 });
  }

  const password = request.headers.get("x-room-password");
  let formData: FormData;
  let exceededBodyLimit = false;
  try {
    if (!request.body) return NextResponse.json({ error: "Upload body is missing" }, { status: 400 });
    let totalBytes = 0;
    const boundedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
          exceededBodyLimit = true;
          throw new Error("Upload request is too large");
        }
        controller.enqueue(chunk);
      },
    }));
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: boundedBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    formData = await boundedRequest.formData();
  } catch {
    if (exceededBodyLimit) {
      return NextResponse.json({ error: "Upload request is too large. The file limit is 100 MB." }, { status: 413 });
    }
    return NextResponse.json({ error: "Could not read upload. Check the file and try again." }, { status: 400 });
  }
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (upload.size > MAX_SUPABASE_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Files must be 100 MB or smaller." }, { status: 413 });
  }

  const user = await getRequestUser(request);
  const sender = getRequestSender(request, user?.id ?? null);
  const result = await createRoomFile(code, password, upload, user?.id, sender);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.item);
}
