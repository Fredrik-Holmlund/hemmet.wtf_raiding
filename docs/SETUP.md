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
   Inga privilegierade intents behövs.
2. **Bjud in den:** under OAuth2 → URL Generator, välj scope `bot` och inga behörigheter. Öppna länken och välj servern.
3. **Hemligheter:** i Supabase under Edge Functions → Secrets, lägg till:
   - `DISCORD_BOT_TOKEN`: botens token
   - `DISCORD_GUILD_ID`: serverns id
   - `CRON_SECRET`: ett långt slumpat lösenord som du hittar på
4. **Funktionen:** under Edge Functions → Deploy a new function → Via Editor: döp den till `sync-discord-roles`, klistra in
   `index.ts` och stäng av **Verify JWT** (funktionen kontrollerar inloggningen själv).
5. **Schemat:** under Integrations → Cron, skapa ett jobb var 15:e minut som anropar funktionen med POST och headern
   `x-cron-secret` med samma värde som `CRON_SECRET`. Då slutar en borttagen roll gälla även för den som inte öppnar sidan.

Rollerna hämtas vid varje sidladdning för den som är inloggad. Svarar inte Discord behåller alla sina roller, och hittas inte
rollnamnen på servern ändras ingenting.

Kontrollera med `select character, discord, guild_roles from members;` att rätt personer fick rollen.

## 6. Publicera på raiding.hemmet.wtf

1. I repots Settings → Pages: publicera från `main`, mappen `/`.
2. Sätt Custom domain till `raiding.hemmet.wtf`.
3. Lägg till en CNAME-post i DNS: `raiding` → `fredrik-holmlund.github.io`.
4. Slå på Enforce HTTPS.

## 7. Skydda main

I Settings → Branches: kräv pull request och minst ett godkännande på `main`, och blockera force push. Det är det som gör
reglerna i CONTRIBUTING.md till något mer än en överenskommelse.
