-- /verify på Discord. Satt = namnet är godkänt utan kontroll, eftersom Blizzards guildlista inte gick att läsa.
-- Boten kontrollerar det i efterhand och tömmer fältet. Bara boten (service role) ser och skriver kolumnen.
alter table members add column verify_pending_since timestamptz;
