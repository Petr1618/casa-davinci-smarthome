#!/bin/bash
# =============================================================================
# Casa DaVinci — Shelly 1 Gen3 (garážová vrata): připojení na WiFi + konfigurace
#
#   ./scripts/garage-shelly-setup.sh provision "<SSID>" "<heslo>" ["<SSID2>" "<heslo2>"]
#       Mac se DOČASNĚ přepne na AP nového Shelly (Shelly1G3-xxxx, 192.168.33.1),
#       pošle mu WiFi přihlašovací údaje, vrátí Mac na původní WiFi, počká,
#       až se Shelly objeví na LAN, a rovnou spustí `configure`.
#       (sta1 = záložní síť, volitelně — stejně jako má čerpadlový Shelly.)
#
#   ./scripts/garage-shelly-setup.sh configure [<ip|host>]
#       Nastaví jméno GarageDoor, relé na impuls 1 s (auto-off), MQTT na Cerbo
#       s prefixem casa/garage a restartuje Shelly. Host default: shelly1g3-54320457e4c8.local
#
#   ./scripts/garage-shelly-setup.sh status [<ip|host>]
#       Vypíše DeviceInfo, WiFi, MQTT a Switch stav.
#
#   ./scripts/garage-shelly-setup.sh pulse [<ip|host>]
#       Testovací impuls přímo přes HTTP RPC (mimo backend) — POZOR, hýbe vraty!
# =============================================================================
set -u

AP_SSID="${GARAGE_AP_SSID:-Shelly1G3-54320457E4C8}"
AP_IP="192.168.33.1"
DEFAULT_HOST="${GARAGE_HOST:-shelly1g3-54320457e4c8.local}"
MQTT_SERVER="192.168.1.210:1883"
MQTT_PREFIX="casa/garage"
DEVICE_NAME="GarageDoor"
WIFI_IF="${WIFI_IF:-en0}"

log()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# JSON-RPC POST na Shelly (Gen2/Gen3): rpc <host> <Method> '<params-json>'
rpc() {
  local host="$1" method="$2" params="${3:-{\}}"
  curl -s -m 8 -H 'Content-Type: application/json' \
    -d "{\"id\":1,\"method\":\"$method\",\"params\":$params}" "http://$host/rpc"
}

need_ok() {  # need_ok "<popis>" "<json>"  → selže, pokud odpověď obsahuje "code":
  if echo "$2" | grep -q '"code"'; then err "$1: $2"; return 1; fi
  ok "$1"; [ -n "${VERBOSE:-}" ] && echo "   $2"; return 0
}

