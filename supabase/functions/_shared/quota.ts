// Shared per-user daily call caps for the edge functions (Phase 11).
//
// With the deployment shared beyond one account, the JWT gate alone isn't
// enough — any signed-in user could loop the AI functions and run up the
// Anthropic bill. Each call bumps a (user, fn, utc-day) counter via the
// bump_fn_usage RPC (fn_usage table; see README Phase 11) and gets refused
// past the cap.
//
// Fails OPEN by design: the caps are abuse insurance, not billing — a missing
// table/RPC (instance not migrated yet) must never take a feature down.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// The platform has already verified the JWT signature (verify_jwt on); this
// just reads the user id back out of the claims.
export function jwtSub(req: Request): string | null {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^bearer /i, "");
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub ?? null;
  } catch {
    return null;
  }
}

export async function underDailyCap(
  admin: SupabaseClient,
  userId: string,
  fn: string,
  cap: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("bump_fn_usage", { p_user: userId, p_fn: fn, p_cap: cap });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.error(`quota check for ${fn} failed (allowing):`, err);
    return true;
  }
}
