// shadcn's base-nova radio group on the tokens: the control outline is --input at 3:1, the focus ring
// is the stylesheet's own, and there's no dark-mode override, since the tokens carry dark mode.
import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { cn } from 'cn'

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid w-full gap-2', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'relative flex aspect-square size-4 shrink-0 rounded-full border border-input bg-card outline-none data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="size-1.5 rounded-full bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

// A radio as one option of a segmented control: the radio is the option itself, its words inside it.
function RadioGroupSegment({ className, ...props }: RadioPrimitive.Root.Props) {
  return <RadioPrimitive.Root data-slot="radio-group-segment" className={className} {...props} />
}

export { RadioGroup, RadioGroupItem, RadioGroupSegment }
