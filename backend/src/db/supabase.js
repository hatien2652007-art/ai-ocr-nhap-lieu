import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// Client dùng service_role key: bỏ qua Row Level Security, chỉ được dùng ở backend.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
