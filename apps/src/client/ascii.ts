// The landing page's ASCII field, which the marketing shell loads there alone, with its canvas: a
// picture of sound. Ripples spread from a few fixed sources, the roster's shows, and from the pointer,
// the launch; where they cross they add up, and each cell of a grid takes the character for its sum
// from a ramp that runs from a space to a dense glyph. The glyphs are drawn once into an atlas, in the
// field's colour (--ascii in style.css, no darker than keeps every word 4.5:1 against it), and copied
// from there; the frame rate and the pixel ratio are capped, and nothing is drawn while the tab is
// hidden. With reduced motion it draws one frame and ignores the pointer. Without this script the
// canvas stays empty and the page is the flat ground.
const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-ascii]')
const ctx = canvas?.getContext('2d')

if (canvas && ctx) {
  const RAMP = ' .:-=+*#%@'
  // The platform mono stack, as style.css's --font-mono.
  const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace'
  const FPS = 24
  // Ripples: their wavelength in CSS pixels, and the sum at which a cell starts to show a character
  // and at which it takes the densest. Each ripple is a thin crest, so one ring alone is faint and
  // rings that cross add up to the dense glyphs.
  const K = (2 * Math.PI) / 120
  const LOW = 0.25
  const HIGH = 1
  // The shows, as fractions of the window, each with its speed in CSS pixels a second and its phase.
  const SHOWS = [
    { x: 0.2, y: 0.3, speed: 18, phase: 0 },
    { x: 0.76, y: 0.2, speed: 23, phase: 2.1 },
    { x: 0.56, y: 0.76, speed: 15, phase: 4.2 },
    { x: 0.06, y: 0.86, speed: 20, phase: 1.3 },
    { x: 0.95, y: 0.7, speed: 26, phase: 3.4 }
  ]
  // The launch: the pointer's ripples, faster, and fading over a shorter reach.
  const launch = { x: 0, y: 0, toX: 0, toY: 0, on: 0, to: 0, speed: 40 }

  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const atlas = document.createElement('canvas')
  const atlasCtx = atlas.getContext('2d')!
  let dpr = 1
  let cw = 0
  let ch = 0
  let cols = 0
  let rows = 0
  let reach = 0
  // Per cell, per show: its ripple's weight at the cell, and the cosine and the sine of its phase
  // there, so a frame finds each show's ripple with a few multiplications.
  let waves = new Float32Array(0)
  const turn = new Float32Array(SHOWS.length * 2)
  let t = 12
  let last = 0
  let frame = 0

  // The glyphs, densest last, each lighter the sparser it is, one cell apart.
  const drawAtlas = () => {
    atlas.width = cw * RAMP.length
    atlas.height = ch
    atlasCtx.font = `${Math.round(ch * 0.82)}px ${FONT}`
    atlasCtx.textAlign = 'center'
    atlasCtx.textBaseline = 'middle'
    atlasCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ascii').trim()
    for (let i = 1; i < RAMP.length; i++) {
      atlasCtx.globalAlpha = 0.45 + (0.55 * i) / (RAMP.length - 1)
      atlasCtx.fillText(RAMP[i], i * cw + cw / 2, ch / 2)
    }
  }

  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const cell = width < 768 ? 12 : 14
    ch = Math.round(cell * dpr)
    cw = Math.round(cell * 0.6 * dpr)
    cols = Math.ceil(canvas.width / cw)
    rows = Math.ceil(canvas.height / ch)
    reach = Math.max(width, height) * 0.3
    const length = cols * rows * SHOWS.length * 3
    if (waves.length < length) waves = new Float32Array(length)
    let j = 0
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) * ch) / dpr
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5) * cw) / dpr
        for (const show of SHOWS) {
          const d = Math.hypot(x - show.x * width, y - show.y * height)
          waves[j++] = Math.exp(-d / reach)
          waves[j++] = Math.cos(K * d + show.phase)
          waves[j++] = Math.sin(K * d + show.phase)
        }
      }
    }
    drawAtlas()
  }

  // A ripple's height from the cosine of its phase: 1 on the crest, falling to nothing within a
  // quarter of a wavelength, so each ring is a thin line.
  const crest = (cos: number) => {
    let h = 0.5 + 0.5 * cos
    h *= h
    h *= h
    return h * h
  }

  const draw = () => {
    for (let i = 0; i < SHOWS.length; i++) {
      const w = K * SHOWS[i].speed * t
      turn[i * 2] = Math.cos(w)
      turn[i * 2 + 1] = Math.sin(w)
    }
    const shows = SHOWS.length * 2
    const pointer = launch.on > 0.01
    const launchTurn = K * launch.speed * t
    const launchReach = reach * 0.6
    const levels = RAMP.length - 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let j = 0
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) * ch) / dpr
      for (let c = 0; c < cols; c++) {
        let sum = 0
        for (let i = 0; i < shows; i += 2) {
          const weight = waves[j++]
          sum += weight * crest(waves[j++] * turn[i] + waves[j++] * turn[i + 1])
        }
        if (pointer) {
          const dx = ((c + 0.5) * cw) / dpr - launch.x
          const dy = y - launch.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < launchReach * 4)
            sum += launch.on * 1.2 * Math.exp(-d / launchReach) * crest(Math.cos(K * d - launchTurn))
        }
        const level = Math.ceil(((sum - LOW) / (HIGH - LOW)) * levels)
        if (level > 0) {
          const g = level > levels ? levels : level
          ctx.drawImage(atlas, g * cw, 0, cw, ch, c * cw, r * ch, cw, ch)
        }
      }
    }
  }

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    // At most FPS frames a second, taking a display's frame that comes up to 4ms early: 20 at 60Hz,
    // 24 at 120Hz.
    if (now - last < 1000 / FPS - 4) return
    // The clock runs only while frames are drawn, so the field picks up where it left off.
    t += Math.min(now - last, 100) / 1000
    last = now
    launch.on += (launch.to - launch.on) * 0.08
    launch.x += (launch.toX - launch.x) * 0.15
    launch.y += (launch.toY - launch.y) * 0.15
    draw()
  }

  const start = () => {
    if (frame || still.matches || document.hidden) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  addEventListener(
    'pointermove',
    (e) => {
      if (still.matches) return
      if (launch.to === 0) {
        launch.x = e.clientX
        launch.y = e.clientY
      }
      launch.toX = e.clientX
      launch.toY = e.clientY
      launch.to = 1
    },
    { passive: true }
  )
  // The pointer leaving the window takes the launch's ripples with it.
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) launch.to = 0
  })
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  still.addEventListener('change', () => {
    launch.on = launch.to = 0
    stop()
    draw()
    start()
  })
  dark.addEventListener('change', () => {
    drawAtlas()
    draw()
  })
  new ResizeObserver(() => {
    size()
    draw()
  }).observe(canvas)
  start()
}
