import './coming-soon.css';

// Shared placeholder for areas that have no real content yet. Keeps the whole
// 8-area navigation live and self-explanatory while we port content area by area.
export default function ComingSoon({ area }) {
  return (
    <div className="cs-wrap">
      <div className="cs-card" style={{ '--area-accent': area.accent }}>
        <div className="cs-icon">{area.icon}</div>
        <div className="cs-badge">Připravujeme</div>
        <h1 className="cs-title">{area.label}</h1>
        <p className="cs-blurb">{area.blurb}</p>
      </div>
    </div>
  );
}
