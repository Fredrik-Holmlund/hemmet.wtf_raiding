-- HEMMET Raiding: tabeller, regler (RLS) och inloggning.
-- Reglerna sitter här, inte i webbläsaren. perms.js speglar dem bara för att visa rätt knappar.
--
-- Inloggning: Supabase Auth med Discord. Vid första inloggningen skapas en rad i members (handle_new_user).
-- guild_roles sätts i dag för hand av ledningen och senare av en Discord-synk (bot med service role).
-- Ingen kan ge sig själv ledningsroller på sidan.

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
  short_name text,
  purpose text,
  summary text,
  description text,
  deadline text,
  tools text[] not null default '{}',
  holder_title text
);

create table members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  discord_id text unique,
  discord text,              -- visningsnamn på Discord
  character text,            -- namn i spelet; tomt tills personen har fyllt i sin profil
  class text,
  guild_roles text[] not null default '{}',
  online boolean not null default false,   -- skrivs av Discord-boten (presence)
  last_seen timestamptz
);
create unique index members_character on members (lower(character));

create table ambitions (
  level text primary key check (level in ('A', 'B', 'C')),   -- A Min-Max, B Focused, C Chill
  rank int not null,                                           -- 3, 2, 1 (sortering)
  color text,                                                  -- spelets kvalitetsfärg
  quality text,                                                -- Legendary, Epic, Rare
  name text not null,
  tagline text
);

