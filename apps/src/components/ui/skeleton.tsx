// Forked from shadcn's skeleton: a still block in the shape of what's loading, with no pulse, since
// the app moves only in answer to the person (a press, a menu opening, a row arriving), never to draw
// the eye; the state line beside it says it's working. Don't restore its pulse with
// `shadcn add skeleton --overwrite`.
import { cn } from 'cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('rounded-md bg-muted', className)} {...props} />
}

export { Skeleton }
