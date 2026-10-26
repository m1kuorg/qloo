// Forked from shadcn's base-nova button: its variants live in ./variants.ts, which server pages share.
// Don't re-add them here with `shadcn add button --overwrite`; edit ./variants.ts.
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { buttonVariants } from './variants'

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
