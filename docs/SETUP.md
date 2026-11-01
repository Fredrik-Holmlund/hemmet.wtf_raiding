# Komma igång med Supabase

Görs en gång per Supabase-projekt. Har du flera bidragsgivare: använd ett eget testprojekt för utveckling.

## 1. Skapa projektet

Skapa ett projekt på [supabase.com](https://supabase.com), region EU.

## 2. Skapa tabellerna

Kör filerna i `supabase/migrations/` i namnordning, i SQL Editor eller med Supabase CLI (`supabase db push`).
Det skapar tabeller, regler, roller, funktioner och ambitionsnivåer.

## 3. Discord-inloggning

1. Skapa en applikation på [Discord Developer Portal](https://discord.com/developers/applications).
2. Under OAuth2: kopiera Client ID och Client Secret, och lägg till redirect-adressen
   `https://<projekt>.supabase.co/auth/v1/callback`.
3. I Supabase, under Authentication → Providers: slå på **Discord** och klistra in Client ID och Client Secret.
4. Under Authentication → Providers: **stäng av Email** och alla andra inloggningssätt.
5. Under Authentication → URL Configuration: sätt Site URL till `https://raiding.hemmet.wtf` och lägg till
   `http://localhost:5174/**` under Redirect URLs för utveckling, med `/**` på slutet: utan det godkänns inte adressen,
   och inloggningen hamnar på Site URL i stället.

## 4. Koppla sidan

Lägg in Project URL och **publishable**-nyckeln i `config.js`. Den hemliga nyckeln ska inte in här eller någon annanstans i
repot, se [CONTRIBUTING.md](../CONTRIBUTING.md).

```bash
python serve.py      # http://localhost:5174
```

## 5. Första ledningen

Rollerna **Guild Master** och **Guild Leader** på Discord-servern ger ledningens behörighet på sidan. Ingen kan ge sig själv
roller på sidan: `supabase/functions/sync-discord-roles` frågar Discord med en bot.

1. **Boten:** i Discord Developer Portal, samma applikation som inloggningen: gå till Bot och skapa eller återställ token.
   Slå på **Server Members Intent**: schemat hämtar hela medlemslistan, och den som inte är med på servern visas inte på sidan.
2. **Bjud in den:** under OAuth2 → URL Generator, välj scope `bot` och inga behörigheter. Öppna länken och välj servern.
3. **Hemligheter:** i Supabase under Edge Functions → Secrets, lägg till:
   - `DISCORD_BOT_TOKEN`: botens token
   - `DISCORD_GUILD_ID`: serverns id
   - `CRON_SECRET`: ett långt slumpat lösenord som du hittar på
4. **Funktionen:** under Edge Functions → Deploy a new function → Via Editor: döp den till `sync-discord-roles`, klistra in
   `index.ts` och stäng av **Verify JWT** (funktionen kontrollerar inloggningen själv).
5. **Schemat:** kör det här i SQL Editor, med ditt projekt och ditt `CRON_SECRET`. Då slutar en borttagen roll gälla även för den
   som inte öppnar sidan. Lägg det inte i en migration: `CRON_SECRET` ska inte in i repot.

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('sync-discord-roles', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<projekt>.supabase.co/functions/v1/sync-discord-roles',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
       body := '{}'::jsonb
     )
   $$);
   ```

   Svaren syns med `select status_code, content from net._http_response order by created desc limit 3;`.

**Grön prick:** slå på **Serverinställningar → Widget → Aktivera serverwidget** på Discord. Funktionen läser vilka som är online därifrån,
vid sidladdning och var 15:e minut. Widgeten visar bara namn och högst 100 personer, så personen matchas på namnet på Discord eller i spelet.
Den som står som osynlig syns inte.

Rollerna hämtas vid varje sidladdning för den som är inloggad. Svarar inte Discord behåller alla sina roller, och hittas inte
rollnamnen på servern ändras ingenting.

Kontrollera med `select character, discord, guild_roles from members;` att rätt personer fick rollen.

## 5b. Trådar på Discord

När en grupp skapas lägger boten upp en tråd i forumet `10-man-raids`, `20-man-raids` eller `40-man-raids`, med gruppens text som
första inlägg. Forumen hittas på namnet, så de måste heta exakt så.

1. Lägg upp funktionen som i steget ovan: `create-group-thread`, med **Verify JWT** avstängt. Den använder samma hemligheter.
2. Boten behöver **View Channels**, **Send Messages** och **Embed Links** i de tre forumen. Är forumen privata, lägg till boten eller
   dess roll i forumens behörigheter.
3. Tråden får forumets taggar för nivån och signupläget (`Chill Raiding`, `Öppet`, `Hör av dig`, `Fullt Hus` …), om de heter som på sidan.

Finns ingen tråd på en grupp har gruppens sida knappen *Skapa tråd på Discord*.

## 5c. Assignments till Discord

Under *Bild till Discord* på tavlan kan ledningen och gruppens Raid Master, Raid Leader, Roster & uttagning och Assignments & taktik skicka bilden till gruppens tråd.

1. Lägg upp funktionen `post-assignments` på samma sätt, med **Verify JWT** avstängt.
2. Ge boten **Bifoga filer** i de tre forumen.

## 5d. /verify på Discord

Medlemmen skriver `/verify namn:Bonk Donkus`. Finns namnet i guilden får personen rollen, smeknamnet och en rad i `members`, så att profilen är ifylld
vid första inloggningen. Svaret syns bara för personen själv.

1. **Boten:** under OAuth2 → URL Generator, välj scope `bot` och `applications.commands`. Öppna länken och välj servern. Boten ligger kvar.
2. **Rollen:** ge botens roll **Manage Roles** och **Manage Nicknames**, och dra den över verifieringsrollen i rollistan.
3. **Hemligheter:** lägg till i Edge Functions → Secrets:
   - `DISCORD_PUBLIC_KEY`: Public Key under General Information
   - `DISCORD_VERIFIED_ROLE`: rollens namn, exakt som på servern
   - `BLIZZARD_CLIENT_ID` och `BLIZZARD_CLIENT_SECRET`: egen klient på [develop.battle.net](https://develop.battle.net)
   - `WOW_REALM` och `WOW_GUILD`: sätts när Forever-API:t är öppet. Tills dess godkänns namnen utan kontroll. `WOW_NAMESPACE` är `profile-forever-eu` om inget annat sätts.
4. **Databasen:** kör migrationen `20261101120000_verifiering.sql`.
5. **Funktionen:** lägg upp `discord-interactions` som de andra, med **Verify JWT** avstängt.
6. **Kommandot och schemat:** kör det här i SQL Editor, med ditt projekt och ditt `CRON_SECRET`. Det första anropet lägger upp `/verify` på servern, det andra
   kontrollerar godkända namn i efterhand.

   ```sql
   select net.http_post(
     url := 'https://<projekt>.supabase.co/functions/v1/discord-interactions',
     headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
     body := '{"action": "register"}'::jsonb
   );
   select cron.schedule('verify-recheck', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<projekt>.supabase.co/functions/v1/discord-interactions',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
       body := '{"action": "recheck"}'::jsonb
     )
   $$);
   ```

7. **Adressen:** i Developer Portal under General Information, sätt Interactions Endpoint URL till
   `https://<projekt>.supabase.co/functions/v1/discord-interactions`. Discord testar adressen när du sparar, så funktionen och `DISCORD_PUBLIC_KEY` måste vara på plats först.
8. **Smeknamnen:** slå av **Change Nickname** för @everyone och verifieringsrollen, annars går namnet att byta direkt efter verifieringen.

## 6. Publicera på raiding.hemmet.wtf

1. I repots Settings → Pages: publicera från `main`, mappen `/`.
2. Sätt Custom domain till `raiding.hemmet.wtf`.
3. Lägg till en CNAME-post i DNS: `raiding` → `fredrik-holmlund.github.io`.
4. Slå på Enforce HTTPS.

## 7. Skydda main

I Settings → Branches: kräv pull request och minst ett godkännande på `main`, och blockera force push. Det är det som gör
reglerna i CONTRIBUTING.md till något mer än en överenskommelse.
