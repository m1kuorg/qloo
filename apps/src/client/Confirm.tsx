import { useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { Alert } from './controls'

// A destructive action as its confirm asks it: the question, what follows from it, the verb on the
// destructive button and its words while it runs, and the escape on the other button. `primary` puts the
// verb on the ink primary instead, for a send that spends or changes but deletes nothing, as the
// playground's do.
export type Confirmation = {
  title: string
  consequence: ReactNode
  verb: string
  busy: string
  keep: string
  primary?: boolean
  // Runs from the dialog, which shows a refusal and stays open, and closes once it's done. With
  // `after`, the dialog closes first and the action runs once it's gone, which handles its own
  // refusal: a change that may ask the member to confirm it's them must, so the step-up never stacks
  // on the confirm.
  action: () => Promise<unknown>
  after?: boolean
}

// The app's one confirm for a destructive action, so every delete, removal, revocation and sign-out
// asks the same way, its consequence spelled out and its verb on the button: `confirm` asks, and
// `dialog`, rendered once anywhere in the module, is the AlertDialog. Focus goes back to what opened
// it, or, when that's gone with what it removed, to `fallback`.
export function useConfirm(fallback?: RefObject<HTMLElement | null>) {
  const [asked, setAsked] = useState<Confirmation | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  // An `after` action, waiting for the dialog to finish closing.
  const pending = useRef<Confirmation['action'] | null>(null)

  const confirm = (c: Confirmation) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAsked(c)
    setError(null)
    setOpen(true)
  }
  const go = async () => {
    if (!asked) return
    if (asked.after) {
      pending.current = asked.action
      return setOpen(false)
    }
    setBusy(true)
    setError(null)
    try {
      await asked.action()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const dialog = (
    <AlertDialog
      open={open}
      // While the action runs, it can't be dismissed.
      onOpenChange={(next) => !busy && setOpen(next)}
      onOpenChangeComplete={(isOpen) => {
        const action = pending.current
        pending.current = null
        if (!isOpen && action) void action()
      }}
    >
      <AlertDialogContent
        finalFocus={() => (opener.current?.isConnected ? opener.current : (fallback?.current ?? true))}
      >
        {asked && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{asked.title}</AlertDialogTitle>
              <AlertDialogDescription>{asked.consequence}</AlertDialogDescription>
            </AlertDialogHeader>
            <Alert error={error} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{asked.keep}</AlertDialogCancel>
              <AlertDialogAction
                variant={asked.primary ? 'default' : undefined}
                disabled={busy}
                onClick={() => void go()}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? asked.busy : asked.verb}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
  return { confirm, dialog }
}
