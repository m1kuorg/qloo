// The class recipes the island's components and the server's pages share. Hono JSX can't render
// React components, so a server page sets these classes on its own elements; this module has no
// React in it, so importing it keeps the island's code out of the Worker's routes. The shadcn
// components in this folder import their variants from here, so the two can't drift apart. Each
// recipe returns merged classes, so a server page gets the same result as the component.
import { cva } from 'class-variance-authority'
import { cn } from 'cn'

const merged =
  <P>(recipe: (props?: P) => string) =>
  (props?: P) =>
    cn(recipe(props))

// The width every marketing page sets its blocks in, which the sign-in and invite pages share so they
// line up with the wordmark over them: 24px margins, 40px from 768px, and content up to 1376px wide.
export const marketingFrame = 'mx-auto w-full max-w-[1456px] px-6 md:px-10'

// A link in a line of text: underlined at 1px, 2px under the pointer, at the line's own size. In the
// app it's ink at 500 (the default), so it stands out of a muted caption; on the reading pages it
// keeps the text's colour and weight (`tone: 'text'`), as the articles' own links do (style.css,
// prose-doc). The button's link variant wears the app's.
const link = cva('underline decoration-1 underline-offset-4 hover:decoration-2', {
  variants: { tone: { ink: 'font-medium text-foreground', text: '' } },
  defaultVariants: { tone: 'ink' }
})
export const linkVariants = merged(link)

// Flat, one fill, 6px corners. App controls are 32px tall (sm, row actions, 28px); marketing pages
// use lg, 44px. Under 768px every size is 44px tall, a finger's target; a link keeps its line's height
// and reaches 44px with padding it gives back as negative margin, so the line doesn't grow. Destructive
// is a crimson outline; destructive-solid, its fill, is only for the verb inside its confirm dialog.
// There's no outline variant: a shadcn component that asks for one gets secondary or ghost instead.
const button = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)]',
        ghost: 'text-foreground hover:bg-muted aria-expanded:bg-muted',
        link: linkVariants(),
        destructive: 'border-destructive bg-transparent text-destructive hover:bg-destructive/10',
        'destructive-solid': 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      },
      size: {
        default: 'h-8 px-3 type-ui has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 max-md:h-11',
        sm: "h-7 gap-1 px-2.5 type-ui has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 max-md:h-11 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-2 px-5 type-body has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        icon: 'size-8 max-md:size-11',
        'icon-sm': 'size-7 max-md:size-11',
        'icon-lg': 'size-11'
      }
    },
    // A link sits in a line of text, whatever its size.
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 max-md:-my-3 max-md:h-auto max-md:py-3' }],
    defaultVariants: { variant: 'default', size: 'default' }
  }
)
export const buttonVariants = merged(button)

// A text field: on the card whatever it sits on, outlined at --input's 3:1, 32px tall (44px under
// 768px), with the stylesheet's focus ring, crimson once invalid. Its text is 16px on a phone, so iOS
// doesn't zoom in on focus. The landing page's fragments set it on a span.
const input = cva(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive max-md:h-11 md:text-sm'
)
export const inputVariants = merged(input)

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

// A segmented control: its options side by side on a tone-step track, the chosen one raised onto the
// card with the controls' 3:1 outline, so it reads apart without colour. 32px tall; under 768px the
// track is 44px and its items 40px. The item marks its choice whichever way it's built: a Base UI tab
// (data-active) or radio (data-checked), or a server page's label around a native radio (has-checked).
const segmentedTrack = cva(
  'inline-flex h-8 w-fit max-w-full items-center gap-0.5 rounded-lg bg-muted p-0.5 max-md:h-11'
)
export const segmentedTrackVariants = merged(segmentedTrack)
const segmentedItem = cva(
  'inline-flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors select-none hover:text-foreground has-checked:border-input has-checked:bg-card has-checked:text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50 data-active:border-input data-active:bg-card data-active:text-foreground data-checked:border-input data-checked:bg-card data-checked:text-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 max-md:h-10'
)
export const segmentedItemVariants = merged(segmentedItem)

// A call number, such as C-21, which opens its evidence: mono, as codes are, dotted underneath
// until it's open, then in ink.
const call = cva(
  'inline-flex h-5 items-center rounded-lg px-1 font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:no-underline'
)
export const callVariants = merged(call)