wait_http() {  # wait_http <host> <sekund>
  local host="$1" n="${2:-30}"
  for ((i=0; i<n; i++)); do
    curl -s -m 2 "http://$host/shelly" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

current_ssid() { networksetup -getairportnetwork "$WIFI_IF" 2>/dev/null | sed -E 's/^Current Wi-Fi Network: //'; }

restore_wifi() {
  local ssid="$1"
  log "Vracím Mac na WiFi „$ssid“…"
  networksetup -setairportnetwork "$WIFI_IF" "$ssid" >/dev/null 2>&1 || true
  for ((i=0; i<20; i++)); do
    [ "$(current_ssid)" = "$ssid" ] && ipconfig getifaddr "$WIFI_IF" 2>/dev/null | grep -q '^192\.168\.1\.' && { ok "Mac zpět na „$ssid“ ($(ipconfig getifaddr "$WIFI_IF"))"; return 0; }
    sleep 1
  done
  log "Přímé připojení nevyšlo — power-cycle WiFi (auto-join preferované sítě)"
  networksetup -setairportpower "$WIFI_IF" off; sleep 2; networksetup -setairportpower "$WIFI_IF" on
  for ((i=0; i<30; i++)); do
    ipconfig getifaddr "$WIFI_IF" 2>/dev/null | grep -q '^192\.168\.1\.' && { ok "Mac zpět na LAN ($(ipconfig getifaddr "$WIFI_IF"), SSID $(current_ssid))"; return 0; }
    sleep 1
  done
  err "Mac se nepřipojil zpět na LAN — připoj WiFi ručně."
  return 1
}

cmd_provision() {
  local ssid="${1:-}" pass="${2:-}" ssid2="${3:-}" pass2="${4:-}"
  [ -z "$ssid" ] || [ -z "$pass" ] && { err "Použití: provision \"<SSID>\" \"<heslo>\" [\"<SSID2>\" \"<heslo2>\"]"; return 2; }

  local orig; orig="$(current_ssid)"
  [ -z "$orig" ] && { err "Mac není na WiFi ($WIFI_IF) — provisioning přes AP potřebuje WiFi rozhraní."; return 1; }
  log "Původní WiFi Macu: „$orig“"

  # 1) je AP nového Shelly vidět?
  local A=/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport
  if [ -x "$A" ] && ! "$A" -s 2>/dev/null | grep -q "$AP_SSID"; then
    err "AP „$AP_SSID“ není v dosahu. Shelly musí být napájený a v továrním/AP režimu."
    return 1
  fi

  # 2) přepnout Mac na AP Shelly (otevřená síť)
  trap 'restore_wifi "$orig"' EXIT
  log "Připojuji Mac na AP „$AP_SSID“…"
  local joined=0
  for ((i=0; i<3; i++)); do
    networksetup -setairportnetwork "$WIFI_IF" "$AP_SSID" >/dev/null 2>&1
    if wait_http "$AP_IP" 15; then joined=1; break; fi
  done
  [ $joined -eq 1 ] || { err "Shelly na $AP_IP neodpovídá."; return 1; }
  ok "Shelly AP dostupný: $(curl -s -m 3 http://$AP_IP/shelly)"

  # 3) poslat WiFi konfiguraci (sta = primární, sta1 = záložní)
  local cfg="{\"config\":{\"sta\":{\"ssid\":$(printf '%s' "$ssid" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"pass\":$(printf '%s' "$pass" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"enable\":true,\"ipv4mode\":\"dhcp\"}"
  if [ -n "$ssid2" ] && [ -n "$pass2" ]; then
    cfg="$cfg,\"sta1\":{\"ssid\":$(printf '%s' "$ssid2" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"pass\":$(printf '%s' "$pass2" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"enable\":true,\"ipv4mode\":\"dhcp\"}"
  fi
  cfg="$cfg}}"
  local r; r="$(rpc "$AP_IP" WiFi.SetConfig "$cfg")"
  need_ok "WiFi.SetConfig (sta=„$ssid“${ssid2:+, sta1=„$ssid2“})" "$r" || return 1
  # jméno rovnou teď, ať je Shelly na LAN hned k poznání
  rpc "$AP_IP" Sys.SetConfig "{\"config\":{\"device\":{\"name\":\"$DEVICE_NAME\"}}}" >/dev/null
  sleep 2

  # 4) zpět na domácí WiFi
  trap - EXIT
  restore_wifi "$orig" || return 1

  # 5) počkat, až se Shelly objeví na LAN
  log "Čekám, až se Shelly připojí na „$ssid“ a objeví se na LAN (až 90 s)…"
  local host="" 
  for ((i=0; i<90; i++)); do
    for h in "$DEFAULT_HOST" "garagedoor.local"; do
      if curl -s -m 2 "http://$h/shelly" 2>/dev/null | grep -q '"gen":3'; then host="$h"; break 2; fi
    done
    sleep 1
  done
  if [ -z "$host" ]; then
    err "Shelly se na LAN neobjevil. Zkontroluj heslo/SSID; Shelly se při neúspěchu vrátí do AP režimu."
    return 1
  fi
  ok "Shelly je na LAN jako $host $(dscacheutil -q host -a name "$host" 2>/dev/null | awk '/ip_address/{print "("$2")"}')"
  cmd_configure "$host"
}

cmd_configure() {
  local host="${1:-$DEFAULT_HOST}"
  wait_http "$host" 10 || { err "$host neodpovídá."; return 1; }
  log "Konfiguruji $host → $(curl -s -m 3 "http://$host/shelly")"

  need_ok "Sys.SetConfig name=$DEVICE_NAME" \
    "$(rpc "$host" Sys.SetConfig "{\"config\":{\"device\":{\"name\":\"$DEVICE_NAME\"}}}")" || return 1
  # Relé = tlačítko pohonu: impuls 1 s, po výpadku vyplé, fyzický vstup SW odpojený (rezerva pro čidlo polohy)
  need_ok "Switch.SetConfig impuls 1 s (auto_off), in_mode=detached, initial_state=off" \
    "$(rpc "$host" Switch.SetConfig '{"id":0,"config":{"name":"Vrata","in_mode":"detached","initial_state":"off","auto_on":false,"auto_off":true,"auto_off_delay":1}}')" || return 1
  need_ok "Input.SetConfig SW jako switch (pro budoucí magnetický kontakt)" \
    "$(rpc "$host" Input.SetConfig '{"id":0,"config":{"name":"Poloha vrat","type":"switch","enable":true}}')" || true
  need_ok "MQTT.SetConfig $MQTT_SERVER prefix=$MQTT_PREFIX" \
    "$(rpc "$host" MQTT.SetConfig "{\"config\":{\"enable\":true,\"server\":\"$MQTT_SERVER\",\"topic_prefix\":\"$MQTT_PREFIX\",\"rpc_ntf\":true,\"status_ntf\":true,\"enable_rpc\":true,\"enable_control\":true}}")" || return 1
  # Ochrana proti špatnému času (impuls počítá auto-off lokálně, ale MQTT lastPulse/log ať sedí)
  rpc "$host" Sys.SetConfig '{"config":{"location":{"tz":"Europe/Prague"},"sntp":{"server":"time.cloudflare.com"}}}' >/dev/null

  log "Restartuji Shelly (MQTT konfigurace vyžaduje reboot)…"
  rpc "$host" Shelly.Reboot '{}' >/dev/null
  sleep 6
  wait_http "$host" 40 || { err "Shelly po restartu neodpovídá."; return 1; }
  cmd_status "$host"
}

cmd_status() {
  local host="${1:-$DEFAULT_HOST}"
  echo "── DeviceInfo ──"; curl -s -m 5 "http://$host/rpc/Shelly.GetDeviceInfo"; echo
  echo "── WiFi ──";       curl -s -m 5 "http://$host/rpc/WiFi.GetStatus"; echo
  echo "── MQTT ──";       curl -s -m 5 "http://$host/rpc/MQTT.GetStatus"; echo
  echo "── Switch cfg ──"; curl -s -m 5 "http://$host/rpc/Switch.GetConfig?id=0"; echo
  echo "── Switch ──";     curl -s -m 5 "http://$host/rpc/Switch.GetStatus?id=0"; echo
  echo "── Input ──";      curl -s -m 5 "http://$host/rpc/Input.GetStatus?id=0"; echo
  local m; m="$(curl -s -m 5 "http://$host/rpc/MQTT.GetStatus")"
  echo "$m" | grep -q '"connected":true' && ok "MQTT připojeno k brokeru" || err "MQTT NENÍ připojeno: $m"
}

cmd_pulse() {
  local host="${1:-$DEFAULT_HOST}"
  log "Testovací impuls přes HTTP RPC na $host (auto-off 1 s)…"
  rpc "$host" Switch.Set '{"id":0,"on":true}'; echo
  sleep 1.5
  curl -s -m 5 "http://$host/rpc/Switch.GetStatus?id=0"; echo
}

case "${1:-}" in
  provision) shift; cmd_provision "$@" ;;
  configure) shift; cmd_configure "$@" ;;
  status)    shift; cmd_status "$@" ;;
  pulse)     shift; cmd_pulse "$@" ;;
  *) sed -n '2,22p' "$0"; exit 2 ;;
esac
