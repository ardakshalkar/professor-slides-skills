---
name: build-presentation
description: Fill an approved presentation outline in — write every slide as Marp markdown, draw the diagrams as SVG, build the tables, find or prompt for the images that are not drawn, and write the render contract beside the deck. Use when the user asks to write, fill in, build or make the slides for an outline that already exists, or to turn an approved plan into an actual deck. Planning the session and its sequence first is /outline-presentation; producing the .pptx and PDF afterwards is /render-presentation.
stage: build
requires: [outline]
produces: [deck, figures, plan]
writes: drafts
---

# Build the presentation

**Needs:** an approved outline from `/outline-presentation`, and the course it
was built against.

You write the slides the outline planned. You do not re-plan the session: the
outline is what was agreed to, and a deck that quietly reorders it is a deck
nobody approved.

## 1. Check the gate before writing anything

```bash
pres outline check work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.outline.yaml
```

Then read its `status`.

- **`approved`** — build it.
- **`draft`** — stop. Report what the outline says and ask for approval.

You may set `status: approved` yourself **only** on an explicit instruction in
the current request — "approve it and build the deck" — and when you do, stamp
`approved_by` and `approved_at` with who said so and when. Never on your own
initiative, never because the outline reads as finished, and never carried over
from an earlier conversation.

If the professor has edited the outline since it was checked, re-run the check
before building. An outline whose slide list changed after approval is an
outline whose approval was for a different session.

## 2. Reload the course

```bash
pres context --course CSS-4008 --module MODULE-06
```

The outline names concepts, outcomes and references by identifier; you need
their actual content to write the slides, and you need the provenance line for
the hand-over. Do not build from the outline alone — the references are where
the material comes from.

## 3. Write the deck

`templates/` beside this skill holds the deck shapes matching the outline
templates. Read `templates.yaml` and use the one the outline's `style` names.

Write to `work/<COURSE_VERSION_ID>/presentations/<DECK>.md`, in **markdown, not
a binary format**: markdown diffs, reviews and converts, and a professor can see
in a diff that the slide claiming three questions now claims four.

```markdown
---
marp: true
title: Model evaluation and overfitting
module: MODULE-06
course_version: CSS-4008-2026-FALL
outcomes: [LO-02, LO-04]
concepts: [CONCEPT-MODEL-EVALUATION, CONCEPT-OVERFITTING]
generated_by: build-presentation-skill
---
```

Then one slide per `---`, in the outline's order, **with the outline's titles**.
The titles are the render contract: `pres render` matches them and stops on a
mismatch rather than reordering anything to agree.

The outline's `purpose` and `minutes` become the speaker notes at render time,
so they do not go on the slide.

`examples/MODULE-06/` in this plugin is a complete worked set — outline, deck,
figure and plan. Read it before writing your first one.

### Write each slide as its archetype

The outline gave every slide an `intent` and an `archetype`. The archetype is
not decoration on the plan — it says what the slide is allowed to contain, and
`pres check` reads it. `references/visual-grammar.md` has all eighteen; these
are the ones most often got wrong.

| The outline says | Write |
| --- | --- |
| `question`, `activity` | the question, and nothing else. **No answer, no explanation** — the whitespace and the missing answer are the teaching, and this is an error rather than a warning |
| `single_visual` | the picture, its identification and what to notice. Not a description of what the room can already see |
| `annotated_object`, `system_diagram`, `process` | the diagram *is* the explanation. Labels on the parts they name — never a diagram followed by "Box A means…, Box B means…" |
| `visual_comparison` | two to four visuals at equal weight, parallel labels, same crop and scale. The layout does the comparing |
| `data_evidence` | the headline carries the claim — "accuracy drops sharply beyond 8K tokens", not "accuracy by context length" |
| `algorithm`, `derivation` | the formal object dominates and the interpretation sits beside it, not underneath it as bullets |
| `primary_source` | the passage at length is correct here. A long source being analysed is not a wall of text |
| `big_idea` | one claim, large, alone |

Two more from the outline that change what you write:

- **`visual_anchor`** — this slide reuses a picture other slides also use. Draw
  it **once**, link the same file, and let the emphasis move. Five unrelated
  diagrams look varied and teach worse: the student spends each slide
  re-learning the layout instead of the addition.
- **`delivery_dependency: high`** — the slide is deliberately incomplete without
  the professor talking over it. Do not fill it in.

What good slides do:

- **Say one thing each.** A slide with two claims is two slides.
- **Use the module's own identifiers** where the structure matters, so the
  material and the course model stay connected.
