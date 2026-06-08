// Single source of truth for the 8 home AREAS.
// Both the desktop sidebar and the mobile bottom-bar render from this array,
// and the router maps each id to a route. Adding/renaming an area = edit here.
//
// `accent` is the area's signature colour (used for the active nav indicator
// and area headers). `comingSoon` areas render the shared placeholder.
export const AREAS = [
  { id: 'domov',       label: 'Domů',               icon: '🏠', accent: 'var(--accent-color)', comingSoon: true,
    blurb: 'Souhrn celého domu — energie, klima, zahrada a aktivní alarmy na jednom místě.' },
  { id: 'elektrarna',  label: 'Elektrárna',         icon: '⚡', accent: '#f5c542', comingSoon: true,
    blurb: 'Energie v reálném čase: solární výroba, baterie, síť, měnič a BMS. (Portuje se z původního dashboardu.)' },
  { id: 'energie',     label: 'Energie & Historie', icon: '📊', accent: '#a855f7', comingSoon: true,
    blurb: 'Trendy a historie: den/týden/měsíc/rok, soběstačnost, předpověď výroby a reporty.' },
  { id: 'dum',         label: 'Dům',                icon: '🏡', accent: '#3b9eff', comingSoon: true,
    blurb: 'Pokoje a klima — teplota a vlhkost z čidel, výhledově světla, topení a žaluzie.' },
  { id: 'zahrada',     label: 'Zahrada',            icon: '🌿', accent: '#3bd6c6', comingSoon: false,
    blurb: 'Čerpadlo studna → jímka, zavlažování a venkovní čidla.' },
  { id: 'garaz',       label: 'Garáž',              icon: '🚗', accent: '#9aa0a6', comingSoon: true,
    blurb: 'Vrata, nabíjení elektromobilu a detekce přítomnosti auta.' },
  { id: 'zabezpeceni', label: 'Zabezpečení',        icon: '🔒', accent: '#ff4444', comingSoon: true,
    blurb: 'Kamery, čidla dveří a oken, režim doma/pryč a záznam alarmů.' },
  { id: 'system',      label: 'Systém',             icon: '🔧', accent: '#00b4d8', comingSoon: true,
    blurb: 'Diagnostika, MQTT watchdog, stav VPN/Hetzner, logy, registr zařízení a nastavení.' }
];

export const DEFAULT_AREA = 'domov';
export const areaById = (id) => AREAS.find((a) => a.id === id);
