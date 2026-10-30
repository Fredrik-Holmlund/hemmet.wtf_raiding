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
   `http://localhost:5174` under Redirect URLs för utveckling.

## 4. Koppla sidan

Lägg in Project URL och **publishable**-nyckeln i `config.js`. Den hemliga nyckeln ska inte in här eller någon annanstans i
repot, se [CONTRIBUTING.md](../CONTRIBUTING.md).

```bash
python serve.py      # http://localhost:5174
```

## 5. Första ledningen

Logga in en gång med Discord och fyll i din profil. Ingen kan ge sig själv ledningsroller på sidan, så de första sätts i
SQL Editor:

```sql
update members set guild_roles = '{guild_master}' where character = 'DittNamn';
update members set guild_roles = '{guild_leader}' where character in ('Namn1', 'Namn2');
```

Kontrollera med `select character, discord, guild_roles from members;` att rätt personer fick rollen. När Discord-boten finns
sätter den rollerna i stället.

## 6. Publicera på raiding.hemmet.wtf

1. I repots Settings → Pages: publicera från `main`, mappen `/`.
2. Sätt Custom domain till `raiding.hemmet.wtf`.
3. Lägg till en CNAME-post i DNS: `raiding` → `fredrik-holmlund.github.io`.
4. Slå på Enforce HTTPS.

## 7. Skydda main

I Settings → Branches: kräv pull request och minst ett godkännande på `main`, och blockera force push. Det är det som gör
reglerna i CONTRIBUTING.md till något mer än en överenskommelse.
