# Casa DaVinci — Design Document: Whole‑Home App (v2)

**Status:** Draft k review · **Datum:** 2026‑06‑08 · **Autor:** Petr Kukla + Claude

---

## 1. Vize

Posunout Casa DaVinci z **monitoru energie** na **centrum pro monitoring a ovládání celého domu**, organizované podle **oblastí domu** (ne podle techniky). Aplikace „resident‑first" — použitelná na **tabletu na zdi**, **mobilu** i **desktopu**, lokálně i vzdáleně (Hetzner).

> Vodítko: obyvatel domu hledá „zahradu" a „pokoj", ne „solarcharger/278". Technika je implementační detail, ne navigace.

## 2. Cíle a ne‑cíle

**Cíle**
- Navigace podle **oblastí** (hlavní menu → pod‑sekce).
- **Monitoring i ovládání** s konzistentním vzorem (karta = stav + akce).
- **Škálovatelný model zařízení** (přidat zařízení = konfigurace, ne kód).
- **Zachovat autonomii** zařízení (Shelly/Victron jedou i bez Raspberry Pi).
- Jednotná **vizuální řeč** (industriální dark + témata), oblastní akcenty a „scénické" grafiky.

**Ne‑cíle (zatím)**
- Plný automatizační engine (scény, Node‑RED), hlasové ovládání, multi‑uživatelské role. → budoucí fáze.

## 3. Současný stav (baseline)

- SPA energetický dashboard; taby **Overview / Solar / Inverter / Battery / Service**.
- Silný **energy‑flow** diagram. Čerpadlo schované v „Service". Senzor obýváku je sirotek.
- **Monolit** `frontend/index.html` (~8 500 řádků), zařízení **natvrdo** (topiky 278/279, `living_room`), stav = socket události + globální proměnné.
- Backend: Node + Socket.io + MQTT (broker na Cerbu) + InfluxDB; Hetzner Grafana přes WireGuard; Shelly čerpadlo; MQTT watchdog.

## 4. Informační architektura (IA)

**Hlavní menu = oblasti** (levý panel na PC / spodní lišta na tabletu a mobilu):

| # | Oblast | Ikona | Účel | Z dnešního obsahu |
|---|---|---|---|---|
| 1 | **Domů** | 🏠 | Cross‑domain přehled + alarmy + rychlé akce | (nové) |
| 2 | **Elektrárna** | ⚡ | Energie v reálném čase: flow, solár, měnič, baterie, síť, BMS | Overview/Solar/Inverter/Battery + BMS |
| 3 | **Energie & Historie** | 📊 | Trendy, denní/měsíční/roční, soběstačnost, předpověď, reporty | Python analytics, InfluxDB/Grafana |
| 4 | **Dům** | 🏡 | Pokoje & klima (ESP32), výhledově světla/topení/žaluzie, půdorys | Living‑room senzor |
| 5 | **Zahrada** | 🌿 | Čerpadlo (studna→jímka), zavlažování, venkovní čidla, bazén | Čerpadlo (dnes v Service) |
| 6 | **Garáž** | 🚗 | Vrata, nabíjení EV, přítomnost auta | vrata hotová (Shelly 1 Gen3, impuls) |
| 7 | **Zabezpečení** | 🔒 | Kamery, čidla dveří/oken, alarm, přítomnost | (připraveno) |
| 8 | **Systém** | 🔧 | Diagnostika, watchdog, stav VPN/Hetzner, logy, nastavení, registr zařízení | Service (diagnostika), watchdog |

**Navigační model**
- **App shell**: trvalé hlavní menu + obsahová plocha + horní status lišta (připojení, počet alarmů, čas).
- **Hash router**: `#/zahrada/cerpadlo` → odkazovatelné, funguje zpět/vpřed.
- **Drobečky** (breadcrumb) + titulek oblasti.
- Oblasti se „připraveno" stavem (Garáž, Zabezpečení) ukazují **placeholder s plánem**, ne prázdno.

