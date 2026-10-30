-- WoW Forever har för- och efternamn: "Bonk Donkus". Ett eller två ord, 2-12 bokstäver var, med ett mellanslag emellan.
create or replace function guard_member() returns trigger language plpgsql as $$
begin
  -- teckenintervall i stället för [[:alpha:]], så att å, ä och ö fungerar oavsett databasens språkinställning
  if new.character is distinct from old.character and (new.character is null
      or new.character !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]{2,12}( [A-Za-zÀ-ÖØ-öø-ÿ]{2,12})?$') then
    raise exception 'Namnet ska vara förnamn och efternamn, 2-12 bokstäver var';
  end if;
  return new;
end $$;
