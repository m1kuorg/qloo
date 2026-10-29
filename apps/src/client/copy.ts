// The developer docs' Copy buttons, which the marketing shell loads on docs pages alone. A code block
// marked copyable (routes/marketing's Code: commands or a configuration that run as they're pasted,
// never what a command prints) keeps its button in an inert <template>, which this puts in place, so without this
// script there's no button. A button copies its block's code, then reads "Copied", the last block
// copied alone, or "Copy failed" when the browser refuses or has no clipboard, and its block's hidden
// status says the same to screen readers. The words are the ticket's (#360); the states, not tried,
// copied and refused, are the island's (controls.tsx, useCopy).
const blocks = [...document.querySelectorAll<HTMLTemplateElement>('figure > template[data-copy]')].map((template) => {
  const figure = template.parentElement!
  template.replaceWith(template.content)
  return {
    code: figure.querySelector('pre')!.textContent ?? '',
    button: figure.querySelector('button')!,
    label: figure.querySelector('[data-copy-label]')!,
    status: figure.querySelector('[role="status"]')!
  }
})

// Sets a block's button to "Copy", or to whether the browser let it copy.
function show(block: (typeof blocks)[number], copied: boolean | null) {
  if (copied === null) delete block.button.dataset.copied
  else block.button.dataset.copied = String(copied)
  block.label.textContent = copied === null ? 'Copy' : copied ? 'Copied' : 'Copy failed'
  block.status.textContent = copied === null ? '' : block.label.textContent
}

for (const block of blocks)
  block.button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(block.code)
    } catch {
      show(block, false)
      return
    }
    // Any other block's word, "Copied" or "Copy failed", goes back to "Copy".
    for (const other of blocks) if (other !== block && 'copied' in other.button.dataset) show(other, null)
    show(block, true)
  })
