import { icon } from "./icons.js";
import { configured, getSession, currentMemberId, syncRoles, syncThread, signIn, signOut, loadData, saveGroup, setSlot, removeGroup, restoreGroup, deleteGroup, saveProfile, setErrorHandler } from "./data.js";
import { can, isLeadership } from "./perms.js";
import { renderAssignments, drawBoard, bindAssignments } from "./assignments.js";
import { embers } from "./embers.js";

const CLASS_COLORS = {
  warrior: "#C69B6D", paladin: "#F48CBA", hunter: "#AAD372", rogue: "#FFF468", priest: "#FFFFFF",
  mage: "#3FC7EB", warlock: "#8788EE", druid: "#FF7C0A", shaman: "#0070DD",
};
// raden "Raid Master" i bemanningstabellen är ingen funktion men står först
const RM_SLOT = { id: "raid_master", name: "Raid Master", purpose: "Helhetsansvar för gruppen." };
const LINK_NAMES = { thread: "Gruppens tråd på Discord" };   // övriga länkar togs bort 2026-10-12

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paras = text => String(text).split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join("");
const NUM = n => `<span class="n">${n}</span>`;
const DAYS = [["mon", "mån"], ["tue", "tis"], ["wed", "ons"], ["thu", "tor"], ["fri", "fre"], ["sat", "lör"], ["sun", "sön"]];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// "Ons & sön · 19:30", "Mån, ons & fre · 20:00", eller fritexten om det inte finns dagar
function scheduleTime(g) {
  const days = DAYS.filter(([k]) => g.raid_days?.includes(k)).map(([, v]) => v);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} & ${days.at(-1)}` : days[0] ?? "";
  return [cap(list), g.raid_start].filter(Boolean).join(" · ");
}
function scheduleText(g) {
  const parts = scheduleTime(g), note = g.schedule_note;
  return [parts, parts && note ? `(${note})` : note].filter(Boolean).join(" ");
}
const RECRUIT_WORDS = 50;
const words = t => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;
// signups i tre lägen: Öppet (signa direkt), Hör av dig (prata med Raid Master först), Fullt hus (ingen plats just nu)
const SIGNUP = {
  open: { name: "Öppet", hint: "Signa upp direkt i gruppens tråd." },
  ask: { name: "Hör av dig", hint: "Prata med Raid Master innan du signar." },
  full: { name: "Fullt hus", hint: "Rostern är full just nu." },
};
const hasRoom = g => g.signup === "open" || g.signup === "ask";
/* tillbaka-knapp och brödsmulor: crumbs([["Raidgrupper", "#raidgrupper"], ["Spiselgänget", "#grupp/x"], ["Assignments"]])
   knappen går ett steg upp (näst sista delen), sista delen är där man står. Ingen pil (2026-10-17: pilarna kändes "AI") */
function crumbs(parts, up = parts.at(-2)) {
  return `<nav class="crumbs" aria-label="Du är här">
    <a class="btn btn--ghost btn--sm" href="${up[1]}">Tillbaka</a>
    <ol class="crumbs__trail">${parts.map(([label, href], i) => i === parts.length - 1
      ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${href}">${esc(label)}</a></li>`).join("")}</ol>
  </nav>`;
}

let D;   // { roles, functions, members, groups, assignments } + uppslag
let RAW;  // datalagrets tabeller; D byggs om från dem efter varje ändring
let me = null;   // inloggad medlem, hittas via Discord-inloggningen
let session = null;

function index(data) {
  const byId = arr => Object.fromEntries(arr.map(x => [x.id, x]));
  data.functions.sort((a, b) => a.sort - b.sort);
  // visas gör bara de som har fyllt i sin profil och är med på guildens Discord-server. Alla med ett Discord-konto kan logga in.
  return { ...data, members: data.members.filter(m => m.character && m.in_guild), role: byId(data.roles), fn: byId(data.functions), member: byId(data.members), group: byId(data.groups) };
}

function refresh() {
  D = index(RAW);
  if (me) me = D.member[me.id] ?? null;
  renderAccount(); renderHero(); renderOrg(); renderGroups(); renderRoles();
}

/* ---------- uppslag ---------- */
const holders = (groupId, slot) => D.assignments.filter(a => a.group_id === groupId && a.slot === slot).map(a => D.member[a.member_id]).filter(Boolean);
const raidMaster = g => holders(g.id, "raid_master")[0];
const raidLeader = g => holders(g.id, "leadership");
// alla raidgrupper har en Raid Master; de sex funktionerna (och Raid Leader) bemannas bara i 20- och 40-manna
const isOrganized = g => g.size >= 20;
const organized = () => D.groups.filter(g => g.status === "active" && isOrganized(g));
const activeGroups = () => D.groups.filter(g => g.status === "active");
const guildRole = id => D.members.filter(m => m.guild_roles.includes(id));
const delegatedCount = g => D.functions.filter(f => holders(g.id, f.id).some(m => m !== raidMaster(g))).length;

/* vem som har en roll just nu, med sammanhang (vilken grupp) */
function roleHolders(roleId) {
  if (roleId === "guild_master" || roleId === "guild_leader") return guildRole(roleId).map(m => ({ m }));
  const out = [];
  if (roleId === "raid_master") return activeGroups().map(g => ({ m: raidMaster(g), ctx: g })).filter(x => x.m);
  for (const g of organized()) {
    const rm = raidMaster(g);
    if (roleId === "raid_master" && rm) out.push({ m: rm, ctx: g });   // (10-manna läggs till nedan)
    if (roleId === "raid_leader") raidLeader(g).forEach(m => out.push({ m, ctx: g }));
    if (roleId === "raid_admin") {
      const admins = new Set();
      D.functions.filter(f => f.id !== "leadership").forEach(f => holders(g.id, f.id).forEach(m => m !== rm && admins.add(m)));
      admins.forEach(m => out.push({ m, ctx: g }));
    }
  }
  return out;
}

/* allt en person ansvarar för, grupperat per raidgrupp */
function dutiesOf(m) {
  const per = new Map();
  for (const a of D.assignments.filter(a => a.member_id === m.id)) {
    const g = D.group[a.group_id];
    if (!g) continue;
    const name = a.slot === "raid_master" ? "Raid Master" : a.slot === "contact" ? "Raid Master"
      : a.slot === "leadership" ? "Raid Leader" : D.fn[a.slot]?.name ?? a.slot;
    if (!per.has(g)) per.set(g, []);
    per.get(g).push(name);
  }
  return [...per];
}

/* ---------- byggstenar ---------- */
// namn i klassfärg, pricken grön när personen är online på Discord
// online kommer från Discords widget och är ungefärligt, så sidan säger aldrig "offline": pricken syns bara när någon är online
const status = m => m.online ? ", online på Discord" : "";
const who = m => m ? `<button class="who${m.online ? " is-online" : ""}" style="--c:${CLASS_COLORS[m.class] ?? "#fff"}" data-member="${m.id}"
  title="${esc(m.character)}${status(m)}" aria-label="${esc(m.character)}${status(m)}"><i class="who__dot" aria-hidden="true"></i>${esc(m.character)}</button>` : "";
const whos = ms => `<span class="whos">${ms.map(who).join("")}</span>`;
const selfChip = rm => rm ? `<button class="who who--self${rm.online ? " is-online" : ""}" style="--c:${CLASS_COLORS[rm.class] ?? "#fff"}" data-member="${rm.id}"
  title="Ingen utsedd: Raid Master har det själv"><i class="who__dot" aria-hidden="true"></i>${esc(rm.character)}<small>Raid Master själv</small></button>` : "";
const qm = roleId => `<span class="qm" role="button" tabindex="0" data-role="${roleId}" aria-label="Om rollen ${esc(D.role[roleId].name)}">?</span>`;

/* ---------- startsidan: hierarkin med titlar, nivåerna och de sex uppgifterna ---------- */
/* heron: tre siffror i stället för hemmet.wtf:s nedräkning, och rullbandet med veckans raids */
const DAY_NAMES = { mon: "Måndag", tue: "Tisdag", wed: "Onsdag", thu: "Torsdag", fri: "Fredag", sat: "Lördag", sun: "Söndag" };
// "i hemmet" = medlemmarna på Discord-servern, samma publika räknare som på hemmet.wtf. Går den inte att nå visas de inloggade medlemmarna.
const DISCORD_INVITE = "Gx5xQMurNy";
let discordMembers = null;
async function loadDiscordCount() {
  try {
    const r = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true`);
    discordMembers = (await r.json()).approximate_member_count ?? D.members.length;
  } catch {
    discordMembers = D.members.length;
  }
  renderHero();
}

