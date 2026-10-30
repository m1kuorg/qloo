// Exports the README's architecture diagram in Crossfeed's design system (docs/DESIGN.md).
//
// Archify (https://github.com/tt-a1i/archify) renders docs/readme/architecture.json into a standalone HTML
// viewer. This script restyles that viewer with Crossfeed's colours and Schibsted Grotesk, then saves the
// viewer's own SVG export once per colour scheme, through playwright-cli from Homebrew
// (`brew install playwright-cli`), and takes out the ground the export paints, so each SVG is transparent.
//
// Re-run from the repository root after `bun install` in apps/, with archify 3.2.0 cloned somewhere
// (git clone --depth 1 --branch v3.2.0 https://github.com/tt-a1i/archify <archify>):
//   node <archify>/archify/bin/archify.mjs finalize architecture docs/readme/architecture.json <work>/architecture.html --repo-root . --quality showcase --json
//   node docs/readme/export-architecture.mjs <work>/architecture.html
//
// Writes docs/readme/architecture-light.svg and architecture-dark.svg.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [input] = process.argv.slice(2)
if (!input) throw new Error('usage: node docs/readme/export-architecture.mjs <archify.html>')
const out = path.dirname(new URL(import.meta.url).pathname)
const work = path.dirname(path.resolve(input))
const font = fs
  .readFileSync(
    path.join(
      out,
      '../../apps/node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2'
    )
  )
  .toString('base64')

// docs/DESIGN.md's tokens. Crossfeed's own parts are in ink: its clients filled, as its primary button is,
// and its server outlined. Cloudflare's services sit on the tone step, and the outside parts are outlined in
// the control colour. Signal orange marks one path, every Qloo call through the gateway.
const THEMES = {
  dark: {
    '--bg': '#0e0f12',
    '--mask': 'transparent', // no halos: the export has no ground for them to match
    '--grid': 'transparent',
    '--text': '#ececf1',
    '--text-muted': '#9a9daa',
    '--text-dim': '#9a9daa',
    '--text-faint': '#9a9daa',
    '--lane-stroke': '#26282f',
    '--arrow': '#9a9daa',
    '--arrow-emphasis': '#ff8a3d',
    '--cf-ink': '#ececf1',
    '--cf-on-ink': '#0e0f12',
    '--cf-card': '#16171c',
    '--cf-tone': '#1d1f25',
    '--cf-control': '#6c6f7c',
    '--cf-frame': '#6c6f7c'
  },
  light: {
    '--bg': '#f8f8fa',
    '--mask': 'transparent',
    '--grid': 'transparent',
    '--text': '#121318',
    '--text-muted': '#5f626d',
    '--text-dim': '#5f626d',
    '--text-faint': '#5f626d',
    '--lane-stroke': '#e3e4ea',
    '--arrow': '#5f626d',
    '--arrow-emphasis': '#e4630c',
    '--cf-ink': '#121318',
    '--cf-on-ink': '#ffffff',
    '--cf-card': '#ffffff',
    '--cf-tone': '#efeff3',
    '--cf-control': '#868995',
    '--cf-frame': '#868995'
  }
}
const decl = (vars) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')
// Every selector starts with svg, :root, [data-theme or .c-, so the viewer copies it into its export.
// !important beats the node fills the viewer mixes from each kind's stroke colour.
const tokenCss = [
  `:root, [data-theme="dark"] { ${decl(THEMES.dark)} }`,
  `[data-theme="light"] { ${decl(THEMES.light)} }`,
  'svg .c-frontend { fill: var(--cf-ink) !important; stroke: var(--cf-ink) !important; }',
  'svg .c-backend { fill: var(--cf-card) !important; stroke: var(--cf-ink) !important; stroke-width: 2px !important; }',
  'svg .c-cloud, svg .c-database { fill: var(--cf-tone) !important; stroke: var(--cf-tone) !important; }',
  'svg .c-external { fill: var(--cf-card) !important; stroke: var(--cf-control) !important; }',
  'svg [data-node-kind="frontend"] :is(.t-primary, .t-muted) { fill: var(--cf-on-ink); }',
  'svg .s-frontend { color: var(--cf-on-ink); }',
  'svg .s-backend { color: var(--cf-ink); }',
  'svg :is(.s-cloud, .s-database, .s-external) { color: var(--text-muted); }',
  'svg .c-region { fill: none !important; stroke: var(--cf-frame) !important; stroke-dasharray: 6 4 !important; }',
  // A region's label and a line's label are chips in the card's fill, so they read on any ground once the
  // background is gone.
  'svg [data-graph-role="structural-frame-label-mask"] { fill: var(--cf-card) !important; stroke: var(--cf-frame) !important; }',
  'svg [data-edge-label] > .c-mask { fill: var(--cf-card) !important; }',
  'svg [data-boundary-label] { fill: var(--text-muted); }',
  // One step up from the viewer's sizes, which it measured for its mono: the sans is narrower, so it still fits.
  'svg text[font-size="8"] { font-size: 9px; } svg text[font-size="9"] { font-size: 10px; } svg text[font-size="11"] { font-size: 12.5px; }',
  "svg, svg text { font-family: 'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }"
].join('\n')
// Replaces the viewer's bundled mono: no text in the restyled diagram uses it.
const fontCss = `
@font-face { font-family: 'Schibsted Grotesk'; font-style: normal; font-weight: 400 900; font-display: block;
  src: url(data:font/woff2;base64,${font}) format('woff2'); }
`

