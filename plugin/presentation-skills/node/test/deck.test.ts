/**
 * The contract between a deck and its plan, and the credit a figure must carry.
 *
 * These are the checks that stop a render, so they are the ones worth testing:
 * everything else in the renderer is pptxgenjs doing what pptxgenjs does, and a
 * test of that is a test of a library.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkContract, parseBlocks, slideTitle, splitSlides } from "../src/deck.ts";
import { creditForFigure } from "../src/plan.ts";

const DECK = `---
marp: true
title: Model evaluation
---

# Model evaluation

CSS-4008 · week 6

---

## Where we are

- Last time: train-test separation
- Today: what a score is evidence of

---

## The split

![Training, validation and a held-out test set](fig-01-split.svg)
`;

test("front matter is not a slide", () => {
  const slides = splitSlides(DECK);
  assert.equal(slides.length, 3);
  assert.match(slides[0]!, /^# Model evaluation/);
});

test("a slide's title is its first heading", () => {
  const slides = splitSlides(DECK).map(parseBlocks);
  assert.equal(slideTitle(slides[1]!), "Where we are");
});

test("an image with wrapped alt text is still an image", () => {
  const blocks = parseBlocks("## The split\n\n![Training data,\nvalidation data](fig-01-split.svg)");
  const image = blocks.find((block) => block.kind === "image");
  assert.ok(image && image.kind === "image");
  assert.equal(image.src, "fig-01-split.svg");
  assert.equal(image.alt, "Training data, validation data");
});

test("a plan with the same slides in the same order agrees", () => {
  const slides = splitSlides(DECK).map(parseBlocks);
  const problems = checkContract(slides, {
    slides: [
      { number: 1, title: "Model evaluation" },
      { number: 2, title: "Where we are" },
      { number: 3, title: "The split" },
    ],
  });
  assert.deepEqual(problems, []);
});

test("a renamed slide is reported, not repaired", () => {
  const slides = splitSlides(DECK).map(parseBlocks);
  const problems = checkContract(slides, {
    slides: [
      { number: 1, title: "Model evaluation" },
      { number: 2, title: "Where we were" },
      { number: 3, title: "The split" },
    ],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /slide 2/);
});

test("a plan of a different length is reported", () => {
  const slides = splitSlides(DECK).map(parseBlocks);
  const problems = checkContract(slides, {
    slides: [{ number: 1, title: "Model evaluation" }],
  });
  assert.ok(problems.some((problem) => /1 slide\(s\), the markdown has 3/.test(problem)));
});

test("max_slides is enforced", () => {
  const slides = splitSlides(DECK).map(parseBlocks);
  const problems = checkContract(slides, {
    max_slides: 2,
    slides: [
      { number: 1, title: "Model evaluation" },
      { number: 2, title: "Where we are" },
      { number: 3, title: "The split" },
    ],
  });
  assert.ok(problems.some((problem) => /allows 2/.test(problem)));
});

test("a figure you drew needs no credit", () => {
  assert.equal(creditForFigure(undefined, "fig-01-split.svg"), null);
});

test("a found figure without an attribution line stops the render", () => {
  assert.throws(
    () => creditForFigure({ image_source: { provider: "openverse", source_url: "https://x" } }, "fig.jpg"),
    /attribution/,
  );
});

test("a found figure with attribution carries it onto the slide", () => {
  const credit = creditForFigure(
    { image_source: { attribution: '"Matrix" by A, CC BY 4.0' } },
    "fig.jpg",
  );
  assert.equal(credit, '"Matrix" by A, CC BY 4.0');
});

test("a generated illustration is labelled as one", () => {
  const credit = creditForFigure({ image_prompt: { model: "some-model", generated: true } }, "fig.png");
  assert.match(credit!, /generated with some-model/);
  assert.match(credit!, /Not a photograph or a measurement/);
});
