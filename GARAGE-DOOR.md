# Garážová vrata — Shelly 1 Gen3 🚗

Ovládání garážových vrat **impulsem** přes **Shelly 1 Gen3**, integrované do Casa DaVinci
dashboardu (v1 i v2) přes MQTT — stejný vzor jako čerpadlo studny (`WATER-PUMP.md`).

> **Princip:** pohon vrat má vstup „tlačítko“. Sepnutí relé Shelly na **1 s** = jedno
> stisknutí tlačítka → **otevřít · stop · zavřít** (stejně jako dálkový ovladač).
> Délka impulsu je uložená **v Shelly** (`auto_off = 1 s`), takže ztracená MQTT zpráva
> nikdy nenechá „tlačítko stisknuté“.

---

## Historie
- **Původně** vrata ovládal Shelly Plus 1 (`shellyplus1-78ee4ccf8130`, MAC `78:EE:4C:CF:81:30`).
  Ten byl v červnu 2026 přesunut do rozvaděče čerpadla (viz `WATER-PUMP.md`) — a v konfiguraci
  mu zůstalo jméno **„GarageDoor“** (mDNS `garagedoor.local` → 192.168.1.237 = čerpadlo!).
  **30. 8. 2026 přejmenován na „WellPump“**, aby nekolidoval s novým zařízením.
- **Nově** (srpen 2026): **Shelly 1 Gen3** pro vrata, AP `Shelly1G3-54320457E4C8`.

## Hardware

| Komponenta | Údaj |
|---|---|
| **Relé** | **Shelly 1 Gen3** (S3SW-001X16EU), ID `shelly1g3-54320457e4c8`, MAC `54:32:04:57:E4:C8`, FW **2.0.0** (30. 8. 2026 aktualizováno z 1.2.2) |
| **Zátěž** | vstup tlačítka pohonu vrat (bezpotenciálový kontakt — relé Shelly je „dry contact“) |
| **Vstup SW** | volný — **plán: magnetický kontakt** pro polohu vrat (otevřeno/zavřeno) |
| **Síť** | WiFi **CasaDaVinciStar** (−69 dBm), DHCP IP **`192.168.1.61`** *(doporučeno rezervovat na routeru)*; mDNS `shelly1g3-54320457e4c8.local` / `garagedoor.local` |

### Zapojení (zkráceně)
```
Napájení:  L, N → Shelly (L/N)          (Gen3 zvládne 110–240 V AC i 12/24 V DC podle modelu)
Tlačítko:  svorky pohonu „PB/tlačítko“ → Shelly I a O   (bezpotenciálově — na I NIC nepřivádět z L!)
Poloha:    magnetický kontakt → Shelly SW a L  (podle typu kontaktu NO/NC nastavit doorOpenWhenInputOn)
```
> Zkontroluj v manuálu pohonu, jestli vstup tlačítka snese „dry contact“ (drtivá většina ano).

---

## Shelly konfigurace

| Nastavení | Hodnota | Proč |
|---|---|---|
| **Jméno** | `GarageDoor` | mDNS `garagedoor.local`, přehledné v app |
| **Switch in_mode** | `detached` | fyzický vstup SW neovládá relé (rezervován pro čidlo polohy) |
| **auto_off** | `true`, **1 s** | impuls = stisk tlačítka; pojistka proti trvale sepnutému relé |
| **auto_on** | `false` | |
| **initial_state** | `off` | po výpadku napájení se vrata samy nehnou |
| **Input:0** | `type: switch`, „Poloha vrat“ | připraveno pro magnetický kontakt |
| **MQTT** | broker `192.168.1.210:1883`, prefix `casa/garage`, `status_ntf` + `rpc_ntf` on | publikuje stav, přijímá povely |

Vše nastaví skript **`scripts/garage-shelly-setup.sh`** (viz níže). Uvedeno do provozu **30. 8. 2026**
(WiFi přes Shelly app, pak `configure`; testovací impuls přes `/api/garage/pulse` ověřen — `output:true` → po 1 s `source:timer, output:false`).
> Pozn.: starý FW 1.2.2 odmítal `MQTT.SetConfig` s `"user":null` — skript ho proto neposílá.

