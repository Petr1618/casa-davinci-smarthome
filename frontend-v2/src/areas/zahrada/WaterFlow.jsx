// =============================================================================
// WaterFlow — the animated "water-flow" showpiece for the Zahrada area.
//
// Ported from the vanilla reference (frontend/components/zahrada-waterflow.html):
// it reuses that file's exact SVG geometry, animation language and honest
// labelling. The cycle visualised is:
//
//     vrtaná studna (well) → ponorné čerpadlo (submersible pump)
//                          → potrubí (pipe) → jímka (cistern)
//
// React port notes:
//   · The whole "running" look is driven by a single `is-on` class on the card,
//     toggled from `pump.on` (exactly like the vanilla `.is-on` toggle).
//   · Droplets ride the pipe path and the cistern level nudges up via ONE
//     requestAnimationFrame loop, using refs to the live DOM nodes (no React
//     re-render per frame — the SVG is mutated imperatively, as in v1).
//   · Honest: the cistern level is a STYLIZED nominal value, never a fake %.
//     The caption always says it is orientační / bez reálného čidla.
//   · prefers-reduced-motion is respected: the rAF loop is skipped, and CSS
//     animations are already frozen by the media query in water-flow.css.
// =============================================================================
import { useEffect, useRef } from 'react';
import './water-flow.css';

// ---- Cistern fill model (no real sensor → stylized nominal level in [0..1]) --
// Geometry matches the SVG viewBox below 1:1.
const TANK_TOP = 96;
const TANK_BOTTOM = 240;   // y reference for "full"
const LEVEL_MIN = 0.30;
const LEVEL_MAX = 0.92;
const LEVEL_START = 0.46;  // calm mid level on first paint
const DROP_COUNT = 7;      // droplets spaced along the pipe

