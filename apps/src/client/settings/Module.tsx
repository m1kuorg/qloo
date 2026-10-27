import { CheckIcon } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

// The settings' grammar, which the account page shares, so a control is found by its label: each
// module a row of its heading and what it's for, beside its panel on the tone step. From 1024px
// the two sit side by side at 2:3 of the centred column (at 1152px, 442 + 48 + 662), the heading level
// with the panel's first line; below, the heading and help stack over the panel. `heading` takes
// focus when what had it goes, such as a removed row's button.
export function Module({
  id,
  title,
  badge,
  help,
  heading,
  children
}: {
  id: string
  title: string
  badge?: ReactNode
  help: ReactNode
  heading?: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-12"
    >
      <div className="flex flex-col gap-1.5 lg:pt-3.5">
        <h2
          id={id}
          ref={heading}
          tabIndex={heading ? -1 : undefined}
          className="flex items-center gap-2 type-body font-medium"
        >
          {title}
          {badge}
        </h2>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">{help}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl bg-muted p-4">{children}</div>
    </section>
  )
}

// A table's header and body cells in a panel: rules between rows, one step darker than the tone step
// so they read on it, and the actions in a trailing column. Each column's name stays on one line.
export const head = 'border-b border-foreground/10 pr-3 pb-2 text-left align-bottom font-normal whitespace-nowrap'
export const cell = 'border-b border-foreground/10 py-2 pr-3 align-middle'

// The centred column the modules stand in, under the page's title row.
export const settingsColumn = 'mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 pt-6 pb-16 lg:px-6'

// A change's success line, such as "Saved.", after an ink check. The line is always there, so a screen
// reader hears the words as they appear.
export const Done = ({ shown, children }: { shown: boolean; children: ReactNode }) => (
  <span role="status" className="inline-flex items-center gap-1.5 text-muted-foreground">
    {shown && (
      <>
        <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-foreground" />
        {children}
      </>
    )}
  </span>
)
