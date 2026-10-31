// Sätter members.guild_roles, members.in_guild och members.online utifrån guildens Discord-server.
//
// Körs på två sätt:
//  - av sidan när någon är inloggad (Authorization: personens inloggning): bara den personen
//  - av Supabase Cron (x-cron-secret): alla medlemmar, så att en borttagen roll slutar gälla även om personen inte öppnar sidan
//
// Webbläsaren får aldrig bestämma rollerna: Discord frågas härifrån, med botens hemliga token.
// Schemat hämtar hela medlemslistan i ett svep, 1000 personer per anrop, så det klarar stora servrar.
// Det kräver att Server Members Intent är påslaget på boten.
// Online kommer från serverns widget (Serverinställningar → Widget), som bara visar namn och högst 100 personer.
// Personen matchas på namnet på Discord eller i spelet, så det är ungefärligt. Är widgeten avstängd ändras ingen status.
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
const PAGE = 1000;   // mest Discord lämnar ut per anrop
const GUILD = Deno.env.get("DISCORD_GUILD_ID")!;
const BOT = { Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}` };
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const COLUMNS = "id, discord_id, discord, character, guild_roles, in_guild, online";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Member = { id: string; discord_id: string | null; discord: string | null; character: string | null; guild_roles: string[]; in_guild: boolean; online: boolean };
type Seen = { inGuild: boolean; roles: string[] };
const NOT_ON_SERVER: Seen = { inGuild: false, roles: [] };

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

const seen = (roles: string[], ids: Map<string, string>): Seen =>
  ({ inGuild: true, roles: [...new Set(roles.flatMap(id => ids.get(id) ?? []))].sort() });

// Hela servern. Går något fel kastas det, och då ändras ingenting: hellre gamla roller än att alla åker ut.
async function everyone(ids: Map<string, string>): Promise<Map<string, Seen>> {
  const all = new Map<string, Seen>();
  let after = "0";
  while (true) {
    const r = await fetch(`${DISCORD}/guilds/${GUILD}/members?limit=${PAGE}&after=${after}`, { headers: BOT });
    if (!r.ok) throw new Error(`Discord svarade ${r.status} på medlemslistan`);
    const page: { user: { id: string }; roles: string[] }[] = await r.json();
    for (const m of page) all.set(m.user.id, seen(m.roles, ids));
    if (page.length < PAGE) break;
    after = page[page.length - 1].user.id;
  }
  if (!all.size) throw new Error("Discord lämnade ingen medlemslista");
  return all;
}

// Bara en person. 404 = personen är inte med på servern.
async function one(discordId: string, ids: Map<string, string>): Promise<Seen> {
  const r = await fetch(`${DISCORD}/guilds/${GUILD}/members/${discordId}`, { headers: BOT });
  if (r.status === 404) return NOT_ON_SERVER;
  if (!r.ok) throw new Error(`Discord svarade ${r.status} på medlemmen`);
  return seen((await r.json()).roles, ids);
}

// Namnen på de som är online. null = vi vet inte, och då ändras ingen status.
async function onlineNames(): Promise<Set<string> | null> {
  try {
    const r = await fetch(`https://discord.com/api/guilds/${GUILD}/widget.json`);
    if (!r.ok) return null;
    const widget: { members?: { username: string }[] } = await r.json();
    return new Set((widget.members ?? []).map(m => m.username.toLowerCase()));
  } catch {
    return null;
  }
}

// skriver bara det som ändrats
async function apply(members: Member[], lookup: (m: Member) => Seen) {
  const names = await onlineNames();
  let changed = 0;
  for (const m of members) {
    if (!m.discord_id) continue;
    const { inGuild, roles } = lookup(m);
    const online = names ? [m.discord, m.character].some(n => n && names.has(n.toLowerCase())) : m.online;
    if (inGuild === m.in_guild && online === m.online && roles.join() === [...m.guild_roles].sort().join()) continue;
    const { error } = await db.from("members").update({ in_guild: inGuild, guild_roles: roles, online, last_seen: online ? new Date().toISOString() : undefined }).eq("id", m.id);
    if (error) throw new Error(error.message);
    changed++;
  }
  return { checked: members.length, changed };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
      const { data, error } = await db.from("members").select(COLUMNS);
      if (error) throw new Error(error.message);
      const all = await everyone(await roleIds());
      return json(await apply(data, m => all.get(m.discord_id!) ?? NOT_ON_SERVER));
    }
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ error: "Inte inloggad" }, 401);
    const { data, error } = await db.from("members").select(COLUMNS).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    if (!data[0]?.discord_id) return json({ checked: 0, changed: 0 });
    const self = await one(data[0].discord_id, await roleIds());
    return json(await apply(data, () => self));
  } catch (err) {
    console.error(err);
    return json({ error: "Rollerna kunde inte läsas" }, 502);   // ändrar ingenting: den som hade en roll behåller den
  }
});
