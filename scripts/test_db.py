r"""Kör migrationerna mot en tillfällig, riktig Postgres och testar reglerna (RLS).

  pip install pgserver psycopg2-binary
  python scripts/test_db.py

Rör ingen riktig databas. Supabase egna delar (auth.users, auth.uid(), rollerna) är ersatta av en liten
stub överst, så testet visar att reglerna fungerar, inte att Discord-inloggningen gör det.
Lägg till ett test här när du ändrar en regel.
"""
import json
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

import pgserver
import psycopg2

ROOT = Path(__file__).resolve().parent.parent
for s in (sys.stdout, sys.stderr):
    s.reconfigure(encoding="utf-8")

STUB = """
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb, raw_app_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
"""

results = []


def check(name, ok):
    results.append(ok)
    print(("  ok   " if ok else "  FEL  ") + name)


class Db:
    def __init__(self, uri):
        self.c = psycopg2.connect(uri)
        self.c.autocommit = True
        self.cur = self.c.cursor()

    def run(self, sql, args=None):
        self.cur.execute(sql, args)
        return self.cur.fetchall() if self.cur.description else self.cur.rowcount

    def login(self, user=None):
        self.run("reset role")
        self.run("select set_config('test.uid', %s, false)", (str(user) if user else "",))
        self.run(f"set role {'authenticated' if user else 'anon'}")

    def admin(self):
        self.run("reset role")
        self.run("select set_config('test.uid', '', false)")

    def denied(self, sql, args=None):
        """sant om databasen vägrar: fel, eller inga rader berörda"""
        try:
            return self.run(sql, args) == 0
        except psycopg2.Error:
            return True

    def user(self, discord_id, name=None, provider="discord"):
        uid = uuid.uuid4()
        self.admin()
        self.run("insert into auth.users (id, raw_user_meta_data, raw_app_meta_data) values (%s, %s, %s)",
                 (str(uid), json.dumps({"provider_id": discord_id, "full_name": name}), json.dumps({"provider": provider})))
        return uid