function renderHero() {
  const groups = activeGroups();
  const open = groups.filter(hasRoom).length;
  const stat = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
  $("#heroStats").innerHTML = stat(groups.length, groups.length === 1 ? "raidgrupp" : "raidgrupper")
    + stat(open, open === 1 ? "öppen för signups" : "öppna för signups") + stat(discordMembers ?? "–", "i hemmet");
  const raids = day => groups.filter(g => g.raid_days?.includes(day)).length;
  const days = DAYS.map(([k]) => [k, raids(k)]).filter(([, n]) => n);
  const week = days.reduce((sum, [, n]) => sum + n, 0);
  const items = week
    ? [`<em>${week}</em> ${week === 1 ? "raid" : "raids"} i veckan`, ...days.map(([k, n]) => `${DAY_NAMES[k]}: <em>${n}</em> ${n === 1 ? "raid" : "raids"}`)]
    : ["Inga raids inlagda än", "Vi ses i raiden"];
  const row = items.map((x, i) => `<span class="${i ? "" : "mile"}">${x}</span>`).join('<span class="dot">◆</span>') + '<span class="dot">◆</span>';
  $("#ticker").innerHTML = row.repeat(8);   // två identiska halvor: remsan rullar ett halvt varv och börjar om
}

function renderOrg() {
  const n = activeGroups().length;
  // hierarkins rutor som Group Finder-paneler: rubriklist med titeln, beskrivningen under
  const node = (roleId, sub, extra = "") => `<button class="lfgnode ${extra}" data-role="${roleId}">
      <span class="lfgnode__head">${esc(D.role[roleId].name)}</span>
      <span class="lfgnode__body"><span>${sub}</span><span class="node__more">Läs mer</span></span></button>`;
  $("#org").innerHTML = `
    <div class="tier"><div class="lfgnode lfgnode--lead">
      <span class="lfgnode__head">Ledningen</span>
      <div class="lead-roles">
        <button class="lead-role" data-role="guild_master"><b>Guild Master</b><small>Vision och sista ordet</small></button>
        <button class="lead-role" data-role="guild_leader"><b>Guild Leaders</b><small>Strategi, kultur och samordning</small></button>
      </div>
    </div></div>
    <div class="stem"></div>
    <div class="tier">${node("raid_master", `En per raidgrupp${n ? ` · ${NUM(n)} just nu` : ""}`, "node--top")}</div>
    <div class="stem"></div>
    <div class="groups-row" style="--n:2">
      <div class="gcol">${node("raid_leader", "Leder raiden och har sista ordet i taktiken")}</div>
      <div class="gcol">${node("raid_admin", "Hjälper till med uppgifterna när Raid Master delegerar")}</div>
    </div>
`;
  // de sex uppgifterna som guildens stadgar på pergament (pergament = utmärkelser och guildens stadgar, se formspråket)
  $("#fnSteps").innerHTML = `
  <section class="charter charter--plain">
    <h3 class="charter__title">Raid Masterns stadgar</h3>
    <p class="charter__lead">Det här ska alltid bli gjort i varje raidgrupp.</p>
    <ol class="charter__list">${D.functions.map(f => `<li><button data-fn="${f.id}">
      <span class="charter__n">${["I", "II", "III", "IV", "V", "VI"][f.sort - 1] ?? f.sort}</span><b>${esc(f.short_name ?? f.name)}</b><span>${esc(f.summary ?? f.purpose)}</span></button></li>`).join("")}</ol>
    <p class="charter__foot">Raid Master kan delegera uppgifter till Raid Admins eller andra spelare, men behåller alltid helhetsansvaret.</p>
  </section>`;
  $("#levelCards").innerHTML = levelPanels();
}

// nivåerna som små Group Finder-paneler: rubriklist, beskrivning och gruppernas rader (startsidan och Roller & ansvar)
function levelPanels() {
  return D.ambitions.map(a => {
    const gs = D.groups.filter(g => g.status === "active" && ambLevel(g.ambition) === a.level)
      .sort((x, y) => y.size - x.size || (x.raid_id ?? "~").localeCompare(y.raid_id ?? "~", "sv", { numeric: true }));   // 40, 20, 10 och sedan koden
    return `<section class="lfgpanel levelpanel">
      <header class="lfgpanel__head"><button class="levelpanel__title" data-ambition="${a.level}">
        ${levelBadge(a, "qlvl--md")}<span class="levelpanel__name" style="color:${a.color}">${esc(a.name)}</span><span class="levelpanel__q" style="color:${a.color}">${esc(a.quality)}</span></button></header>
      <p class="levelpanel__tag">${esc(a.tagline)}</p>
      <ul class="levelpanel__groups">
        ${gs.length ? gs.map(g => `<li><a href="#grupp/${g.id}">${codeTag(g)}<span>${esc(g.name)}</span><small>${NUM(g.size)}-manna</small></a></li>`).join("")
          : `<li class="levelpanel__none">Inga grupper än</li>`}
      </ul>
    </section>`;
  }).join("");
}

/* ---------- vy B: raidgrupperna ---------- */
// filtren på Raidgrupper: storlek, dagar, starttid och signups (flera val = någon av dem)
const gfilter = { sizes: new Set(), days: new Set(), time: "", open: false, roles: new Set() };   // open: Öppet och Hör av dig räknas båda som öppna
const setInfo = (el, on) => { el.classList.toggle("is-open", on); el.querySelector("button").setAttribute("aria-expanded", on); };
let openDrop = null;   // vilken filtermeny som är öppen: listan ritas om vid varje val
const TIME_SLOTS = [["early", "Före 19:00"], ["mid", "19:00-20:59"], ["late", "21:00 och senare"]];
const timeSlot = t => { if (!t) return null; const m = +t.slice(0, 2) * 60 + +t.slice(3, 5); return m < 19 * 60 ? "early" : m < 21 * 60 ? "mid" : "late"; };
const filterActive = () => gfilter.sizes.size || gfilter.days.size || gfilter.time || gfilter.open || gfilter.roles.size;
const passes = g => (!gfilter.open || hasRoom(g))
  && (!gfilter.roles.size || hasRoom(g) && (g.recruit_roles ?? []).some(r => gfilter.roles.has(r)))   // söker tank/healer/DPS
  && (!gfilter.sizes.size || gfilter.sizes.has(g.size))
  && (!gfilter.days.size || (g.raid_days ?? []).some(d => gfilter.days.has(d)))
  && (!gfilter.time || timeSlot(g.raid_start) === gfilter.time);
// raidgrupperna under rubrikerna 40-, 20- och 10-manna
const SIZE_SECTIONS = [
  { size: 40, note: "" },
  { size: 20, note: "" },
  { size: 10, note: "" },
];

/* korten som spelets Group Finder: panelen med äventyrarna på klippan, mörk rubriklist, rader och spelets rollikoner */
const ROLE_NAMES = { tank: "Tank", healer: "Healer", dps: "DPS" };
const roleIcons = (roles = [], cls = "") => roles.filter(r => ROLE_NAMES[r])
  .map(r => `<i class="role role--${r} ${cls}" title="${ROLE_NAMES[r]}" aria-label="${ROLE_NAMES[r]}"></i>`).join("");
// signupläget, och (när det finns plats) vilka roller rostern behöver
const recruitRow = g => {
  const s = SIGNUP[g.signup] ?? SIGNUP.full;
  const roles = hasRoom(g) ? roleIcons(g.recruit_roles) : "";
  const need = hasRoom(g) && g.recruit_roles?.length ? ` Behöver ${g.recruit_roles.map(r => ROLE_NAMES[r]).join(", ")}.` : "";
  return `<span class="signup signup--${g.signup}" title="${esc(s.hint + need)}"><span>${s.name}</span>${roles}</span>`;
};

// en rad per grupp: tabellen ska gå att läsa uppifrån och ned, och full grupp tonas ned så att de öppna syns först
const infoIcon = (label, rows) => `<span class="ginfo" data-ginfo>
  <button type="button" aria-label="${esc(label)}" aria-expanded="false">${icon("info")}</button>
  <span class="ginfo__pop" role="tooltip">${rows.map(([title, text]) => `<b>${title}</b><span>${esc(text)}</span>`).join("")}</span>
</span>`;

function groupListRow(g) {
  const a = amb(g.ambition), rm = raidMaster(g);
  const about = [["Om gruppen", g.blurb], ["Rostern", g.recruit_note]].filter(([, text]) => text);
  const time = scheduleTime(g);   // tillägget till tiden står bakom ikonen, så att kolumnen håller sig till en rad
  return `<article class="grow${hasRoom(g) ? "" : " grow--full"}" data-group="${g.id}" tabindex="0" role="link" aria-label="Öppna ${esc(g.name)}"${a ? ` style="--q:${a.color}"` : ""}>
    <span class="grow__code">${codeTag(g)}</span>
    <div class="grow__main">
      <div class="grow__name"><b>${esc(g.name)}</b>${about.length ? infoIcon(`Om ${g.name}`, about) : ""}</div>
      <small>${a ? `<span class="grow__amb">${esc(a.name)}</span>` : ""}${a && g.recruit_note ? " · " : ""}${esc(g.recruit_note ?? "")}</small></div>
    <div class="grow__rm">${rm ? who(rm) : "-"}</div>
    <div class="grow__time">${esc(time || g.schedule_note || "-")}${time && g.schedule_note ? infoIcon("Om tiden", [["Om tiden", g.schedule_note]]) : ""}</div>
    <div class="grow__signup">${recruitRow(g)}</div>
  </article>`;
}

