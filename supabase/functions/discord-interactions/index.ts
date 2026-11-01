// Discords slash-kommandon. Just nu /verify: medlemmen anger sitt namn i spelet och får rollen och rätt smeknamn.
//
// Discord skickar kommandot hit, så ingen bot behöver vara uppkopplad. Varje anrop är signerat med botens publika nyckel.
// Namnet kontrolleras mot Blizzards guildlista. Går listan inte att läsa godkänns namnet, och Supabase Cron kontrollerar det
// i efterhand (x-cron-secret, {"action": "recheck"}). {"action": "register"} lägger upp kommandot på servern.
//
// Hemligheter (Edge Functions → Secrets): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_PUBLIC_KEY, DISCORD_VERIFIED_ROLE (rollens namn),
// CRON_SECRET, BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET, WOW_REALM och WOW_GUILD (Blizzards namn, sätts när API:t är öppet).
// Boten behöver Manage Roles och Manage Nicknames, och dess roll måste ligga över verifieringsrollen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const DISCORD = "https://discord.com/api/v10";
const GUILD = Deno.env.get("DISCORD_GUILD_ID")!;
const BOT = { Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}`, "Content-Type": "application/json" };
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ROLE_NAME = Deno.env.get("DISCORD_VERIFIED_ROLE");
const REALM = Deno.env.get("WOW_REALM");
const WOW_GUILD = Deno.env.get("WOW_GUILD");
const NAMESPACE = Deno.env.get("WOW_NAMESPACE") ?? "profile-forever-eu";
const GRACE_MS = 24 * 60 * 60 * 1000;   // en guildinvite kan ta tid, så ingen tappar rollen direkt
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// samma regel som guard_member i databasen
const NAME = /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,12}( [A-Za-zÀ-ÖØ-öø-ÿ]{2,12})?$/;
const CLASSES: Record<number, string> = { 1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest", 7: "shaman", 8: "mage", 9: "warlock", 11: "druid" };
const SORRY = "Något gick snett hos oss. Testa igen om en stund, eller säg till ledningen.";

const PING = 1, COMMAND = 2;
const PONG = 1, MESSAGE = 4, DEFERRED = 5;
const ONLY_YOU = 64;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));

async function signed(req: Request, body: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", hex(Deno.env.get("DISCORD_PUBLIC_KEY")!), { name: "Ed25519" }, false, ["verify"]);
    const message = new TextEncoder().encode((req.headers.get("x-signature-timestamp") ?? "") + body);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hex(req.headers.get("x-signature-ed25519") ?? ""), message);
  } catch {
    return false;
  }
}

// väntar ut Discords hastighetsgräns, som kan slå till när många verifieras i samma körning
async function discord(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${DISCORD}${path}`, { ...init, headers: BOT });
  if (r.status !== 429) return r;
  const { retry_after } = await r.json();
  await new Promise(done => setTimeout(done, (retry_after ?? 1) * 1000));
  return discord(path, init);
}

