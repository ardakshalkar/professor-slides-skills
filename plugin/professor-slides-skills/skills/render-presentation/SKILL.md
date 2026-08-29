---
name: render-presentation
description: Turn a finished presentation into the files a professor actually presents — a PowerPoint deck with real editable shapes and speaker notes, and a PDF converted from that same deck. Use when the user asks to render, export, build or produce a .pptx, a PowerPoint, a PDF or slides from markdown that already exists. Writing the slides in the first place is /build-presentation.
stage: publish
requires: [deck, plan]
produces: [pptx, pdf]
writes: output
---

# Render the presentation

**Needs:** a deck with its plan beside it, from `/build-presentation`, and an
outline whose `status` is `approved`. Rendering additionally needs `pptxgenjs`
and `sharp`; the PDF needs LibreOffice.

One command does it:

```bash
pres render work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.md --pdf
```

It reads the markdown, the plan beside it and the figures beside that, and
writes `output/<DECK>.pptx` — plus the PDF with `--pdf`, converted from that same
deck by LibreOffice rather than rendered a second time.

`output/` is gitignored deliberately: built binaries belong on the professor's
disk, not in a directory whose value is that its contents diff. The rasterized
PNGs go there too, and nowhere else.

## Do not do this by hand

Four rules are enforced in that command rather than left to judgement, and each
is a mistake this made before the check existed.

- **An unapproved outline is refused.** A deck rendered from a proposal looks
  exactly like a finished one once it is open in PowerPoint, and nothing about
  the file says nobody agreed to what is in it.
- **The plan is the contract.** Slide count, order and titles must match the
  markdown, or it exits and says where. One of the two was edited after the
  other; which one is wrong is the professor's question. Nothing reorders slides
  to make them agree.
- **Attribution is enforced.** A figure recording a source without an
  attribution line stops the render. The failure it prevents is the silent kind:
  the deck builds, the lecture happens, and the licence was never satisfied.
- **Overflow is reported.** Any slide running past the bottom margin is named,
  with how far over it goes.

If the render refuses, report what it said and stop. Do not edit the plan to
match the deck, or the deck to match the plan, without knowing which of the two
is the one that was approved.

## Then look at it

The first render usually has a real defect or two — a misjudged image height, a
list that lost its numbering, a table that wrapped badly. They are obvious in
the pages and invisible in the source. Open the PDF and read it before handing
it over.

## When a dependency is missing

Say which, and hand over what is honest about being a substitute.

**No LibreOffice, PDF wanted for review.** Marp renders straight to PDF and needs
only a browser:

```bash
npx @marp-team/marp-cli work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.md --pdf --pdf-outlines -o output/MODULE-06-slides-review.pdf
```

Say what it is: a *second rendering* of the markdown, not a conversion of the
deck. Fine for reading through and checking the words; wrong for anything
presented or handed out, because it is not the same document the professor will
open in PowerPoint.

**No `pptxgenjs` or `sharp`.**

```bash
cd node && npm install pptxgenjs sharp
```

Marp will write a `.pptx` and it is worse than it looks: each slide is a flat
image, so nothing in it can be edited or reused, and none of the four checks
above runs.

```bash
npx @marp-team/marp-cli work/.../MODULE-06-slides.md --pptx -o output/MODULE-06-slides.pptx
```

Both Marp routes need a Chromium-based browser or Firefox, which Marp drives
through puppeteer-core. Neither is the renderer; both are what you offer while
saying so.

## Afterwards

The `.pptx` is not registered anywhere and is not a second source. It is
reproducible from the markdown at any time, and a second artefact with a second
checksum leaves the professor with two decks and no way to tell which one is the
one that was approved.

If they then edit the deck in PowerPoint, **report that as drift and leave it**.
The edited slide may well be the better one, and folding it back into the
markdown is their call, not yours.

## Rules

- **Render after approval, never before,** and into gitignored `output/`.
- **Never edit the deck or the plan to make a render succeed.** A refusal is
  information.
- **Say which renderer produced the file** when it was not `pres render`, and
  what that costs.
- **Do not register the render** as a source of anything.
- **Report drift, do not reconcile it.**
