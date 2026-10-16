# Project conventions

- Refer to [markdown-style.md](/docs/references/markdown-style.md) before creating markdowns, root README.md bypass this rule.
- Issue and PR titles must pass the commit header rules in [commitlint.config.mjs](/commitlint.config.mjs), like `docs: add project conventions`. Check with `echo '<title>' | bunx commitlint`.
- Record every follow-up as a GitHub issue, per [issue-tracker.md](/docs/agents/issue-tracker.md), instead of printing it to the terminal or listing it in a checklist.
- Read the source code or documentation of a tool, API, or library before using it.
- Avoid unit tests. Agent-written tests tend to repeat the implementation, and [banning them on DeepSWE](https://x.com/kunchenguid/status/2108030810691629403) cut time and tokens without lowering the success rate. Test behavior through public interfaces, as in the [tdd skill](/.agents/skills/tdd/SKILL.md). When a unit test is unavoidable, list how it could fail before writing the code, per [RayFernando1337's AGENTS.md rules](https://x.com/RayFernando1337/status/2102927565778522610).
