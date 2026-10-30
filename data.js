/* Datalagret: allt som läser och skriver i Supabase. Tabeller och regler finns i supabase/migrations.
   Behörigheterna kontrolleras av databasen (RLS). perms.js avgör bara vilka knappar som visas.

   data/raids.json är inte guildens data utan spelets: raiderna och bossarna, från scripts/fetch_bosses.py. */
import { sb, configured } from "./supabase.js";

export { configured };

// Utan inloggning får man bara läsa de här kolumnerna (se migrationen), så de måste namnges.
const MEMBER_PUBLIC = "id, character, class, guild_roles, online";
const MEMBER_LOGGED_IN = `${MEMBER_PUBLIC}, discord, discord_id, last_seen`;
const GROUP_COLUMNS = ["name", "size", "raid_id", "ambition", "raid_days", "raid_start", "schedule_note", "blurb", "details",
  "signup", "recruit_roles", "recruit_note", "status", "links"];

let db = null;
let onError = console.error;
export const setErrorHandler = fn => { onError = fn; };   // fel som händer efter att sidan har gått vidare (tavlans autospar)

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const toTime = t => t ? t.slice(0, 5) : t;   // databasen svarar 19:30:00, sidan använder 19:30
const groupRow = g => ({ ...g, raid_start: toTime(g.raid_start) });
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

/* ---------- inloggning ---------- */
export const getSession = async () => ok(await sb.auth.getSession()).session;
export const currentMemberId = async () => ok(await sb.rpc("current_member"));
export const signIn = async () => ok(await sb.auth.signInWithOAuth({
  provider: "discord", options: { redirectTo: `${location.origin}${location.pathname}` },
}));
export const signOut = async () => { const { error } = await sb.auth.signOut(); if (error) throw new Error(error.message); };

// Ledningsrollerna läses från Discord av en edge function, aldrig av webbläsaren. Går det inte fortsätter sidan med de roller som finns.
export async function syncRoles() {
  const timeout = new Promise(resolve => setTimeout(resolve, 3000));
  try { await Promise.race([sb.functions.invoke("sync-discord-roles"), timeout]); }
  catch (err) { console.warn(err); }
}

/* ---------- läsa ---------- */
export async function loadData(session) {
  const [roles, functions, ambitions, members, groups, assignments, boards, templates, raids] = await Promise.all([
    sb.from("roles").select("*").order("level").then(ok),
    sb.from("functions").select("*").order("sort").then(ok),
    sb.from("ambitions").select("*").order("rank", { ascending: false }).then(ok),
    sb.from("members").select(session ? MEMBER_LOGGED_IN : MEMBER_PUBLIC).then(ok),
    sb.from("groups").select("*").then(ok),
    sb.from("assignments").select("*").then(ok),
    sb.from("assignment_boards").select("*").then(ok),
    sb.from("assignment_templates").select("*").order("created_at").then(ok),
    fetch("data/raids.json").then(r => {
      if (!r.ok) throw new Error(`data/raids.json: ${r.status}`);
      return r.json();
    }),
  ]);
  db = { roles, functions, ambitions, members, groups: groups.map(groupRow), assignments, boards, templates, raids };
  return db;
}

/* ---------- grupper ---------- */
const slugify = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupp";

export async function saveGroup(g) {
  const row = pick(g, GROUP_COLUMNS);
  let saved;
  if (!g.id) {
    let id = slugify(row.name), n = 2;
    while (db.groups.some(x => x.id === id)) id = `${slugify(row.name)}-${n++}`;
    saved = groupRow(ok(await sb.from("groups").insert({ ...row, id }).select().single()));
    db.groups.push(saved);
  } else {
    saved = groupRow(ok(await sb.from("groups").update(row).eq("id", g.id).select().single()));
    db.groups[db.groups.findIndex(x => x.id === g.id)] = saved;
  }
  return saved;
}

// bara skillnaden skrivs: bort först, eftersom en grupp bara får ha en Raid Master åt gången
export async function setSlot(groupId, slot, memberIds) {
  const now = db.assignments.filter(a => a.group_id === groupId && a.slot === slot).map(a => a.member_id);
  const wanted = [...new Set(memberIds)];
  const remove = now.filter(id => !wanted.includes(id));
  const add = wanted.filter(id => !now.includes(id));
  if (remove.length) ok(await sb.from("assignments").delete().match({ group_id: groupId, slot }).in("member_id", remove));
  if (add.length) ok(await sb.from("assignments").insert(add.map(member_id => ({ group_id: groupId, slot, member_id }))));
  db.assignments = db.assignments.filter(a => !(a.group_id === groupId && a.slot === slot))
    .concat(wanted.map(member_id => ({ group_id: groupId, slot, member_id })));
}

const setStatus = (id, status) => saveGroup({ ...db.groups.find(x => x.id === id), status });
export const removeGroup = id => setStatus(id, "archived");
export const restoreGroup = id => setStatus(id, "active");

export async function deleteGroup(id) {
  ok(await sb.from("groups").delete().eq("id", id));
  db.groups = db.groups.filter(g => g.id !== id);
  db.assignments = db.assignments.filter(a => a.group_id !== id);
  db.boards = db.boards.filter(b => b.group_id !== id);
}

/* ---------- assignments ----------
   Tavlan ändras direkt på sidan och sparas strax efter, så att snabba klick blir en skrivning.
   Hela tavlan skrivs varje gång: redigerar två personer samtidigt vinner den som sparar sist. */
const pending = new Map();

export function saveBoard(groupId, data) {
  const row = { group_id: groupId, data: structuredClone(data) };
  const i = db.boards.findIndex(b => b.group_id === groupId);
  if (i < 0) db.boards.push(row); else db.boards[i] = { ...db.boards[i], ...row };   // samma array: uppslagen i app.js ser ändringen direkt
  clearTimeout(pending.get(groupId));
  pending.set(groupId, setTimeout(async () => {
    pending.delete(groupId);
    try { ok(await sb.from("assignment_boards").upsert(row)); }
    catch (err) { onError(err); }
  }, 300));
  return row;
}

export async function saveTemplate(t) {
  const row = ok(await sb.from("assignment_templates").insert(pick(t, ["name", "description", "data"])).select().single());
  db.templates.push(row);
  return row;
}

export async function deleteTemplate(id) {
  ok(await sb.from("assignment_templates").delete().eq("id", id));
  const i = db.templates.findIndex(t => t.id === id);
  if (i >= 0) db.templates.splice(i, 1);
}

/* ---------- egen profil ----------
   Byter man namn uppdaterar databasen tavlorna (rename_on_boards), så de läses om här. */
export async function saveProfile(id, { character, cls }) {
  ok(await sb.from("members").update({ character, class: cls }).eq("id", id));
  const m = db.members.find(x => x.id === id);
  const renamed = m.character !== character;
  Object.assign(m, { character, class: cls });
  if (renamed) db.boards.splice(0, db.boards.length, ...ok(await sb.from("assignment_boards").select("*")));
  return m;
}
