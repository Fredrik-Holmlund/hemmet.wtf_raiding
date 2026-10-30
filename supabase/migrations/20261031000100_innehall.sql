-- Innehållet som hör till sidan: rollerna, de sex funktionerna och ambitionsnivåerna.
-- Texterna kommer från produktbriefen och ledningens utkast. Ändras senare med en ny migration eller av ledningen i databasen.

insert into roles (id, level, name, short, description, responsibilities, mandate) values
  ('guild_master', 1, 'Guild Master', 'Övergripande ansvar för HEMMET, dess vision och långsiktiga utveckling.', 'Guild Master har det yttersta ansvaret för HEMMET som organisation. Rollen handlar om att sätta riktningen, bygga en fungerande ledningsstruktur och skapa rätt förutsättningar för guildens medlemmar och ledare.

När frågor inte kan lösas på andra nivåer är det Guild Master som har det slutgiltiga mandatet.', array['Vision och långsiktig riktning', 'Guildens organisation och ledningsstruktur', 'Slutgiltiga beslut i guildövergripande frågor']::text[], 'Sista ordet i guildövergripande frågor.'),
  ('guild_leader', 1, 'Guild Leader', 'Strategi, kultur, utveckling och samordning.', 'Guild Leaders ansvarar för att utveckla HEMMET som helhet. De arbetar med organisation, rekrytering, guildkultur, gemensamma riktlinjer och långsiktig planering.

En viktig del av rollen är att stötta Raid Masters, samordna frågor mellan raidgrupper och se till att guilden fungerar som ett gemensamt community.', array['Organisation och ledarskapsutveckling', 'Rekrytering och communityutveckling', 'Kultur och gemensamma riktlinjer', 'Playbooks och policies', 'Samordning mellan raidgrupper', 'Stöd till Raid Masters', 'Frågor som inte kan lösas inom en enskild raidgrupp']::text[], 'Skapar förutsättningarna och tar emot frågor som lyfts från raidgrupperna. Detaljstyr inte enskilda raider.'),
  ('raid_master', 2, 'Raid Master', 'Helhetsansvar för en raidgrupp.', 'Raid Master ansvarar för sin raidgrupp och ser till att planering, bemanning, lootadministration, förberedelser och genomförande fungerar.

Rollen omfattar även att utse Raid Leader och vara första kontaktperson vid frågor eller synpunkter som rör gruppen.

Raid Master behöver inte utföra varje uppgift själv, men ansvarar alltid för att arbetet blir gjort.', array['De sex obligatoriska funktionerna i gruppen', 'Att utse Raid Leader', 'Första kontaktperson för gruppen']::text[], 'Bestämmer över bemanning, uttagning och delegering i sin grupp, inom guildens playbook. Det som inte går att lösa i gruppen lyfts till Guild Leaders.'),
  ('raid_leader', 3, 'Raid Leader', 'Taktisk ledning, koordinering och beslut under raiden.', 'Raid Leader håller taktpinnen under själva raiden. Rollen ansvarar för taktik, calls, tempo, pulls och att gruppen arbetar mot gemensamma mål.

Flera spelare kan bidra med information och taktiska calls, men en utsedd Raid Leader har sista ordet när ett beslut behöver fattas.

Raid Master kan även själv vara Raid Leader.', array['Taktik och calls', 'Tempo och pulls', 'Beslut under raiden']::text[], 'Sista ordet i calls under raiden.'),
  ('raid_admin', 3, 'Raid Admin', 'Operativt stöd och administration för raidgruppen.', 'Raid Admin hjälper till med en eller flera praktiska funktioner runt raiden. Det kan handla om att skapa signups, administrera roster, hantera loot eller uppdatera assignment-dokument.

Rollen är flexibel och behöver inte finnas i varje raidgrupp.

Raid Master avgör hur arbetet fördelas och behåller alltid helhetsansvaret.', array['De funktioner Raid Master har delegerat']::text[], 'Det som Raid Master har lämnat över. Helhetsansvaret stannar hos Raid Master.');

insert into functions (id, sort, name, short_name, purpose, summary, description, deadline, tools, holder_title) values
  ('signups', 1, 'Raid Signups', 'Signups', 'Planera och publicera raidens signup.', 'Publiceras via RaidHelper, normalt 6-7 dagar före återkommande raids.', 'Säkerställa att signup skapas och publiceras i Discord med RaidHelper-botten.', '6-7 dagar före raidstart, för återkommande raidgrupper när det är tillämpligt.', array['Discord', 'RaidHelper']::text[], null),
  ('roster', 2, 'Roster & uttagning', 'Roster', 'Välja, fastställa och kommunicera raidens deltagare.', 'Uttagning enligt guildens riktlinjer och gruppens ambitionsnivå. Rostern kommuniceras senast 24 timmar före raidstart och uttagna spelare taggas i Discord.', 'Raidens roster tas ut, fastställs och kommuniceras. Samtliga uttagna spelare taggas i Discord.

Vid uttagning följs guildens gemensamma riktlinjer och playbook, med hänsyn till raidgruppens ambitionsnivå och gällande prioriteringsprinciper. Detaljerade uttagningsregler kommer separat.', 'Senast 24 timmar före raidstart, gärna tidigare.', array['Discord']::text[], null),
  ('loot', 3, 'Loot Management', 'Loot', 'Förbereda och administrera lootfördelning.', 'Soft Reserve via softres.it och lootadministration med Gargul.', 'En Soft Reserve-länk skapas via softres.it och delas med deltagarna inför raiden. Loot hanteras och fördelas enligt raidens gällande regler med stöd av Gargul.

Hanteringen ska vara tydlig, konsekvent och transparent.', 'Soft Reserve delas inför raiden.', array['softres.it', 'Gargul']::text[], null),
  ('assignments', 4, 'Assignments & taktik', 'Assignments', 'Säkerställa att deltagarna är förberedda på sina uppgifter.', 'Boss-assignments hålls uppdaterade under Assignments på gruppens sida och delas i förväg vid behov.', 'Raidens assignments hålls uppdaterade under fliken Assignments på gruppens sida här, och delas med deltagarna i god tid före raidstart när det behövs. Därifrån går de också att skicka till Discord som bild.

Syftet är att varje spelare ska kunna förbereda sig och förstå sina uppgifter under respektive bossfight.', 'I god tid före raidstart.', array['Assignments på gruppens sida']::text[], null),
  ('leadership', 5, 'Raid Leadership', 'Raid Leadership', 'Säkerställa en tydlig taktisk ledning.', 'En utsedd Raid Leader leder raiden och har sista ordet i taktiska beslut när det behövs.', 'Raid Master utser en Raid Leader som ansvarar för den taktiska ledningen under raiden, inklusive koordinering, calls och beslut. Raid Master kan själv axla rollen.

Flera personer kan bidra med calls, men det ska alltid finnas en tydligt utsedd Raid Leader som har sista ordet när ett beslut behöver fattas.', 'Utsedd innan raiden startar.', '{}'::text[], 'Raid Leader'),
  ('feedback', 6, 'Feedback & konflikthantering', 'Feedback', 'Vara kontaktperson för raidrelaterade frågor.', 'Raid Master är första kontaktperson vid frågor, synpunkter eller missnöje kring den egna raidgruppen.', 'Den naturliga kontaktpersonen för frågor, synpunkter och klagomål kopplade till raidgruppen, till exempel uttagningar, lootbeslut eller hur en raid genomförts.

Raid Master förväntas lyssna, kunna motivera beslut och hantera frågor sakligt och konstruktivt. Vid behov lyfts frågan vidare till Guild Leaders.', 'Löpande.', '{}'::text[], null);

insert into ambitions (level, rank, color, quality, name, tagline) values
  ('A', 3, '#ff8000', 'Legendary', 'Min-Max Raiding', 'För dig som vill optimera, prestera och jaga riktigt bra logs.'),
  ('B', 2, '#a335ee', 'Epic', 'Focused Raiding', 'Raida seriöst och effektivt, men med lite mer utrymme för flexibilitet.'),
  ('C', 1, '#0070dd', 'Rare', 'Chill Raiding', 'Ha kul, döda bossar och umgås utan alltför höga prestationskrav.');
