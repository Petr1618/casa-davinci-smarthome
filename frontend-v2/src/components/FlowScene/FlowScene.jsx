// =============================================================================
// FlowScene — a GENERIC, domain-agnostic "live flow diagram" engine.
//
// It draws a set of NODES (circular stations) connected by PIPES (caller-supplied
// SVG paths), and animates flow along the pipes that are marked `active`. There
// is ZERO domain knowledge inside: no energy maths, no water levels, no units
// logic. You feed it pure geometry + state (where things are, what colour, on or
// off) and it renders an animated SVG. The same component therefore renders an
// energy-flow diagram, a water circuit, OR a refrigeration/cooling loop — only
// the props differ.
//
// Animation technique (reused from the Zahrada WaterFlow showpiece):
//   · CSS dashed "current": each active pipe gets a thin dashed stroke whose
//     `stroke-dashoffset` is animated by a keyframe → a flowing-current look.
//   · JS droplets: small <circle>s ride each active pipe path. We sample the
//     path with getPointAtLength() inside ONE shared requestAnimationFrame loop
//     for ALL pipes (not one loop per pipe), and mutate the circle's cx/cy
//     imperatively via refs — so there is NO React re-render per frame.
//   · prefers-reduced-motion: we skip the rAF loop entirely and the CSS keyframes
//     are frozen by a media query in flow-scene.css.
//
// -----------------------------------------------------------------------------
// USAGE — ENERGY FLOW (Casa DaVinci dashboard):
//
//   const NODES = [
//     { id: 'solar',   label: 'Solár',  value: '1.2', unit: 'kW', x: 300, y:  70,
//       color: 'var(--solar-color)',   icon: '☀',  active: true },
//     { id: 'battery', label: 'Baterie', value: '99', unit: '%', sub: 'nabíjí',
//       x: 110, y: 230, color: 'var(--battery-color)', icon: '🔋', active: true },
//     { id: 'home',    label: 'Dům',    value: '0.8', unit: 'kW', x: 490, y: 230,
//       color: 'var(--home-color)',    icon: '🏠', active: true },
//   ];
//   const PIPES = [
//     { id: 'solar-home', d: 'M 300 116 L 300 180 Q 300 200 320 210 L 460 230',
//       color: 'var(--solar-color)',   active: true, dir: 1 },
//     { id: 'solar-batt', d: 'M 300 116 L 300 180 Q 300 200 280 210 L 150 230',
//       color: 'var(--battery-color)', active: true, dir: 1 },
//   ];
//   <FlowScene viewBox="0 0 600 400" nodes={NODES} pipes={PIPES} />
//
// The SAME component, fed nodes like Kompresor / Kondenzátor / Výparník and pipes
// coloured warm (hot gas) / cool (liquid), renders a refrigeration/cooling loop —
// no code change, just different props.
// =============================================================================

import { useEffect, useRef } from 'react';
import './flow-scene.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Default node radius if a NODE doesn't specify one.
const DEFAULT_NODE_R = 46;

// Droplet tuning. Droplets are spaced proportionally to each pipe's length so a
// long pipe gets more droplets than a short one (constant visual density).
const DROPLET_SPACING = 90;     // viewBox units between droplets along a path
const MIN_DROPLETS = 3;         // never fewer than this on an active pipe
const MAX_DROPLETS = 24;        // safety cap for very long paths
const DROPLET_SPEED = 0.28;     // fraction of the path travelled per second
const DROPLET_RADIUS = 3.2;     // circle radius in viewBox units

/**
 * FlowScene
 * @param {string} viewBox  - SVG viewBox, e.g. "0 0 600 400". Drives responsiveness.
 * @param {Array}  nodes    - NODE[] (see file header for the exact shape).
 * @param {Array}  pipes    - PIPE[] (see file header for the exact shape).
 */