## 5. Rozpad oblastí (MVP vs. budoucí)

- **Domů** — karty: Energie teď (mini‑flow), Klima domu, Stav jímky/zahrady, Aktivní alarmy, Rychlé akce. Proklik do oblastí.
- **Elektrárna** — dnešní real‑time dashboard (flow + karty Solar/Grid/Home/Battery + BMS diagnostika).
- **Energie & Historie** — grafy den/týden/měsíc/rok, soběstačnost/self‑consumption, **předpověď výroby** (`predict_solar_yield`), **reporty** (`export_report`), **zdraví baterie** (`analyze_battery_health`).
- **Dům** — dlaždice pokojů (teplota/vlhkost z ESP32), výhledově půdorys s živými hodnotami; ovládání světel/topení (až přijdou zařízení).
- **Zahrada** — **vodní flow scéna čerpadla** (viz §6), nastavení automatiky (hotové), výhledově zavlažovací zóny, venkovní teplota, bazén.
- **Garáž** — vrata hotová (Shelly 1 Gen3, impuls 1 s, `GARAGE-DOOR.md`); zbývá čidlo polohy, EV nabíjení, detekce auta.
- **Zabezpečení** — placeholder: kamery, dveřní/okenní čidla, režim „doma/pryč", alarm log.
- **Systém** — watchdog stav, MQTT/Cerbo zdraví, VPN/Hetzner, logy, **registr zařízení/pokojů** (editace), zálohy.

## 6. Signature experiences (scénické pohledy)

- **Energy flow** (existuje) → přesun do *Elektrárna*.
- **Water flow** (*Zahrada/čerpadlo*) — **nové**: animované SVG **vrt → ponorné čerpadlo → potrubí → jímka**, s tekoucími kapkami při běhu, **hladinou jímky**, stavem, odpočtem a ovládáním. Modro‑zelený akcent. Stejná DNA jako energy‑flow, ale pro vodu.
- **Floorplan** (*Dům*) — budoucí: půdorys s živými teplotami/stavy.

## 7. Vizuální jazyk

- Základ: **industriální dark** + témata (dark / light / spacex) — zachovat.
- **Oblastní akcent**: Elektrárna oranžová/žlutá, Zahrada zeleno‑modrá, Dům modrá, Zabezpečení červená/jantar.
- **Scénické grafiky** per oblast (flow, water, floorplan).
- **Typografie**: ponechat stávající; popisky uppercase + letter‑spacing (industriální).
- **Motion**: flow animace, staggered reveal při vstupu do oblasti, **střídmé** micro‑interakce. Dotykové cíle ≥ 40 px.

## 8. Technická architektura

**Frontend**
- **App shell + hash router + moduly oblastí.** Z monolitu **inkrementálně** vyčleňovat (žádný velký přepis najednou).
- **Malý state store** (pub/sub): `socket → store → pohledy`. Konec globálních proměnných + přímého DOM.
- **Konvence komponent**: karta (stav + akce), sekce (nadpis + oddělovač), scéna (SVG + data).
- **ROZHODNUTO (2026‑06‑08): React + Vite.** Stack v2 frontendu je **React + Vite** (`frontend-v2/`). React běží v prohlížeči; Vite generuje statický build, který servíruje **stávající backend beze změny**. Migrace inkrementální — oblast po oblasti; starý `index.html` jede, dokud není port hotový.

**Model zařízení/pokojů (data‑driven)** — viz §9. UI se renderuje z konfigurace.

**Backend**
- **Abstrakce zařízení**: adaptery (Victron MQTT, Shelly, ESP32) za **jednotným rozhraním** `status` / `command`.
- Nové API: `GET /api/areas`, `GET /api/devices`, `POST /api/devices/:id/command`.
- **Zachovat autonomii**: ovládací logika (plány, auto‑off) zůstává v zařízeních.
- **Centrum alarmů**: jednotný model (zdroj, závažnost, oblast); watchdog se do něj zapojí.

