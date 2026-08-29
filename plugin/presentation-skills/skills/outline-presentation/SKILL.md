---
name: outline-presentation
description: Plan a presentation before writing it — find the course, work out how the topics evolve across the session, and draft an outline saying which learning outcomes and concepts each slide serves and what is deliberately left out, for the professor to approve. Use when the user asks to outline, plan or structure a lecture, talk, seminar or slide deck, asks what a session should cover or in what order, or names a week or module to prepare slides for. Filling an approved outline in with slides is /build-presentation.
stage: design
requires: [course]
produces: [outline]
writes: drafts
---

# Outline a presentation

**Needs:** a course, from any of the three places `pres source` looks. Works
with no course at all — see `references/working-without-a-course.md`.

You plan the session. You do not write it, and you do not decide what the course
teaches. If the session you would need to plan requires a concept or outcome the
course does not have, stop and say which — that is the professor's decision.

## 1. Find the course, and say where it came from

```bash
pres source --course CSS-4008
```

Read the provenance line and carry it into your report. A deck built from a
course directory while the professor believed they were working against the
shared database is a deck built from the wrong term's outcomes, and it looks
identical to a correct one. `references/course-source.md` has the resolution
order and what each failure means.

Then bound the session:

```bash
pres context --course CSS-4008 --module MODULE-06
```

This is everything the outline may be built from, and deliberately nothing else:

- **The module** — its outcomes and concepts. These bound what the session may
  cover and what it may claim to serve.
- **Prerequisites**, each with the module that introduced it. Material that
  assumes a prerequisite the class has not met is material that will not land.
- **The previous module** — what was taught last week is what the opening slide
  builds on.
- **The scheduled meeting** — its type and duration set the shape. A 100-minute
  lecture and a 150-minute lab are not the same artefact.
- **The references** for these concepts — readings, book chapters, course pages.
  This is what the deck is grounded in.

With no module named, `pres context --date 2026-10-05` finds the one scheduled
that day.

## 2. Resolve the preferences, and ask for what is missing

In order, each beating the one before: the plugin's `preferences/defaults.yaml`,
`.pres/preferences.yaml`, a course `preferences.yaml`, then what the professor
just said.

Two values are deliberately never defaulted, because they change the shape of
the whole deck rather than one slide of it:

- **audience** — second-year students, a research seminar, a faculty workshop
- **duration** — usually settled by the scheduled meeting; ask when nothing is
  scheduled

Ask for those. Take the rest from the preferences and **say which you took**, so
a professor who disagrees knows there was a decision to disagree with.

## 3. See how it is taught elsewhere

Spend a few minutes on how other people teach this before deciding the order. A
worked example that has survived a decade of lectures beats one invented this
morning, and the commonest defect in generated material is not error — it is
that the explanation has no idea which step students actually trip on.

Read two or three published treatments properly rather than skimming eight, and
come back with **insight, not text**: the order they introduce the ideas in and
where it differs from ours, the analogy they reach for, the misconception they
spend time on. That last one is the expensive knowledge.

**Never copy.** Not slide text, not problem statements, not figures, not an
exercise with the numbers changed. Material from another institution is evidence
about the subject, not authority over this course, and its licence is theirs.
Where a source shaped the sequence, say so in the report, with the URL.

Skip this step rather than shortening it in two cases: the professor gave you
their own material, which is then the source; or there is no network, in which
case say so rather than implying the survey happened.

## 4. Write the arc first

Before any slide. `references/outline-craft.md` is the craft; the short version
is that a slide list with no arc is a list of topics, and that is the shape every
generated deck defaults to.

```yaml
arc:
  starts_from: they can split a dataset and report an accuracy (MODULE-05)
  argues: a score measured on data you tuned against is not evidence of anything
  turn: the model that scored 0.97 in week 5 scores 0.61 on data it has not seen
  leaves_them_able_to: say which of two reported accuracies is trustworthy, and why
```

