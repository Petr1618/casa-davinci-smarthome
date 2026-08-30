// =============================================================================
// GarageScene — the Garáž diagram in the Precision language (viewBox 960×352,
// same canvas as WaterScene): garage front with a 4-panel sectional door, the
// opener motor on the ceiling track, and the Shelly relay node wired to its
// button input. The pulse/open looks are pure CSS on the parent `.gscene`
// (see garaz.css) — this component is static markup + live text.
//
// Honest data: there is NO door-position sensor yet — until a magnetic
// contact is wired to SW the door is drawn closed with a dashed outline and
// labelled "bez čidla". Shelly temperature is live.
// =============================================================================
import { fmt1 } from '../../lib/format.js';

export default function GarageScene({ garage }) {
  const temp = typeof garage?.temperature === 'number' ? `${fmt1(garage.temperature)} °C` : '—';
  const online = garage?.online === true;
  const doorTxt = garage?.doorOpen === true ? 'OTEVŘENÁ'
    : garage?.doorOpen === false ? 'ZAVŘENÁ'
    : 'POLOHA NEZNÁMÁ · BEZ ČIDLA';

  return (
    <svg viewBox="0 0 960 352" role="img" aria-label="Schéma: garážová vrata, pohon a Shelly relé">
      {/* terén */}
      <line className="gs-ground" x1="24" y1="300" x2="936" y2="300" />

      {/* garáž — čelní stěna + střecha */}
      <path className="gs-roof" d="M150 118 L360 58 L570 118" />
      <rect className="gs-wall" x="160" y="118" width="400" height="182" />

      {/* rám vrat + stropní kolejnice */}
      <rect className="gs-frame" x="200" y="150" width="320" height="150" />
      <line className="gs-wire" x1="230" y1="150" x2="490" y2="150" strokeDasharray="3 5" />

      {/* sekční vrata — 4 lamely (posouvají se nahoru při .is-open) */}
      <g className="gs-door">
        <rect className="gs-panel" x="206" y="156" width="308" height="34" rx="2" />
        <rect className="gs-panel" x="206" y="192" width="308" height="34" rx="2" />
        <rect className="gs-panel" x="206" y="228" width="308" height="34" rx="2" />
        <rect className="gs-panel" x="206" y="264" width="308" height="34" rx="2" />
      </g>
      <text className="fx-sub" x="360" y="136" textAnchor="middle" opacity=".8">SEKČNÍ VRATA · {doorTxt}</text>

      {/* pohon vrat na stropě */}
      <rect className="gs-motor" x="522" y="126" width="46" height="22" rx="4" />
      <circle className="gs-glow" cx="545" cy="137" r="22" />
      <text className="fx-sub" x="545" y="176" textAnchor="middle">POHON</text>
      <text className="fx-sub" x="545" y="190" textAnchor="middle" opacity=".6">VSTUP TLAČÍTKA</text>

      {/* vodič Shelly → pohon + běžící signál */}
      <path className="gs-wire" d="M760 210 C 700 210, 660 137, 568 137" />
      <path className="gs-signal" d="M760 210 C 700 210, 660 137, 568 137" />

      {/* Shelly uzel */}
      <rect className="gs-node" x="760" y="180" width="120" height="60" rx="8" />
      <circle className="gs-led" cx="778" cy="198" r="4" />
      <text className="fx-label" x="792" y="202">SHELLY 1 GEN3</text>
      <text className="fx-mono" x="792" y="222">RELÉ · IMPULS 1 s</text>
      <text className="fx-sub" x="820" y="262" textAnchor="middle">{online ? 'ONLINE' : 'OFFLINE'} · {temp}</text>

      {/* měřítko / popisky */}
      <text className="fx-sub" x="24" y="288" textAnchor="start" opacity=".7">PODLAHA GARÁŽE</text>
      <text className="fx-sub" x="936" y="288" textAnchor="end" opacity=".6">MQTT · casa/garage</text>
    </svg>
  );
}
