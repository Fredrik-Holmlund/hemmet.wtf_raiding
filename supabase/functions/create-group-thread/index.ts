// Skapar gruppens tråd i rätt forum på Discord (10-man-raids, 20-man-raids, 40-man-raids) och sparar länken på gruppen.
//
// Körs av sidan när en grupp skapas, eller med knappen på gruppens sida. Bara ledningen och gruppens Raid Master får.
// Inlägget skrivs av sidan, men allt annat bestäms här: vem som får, vilket forum och trådens titel.
// Omnämnanden visas men pingar ingen, så ett inlägg kan aldrig nå @everyone.
//
// Hemligheter (Edge Functions → Secrets): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.
// Boten behöver View Channels, Send Messages och Embed Links i forumen. I ett forum är det Send Messages som ger rätt att skapa inlägg.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DISCORD = "https://discord.com/api/v10";
const FORUM_CHANNEL = 15;
const SIGNUP_TAGS: Record<string, string> = { open: "Öppet", ask: "Hör av dig", full: "Fullt Hus" };
const GUILD = Deno.env.get("DISCORD_GUILD_ID")!;
const BOT = { Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}`, "Content-Type": "application/json" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ error: "Inte inloggad" }, 401);

    const { group_id, content } = await req.json();
    if (typeof content !== "string" || !content.trim() || content.length > 2000) return json({ error: "Inlägget är för långt" }, 400);

    const { data: member } = await db.from("members").select("id, guild_roles").eq("user_id", user.id).maybeSingle();
    const { data: group } = await db.from("groups").select("id, name, size, ambition, signup, links").eq("id", group_id).maybeSingle();
    if (!member || !group) return json({ error: "Hittar inte gruppen" }, 404);

    const lead = member.guild_roles.some((r: string) => r === "guild_master" || r === "guild_leader");
    const { data: rm } = await db.from("assignments").select("member_id")
      .match({ group_id, slot: "raid_master", member_id: member.id }).maybeSingle();
    if (!lead && !rm) return json({ error: "Du får inte skapa tråden för den här gruppen" }, 403);
    if (group.links?.thread) return json({ error: "Gruppen har redan en tråd" }, 409);

    const channels = await fetch(`${DISCORD}/guilds/${GUILD}/channels`, { headers: BOT });
    if (!channels.ok) throw new Error(`Discord svarade ${channels.status} på kanalerna`);
    const forumName = `${group.size}-man-raids`;
    const forum = (await channels.json()).find((c: { type: number; name: string }) => c.type === FORUM_CHANNEL && c.name === forumName);
    if (!forum) return json({ error: `Hittar inte forumet ${forumName}` }, 404);

    const { data: level } = group.ambition
      ? await db.from("ambitions").select("name").eq("level", group.ambition).maybeSingle()
      : { data: null };
    const title = [group.name, `${group.size}-manna`, level?.name].filter(Boolean).join(" - ").slice(0, 100);

    // forumets taggar: nivån och signupläget, om de finns med samma namn på Discord
    const wanted = [level?.name, SIGNUP_TAGS[group.signup]].filter(Boolean).map(t => t.toLowerCase());
    const tags = (forum.available_tags ?? []).filter((t: { name: string }) => wanted.includes(t.name.toLowerCase())).map((t: { id: string }) => t.id);

    const created = await fetch(`${DISCORD}/channels/${forum.id}/threads`, {
      method: "POST",
      headers: BOT,
      body: JSON.stringify({ name: title, applied_tags: tags, message: { content, allowed_mentions: { parse: [] } } }),
    });
    if (!created.ok) {
      console.error("Discord:", created.status, await created.text());
      return json({ error: `Discord tog inte emot tråden (${created.status})` }, 502);
    }
    const thread = await created.json();
    const url = `https://discord.com/channels/${GUILD}/${thread.id}`;

    const { error } = await db.from("groups").update({ links: { ...group.links, thread: url } }).eq("id", group_id);
    if (error) throw new Error(error.message);
    return json({ url });
  } catch (err) {
    console.error(err);
    return json({ error: "Tråden kunde inte skapas" }, 502);
  }
});
