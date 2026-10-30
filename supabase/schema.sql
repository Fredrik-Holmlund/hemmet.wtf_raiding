-- HEMMET ledningssidan: Supabase-schema (UTKAST, inte kört mot en riktig databas än)
-- Samma tabeller som data/*.json och samma regler som perms.js. Reglerna sitter här (RLS),
-- så det hjälper inte att fuska i webbläsaren.
--
-- Inloggning: Supabase Auth med Discord som provider. En medlem kopplas till sitt konto via discord_id.
-- guild_roles (guild_master / guild_leader) sätts av en Discord-synk (bot eller edge function med
-- service role) utifrån rollerna i Discord. Ingen på sidan kan ge sig själv ledningsroller.

-- ---------- tabeller ----------
create table roles (
  id text primary key,
  level int not null,
  name text not null,
  short text,
  description text,
  responsibilities text[] not null default '{}',
  mandate text
);

create table functions (
  id text primary key,
  sort int not null,
  name text not null,
  purpose text,
  description text,
  deadline text,
  tools text[] not null default '{}',
  holder_title text
);

create table members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,   -- fylls i första gången personen loggar in
  discord_id text unique,
  discord text,              -- visningsnamn
  character text not null,
  class text,
  guild_roles text[] not null default '{}',
  online boolean not null default false,   -- skrivs av Discord-boten (presence)
  last_seen timestamptz
);

create table ambitions (
  level text primary key check (level in ('A', 'B', 'C')),   -- A Min-Max, B Focused, C Chill
  rank int not null,                                           -- 3, 2, 1 (sortering)
  color text,                                                  -- spelets kvalitetsfärg: Legendary #ff8000, Epic #a335ee, Rare #0070dd
  quality text,                                                -- "Legendary", "Epic", "Rare"
  name text not null,
  tagline text
);

create table groups (
  id text primary key,       -- slug, t.ex. "spiselganget"
  name text not null,
  size int not null check (size in (10, 20, 40)),
  raid_id text,
  ambition text references ambitions (level),   -- A/B/C
  raid_days text[] not null default '{}' check (raid_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  raid_start time,           -- starttid, svensk tid
  schedule_note text,        -- fritt tillägg, t.ex. "När det passar"
  blurb text,
  details text,
  signup text not null default 'open' check (signup in ('open', 'ask', 'full')),   -- Öppet, Hör av dig, Fullt hus
  recruit_roles text[] not null default '{}' check (recruit_roles <@ array['tank','healer','dps']),
  recruit_note text check (char_length(recruit_note) <= 400),   -- högst 50 ord, kontrolleras på sidan              -- fri text som Raid Master skriver: vad de raidar, krav, kanal …
  status text not null default 'active' check (status in ('active', 'archived')),
  links jsonb not null default '{}',
  updated_by uuid references members,
  updated_at timestamptz not null default now()
);

-- en rad per person och ansvar: slot = 'raid_master' (alla grupper) eller ett functions.id (bara 20- och 40-manna)
create table assignments (
  group_id text not null references groups on delete cascade,
  slot text not null,
  member_id uuid not null references members on delete cascade,
  primary key (group_id, slot, member_id)
);
-- assignment-tavlan: ett JSON-dokument per grupp (roster, sektioner med rader, flikar med kolumner och celler)
create table assignment_boards (
  group_id text primary key references groups on delete cascade,
  data jsonb not null,
  updated_by uuid references members,
  updated_at timestamptz not null default now()
);

-- mallar för tavlan, gemensamma för hela guilden (utan spelarnamn)
create table assignment_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  data jsonb not null,
  created_by uuid references members,   -- default sätts längre ner, när current_member() finns
  created_at timestamptz not null default now()
);

-- högst en Raid Master per grupp
create unique index one_raid_master on assignments (group_id) where slot = 'raid_master';

-- ---------- hjälpfunktioner ----------
create function current_member() returns uuid
  language sql stable security definer set search_path = public
  as $$ select id from members where user_id = auth.uid() $$;

-- ledningen = Guild Master och Guild Leaders, samma behörighet (perms.js: isLeadership)
create function is_guild_lead() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from members where user_id = auth.uid() and guild_roles && array['guild_master', 'guild_leader']) $$;

create function is_raid_master(gid text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from assignments where group_id = gid and slot = 'raid_master' and member_id = current_member()) $$;

-- ---------- regler ----------
alter table roles enable row level security;
alter table functions enable row level security;
alter table members enable row level security;
alter table groups enable row level security;
alter table assignments enable row level security;
alter table ambitions enable row level security;
alter table assignment_boards enable row level security;
alter table assignment_templates enable row level security;

-- alla får läsa (sidan är öppen för medlemmarna). Byt "anon, authenticated" mot "authenticated" för att kräva inloggning.
create policy "läsa" on roles for select to anon, authenticated using (true);
create policy "läsa" on functions for select to anon, authenticated using (true);
create policy "läsa" on members for select to anon, authenticated using (true);
create policy "läsa" on groups for select to anon, authenticated using (true);
create policy "läsa" on assignments for select to anon, authenticated using (true);
create policy "läsa" on ambitions for select to anon, authenticated using (true);
create policy "läsa" on assignment_boards for select to anon, authenticated using (true);
create policy "läsa" on assignment_templates for select to anon, authenticated using (true);
create policy "ledningen ändrar" on ambitions for all to authenticated using (is_guild_lead()) with check (is_guild_lead());

-- texterna för roller och funktioner: ledningen
create policy "ledningen ändrar" on roles for all to authenticated using (is_guild_lead()) with check (is_guild_lead());
create policy "ledningen ändrar" on functions for all to authenticated using (is_guild_lead()) with check (is_guild_lead());

-- grupper: ledningen skapar, ledningen och gruppens Raid Master ändrar
create policy "ledningen skapar" on groups for insert to authenticated with check (is_guild_lead());
create policy "ledningen eller raid master ändrar" on groups for update to authenticated
  using (is_guild_lead() or is_raid_master(id)) with check (is_guild_lead() or is_raid_master(id));

-- radera för gott: bara ledningen (bemanningen följer med via on delete cascade)
create policy "ledningen raderar" on groups for delete to authenticated using (is_guild_lead());

-- storlek och status (ta bort / återställa) bara för ledningen, och vem som ändrade sätts av databasen
create function guard_group_update() returns trigger language plpgsql as $$
begin
  if not is_guild_lead() and (new.size <> old.size or new.status <> old.status) then
    raise exception 'Bara ledningen kan ändra storlek eller ta bort en grupp';
  end if;
  new.updated_by := current_member();
  new.updated_at := now();
  return new;
end $$;
create trigger guard_group_update before update on groups for each row execute function guard_group_update();

-- bemanning: ledningen allt, Raid Master allt i sin grupp utom vem som är Raid Master
create policy "bemanna" on assignments for insert to authenticated
  with check (is_guild_lead() or (slot <> 'raid_master' and is_raid_master(group_id)));
create policy "avbemanna" on assignments for delete to authenticated
  using (is_guild_lead() or (slot <> 'raid_master' and is_raid_master(group_id)));

-- egen profil: man får ändra sitt eget namn i spelet och sin klass, inget annat.
-- guild_roles, discord-id, kontot och online skrivs bara av Discord-synken (service role går förbi RLS).
create policy "egen profil" on members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create function guard_member_update() returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' and (new.guild_roles is distinct from old.guild_roles or new.discord_id is distinct from old.discord_id
      or new.user_id is distinct from old.user_id or new.online is distinct from old.online) then
    raise exception 'Bara namn och klass går att ändra i profilen';
  end if;
  if new.character !~ '^[[:alpha:]]{2,12}$' then raise exception 'Namnet ska vara 2–12 bokstäver'; end if;
  return new;
end $$;
create trigger guard_member_update before update on members for each row execute function guard_member_update();
create unique index members_character on members (lower(character));
-- Koppla user_id vid första inloggning med en edge function.

-- ---------- assignments ----------
-- vem får redigera en grupps tavla: ledningen, gruppens Raid Master, den som har "Assignments & taktik" i gruppen
create function can_edit_board(gid text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_guild_lead() or exists (select 1 from assignments
    where group_id = gid and member_id = current_member() and slot in ('raid_master', 'assignments')) $$;

alter table assignment_templates alter column created_by set default current_member();

-- den som får redigera någon tavla får spara mallar
create function can_make_templates() returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_guild_lead() or exists (select 1 from assignments
    where member_id = current_member() and slot in ('raid_master', 'assignments')) $$;

create policy "redigera tavlan" on assignment_boards for all to authenticated
  using (can_edit_board(group_id)) with check (can_edit_board(group_id));

create policy "spara mall" on assignment_templates for insert to authenticated
  with check (can_make_templates() and created_by = current_member());
create policy "ta bort mall" on assignment_templates for delete to authenticated
  using (is_guild_lead() or created_by = current_member());
