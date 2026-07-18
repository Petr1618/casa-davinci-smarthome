// =============================================================================
// WaterScene — the Zahrada water diagram, a 1:1 port of the design-B mockup
// (design-b-precision.html, viewBox 0 0 960 352). Geometry, classes and text
// placement are VERBATIM from the mockup:
//
//   vrtaná studna (well + groundwater) → ponorné čerpadlo (impeller node)
//        → potrubí PE 32 (channel arc) → jímka (tank, indicative level)
//
// The running look (flow dashes, impeller spin, pump glow, splash, ripple) is
// driven purely by the `is-on` class on the PARENT `.wscene` card — this
// component itself is static markup + live text values.
//
// Honest data: the cistern has NO level sensor — the tank level is the
// mockup's fixed indicative value and is labelled as such. Shelly temperature
// is live.
// =============================================================================
import { fmt1 } from '../../lib/format.js';

export default function WaterScene({ pump }) {
  const temp = typeof pump?.temperature === 'number' ? `${fmt1(pump.temperature)} °C` : '—';

  return (
    <svg viewBox="0 0 960 352" role="img" aria-label="Schéma: vrtaná studna, ponorné čerpadlo, potrubí a jímka">
      <defs>
        <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3bd6c6" stopOpacity=".30" />
          <stop offset="1" stopColor="#3bd6c6" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3bd6c6" stopOpacity=".38" />
          <stop offset="1" stopColor="#3bd6c6" stopOpacity=".10" />
        </linearGradient>
        <clipPath id="wellClip"><rect x="152" y="86" width="56" height="212" /></clipPath>
        <clipPath id="tankClip"><rect x="642" y="122" width="216" height="176" rx="8" /></clipPath>
      </defs>

      {/* terén */}
      <line className="wp-ground" x1="24" y1="84" x2="936" y2="84" />
      <text className="fx-sub" x="24" y="72" textAnchor="start" opacity=".7">ÚROVEŇ TERÉNU</text>

      {/* STUDNA */}
      <g className="v">
        <rect className="wp-body" x="150" y="84" width="60" height="214" />
        <rect className="wp-struct" x="150" y="84" width="60" height="214" />
        <rect className="wp-body" x="138" y="70" width="84" height="14" rx="4" />
        <rect className="wp-struct" x="138" y="70" width="84" height="14" rx="4" />
        <g clipPath="url(#wellClip)">
          <rect className="wp-water" x="152" y="176" width="56" height="122" />
          <line className="wp-surf" x1="152" y1="176" x2="208" y2="176" />
        </g>
        <line className="wp-struct" x1="150" y1="130" x2="158" y2="130" opacity=".6" />
        <line className="wp-struct" x1="150" y1="176" x2="158" y2="176" opacity=".6" />
        <line className="wp-struct" x1="150" y1="222" x2="158" y2="222" opacity=".6" />
        <line className="wp-struct" x1="150" y1="268" x2="158" y2="268" opacity=".6" />
        <text className="fx-label" x="180" y="326" textAnchor="middle">Vrtaná studna</text>
        <text className="fx-sub" x="180" y="344" textAnchor="middle">vrt ⌀ 125 mm</text>
      </g>

      {/* POTRUBÍ */}
      <g>
        <path className="wp-wall" d="M 180 222 L 180 50 Q 180 36 194 36 L 686 36 Q 700 36 700 50 L 700 116" />
        <path className="wp-chan" d="M 180 222 L 180 50 Q 180 36 194 36 L 686 36 Q 700 36 700 50 L 700 116" />
        <path className="wp-flow" d="M 180 222 L 180 50 Q 180 36 194 36 L 686 36 Q 700 36 700 50 L 700 116" />
        <text className="fx-sub" x="440" y="24" textAnchor="middle" opacity=".8">POTRUBÍ · PE 32</text>
      </g>

      {/* ČERPADLO */}
      <g className="v">
        <circle className="wp-pglow" cx="180" cy="240" r="18" stroke="#3bd6c6" />
        <circle cx="180" cy="240" r="18" fill="var(--g1)" stroke="var(--teal)" strokeWidth="1.25" opacity=".9" />
        <g className="wp-imp" stroke="var(--teal)" strokeWidth="1.75" strokeLinecap="round">
          <line x1="180" y1="232.5" x2="180" y2="247.5" />
          <line x1="172.5" y1="240" x2="187.5" y2="240" />
          <circle cx="180" cy="240" r="2.2" fill="var(--teal)" stroke="none" />
        </g>
        <text className="fx-sub" x="212" y="238" textAnchor="start">PONORNÉ ČERPADLO</text>
        <text className="fx-sub" x="212" y="254" textAnchor="start" opacity=".7">1,5 kW · 230 V · Shelly {temp}</text>
      </g>

      {/* JÍMKA */}
      <g className="v">
        <rect className="wp-body" x="640" y="120" width="220" height="180" rx="9" />
        <g clipPath="url(#tankClip)">
          <rect className="wp-tankwater" x="642" y="196" width="216" height="102" />
          <line className="wp-surf tank" x1="642" y1="196" x2="858" y2="196" />
          <ellipse className="wp-splash" cx="700" cy="200" rx="9" ry="3" />
        </g>
        <rect className="wp-struct" x="640" y="120" width="220" height="180" rx="9" />
        <rect className="wp-body" x="686" y="108" width="28" height="12" rx="3" />
        <rect className="wp-struct" x="686" y="108" width="28" height="12" rx="3" />
        <line className="wp-struct" x1="640" y1="165" x2="650" y2="165" opacity=".6" />
        <line className="wp-struct" x1="640" y1="210" x2="650" y2="210" opacity=".6" />
        <line className="wp-struct" x1="640" y1="255" x2="650" y2="255" opacity=".6" />
        <text className="fx-label" x="750" y="326" textAnchor="middle">Jímka</text>
        <text className="fx-sub" x="750" y="344" textAnchor="middle">hladina orientační · bez čidla úrovně</text>
      </g>
    </svg>
  );
}
