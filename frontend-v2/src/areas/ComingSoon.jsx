import AreaIcon from '../shell/AreaIcon.jsx';
import './coming-soon.css';

// Shared placeholder for areas that have no real content yet. Keeps the whole
// 8-area navigation live and self-explanatory while we port content area by area.
export default function ComingSoon({ area }) {
  return (
    <div className="cs-wrap">
      <div className="cs-card" style={{ '--acc': area.accent, '--acc-soft': area.accentSoft }}>
        <div className="cs-icon"><AreaIcon id={area.id} size={30} /></div>
        <div className="cs-badge">Připravujeme</div>
        <h1 className="cs-title">{area.label}</h1>
        <p className="cs-blurb">{area.blurb}</p>
      </div>
    </div>
  );
}
