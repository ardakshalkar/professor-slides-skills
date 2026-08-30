# Professor Slides Skills

Three skills that plan a presentation, write it, and render it — over a course
found rather than assumed.

A spin-off of the AINAR Professor Exoskeleton's `/make-materials`, which does
the same job welded to one repository: it needs the `ainar` CLI, a `courses/`
tree, `ainar approve` to promote a draft, and `Document` records to carry the
render contract. This installs on its own.

## The three skills

| | |
| --- | --- |
| `/outline-presentation` | Find the course. Choose the teaching sequence the discipline calls for. Draft the arc, the beats, and a slide list saying what the learner is doing on each one and how the information is represented — plus an honest statement of what is deliberately left out. Hand it to the professor. |
| `/build-presentation` | Fill an **approved** outline in: slides as Marp markdown written as their archetypes, diagrams as SVG you also commit, tables from the source material, openly-licensed images with their attribution attached, and a written prompt for any illustration the professor must generate. |
| `/render-presentation` | The `.pptx` with real editable shapes and speaker notes, and the PDF converted from that same deck. |

Outlining is separate on purpose. Going from module to finished markdown in one
pass means the professor first sees the argument of the lecture when it is
already written, and by then changing it costs twenty-four slides.

## The planning layer

Ask a generator for a lecture and it produces *title and three bullets*, fifteen
times. Every one of those slides is individually defensible; what is wrong is
that the cognitive operation never changed while the material did.

So the planning runs down three separate taxonomies rather than jumping from a
section to a list of slides:

```text
DECK GRAMMAR        what sequence teaches this topic     references/deck-grammars.md
      ↓
TEACHING BEAT       what job does this stretch do        references/teaching-beats.md · beats/
      ↓
SLIDE INTENT        what is the learner doing here
      ↓
VISUAL ARCHETYPE    how should that be represented       references/visual-grammar.md
```

A **teaching beat** is two to seven slides that do one teaching job —
`problem-before-solution`, `follow-one-object`, `predict-reveal-explain`,
`analyze-artifact`. Twenty-nine of them live in [`beats/`](beats/README.md),
each with the sequence it implies, the rules its pictures follow, and the
question worth asking the professor before using it.

Eighteen **visual archetypes** say how one slide is shaped, and they are
enforced, not suggested. Some of what falls out of that:

- **A photograph is evidence; a diagram is the explanation.** Text beside a
  photograph directs attention rather than describing what the room can see.
  Labels on a diagram sit on the parts they name — never a diagram followed by
  "Box A means…, Box B means…".
- **Whitespace on a question slide is the teaching**, and so is the missing
  answer. That one is an error, not a warning.
- **Reuse the visual anchor.** One diagram with the emphasis moving beats five
  unrelated diagrams; the student otherwise spends each slide re-learning a
  layout instead of learning the addition.
- **Text-only slides are legitimate.** Never *every slide needs an image*;
  always *every slide needs an information carrier*.
- **Density is a mode**, not a word cap — a derivation is dense because the
  content is.
- **`delivery_dependency: high`** marks a slide deliberately incomplete without
  the professor talking over it. Normal teaching; a hole in a handout.

Two more references carry the craft no check can enforce:
[`references/text-style.md`](references/text-style.md) on how to write the words
— assertion headlines rather than topics, sentence case, parallel lists — and
[`references/typography.md`](references/typography.md) on which typefaces
survive the lecture-room machine, and why the height estimator cares which one
you pick.

`pres outline check` also reads the deck as a sequence: identical archetypes in
a row, text-only runs, a mechanism arriving before anything creates the need for
it, no reset in nine slides of new material, beats that do not hand over.

## Installing

**As a plugin** — the route that needs no other setup. From an interactive
Claude Code session (terminal, desktop app, IDE or web):

```bash
/plugin marketplace add /path/to/professor-slides-skills
```

```bash
/plugin install professor-slides-skills@professor-exoskeleton
```

Then, once:

```bash
cd plugin/professor-slides-skills/node && npm install
```