create table groups (
  id text primary key,       -- slug av namnet
  name text not null,
  size int not null check (size in (10, 20, 40)),
  raid_id text,              -- gruppkoden: A1, B2 …
  ambition text references ambitions (level),
  raid_days text[] not null default '{}' check (raid_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  raid_start time,           -- svensk tid
  schedule_note text,        -- fritt tillägg, t.ex. "När det passar"
  blurb text,
  details text,              -- fri text som Raid Master skriver
  signup text not null default 'open' check (signup in ('open', 'ask', 'full')),   -- Öppet, Hör av dig, Fullt hus
  recruit_roles text[] not null default '{}' check (recruit_roles <@ array['tank','healer','dps']),
  recruit_note text check (char_length(recruit_note) <= 400),   -- högst 50 ord, kontrolleras på sidan
  status text not null default 'active' check (status in ('active', 'archived')),
  links jsonb not null default '{}',
  updated_by uuid references members on delete set null,
  updated_at timestamptz not null default now()
);

-- en rad per person och ansvar: slot = 'raid_master' (alla grupper) eller ett functions.id (bara 20- och 40-manna)
create table assignments (
  group_id text not null references groups on delete cascade,
  slot text not null,
  member_id uuid not null references members on delete cascade,
  primary key (group_id, slot, member_id)
);
create unique index one_raid_master on assignments (group_id) where slot = 'raid_master';

-- assignment-tavlan: ett JSON-dokument per grupp (roster, raider med rader, kolumner och rutor)
create table assignment_boards (
  group_id text primary key references groups on delete cascade,
  data jsonb not null,
  updated_by uuid references members on delete set null,
  updated_at timestamptz not null default now()
);

-- mallar för tavlan, gemensamma för hela guilden (utan spelarnamn)
create table assignment_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  data jsonb not null,
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

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

-- tavlan: ledningen, gruppens Raid Master och den som har "Assignments & taktik" i gruppen
create function can_edit_board(gid text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_guild_lead() or exists (select 1 from assignments
    where group_id = gid and member_id = current_member() and slot in ('raid_master', 'assignments')) $$;

-- den som får redigera någon tavla får spara mallar
create function can_make_templates() returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_guild_lead() or exists (select 1 from assignments
    where member_id = current_member() and slot in ('raid_master', 'assignments')) $$;

alter table assignment_templates alter column created_by set default current_member();

-- ---------- inloggning: första gången någon loggar in med Discord ----------
-- Finns personen redan (skapad av boten) kopplas kontot dit, annars skapas en rad utan namn i spelet.
-- Bara Discord: stäng av övriga inloggningssätt i Supabase, och den här funktionen rör inga andra konton.
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  discord_user text := new.raw_user_meta_data ->> 'provider_id';
  display text := coalesce(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  if new.raw_app_meta_data ->> 'provider' is distinct from 'discord' or discord_user is null then
    return new;
  end if;
  update members set user_id = new.id, discord = coalesce(display, discord) where discord_id = discord_user and user_id is null;
  if not found then
    insert into members (user_id, discord_id, discord) values (new.id, discord_user, display);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- regler ----------
alter table roles enable row level security;
alter table functions enable row level security;
alter table members enable row level security;
alter table groups enable row level security;
alter table assignments enable row level security;
alter table ambitions enable row level security;
alter table assignment_boards enable row level security;
alter table assignment_templates enable row level security;

-- Sidan går att läsa utan inloggning. Byt "anon, authenticated" mot "authenticated" för att kräva inloggning.
create policy "läsa" on roles for select to anon, authenticated using (true);
create policy "läsa" on functions for select to anon, authenticated using (true);
create policy "läsa" on ambitions for select to anon, authenticated using (true);
create policy "läsa" on members for select to anon, authenticated using (true);
create policy "läsa" on groups for select to anon, authenticated using (true);
create policy "läsa" on assignments for select to anon, authenticated using (true);
create policy "läsa" on assignment_boards for select to anon, authenticated using (true);
create policy "läsa" on assignment_templates for select to anon, authenticated using (true);

-- Medlemmarna: utan inloggning syns bara det sidan visar, inte Discord-uppgifterna. Kontokopplingen visas för ingen.
revoke all on members from anon, authenticated;
grant select (id, character, class, guild_roles, online) on members to anon;
grant select (id, character, class, guild_roles, online, discord, discord_id, last_seen) on members to authenticated;
grant update (character, class) on members to authenticated;

-- texterna för roller, funktioner och nivåer: ledningen
create policy "ledningen ändrar" on roles for all to authenticated using (is_guild_lead()) with check (is_guild_lead());
create policy "ledningen ändrar" on functions for all to authenticated using (is_guild_lead()) with check (is_guild_lead());
create policy "ledningen ändrar" on ambitions for all to authenticated using (is_guild_lead()) with check (is_guild_lead());

-- grupper: ledningen skapar och raderar, ledningen och gruppens Raid Master ändrar
create policy "ledningen skapar" on groups for insert to authenticated with check (is_guild_lead());
create policy "ledningen eller raid master ändrar" on groups for update to authenticated
  using (is_guild_lead() or is_raid_master(id)) with check (is_guild_lead() or is_raid_master(id));
create policy "ledningen raderar" on groups for delete to authenticated using (is_guild_lead());

-- storlek och status (ta bort / återställa) bara för ledningen; vem som ändrade sätts av databasen
create function guard_group() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not is_guild_lead() and (new.size <> old.size or new.status <> old.status) then
    raise exception 'Bara ledningen kan ändra storlek eller ta bort en grupp';
  end if;
  new.updated_by := current_member();
  new.updated_at := now();
  return new;
end $$;
create trigger guard_group before insert or update on groups for each row execute function guard_group();

-- bemanning: ledningen allt, Raid Master allt i sin grupp utom vem som är Raid Master
create policy "bemanna" on assignments for insert to authenticated
  with check (is_guild_lead() or (slot <> 'raid_master' and is_raid_master(group_id)));
create policy "avbemanna" on assignments for delete to authenticated
  using (is_guild_lead() or (slot <> 'raid_master' and is_raid_master(group_id)));

-- egen profil: bara namn i spelet och klass (kolumnerna ovan). Resten skrivs av Discord-synken med service role.
create policy "egen profil" on members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create function guard_member() returns trigger language plpgsql as $$
begin
  -- teckenintervall i stället för [[:alpha:]], så att å, ä och ö fungerar oavsett databasens språkinställning
  if new.character is distinct from old.character and (new.character is null or new.character !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]{2,12}$') then
    raise exception 'Namnet ska vara 2-12 bokstäver';
  end if;
  return new;
end $$;
create trigger guard_member before update on members for each row execute function guard_member();

-- tavlan och mallarna
create policy "redigera tavlan" on assignment_boards for insert to authenticated with check (can_edit_board(group_id));
create policy "redigera tavlan 2" on assignment_boards for update to authenticated
  using (can_edit_board(group_id)) with check (can_edit_board(group_id));
create policy "ta bort tavlan" on assignment_boards for delete to authenticated using (can_edit_board(group_id));
create policy "spara mall" on assignment_templates for insert to authenticated
  with check (can_make_templates() and created_by = current_member());
create policy "ta bort mall" on assignment_templates for delete to authenticated
  using (is_guild_lead() or created_by = current_member());

create function stamp_board() returns trigger language plpgsql as $$
begin
  new.updated_by := current_member();
  new.updated_at := now();
  return new;
end $$;
create trigger stamp_board before insert or update on assignment_boards for each row execute function stamp_board();

-- ---------- byter någon namn följer det med på tavlorna ----------
-- Vanliga medlemmar får inte skriva på tavlorna, så det görs här. Bara värden byts, aldrig nycklar:
-- annars skulle en spelare som heter "Name" förstöra dokumentet.
create function replace_in_json(doc jsonb, pattern text, replacement text) returns jsonb
  language plpgsql immutable as $$
declare
  result jsonb;
begin
  case jsonb_typeof(doc)
    when 'string' then return to_jsonb(regexp_replace(doc #>> '{}', pattern, replacement, 'gi'));
    when 'array' then
      select coalesce(jsonb_agg(replace_in_json(value, pattern, replacement) order by ord), '[]') into result
        from jsonb_array_elements(doc) with ordinality as t (value, ord);
      return result;
    when 'object' then
      select coalesce(jsonb_object_agg(key, replace_in_json(value, pattern, replacement)), '{}') into result
        from jsonb_each(doc);
      return result;
    else return doc;
  end case;
end $$;

create function rename_on_boards() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  letters text := 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
begin
  if old.character is null or new.character is null or lower(old.character) = lower(new.character) then
    return new;
  end if;
  update assignment_boards
    set data = replace_in_json(data, '(^|[^' || letters || '])' || old.character || '(?=[^' || letters || ']|$)', '\1' || new.character)
    where data::text ilike '%' || old.character || '%';
  return new;
end $$;
create trigger rename_on_boards after update of character on members for each row execute function rename_on_boards();

-- triggerfunktionerna ska inte gå att anropa direkt
revoke execute on function handle_new_user(), rename_on_boards() from public, anon, authenticated;
