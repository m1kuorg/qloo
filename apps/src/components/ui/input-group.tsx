// Forked from shadcn's input group, trimmed to a text addon beside an input, such as the CPM's "$",
// and set on the tokens: one outline at --input's 3:1 on the card around both, and the stylesheet's
// focus ring around the group while its input holds focus (style.css). `shadcn add input-group` would
// overwrite the forked button and input: don't run it.
import { cn } from 'cn'
import { Input } from '@/components/ui/input'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-card transition-colors has-disabled:opacity-50 has-[[data-slot][aria-invalid=true]]:border-destructive max-md:h-11',
        className
      )}
      {...props}
    />
  )
}

// Clicking the addon focuses the input, as clicking its label would.
function InputGroupAddon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        'order-first flex h-auto cursor-text items-center justify-center pl-2.5 text-muted-foreground select-none',
        className
      )}
      onClick={(e) => e.currentTarget.parentElement?.querySelector('input')?.focus()}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn('h-full flex-1 rounded-none border-0 bg-transparent pl-1 max-md:h-full', className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
