// What a modal dialog, alert dialog or sheet does to the page under its scrim: while it's open, every
// part of the page outside the layer it's portalled into is inert, so neither Tab nor a screen reader
// reaches what's under it. Base UI already traps focus with guards around the popup, which hand focus
// back to it a frame later, and hides the page from screen readers with aria-hidden; inert also keeps
// a Tab pressed in that frame, or in a window that isn't drawing frames, from landing on the skip link
// or the page. Layers opened from inside it, such as a select's list, portal later and stay usable.
import { createContext, useContext, useLayoutEffect, useState } from 'react'

// Whether the root around a popup is open and modal: the Root components provide it.
export const ModalOpen = createContext(false)

// The popup's ref, as a setter for its `ref`, and the effect that makes the rest of the page inert
// while the root is open and modal. Inert comes off as the root closes, in the same commit, before
// Base UI returns focus to what opened it.
export function useModalLayer() {
  const open = useContext(ModalOpen)
  const [popup, setPopup] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const layer = popup?.closest('[data-base-ui-portal]')
    if (!open || !layer) return
    const outside = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== layer && !el.contains(layer) && !el.inert
    )
    for (const el of outside) el.inert = true
    return () => {
      for (const el of outside) el.inert = false
    }
  }, [open, popup])
  return setPopup
}
