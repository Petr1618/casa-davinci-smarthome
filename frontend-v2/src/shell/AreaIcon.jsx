// Thin-stroke area icons (Precision language — 1.5px strokes, round caps).
// Rendered at 17px in the rail; stroke follows currentColor so the active
// area accent colours the icon for free.
const ICONS = {
  domov: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10v9h11v-9" />
    </>
  ),
  elektrarna: <path d="M13 3 6.5 13.5h5L10.8 21l6.7-10.5h-5.1L13 3Z" />,
  energie: (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20v-6" />
      <path d="M12 20V9" />
      <path d="M16.5 20v-8.5" />
    </>
  ),
  dum: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M12 4v8M12 12h8M4 12h4.5" />
    </>
  ),
  zahrada: (
    <>
      <path d="M5 19c0-8.8 6.2-14 15-14 0 8.8-6.2 14-15 14Z" />
      <path d="M5 19C8.5 14.5 12.5 11 17 8" />
    </>
  ),
  garaz: (
    <>
      <path d="M3.5 16.5h17" />
      <path d="M5 16.5l1.5-5.3a1.8 1.8 0 0 1 1.7-1.4h7.6a1.8 1.8 0 0 1 1.7 1.4l1.5 5.3" />
      <circle cx="8" cy="18.7" r="1.3" />
      <circle cx="16" cy="18.7" r="1.3" />
    </>
  ),
  zabezpeceni: <path d="M12 3l7 2.8V11c0 4.8-2.9 8.2-7 10-4.1-1.8-7-5.2-7-10V5.8L12 3Z" />,
  system: (
    <>
      <path d="M4 7.5h16M4 12h16M4 16.5h16" />
      <circle cx="9.5" cy="7.5" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="7.5" cy="16.5" r="1.6" />
    </>
  )
};

export default function AreaIcon({ id, size = 17 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[id] || null}
    </svg>
  );
}
