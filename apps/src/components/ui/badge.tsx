// Forked from shadcn's base-nova badge: its variants live in ./variants.ts, which server pages share.
// Don't re-add them here with `shadcn add badge --overwrite`; edit ./variants.ts.
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { badgeVariants } from './variants'

function Badge({
  className,
  variant = 'default',
  mark = 'none',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant, mark }), className) }, props),
    render,
    state: { slot: 'badge', variant }
  })
}

export { Badge, badgeVariants }
