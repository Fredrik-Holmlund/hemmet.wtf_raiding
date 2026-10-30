/* Anslutningen till Supabase. Sidan har inget byggsteg, så klienten hämtas som modul med låst version.
   pkce: inloggningen kommer tillbaka som ?code= i adressen, och krockar inte med sidans #-adresser. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const configured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } })
  : null;
