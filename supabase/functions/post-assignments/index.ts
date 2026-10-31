// Postar bilden av assignment-tavlan i gruppens tråd på Discord.
//
// Får göras av ledningen och av gruppens Raid Master, Raid Leader och de som har Roster & uttagning eller Assignments & taktik.
// Samma regel finns i perms.js (can.postAssignments), men det är den här som gäller.
// Bilden ritas på sidan och skickas hit. Bara PNG släpps igenom, och inlägget får ingen text.
//
// Hemligheter (Edge Functions → Secrets): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.
// Boten behöver View Channels, Send Messages in Threads och Attach Files i forumen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DISCORD = "https://discord.com/api/v10";
const GUILD = Deno.env.get("DISCORD_GUILD_ID")!;
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const MAX_BYTES = 8 * 1024 * 1024;
const POST_SLOTS = ["raid_master", "leadership", "roster", "assignments"];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
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

    const form = await req.formData();
    const groupId = String(form.get("group_id") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Bilden saknas" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "Bilden är för stor. Välj färre bossar." }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return json({ error: "Filen är ingen bild" }, 400);

    const { data: member } = await db.from("members").select("id, guild_roles").eq("user_id", user.id).maybeSingle();
    const { data: group } = await db.from("groups").select("id, links").eq("id", groupId).maybeSingle();
    if (!member || !group) return json({ error: "Hittar inte gruppen" }, 404);

    const lead = member.guild_roles.some((r: string) => r === "guild_master" || r === "guild_leader");
    const { data: slots } = await db.from("assignments").select("slot").eq("group_id", groupId).eq("member_id", member.id).in("slot", POST_SLOTS);
    if (!lead && !slots?.length) return json({ error: "Du får inte posta för den här gruppen" }, 403);

    const threadId = String(group.links?.thread ?? "").match(new RegExp(`/channels/${GUILD}/(\\d+)`))?.[1];
    if (!threadId) return json({ error: "Gruppen har ingen tråd på Discord" }, 400);

    const body = new FormData();
    body.append("payload_json", JSON.stringify({ allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: "assignments.png" }] }));
    body.append("files[0]", new Blob([bytes], { type: "image/png" }), "assignments.png");
    const posted = await fetch(`${DISCORD}/channels/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      body,
    });
    if (!posted.ok) {
      console.error("Discord:", posted.status, await posted.text());
      return json({ error: `Discord tog inte emot bilden (${posted.status})` }, 502);
    }
    const message = await posted.json();
    return json({ url: `https://discord.com/channels/${GUILD}/${threadId}/${message.id}` });
  } catch (err) {
    console.error(err);
    return json({ error: "Bilden kunde inte postas" }, 502);
  }
});
