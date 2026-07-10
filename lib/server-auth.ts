import "server-only";

import { createClient } from "@supabase/supabase-js";

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
