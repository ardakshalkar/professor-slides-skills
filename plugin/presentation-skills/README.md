# Presentation Skills

Three skills that plan a presentation, write it, and render it — over a course
found rather than assumed.

A spin-off of the AINAR Professor Exoskeleton's `/make-materials`, which does
the same job welded to one repository: it needs the `ainar` CLI, a `courses/`
tree, `ainar approve` to promote a draft, and `Document` records to carry the
render contract. This installs on its own.

## The three skills

| | |
| --- | --- |
| `/outline-presentation` | Find the course. Work out how the topics evolve across the session. Draft the arc, the slide sequence, and an honest statement of which outcomes and concepts each slide serves and what is deliberately left out. Hand it to the professor. |
| `/build-presentation` | Fill an **approved** outline in: slides as Marp markdown, diagrams as SVG you also commit, tables from the source material, openly-licensed images with their attribution attached, and a written prompt for any illustration the professor must generate. |
| `/render-presentation` | The `.pptx` with real editable shapes and speaker notes, and the PDF converted from that same deck. |

Outlining is separate on purpose. Going from module to finished markdown in one
pass means the professor first sees the argument of the lecture when it is
already written, and by then changing it costs twenty-four slides.

## Installing

```bash
/plugin marketplace add /path/to/PresentationSkills
/plugin install presentation-skills
```

Then, once:

```bash
cd plugin/presentation-skills/node && npm install
```

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

`RULES.md` has the reasoning behind each.

## Running the tests

```bash
cd node && npm test
```