### MQTT topiky (broker = Cerbo GX)
| Topic | Směr | Obsah |
|---|---|---|
| `casa/garage/online` | ← Shelly | `"true"` / `"false"` (retained LWT) |
| `casa/garage/status/switch:0` | ← Shelly | `{"output":bool,"temperature":{tC},...}` — `output` je `true` jen během impulsu |
| `casa/garage/status/input:0` | ← Shelly | `{"state":bool}` — stav vstupu SW (čidlo polohy) |
| `casa/garage/command/switch:0` | → Shelly | `"on"` (auto-off ho po 1 s pustí) |
| `casa/garage/rpc` | → Shelly | JSON-RPC (`Switch.GetStatus` id 1, `Input.GetStatus` id 2 — primování stavu) |
| `casa/garage/server/reply/rpc` | ← Shelly | odpovědi na RPC |

---

## Backend integrace (`backend/server.js`)

- Sekce **`GARAGE`** + `latestData.garage` = `{ online, relayOn, doorOpen, sensorPresent, temperature, lastPulseAt, lastUpdate }`.
- `cerboClient.subscribe('casa/garage/#')`, parsování v **`handleGarageMessage()`**.
- **`pulseGarage(origin)`** publikuje `"on"`; Shelly relé pustí po 1 s (auto-off), backend navíc
  pošle pojistné `"off"` po 1,5 s. Druhý klik během 1,5 s je odmítnut (`Impuls už běží`).
  Odmítne i při offline Shelly / nedostupném brokeru → `{ ok:false, error }`.
- **`primeGarageStatus()`** — read-only RPC při připojení, při otevření dashboardu a každých 30 s.
- **Čidlo polohy:** `GARAGE.doorSensor = false` → `doorOpen` zůstává `null` („bez čidla“).
  Po zapojení kontaktu nastav `doorSensor: true` a podle typu kontaktu `doorOpenWhenInputOn`.
- Socket: emituje **`garage-status`**, přijímá **`garage-pulse`** → odpovídá **`garage-pulse-result`**.
- REST API:
  - `GET /api/garage` — stav
  - `GET|POST /api/garage/pulse` — impuls (`200 {ok:true,at}` / `409 {ok:false,error}`)
    → ideální pro iOS Zkratky / Siri: `curl http://casa-davinci.local:3000/api/garage/pulse`

## Dashboard
- **v1** (`frontend/index.html`, záložka *Service*): karta **🚗 Garážová vrata** pod čerpadlem —
  Online indikátor, stav vrat / relé / teplota, tlačítko **⏻ Otevřít / zavřít vrata**, čas posledního impulsu.
- **v2** (`frontend-v2`, oblast **Garáž** `/#/garaz`): `hooks/useGarage.js`, `areas/Garaz.jsx`
  + `garaz/GarageScene.jsx` (schéma vrata · pohon · Shelly, animace impulsu, vrata se
  „otevřou“ až s čidlem). Domů hlásí alarm, když je Shelly garáže offline.
- **Rychlé akce**: sdílená komponenta `components/GaragePulseButton.jsx` — na **Domů › Rychlé akce**
  (plné tlačítko) i v **horní liště** na každé obrazovce vč. mobilu (kompaktní pilulka s ikonou).
  Obě jsou **dvoukrokové**: klik → „Potvrdit?“ (5 s, pak se zruší) → klik → impuls → „Odesláno ✓“.
  Při offline Shelly / zastaralých datech jsou ztlumené.

---

## Uvedení do provozu (nový Shelly)