export default function WaterFlow({ pump }) {
  // Derive the three logical states from the (possibly partial / null) pump.
  const enabled = pump?.enabled !== false;   // automation master (default true)
  const isOn = pump?.on === true;            // relay currently energized?

  // Refs to the live DOM nodes the rAF loop mutates each frame.
  const cardRef = useRef(null);
  const pipeRef = useRef(null);
  const tankWaterRef = useRef(null);
  const tankSurfaceRef = useRef(null);
  const dropsRef = useRef([]);   // [{ el, offset }] droplet pool

  // Mutable animation state kept out of React render to avoid per-frame renders.
  const stateRef = useRef({ running: isOn, level: LEVEL_START });
  stateRef.current.running = isOn;   // keep the loop in sync with the latest prop

  // ---- Paint a 0..1 level onto the tank water rect (y grows downward in SVG).
  const setLevel = (v) => {
    const level = Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, v));
    stateRef.current.level = level;
    const water = tankWaterRef.current;
    const surface = tankSurfaceRef.current;
    if (!water) return;
    const span = TANK_BOTTOM - TANK_TOP;          // usable height
    const waterTop = TANK_BOTTOM - span * level;  // higher level → smaller y
    const h = TANK_BOTTOM - waterTop;
    water.setAttribute('y', waterTop.toFixed(1));
    water.setAttribute('height', h.toFixed(1));
    if (surface) {
      surface.setAttribute('y1', waterTop.toFixed(1));
      surface.setAttribute('y2', waterTop.toFixed(1));
    }
  };

  // ---- One-time: build the droplet pool + start the rAF loop. ----------------
  useEffect(() => {
    const pipe = pipeRef.current;
    const svg = pipe?.ownerSVGElement;
    if (!pipe || !svg) return;

    // Respect reduced motion: paint a static level and skip the animation loop.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const pathLength = pipe.getTotalLength();

    // Create droplet circles in the SVG, layered above the pipe (as in v1).
    const ns = 'http://www.w3.org/2000/svg';
    const drops = [];
    for (let i = 0; i < DROP_COUNT; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('class', 'wf-drop');
      c.setAttribute('r', '3.2');
      svg.appendChild(c);
      drops.push({ el: c, offset: i / DROP_COUNT });  // evenly spaced
    }
    dropsRef.current = drops;

    setLevel(stateRef.current.level);   // initial water level

    let raf = 0;
    let lastTick = 0;
    const loop = (now) => {
      if (!lastTick) lastTick = now;
      const dt = (now - lastTick) / 1000;   // seconds since last frame
      lastTick = now;

      if (stateRef.current.running) {
        // Advance each droplet along the pipe (offset 0 = pump, 1 = cistern).
        const speed = 0.30;                 // fraction of path per second
        for (const d of drops) {
          d.offset += speed * dt;
          if (d.offset > 1) d.offset -= 1;
          const pt = pipe.getPointAtLength(d.offset * pathLength);
          d.el.setAttribute('cx', pt.x.toFixed(1));
          d.el.setAttribute('cy', pt.y.toFixed(1));
        }
        // Gently raise the nominal cistern level while running, then plateau.
        if (stateRef.current.level < LEVEL_MAX) {
          setLevel(stateRef.current.level + 0.012 * dt);
        }
      }
      raf = requestAnimationFrame(loop);
    };

    if (!reduceMotion) raf = requestAnimationFrame(loop);

    // Cleanup: stop the loop and remove the droplet nodes we appended.
    return () => {
      if (raf) cancelAnimationFrame(raf);
      for (const d of drops) d.el.remove();
      dropsRef.current = [];
    };
    // Run once on mount; the loop reads live state via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Status badge state + text ---------------------------------------------
  // Amber "automation off" takes priority over the calm "stopped" state.
  let badgeClass = 'is-stopped';
  let badgeText = 'STOJÍ';
  if (!enabled) {
    badgeClass = 'is-disabled';
    badgeText = 'AUTOMATIKA VYPNUTÁ';
  } else if (isOn) {
    badgeClass = 'is-running';
    badgeText = 'BĚŽÍ';
  }

  // ---- Honest caption — mirrors the v1 three-way copy; never a fake %. -------
  let caption;
  if (!enabled) {
    caption = (
      <><b>Automatika vypnutá.</b> Čerpadlo se nespouští automaticky — jímka se
      neplní. Hladina je pouze orientační.</>
    );
  } else if (isOn) {
    const temp =
      typeof pump?.temperature === 'number' ? `${pump.temperature.toFixed(1)} °C` : '—';
    caption = (
      <><b>Běží.</b> Voda proudí ze studny do jímky · teplota čerpadla {temp}.
      Hladina je orientační, bez reálného čidla.</>
    );
  } else {
    caption = (
      <><b>Stojí.</b> Hladina jímky je orientační — bez reálného čidla úrovně.</>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`wf-card ${isOn ? 'is-on' : 'is-off'}`}
      aria-label="Vizualizace čerpání vody ze studny do jímky"
    >
      {/* Header: water eyebrow + live status badge */}
      <div className="wf-head">
        <div className="wf-eyebrow">
          {/* droplet glyph */}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3 Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>Zahrada · čerpání vody</span>
        </div>
        <span className={`wf-badge ${badgeClass}`}>
          <span className="wf-badge-dot" />
          <span>{badgeText}</span>
        </span>
      </div>

      {/* The scene — viewBox 0 0 600 280 scales fluidly to the container width. */}
      <div className="wf-stage">
        <svg viewBox="0 0 600 280" role="img" aria-labelledby="wf-svg-title"
             preserveAspectRatio="xMidYMid meet">
          <title id="wf-svg-title">Studna, ponorné čerpadlo, potrubí a jímka</title>

          {/* ===== DEFS: gradients + clips ===== */}
          <defs>
            {/* Groundwater / well water column gradient */}
            <linearGradient id="wf-grad-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cool-color, #00b4d8)" stopOpacity="0.55" />
              <stop offset="1" stopColor="var(--cool-color, #00b4d8)" stopOpacity="0.18" />
            </linearGradient>
            {/* Cistern water gradient (slightly deeper / greener at the bottom) */}
            <linearGradient id="wf-grad-tank" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cool-color, #00b4d8)" stopOpacity="0.62" />
              <stop offset="1" stopColor="var(--battery-color, #44d62c)" stopOpacity="0.30" />
            </linearGradient>
            {/* Clip so the tank water never spills past the tank walls. */}
            <clipPath id="wf-tank-clip">
              <rect x="432" y="92" width="126" height="150" rx="8" />
            </clipPath>
            {/* Clip so the well-water column stays inside the casing. */}
            <clipPath id="wf-well-clip">
              <rect x="86" y="96" width="44" height="150" />
            </clipPath>
          </defs>

          {/* ===== GROUND LINE ===== */}
          <line className="wf-ground" x1="0" y1="96" x2="600" y2="96" />
          <text className="wf-sublabel" x="8" y="90" opacity="0.6">ÚROVEŇ TERÉNU</text>

          {/* ===== WELL (Studna) — borehole casing + static groundwater. ===== */}
          <g>
            <rect className="wf-body" x="84" y="96" width="48" height="152" rx="3" />
            <rect className="wf-struct" x="84" y="96" width="48" height="152" rx="3" />
            {/* Well head ring above ground */}
            <rect className="wf-body" x="76" y="84" width="64" height="14" rx="4" />
            <rect className="wf-struct" x="76" y="84" width="64" height="14" rx="4" />

            {/* Static groundwater column (clipped). The aquifer doesn't deplete. */}
            <g clipPath="url(#wf-well-clip)">
              <rect className="wf-water-still" x="86" y="150" width="44" height="98" />
              <line x1="86" y1="150" x2="130" y2="150"
                    stroke="var(--cool-color, #00b4d8)" strokeWidth="1.4" opacity="0.8" />
            </g>

            {/* Casing depth ticks (decorative engineering detail) */}
            <line className="wf-struct-soft" x1="84" y1="124" x2="92" y2="124" />
            <line className="wf-struct-soft" x1="84" y1="150" x2="92" y2="150" />
            <line className="wf-struct-soft" x1="84" y1="176" x2="92" y2="176" />
            <line className="wf-struct-soft" x1="84" y1="202" x2="92" y2="202" />

            <text className="wf-label" x="108" y="272" textAnchor="middle">Studna</text>
          </g>

          {/* ===== SUBMERSIBLE PUMP (Čerpadlo) — pulsing action node @ (108,196). */}
          <g>
            {/* Outer expanding glow ring (animates only while running) */}
            <circle className="wf-pump-glow" cx="108" cy="196" r="17" />
            {/* Soft static ring */}
            <circle className="wf-pump-ring" cx="108" cy="196" r="17" />
            {/* Pump body */}
            <rect className="wf-pump-core" x="96" y="182" width="24" height="30" rx="5" />
            {/* Spinning impeller hint (rotor cross) */}
            <g className="wf-impeller">
              <line x1="108" y1="190" x2="108" y2="204"
                    stroke="var(--cool-color, #00b4d8)" strokeWidth="2" strokeLinecap="round" />
              <line x1="101" y1="197" x2="115" y2="197"
                    stroke="var(--cool-color, #00b4d8)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="108" cy="197" r="2.4" fill="var(--cool-color, #00b4d8)" />
            </g>
            {/* Pump intake feet */}
            <line className="wf-struct-soft" x1="100" y1="212" x2="100" y2="218" />
            <line className="wf-struct-soft" x1="116" y1="212" x2="116" y2="218" />

            <text className="wf-sublabel" x="150" y="200" textAnchor="start">Čerpadlo</text>
          </g>

          {/* ===== PIPE (Potrubí) — pump → above ground → across → into cistern.
               ONE shared path so the droplet loop and dashed flow trace the same
               line. The ref points to the base channel used for length sampling. */}
          <path className="wf-pipe-wall"
                d="M 108 182 L 108 60 Q 108 44 124 44 L 478 44 Q 494 44 494 60 L 494 92" />
          <path ref={pipeRef} className="wf-pipe-base"
                d="M 108 182 L 108 60 Q 108 44 124 44 L 478 44 Q 494 44 494 60 L 494 92" />
          {/* Animated dashed "current" on top (revealed by .is-on) */}
          <path className="wf-pipe-flow"
                d="M 108 182 L 108 60 Q 108 44 124 44 L 478 44 Q 494 44 494 60 L 494 92" />

          <text className="wf-sublabel" x="300" y="36" textAnchor="middle">Potrubí</text>

          {/* Riser detail: small elbow flange where pipe meets pump */}
          <circle className="wf-body" cx="108" cy="182" r="6" />
          <circle className="wf-struct-soft" cx="108" cy="182" r="6" />

          {/* ===== CISTERN / TANK (Jímka) — static walls, JS-driven water level. */}
          <g>
            {/* Tank body (behind water) */}
            <rect className="wf-body" x="432" y="92" width="126" height="150" rx="8" />

            {/* WATER (clipped). y/height set imperatively by setLevel. */}
            <g clipPath="url(#wf-tank-clip)">
              <rect ref={tankWaterRef} className="wf-tank-water"
                    x="432" y="170" width="126" height="72" />
              {/* Animated surface line at the waterline */}
              <line ref={tankSurfaceRef} className="wf-tank-surface"
                    x1="432" y1="170" x2="558" y2="170" />
              {/* Inflow splash under the pipe outlet */}
              <ellipse className="wf-splash" cx="494" cy="172" rx="9" ry="3.2" />
            </g>

            {/* Tank outline (on top of water so edges stay crisp) */}
            <rect className="wf-struct" x="432" y="92" width="126" height="150" rx="8" />
            {/* Tank lid / inlet collar where the pipe enters */}
            <rect className="wf-body" x="480" y="84" width="28" height="12" rx="3" />
            <rect className="wf-struct" x="480" y="84" width="28" height="12" rx="3" />

            {/* Volume tick marks (purely indicative, no numbers) */}
            <line className="wf-struct-soft" x1="432" y1="130" x2="442" y2="130" />
            <line className="wf-struct-soft" x1="432" y1="167" x2="442" y2="167" />
            <line className="wf-struct-soft" x1="432" y1="204" x2="442" y2="204" />

            <text className="wf-label" x="495" y="272" textAnchor="middle">Jímka</text>
          </g>
        </svg>
      </div>

      {/* Honest caption: the level is indicative, not a real sensor reading. */}
      <div className="wf-caption">{caption}</div>
    </div>
  );
}