If you cannot write `argues` as a claim rather than a topic, the session does not
yet have a point. Say so instead of producing slides.

## 5. Then the sequence

`templates/` beside this skill holds the outline shapes — lecture, seminar,
workshop. Read `templates.yaml`, show the professor the list, and use what they
pick; with no preference use the default and say which it was. The scheduled
activity usually settles it.

Write to `work/<COURSE_VERSION_ID>/presentations/<DECK>.outline.yaml`. Fill every
slot; delete what you do not need rather than filling it with a plausible
sentence.

```yaml
slides:
  - number: 1
    type: hook
    title: When a high score is not evidence
    minutes: 8
    purpose: surface the train/test misconception using their own week-5 result
    outcomes: [LO-02]
    concepts: [CONCEPT-MODEL-EVALUATION]
    sources: [RES-441]
  - number: 2
    type: concept
    title: Training evidence versus held-out evidence
    minutes: 12
    purpose: name the distinction the rest of the session rests on
    outcomes: [LO-02]
    concepts: [CONCEPT-MODEL-EVALUATION]
    required_visual: annotated train / validation / test split
```

What a good sequence does:

- **Opens by placing the session** — what they can already do, what today adds,
  which earlier concept it builds on and where that was taught.
- **Handles the known weakness early.** If the professor has told you about a
  shared misconception, it gets corrected before the new content, not after.
- **Names concepts by identifier**, so the outline and the course model stay
  connected and the coverage check can run.
- **Ends with checks for understanding** — one per new concept, phrased as a
  question a student answers rather than a topic they nod at.
- **Leaves the last ten minutes alone.** A plan that fills the whole session has
  planned for a room with no questions in it.

## 6. Then coverage, honestly

```yaml
coverage:
  outcomes_served: [LO-02, LO-04]
  concepts_covered: [CONCEPT-MODEL-EVALUATION, CONCEPT-OVERFITTING]
  concepts_omitted:
    - concept: CONCEPT-REGULARIZATION
      why: introduced properly in MODULE-07; named here only as what comes next
```

An omission is often right — a hundred minutes does not hold four concepts. An
*unrecorded* omission is indistinguishable from having forgotten, and is an
error.

The reverse is the harder rule: **the outline may not add a concept the module
does not claim.** Say which one the session needs, and stop.

## 7. Check it

```bash
pres outline check work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.outline.yaml
```

Slide numbers unique and contiguous, every slide titled, minutes roughly filling
the session, within `max_slides`, every concept belonging to the module, every
outcome one the module serves, every cited reference real, every omission
declared with a reason.

## 8. Hand over — and stop

Report, in a few lines: where the course came from, the arc, the shape and
length, which outcomes and concepts are covered, what is deliberately left out
and why, and anything you had to assume.

Then ask for approval, and stop there.

**Leave `status: draft`.** The status is the whole approval mechanism in this
plugin — `/build-presentation` refuses a draft and `pres render` refuses a deck
built from one. It moves to `approved` when the professor says so, either by
editing the file or by telling you to in the current request. Never on your own
initiative, and never because the outline looks finished.

## Rules

- **The template gives the shape; the professor picks it.** A slot with nothing
  to put in it is deleted or answered honestly, never filled with a plausible
  sentence.
- **Serve the claims, never add them.** No new outcome, concept, prerequisite or
  assessment criterion. If the session needs one, say which and stop.
- **Stay inside the module.** An outline that wanders into next week's concepts
  breaks the prerequisite ordering the whole course rests on.
- **Do not invent sources.** No citations, statistics, dataset descriptions or
  quotations that are not in the material you were given. An example you
  construct yourself is fine and is labelled as such.
- **Say where it came from.** The provenance line, and any source that shaped the
  sequence, with its URL.
- **Ask rather than assume audience and duration.** Everything else has a
  default; those two do not.
- **Never approve your own outline.**
