// Corner tag shown over scenes while degraded — "Poslední známý stav · HH:MM".
// Visibility is pure CSS (`.is-stale .freeze-tag`); the time comes from health.
import { useHealth, fmtClock } from '../lib/health.jsx';

export default function FreezeTag() {
  const { lastDataAt } = useHealth();
  return (
    <div className="freeze-tag">
      Poslední známý stav · <span className="ft-time">{fmtClock(lastDataAt)}</span>
    </div>
  );
}
