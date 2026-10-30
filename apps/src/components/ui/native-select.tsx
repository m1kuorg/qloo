// shadcn's base-nova native select on the tokens, trimmed to what the app uses: a <select> drawn as the
// select's trigger (select.tsx), a control on the card outlined at --input's 3:1, with the stylesheet's
// focus ring and no dark-mode override, 44px tall on a phone, and the chevron over its right end. Its
// options open in the browser's own list, so nothing floats under the production policy, and they're in
// the page's markup, each with its disabled state, as a page rendered on the server holds them. The
// options take the system's colours, which follow the page's colour scheme. Don't re-add the original
// with `shadcn add native-select --overwrite`.
import * as React from 'react'
import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div
      className={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        className="h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-input bg-card py-1 pr-8 pl-2.5 text-sm text-foreground transition-colors outline-none hover:bg-muted disabled:cursor-not-allowed aria-invalid:border-destructive max-md:h-11"
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option data-slot="native-select-option" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
  )
}

export { NativeSelect, NativeSelectOption }