- **Work the example through.** An example you construct yourself is fine and is
  labelled as such; a statistic, dataset or quotation you cannot cite is not.
- **Ask real questions** on the check slides — something a student answers, not
  a topic they nod at.
- **Fit.** `pres check` warns about a slide that runs past the bottom margin;
  writing to the margin and being told about it afterwards is slower than
  writing shorter slides.
- **Keep emphasis out of bullets.** `**bold**`, `*italic*` and `` `code`` ``
  work in paragraphs, quotes and table cells. Inside a bulleted or numbered
  item they render as plain text, because PowerPoint cannot be given a bullet
  and mixed formatting in the same line through this renderer — `pres check`
  names any item where that happened. If a word in a list has to be emphasised,
  the sentence probably belongs in a paragraph.

## 4. Make the pictures

Read `references/presentation-graphics.md` before adding the first one. The
short version, which is the part most often got wrong:

- **A diagram you draw** — hand-authored SVG, from structure the course already
  claims. This is most figures on a teaching deck and it is the good case.
- **A table** — built from the source material, in markdown, in the deck. Not a
  picture of a table.
- **A chart of this class's data** — there is no command in this plugin that
  produces one, because it does not read student records. So there is no chart:
  the slide says what it needs to say in words. A hand-plotted bar chart of
  marks you totalled yourself is the worst artefact on this list, because a
  chart is not audited.
- **A chart of external data** — only with a citable source, cited on the slide.
- **An image you did not draw** — `pres find-image --search "…"` searches
  openly-licensed work and brings the attribution with it.
- **An illustration nobody has** — write the prompt that would produce it, record
  it on the figure, and report the slide as waiting on an image. Running the
  generator is the professor's, with whatever tool they have.

Figures live **flat beside the deck**, named after it, linked as siblings:

```markdown
![Training data, validation data and a held-out test set never touched during
tuning](MODULE-06-slides-fig-01-split.svg)
```

Alt text on every one, and it is not a caption of the filename — it says what
the picture asserts. Colour is never the only channel: label the lines, vary the
dash, name the regions.

## 5. Write the render contract

`<DECK>.plan.yaml`, beside the deck. `templates/plan.yaml` is the shape.

```yaml
plan_version: 1
deck: MODULE-06-slides.md
title: Model evaluation and overfitting
outline: MODULE-06-slides.outline.yaml
status: approved            # mirrored from the outline as it was when built
max_slides: 24
slides:
  - number: 1
    title: When a high score is not evidence
    minutes: 8
    purpose: surface the train/test misconception
    archetype: question
figures:
  MODULE-06-slides-fig-01-split.svg:
    title: Train, validation and test split
    alt: Training data, validation data and a held-out test set never touched during tuning
```

Carry each slide's `archetype` across from the outline. The renderer reads it —
a `question` or `big_idea` slide is set large and left with its whitespace
rather than flowed like body copy — and it is what a later check has to compare
the markdown against.

Every figure gets an entry, including ones you drew. A figure with no entry is a
figure whose licence nothing checks, and for a found or generated image that is
the difference between a lawful deck and an unlawful one.

## 6. Check it

```bash
pres check work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.md
```

The outline is approved, the plan matches the markdown in count, order and
title, every linked figure exists beside the deck, every figure has alt text,
every claimed source has an attribution line, and every planned visual is either
present or reported.

Fix what it names. Do not edit the plan to match a deck you changed your mind
about mid-write without saying so — if the session should be different, that is
the outline's question and the professor's.

## 7. Hand over

Three or four lines: which module, which concepts covered, what you drew and
what is waiting on an image, anything you left out, and where the course came
from. Say that the deck can be rendered once they are happy with it, and stop
there. Do not render as a flourish — that is `/render-presentation`.

## Rules

- **The outline is the contract.** Same slides, same order, same titles. If the
  deck needs a different sequence, say so and stop; changing it is the
  professor's decision.
- **Never approve an outline on your own initiative.**
- **Serve the claims, never add them.** No new outcome, concept, prerequisite or
  criterion.
- **Markdown, not binaries.** What you write is the thing that generates the
  picture — an SVG, a manim scene — never only the picture.
- **Do not invent sources.** No citations, statistics, dataset descriptions or
  quotations that are not in the material you were given.
- **No chart a command did not produce and no chart you cannot cite.** If the
  figure has no source, the slide says so in words.
- **Alt text on every figure, and colour never the only channel.**
- **No answer key on a slide**, and no student name, email or number anywhere —
  including in a filename or an axis label.
- **Say what you generated.** `generated_by` is not optional. A professor
  presenting these slides should be able to see they were drafted by an agent.
