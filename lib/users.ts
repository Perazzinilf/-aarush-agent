import { getDevUser } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function ensureUser(user = getDevUser()): Promise<void> {
  const { error } = await getSupabaseAdmin().from("aarush_users").upsert({
    id: user.id,
    external_key: user.id === "00000000-0000-0000-0000-000000000001" ? "dev-owner" : `dev:${user.id}`,
    display_name: user.name,
  }, { onConflict: "id" });
  if (error) throw error;
}
