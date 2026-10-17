# X design research for Crossfeed

Posts from X (x.com) captured on 2026-10-17 to inform `docs/DESIGN.md` for Crossfeed, an Operate-mode working screen where an agent ranks a podcast network's shows by Qloo listener overlap, keeps evidence apart from narration, asks the human at each fork, and ends in a priced insertion order. Each section lists observed posts first, then a separate interpretation for Crossfeed.

Contents:

1.  [Method and coverage](#method-and-coverage)
1.  [mkdir.directory](#mkdirdirectory)
    1.  [Observed mkdir.directory posts](#observed-mkdirdirectory-posts)
    1.  [mkdir.directory implications](#mkdirdirectory-implications)
1.  [Agent interface design](#agent-interface-design)
    1.  [Observed agent interface posts](#observed-agent-interface-posts)
    1.  [Agent interface implications](#agent-interface-implications)
1.  [Data-dense tool design](#data-dense-tool-design)
    1.  [Observed data-dense posts](#observed-data-dense-posts)
    1.  [Data-dense implications](#data-dense-implications)
1.  [AI slop aesthetics](#ai-slop-aesthetics)
    1.  [Observed AI slop posts](#observed-ai-slop-posts)
    1.  [AI slop implications](#ai-slop-implications)
1.  [DESIGN.md format](#designmd-format)
    1.  [Observed DESIGN.md posts](#observed-designmd-posts)
    1.  [DESIGN.md implications](#designmd-implications)
1.  [Podcast and ad-ops references](#podcast-and-ad-ops-references)
1.  [Gaps and failed searches](#gaps-and-failed-searches)
1.  [See also](#see-also)

## Method and coverage

- Tool: `bird` 0.8.0, read-only (`search`, `read`, `thread`, `user-tweets`), about 10 minutes of research.
- `bird search` returns the newest posts first, so most queries used the `min_faves:N` operator to filter noise. Like counts below come from `bird read --json` on the capture date.
- Videos and images attached to posts were not viewed. Claims about what a video shows are not made.
- Many hits were X Articles that surface only a title through `bird`; those are excluded unless noted.

## mkdir.directory

### Observed mkdir.directory posts

- [@edo_lunardi, 2026-10-10](https://x.com/edo_lunardi/status/2108964504998424885), 249 likes: "So I made a curated directory of directories." Quotes his own earlier post, "Please not another 'inspirational websites collection' website" ([2026-10-04](https://x.com/edo_lunardi/status/2106799729858552194)).
- [@edo_lunardi, 2026-10-10](https://x.com/edo_lunardi/status/2108964507573686512), launch thread: "Free, no sign-up, ranked by your votes. Suggest the ones I missed." Replies show him adding suggestions live ("Added!").
- [@AdhamDannaway, 2026-10-13](https://x.com/AdhamDannaway/status/2110017212115521829), 16 likes (low): "Galleries, award sites, landing page collections and section libraries, picked by hand and kept short on purpose."
- [@faizintifada\_, 2026-10-14](https://x.com/faizintifada_/status/2110283883027612002), low authority: describes it as 30 hand-picked directories, free, no account.
- [@edo_lunardi, 2026-10-15](https://x.com/edo_lunardi/status/2110671995679760810), 68 likes: "respect user preferences. Some people turn motion off, so give them a simple version. For everyone else, double down on details and connected transitions. For a theme swap, a CSS view transition is the way to go." Followed by "[Theme switcher from mkdir.directory](https://x.com/edo_lunardi/status/2110672928937328720)" (video, not viewed).
- [@edo_lunardi, 2026-10-14](https://x.com/edo_lunardi/status/2110314340955955303): the site runs on Astro on Cloudflare.
- [@edo_lunardi, 2026-10-08](https://x.com/edo_lunardi/status/2108138691818643631): "You can pretty much cut bundle size in half by dropping the animation library ... CSS, rAF and WAAPI cover it."
- No post found that describes mkdir.directory's typefaces or color tokens in text.

### mkdir.directory implications

- The site's core is a short, ranked, vote-ordered list. That is the same shape as Crossfeed's ranked show list, so it is a fair reference for how a ranked list can carry personality without decoration.
- If Crossfeed ships light and dark themes, swap them with a CSS view transition and give a plain swap under `prefers-reduced-motion`.
- Prefer CSS transitions and WAAPI over a motion library for the few transitions an Operate screen needs.

## Agent interface design

### Observed agent interface posts

- [@sireton_builds, 2026-10-17](https://x.com/sireton_builds/status/2111294991100170343), 2 likes (low, concept mockups only): wants "a calm session view where the steps fold up and there's one clear choice to make" and "a command center that only asks me about design decisions and anything destructive, and shows what it handled while I was away."
- [@karrisaarinen, 2026-10-07](https://x.com/karrisaarinen/status/2107676903553585155), 272 likes, Linear CEO: Linear Diffs "Guided Reviews break diffs into focused sections with explained code", asking how to "understand the changes agents are making."
- [@\_awchen, 2026-10-07](https://x.com/_awchen/status/2107901943935103365), 756 likes, on ChatGPT Intelligent UI: the hard part is model judgment, "how do we post-train ... to know when an interface would actually help? ... how do we make it useful and beautiful without taking over the conversation?"
- [@rabi_guha, 2026-10-09](https://x.com/rabi_guha/status/2108620161611903258), 489 likes, OpenUI founder: generative UI composes from "~70 native components"; the host injects base styles so generated output "still looks like ChatGPT"; "Data binding has to be bulletproof: imagine seeing wrong numbers while analysing a CSV."
- [@Rixhabh\_\_, 2026-10-16](https://x.com/Rixhabh__/status/2110958634243154401), 274 likes, promotional for OpenUI: "Instead of every agent answering with another wall of text, the response can become the interface the task actually needs: a map, dashboard, comparison, form."
- [@Dave_Joe_9377, 2026-10-16](https://x.com/Dave_Joe_9377/status/2111128699579855310), low authority, cites OWASP: injection happens when tool output "stops being evidence for the task and starts directing the agent's actions"; "keep third-party content from becoming permission."
- [@mariagpts, 2026-10-15](https://x.com/mariagpts/status/2110758041561845792), promotional: "the ui is just where humans check the work and approve."

### Agent interface implications

- Fork prompts: fold completed steps (Qloo calls already run) and present one decision at a time, with the default stated. Only stop the human at real forks, as the sireton concept argues.
- Evidence panel: group evidence per ranked show into focused sections, like Linear's Guided Reviews, rather than one chronological log.
- Numbers shown as evidence (affinity scores, overlap, inventory dollars) must bind to tool output, never to model prose. A wrong number is the failure mode rabi_guha names; Crossfeed's evidence/narration split is the guard.
- Treat Qloo responses as evidence, visually and logically distinct from narration and from instructions. This is both a trust cue and a security boundary.
- Render the result as a ranked table and an insertion order, not a chat transcript. Narration supports the table; it does not replace it.

## Data-dense tool design

### Observed data-dense posts

- [@keviduk, 2026-10-09](https://x.com/keviduk/status/2108606875251917158), 193 likes: "turn on tabular figures for any numbers that stack vertically. every digit gets the same width, so columns line up and values are much easier to compare."
- [@voidJan, 2026-10-15](https://x.com/voidJan/status/2110727812961485079), secondhand: reports Claude Desktop sets `font-variant-numeric: tabular-nums` on a countdown to avoid layout shift. [@OnFinality](https://x.com/OnFinality/status/2110883902269399074) (1 like, low) adds that proportional digits make a counter "jitter ... and it reads as a bug."
- [@TheRobertAvram, 2026-07-27](https://x.com/TheRobertAvram/status/2081663983690379713), 226 likes, "B2B dashboard UI cheatsheet": 14/20 and 12/16 body sizes, 230px sidebar, 24px gutters, 24px table rows with 16px horizontal padding, 22px pills; "Dense dashboards become easier to scan when spacing, type and colour stay quiet."
- [@Ash_uxi, 2026-10-08](https://x.com/Ash_uxi/status/2108253010988323109): lists "numbers jumping around because nobody used tabular figures" among the small details that make design good.
- Older data-table references surfaced: [@vitalyf, 2022](https://x.com/vitalyf/status/1589306434050588674) pointing to Andrew Coyle's Data Tables Design Patterns, and [@kianbazza, 2025](https://x.com/kianbazza/status/1906824475506565180) on table filters "Inspired by Linear's design."

### Data-dense implications

- Set `tabular-nums` on every rank, score, percentage, and dollar column, and on any value that updates while the agent streams.
- Use compact rows (about 24 to 32px) and a 12 to 14px body scale. Keep color for meaning (rank movement, approval state), not for decoration.

## AI slop aesthetics

### Observed AI slop posts

- [@vikktorrrre, 2026-08-26](https://x.com/vikktorrrre/status/2092618580902728176), 449 likes: AI sites share "Purple gradient at the top, Rounded cards, Frosted glass look, Inter font, Emoji as icons" and the copy "Transform your workflow."
- [@notEgoyard, 2026-08-31](https://x.com/notEgoyard/status/2094372796814028888), 88 likes: names the cause "distributional convergence"; describes Anthropic's frontend-design skill banning "Inter, Roboto, Arial, Space Grotesk" and grounding choices "in the subject itself."
- [@RetroChainer, 2026-08-09](https://x.com/RetroChainer/status/2086467597915095253): "Inter font, purple gradients, cards in cards," citing the impeccable skill's anti-pattern list.
- [@satyaXBT, 2026-07-16](https://x.com/satyaXBT/status/2077627059434905973), low authority: adds "all text centered" and "3-column cards."
- [@edo_lunardi, 2026-10-15](https://x.com/edo_lunardi/status/2110695494779576748), 45 likes: agency sites that look like "a boring af Framer template, pill-shaped buttons and random dithering everywhere." [Also](https://x.com/edo_lunardi/status/2108839293338652923) (61 likes): AI-generated hero or scroll video is "a big slop indicator."
- [@mylifcc, 2026-10-13](https://x.com/mylifcc/status/2109828971802046843), low authority: vague prompts yield a "purple-blue gradient + 16px radius + default Tailwind."

### AI slop implications

- Avoid: purple or blue gradients, glass, Inter as the default face, emoji icons, nested cards, centered marketing layouts, pill buttons everywhere, decorative dithering, and generic hero copy.
- Ground type and color in the domain (audio, broadcast, ad-ops paperwork) rather than in a SaaS template.
- Not found: no post in this pass named "cream background plus serif" as a slop tell. Treat that concern as unconfirmed by X.

## DESIGN.md format

### Observed DESIGN.md posts

- [@stitchbygoogle, 2026-07-16](https://x.com/stitchbygoogle/status/2077844276176966015), 271 likes: launched "the DESIGN.md standard to build a portable visual identity for agents" about four months earlier, and added linters, diff tools, translators, and a Tailwind theme export.
- [@dr_cintas, 2026-10-03](https://x.com/dr_cintas/status/2106482844025376965), 273 likes: "Tokens on top, rules below," with sections Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts; lint with `npx @google/design.md lint DESIGN.md`; tell agents "Read DESIGN.md before any UI work."
- [@vikingmute, 2026-09-01](https://x.com/vikingmute/status/2094702171619213816), 297 likes, summarizing Vercel's "How our agents build on-brand pages with design.md": Vercel pairs design.md with a public CSS file of a limited set of documented classes for headers, tables, data bars, and charts. Agents use only those names and stop inventing sizes and spacing; the stylesheet loads in the browser, not in model context.
- [@\_jaydeepkarale, 2026-08-02](https://x.com/_jaydeepkarale/status/2083897856113717478): companies now publish official DESIGN.md files; a repo tracks them.
- [@jojowindev, 2026-10-16](https://x.com/jojowindev/status/2111100440071041268), low authority: the agent copies patterns already in the repo, so fix the system once, and keep a short design notes file it reads before UI work.

### DESIGN.md implications

- Write `docs/DESIGN.md` with tokens first, then rules, in the section order above, and verify that order against the `google-labs-code/design.md` repo before relying on this secondhand list.
- Run the linter on the file and add the "read DESIGN.md before UI work" rule to agent instructions.
- Follow Vercel's pattern: give the agent a small fixed set of named table, bar, and chip classes so evidence rows and rankings never get ad hoc styling.

## Podcast and ad-ops references

- `search "podcast ad ops dashboard design"` returned no tweets. No podcast or ad-ops UI references were found in this pass.

## Gaps and failed searches

- Searches for "human in the loop" UI, "citations AI interface design", and "tool calls" UI design (with `min_faves:50` or `100`) returned mostly unrelated articles and course threads. Little direct designer commentary on citation display or approval UI was found.
- `search "mkdir directory edo_lunardi"` returned nothing; `from:edo_lunardi` combined with `OR` lost the author filter and returned noise.
- Posts from @brian_lovin, @raunofreiberg, and @emilkowalski were checked; only [Emil Kowalski's duration guidelines](https://x.com/emilkowalski/status/2110429909160264027) (1,982 likes, image not viewed) looked relevant, as a cue to give agents explicit motion duration tokens.
- mkdir.directory's own typography, palette, and motion were not observed directly; only video posts exist, which were not viewed.

## See also

- [mkdir.directory](https://mkdir.directory)
- [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
- [Crossfeed product doc](/docs/PRODUCT.md)