**Tok dat**
```
zařízení (Victron/Shelly/ESP32) → MQTT (Cerbo broker) → Pi adaptery → store
                                                                  ├→ Socket.io → frontend
                                                                  └→ InfluxDB → Historie/Hetzner
ovládání: frontend → Socket/API → adapter → zařízení
```

## 9. Datový model — registr (návrh)

```jsonc
// areas.json — definice oblastí a jejich sekcí
{
  "areas": [
    { "id": "zahrada", "name": "Zahrada", "icon": "🌿", "accent": "#3bd6c6",
      "sections": [{ "id": "cerpadlo", "name": "Čerpadlo", "view": "water-flow" }] }
  ]
}

// devices.json — zařízení a jejich schopnosti (capabilities)
{
  "devices": [
    {
      "id": "well-pump", "area": "zahrada", "room": null,
      "type": "switch", "protocol": "shelly-mqtt",
      "name": "Čerpadlo studna→jímka", "host": "192.168.1.237",
      "topics": { "status": "casa/pump/status/switch:0",
                  "command": "casa/pump/command/switch:0",
                  "online": "casa/pump/online" },
      "capabilities": ["on_off", "schedule", "run_duration", "auto_off"]
    },
    {
      "id": "living-room", "area": "dum", "room": "obyvak",
      "type": "climate", "protocol": "esp32-mqtt",
      "name": "Obývák", "topics": { "status": "home/living_room/sensor" },
      "capabilities": ["temperature", "humidity"]
    }
  ]
}
```
Přidání zařízení/pokoje = **záznam v registru**, ne změna kódu. Natvrdo zadrátované topiky (278/279, `living_room`) se sem postupně zmigrují.

## 10. Fázový plán (nízké riziko, inkrementálně)

| Fáze | Obsah | Riziko | Výstup |
|---|---|---|---|
| **1** | App shell + hlavní menu (8 oblastí), přesun dnešních tabů pod *Elektrárna*, čerpadlo do *Zahrada* + **prototyp vodního flow** | nízké (přeskupení) | navigace naživo |
| **2** | Landing **Domů** (cross‑domain souhrn) | nízké | přehledová stránka |
| **3** | **Registr zařízení/pokojů** + migrace natvrdo zadrátovaných | střední | data‑driven UI |
| **4** | **Dům** (pokoje/klima) + **Energie & Historie** (grafy, předpověď, reporty) | střední | dvě oblasti |
| **5** | **Garáž**, **Zabezpečení** — jak přibývají zařízení | nízké | placeholdery → funkční |
| **6** | Modularizace frontendu / případně framework | střední | udržitelnost |

## 11. Rizika & rozhodnutí

- **Refactor monolitu** → vždy inkrementálně, žádný big‑bang; každá fáze samostatně nasaditelná a vratná.
- **Vanilla vs. framework** → ✅ rozhodnuto: **React + Vite** (viz §8). Backend beze změny, Pi jen servíruje build.
- **Rozdělaná theme práce** v `index.html` → koordinovat, aby se nepřepsala.
- **Aspirační oblasti** (Garáž, Zabezpečení) → „připraveno" placeholdery, ať není prázdno matoucí.
- **Bezpečnost ovládání** → na dálku (Hetzner) musí mít ovládání **auth**; kritické akce potvrzení. (Navazuje na MIGRATION‑PLAN §7.)

## 12. Kritéria úspěchu

- Obyvatel najde libovolný pokoj/zařízení **do 2 kliků**.
- **Přidat zařízení = jen konfigurace.**
- **Zahrada s vodním flow** = ozdoba aplikace.
- **Žádná regrese** v energetickém monitoringu.
- Funguje na **tabletu / mobilu / desktopu**.

---

*Tento dokument je živý — po schválení Fáze 1 se aktualizuje podle reality.*
