-- Är personen med på guildens Discord-server? Skrivs av sync-discord-roles.
-- Sidan visar bara de som är med. Vem som helst med ett Discord-konto kan logga in, men får ingen plats i guilden av det.
alter table members add column in_guild boolean not null default false;
grant select (in_guild) on members to anon, authenticated;
