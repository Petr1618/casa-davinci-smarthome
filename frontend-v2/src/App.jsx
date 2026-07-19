import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './shell/AppShell.jsx';
import { AREAS, DEFAULT_AREA } from './shell/areas.js';
import ComingSoon from './areas/ComingSoon.jsx';
import Domov from './areas/Domov.jsx';
import Zahrada from './areas/Zahrada.jsx';
import Elektrarna from './areas/Elektrarna.jsx';

// Map area id -> the component that renders it. Areas still marked
// `comingSoon` fall back to the shared placeholder, so the whole 8-area
// navigation is live from day one and we port real content area by area.
const AREA_VIEWS = {
  domov: Domov,
  zahrada: Zahrada,
  elektrarna: Elektrarna
};

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={`/${DEFAULT_AREA}`} replace />} />
        {AREAS.map((area) => {
          const View = AREA_VIEWS[area.id];
          return (
            <Route
              key={area.id}
              path={`/${area.id}/*`}
              element={View ? <View area={area} /> : <ComingSoon area={area} />}
            />
          );
        })}
        <Route path="*" element={<Navigate to={`/${DEFAULT_AREA}`} replace />} />
      </Routes>
    </AppShell>
  );
}