function renderGroups() {
  const all = activeGroups();
  const active = all.filter(passes);
  const size = [...gfilter.sizes][0];
  const tab = (value, label, count) => `<button class="gtab" data-fsize="${value}" aria-pressed="${value === "all" ? !size : size === value}">${label}<small>${NUM(count)}</small></button>`;
  const option = (attr, value, label, on) => `<button class="fchip" ${attr}="${value}" aria-pressed="${on}">${label}${on ? icon("check") : ""}</button>`;
  const drop = (key, label, picked, options) => `<details class="fdrop${picked ? " is-set" : ""}" ${openDrop === key ? "open" : ""}>
    <summary data-fdrop="${key}">${label}${picked ? `<b>${esc(picked)}</b>` : ""}${icon("chevron-down")}</summary>
    <div class="fdrop__menu">${options}</div>
  </details>`;
  const shortDay = k => cap(DAYS.find(([d]) => d === k)[1]);
  $("#groupFilter").innerHTML = `<div class="gbar">
    <div class="gtabs" role="group" aria-label="Storlek">${tab("all", "Alla", all.length)}${[40, 20, 10].map(n => tab(n, NUM(n), all.filter(g => g.size === n).length)).join("")}</div>
    ${drop("days", "Dagar", DAYS.filter(([k]) => gfilter.days.has(k)).map(([k]) => shortDay(k)).join(", "),
      DAYS.map(([k, v]) => option("data-fday", k, cap(v), gfilter.days.has(k))).join(""))}
    ${drop("roles", "Söker", Object.entries(ROLE_NAMES).filter(([k]) => gfilter.roles.has(k)).map(([, v]) => v).join(", "),
      Object.entries(ROLE_NAMES).map(([k, v]) => option("data-frole", k, `${roleIcons([k], "fchip__role")}${v}`, gfilter.roles.has(k))).join(""))}
    ${drop("time", "Start", TIME_SLOTS.find(([k]) => k === gfilter.time)?.[1] ?? "",
      TIME_SLOTS.map(([k, v]) => option("data-ftime", k, v, gfilter.time === k)).join(""))}
    <label class="gswitch"><input type="checkbox" data-only-open ${gfilter.open ? "checked" : ""}><span>Bara öppna</span></label>
    ${filterActive() ? `<button class="linkish" data-filter-reset>Rensa</button>` : ""}
    ${can.createGroup(me) ? `<a class="btn btn--primary btn--sm gbar__new" href="#ny-grupp/${size ?? 40}">${icon("plus")}Ny grupp</a>` : ""}
  </div>`;
  const sections = SIZE_SECTIONS.map(({ size: n }) => {
    // efter kod (A1, A2, B1 …), grupper utan kod sist i bokstavsordning
    const gs = active.filter(g => g.size === n).sort((a, b) =>
      (a.raid_id ?? "~").localeCompare(b.raid_id ?? "~", "sv", { numeric: true }) || a.name.localeCompare(b.name, "sv"));
    if (!gs.length) return "";
    return `<section class="gsec" aria-label="${n}-manna">
      <div class="gsec__h"><h2>${NUM(n)}<small>man</small></h2><span>Raid Master</span><span>Tid</span><span>Signups</span></div>
      ${gs.map(groupListRow).join("")}
    </section>`;
  }).join("");
  $("#groups").innerHTML = sections || `<p class="note">${filterActive() ? "Ingen grupp matchar filtren. Prova att rensa något, eller fråga i Discord: det brukar finnas plats." : "Inga raidgrupper än."}</p>`;

  // borttagna grupper syns bara för ledningen, som kan ångra eller radera för gott
  const removed = can.removeGroup(me) ? D.groups.filter(g => g.status === "archived") : [];
  $("#removed").innerHTML = removed.length ? `<p class="label">Borttagna grupper</p>
    ${removed.map(g => `<div class="removed__row">
      <a href="#grupp/${g.id}">${esc(g.name)}</a>
      <span class="removed__meta">${NUM(g.size)}-manna${changedBy(g) ? ` · borttagen ${changedBy(g)}` : ""}</span>
      <span class="removed__btns">${removeButtons(g)}</span>
    </div>`).join("")}` : "";
}

