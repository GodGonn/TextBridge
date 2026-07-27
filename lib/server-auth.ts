import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SenderIdentity } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const authClient = supabaseUrl && supabasePublicKey
  ? createClient(supabaseUrl, supabasePublicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

export async function getRequestUser(request: Request) {
  const token = getBearerToken(request);
  if (!token || !authClient) return null;

  const { data, error } = await authClient.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export function getRequestSender(request: Request, userId: string | null): SenderIdentity {
  const rawDeviceId = request.headers.get("x-device-id")?.trim() ?? "";
  const rawName = request.headers.get("x-device-name")?.trim() ?? "";
  const rawColor = request.headers.get("x-device-color")?.trim() ?? "";
  let decodedName = rawName;

  try {
    decodedName = decodeURIComponent(rawName);
  } catch {
    decodedName = rawName;
  }

  const name = decodedName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);

  return {
    userId,
    deviceId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawDeviceId)
      ? rawDeviceId
      : null,
    name: name || (userId ? "Signed-in device" : "Guest device"),
    color: /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#34d399",
  };
}
