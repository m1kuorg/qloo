// shadcn's base-nova input on the tokens: on the card whatever it sits on, outlined at --input's 3:1,
// with the stylesheet's focus ring and no dark-mode override. It sets no `type` unless given one, as
// the workspace's text boxes need (test/ask.test.ts counts them so), and turns autofill off unless a
// field asks for it (autoComplete="name"), so a roster, a budget or a network's name isn't offered a
// password manager's entries.
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from 'cn'

function Input({ className, type, autoComplete = 'off', ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      autoComplete={autoComplete}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className
      )}
      {...props}
    />
  )
}

export { Input }
