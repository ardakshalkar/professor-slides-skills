# Professor Slides Skills

A standalone Claude Code and Codex plugin that plans a presentation, writes it,
and renders it — over a course it finds rather than one it assumes.

A spin-off of `/make-materials` from the [AINAR Professor
Exoskeleton](../../ProfessorHarness), which does the same job welded to that
repository: it needs the `ainar` CLI on PATH, a `courses/` tree in a particular
layout, `ainar approve` to promote a draft, and `Document` records to carry the
render contract. A professor who only wants to build a deck cannot use it.

```bash
/plugin marketplace add /path/to/professor-slides-skills
/plugin install professor-slides-skills@professor-exoskeleton
cd plugin/professor-slides-skills/node && npm install
```

Or, without the marketplace: copy the three folders in
`plugin/professor-slides-skills/skills/` into `~/.claude/skills/`, and
`npm link` in `node/` to get a global `pres`. Either route is documented in
[the plugin's README](plugin/professor-slides-skills/README.md).

Everything else — the three skills, the `pres` CLI, where the course comes
from, and what is enforced rather than trusted — is in
[the plugin's README](plugin/professor-slides-skills/README.md).
[`RULES.md`](plugin/professor-slides-skills/RULES.md) has the reasoning behind each
refusal, and [`examples/`](plugin/professor-slides-skills/examples) has one complete
worked set: an outline, a deck, a figure and the plan that ties them together.

## Layout

```text
.claude-plugin/marketplace.json          install from this repository
plugin/professor-slides-skills/
  skills/                                the three skills, with their templates
  beats/                                 29 teaching beats — the planning unit
  references/                            deck grammars, teaching beats, visual
                                         grammar, course sources, figures
  preferences/defaults.yaml              what a deck looks like when nobody said
  examples/MODULE-06/                    a complete worked set
  node/                                  the `pres` CLI and its tests
  bin/pres, bin/pres.cmd                 the shim that puts `pres` on PATH
work/                                    drafts (gitignored)
output/                                  renders (gitignored)
```

Planning runs down three taxonomies rather than jumping from a section to a list
of slides — **deck grammar → teaching beat → slide intent → visual archetype** —
because a generator that skips that produces *title and three bullets*, fifteen
times, with every slide individually defensible.

## Requirements

Node 22.6 or later — the plugin runs its TypeScript directly. `pptxgenjs` and
`sharp` are optional and only `pres render` needs them; LibreOffice is needed
only for the PDF. Reading and checking a course needs none of the three.
