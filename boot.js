// Rätt sida och meny direkt, innan modulerna är laddade: de väntar på Supabase från nätet och sedan på databasen.
// Vanligt skript i slutet av body, så att det körs före första bilden. Fil, inte inline: sidans CSP stoppar inline-skript.
(() => {
  const h = location.hash;
  const group = /^#(grupp|ny-grupp)/.test(h);
  const page = h.startsWith("#roller") ? "roller" : h.startsWith("#raidgrupper") ? "raidgrupper" : "start";
  document.querySelectorAll("main.page").forEach(el => { el.hidden = group || el.dataset.page !== page; });
  document.getElementById("groupPage").hidden = !group;
  document.body.classList.toggle("has-hero", !group);   // gruppens egna sidor har ingen bild
  document.getElementById("topbar").classList.toggle("at-top", !group);
  document.querySelector(`[data-nav="${group ? "raidgrupper" : page}"]`)?.setAttribute("aria-current", "page");
})();
