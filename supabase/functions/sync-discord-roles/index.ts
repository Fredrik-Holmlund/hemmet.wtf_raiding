// Sätter members.guild_roles utifrån personens roller på guildens Discord-server.
//
// Körs på två sätt:
//  - av sidan när någon är inloggad (Authorization: personens inloggning): bara den personen
//  - av Supabase Cron (x-cron-secret): alla medlemmar, så att en borttagen roll slutar gälla även om personen inte öppnar sidan
//
// Webbläsaren får aldrig bestämma rollerna: Discord frågas härifrån, med botens hemliga token.
// Boten behöver bara vara med på servern. Den behöver inga behörigheter och inga privilegierade intents.
//
// Hemligheter (Edge Functions → Secrets): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, CRON_SECRET.
// SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY finns automatiskt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Rollnamnen på Discord → behörigheten på sidan. Båda är "ledningen", se perms.js.
const ROLE_MAP: Record<string, string> = {
  "Guild Master": "guild_master",
  "Guild Leader": "guild_leader",
};

const DISCORD = "https://discord.com/api/v10";
const GUILD = Deno.env.get("DISCORD_GUILD_ID")!;
const BOT = { Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}` };
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// role-id → behörighet. Rollerna hämtas varje körning, så att id:n inte behöver ligga här.
async function roleIds(): Promise<Map<string, string>> {
  const r = await fetch(`${DISCORD}/guilds/${GUILD}/roles`, { headers: BOT });
  if (!r.ok) throw new Error(`Discord svarade ${r.status} på rollerna`);
  const roles: { id: string; name: string }[] = await r.json();
  const ids = new Map(roles.filter(x => ROLE_MAP[x.name]).map(x => [x.id, ROLE_MAP[x.name]]));
  // döps rollerna om ska ingen tappa sin behörighet: hellre inget än fel
  if (!ids.size) throw new Error("Hittar inga av rollerna på servern");
  return ids;
}

// null = vi vet inte (Discord svarade med fel), och då ändras ingenting. 404 = personen är inte med på servern.
async function rolesOf(discordId: string, ids: Map<string, string>): Promise<string[] | null> {
  const r = await fetch(`${DISCORD}/guilds/${GUILD}/members/${discordId}`, { headers: BOT });
  if (r.status === 404) return [];
  if (!r.ok) return null;
  const member: { roles: string[] } = await r.json();
  return [...new Set(member.roles.flatMap(id => ids.get(id) ?? []))].sort();
}

type Member = { id: string; discord_id: string | null; guild_roles: string[] };

async function sync(members: Member[]) {
  const ids = await roleIds();
  let changed = 0, skipped = 0;
  for (const m of members) {
    if (!m.discord_id) continue;
    const roles = await rolesOf(m.discord_id, ids);
    if (roles === null) { skipped++; continue; }
    if (roles.join() === [...m.guild_roles].sort().join()) continue;
    const { error } = await db.from("members").update({ guild_roles: roles }).eq("id", m.id);
    if (error) throw new Error(error.message);
    changed++;
  }
  return { checked: members.length, changed, skipped };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
      const { data, error } = await db.from("members").select("id, discord_id, guild_roles");
      if (error) throw new Error(error.message);
      return json(await sync(data));
    }
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ error: "Inte inloggad" }, 401);
    const { data, error } = await db.from("members").select("id, discord_id, guild_roles").eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return json(await sync(data));
  } catch (err) {
    console.error(err);
    return json({ error: "Rollerna kunde inte läsas" }, 502);   // ändrar ingenting: den som hade en roll behåller den
  }
});
