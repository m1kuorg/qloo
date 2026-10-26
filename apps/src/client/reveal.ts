// The landing page's section entrances, which the marketing shell loads there alone. A part marked
// data-rise is set to wait out of sight (data-rise-wait) only as it nears the window from below, a
// quarter of a window ahead, while it can't be seen; it rises into place once its top is a tenth of
// the way up the window. A part already in view is left alone, so nothing on screen blinks, and parts
// far down the page are never hidden. Without this script, or with reduced motion, every part is
// simply in place, as style.css hides a part only while this script has it waiting.
if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const arrive = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.removeAttribute('data-rise-wait')
          arrive.unobserve(entry.target)
        }
    },
    { rootMargin: '0px 0px -10% 0px' }
  )
  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        near.unobserve(entry.target)
        if (entry.boundingClientRect.top > innerHeight) {
          entry.target.setAttribute('data-rise-wait', '')
          arrive.observe(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px 25% 0px' }
  )
  for (const part of document.querySelectorAll('[data-rise]')) near.observe(part)
}
