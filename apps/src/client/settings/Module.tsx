import { CheckIcon } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { Section } from '../PageHeader'

// A settings module, which the account page shares, so a control is found by its label: a `Section`,
// its heading and the one sentence of what it's for, over its panel on the tone step. Modules stack in
// the centred column, the panel the column's width. `heading` takes focus when what had it goes, such as
// a removed row's button.
export function Module({
  id,
  title,
  badge,
  description,
  heading,
  children
}: {
  id: string
  title: string
  badge?: ReactNode
  description: ReactNode // one sentence
  heading?: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  return (
    <Section id={id} title={title} badge={badge} description={description} heading={heading}>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl bg-muted p-4">{children}</div>
    </Section>
  )
}

// A table's header and body cells in a panel: rules between rows, one step darker than the tone step
// so they read on it, and the actions in a trailing column. Each column's name stays on one line.
export const head = 'border-b border-foreground/10 pr-3 pb-2 text-left align-bottom font-normal whitespace-nowrap'
export const cell = 'border-b border-foreground/10 py-2 pr-3 align-middle'

// The centred column the modules stand in, under the page's title row: 768px, so from 1024px a module's
// panel is 720px wide (768 - 2 × 24), its sentences on a measure.
export const settingsColumn = 'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-16 lg:px-6'

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
