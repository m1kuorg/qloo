// Forked from shadcn's base-nova alert dialog, trimmed to the parts the app uses and set on the tokens:
// the app's one confirm for a destructive action, its consequence in words, the verb on the destructive
// button and the escape (Cancel) secondary, since there's no outline variant. 8px corners and the one
// floating shadow (a light ring and a deeper shadow in the dark), over the scrim, with no backdrop
// blur, left-aligned at every width, a footer without a rule or band, and while it's open the page
// under it inert (./modal-layer.ts). Base UI injects no <style> under the island's CSPProvider, so it
// runs under the production policy. Don't re-add the original with
// `shadcn add alert-dialog --overwrite`.
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { ModalOpen, useModalLayer } from '@/components/ui/modal-layer'

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return (
    <ModalOpen.Provider value={Boolean(props.open)}>
      <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
    </ModalOpen.Provider>
  )
}

function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  const layer = useModalLayer()
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 isolate z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <AlertDialogPrimitive.Popup
        ref={layer}
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl bg-popover p-6 text-popover-foreground shadow-float transition duration-150 ease-swap outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:max-w-md',
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-base leading-snug font-semibold text-balance text-foreground', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-pretty text-muted-foreground', className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = 'destructive-solid',
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" variant={variant} className={cn(className)} {...props} />
}

function AlertDialogCancel({
  className,
  variant = 'secondary',
  size = 'default',
  ...props
}: AlertDialogPrimitive.Close.Props & Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
}
