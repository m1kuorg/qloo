// The server-rendered shells' menus, native <details data-menu> that open and close without
// JavaScript: the app's network switcher and account menu, and the marketing pages' Menu on phones.
// This keeps one open at a time, though a menu inside another leaves the one around it open, and
// closes them on a click outside or Escape, which returns focus to the menu's button. main.tsx loads
// it on the island's pages; the marketing shell loads it on its own.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')]

// Closes `menu`. Focus that was in it, now hidden, or that a click outside left on nothing, returns to
// its button; a click outside that focused something else leaves it there.
function close(menu: HTMLDetailsElement) {
  const focused = document.activeElement
  menu.open = false
  if (!focused || focused === document.body || menu.contains(focused))
    menu.querySelector<HTMLElement>(':scope > summary')?.focus()
}

for (const menu of menus)
  menu.addEventListener('toggle', () => {
    if (menu.open)
      for (const other of menus) if (other !== menu && other.open && !other.contains(menu)) other.open = false
  })
document.addEventListener('click', (e) => {
  for (const menu of menus) if (menu.open && !menu.contains(e.target as Node)) close(menu)
})
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  // The innermost open menu: Escape closes one at a time, from the inside out.
  const open = menus.filter((m) => m.open)
  const inner = open.find((m) => !open.some((o) => o !== m && m.contains(o)))
  if (!inner) return
  inner.open = false
  inner.querySelector<HTMLElement>(':scope > summary')?.focus()
})
