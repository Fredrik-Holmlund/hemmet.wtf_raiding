# HEMMET – Ledningssidan ("Ordning i hemmet")

Guildens sida för organisation och raidledning: vem som ansvarar för vad, raidgrupperna och deras bemanning,
och en admin-del där ledningen och Raid Masters sköter grupperna. Ska ligga på https://raiding.hemmet.wtf.
Bygger på produktbriefen "HEMMET – Leadership & Raid Management" v1.0 (oktober 2026). Briefen är källan
för roller, rolltexter och de sex funktionerna. Inspiration: lootwatch.lazsarus.com, men för guildstyrning i stället för loot.

**Status (2026-10-30):** statisk demo med exempeldata och demo-inloggning. Flyttad från `hemmet_intranet` till det här repot
(https://github.com/Fredrik-Holmlund/hemmet.wtf_raiding, **publikt**), där live-delen med Supabase och Discord ska byggas.
Lokal mapp: `C:\JOBB\Wow Forever\hemmet.wtf_raiding`. raiding.hemmet.wtf är inte uppsatt än.

## Visningsläget på hemmet.wtf/raiding (sedan 2026-10-17)

En ögonblicksbild av den här sidan ligger publikt på **https://hemmet.wtf/raiding/** för att visa vad guilden erbjuder efter
levelingresan. `C:\JOBB\Wow Forever\hemmet.wtf_leveling_plus_raiding/bygg.py` kopierar sidan från arbetskopian av det här repot (utan CLAUDE.md, README.md, serve.py,
scripts/, supabase/, .git) och sätter `<html data-visning>`. Då gäller (`VISNING` i app.js, `loadData` i data.js):
demo-inloggningen finns kvar så att man kan prova som ledning eller Raid Master, men **inget sparas** (varje sidladdning börjar utloggad och med exempeldatan; `persist()` och inloggningen skriver inte till localStorage),
demoraden säger "Så här kommer raidgrupperna att se ut", loggan leder till `../` och knappen uppe till höger är *Flytta in*
(`../#join`). Startsidan behåller den sökbara titeln från bygget. Ändringar här syns på hemmet.wtf först när sajten publiceras
(`python "C:/JOBB/Wow Forever/Hemmet - Levelingresa/scripts/publicera_prerelease.py"`). **Allt på sidan är publikt där**:
texterna på startsidan är ledningens utkast och ska godkännas eller bytas.

**Live-delen och visningsläget hänger ihop:** `bygg.py` tar det som ligger i arbetskopian just då. När Supabase-koden kommer in
måste `data-visning` fortsätta köra på exempeldatan utan inloggning, och halvfärdigt arbete hamnar på hemmet.wtf/raiding om
sajten publiceras under tiden. Det är ett skäl att jobba i grenar och bygga från `main`.

## Köra lokalt

Statisk sida med ES-moduler. Den behöver en server eftersom `fetch` inte fungerar från `file://`.

```bash
python serve.py      # http://localhost:5174, utan cache
```

Preview-konfigurationen heter `raiding` i `C:\JOBB\Wow Forever\.claude\launch.json` (port 5174).
Ändringar som görs i demon sparas i webbläsarens localStorage (`hemmet-ledning-demo`, inloggad person i
`hemmet-ledning-me`). Knappen *Återställ exempeldata* finns i inloggningspanelen.
**Ändras exempeldatan i `data/*.json`: höj `SEED_VERSION` i `data.js`**, annars ser den som har sparade demoändringar inte det nya
(gamla sparade ändringar slängs då automatiskt).

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Sidans skal: topbar, de tre sidorna (Start, Raidgrupper, Roller & ansvar), sidopanel |
| `styles.css` | HEMMET:s formspråk (se nedan) |
| `app.js` | Rendering, navigering, inloggning, redigeringsformulär, ambitionsnivåer |
| `assignments.js` | Assignment-tavlan: visning, redigering, Raid-Helper-import, mallar |
| `boardImage.js` | Tavlan som bild (canvas) till Discord |
| `perms.js` | **Alla behörighetsregler på ett ställe.** Speglas som RLS i `supabase/schema.sql` |
| `data.js` | Datalagret. Det enda som byts mot Supabase: `loadData`, `saveGroup`, `setSlot`, `removeGroup`, `restoreGroup`, `deleteGroup`, `saveBoard`, `saveTemplate`, `deleteTemplate` |
| `data/*.json` | Exempeldata, en fil per tabell |
| `supabase/schema.sql` | Utkast till tabeller och RLS. **Inte kört mot en riktig databas än** |

## Sidan

Flera sidor (hash-adresser, så att det fungerar som statisk sida). Menyn: Start · Raidgrupper · Roller & ansvar.

- **Start** `#start` = konceptsidan, byggd på ledningens textutkast (oktober 2026, markerat "ska bytas ut" – byt texterna i
  `index.html` när den riktiga texten finns): hero med *Se våra raidgrupper* (ingen namnsök; borttagen 2026-10-12), *Ett hem, många sätt att raida* (A/B/C + koderna),
  *Vem håller i nycklarna?* (hierarkin med **bara titlar**, klickbara, + de sex uppgifterna med korta texter ur `functions.summary`)
  och *Hur hittar jag en raidgrupp?* (kolla grupperna, läs om gruppen på dess sida, säg hej direkt eller i gruppens Discord-tråd, RaidHelper). `#raidgrupper/soker` öppnar listan filtrerad.
- **Raidgrupper** `#raidgrupper`: korten under rubrikerna 40-manna, 20-manna och 10-manna. Överst filter (2026-10-12): storlek,
  dagar (flera val = någon av dem), starttid (före 19, 19–21, 21 och senare), *Söker* tank/healer/DPS (grupper med plats som behöver rollen) och "Bara grupper som är öppna för signups", med
  "Visar N av M" och *Rensa filtren*. Ny grupp-korten döljs medan man filtrerar. Ledningen ser "+ Ny 40-mannagrupp" osv. sist under varje rubrik (`#ny-grupp/40`, storleken förvald), tomma
  rubriker och *Borttagna grupper*.
- **Roller & ansvar** `#roller`: de fem rollerna, de sex funktionerna och ambitionsnivåerna.
- **Raidgruppskorten** ser ut som spelets Group Finder (panelen med äventyrarna, `assets/lfg-panel.webp`, samma som gruppsöket
  på leveling-sidan), inte achievement-pergament: pergamentet betyder resultat och utmärkelser enligt formspråket.
- **Signups** (hette Rekrytering; "rekrytering" gäller guilden, inte en grupp, beslut 2026-10-12) har tre lägen (`groups.signup`):
  **Öppet** (`open`, signa direkt i tråden), **Hör av dig** (`ask`, prata med Raid Master först) och **Fullt hus** (`full`, ingen
  plats just nu, i rött `#e5533d`). Medvetet inga negativa ord som "Stängd" eller "Selektiv". Vid Öppet och Hör av dig visas vilka roller rostern
  behöver (spelets rollikoner, `assets/lfg-roles.webp`); fritexten om rostern (högst 50 ord) finns i alla lägen, t.ex. "reserver
  välkomna". Syns på kortet och som ruta på gruppens sida. **Öppet och Hör av dig räknas båda som öppna för
  signups:** kryssrutan "Bara grupper som är öppna för signups" i filtret och `#raidgrupper/soker` (knappen "Öppna för signups") visar båda. Äldre sparad data med ja/nej räknas om (ja → Öppet, nej → Fullt hus).
  Roller och text heter fortfarande `recruit_roles`, `recruit_note` i koden. Grupperna har inga egna Discord-kanaler (beslut 2026-10-11), så det ska inte stå i texterna.
- **Namn** visas utan kapslar: klassfärg och en prick som är **grön när personen är online på Discord**, grå annars
  (`members.online`, skrivs av Discord-boten; undantaget från "inget grönt", som "lever"-pricken på leveling-sidan).
  Assignment-tavlan behåller sina brickor.
- **Min profil** (kontopanelen, eller sin egen personpanel): ändra namn i spelet (2–12 bokstäver, unikt) och klass. Ett nytt
  namn följer med på assignment-tavlorna (spelarplatser, compen, namn i rutorna). Bara sin egen rad, även i RLS.
- Okänd adress → Start. Gruppens sidor räknas till Raidgrupper i menyn.
- **Roller & ansvar** har också de fem **ambitionsnivåerna**; klick öppnar förklaringen med förväntningar och vilka grupper som har nivån.
- **Gruppens sida** `#grupp/<id>` har flikarna *Översikt* och *Assignments*. Översikt: fakta, bemanningstabell (Raid Master och
  Raid Leader först), rutan *Detaljer* (fri text som Raid Master skriver), kontaktruta och länken till gruppens tråd på Discord
  (den enda länken sedan 2026-10-12; signup, softres och assignment-dokument togs bort).
- **Text till Discord** (knapp bredvid *Redigera gruppen*, samma behörighet): gruppens info som färdig text för gruppens
  forumtråd, i Discords markdown (`# rubrik`, `**fet**`, `>` citat, `-#` liten text): namn och kod, storlek · nivå (🟠/🟣/🔵 i
  kvalitetsfärgen) · tid, *Vem ansvarar för vad* (alla funktioner, "Raid Master själv" när ingen är utsedd), *Detaljer* och länk
  till sidan (inte signupläget: det ändras för ofta för att stå i ett inlägg). Går att ändra i rutan innan *Kopiera*. Namn skrivs `@Namn`
  tills `discord_id` finns; då blir de riktiga omnämnanden `<@id>` (`mention()` i app.js). Senare kan boten uppdatera
  trådens första inlägg direkt.
- **Assignments** `#grupp/<id>/assignments`: tavlan, se nedan.
- **Redigera** `#grupp/<id>/redigera` och **skapa** `#ny-grupp`. Saknas behörighet visas "Låst dörr".
- **Sidopanel** för person, roll och funktion. En person visar allt hen ansvarar för, per grupp.

## Datamodell

```
roles        id, level, name, short, description, responsibilities[], mandate
functions    id, sort, name, purpose, description, deadline, tools[], holder_title?
members      id, character, class, discord, guild_roles[]          (+ user_id, discord_id i Supabase)
groups       id, name, size (10/20/40), raid_id (A1, B2 …), ambition (A/B/C), raid_days[], raid_start (HH:MM), schedule_note, status (active/archived),
             blurb, details (fri text, Raid Master skriver), signup (open/ask/full), recruit_roles[] (tank/healer/dps), recruit_note (högst 50 ord), links {thread}, updated_by, updated_at
assignments  group_id, slot, member_id
ambitions    level (A/B/C), rank, name, tagline, color, quality (Legendary/Epic/Rare), expect {Förberedelse, Consumables, Närvaro, Uttagning}
boards       group_id, data (tavlan, se nedan), updated_by, updated_at
templates    id, name, description, data (tavlan utan spelare och roster), created_by, created_at
```

Principer, alla från briefen:
- **En tilldelning är en rad** (grupp, slot, person), aldrig ett fält med ett enda namn. Samma person kan stå på
  flera rader, och flera personer kan dela en slot.
- `slot` är `raid_master` eller ett funktions-id (`signups`, `roster`, `loot`, `assignments`, `leadership`, `feedback`).
  `leadership` = Raid Leader. (`contact` för 10-manna finns inte längre; äldre sparad data räknas om till `raid_master`.)
- **Ingen utsedd = Raid Master har det själv.** Det visas streckat ("Kanelbulle · Raid Master"), så ansvaret syns alltid.
- **Alla raidgrupper har en Raid Master** (exakt en), även 10-manna (beslut 2026-10-12). De sex funktionerna och Raid Leader
  bemannas bara i 20- och 40-manna; 10-manna har ingen Raid Admin-bemanning. 10-mannagrupper har ambitionsnivå och kod som de andra.
- Roller, funktioner och ambitionsnivåer är data, inte kod.
- Raidnamn står **inte** på gruppen (en grupp raidar flera raids). Vad gruppen raidar skrivs i *Detaljer* och syns
  som flikar på assignment-tavlan.

## Ambitionsnivåer och gruppkoder (ledningens utkast 2026-10-12)

Tre nivåer i `data/ambitions.json`: **A – Min-Max Raiding** (optimera, prestera, jaga logs), **B – Focused Raiding** (seriöst och
effektivt, lite mer flexibelt), **C – Chill Raiding** (ha kul, döda bossar, umgås). Inga detaljerade förväntningar än: "exakt vad
de innebär utvecklar vi tillsammans", och varje Raid Master beskriver gruppens egen ambition.
**Spelets kvalitetsfärger** (2026-10-12, prickarna togs bort, de såg ut som en mobilmeny): A Legendary `#ff8000`, B Epic `#a335ee`,
C Rare `#0070dd` (bytt från Epic/Rare/Uncommon samma dag). Bokstaven i färgad ram (`.qlvl`), nivånamnet och gruppkoden (`.gcode`) i färgen. Ett medvetet undantag
från "blått = det man gör", eftersom det är spelets eget språk för nivåer.

**Gruppkoder:** bokstaven är nivån och siffran skiljer grupper inom samma nivå och storlek, i den ordning de skapas (A1, B2 …).
Sätts automatiskt när gruppen sparas (`nextCode`), behålls så länge nivå och storlek är oförändrade. Sparas i `groups.raid_id`.
Äldre demo-data med 1–5 räknas om (4–5 → A, 3 → B, 1–2 → C).

## Assignments-tavlan

Byggd som lootwatchs (källan: https://github.com/Fredrik-Holmlund/LootWatch, `src/components/assignments/AssignmentSheetView.tsx`).
En tavla per raidgrupp, sparad som ett JSON-dokument (`assignment_boards.data`):
- **Raider** som flikar. Varje raid har **egna rader** (roll + spelare i Tanks/Healers/Ranged/Melee), **kolumner** (bossar, med
  spelets bossporträtt) och **rutor** (fri text). Spelarlistan (roster) är gemensam för gruppen.
- **+ Raid**: välj bland förvalen i `data/raids.json` (MC, Onyxia, BWL, ZG, AQ20, AQ40, Naxx, UBRS) så kommer bossarna med som
  kolumner, eller en av guildens mallar, eller en egen raid. "Ta med roller och spelare från …" kopierar raderna från aktiv raid.
  Raid kan döpas om och tas bort (ledningen, gruppens Raid Master, den med *Assignments & taktik*).
- **Nya rader** får namnet efter sektionen och nästa nummer: Tank N, Healer N, Ranged N, Melee N (förifyllt och markerat i
  fältet, Enter tar det). Raid-Helper-importen döper nya rader likadant. Roll- och spelarnamn står på en rad och krymps
  (`fitNames`, ner till 10 px, sedan …) om de inte får plats. *Inte placerade* syns bara för den som får redigera.
- **Inget redigeringsläge.** Den som får redigera gör det direkt: klick på en ruta öppnar en liten editor (koppla till roll,
  text, spelets markeringar, förhandsvisning, Spara/Rensa). Klick på kolumn- eller radnamn byter namn. Hovra över en kolumn för
  ← ✕ →, över en rad för ⠿ (dra för att flytta) och ✕. "+" sist i huvudet lägger till en kolumn.
- **Läsbarhet:** spelarplatsen är en heltäckande klassfärgad bricka (mörk eller ljus text efter färgen), varannan rad är randig
  (räknas om per sektion), och tabellen **scrollar aldrig i sidled**: får inte alla bossar plats (minst 116 px per kolumn)
  visas så många som ryms, med ‹ Bossar 1–8 av 11 › för att bläddra. På mobil krymper Roll och Spelare. Ritas om vid fönsterbyte.
- Kolumner utan bild (t.ex. i äldre sparade tavlor) får bossens porträtt om namnet stämmer med en boss i förvalen.
- **Spelare:** dra från *Inte placerade* till en rad, dra en spelare mellan rader (byter plats om målet är upptaget), dra
  tillbaka till poolen för att ta bort, eller klicka "dra eller välj" för en sökbar lista (compen först, sedan guildens medlemmar). Finns inte namnet
  kan man **skriva in det manuellt** ("Använd …" eller Enter), t.ex. en invite eller ersättare; det blir en grå bricka.
- I rutorna kan man skriva en **roll** (`MT`, `OT 2`, `Healer 1`): den visas som en bricka med den som har rollen just nu,
  så rutorna stämmer när spelare byts och mallar fylls i av sig själva. Döps rollen om följer rutorna med. Hela ord,
  längsta först ("OT 2" är inte "OT" + "2"). Spelarnamn blir också brickor.
- **Raidmarkeringar** är spelets egna ikoner (`assets/markers/*.png`, ur `Interface/TargetingFrame/UI-RaidTargetingIcon_1–8`,
  fil-ID 137001–137008). Skrivs `{skull} {cross}/{x} {square} {moon} {triangle} {diamond} {circle} {star}` eller spelets
  `{rt1}`–`{rt8}`, eller läggs in med knapparna i editorn.
- **Bossporträtt** (`assets/bosses/*.webp`) är spelets Encounter Journal-bilder. `python scripts/fetch_bosses.py`
  skriver om `data/raids.json` och hämtar saknade bilder (kopierar från `C:\JOBB\wowguild\assets\art`, annars ur spelfilerna med
  wowguilds `casc.py`). Zul'Gurubs präster och Edge of Madness/Gahz'ranka finns inte i journalen och saknar bild.
- **Import från Raid-Helper** (Composition Tool → Export JSON): spelarlistan byts ut. Den som inte är med i nya compen plockas bort
  från raderna i alla raider, de nya läggs på tomma rader i rätt sektion (helst en rad med klassen i namnet), annars på en ny rad (Ranged 6 osv.).
  Roll räknas fram ur spec (Tank-klassen i Raid-Helper → klass via exportens egen `classes`-lista; `Restoration1` → `Restoration`).
- **Bild till Discord** (alla som ser tavlan): hela raiden eller valda bossar (📷 i kolumnhuvudet = bara den bossen), "Dölj rader
  utan uppgifter" förvalt. Ritas på canvas i `boardImage.js` i dubbel upplösning med samma delar som sidan (`cellTokens`).
  *Kopiera bild* lägger PNG i urklipp (Ctrl+V i Discord), *Ladda ner* som reserv. Urklipp kräver ett riktigt klick i Chrome/Edge;
  Claude-appens webbläsarpanel nekar urklipp helt, så kopieringen är inte verifierad där. Senare: *Skicka till Discord*
  via boten (se *Discord-boten*).
- **Mallar** är en raid utan spelarnamn, gemensamma för guilden. *Lägg till som raid* (i Mallar eller + Raid), *Spara … som mall*.
- Äldre sparat format (flikar med gemensamma rader) konverteras automatiskt (`migrate()` i assignments.js).
- Från lootwatch men inte gjort än: ladda upp egna bilder per kolumn (Supabase Storage), "Även här"-närvaro (Supabase Realtime).

## Behörigheter (beslutat 2026-10-11)

Behörighet går på **nivå, inte titel**. Guild Master och Guild Leaders är samma nivå, "ledningen".
Att Guild Master har sista ordet är ett mandat i guilden, ingen extra knapp på sidan.

| | Ledningen (GM/GL) | Raid Master | Medlem |
|---|---|---|---|
| Läsa allt | ✓ | ✓ | ✓ |
| Skapa grupp | ✓ | | |
| Ta bort grupp (mjukt, går att ångra) | ✓ | | |
| Återställa / radera för gott | ✓ | | |
| Se borttagna grupper | ✓ | | |
| Utse/byta Raid Master, ändra storlek | ✓ | | |
| Gruppens uppgifter, detaljer, länkar, Raid Leader, funktionerna | ✓ alla | ✓ sin egen | |
| Redigera assignment-tavlan | ✓ alla | ✓ sin egen | den som har *Assignments & taktik* i gruppen |
| Spara mallar | ✓ | ✓ | den som har *Assignments & taktik* någonstans |
| Ta bort mall | ✓ | egna | egna |

Den som har en funktion i en grupp utan att vara dess Raid Master visas som **Raid Admin** (briefens begrepp).

Ändras i `perms.js` **och** `supabase/schema.sql`, alltid båda.

## Supabase-planen

- **Inloggning:** Supabase Auth med Discord som provider. Medlemmen kopplas via `discord_id`, och `user_id` fylls i vid
  första inloggningen (edge function).
- **Discord är källan för ledningsrollerna.** `guild_roles` skrivs bara av en Discord-synk (bot eller edge function med
  service role). Ingen kan ge sig själv mer behörighet på sidan.
- **Sidan/databasen är källan för raidorganisationen** (grupper, Raid Master, funktioner). Sex funktioner gånger N grupper
  som Discord-roller skulle bli hundratals roller.
- **Boten speglar ut** enkla Discord-roller från sidan, till exempel "Raid Master" och "Grupp: Spiselgänget", så att
  ingen behöver uppdatera på två ställen.
- **RLS gör jobbet:** `is_guild_lead()`, `is_raid_master(group_id)` och en trigger som stoppar Raid Masters från att
  ändra storlek eller status och som sätter `updated_by`/`updated_at`.
- Byte i koden: bara funktionerna i `data.js` byts mot `supabase.from(...)`, och `me` kommer från sessionen
  i stället för demo-väljaren.

## Discord-boten (plan, inte byggd)

En enda bot för allt som rör Discord. Den kräver backend: bot-token är hemlig och får aldrig ligga på den statiska sidan,
så allt går via Supabase (edge functions med service role).

**Vad boten gör**
1. **Synkar ledningsrollerna** från Discord till `members.guild_roles` (GM/GL). Ingen kan ge sig själv behörighet på sidan.
2. **Speglar ut** enkla roller från sidan till Discord, t.ex. "Raid Master" och "Grupp: Spiselgänget".
3. **Online-status:** skriver `members.online`/`last_seen` från Discords presence (gröna/grå pricken vid namnen).
4. **Publicerar assignment-bilden** direkt i Discord, så att det inte blir kopiera/klistra in (se nedan).
5. Senare: slash-kommandon som skriver till samma databas, t.ex. `/raid assign loot @person`.

**Publicera assignments** (knappen *Skicka till Discord* i bilddialogen, bredvid *Kopiera bild*)
- Sidan ritar bilden som i dag (`boardImage.js`) och skickar PNG + raid/grupp + inloggningen till edge function
  `supabase/functions/post-assignments`.
- Funktionen kontrollerar behörigheten med samma regel som RLS (`can_edit_board(group_id)`) och postar via boten.
- **Kanalupplägg (ledningens text 2026-10-12):** forumkanaler för 10-, 20- och 40-mannaraids, där **varje grupp har en egen
  tråd** med information, diskussioner och signups. Grupperna har inga egna kanaler. Boten postar i gruppens tråd; tråden
  anges som länk i gruppens formulär (`links.thread`, "Gruppens tråd på Discord"), och tråd-id:t tas ur länken.
- **Boten uppdaterar sitt förra inlägg** för samma raid i stället för att posta nytt: alltid exakt en aktuell bild per raid.
  Kräver en tabell som minns meddelandet, t.ex. `discord_posts (group_id, raid_id, channel_id, thread_id, message_id, posted_at)`.
- **Valfri ping** av de som står på tavlan: Raid-Helper-exporten har allas Discord-id (`userId`). Spara det i compen vid import
  (görs inte i dag) så kan boten nämna exakt rätt personer.

**Vad som behövs för att bygga det**
- Discord-applikation med bot, inbjuden till servern (behörigheter: läsa medlemmar och roller, presence, skicka meddelanden,
  skapa trådar, bifoga filer, hantera roller för speglingen).
- Supabase-projekt med Discord som inloggning och bot-token som hemlighet för edge functions.
- Funktionen och knappen kan skrivas i förväg men går inte att testa förrän boten och Supabase finns.

## Idéer och nästa steg

**Före Supabase (demon)**
- Hämta riktiga namn i stället för påhittade när guilden finns i spelet (WoW Forever EU-release 5 nov 2026).
- Varning när man lämnar redigeringen med osparade ändringar.
- Lägga till medlemmar i demon (med Supabase kommer de från Discord-inloggningen).

**Fas 2 – Supabase och Discord**
- Kör och testa `schema.sql`. Seeda roles/functions från `data/*.json`.
- Discord OAuth, koppla medlem ↔ konto, Discord-synk för GM/GL.
- Discord-boten: rollsynk, spegling, online-status och publicering av assignments (se *Discord-boten* ovan).
- Slash-kommandon i boten som skriver till samma databas, t.ex. `/raid assign loot @person`.
  Discord blir ett gränssnitt mot datan, inte en egen kopia.
- Koppla karaktärer till Discord-konton. Spelaren knyter själv sina karaktärer efter inloggningen, och de
  kontrolleras mot guildens roster när Forever-API:t finns (gav 403 senast vi kollade 2026-10-04).
- Historik/ändringslogg per grupp (vem ändrade vad), utöver "senast ändrad av".

**Fas 3 – raidverksamheten**
- **Raidtillfällen** (inbokade kvällar) per grupp: datum, signup, uttagen roster, softres-länk.
  Ledningen/Raid Master ska kunna ta bort tillfällen på samma sätt som grupper.
- ~~Assignments per grupp och boss~~ finns nu som tavla (se ovan). Vidare: koppla tavlan till ett raidtillfälle,
  hämta comp direkt från Raid-Helpers API i stället för att klistra in JSON, bilder per boss (lootwatch hade det).
- RaidHelper-signups, raidkalender, publicerade rosters, Soft Reserve, Warcraft Logs, statistik och progression.
- Signup, Soft Reserve och assignment-dokument som länkar togs bort 2026-10-12 (bara gruppens tråd finns kvar); de kan komma tillbaka som riktiga integrationer.

## Öppna frågor (ledningen beslutar – hårdkoda inte)

Från briefen:
- Hur Raid Masters utses och ersätts.
- Vem som får skapa nya raidgrupper (just nu: ledningen).
- Hur ambitionsnivåer definieras (just nu förslaget 1–5 ovan).
- Prioriteringsregler för rosteruttagning.
- Konflikter mellan raidgrupper.
- Regler för Soft Reserve och loot.
- Behörigheter för att administrera sidan (förslaget ovan gäller tills vidare).
- Hur grupper och medlemsprofiler kopplas till resten av hemmet.wtf.

Uppkomna under arbetet:
- Får en Raid Master själv lämna över gruppen till någon annan, eller alltid via ledningen? (Just nu: via ledningen.)
- Ska sidan vara öppen för alla eller kräva Discord-inloggning för att läsa? (Schemat tillåter just nu läsning utan inloggning.)
- Discord: ska boten få pinga spelarna när den postar assignments? Ska den skapa gruppens forumtråd själv när en grupp skapas?

## Formspråk och ton

Samma regler som leveling-sidan. Se README.md i `C:\JOBB\Wow Forever\Hemmet - Levelingresa` under "Formspråket".
Tillägg för ledningssidan (beslut 2026-10-12):
- **Spelets Group Finder-panel** (`assets/lfg-panel.webp`: äventyrarna på klippan, svart kant, tunn guldlinje, mörk rubriklist,
  listrader) är stilen för raidgrupper och organisation: raidgruppskorten, gruppens sida, nivåpanelerna och hierarkin på startsidan.
- **Pergament = utmärkelser och guildens stadgar.** De sex uppgifterna på startsidan är "Raid Masterns stadgar" ("Det här ska
  alltid bli gjort i varje raidgrupp"); samma romerska siffror I–VI används på Roller & ansvar: ljust pergament
  (`assets/parchment.webp`, den blekare nedre halvan för läsbarheten) med mörkt bläck direkt på pergamentet, romerska
  siffror och tunna bläcklinjer mellan punkterna. Inga lappar eller kort ovanpå: det ska se ut som ett dokument.
  Raidgrupper är inte utmärkelser och får inte pergament.
- Namn utan kapslar: klassfärg + online-prick (grön/grå).
- Cinzel för rubriker, Marcellus för etiketter och namn (aldrig siffror, använd `NUM()` / `.n`), Open Sans för brödtext.
- **Blått = det man gör** (knappar, val), **guld = det man uppnår** samt små rubriker och rubrikens bärande ord.
  Klassfärger bara på namn. Inget grönt.
- Ton: vuxen, avslappnad, lätt självironisk, "vi". Hemmet-metaforen: "Ordning i hemmet", "Vem håller i nycklarna?",
  "Ett hus, flera rum", "Låst dörr – Här behövs nycklar". Undvik corporate-språk och överdriven fantasy.
- Sidan pratar med guilden. Ingen teknik i sektionerna.

## Arbetssätt

- Svenska i texter och kommentarer.
- Verifiera i webbläsaren efter ändringar. Webbläsarpanelen ritar ibland inte efter scroll; dölj det ovanför med JS för att ta skärmdump.
- Redigera aldrig direkt i `hemmet_prerelease` (publiceras via leveling-projektets skript).
