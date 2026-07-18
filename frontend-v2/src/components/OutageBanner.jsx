// =============================================================================
// OutageBanner — the global degraded-state banner from the mockup, wired to
// the real health store. Collapsed (0fr grid row) while healthy; slides open
// when `.is-stale` lands on the shell root.
//
// Left column: live diagnosis (socket, data flow, watchdog, last data).
// Right column: the numbered "Doporučení" operator checklist — the exact
// runbook from the June-21 outage post-mortem.
// =============================================================================
import { useHealth, fmtClock, fmtDuration } from '../lib/health.jsx';

export default function OutageBanner() {
  const { stale, cause, connected, lastDataAt, outageSince, watchdog, silentTopics } = useHealth();

  const durMs = outageSince ? Date.now() - outageSince : 0;

  const diagnosis = cause === 'socket'
    ? 'Spojení se serverem je přerušené — prohlížeč se nedovolá backendu.'
    : cause === 'data'
      ? 'Server běží, ale data z domu netečou — pravděpodobně most Raspberry Pi ↔ Cerbo/MQTT.'
      : '';

  return (
    <div className="banner-wrap" aria-hidden={!stale}>
      <div className="banner-clip">
        <div className="banner" role="alert">
          <div className="banner-head">
            <div className="banner-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 22 20H2L12 3Z" /><path d="M12 10v4.5" /><path d="M12 17.4v.1" />
              </svg>
            </div>
            <div>
              <div className="banner-title">Ztráta spojení s domem</div>
              <div className="banner-sub">
                {diagnosis} Zobrazené hodnoty jsou <b>poslední známé</b>
                {lastDataAt ? <> z <b>{fmtClock(lastDataAt)}</b></> : null}. Ovládání je zablokované.
              </div>
            </div>
            <div className="banner-dur">
              <div className="l">Trvání výpadku</div>
              <div className="v">{fmtDuration(durMs)}</div>
            </div>
          </div>

          <div className="banner-body">
            <div className="banner-col">
              <h4>Diagnostika</h4>
              <div className="diag-row">
                <span className="k">WebSocket k serveru</span>
                <span className={'s ' + (connected ? 'fine' : 'bad')}>{connected ? 'Připojeno' : 'Přerušeno'}</span>
              </div>
              <div className="diag-row">
                <span className="k">Živá data (Victron · čerpadlo)</span>
                <span className={'s ' + (cause === 'data' ? 'bad' : connected ? 'warn' : 'bad')}>
                  {lastDataAt ? `naposledy ${fmtClock(lastDataAt)}` : 'žádná'}
                </span>
              </div>
              <div className="diag-row">
                <span className="k">MQTT watchdog</span>
                <span className={'s ' + (watchdog.available === false ? 'warn' : silentTopics.length ? 'bad' : 'fine')}>
                  {watchdog.available === false
                    ? 'Nedostupný'
                    : silentTopics.length
                      ? `${silentTopics.length} topiků ztichlo`
                      : 'Vše živé'}
                </span>
              </div>
              {silentTopics.slice(0, 4).map((t) => (
                <div className="diag-row" key={t.topic}>
                  <span className="k" style={{ fontFamily: 'var(--f-mono)', fontSize: 11 }}>{t.label}</span>
                  <span className="s bad">ticho {Math.round(t.ageSeconds / 60)} min</span>
                </div>
              ))}
            </div>

            <div className="banner-col">
              <h4>Doporučení</h4>
              <ol className="reco">
                <li><span><b>Zkontrolujte napájení a síť Raspberry Pi</b> — po zamrznutí pomáhá odpojit na 10 s (viz výpadek 21. 6.).</span></li>
                <li><span>Na Pi ověřte služby: <code>systemctl status casa-davinci casa-davinci-bridge</code></span></li>
                <li><span>Ověřte VPN tunel: <code>wg show</code> — poslední handshake musí být čerstvý.</span></li>
                <li><span>Ověřte Cerbo broker: <code>mosquitto_sub -h 192.168.1.210 -t 'N/#' -C 3</code>; když mlčí, restartujte Cerbo GX.</span></li>
                <li><span><b>Po obnovení</b> zkontrolujte stáří topiků ve <b>Watchdogu</b> — hodnoty se samy vrátí na Živá.</span></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
