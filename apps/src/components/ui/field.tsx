// Forked from shadcn's field, trimmed to the parts the app uses and set on the tokens: a label 8px over
// its control, fields 16px apart in a group, help in caption under the control, and no choice-card
// or separator styles. Help breaks a word too long for its line, such as a network's name with no
// spaces, and a legend, as wide as its words, breaks it anywhere. Errors stay the app's own Alert
// (role="alert") under the form. Don't re-add the original with `shadcn add field --overwrite`.
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Label } from '@/components/ui/label'

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('flex min-w-0 flex-col gap-2', className)} {...props} />
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return <legend data-slot="field-legend" className={cn('mb-2 font-medium wrap-anywhere', className)} {...props} />
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field-group" className={cn('group/field-group flex w-full flex-col gap-4', className)} {...props} />
  )
}

const fieldVariants = cva('group/field flex w-full gap-2 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      vertical: 'flex-col *:w-full [&>.sr-only]:w-auto',
      horizontal:
        'flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=radio]]:mt-0.5'
    }
  },
  defaultVariants: { orientation: 'vertical' }
})

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn('group/field-content flex flex-1 flex-col gap-0.5 leading-snug', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 group-data-[disabled=true]/field:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-left type-caption font-normal break-words text-muted-foreground [&>a]:underline [&>a]:underline-offset-4',
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet }
