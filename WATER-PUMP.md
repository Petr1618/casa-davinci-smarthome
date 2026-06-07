# Well Pump Control — Studna → Jímka 💧

Automatické dávkovací čerpání vody z **vrtané studny** do **jímky**, ovládané
přes **Shelly Plus 1** a integrované do Casa DaVinci dashboardu přes MQTT.

> **Princip:** vrt má omezenou vydatnost, proto se čerpá **dávkově** — krátký
> běh, pak pauza na zotavení hladiny. Konfigurace: **1 minuta každou hodinu**.

---

## Hardware

| Komponenta | Údaj |
|---|---|
| **Čerpadlo** | ponorné, **1,5 kW / 230 V**, ~**60 l/min** (≈ 60 l / cyklus, ~1440 l/den) |
| **Studna** | vrtaná (úzký vrt — plovák nelze, dry-run se řeší jinak, viz níže) |
| **Spínací relé** | **Shelly Plus 1** (SNSW-001X16EU), FW 1.7.x, MAC `78:EE:4C:CF:81:30` |
| **Stykač** | **IDEAL KMC 20-20** (20 A, 2× NO, cívka 230 V AC) — instalační, póly **paralelně** |
| **Motorová ochrana** | MPCB (motorový jistič) ~9–14 A *(plán — nastavit na naměřený proud)* |
| **Síť** | Shelly na WiFi „Petr's Wi-Fi", DHCP IP `192.168.1.237` *(doporučeno rezervovat)* |

> ⚠️ **Shelly byl původně spínač garážových vrat** (1 s pulz). Přesunut do rozvaděče
> u čerpadla a překonfigurován. Viz schémata v `schema/`.

### Proč stykač a ne přímo Shelly relé
Ponorné čerpadlo je induktivní zátěž s vysokým rozběhovým proudem (40–70 A). Shelly
spíná jen **cívku stykače** (malý proud, galvanicky oddělený silnoproud). Hlavní důvody:
ochrana kontaktů Shelly, **fail-safe** (bezpečnostní řetězec do série s cívkou),
motorová ochrana. Detail viz `schema/pump-panel-schema.svg`.

### Zapojení (zkráceně)
```
Ovládání:  L → Shelly[I] → relé → [O] → (dry-run můstek) → cívka A1 ;  A2 → N(trvalý)
Silnoproud: L → MPCB → KMC póly 1+3 (vstup paralelně) → 2+4 (výstup) → čerpadlo L
            N a PE → na čerpadlo přímo
```
- Schémata: `schema/pump-panel-schema.svg` (kompletní skříň, otevři v [draw.io](https://app.diagrams.net)),
  `schema/shelly-stykac.mmd` (jen Shelly + stykač, [mermaid.live](https://mermaid.live)).

---

## Shelly konfigurace

| Nastavení | Hodnota | Proč |
|---|---|---|
| **Switch in_mode** | `detached` | fyzický vstup neovládá relé (SW volný pro budoucí stav „běží") |
| **auto_off** | `true`, **60 s** | tvrdý strop běhu — **jediná pojistka proti suchoběhu**, dokud není dry-run relé |
| **auto_on** | `false` | |
| **initial_state** | `off` | po výpadku se čerpadlo samo nespustí |
| **Schedule (job 1)** | `0 0 * * * *` → `Switch.Set on:true` | spustí v :00 každou hodinu; auto-off po 60 s vypne |
| **MQTT** | broker `192.168.1.210:1883`, prefix `casa/pump`, `status_ntf` on | publikuje stav, přijímá povely |

### MQTT topiky
| Topic | Směr | Obsah |
|---|---|---|
| `casa/pump/online` | ← Shelly | `"true"` / `"false"` |
| `casa/pump/status/switch:0` | ← Shelly | `{"output":bool,"temperature":{tC},"timer_started_at","timer_duration",...}` |
| `casa/pump/command/switch:0` | → Shelly | `"on"` / `"off"` / `"toggle"` |
| `casa/pump/rpc` | → Shelly | JSON-RPC (server primuje počáteční stav) |
| `casa/pump/server/reply/rpc` | ← Shelly | odpověď na RPC (Shelly přidává `/rpc` k `src`) |

> Broker je **vestavěný v Cerbo GX** (192.168.1.210) a přijímá i ne-Victron topiky —
> ověřeno round-tripem. Shelly i `server.js` jsou na stejné síti 192.168.1.x.

---

## Backend integrace (`backend/server.js`)

- Sekce **`PUMP`** + `latestData.pump` = `{ online, on, temperature, source, offAt, scheduleMinute, scheduleEnabled, lastUpdate }`.
- `cerboClient.subscribe('casa/pump/#')`, parsování v **`handlePumpMessage()`**:
  - `online` → stav připojení,
  - `status/switch:0` a RPC reply → stav relé, teplota, a z `timer_started_at + timer_duration` se počítá **`offAt`** (kdy auto-off vypne; Shelly i Pi jsou NTP, takže epoch sedí).
- **`setPump(on)`** publikuje `casa/pump/command/switch:0`.
- **`primePumpStatus()`** pošle RPC `Switch.GetStatus` (read-only) pro počáteční stav — volá se po připojení a při každém otevření dashboardu.
- Socket: emituje **`pump-status`**, přijímá **`pump-control`** `{on}`.
- REST API: `GET /api/pump`, `GET /api/pump/on`, `GET /api/pump/off`.

---

## Dashboard (`frontend/index.html`)

Dlaždice **„💧 Čerpadlo"** v záložce **Service**:
- stav **BĚŽÍ / STOJÍ**, Online indikátor, teplota Shelly,
- tlačítka **Zapnout / Vypnout** (přes socket `pump-control`),
- **odpočty** (živý 1 s tik):
  - `⏱ Vypne za MM:SS` — když běží (z `offAt`),
  - `↻ Příští spuštění v HH:00 (za MM:SS)` — z `scheduleMinute`.

---

## Bezpečnost

- ⚠️ **Auto-OFF 60 s = jediná aktuální ochrana proti suchoběhu.** Vrtaná studna nemá plovák.
- 🔜 **Var. 1 (doplnit):** **podproudové (undercurrent) dry-run relé** do série s cívkou
  stykače — když proud čerpadla klesne (sání vzduchu = slábnoucí přítok), rozpojí cívku
  **nezávisle na Shelly i WiFi**. Plus **CT měření** příkonu → trend přítoku v dashboardu.
  V rozvaděči je na to nechané rozpojitelné místo v cívkovém obvodu + rezerva DIN.
- Silnoproud, MPCB nastavení a uzemnění = práce pro elektrikáře.

---

## TODO / další kroky

- [ ] **MPCB** osadit a nastavit na naměřený provozní proud čerpadla.
- [ ] **Dry-run ochrana (Var. 1)** — podproudové relé + CT (skutečná ochrana proti suchoběhu).
- [ ] **Aux 13-14 stykače → Shelly `SW`** = zpětná vazba „čerpadlo reálně běží".
- [ ] **Rezervovat statickou IP** Shelly na routeru + **nastavit heslo** na Shelly.
- [ ] **WiFi signál** — v novém místě ~−80 dBm (slabé); doladit polohu / opakovač (cíl ≤ −75).
- [ ] **Automatika z FVE** — spouštět z přebytku soláru (zatím jen časový plán).

---

## Diagnostika

```bash
# stav z běžícího serveru
curl http://casa-davinci.local:3000/api/pump

# přímo Shelly (HTTP RPC)
curl http://192.168.1.237/rpc/Switch.GetStatus?id=0
curl http://192.168.1.237/rpc/Schedule.List

# sledovat MQTT provoz Shelly
mosquitto_sub -h 192.168.1.210 -t "casa/pump/#" -v

# ruční povel přes broker (POZOR: sepne stykač / čerpadlo!)
mosquitto_pub -h 192.168.1.210 -t "casa/pump/command/switch:0" -m "on"
```