The plugin loader puts `bin/` on PATH, so the skills' `pres …` commands resolve,
and it sets `${CLAUDE_PLUGIN_ROOT}` so they can find `references/` and `beats/`.

**As loose skills**, if you would rather not use the marketplace: copy
`skills/outline-presentation`, `skills/build-presentation` and
`skills/render-presentation` into `~/.claude/skills/`. Two things the loader
would have done for you have to be done by hand.

Put `pres` on PATH:

```bash
cd plugin/professor-slides-skills/node && npm install && npm link
```

That gives you a global `pres` that works from any directory and does not depend
on the plugin being enabled. And keep this directory where the skills can reach
it — they read `references/` and `beats/` from the plugin root, and say so at
the top of each `SKILL.md` for the case where `${CLAUDE_PLUGIN_ROOT}` is unset.

**Not** in the claude.ai side of the desktop app. That installs MCPB extensions
and this is a skills-and-CLI plugin, with no MCP server in it.

`pptxgenjs` and `sharp` are optional dependencies — reading and checking a
course never needs a native image library, and a machine where they fail to
install still resolves a course and still runs the tests. `pres render`
needs them; the PDF additionally needs LibreOffice.

Node 22.6 or later. The plugin runs its TypeScript directly.

## Where the course comes from

Three places, in order, and the answer always says which one produced it:

1. **A course database** — `PRES_COURSE_URL`, `SUPABASE_DB_URL` or
   `SUPABASE_URL`, from the environment or a `.env`. One query against
   `content.course_bundle_read_models`.
2. **A course directory** — `courses/<COURSE_ID>/` in the AINAR layout, found by
   walking up from where you are or named by `PRES_WORKSPACE`.
3. **A single flat `course.yaml`** — for a talk with no course behind it.

```bash
pres source --course CSS-4008
```

```text
Course read from course-directory: .../ProfessorHarness/courses/CSS-4008 (9 files)
  tried supabase first — reached aws-0-ap-northeast-1.pooler.supabase.com:6543,
  but content.course_bundle_read_models is empty
```

That second line is the point. A fallback is an excellent way to hide a failure:
a database link that is merely unreachable, silently followed by a course
directory last pulled in March, produces a deck built from March's outcomes that
looks exactly like a correct one.

`references/course-source.md` has the resolution order, the flat file's shape,
and the two Supabase problems that each waste an afternoon — the IPv6-only
dashboard host, and certificate verification on a network that re-signs TLS.

## Readings and books

Not a new file. `delivery.resources` in the database,
`versions/<TERM>/resources.yaml` in a course directory, `references:` in a flat
file — the course model already has the right record with the right concept
tagging, and a second list beside it would be a second thing to keep true.
`pres context` returns the ones whose concepts overlap the module's.

## Approval

There is no approval CLI here. The gate is the outline's own `status`, and it
moves to `approved` only when the professor says so. `/build-presentation`
refuses a draft; `pres render` refuses a deck built from one — because a
`.pptx` looks identical whether or not anybody agreed to what is inside it.

## The `pres` CLI

```
pres source   --course ID [--version TERM] [--only SOURCE] [--json]
pres context  --module MODULE-ID [--course ID] [--date YYYY-MM-DD] [--json]
pres outline  check FILE
pres check    DECK.md
pres render   DECK.md [--pdf] [--out DIR]
pres find-image --search QUERY [--pick N --name STEM --into DIR]
```

## What is enforced rather than trusted

- An unapproved outline is not rendered.
- The plan must match the markdown in slide count, order and title. A mismatch
  exits saying where; nothing reorders slides to agree.
- A figure claiming a source without an attribution line stops the render.
- Every figure needs alt text, and it is not a caption of the filename.
- Any slide running past the bottom margin is named.
- An outline may not cover a concept its module does not claim, and may not drop
  one it does without recording why.
- A question or activity slide may not carry an explanation or a takeaway. The
  missing answer is the point.
- Every slide's archetype has to be one of the eighteen.

`RULES.md` has the reasoning behind each.

## Running the tests

```bash
cd node && npm test
```

## Licence

MIT — see [LICENSE](../../LICENSE).