let html = fs.readFileSync(input, 'utf8')
const fonts = /(<style id="archify-fonts">)[\s\S]*?(<\/style>)/
if (!fonts.test(html)) throw new Error('no #archify-fonts')
html = html.replace(fonts, (_, open, close) => open + fontCss + close)
html = html.replace('</head>', () => `<style id="crossfeed-tokens">\n${tokenCss}\n</style>\n</head>`)
const styled = path.join(work, 'styled.html')
fs.writeFileSync(styled, html)

// The viewer's svg-light and svg-dark exports pin their theme: data-theme on the root and the resolved colours.
const session = '-s=crossfeed-architecture'
const cli = (...args) => execFileSync('playwright-cli', [session, ...args], { encoding: 'utf8' })
cli('open', '--browser', 'chrome')
try {
  const result = cli(
    'run-code',
    `async page => {
      const ctx = await page.context().browser().newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
      const p = await ctx.newPage()
      await p.goto(${JSON.stringify(`file://${styled}`)})
      await p.evaluate(() => document.fonts.ready)
      for (const scheme of ['light', 'dark']) {
        await p.click('#btn-export')
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export-menu [data-format="svg-' + scheme + '"]')])
        await dl.saveAs(${JSON.stringify(work)} + '/export-' + scheme + '.svg')
      }
      await ctx.close()
    }`
  )
  if (result.includes('### Error')) throw new Error(result)
} finally {
  cli('close')
}

for (const scheme of ['light', 'dark']) {
  // The export paints the theme's ground as one rect the size of the viewBox, first after its styles;
  // without it the diagram sits on the page.
  const painted = fs.readFileSync(path.join(work, `export-${scheme}.svg`), 'utf8')
  const [, w, h] = painted.match(/<svg viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? []
  const ground = `</style><rect x="0" y="0" width="${w}" height="${h}" fill="`
  const at = painted.indexOf(ground)
  if (!w || at < 0) throw new Error(`no background rect after the styles in the ${scheme} export`)
  const end = painted.indexOf('"/>', at + ground.length) + 3
  const svg = painted.slice(0, at) + '</style>' + painted.slice(end)
  if (!svg.includes('Schibsted Grotesk') || !svg.includes(`data-theme="${scheme}"`))
    throw new Error(`unstyled ${scheme} export`)
  const file = path.join(out, `architecture-${scheme}.svg`)
  fs.writeFileSync(file, svg.replace(/[ \t]+$/gm, '').replace(/\n*$/, '\n'))
  console.log(`wrote ${path.relative(process.cwd(), file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`)
}
