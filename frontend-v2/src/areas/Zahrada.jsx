// =============================================================================
// Zahrada (Garden) — area page.
//
// Composes the Garden's two pieces and wires them to the live backend via the
// usePump() hook (single source of truth for pump state + actions):
//   · <WaterFlow>     — the animated water-flow showpiece (well → pump → jímka)
//   · <PumpControls>  — the ported v1 pump tile (manual + automation controls)
//
// Receives `{ area }` (id/label/icon/accent/blurb) from App's route map, used
// for the header so the page stays consistent with the rest of the navigation.
// =============================================================================
import usePump from '../hooks/usePump.js';
import WaterFlow from './zahrada/WaterFlow.jsx';
import PumpControls from './zahrada/PumpControls.jsx';
import './zahrada/zahrada.css';

export default function Zahrada({ area }) {
  // One hook owns all socket I/O; both children read the same live `pump`.
  const { pump, setPump, setConfig, lastResult } = usePump();

  return (
    <div className="zh-area">
      {/* Area header — icon + title + short blurb. */}
      <header className="zh-header">
        <div className="zh-icon" aria-hidden>{area?.icon || '🌿'}</div>
        <div>
          <h1 className="zh-title">{area?.label || 'Zahrada'}</h1>
          <p className="zh-blurb">
            {area?.blurb || 'Čerpadlo studna → jímka, zavlažování a venkovní čidla.'}
          </p>
        </div>
      </header>

      {/* The visual showpiece — reacts to pump.on / pump.enabled. */}
      <WaterFlow pump={pump} />

      {/* Manual + automation controls. */}
      <PumpControls
        pump={pump}
        setPump={setPump}
        setConfig={setConfig}
        lastResult={lastResult}
      />
    </div>
  );
}
