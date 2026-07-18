// Single source of truth for the 8 home AREAS.
// Both the desktop sidebar and the mobile bottom-bar render from this array,
// and the router maps each id to a route. Adding/renaming an area = edit here.
//
// `accent` / `accentSoft` are the area's signature colour (Precision palette —
// one accent per area, used for the active nav indicator, area headers and
// flow scenes). `comingSoon` areas render the shared placeholder.
export const AREAS = [
  { id: 'domov',       label: 'Domů',               accent: '#d9dee3', accentSoft: 'rgba(217,222,227,0.06)', comingSoon: true,
    blurb: 'Souhrn celého domu — energie, klima, zahrada a aktivní alarmy na jednom místě.' },
  { id: 'elektrarna',  label: 'Elektrárna',         accent: '#ffb547', accentSoft: 'rgba(255,181,71,0.07)', comingSoon: false,
    blurb: 'Energie v reálném čase: solární výroba, baterie, síť a spotřeba domu.' },
  { id: 'energie',     label: 'Energie & Historie', accent: '#b48ee0', accentSoft: 'rgba(180,142,224,0.07)', comingSoon: true,
    blurb: 'Trendy a historie: den/týden/měsíc/rok, soběstačnost, předpověď výroby a reporty.' },
  { id: 'dum',         label: 'Dům',                accent: '#6ea8e8', accentSoft: 'rgba(110,168,232,0.07)', comingSoon: true,
    blurb: 'Pokoje a klima — teplota a vlhkost z čidel, výhledově světla, topení a žaluzie.' },
  { id: 'zahrada',     label: 'Zahrada',            accent: '#3bd6c6', accentSoft: 'rgba(59,214,198,0.07)', comingSoon: false,
    blurb: 'Čerpadlo studna → jímka, zavlažování a venkovní čidla.' },
  { id: 'garaz',       label: 'Garáž',              accent: '#9aa0a6', accentSoft: 'rgba(154,160,166,0.06)', comingSoon: true,
    blurb: 'Vrata, nabíjení elektromobilu a detekce přítomnosti auta.' },
  { id: 'zabezpeceni', label: 'Zabezpečení',        accent: '#e07070', accentSoft: 'rgba(224,112,112,0.06)', comingSoon: true,
    blurb: 'Kamery, čidla dveří a oken, režim doma/pryč a záznam alarmů.' },
  { id: 'system',      label: 'Systém',             accent: '#8fb3d1', accentSoft: 'rgba(143,179,209,0.07)', comingSoon: true,
    blurb: 'Diagnostika, MQTT watchdog, stav VPN/Hetzner, logy, registr zařízení a nastavení.' }
];

export const DEFAULT_AREA = 'domov';
export const areaById = (id) => AREAS.find((a) => a.id === id);
