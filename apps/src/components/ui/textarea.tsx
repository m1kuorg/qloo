// shadcn's base-nova textarea on the tokens, as ./input.tsx is: on the card whatever it sits on,
// outlined at --input's 3:1, with the stylesheet's focus ring and no dark-mode override. It grows
// with what's typed where the browser can (field-sizing), with autofill off unless a field asks for it.
import * as React from 'react'
import { cn } from 'cn'

function Textarea({ className, autoComplete = 'off', ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      autoComplete={autoComplete}
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
