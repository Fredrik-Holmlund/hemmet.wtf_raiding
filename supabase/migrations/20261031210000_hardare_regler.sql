-- Hårdare regler: profilen hör till guildens medlemmar, länkarna till boten och tavlorna ska hålla formatet.

-- ---------- profilen ----------
-- Bara den som är med på servern får fylla i sin profil, och klassen ska vara en av spelets.
-- auth.uid() är tomt för Discord-synken och SQL Editor, som inte berörs.
create or replace function guard_member() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not old.in_guild
      and (new.character is distinct from old.character or new.class is distinct from old.class) then
    raise exception 'Du behöver vara med på guildens Discord-server för att fylla i din profil';
  end if;
  -- teckenintervall i stället för [[:alpha:]], så att å, ä och ö fungerar oavsett databasens språkinställning
  if new.character is distinct from old.character and (new.character is null
      or new.character !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]{2,12}( [A-Za-zÀ-ÖØ-öø-ÿ]{2,12})?$') then
    raise exception 'Namnet ska vara förnamn och efternamn, 2-12 bokstäver var';
  end if;
  if new.class is distinct from old.class and new.class is not null
      and new.class not in ('warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid') then
    raise exception 'Okänd klass';
  end if;
  return new;
end $$;

-- ---------- namnbyte ----------
-- Namnet byts bara där det är ett spelarnamn: rostern, raderna och rutorna, på tavlor där personen faktiskt spelar.
-- Rollnamn, raidnamn och kolumner lämnas ifred.
create function rename_player(doc jsonb, old_name text, new_name text, pattern text) returns jsonb
  language plpgsql immutable as $$
declare
  result jsonb;
begin
  case jsonb_typeof(doc)
    when 'array' then
      select coalesce(jsonb_agg(rename_player(value, old_name, new_name, pattern) order by ord), '[]') into result
        from jsonb_array_elements(doc) with ordinality as t (value, ord);
      return result;
    when 'object' then
      select coalesce(jsonb_object_agg(key, case
          when key = 'cells' then replace_in_json(value, pattern, '\1' || new_name)
          when key = 'player' and lower(value #>> '{}') = lower(old_name) then to_jsonb(new_name)
          when key = 'roster' and jsonb_typeof(value) = 'array' then (
            select coalesce(jsonb_agg(case when lower(p ->> 'name') = lower(old_name) then jsonb_set(p, '{name}', to_jsonb(new_name)) else p end order by ord), '[]')
              from jsonb_array_elements(value) with ordinality as r (p, ord))
          else rename_player(value, old_name, new_name, pattern)
        end), '{}') into result
        from jsonb_each(doc);
      return result;
    else return doc;
  end case;
end $$;

create or replace function rename_on_boards() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  letters text := 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
begin
  if not new.in_guild or old.character is null or new.character is null or lower(old.character) = lower(new.character) then
    return new;
  end if;
  update assignment_boards b
    set data = rename_player(b.data, old.character, new.character, '(^|[^' || letters || '])' || old.character || '(?=[^' || letters || ']|$)')
    where exists (select 1 from jsonb_path_query(b.data, '$.roster[*].name') v where lower(v #>> '{}') = lower(old.character))
       or exists (select 1 from jsonb_path_query(b.data, '$.raids[*].sections[*].rows[*].player') v where lower(v #>> '{}') = lower(old.character));
  return new;
end $$;

-- hjälpfunktioner som bara triggern ska använda
revoke execute on function replace_in_json(jsonb, text, text), rename_player(jsonb, text, text, text) from public, anon, authenticated;

-- ---------- grupperna ----------
-- Bara de kolumner sidan använder. Länkarna skrivs av boten, som går förbi de här reglerna.
update groups set links = links - 'thread'
  where links ->> 'thread' !~ '^https://discord\.com/channels/[0-9]+/[0-9]+(/[0-9]+)?$';
alter table groups add constraint links_thread_on_discord
  check (links ->> 'thread' is null or links ->> 'thread' ~ '^https://discord\.com/channels/[0-9]+/[0-9]+(/[0-9]+)?$');

revoke insert, update on groups from anon, authenticated;
grant insert (id, name, size, raid_id, ambition, raid_days, raid_start, schedule_note, blurb, details, signup, recruit_roles, recruit_note, status) on groups to authenticated;
grant update (name, size, raid_id, ambition, raid_days, raid_start, schedule_note, blurb, details, signup, recruit_roles, recruit_note, status) on groups to authenticated;

create or replace function guard_group() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.id !~ '^[a-z0-9-]{1,80}$' then
    raise exception 'Gruppens id ska vara små bokstäver, siffror och bindestreck';
  end if;
  if tg_op = 'UPDATE' and not is_guild_lead() and (new.size <> old.size or new.status <> old.status) then
    raise exception 'Bara ledningen kan ändra storlek eller ta bort en grupp';
  end if;
  new.updated_by := current_member();
  new.updated_at := now();
  return new;
end $$;

-- ---------- tavlorna och mallarna ----------
-- Id:n och färger är inget man skriver själv, så de har ett fast format.
create function board_is_valid(doc jsonb) returns boolean
  language sql immutable as $$
  select not jsonb_path_exists(doc, '$.**.id ? (@.type() != "string" || !(@ like_regex "^[A-Za-z0-9_-]{1,64}$"))')
     and not jsonb_path_exists(doc, '$.**.color ? (@.type() != "null" && (@.type() != "string" || !(@ like_regex "^#[0-9a-fA-F]{3,8}$")))')
$$;

-- färger från tidigare importer som inte håller formatet: sidan använder klassfärgen i stället
update assignment_boards b set data = jsonb_set(b.data, '{roster}', (
    select coalesce(jsonb_agg(case when board_is_valid(jsonb_build_object('color', p -> 'color')) then p else p - 'color' end order by ord), '[]')
      from jsonb_array_elements(b.data -> 'roster') with ordinality as r (p, ord)))
  where jsonb_typeof(b.data -> 'roster') = 'array' and not board_is_valid(b.data);

create function guard_board() returns trigger language plpgsql as $$
begin
  if not board_is_valid(new.data) then
    raise exception 'Tavlan innehåller ogiltiga värden';
  end if;
  return new;
end $$;
create trigger guard_board before insert or update on assignment_boards for each row execute function guard_board();
create trigger guard_board before insert or update on assignment_templates for each row execute function guard_board();
