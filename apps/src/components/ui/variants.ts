// The class recipes the island's components and the server's pages share. Hono JSX can't render
// React components, so a server page sets these classes on its own elements; this module has no
// React in it, so importing it keeps the island's code out of the Worker's routes. The shadcn
// components in this folder import their variants from here (brief: Stack and architecture).
// Each recipe returns merged classes, so a server page gets the same result as the component.
import { cva } from 'class-variance-authority'
import { cn } from 'cn'

const merged =
  <P>(recipe: (props?: P) => string) =>
  (props?: P) =>
    cn(recipe(props))

// Flat, one fill, 6px corners. App controls are 32px tall (sm, row actions, 28px); marketing pages
// use lg, 44px. Destructive is a crimson outline; destructive-solid, its fill, is only for the verb
// inside its confirm dialog. There's no outline variant: a shadcn component that asks for one gets
// secondary or ghost instead.
const button = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)]',
        ghost: 'text-foreground hover:bg-muted aria-expanded:bg-muted',
        link: 'text-foreground underline decoration-1 underline-offset-4 hover:decoration-2',
        destructive: 'border-destructive bg-transparent text-destructive hover:bg-destructive/10',
        'destructive-solid': 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      },
      size: {
        default: 'h-8 px-3 type-ui has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        sm: "h-7 gap-1 px-2.5 type-ui has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-2 px-5 type-body has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-lg': 'size-11'
      }
    },
    // A link sits in a line of text, whatever its size.
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'default', size: 'default' }
  }
)
export const buttonVariants = merged(button)

// Chips: tone-filled (default), outlined at the controls' 3:1 (outline), and crimson (destructive).
// `mark` sets a small glyph before the words, drawn in CSS so screen readers don't read it: the
// "Qloo data" chip's ink square, the "Agent" chip's circle, a finalist's signal dot. Source chips
// never look alike: Qloo data is outline + square, Agent is default + circle.
const badge = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-transparent px-1.5 type-caption font-medium whitespace-nowrap before:shrink-0 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground',
        outline: 'border-input text-foreground',
        destructive: 'border-destructive text-destructive'
      },
      mark: {
        none: '',
        square: 'before:size-1.5 before:rounded-[1px] before:bg-foreground',
        circle: 'before:size-1.5 before:rounded-full before:bg-foreground',
        signal: 'before:size-2 before:rounded-full before:bg-signal'
      }
    },
    defaultVariants: { variant: 'default', mark: 'none' }
  }
)
export const badgeVariants = merged(badge)

// A call number, such as C-21, which opens its evidence: mono, as codes are, dotted underneath
// until it's open, then in ink.
const call = cva(
  'inline-flex h-5 items-center rounded-lg px-1 font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:no-underline'
)
export const callVariants = merged(call)
