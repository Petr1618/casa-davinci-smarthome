// =============================================================================
// Dq — the data-quality chip from the mockup (ŽIVÁ → ZASTARALÁ / BEZ DAT).
// Colour comes from CSS (`.is-stale .dq`); the TEXT + last-value timestamp
// come from the health store. `nodata` marks readouts that have no meaningful
// last-known value during an outage (e.g. countdowns) — they escalate to the
// red BEZ DAT treatment via data-out="nodata".
// =============================================================================
import { useHealth, fmtClock } from '../lib/health.jsx';

export default function Dq({ nodata = false }) {
  const { stale, lastDataAt } = useHealth();

  if (!stale) return <span className="dq"><b>Živá</b></span>;

  return (
    <span className="dq" data-out={nodata ? 'nodata' : 'stale'}>
      <b>{nodata ? 'Bez dat' : 'Zastaralá'}</b>
      {!nodata && lastDataAt && <i>· {fmtClock(lastDataAt)}</i>}
    </span>
  );
}
