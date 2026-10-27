// Forked from shadcn's base-nova sheet: on the tokens (8px corners on its inner edge, the one floating
// shadow, no rule along its edge, over the scrim while it's modal, no backdrop blur), full width on a
// phone and 400px from 640px, and with two props of its own: `overlay`, off for a non-modal sheet that
// leaves the page usable, and `keepMounted`, which keeps the popup in the DOM while it's closed, so ids
// inside it stay present. A modal sheet, open, makes the page under it inert (./modal-layer.ts). Don't
// re-add the original with `shadcn add sheet --overwrite`.
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { cn } from 'cn'
import { useCallback } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModalOpen, useModalLayer } from '@/components/ui/modal-layer'

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return (
    <ModalOpen.Provider value={Boolean(props.open) && (props.modal ?? true) === true}>
      <SheetPrimitive.Root data-slot="sheet" {...props} />
    </ModalOpen.Provider>
  )
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0',
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  overlay = true,
  keepMounted = false,
  ref,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
  overlay?: boolean
  keepMounted?: boolean
  ref?: React.Ref<HTMLDivElement>
}) {
  const layer = useModalLayer()
  // The popup to the modal layer and to the caller's ref, such as the inspector's.
  const popupRef = useCallback(
    (el: HTMLDivElement | null) => {
      layer(el)
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [layer, ref]
  )
  return (
    <SheetPortal keepMounted={keepMounted}>
      {overlay && <SheetOverlay />}
      <SheetPrimitive.Popup
        ref={popupRef}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-popover-foreground shadow-float transition duration-200 ease-swap data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:rounded-t-xl data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-full data-[side=left]:rounded-r-xl data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:rounded-l-xl data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:rounded-b-xl data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-[400px] data-[side=right]:sm:max-w-[400px]',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3 max-md:size-11" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-0.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