const changedBy = g => {
  const who = g.updated_by && D.member[g.updated_by];
  const when = g.updated_at ? new Date(g.updated_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : "";
  return who ? `${esc(when)} av ${esc(who.character)}` : "";
};
const removeButtons = g => `<button class="btn btn--ghost btn--sm" data-restore="${g.id}">Återställ</button>
  <button class="btn btn--ghost btn--sm btn--danger" data-delete="${g.id}">Radera för gott</button>`;

/* ---------- vy C: roller och funktioner ---------- */
function roleBody(r) {
  const h = roleHolders(r.id);
  return `<div class="prose">${paras(r.description)}</div>
    <p class="label">Ansvarsområden</p><ul class="list">${r.responsibilities.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="label">Mandat</p><p style="margin:0">${esc(r.mandate)}</p>
    <p class="label">Har rollen nu</p>
    ${h.length ? `<div class="holders">${h.map(({ m, ctx }) => `<div class="holders__row">${who(m)}${ctx ? `<a class="holders__ctx" href="#grupp/${ctx.id}">${esc(ctx.name)}</a>` : ""}</div>`).join("")}</div>`
      : `<p class="note" style="margin:0">Ingen just nu.</p>`}`;
}

function fnBody(f) {
  return `<div class="prose">${paras(f.description)}</div>
    <p class="label">När</p><p style="margin:0">${esc(f.deadline)}</p>
    ${f.tools.length ? `<p class="label">Verktyg</p><div class="facts">${f.tools.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <p class="label">${esc(f.holder_title ?? "Ansvarig")} per grupp</p>
    <div class="holders">${organized().map(g => {
      const h = holders(g.id, f.id);
      return `<div class="holders__row"><a class="holders__ctx" href="#grupp/${g.id}">${esc(g.name)}</a>${h.length ? h.map(who).join("") : selfChip(raidMaster(g))}</div>`;
    }).join("")}</div>`;
}

function renderRoles() {
  $("#ambList").innerHTML = levelPanels();
  // rollerna och funktionerna som paneler med utfällbara listrader
  $("#roleList").innerHTML = panel("Rollerna", D.roles.map(r => `<details class="acc">
    <summary><span class="acc__name">${esc(r.name)}</span><span class="acc__short">${esc(r.short)}</span></summary>
    <div class="acc__body">${roleBody(r)}</div></details>`).join(""), "lfgpanel--acc");
  $("#fnList").innerHTML = panel("Det som alltid ska bli gjort",
    `<p class="lfgpanel__intro">Sex funktioner i varje ${NUM(20)}- och ${NUM(40)}-mannagrupp. Raid Master kan göra dem själv eller lämna över dem.</p>`
    + D.functions.map(f => `<details class="acc">
    <summary><span class="acc__num acc__num--roman">${ROMAN[f.sort - 1] ?? f.sort}</span><span class="acc__name">${esc(f.name)}</span><span class="acc__short">${esc(f.purpose)}</span></summary>
    <div class="acc__body">${fnBody(f)}</div></details>`).join(""), "lfgpanel--acc");
}

/* ---------- gruppens info som text till Discord-tråden ----------
   Discords egen markdown: # rubrik, **fet**, > citat, -# liten text. Nivån som färgad cirkel i kvalitetsfärgen.
   Personer blir riktiga omnämnanden (<@id>) när discord_id finns (Supabase), annars @namn som går att justera i rutan. */
const QUALITY_DOT = { A: "🟠", B: "🟣", C: "🔵" };
const SITE_URL = "https://raiding.hemmet.wtf", DISCORD_LIMIT = 2000;
const mention = m => m.discord_id ? `<@${m.discord_id}>` : `@${m.character}`;
function discordPost(g) {
  const a = amb(g.ambition), rm = raidMaster(g);
  const who = list => list.length ? list.map(mention).join(", ") : rm ? `${mention(rm)} *(Raid Master själv)*` : "-";
  const staff = [["Raid Master", rm ? [rm] : []]];
  if (isOrganized(g)) {
    staff.push(["Raid Leader", holders(g.id, "leadership")]);
    D.functions.filter(f => f.id !== "leadership").forEach(f => staff.push([f.name, holders(g.id, f.id)]));
  }
  const build = details => [
    `# ${g.name}${g.raid_id ? `  \`${g.raid_id}\`` : ""}`,
    [`**${g.size}-manna**`, a && `${QUALITY_DOT[a.level] ?? ""} **${a.name}**`, scheduleText(g)].filter(Boolean).join("  ·  "),
    "",
    "## Vem ansvarar för vad",
    ...staff.map(([name, list]) => `> **${name}** - ${who(list)}`),
    ...(details ? ["", "## Detaljer", details] : []),
    "",
    `-# Allt om gruppen: <${SITE_URL}/#grupp/${g.id}>`,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
  // ett Discord-inlägg får vara högst 2000 tecken: Detaljer får ge sig, det fulla står på sidan
  const details = (g.details || g.blurb || "").trim(), text = build(details);
  return text.length <= DISCORD_LIMIT ? text : build(`${details.slice(0, details.length - (text.length - DISCORD_LIMIT) - 2).trimEnd()} …`);
}
function discordPostDrawer(g) {
  const text = discordPost(g);
  openDrawer(`<p class="eyebrow">${esc(g.name)}</p><h2>Text till Discord</h2>
    <p class="lead">Klistra in i gruppens tråd. Texten är formaterad för Discord: rubriker, fet stil och nivån som färgad cirkel. Du kan ändra i rutan innan du kopierar.</p>
    <textarea class="dpost" id="discordText" rows="22" spellcheck="false">${esc(text)}</textarea>
    <div class="dpost__bar">
      <button class="btn btn--primary" data-discord-copy>Kopiera</button>
      <span class="dpost__status" id="discordStatus" role="status"></span>
    </div>`);
}

/* ---------- raidgruppens egen sida ---------- */
function renderGroupPage(g) {
  const rm = raidMaster(g);
  // Raid Master och Raid Leader först, sedan övriga funktioner i ordning
  const slots = [RM_SLOT, D.fn.leadership, ...D.functions.filter(f => f.id !== "leadership")].filter(Boolean);
  const rows = !isOrganized(g)
    ? `<tr class="key"><th scope="row"><button class="fnbtn" data-role="raid_master">Raid Master<small>${esc(RM_SLOT.purpose)}</small></button></th><td>${rm ? whos([rm]) : "-"}</td></tr>`
    : slots.map(f => {
    const h = holders(g.id, f.id);
    const label = f.id === "leadership" ? "Raid Leader" : f.name;
    const key = f.id === "raid_master" || f.id === "leadership";
    const btn = f.id === "raid_master" ? `<button class="fnbtn" data-role="raid_master">${label}<small>${esc(f.purpose)}</small></button>`
      : `<button class="fnbtn" data-fn="${f.id}">${esc(label)}<small>${esc(f.purpose)}</small></button>`;
    return `<tr class="${key ? "key" : ""}"><th scope="row">${btn}</th><td>${h.length ? whos(h) : selfChip(rm)}</td></tr>`;
  }).join("");
  const contact = (isOrganized(g) ? holders(g.id, "feedback")[0] : null) ?? rm;
  const fact = (k, v) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : "";
  const links = Object.entries(g.links ?? {}).filter(([k, url]) => url && LINK_NAMES[k]);

  const removed = g.status === "archived";

  $("#groupPage").innerHTML = `<div class="wrap gp">
    <div class="gp__bar">
      ${crumbs([["Raidgrupper", "#raidgrupper"], [g.name]])}
      ${removed ? `<span class="facts">${removeButtons(g)}</span>`
        : can.editGroup(me, g, D.assignments) ? `<span class="gp__actions">${g.links?.thread ? "" : `<button class="btn btn--ghost" data-discord-thread="${g.id}">Skapa tråd på Discord</button>`}<button class="btn btn--ghost" data-discord-post="${g.id}">Text till Discord</button>
          <a class="btn btn--primary" href="#grupp/${g.id}/redigera">Redigera gruppen</a></span>` : ""}
    </div>
    <p class="eyebrow">${removed ? "Borttagen raidgrupp" : "Raidgrupp"}</p>
    ${groupHead(g)}
    ${changedBy(g) ? `<p class="note">${removed ? "Borttagen" : "Senast ändrad"} ${changedBy(g)}</p>` : ""}
    ${removed ? "" : groupTabs(g, "overview")}
    ${g.blurb ? `<p class="gp__blurb">${esc(g.blurb)}</p>` : ""}
    <dl class="lfgpanel gp__facts">
      ${fact("Storlek", `${NUM(g.size)} man`)}${fact("Nivå", amb(g.ambition) ? ambitionBtn(g.ambition) : "")}${fact("Tid", esc(scheduleText(g)))}${fact("Signups", recruitRow(g))}
    </dl>
    <div class="gp__grid">
      <div>
        ${panel("Vem ansvarar för vad", `<table class="staff"><thead><tr><th>Roll eller funktion</th><th>Ansvarig</th></tr></thead><tbody>${rows}</tbody></table>`, "lfgpanel--staff")}
        ${isOrganized(g) ? `<p class="note" style="margin-top:12px">Står det <i>Raid Master själv</i> finns ingen utsedd, och då har Raid Master uppgiften själv.</p>` : ""}
      </div>
      <div class="gp__side">
        ${panel(`Signups: ${SIGNUP[g.signup]?.name ?? ""} ${hasRoom(g) ? roleIcons(g.recruit_roles) : ""}`,
          `<div class="lfgpanel__body details__text">${g.recruit_note ? paras(g.recruit_note) : `<p>${{
            open: "Signa upp via RaidHelper i gruppens tråd.",
            ask: "Hör av dig till Raid Master innan du signar, i gruppens tråd eller direkt.",
            full: "Rostern är full just nu. Hör gärna av dig ändå, det kan bli plats.",
          }[g.signup] ?? ""}</p>`}</div>`, `lfgpanel--recruit lfgpanel--signup-${g.signup}`)}
        ${g.details ? panel("Detaljer", `<div class="lfgpanel__body details__text">${paras(g.details)}</div>`)
          : !removed && can.editGroup(me, g, D.assignments) ? panel("Detaljer", `<div class="lfgpanel__body">
            <p class="lfgpanel__muted">Här kan ni skriva vad ni raidar just nu och vad ni förväntar er av de som följer med.</p>
            <a class="btn btn--ghost btn--sm" href="#grupp/${g.id}/redigera">Skriv något</a></div>`) : ""}
        ${panel("Frågor om gruppen?", `<div class="lfgpanel__body">
          <p>Uttagning, loot eller hur en raid gick: börja här. Går det inte att lösa i gruppen tar Guild Leaders vid.</p>
          ${contact ? whos([contact]) : ""}
          ${links.length ? `<p class="label">Länkar</p><div class="facts">${links.map(([k, url]) => `<a class="btn btn--primary btn--sm" href="${esc(url)}" target="_blank" rel="noopener">${LINK_NAMES[k] ?? esc(k)}</a>`).join("")}</div>` : ""}
        </div>`)}
      </div>
    </div>
  </div>`;
}

// rubriken på gruppens sidor (översikt och assignments)
const groupHead = (g, h = "h1") => `<div class="gp__head"><${h} class="d2">${esc(g.name)}</${h}>${codeTag(g)}<span class="gp__size">${NUM(g.size)}-manna</span></div>`;
// en panel i spelets Group Finder-stil med rubriklist
const panel = (title, body, cls = "") => `<section class="lfgpanel ${cls}"><header class="lfgpanel__head"><h3>${title}</h3></header>${body}</section>`;

/* ---------- ambitionsnivå: A Min-Max, B Focused, C Chill ---------- */
const ambLevel = v => v || null;
const amb = v => D.ambitions.find(a => a.level === ambLevel(v));
// nivåerna i spelets kvalitetsfärger: A Legendary (orange), B Epic (lila), C Rare (blå)
const levelBadge = (a, cls = "") => `<span class="qlvl ${cls}" style="--q:${a.color}" title="${esc(a.quality)}">${a.level}</span>`;
const levelText = v => { const a = amb(v); return a ? `${levelBadge(a)} <span style="color:${a.color}">${esc(a.name)}</span>` : ""; };
const ambitionBtn = v => {
  const a = amb(v);
  return a ? `<button class="amb" data-ambition="${a.level}" title="${esc(a.tagline)}">${levelBadge(a)}<span style="color:${a.color}">${esc(a.name)}</span></button>` : "-";
};
// gruppens kod: bokstaven är nivån, siffran nästa lediga i samma nivå och storlek (A1, B2 …)
function nextCode(level, size, exceptId) {
  const used = D.groups.filter(x => x.status === "active" && x.id !== exceptId && x.size === size && x.raid_id?.startsWith(level))
    .map(x => parseInt(x.raid_id.slice(1), 10) || 0);
  return `${level}${Math.max(0, ...used) + 1}`;
}
const codeTag = g => { const a = amb(g.ambition); return g.raid_id ? `<span class="gcode"${a ? ` style="--q:${a.color}"` : ""} title="${esc(a ? `${a.name} (${a.quality})` : "")}">${esc(g.raid_id)}</span>` : ""; };

function ambitionDrawer(level) {
  openDrawer(`<p class="eyebrow">Ambitionsnivåer</p><h2>Ett hem, många sätt att raida</h2>
    <p class="lead">Varje grupp har en nivå, så vet du vad du anmäler dig till. Bokstaven står först i gruppens kod, till exempel B2.</p>
    ${D.ambitions.map(a => {
      const gs = D.groups.filter(g => g.status === "active" && ambLevel(g.ambition) === a.level);
      return `<div class="ambx${a.level === ambLevel(level) ? " is-current" : ""}">
        <div class="ambx__head">${levelBadge(a, "qlvl--md")}<b style="color:${a.color}">${esc(a.name)}</b><small class="ambx__q">${esc(a.quality)}</small></div>
        <p class="ambx__tag">${esc(a.tagline)}</p>
        ${gs.length ? `<p class="ambx__groups">${gs.map(g => `<a href="#grupp/${g.id}">${g.raid_id ? `${esc(g.raid_id)} · ` : ""}${esc(g.name)}</a>`).join(" · ")}</p>` : ""}
      </div>`;
    }).join("")}
    <p class="note" style="margin-top:16px">Gränserna mellan nivåerna är inte huggna i sten. Exakt vad de innebär utvecklar vi tillsammans efter hand. Varje Raid Master beskriver gruppens egen ambition.</p>`);
}

/* ---------- gruppens flikar: översikt och assignments ---------- */
const groupTabs = (g, active) => `<nav class="gp__tabs" aria-label="${esc(g.name)}">
  <a href="#grupp/${g.id}" ${active === "overview" ? 'aria-current="page"' : ""}>Översikt</a>
  <a href="#grupp/${g.id}/assignments" ${active === "assignments" ? 'aria-current="page"' : ""}>Assignments</a></nav>`;

// Översikt och Assignments är flikar på samma sida: tillbaka-knappen går till listan, inte till översikten
function renderAssignmentsPage(g) {
  $("#groupPage").innerHTML = `<div class="wrap wrap--wide gp">
    <div class="gp__bar">${crumbs([["Raidgrupper", "#raidgrupper"], [g.name, `#grupp/${g.id}`], ["Assignments"]], ["Raidgrupper", "#raidgrupper"])}</div>
    <p class="eyebrow">Raidgrupp</p>
    ${groupHead(g)}
    ${groupTabs(g, "assignments")}
    ${renderAssignments({ D, me, g, esc, CLASS_COLORS, openDrawer, closeDrawer, refresh, showError })}
  </div>`;
  drawBoard();
}

/* ---------- sidopanelen ---------- */
let lastFocus = null;
// databasens fel översatta till något man kan göra något åt
const saveError = err => /row-level security|permission denied|0 rows|multiple \(or no\) rows/i.test(err.message) ? "Du har inte behörighet att ändra det här."
  : /members_character/.test(err.message) ? "Det namnet finns redan i guilden."
  : /Failed to fetch|NetworkError/i.test(err.message) ? "Vi kommer inte åt databasen just nu. Försök igen."
  : `Det gick inte att spara: ${err.message}`;
let toastTimer = null;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
}
function showError(err) {
  console.error(err);
  toast(saveError(err));
}

function openDrawer(html) {
  lastFocus = document.activeElement;
  $("#drawerBody").innerHTML = html;
  $("#scrim").hidden = false;
  const d = $("#drawer");
  d.classList.add("is-open"); d.setAttribute("aria-hidden", "false"); d.scrollTop = 0; d.focus();
}
function closeDrawer() {
  const d = $("#drawer");
  if (!d.classList.contains("is-open")) return;
  d.classList.remove("is-open"); d.setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
  lastFocus?.focus?.();
}

const roleDrawer = r => openDrawer(`<p class="eyebrow">Roll</p><h2>${esc(r.name)}</h2><p class="lead">${esc(r.short)}</p>${roleBody(r)}`);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const fnDrawer = f => openDrawer(`<p class="eyebrow">Funktion ${ROMAN[f.sort - 1] ?? f.sort} av ${ROMAN[D.functions.length - 1] ?? D.functions.length}</p><h2>${esc(f.name)}</h2><p class="lead">${esc(f.purpose)}</p>${fnBody(f)}`);
function memberDrawer(m) {
  const titles = m.guild_roles.map(id => D.role[id]?.name).filter(Boolean);
  const duties = dutiesOf(m);
  openDrawer(`<p class="eyebrow">${titles.length ? esc(titles.join(" · ")) : "Medlem"}</p>
    <h2 class="person-name" style="--c:${CLASS_COLORS[m.class] ?? "#fff"}">${esc(m.character)}</h2>
    <p class="lead presence${m.online ? " is-online" : ""}"><i class="who__dot" aria-hidden="true"></i>${m.online ? "Online på Discord" : ""}${m.discord ? `${m.online ? " · " : ""}@${esc(m.discord)}` : ""}</p>
    ${me && me.id === m.id ? `<button class="btn btn--ghost btn--sm" data-profile style="margin-top:14px">Redigera min profil</button>` : ""}
    <p class="label">Ansvarar för</p>
    ${duties.length ? duties.map(([g, names]) => `<div class="duty"><a href="#grupp/${g.id}">${esc(g.name)}</a><p>${names.map(esc).join(" · ")}</p></div>`).join("")
      : `<p class="note" style="margin:0">${titles.length ? "Inget i någon enskild raidgrupp." : "Inget särskilt just nu. Vill du hjälpa till? Prata med en Raid Master."}</p>`}`);
}

/* ---------- min profil: namn i spelet och klass ----------
   Med Supabase hittas man via Discord-inloggningen och får bara ändra sin egen rad (RLS). */
const CLASS_NAMES = { warrior: "Warrior", paladin: "Paladin", hunter: "Hunter", rogue: "Rogue", priest: "Priest",
  shaman: "Shaman", mage: "Mage", warlock: "Warlock", druid: "Druid" };

function profileDrawer() {
  if (!me) return accountDrawer();
  openDrawer(`<p class="eyebrow">Min profil</p><h2 class="person-name" style="--c:${CLASS_COLORS[me.class] ?? "#fff"}">${esc(me.character ?? me.discord ?? "Välkommen hem")}</h2>
    <p class="lead">${me.character ? "Så här syns du för guilden: på raidgrupperna, i organisationen och på assignment-tavlorna." : "Fyll i vad du heter i spelet och vilken klass du spelar, så syns du för guilden."}</p>
    <label class="field" style="margin-top:20px"><span>Namn i spelet</span>
      <input id="profName" value="${esc(me.character ?? "")}" maxlength="25" placeholder="Förnamn Efternamn" autocomplete="off" spellcheck="false"></label>
    <div class="field"><span>Klass</span>
      <div class="classpick">${Object.entries(CLASS_NAMES).map(([k, n]) => `<label style="--c:${CLASS_COLORS[k]}">
        <input type="radio" name="profClass" value="${k}" ${me.class === k ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
    </div>
    <div class="ed__error" id="profError" role="alert" hidden></div>
    <div class="facts"><button class="btn btn--primary" data-profile-save>Spara</button>${me.character ? `<button class="btn btn--ghost" data-account>Avbryt</button>` : ""}</div>
    <p class="note" style="margin-top:14px">Byter du namn följer det med överallt, även på assignment-tavlorna.${me.discord ? ` Discord-kontot (@${esc(me.discord)}) ändras i Discord.` : ""}</p>`);
}

async function saveProfileForm() {
  const name = $("#profName").value.trim().replace(/\s+/g, " ").replace(/(^| )\p{L}/gu, c => c.toUpperCase());
  const cls = document.querySelector('[name="profClass"]:checked')?.value;
  const box = $("#profError");
  const err = !/^\p{L}{2,12}( \p{L}{2,12})?$/u.test(name) ? "Skriv namnet som i spelet: förnamn och efternamn, 2-12 bokstäver var."
    : D.members.find(m => m.id !== me.id && m.character.toLowerCase() === name.toLowerCase()) ? `${D.members.find(m => m.id !== me.id && m.character.toLowerCase() === name.toLowerCase()).character} finns redan i guilden.`
    : !CLASS_NAMES[cls] ? "Välj en klass." : null;
  if (err) { box.textContent = err; box.hidden = false; return; }
  try { await saveProfile(me.id, { character: name, cls }); }
  catch (err) { box.textContent = saveError(err); box.hidden = false; return; }
  refresh(); route();
  accountDrawer();
}

/* ---------- inloggning: Discord via Supabase. Medlemmen skapas av databasen vid första inloggningen. ---------- */
function titleOf(m) {
  const t = m.guild_roles.map(id => D.role[id]?.name).filter(Boolean);
  if (t.length) return t.join(" · ");
  const active = D.groups.filter(g => g.status === "active");
  if (active.some(g => raidMaster(g) === m)) return "Raid Master";
  // har en funktion i någon grupp (utan att vara dess Raid Master): Raid Admin enligt briefen
  return D.assignments.some(a => a.member_id === m.id && D.fn[a.slot] && a.slot !== "leadership" && active.some(g => g.id === a.group_id))
    ? "Raid Admin" : "Medlem";
}

function renderAccount() {
  const avatar = session?.user?.user_metadata?.avatar_url;   // profilbilden från Discord, sparad vid inloggningen
  const name = me?.character ?? "Min profil";
  $("#account").innerHTML = me
    ? `<button class="acct" data-account style="--c:${CLASS_COLORS[me.class] ?? "#fff"}">${avatar
        ? `<img class="acct__img" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="acct__img" aria-hidden="true">${esc(name[0])}</span>`}
        <span class="acct__text"><b>${esc(name)}</b><small>${esc(titleOf(me))}</small></span></button>`
    : `<span class="account__out"><button class="btn btn--ghost btn--sm" data-account>Logga in</button><a class="btn btn--primary btn--sm" href="https://hemmet.wtf/#join">Flytta in</a></span>`;
  fitHero();
}

// heron ska börja exakt under menyn, som är olika hög utloggad och inloggad
const fitHero = () => document.documentElement.style.setProperty("--tb", `${$(".topbar").offsetHeight}px`);

function accountDrawer() {
  if (!me) {
    return openDrawer(`<p class="eyebrow">Logga in</p><h2>Nycklarna finns på Discord</h2>
      <p class="lead">Du loggar in med ditt Discord-konto. Allt går att läsa utan att logga in. Inloggningen behövs för att fylla i din profil och för att sköta en raidgrupp.</p>
      ${session ? `<p class="note">Du är inloggad, men vi hittar inte din medlemsrad. Prata med ledningen.</p>` : ""}
      <button class="btn btn--primary" data-signin style="margin-top:20px">Logga in med Discord</button>`);
  }
  const lead = isLeadership(me);
  const own = D.groups.filter(g => g.status === "active" && can.editGroup(me, g, D.assignments));
  openDrawer(`<p class="eyebrow">Inloggad</p><h2 class="person-name" style="--c:${CLASS_COLORS[me.class] ?? "#fff"}">${esc(me.character)}</h2>
    <p class="lead">${esc(titleOf(me))} · ${esc(CLASS_NAMES[me.class] ?? me.class)}</p>
    <button class="btn btn--primary btn--sm" data-profile style="margin-top:14px">Min profil</button>
    <p class="label">Det här kan du ändra</p>
    <ul class="list">
      ${lead ? "<li>Skapa och ta bort raidgrupper</li><li>Utse och byta Raid Master</li>" : ""}
      ${own.length ? `<li>${lead ? "Alla raidgrupper" : `Din grupp: ${own.map(g => `<a href="#grupp/${g.id}/redigera">${esc(g.name)}</a>`).join(", ")}`}: uppgifter, Raid Leader och funktionerna</li>` : "<li>Inget just nu. Raid Master eller ledningen fixar bemanningen.</li>"}
    </ul>
    <div class="facts" style="margin-top:24px">
      <button class="btn btn--ghost" data-logout>Logga ut</button>
    </div>`);
}

/* ---------- redigera eller skapa raidgrupp ---------- */
let draft = null;   // { g, slots: { slot: [member_id] }, isNew }
const SIZES = [10, 20, 40];

function startEdit(g, size = 40) {
  const base = g ?? { id: null, name: "", size, raid_id: "", ambition: "", raid_days: [], raid_start: "", schedule_note: "", blurb: "", details: "", signup: "open", recruit_roles: [], recruit_note: "", status: "active", links: {} };
  const slots = {};
  for (const s of ["raid_master", ...D.functions.map(f => f.id)]) slots[s] = base.id ? holders(base.id, s).map(m => m.id) : [];
  draft = { g: structuredClone(base), slots, isNew: !g };
  renderEditor();
}

function slotRow(slot, label, hint, { single = false, locked = false } = {}) {
  const ids = draft.slots[slot];
  const chips = ids.map(id => D.member[id]).filter(Boolean).map(m => `<span class="who" style="--c:${CLASS_COLORS[m.class] ?? "#fff"}">${esc(m.character)}${locked ? ""
    : `<button type="button" class="who__x" data-unassign="${slot}" data-id="${m.id}" aria-label="Ta bort ${esc(m.character)} från ${esc(label)}">✕</button>`}</span>`).join("");
  const options = D.members.filter(m => !ids.includes(m.id)).sort((a, b) => a.character.localeCompare(b.character, "sv"))
    .map(m => `<option value="${m.id}">${esc(m.character)}</option>`).join("");
  const picker = locked || (single && ids.length) ? "" : `<select class="pickadd" data-assign="${slot}" aria-label="Lägg till: ${esc(label)}"><option value="">+ Lägg till</option>${options}</select>`;
  return `<div class="ed__slot"><div class="ed__slotname">${esc(label)}${hint ? `<small>${hint}</small>` : ""}</div><div class="whos">${chips}${picker}</div></div>`;
}

function staffEditor() {
  const locked = !can.editStructure(me);
  if (draft.g.size < 20) return slotRow("raid_master", "Raid Master", locked ? "Utses och byts av Guild Leaders" : "Krävs för alla raidgrupper", { single: true, locked });
  const empty = "Tom = Raid Master gör det själv";
  return slotRow("raid_master", "Raid Master", locked ? "Utses och byts av Guild Leaders" : "Krävs för alla raidgrupper", { single: true, locked })
    + slotRow("leadership", "Raid Leader", "Tom = Raid Master leder själv")
    + D.functions.filter(f => f.id !== "leadership").map(f => slotRow(f.id, f.name, empty)).join("");
}

function renderEditor() {
  const { g, isNew } = draft;
  const structure = can.editStructure(me);
  const back = isNew ? "#raidgrupper" : `#grupp/${g.id}`;
  const field = (name, label, value, attrs = "") => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value ?? "")}" ${attrs}></label>`;
  $("#groupPage").innerHTML = `<form class="wrap gp" id="editor" novalidate>
    <div class="gp__bar">${crumbs(isNew ? [["Raidgrupper", "#raidgrupper"], ["Ny raidgrupp"]]
      : [["Raidgrupper", "#raidgrupper"], [g.name, back], ["Redigera"]])}</div>
    <p class="eyebrow">${isNew ? "Ny raidgrupp" : "Redigera raidgrupp"}</p>
    <h1 class="d2">${isNew ? "Ett nytt <span>rum</span>" : esc(g.name)}</h1>
    <div class="ed__grid">
      <fieldset class="ed__box"><legend>Om gruppen</legend>
        ${field("name", "Namn", g.name, 'required maxlength="40" autocomplete="off"')}
        <div class="field"><span>Storlek</span>
          <div class="seg">${SIZES.map(s => `<label><input type="radio" name="size" value="${s}" ${g.size === s ? "checked" : ""} ${structure ? "" : "disabled"}><span class="n">${s}</span></label>`).join("")}</div>
          ${structure ? "" : `<small>Storleken ändras av Guild Leaders.</small>`}
        </div>
        <label class="field"><span>Ambitionsnivå</span><select name="ambition"><option value="">Inte satt</option>${D.ambitions.map(a => `<option value="${a.level}" ${ambLevel(g.ambition) === a.level ? "selected" : ""}>${a.level} · ${esc(a.name)} (${esc(a.quality)})</option>`).join("")}</select>
          <small>Gruppen får en kod efter nivån, t.ex. A1 eller B2.${g.raid_id ? ` Nu: ${esc(g.raid_id)}.` : ""}</small>
          <small><button type="button" class="linkish" data-ambition="${g.ambition ?? "A"}">Vad betyder nivåerna?</button></small></label>
        <div class="field"><span>Raiddagar</span>
          <div class="seg seg--multi">${DAYS.map(([k, v]) => `<label><input type="checkbox" name="raid_days" value="${k}" ${g.raid_days?.includes(k) ? "checked" : ""}><span>${cap(v)}</span></label>`).join("")}</div>
        </div>
        <div class="field-row">
          ${field("raid_start", "Starttid", g.raid_start, 'type="time" step="900"')}
          ${field("schedule_note", "Tillägg (valfritt)", g.schedule_note ?? g.schedule, 'maxlength="40" placeholder="t.ex. När det passar"')}
        </div>
        <label class="field"><span>Om gruppen</span><textarea name="blurb" rows="2" maxlength="300" placeholder="En mening eller två om vilka ni är.">${esc(g.blurb ?? "")}</textarea></label>
        <label class="field"><span>Detaljer</span><textarea name="details" rows="7" maxlength="2000" placeholder="Vad ni raidar just nu, krav och förväntningar, consumables …">${esc(g.details ?? "")}</textarea>
          <small>Visas i rutan Detaljer på gruppens sida. Tom rad = nytt stycke.</small></label>
        <div class="field"><span>Signups</span>
          <div class="seg">${Object.entries(SIGNUP).map(([k, v]) => `<label title="${esc(v.hint)}"><input type="radio" name="signup" value="${k}" ${(g.signup ?? "open") === k ? "checked" : ""}><span>${v.name}</span></label>`).join("")}</div>
          <small id="signupHint">${esc(SIGNUP[g.signup ?? "open"]?.hint ?? "")}</small>
        </div>
        <div class="field" id="recruitRoles" ${g.signup === "full" ? "hidden" : ""}><span>Vilka roller behöver rostern?</span>
          <div class="rolepick">${Object.entries(ROLE_NAMES).map(([k, n]) => `<label><input type="checkbox" name="recruit_roles" value="${k}" ${g.recruit_roles?.includes(k) ? "checked" : ""}>
            <span>${roleIcons([k])}${n}</span></label>`).join("")}</div>
        </div>
        <label class="field" id="recruitNote"><span>Mer om rostern <small id="recruitCount">${words(g.recruit_note)} / ${RECRUIT_WORDS} ord</small></span>
          <textarea name="recruit_note" rows="3" maxlength="400" placeholder="t.ex. Vi behöver en healer, gärna präst eller druid. Eller: reserver är alltid välkomna.">${esc(g.recruit_note ?? "")}</textarea></label>
      </fieldset>
      <div class="ed__col">
        <fieldset class="ed__box"><legend>Vem ansvarar för vad</legend><div id="staffBox">${staffEditor()}</div></fieldset>
        <fieldset class="ed__box"><legend>Discord</legend>
          <div class="field"><span>Gruppens tråd på Discord</span>
            ${g.links?.thread ? `<a class="btn btn--ghost btn--sm ed__thread" href="${esc(g.links.thread)}" target="_blank" rel="noopener">Öppna tråden</a>` : ""}
            <small>${g.links?.thread ? "Boten uppdaterar tråden när gruppen sparas." : isNew ? "Boten skapar tråden när gruppen skapas." : "Gruppen har ingen tråd än. Skapa den från gruppens sida."}</small>
          </div>
        </fieldset>
      </div>
    </div>
    <div class="ed__error" id="edError" role="alert" hidden></div>
    <div class="ed__actions">
      <button class="btn btn--primary" type="submit">${isNew ? "Skapa gruppen" : "Spara"}</button>
      <a class="btn btn--ghost" href="${back}">Avbryt</a>
      ${!isNew && can.removeGroup(me) ? `<button class="btn btn--ghost btn--danger" type="button" data-remove="${g.id}">Ta bort gruppen</button>` : ""}
    </div>
  </form>`;
}

let saving = false;
async function saveDraft(form) {
  if (saving) return;
  const fd = new FormData(form);
  const val = k => String(fd.get(k) ?? "").trim();
  const { g, isNew } = draft;
  const allowed = isNew ? can.createGroup(me) : can.editGroup(me, D.group[g.id] ?? g, D.assignments);
  const name = val("name"), size = g.size, errors = [];
  if (!allowed) errors.push("Du har inte behörighet att ändra den här gruppen.");
  if (!name) errors.push("Gruppen behöver ett namn.");
  if (D.groups.some(x => x.id !== g.id && x.status === "active" && x.name.toLowerCase() === name.toLowerCase())) errors.push("Det finns redan en grupp som heter så.");
  if (!draft.slots.raid_master.length) errors.push("Gruppen behöver en Raid Master.");
  if (words(val("recruit_note")) > RECRUIT_WORDS) errors.push(`Texten om rostern får vara högst ${RECRUIT_WORDS} ord (nu ${words(val("recruit_note"))}).`);
  if (val("raid_start") && !/^([01]\d|2[0-3]):[0-5]\d$/.test(val("raid_start"))) errors.push("Starttiden ska skrivas som TT:MM, t.ex. 19:30.");
  if (errors.length) {
    const box = $("#edError");
    box.innerHTML = errors.map(e => `<p>${esc(e)}</p>`).join("");
    box.hidden = false;
    box.scrollIntoView({ block: "center" });
    return;
  }
  saving = true;
  try {
    const saved = await saveGroup({ ...g, name, size, ambition: val("ambition") || null,
      // koden: behåll den om nivå och storlek är oförändrade, annars nästa lediga
      raid_id: !val("ambition") ? null
        : g.raid_id && ambLevel(g.ambition) === val("ambition") && g.size === size && g.raid_id.startsWith(val("ambition")) ? g.raid_id
        : nextCode(val("ambition"), size, g.id), raid_days: fd.getAll("raid_days"), raid_start: val("raid_start") || null, schedule_note: val("schedule_note") || null,
      blurb: val("blurb") || null, details: val("details") || null,
      signup: val("signup") || "open", recruit_note: val("recruit_note") || null,
      recruit_roles: val("signup") !== "full" ? fd.getAll("recruit_roles") : [] });
    if (can.editStructure(me)) await setSlot(saved.id, "raid_master", draft.slots.raid_master);
    // funktionerna bemannas bara i 20- och 40-manna; blir gruppen 10-manna töms de (storleken ändras bara av ledningen)
    for (const f of D.functions) await setSlot(saved.id, f.id, size >= 20 ? draft.slots[f.id] : []);
    draft = null;
    refresh();
    // ny grupp: boten skapar tråden. Finns en tråd följer inlägget, titeln och taggarna med.
    if (isNew || saved.links?.thread) {
      try { await syncThread(saved.id, discordPost(D.group[saved.id])); refresh(); }
      catch (err) { console.error(err); toast(`Gruppen är sparad, men Discord kunde inte uppdateras: ${err.message}`); }
    }
    location.hash = `grupp/${saved.id}`;
  } catch (err) {
    console.error(err);
    const box = $("#edError");
    box.textContent = saveError(err);
    box.hidden = false;
    box.scrollIntoView({ block: "center" });
  } finally {
    saving = false;
  }
}

/* ---------- navigering ----------
   #grupp/<id>  gruppens sida · #grupp/<id>/redigera  redigera · #ny-grupp  skapa · allt annat huvudsidan */
// sidorna: start (infon), raidgrupper, roller. Gruppens egna sidor visas i #groupPage, under Raidgrupper i menyn.
const PAGES = { "": "start", "#": "start", "#start": "start", "#organisation": "start", "#raidgrupper": "raidgrupper", "#raidgrupper/soker": "raidgrupper", "#roller": "roller" };
const PAGE_TITLES = { start: "Raiding", raidgrupper: "Raidgrupper", roller: "Roller & ansvar" };

function showMain(page, title) {
  document.body.classList.toggle("has-hero", page !== null);   // gruppens egna sidor har ingen bild
  document.querySelectorAll("main.page").forEach(el => { el.hidden = el.dataset.page !== page; });
  $("#groupPage").hidden = page !== null;
  const active = page ?? "raidgrupper";
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.dataset.nav === active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.title = `${title} · HEMMET`;
  moveNavBar?.();
  window.scrollTo(0, 0);
}
const showPage = title => showMain(null, title);

function denied() {
  $("#groupPage").innerHTML = `<div class="wrap gp"><div class="gp__bar">${crumbs([["Raidgrupper", "#raidgrupper"], ["Låst"]])}</div>
    <p class="eyebrow">Låst dörr</p><h1 class="d2">Här behövs <span>nycklar</span></h1>
    <p class="lede">Det här kan bara ledningen eller gruppens Raid Master ändra.</p>
    ${me ? "" : `<p style="margin-top:28px"><button class="btn btn--primary" data-account>Logga in</button></p>`}</div>`;
  return "Låst";
}

function route() {
  closeDrawer();
  const h = decodeURIComponent(location.hash);
  // borttagna grupper finns bara för ledningen
  const visible = id => { const g = D.group[id]; return g && (g.status !== "archived" || can.removeGroup(me)) ? g : null; };
  let m, g;
  if ((m = h.match(/^#ny-grupp(?:\/(10|20|40))?$/))) {
    return showPage(can.createGroup(me) ? (startEdit(null, Number(m[1]) || 40), "Ny raidgrupp") : denied());
  }
  if ((m = h.match(/^#grupp\/([^/]+)\/redigera$/)) && (g = visible(m[1]))) {
    if (g.status === "archived") { location.replace(`#grupp/${g.id}`); return; }   // återställ först, sen redigera
    return showPage(can.editGroup(me, g, D.assignments) ? (startEdit(g), `Redigera ${g.name}`) : denied());
  }
  if ((m = h.match(/^#grupp\/([^/]+)\/assignments$/)) && (g = visible(m[1])) && g.status !== "archived") {
    renderAssignmentsPage(g);
    return showPage(`Assignments · ${g.name}`);
  }
  if ((m = h.match(/^#grupp\/([^/]+)$/)) && (g = visible(m[1]))) {
    renderGroupPage(g);
    return showPage(g.name);
  }
  draft = null;
  const page = PAGES[h] ?? "start";
  if (h === "#raidgrupper/soker" || h === "#raidgrupper") {   // /soker: öppna för signups (Öppet och Hör av dig)
    gfilter.open = h === "#raidgrupper/soker";
    renderGroups();
  }
  if (!(h in PAGES)) history.replaceState(null, "", "#start");   // okänd adress: till start
  showMain(page, PAGE_TITLES[page]);
}

function bindFilters() {
  document.addEventListener("click", e => {
    const summary = e.target.closest("[data-fdrop]");
    if (summary) { e.preventDefault(); openDrop = openDrop === summary.dataset.fdrop ? null : summary.dataset.fdrop; return renderGroups(); }
    const t = e.target.closest("[data-fsize],[data-fday],[data-ftime],[data-frole],[data-filter-reset]");
    if (!t) {
      if (openDrop && !e.target.closest(".fdrop")) { openDrop = null; renderGroups(); }
      return;
    }
    const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); };
    if (t.dataset.fsize) { gfilter.sizes.clear(); if (t.dataset.fsize !== "all") gfilter.sizes.add(+t.dataset.fsize); }
    if (t.dataset.fday) toggle(gfilter.days, t.dataset.fday);
    if (t.dataset.frole) toggle(gfilter.roles, t.dataset.frole);
    if (t.dataset.ftime) gfilter.time = gfilter.time === t.dataset.ftime ? "" : t.dataset.ftime;
    if (t.hasAttribute("data-filter-reset")) { gfilter.sizes.clear(); gfilter.days.clear(); gfilter.time = ""; gfilter.open = false; gfilter.roles.clear(); }
    renderGroups();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && openDrop) { openDrop = null; renderGroups(); } });
}

function bind() {
  bindFilters();
  document.addEventListener("click", async e => {
    const thread = e.target.closest("[data-discord-thread]");
    if (thread) {
      thread.disabled = true;
      try { await syncThread(thread.dataset.discordThread, discordPost(D.group[thread.dataset.discordThread])); refresh(); route(); }
      catch (err) { thread.disabled = false; console.error(err); toast(`Tråden kunde inte skapas: ${err.message}`); }
      return;
    }
    const open = e.target.closest("[data-discord-post]");
    if (open) return discordPostDrawer(D.groups.find(g => g.id === open.dataset.discordPost));
    if (!e.target.closest("[data-discord-copy]")) return;
    const box = $("#discordText"), status = $("#discordStatus");
    try { await navigator.clipboard.writeText(box.value); status.textContent = "Kopierat. Klistra in i tråden med Ctrl+V."; }
    catch { box.select(); status.textContent = "Kunde inte kopiera automatiskt. Texten är markerad, tryck Ctrl+C."; }
  });
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-profile],[data-profile-save],[data-signin],[data-logout],[data-account],[data-unassign],[data-remove],[data-restore],[data-delete],[data-ambition]");
    if (a) {
      if (a.hasAttribute("data-profile")) profileDrawer();
      else if (a.hasAttribute("data-profile-save")) saveProfileForm();
      else if (a.hasAttribute("data-signin")) signIn().catch(showError);
      else if (a.hasAttribute("data-logout")) signOut().then(() => location.reload(), showError);
      else if (a.hasAttribute("data-account")) accountDrawer();
      else if (a.dataset.ambition) ambitionDrawer(a.dataset.ambition);
      else if (a.dataset.unassign) {
        const s = draft.slots[a.dataset.unassign];
        s.splice(s.indexOf(a.dataset.id), 1);
        $("#staffBox").innerHTML = staffEditor();
      }
      // ta bort = går att ångra, radera = för gott. Bara ledningen, och databasen kontrollerar igen.
      else if (can.removeGroup(me) && (a.dataset.remove || a.dataset.restore || a.dataset.delete)) {
        const g = D.group[a.dataset.remove || a.dataset.restore || a.dataset.delete];
        if (!g) return;
        (async () => {
          if (a.dataset.remove && confirm(`Ta bort ${g.name}? Gruppen försvinner från sidan, men ledningen kan återställa den.`)) {
            await removeGroup(g.id); draft = null; refresh(); location.hash = "raidgrupper";
          }
          if (a.dataset.restore) { await restoreGroup(g.id); refresh(); route(); }
          if (a.dataset.delete && confirm(`Radera ${g.name} för gott? Gruppen och all bemanning försvinner och går inte att få tillbaka.`)) {
            await deleteGroup(g.id); refresh();
            if (location.hash === `#grupp/${g.id}`) location.hash = "raidgrupper"; else route();
          }
        })().catch(showError);
      }
      return;
    }
    if (e.target.closest("#editor")) return;   // i formuläret öppnar namnen ingen panel
    // infoikonen på gruppens rad: öppnas vid hovring, och med klick på en skärm utan mus. Raden ska inte öppnas.
    const info = e.target.closest("[data-ginfo]");
    document.querySelectorAll("[data-ginfo].is-open").forEach(el => { if (el !== info) setInfo(el, false); });
    if (info) return setInfo(info, !info.classList.contains("is-open"));
    const t = e.target.closest("[data-member],[data-role],[data-fn],[data-group]");
    if (!t) return;
    if (t.dataset.member) memberDrawer(D.member[t.dataset.member]);
    else if (t.dataset.role) roleDrawer(D.role[t.dataset.role]);
    else if (t.dataset.fn) fnDrawer(D.fn[t.dataset.fn]);
    else if (t.dataset.group) location.hash = `grupp/${t.dataset.group}`;
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches("[data-assign]") && t.value) {
      const slot = t.dataset.assign;
      draft.slots[slot].push(t.value);
      $("#staffBox").innerHTML = staffEditor();
      document.querySelector(`[data-assign="${slot}"]`)?.focus();
    }
    if (t.matches('#editor input[name="size"]')) { draft.g.size = +t.value; $("#staffBox").innerHTML = staffEditor(); }
    if (t.matches("[data-only-open]")) { gfilter.open = t.checked; renderGroups(); }
    if (t.matches('#editor input[name="signup"]')) { $("#recruitRoles").hidden = t.value === "full"; $("#signupHint").textContent = SIGNUP[t.value].hint; }
  });
  document.addEventListener("input", e => {
    if (!e.target.matches('#editor [name="recruit_note"]')) return;
    const n = words(e.target.value), c = $("#recruitCount");
    c.textContent = `${n} / ${RECRUIT_WORDS} ord`;
    c.classList.toggle("is-over", n > RECRUIT_WORDS);
  });
  document.addEventListener("submit", e => { if (e.target.id === "editor") { e.preventDefault(); saveDraft(e.target); } });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeDrawer();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".qm,[data-group][tabindex]")) { e.preventDefault(); e.target.click(); }
  });
  bindAssignments();
  $("#scrim").addEventListener("click", closeDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  // länkar inne i panelen (t.ex. till en grupp) stänger den via route()
  window.addEventListener("hashchange", route);

}

/* Guldlinjen under menyn (samma kod i leveling-sidans och intranätets app.js): en linje som åker till det man hovrar,
   tillbaka till den valda sidan, och vid sidbyte från förra sidans val till det nya (läget sparas i sessionStorage).
   Returnerar en funktion att anropa när den valda sidan byts utan sidladdning. */
function slideBar(nav) {
  const bar = document.createElement("span");
  bar.className = "site-nav__bar"; nav.append(bar);
  const current = () => nav.querySelector("a[aria-current]");
  const jump = (fn) => { bar.style.transition = "none"; fn(); void bar.offsetWidth; bar.style.transition = ""; };
  const place = (a) => {
    if (!a) { bar.style.opacity = "0"; return; }
    bar.style.width = a.offsetWidth + "px"; bar.style.transform = `translateX(${a.offsetLeft}px)`;
    bar.style.opacity = a.hasAttribute("aria-current") ? "1" : ".5";
  };
  let from = null;
  try { from = JSON.parse(sessionStorage.getItem("hemmet-navbar") ?? "null"); sessionStorage.removeItem("hemmet-navbar"); } catch { /* utan lagring: ingen åkning vid sidbyte */ }
  if (from && current()) {
    jump(() => { bar.style.width = from.w + "px"; bar.style.transform = `translateX(${from.x}px)`; bar.style.opacity = "1"; });
    requestAnimationFrame(() => requestAnimationFrame(() => place(current())));
  } else jump(() => place(current()));
  nav.addEventListener("mouseover", (e) => { const a = e.target.closest("a"); if (a && nav.contains(a)) place(a); });
  nav.addEventListener("mouseleave", () => place(current()));
  const again = () => jump(() => place(current()));
  addEventListener("resize", again); document.fonts?.ready.then(again);
  addEventListener("pagehide", () => {
    const a = current();
    if (a) try { sessionStorage.setItem("hemmet-navbar", JSON.stringify({ x: a.offsetLeft, w: a.offsetWidth })); } catch { /* ingen lagring */ }
  });
  return () => place(current());
}