// Namnet i gemener → stavningen och klassen i spelet. null = vi vet inte, till exempel att API:t inte är öppet än.
async function guildRoster(): Promise<Map<string, { name: string; cls?: string }> | null> {
  if (!REALM || !WOW_GUILD) return null;
  try {
    const login = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${Deno.env.get("BLIZZARD_CLIENT_ID")}:${Deno.env.get("BLIZZARD_CLIENT_SECRET")}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    if (!login.ok) return null;
    const { access_token } = await login.json();
    const slug = (s: string) => encodeURIComponent(s.toLowerCase());
    const r = await fetch(`https://eu.api.blizzard.com/data/wow/guild/${slug(REALM)}/${slug(WOW_GUILD)}/roster?namespace=${NAMESPACE}&locale=en_GB`, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const { members } = await r.json();
    if (!members?.length) return null;
    return new Map(members.map((m: { character: { name: string; playable_class?: { id: number } } }) =>
      [m.character.name.toLowerCase(), { name: m.character.name, cls: CLASSES[m.character.playable_class?.id ?? 0] }]));
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function verifiedRole(): Promise<string> {
  const r = await discord(`/guilds/${GUILD}/roles`);
  if (!r.ok) throw new Error(`Discord svarade ${r.status} på rollerna`);
  const roles: { id: string; name: string }[] = await r.json();
  const role = roles.find(x => x.name === ROLE_NAME);
  if (!role) throw new Error(`Hittar inte rollen ${ROLE_NAME}`);
  return role.id;
}

// Discord låter ingen bot byta namn på serverägaren eller någon med högre roll, så det här får misslyckas.
async function setNick(discordId: string, nick: string | null): Promise<boolean> {
  const r = await discord(`/guilds/${GUILD}/members/${discordId}`, { method: "PATCH", body: JSON.stringify({ nick }) });
  return r.ok;
}

async function verify(discordId: string, display: string, typed: string): Promise<string> {
  const name = typed.trim().replace(/\s+/g, " ");
  if (!NAME.test(name)) return "Det där ser inte ut som ett namn i spelet. Ett eller två ord, 2-12 bokstäver var.";

  const roster = await guildRoster();
  const hit = roster?.get(name.toLowerCase());
  if (roster && !hit) return `Vi hittar ingen ${name} i HEMMET. Kolla stavningen. Har du nyss fått din invite kan det dröja en stund innan du syns, så testa igen lite senare.`;

  const taken = `${name} är redan taget av någon annan här. Är det din karaktär? Säg till ledningen så reder vi ut det.`;
  const { data: holder, error: lookup } = await db.from("members").select("discord_id").ilike("character", name).maybeSingle();
  if (lookup) throw new Error(lookup.message);
  if (holder && holder.discord_id !== discordId) return taken;

  const character = hit?.name ?? name.toLowerCase().replace(/(^| )(.)/g, (_, gap, letter) => gap + letter.toUpperCase());
  const { error } = await db.from("members").upsert({
    discord_id: discordId, discord: display, character, in_guild: true,
    verify_pending_since: hit ? null : new Date().toISOString(),
    ...(hit?.cls ? { class: hit.cls } : {}),
  }, { onConflict: "discord_id" });
  if (error?.code === "23505") return taken;
  if (error) throw new Error(error.message);

  const role = await verifiedRole();
  const given = await discord(`/guilds/${GUILD}/members/${discordId}/roles/${role}`, { method: "PUT" });
  if (!given.ok) throw new Error(`Discord svarade ${given.status} på rollen`);

  const welcome = hit
    ? `Välkommen hem, ${character}! Vi hittade dig i guilden, så nu är du inne.`
    : `Välkommen hem, ${character}! Vi kommer inte åt guildlistan just nu, så vi släpper in dig och dubbelkollar senare.`;
  return await setNick(discordId, character) ? welcome : `${welcome} Ditt smeknamn rår vi inte på, så det får du byta själv.`;
}

// Går igenom de namn som godkändes utan kontroll. Går listan inte att läsa väntar allt till nästa körning.
async function recheck() {
  const { data, error } = await db.from("members").select("id, user_id, discord_id, character, verify_pending_since")
    .not("verify_pending_since", "is", null).limit(100);
  if (error) throw new Error(error.message);
  if (!data.length) return { checked: 0 };
  const roster = await guildRoster();
  if (!roster) return { checked: 0, unknown: true };

  const role = await verifiedRole();
  let confirmed = 0, removed = 0;
  for (const m of data) {
    const hit = roster.get(m.character.toLowerCase());
    if (hit) {
      const { error } = await db.from("members").update({ character: hit.name, verify_pending_since: null, ...(hit.cls ? { class: hit.cls } : {}) }).eq("id", m.id);
      if (error) throw new Error(error.message);
      await setNick(m.discord_id, hit.name);
      confirmed++;
    } else if (Date.now() - Date.parse(m.verify_pending_since) > GRACE_MS) {
      await discord(`/guilds/${GUILD}/members/${m.discord_id}/roles/${role}`, { method: "DELETE" });
      await setNick(m.discord_id, null);
      // utan konto på sidan ska raden inte hålla namnet åt någon annan
      const query = db.from("members");
      const { error } = m.user_id ? await query.update({ verify_pending_since: null }).eq("id", m.id) : await query.delete().eq("id", m.id);
      if (error) throw new Error(error.message);
      removed++;
    }
  }
  return { checked: data.length, confirmed, removed };
}

async function register() {
  const me = await discord("/oauth2/applications/@me");
  if (!me.ok) throw new Error(`Discord svarade ${me.status} på applikationen`);
  const { id } = await me.json();
  const r = await discord(`/applications/${id}/guilds/${GUILD}/commands`, {
    method: "PUT",
    body: JSON.stringify([{
      name: "verify",
      description: "Säg vem du är i spelet, så släpper vi in dig.",
      options: [{ type: 3, name: "namn", description: "Ditt namn i spelet", required: true, max_length: 25 }],
    }]),
  });
  if (!r.ok) throw new Error(`Discord svarade ${r.status} på kommandot`);
  return { registered: true };
}

// Svaret på ett uppskjutet kommando. Discord ger oss 3 sekunder, så det egentliga jobbet sker efter att vi har svarat.
async function answer(i: { application_id: string; token: string; member: { user: { id: string; username: string; global_name?: string } }; data: { options?: { name: string; value: string }[] } }) {
  const { id, username, global_name } = i.member.user;
  const typed = i.data.options?.find(o => o.name === "namn")?.value ?? "";
  const content = await verify(id, global_name ?? username, typed).catch(err => {
    console.error(err);
    return SORRY;
  });
  await fetch(`${DISCORD}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Bara POST", { status: 405 });
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
      const { action } = await req.json();
      return json(action === "register" ? await register() : await recheck());
    }
    const body = await req.text();
    if (!await signed(req, body)) return new Response("Fel signatur", { status: 401 });
    const i = JSON.parse(body);
    if (i.type === PING) return json({ type: PONG });
    if (i.type !== COMMAND || i.data?.name !== "verify" || i.guild_id !== GUILD || !i.member) {
      return json({ type: MESSAGE, data: { content: "Det här kommandot fungerar bara på HEMMET:s server.", flags: ONLY_YOU } });
    }
    EdgeRuntime.waitUntil(answer(i));
    return json({ type: DEFERRED, data: { flags: ONLY_YOU } });
  } catch (err) {
    console.error(err);
    return json({ error: "Det gick inte" }, 502);
  }
});
