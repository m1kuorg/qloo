// The Crossfeed mark, for the island: the twin of the server's ../mark.tsx, which says what it is;
// keep the two alike, and ../../scripts/mark.svg, which the favicon and the home screen's icons are
// drawn from.
export const Mark = ({ className = 'size-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M3.54 8.92 20.46 15.08M3.54 15.08 20.46 8.92" fill="none" stroke="currentColor" strokeWidth="3" />
    <path d="M7.61 12 12 10.4 16.39 12 12 13.6Z" className="fill-signal" />
  </svg>
)