def tests(d):
    print("innehållet")
    d.admin()
    check("fem roller, sex funktioner, tre nivåer", d.run("select (select count(*) from roles), (select count(*) from functions), (select count(*) from ambitions)") == [(5, 6, 3)])

    print("inloggning")
    lead, rm, helper, other = d.user("1", "Ledaren"), d.user("2", "Raidmastern"), d.user("3", "Hjälpen"), d.user("4", "Någon")
    d.user("9", "Mejl", provider="email")
    check("Discord-konton får en medlemsrad utan namn i spelet", d.run("select discord, character from members where discord_id = '1'") == [("Ledaren", None)])
    check("andra inloggningssätt får ingen rad", d.run("select count(*) from members where discord_id = '9'") == [(0,)])
    d.run("insert into members (discord_id, discord, character) values ('7', 'Bot', 'Bottad')")
    bot = d.user("7", "Riktig")
    check("rad från boten kopplas till kontot", d.run("select count(*) from members m join auth.users u on u.id = m.user_id where u.id = %s and m.character = 'Bottad'", (str(bot),)) == [(1,)])
    d.run("update members set guild_roles = '{guild_master}' where discord_id = '1'")
    ids = dict(d.run("select discord_id, id from members"))
    d.run("update members set character = 'Ledaren', class = 'priest' where discord_id = '1'")
    d.run("update members set character = 'Mästaren', class = 'mage' where discord_id = '2'")

    print("utan inloggning")
    d.login()
    check("läser medlemmar utan Discord-uppgifter", d.denied("select discord_id from members"))
    check("läser namnet", ("Ledaren",) in d.run("select character from members"))
    check("ser inte kontokopplingen", d.denied("select user_id from members"))
    check("kan inte skapa grupp", d.denied("insert into groups (id, name, size) values ('x', 'X', 10)"))
    d.login(other)
    check("inloggad ser Discord-id", len(d.run("select discord_id from members")) > 0)
    check("inloggad ser inte kontokopplingen", d.denied("select user_id from members"))

    print("profil")
    d.login(other)
    d.run("update members set character = 'Åsa', class = 'druid' where id = current_member()")
    check("egen profil med å", d.run("select character from members where id = current_member()") == [("Åsa",)])
    check("kan inte ge sig själv ledningsroll", d.denied("update members set guild_roles = '{guild_master}' where id = current_member()"))
    check("kan inte ändra någon annans namn", d.denied("update members set character = 'Hackad' where discord_id = '1'"))
    check("felaktigt namn stoppas", d.denied("update members set character = 'x1' where id = current_member()"))
    check("upptaget namn stoppas", d.denied("update members set character = 'ledaren' where id = current_member()"))

    print("grupper")
    check("medlem kan inte skapa grupp", d.denied("insert into groups (id, name, size) values ('x', 'X', 10)"))
    d.login(lead)
    d.run("insert into groups (id, name, size) values ('g1', 'Grupp', 20), ('g2', 'Andra', 10)")
    check("ledningen skapar, och vem som gjorde det sätts av databasen", d.run("select updated_by from groups where id = 'g1'") == [(ids["1"],)])
    d.run("insert into assignments values ('g1', 'raid_master', %s)", (ids["2"],))
    check("högst en Raid Master", d.denied("insert into assignments values ('g1', 'raid_master', %s)", (ids["3"],)))
    d.login(rm)
    check("Raid Master ändrar sin grupp", d.run("update groups set details = 'hej' where id = 'g1'") == 1)
    check("men inte en annan grupp", d.denied("update groups set details = 'hej' where id = 'g2'"))
    check("inte storleken", d.denied("update groups set size = 40 where id = 'g1'"))
    check("inte ta bort den", d.denied("update groups set status = 'archived' where id = 'g1'"))
    check("inte radera den", d.denied("delete from groups where id = 'g1'"))
    check("inte byta Raid Master", d.denied("delete from assignments where group_id = 'g1' and slot = 'raid_master'"))
    check("delegerar en funktion", d.run("insert into assignments values ('g1', 'assignments', %s)", (ids["3"],)) == 1)
    d.login(other)
    check("medlem kan inte bemanna", d.denied("insert into assignments values ('g1', 'loot', current_member())"))

    print("tavlan och mallar")
    board = json.dumps({"roster": [{"name": "Mästaren"}, {"name": "Name"}], "raids": [{"name": "MC", "cells": {"Mästaren": {"c1": "Mästaren tar MT, Mästarensson inte"}}}]})
    d.login(helper)
    check("den med Assignments & taktik redigerar tavlan", d.run("insert into assignment_boards (group_id, data) values ('g1', %s)", (board,)) == 1)
    check("men inte en annan grupps", d.denied("insert into assignment_boards (group_id, data) values ('g2', %s)", (board,)))
    check("sparar mall", d.run("insert into assignment_templates (name, data) values ('M', '{}')") == 1)
    d.login(other)
    check("medlem kan inte ändra tavlan", d.denied("update assignment_boards set data = '{}'"))
    check("medlem kan inte spara mall", d.denied("insert into assignment_templates (name, data) values ('M', '{}')"))
    check("medlem kan inte ta bort andras mall", d.denied("delete from assignment_templates"))

    print("namnbyte")
    d.login(rm)
    d.run("update members set character = 'Kungen' where id = current_member()")
    data = d.run("select data from assignment_boards where group_id = 'g1'")[0][0]
    check("namnet följer med på tavlan", data["roster"][0]["name"] == "Kungen")
    cell = data["raids"][0]["cells"]["Mästaren"]["c1"]
    check("hela ord i rutorna, inte delar av ord", cell == "Kungen tar MT, Mästarensson inte")
    check("nycklar lämnas ifred", "Mästaren" in data["raids"][0]["cells"] and "name" in data["roster"][1])

    print("service role")
    d.admin()
    d.run("set role service_role")
    check("Discord-synken kan sätta roller", d.run("update members set guild_roles = '{guild_leader}', online = true where discord_id = '3'") == 1)

    print("ledningen raderar")
    d.login(lead)
    check("radering tar med bemanning och tavla", d.run("delete from groups where id = 'g1'") == 1 and d.run("select count(*) from assignment_boards") == [(0,)])


def main():
    tmp = tempfile.mkdtemp(prefix="hemmet-pg-")
    server = pgserver.get_server(tmp, cleanup_mode="stop")
    try:
        d = Db(server.get_uri())
        d.run(STUB)
        files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
        for f in files:
            d.run(f.read_text(encoding="utf-8"))
        print(f"{len(files)} migrationer körda")
        tests(d)
        d.c.close()
    finally:
        server.cleanup()
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{sum(results)} av {len(results)} ok")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