export default function FlowScene({ viewBox = '0 0 600 400', nodes = [], pipes = [] }) {
  // Ref to the live <svg>. The rAF loop appends/queries droplet circles inside it.
  const svgRef = useRef(null);

  // Refs to each active pipe's <path> element, keyed by pipe id. The loop samples
  // these paths with getPointAtLength(). Populated on render via the ref callback.
  const pathRefs = useRef(new Map());

  // The current droplet pool, rebuilt whenever the set of active pipes changes.
  // Each entry: { el, path, dir, offset, length }.
  const dropsRef = useRef([]);

  // A stable "signature" of the active pipes. When it changes we rebuild droplets.
  // Includes id + path data + direction so geometry edits are picked up too.
  const activeSignature = pipes
    .filter((p) => p.active)
    .map((p) => `${p.id}|${p.dir ?? 1}|${p.d}`)
    .join('::');

  // ---- Build droplet pool + run ONE shared rAF loop for all active pipes. -----
  // Re-runs only when the active-pipe signature changes (not every frame, not on
  // unrelated prop tweaks). This is the "rebuild pool when active pipes change"
  // requirement from the spec.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Respect the OS "reduce motion" preference: render nothing dynamic and let
    // the CSS media query freeze the dashed-current keyframes.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    // (Re)build the droplet pool for the currently-active pipes.
    const drops = [];
    for (const pipe of pipes) {
      if (!pipe.active) continue;
      const path = pathRefs.current.get(pipe.id);
      if (!path) continue;

      const length = path.getTotalLength();
      if (!length) continue;

      // Density-based count: longer pipe → more droplets, clamped to [MIN, MAX].
      const count = Math.max(
        MIN_DROPLETS,
        Math.min(MAX_DROPLETS, Math.round(length / DROPLET_SPACING)),
      );
      const dir = pipe.dir === -1 ? -1 : 1;

      for (let i = 0; i < count; i++) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', 'fs-drop');
        c.setAttribute('r', String(DROPLET_RADIUS));
        // Tint each droplet with its pipe's colour (may be a CSS variable).
        c.setAttribute('fill', pipe.color);
        // Hint the glow filter colour via a CSS custom property on the element.
        c.style.setProperty('--fs-drop-color', pipe.color);
        svg.appendChild(c);
        drops.push({
          el: c,
          path,
          dir,
          length,
          offset: i / count, // evenly spaced along [0,1)
        });
      }
    }
    dropsRef.current = drops;

    // Single rAF loop driving EVERY droplet across ALL active pipes.
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      if (!last) last = now;
      const dt = (now - last) / 1000; // seconds since previous frame
      last = now;

      for (const d of dropsRef.current) {
        // Advance along the path; dir flips travel direction. Wrap within [0,1).
        d.offset += d.dir * DROPLET_SPEED * dt;
        d.offset -= Math.floor(d.offset); // robust positive modulo into [0,1)
        const pt = d.path.getPointAtLength(d.offset * d.length);
        d.el.setAttribute('cx', pt.x.toFixed(1));
        d.el.setAttribute('cy', pt.y.toFixed(1));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Cleanup: stop the loop and remove the droplet circles we appended so the
    // next rebuild starts from a clean SVG.
    return () => {
      if (raf) cancelAnimationFrame(raf);
      for (const d of drops) d.el.remove();
      dropsRef.current = [];
    };
    // We intentionally depend on the active signature only — geometry/state of
    // active pipes. pipes is read fresh inside via closure on each rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSignature]);

  return (
    <svg
      ref={svgRef}
      className="fs-svg"
      viewBox={viewBox}
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ===== PIPES (drawn FIRST, so nodes sit on top) =====================
          Each pipe is a stack of strokes:
            · fs-pipe-wall  — fat outer casing (border colour)
            · fs-pipe-base  — channel filled with the card surface colour
            · fs-pipe-flow  — thin dashed "current", animated only when active
          Droplets (JS) are appended above all of this by the rAF loop. */}
      <g className="fs-pipes">
        {pipes.map((pipe) => {
          const dir = pipe.dir === -1 ? -1 : 1;
          return (
            <g
              key={pipe.id}
              className={`fs-pipe ${pipe.active ? 'is-on' : 'is-off'}`}
              style={{ '--fs-pipe-color': pipe.color }}
            >
              <path className="fs-pipe-wall" d={pipe.d} />
              <path className="fs-pipe-base" d={pipe.d} />
              <path
                // Store this active pipe's <path> ref so the rAF loop can sample
                // it. We attach the ref to the FLOW path (same geometry as base).
                ref={(el) => {
                  if (el) pathRefs.current.set(pipe.id, el);
                  else pathRefs.current.delete(pipe.id);
                }}
                className="fs-pipe-flow"
                // The dashed current visually travels with `dir`: a negative
                // direction flips the keyframe via this data attribute.
                data-dir={dir}
                d={pipe.d}
              />
              {pipe.label && pipe.labelXY && (
                <text
                  className="fs-pipe-label"
                  x={pipe.labelXY[0]}
                  y={pipe.labelXY[1]}
                  textAnchor="middle"
                >
                  {pipe.label}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* ===== NODES (drawn ON TOP of pipes) ===============================
          A circle outlined in the node colour, with icon + value/unit (+ sub).
          When active, a pulsing glow ring in the node colour. */}
      <g className="fs-nodes">
        {nodes.map((node) => {
          const r = node.r ?? DEFAULT_NODE_R;
          return (
            <g
              key={node.id}
              className={`fs-node ${node.active ? 'is-active' : ''}`}
              style={{ '--fs-node-color': node.color }}
              transform={`translate(${node.x} ${node.y})`}
            >
              {/* Pulsing glow ring — animates only while active (CSS). */}
              <circle className="fs-node-glow" r={r} />
              {/* Solid backing so pipes don't show through the node face. */}
              <circle className="fs-node-fill" r={r} />
              {/* Coloured outline ring. */}
              <circle className="fs-node-ring" r={r} />

              {/* Icon (emoji / short glyph), sitting in the upper half. */}
              {node.icon && (
                <text className="fs-node-icon" x="0" y={-r * 0.22} textAnchor="middle">
                  {node.icon}
                </text>
              )}

              {/* Value + unit on the main line. Caller pre-formats the value. */}
              {(node.value || node.unit) && (
                <text className="fs-node-value" x="0" y={r * 0.28} textAnchor="middle">
                  {node.value}
                  {node.unit && <tspan className="fs-node-unit"> {node.unit}</tspan>}
                </text>
              )}

              {/* Optional small second line (e.g. "99 %"). */}
              {node.sub && (
                <text className="fs-node-sub" x="0" y={r * 0.56} textAnchor="middle">
                  {node.sub}
                </text>
              )}

              {/* Label OUTSIDE the circle, just below it. */}
              {node.label && (
                <text className="fs-node-label" x="0" y={r + 18} textAnchor="middle">
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
