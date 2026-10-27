// Forked from shadcn's spinner: hidden from screen readers, since every state in Crossfeed leads with
// its word (states.tsx), which says it instead. Don't restore its role="status" with
// `shadcn add spinner --overwrite`.
import { cn } from 'cn'
import { Loader2Icon } from 'lucide-react'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon data-slot="spinner" aria-hidden="true" className={cn('size-4 animate-spin', className)} {...props} />
  )
}

export { Spinner }