```bash
# Jak proběhlo 30. 8. 2026: WiFi přes Shelly Smart Control app (Bluetooth) → chvíli „connecting“ →
# pak IP 192.168.1.61 → `configure` → update FW 1.2.2 → 1.3.3 → 2.0.0 → testovací impuls OK.
#
# 1) Shelly je v AP režimu (SSID Shelly1G3-54320457E4C8). Mac se na něj dočasně přepne,
#    pošle WiFi údaje, vrátí se, počká na Shelly na LAN a rovnou ho nakonfiguruje:
./scripts/garage-shelly-setup.sh provision "<SSID>" "<heslo>"            # + volitelně "<SSID2>" "<heslo2>"

# Alternativa: připojit Shelly na WiFi přes Shelly app (Bluetooth) a pak jen:
./scripts/garage-shelly-setup.sh configure                                # default host shelly1g3-54320457e4c8.local

# 2) Ověření
./scripts/garage-shelly-setup.sh status
curl http://casa-davinci.local:3000/api/garage                             # online:true
mosquitto_sub -h 192.168.1.210 -t "casa/garage/#" -v                      # provoz

# 3) Test impulsu (HÝBE VRATY, pokud je Shelly už zapojený u pohonu)
curl http://casa-davinci.local:3000/api/garage/pulse
```

## Zabezpečení Shelly (TODO — udělat z webového UI `http://192.168.1.61`)

Pořadí: **nejdřív heslo, pak AP** (kdyby se něco nepovedlo, AP je záchranná cesta).

1. **Heslo na web UI / HTTP RPC** — *Settings → Authentication → Enable* (uživatel je vždy `admin`).
   - MQTT ovládání z dashboardu **to neovlivní** (garáž jede jen přes MQTT).
   - `scripts/garage-shelly-setup.sh status|configure` pak potřebuje digest auth
     (`curl --digest -u admin:<heslo>`) — do skriptu doplnit `SHELLY_PASS`.
   - ⚠️ Na **čerpadlovém** Shelly heslo NEzapínat (backend tam volá HTTP RPC bez auth — viz `WATER-PUMP.md`).
2. **Otevřený AP `Shelly1G3-54320457E4C8`** — dvě možnosti:
   - **A (doporučeno):** AP nechat, ale zaheslovat — *Settings → Wi-Fi → Access Point → Set password* (≥ 8 znaků).
     Zůstane záchranná cesta při změně domácí WiFi.
   - **B:** AP vypnout — *Access Point → Enable* off. Při ztrátě domácí WiFi pak jen tovární reset
     (tlačítko ~10 s, nebo 5× vypnout/zapnout napájení) a znovu `provision`.
   - Přes RPC: `curl -X POST http://192.168.1.61/rpc -d '{"id":1,"method":"WiFi.SetConfig","params":{"config":{"ap":{"enable":true,"is_open":false,"pass":"<heslo>"}}}}'`
3. **Statická IP** — rezervovat 192.168.1.61 na routeru (Starlink app → DHCP). Backend ji nepotřebuje (MQTT), skript ano.

## Troubleshooting
1. `curl http://casa-davinci.local:3000/api/garage` — `online:false`? → Shelly není na WiFi/MQTT.
2. `./scripts/garage-shelly-setup.sh status` — sekce MQTT musí mít `"connected":true`.
3. `mosquitto_sub -h 192.168.1.210 -t "casa/garage/#" -v` — po impulsu musí přijít `status/switch:0` s `output:true` a za 1 s `false`.
4. Shelly se po chybném hesle vrátí do AP režimu → znovu `provision`.
5. Impuls „prošel“, ale vrata se nehnou → zkontroluj zapojení I/O na vstup tlačítka pohonu (bezpotenciálově) a délku impulsu (některé pohony chtějí ≥ 0,5 s — 1 s je bezpečné).

## TODO
- [ ] **Magnetický kontakt** na SW → `GARAGE.doorSensor = true` (+ `doorOpenWhenInputOn` dle NO/NC) → poloha vrat v app.
- [ ] **Rezervovat statickou IP** Shelly na routeru + **nastavit heslo** na Shelly (`auth_en`) a vypnout otevřený AP.
- [ ] Notifikace „vrata otevřená déle než X min“ (až bude čidlo).
- [ ] Siri / iOS Zkratka na `GET /api/garage/pulse` (jen z domácí sítě / VPN).
