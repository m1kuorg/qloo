/** @jsxImportSource hono/jsx */
import type { Child } from 'hono/jsx'

// The server-rendered shells' icons: Lucide's (lucide.dev, ISC licence), whose React copies the island
// renders from lucide-react. Hono JSX can't render those, so these are their paths, on Lucide's 24px
// grid with its 2px stroke. Decorative: the link or button each sits in names what it does.
const Icon = ({ class: className, children }: { class?: string; children: Child }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class={className}
  >
    {children}
  </svg>
)
type IconProps = { class?: string }

export const Rocket = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09" />
    <path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" />
  </Icon>
)
// Lucide's "podcast": the roster is the network's shows.
export const Podcast = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 17v4" />
    <path d="M18 11a6 6 0 00-3-5.197" />
    <path d="M2 11a10 10 0 015-8.662" />
    <path d="M22 11a10 10 0 00-5-8.662" />
    <path d="M6 11a6 6 0 013-5.197" />
    <path d="M9 21h6" />
    <rect x="10" y="9" width="4" height="8" rx="2" />
  </Icon>
)
export const Inbox = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
)
export const Settings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)
export const ChevronsUpDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </Icon>
)
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)
