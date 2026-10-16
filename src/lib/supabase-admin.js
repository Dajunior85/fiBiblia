
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!import.meta.env.DEV) {
  throw new Error("O cliente administrativo só pode ser usado em desenvolvimento.");
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configuração administrativa do Supabase ausente.");
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
