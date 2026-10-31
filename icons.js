// Gränssnittsikoner från Lucide (lucide.dev, ISC-licens). Kopiera in den ikon som behövs här, så slipper sidan ett bibliotek och ett byggsteg.
// Spelets egna ikoner (rollerna i assets/lfg-roles.webp) behålls: de betyder något i spelet.
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
};

export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
