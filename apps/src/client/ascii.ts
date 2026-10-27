// The landing page's ASCII field, which the marketing shell loads there alone, with its canvas: a
// picture of sound. Ripples spread from a few fixed sources, the roster's shows, and from the pointer,
// the launch; where they cross they add up, and each cell of a grid takes the character for its sum
// from a ramp that runs from a space to a dense glyph. The glyphs are drawn once into an atlas, in the
// field's colour (--ascii in style.css, no darker than keeps every word 4.5:1 against it), and copied
// from there; the frame rate and the pixel ratio are capped, and nothing is drawn while the tab is
// hidden. It moves on arrival and while the visitor moves the pointer, touches or scrolls, and a few
// seconds after, it slows to a still frame, so nothing moves on its own for more than five seconds
// (WCAG 2.2.2) and an idle page draws nothing. With reduced motion it draws one frame and ignores the
// pointer. Without this script the canvas stays empty and the page is the flat ground.
const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-ascii]')
const ctx = canvas?.getContext('2d')

if (canvas && ctx) {
  const RAMP = ' .:-=+*#%@'
  // The glyphs' face: the platform mono stack, as style.css sets code in, DESIGN.md's one sanctioned
  // exception to mono for real code alone. taste-skill-ignore keeps the line out of the design-taste
  // skill's linter (lint.mjs), which flags mono outside code.
  const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace' // taste-skill-ignore
  const FPS = 24
  // How long the field keeps its full pace after the visitor last moved, in ms; it then slows to a
  // stop in under two seconds.
  const AWAKE = 2500
  // Ripples: their wavenumber, the phase a ripple turns through per CSS pixel, for a wavelength of
  // 120px, and the sum at which a cell starts to show a character and at which it takes the densest.
  // Each ripple is a thin crest, so one ring alone is faint and rings that cross add up to the dense
  // glyphs.
  const WAVENUMBER = (2 * Math.PI) / 120
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
  // The launch: the pointer's ripples, faster, and fading over a shorter reach. Its source eases
  // from where it is (x, y) toward the pointer (targetX, targetY), and its strength, from 0 to 1,
  // toward 1 while the pointer is in the window and 0 once it's left (targetStrength).
  const launch = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, targetStrength: 0, speed: 40 }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const atlas = document.createElement('canvas')
  const atlasCtx = atlas.getContext('2d')!
  // The device pixels per CSS pixel the canvas is drawn at, and a cell's size in device pixels.
  let dpr = 1
  let cellWidth = 0
  let cellHeight = 0
  let cols = 0
  let rows = 0
  let reach = 0
  // Per cell, per show: its ripple's weight at the cell, and the cosine and the sine of its phase
  // there, so a frame finds each show's ripple with a few multiplications.
  let waves = new Float32Array(0)
  // Per show, the cosine and the sine of how far its ripples have turned at the clock's time, which
  // shifts the phase every cell holds for it.
  const shift = new Float32Array(SHOWS.length * 2)
  // The field's own time, in seconds, which runs only while it moves.
  let clock = 12
  let last = 0
  let frame = 0
  // When the field starts to settle, and how fast its clock runs, from 0 to 1.
  let awake = performance.now() + AWAKE
  let pace = 1

  // A cell's centre, in CSS pixels, from its column or its row.
  const centreX = (col: number) => ((col + 0.5) * cellWidth) / dpr
  const centreY = (row: number) => ((row + 0.5) * cellHeight) / dpr

  // The glyphs, densest last, each lighter the sparser it is, one cell apart.
  const drawAtlas = () => {
    atlas.width = cellWidth * RAMP.length
    atlas.height = cellHeight
    atlasCtx.font = `${Math.round(cellHeight * 0.82)}px ${FONT}`
    atlasCtx.textAlign = 'center'
    atlasCtx.textBaseline = 'middle'
    atlasCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ascii').trim()
    for (let i = 1; i < RAMP.length; i++) {
      atlasCtx.globalAlpha = 0.45 + (0.55 * i) / (RAMP.length - 1)
      atlasCtx.fillText(RAMP[i], i * cellWidth + cellWidth / 2, cellHeight / 2)
    }
  }

  // Fits the field to a canvas of `width` by `height` CSS pixels: the canvas's pixels at the capped
  // pixel ratio, the grid of cells over them, each show's ripple at every cell, and the atlas.
  const size = (width: number, height: number) => {
    dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const cell = width < 768 ? 12 : 14
    cellHeight = Math.round(cell * dpr)
    cellWidth = Math.round(cell * 0.6 * dpr)
    cols = Math.ceil(canvas.width / cellWidth)
    rows = Math.ceil(canvas.height / cellHeight)
    reach = Math.max(width, height) * 0.3
    const length = cols * rows * SHOWS.length * 3
    if (waves.length < length) waves = new Float32Array(length)
    let j = 0
    for (let r = 0; r < rows; r++) {
      const y = centreY(r)
      for (let c = 0; c < cols; c++) {
        const x = centreX(c)
        for (const show of SHOWS) {
          const d = Math.hypot(x - show.x * width, y - show.y * height)
          waves[j++] = Math.exp(-d / reach)
          waves[j++] = Math.cos(WAVENUMBER * d + show.phase)
          waves[j++] = Math.sin(WAVENUMBER * d + show.phase)
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

  // Draws one frame at the clock's time: each cell sums the shows' ripples there, and the launch's
  // while it's on, and takes the glyph for its sum from the atlas, or none below LOW.
  const draw = () => {
    for (let i = 0; i < SHOWS.length; i++) {
      const turned = WAVENUMBER * SHOWS[i].speed * clock
      shift[i * 2] = Math.cos(turned)
      shift[i * 2 + 1] = Math.sin(turned)
    }
    const shows = SHOWS.length * 2
    const pointer = launch.strength > 0.01
    const launchTurned = WAVENUMBER * launch.speed * clock
    const launchReach = reach * 0.6
    const levels = RAMP.length - 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let j = 0
    for (let r = 0; r < rows; r++) {
      const y = centreY(r)
      const top = r * cellHeight
      for (let c = 0; c < cols; c++) {
        let sum = 0
        for (let i = 0; i < shows; i += 2) {
          const weight = waves[j++]
          sum += weight * crest(waves[j++] * shift[i] + waves[j++] * shift[i + 1])
        }
        if (pointer) {
          const dx = centreX(c) - launch.x
          const dy = y - launch.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < launchReach * 4)
            sum += launch.strength * 1.2 * Math.exp(-d / launchReach) * crest(Math.cos(WAVENUMBER * d - launchTurned))
        }
        const level = Math.ceil(((sum - LOW) / (HIGH - LOW)) * levels)
        if (level > 0) {
          const g = level > levels ? levels : level
          ctx.drawImage(atlas, g * cellWidth, 0, cellWidth, cellHeight, c * cellWidth, top, cellWidth, cellHeight)
        }
      }
    }
  }

  // The animation frame's callback: at most FPS times a second, it moves the clock on at the field's
  // pace, eases the launch toward the pointer, and draws, until the field has settled.
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    // At most FPS frames a second, taking a display's frame that comes up to 4ms early: 20 at 60Hz,
    // 24 at 120Hz.
    if (now - last < 1000 / FPS - 4) return
    // The clock runs only while frames are drawn, at the field's pace, so it picks up where it
    // left off.
    pace += ((now < awake ? 1 : 0) - pace) * 0.1
    clock += (Math.min(now - last, 100) / 1000) * pace
    last = now
    launch.strength += (launch.targetStrength - launch.strength) * 0.08
    launch.x += (launch.targetX - launch.x) * 0.15
    launch.y += (launch.targetY - launch.y) * 0.15
    draw()
    // Settled: the last frame holds until the visitor moves again.
    if (now >= awake && pace < 0.02) stop()
  }

  // Starts the frames, unless they're running, motion is reduced, or the tab is hidden. The clock
  // picks up from now, so the time the frames were stopped doesn't count.
  const start = () => {
    if (frame || reducedMotion.matches || document.hidden) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
  // Stops the frames; the last one drawn stays on the canvas.
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }
  // The visitor moved: the field keeps its full pace for AWAKE from now, then settles again.
  const wake = () => {
    if (reducedMotion.matches) return
    awake = performance.now() + AWAKE
    start()
  }

  // The pointer, or a finger as it lands, is the launch.
  const point = (e: PointerEvent) => {
    if (reducedMotion.matches) return
    if (launch.targetStrength === 0) {
      launch.x = e.clientX
      launch.y = e.clientY
    }
    launch.targetX = e.clientX
    launch.targetY = e.clientY
    launch.targetStrength = 1
    wake()
  }
  addEventListener('pointermove', point, { passive: true })
  addEventListener('pointerdown', point, { passive: true })
  addEventListener('scroll', wake, { passive: true })
  // The pointer leaving the window takes the launch's ripples with it as they fade.
  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget) return
    launch.targetStrength = 0
    wake()
  })
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  reducedMotion.addEventListener('change', () => {
    launch.strength = launch.targetStrength = 0
    stop()
    draw()
    wake()
  })
  dark.addEventListener('change', () => {
    drawAtlas()
    draw()
  })
  new ResizeObserver(([entry]) => {
    size(entry.contentRect.width, entry.contentRect.height)
    draw()
  }).observe(canvas)
  start()
}