let moveNavBar = null;
function initHeader() {
  // rätt menyval från början, så att linjen inte åker dit när sidan laddas
  const h = location.hash;
  const page = h.startsWith("#roller") ? "roller" : /^#(raidgrupper|grupp|ny-grupp)/.test(h) ? "raidgrupper" : "start";
  document.querySelector(`[data-nav="${page}"]`).setAttribute("aria-current", "page");
  moveNavBar = slideBar($("#siteNav"));
  const bar = $(".topbar"), menuBtn = $(".topbar__menu");
  menuBtn.addEventListener("click", () => menuBtn.setAttribute("aria-expanded", String(bar.classList.toggle("is-open"))));
  bar.addEventListener("click", e => { if (e.target.closest(".site-nav a")) { bar.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); } });
  // genomskinlig över heron, som på hemmet.wtf
  const heroes = new Map();
  const seen = new IntersectionObserver(entries => {
    entries.forEach(e => heroes.set(e.target, e.isIntersecting));
    bar.classList.toggle("at-top", [...heroes.values()].some(Boolean));
  }, { threshold: .15 });
  document.querySelectorAll(".hero, .subhero").forEach(el => seen.observe(el));
  embers($("#embers"));
  addEventListener("resize", fitHero);
}

// sidan kan inte visa något utan databasen: heron står kvar med en förklaring
function showDown(text) {
  document.body.classList.add("has-hero");
  document.querySelectorAll('main.page[data-page="start"] > section:not(.hero), .ticker, #siteNav, .topbar__menu, .hero .btn-row').forEach(el => el.remove());
  $("#hero").insertAdjacentHTML("beforeend", `<p class="hero__status" role="status">${esc(text)}</p>`);
}

async function start() {
  initHeader();
  if (!configured) return showDown("Sidan är inte kopplad till databasen än.");
  setErrorHandler(showError);
  session = await getSession();
  if (session) await syncRoles();
  RAW = await loadData(session);
  D = index(RAW);
  if (session) me = D.member[await currentMemberId()] ?? null;
  refresh(); bind(); route();
  loadDiscordCount();
  if (me && !me.character) profileDrawer();   // första inloggningen
  if (me && !me.in_guild) toast("Du är inte med på guildens Discord-server än. Gå med, så syns du här.");
}

start().catch(err => {
  console.error(err);
  showDown("Vi kommer inte åt databasen just nu. Försök igen om en stund.");
});
