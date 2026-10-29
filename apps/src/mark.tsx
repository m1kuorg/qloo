/** @jsxImportSource hono/jsx */

// The Crossfeed mark: two short bars crossing at a shallow angle, like two feeds crossing, in ink
// with the crossing in signal. Decorative: the link or wordmark beside it names Crossfeed. Hono JSX
// can't render the island's copy, client/Mark.tsx, so this is its twin; keep the two alike, and
// ../scripts/mark.svg, which the favicon and the home screen's icons are drawn from, and
// ../scripts/banner.html, the link-embed banner's source.
export const Mark = ({ class: className = 'size-6' }: { class?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" class={className}>
    <path d="M3.54 8.92 20.46 15.08M3.54 15.08 20.46 8.92" fill="none" stroke="currentColor" stroke-width="3" />
    <path d="M7.61 12 12 10.4 16.39 12 12 13.6Z" class="fill-signal" />
  </svg>
)
