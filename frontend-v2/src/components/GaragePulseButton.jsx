// =============================================================================
// GaragePulseButton — ONE garage-door control used in two places:
//   · variant="full"    → Domů › Rychlé akce (wide .btn, text labels)
//   · variant="compact" → topbar (pill with icon, visible on every screen incl. mobile)
//
// Safety model (same as the pump quick action): a physical door must never
// move on a single stray tap, so the button is TWO-STEP —
//   idle ── click ──▶ confirm (amber, auto-cancels after 5 s) ── click ──▶ pulse
// then shows "sent ✓" / error for 2 s and returns to idle. Disabled while the
// Shelly is offline or the data is stale (.is-stale .btn.ctl rule).
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import useGarage from '../hooks/useGarage.js';
import AreaIcon from '../shell/AreaIcon.jsx';

const CONFIRM_MS = 5000;   // how long the "Potvrdit?" state waits for the 2nd click
const RESULT_MS = 2000;    // how long the ✓ / ✗ feedback stays
const SENDING_MAX_MS = 4000;

const LABELS = {
  full: {
    idle: '⏻ Otevřít / zavřít vrata', confirm: 'Potvrdit impuls vrat?', sending: 'Posílám impuls…',
    sent: 'Impuls odeslán ✓', error: 'Chyba impulsu', offline: 'Vrata · Shelly offline'
  },
  compact: {
    idle: 'Vrata', confirm: 'Potvrdit?', sending: '…', sent: 'Odesláno ✓', error: 'Chyba ✗', offline: 'Vrata'
  }
};

export default function GaragePulseButton({ variant = 'full' }) {
  const { garage, pulse, lastResult } = useGarage();
  const [phase, setPhase] = useState('idle'); // idle | confirm | sending | sent | error
  const timer = useRef(null);
  const arm = (next, ms) => { clearTimeout(timer.current); timer.current = setTimeout(() => setPhase(next), ms); };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Backend acknowledgement → ✓ / ✗ feedback, then back to idle.
  useEffect(() => {
    if (!lastResult) return;
    setPhase(lastResult.ok ? 'sent' : 'error');
    arm('idle', RESULT_MS);
  }, [lastResult]);

  const online = garage?.online === true;
  const error = phase === 'error' ? (lastResult?.error || 'neznámá') : null;

  const onClick = () => {
    if (phase === 'confirm') {
      setPhase('sending');
      arm('idle', SENDING_MAX_MS);   // safety: never stuck in "sending" if no ack arrives
      pulse();
      return;
    }
    if (phase !== 'idle') return;
    setPhase('confirm');
    arm('idle', CONFIRM_MS);
  };

  const labels = LABELS[variant] || LABELS.full;
  const text = !online ? labels.offline : labels[phase];
  const title = !online
    ? 'Shelly garážových vrat je offline'
    : phase === 'confirm' ? 'Ještě jednou klikni pro odeslání impulsu (otevřít / stop / zavřít)'
    : error ? `Chyba: ${error}` : 'Garážová vrata — jeden impuls = jedno stisknutí tlačítka pohonu';

  const phaseClass = ` gp-${phase}`;
  if (variant === 'compact') {
    return (
      <button className={'tb-garage' + phaseClass} disabled={!online} onClick={onClick} title={title} aria-label="Garážová vrata">
        <AreaIcon id="garaz" size={16} />
        <span className="tb-garage-label">{text}</span>
      </button>
    );
  }
  return (
    <button
      className={'btn ctl' + (phase === 'idle' && online ? ' acc' : '') + phaseClass}
      disabled={!online}
      onClick={onClick}
      title={title}
    >
      {text}{error ? `: ${error}` : ''}
    </button>
  );
}
