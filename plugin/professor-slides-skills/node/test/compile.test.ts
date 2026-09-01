/**
 * The plan as a projection, and the approval gate as a per-deck fact.
 *
 * Two things are being protected here. The first is that no field in the plan is
 * ever typed twice: every one of them is carried from the outline or read off
 * the markdown, and the test that matters is that a plan compiled from a deck
 * and its outline says what the hand-written one used to say.
 *
 * The second is the gate. Making approval mode-dependent is the one change in
 * this refactor that could quietly weaken a safety property, so the cases below
 * pin all four corners: a deep deck refuses to render unapproved, a fast deck
 * needs no outline at all, a plan written before modes existed still requires
 * approval, and every path leaves a line saying which of those happened.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { buildPlan, compilePlan, defaultApproval, inferArchetype } from "../src/compile.ts";
import { approvalRequired, loadPlan, type DeckPlan, type Outline } from "../src/plan.ts";
import { checkDeck, errorsIn } from "../src/check.ts";
import { parseBlocks, splitSlides } from "../src/deck.ts";

const DECK = `---
marp: true
title: Model evaluation
---

# Model evaluation

The score you reported is not evidence yet.

---

## Three sets, and what each one is for

![Train, validation and a held-out test set](d-fig-01-split.svg)

---

## What would you predict?

---

## Where this goes next

| Week | Idea |
| --- | --- |
| 6 | evaluation |
| 7 | regularisation |
`;

const OUTLINE: Outline = {
  deck: "d",
  title: "Model evaluation and overfitting",
  status: "approved",
  presentation: { max_slides: 12, duration_minutes: 100 },
  slides: [
    { number: 1, title: "Model evaluation", intent: "orient", archetype: "section_opener", minutes: 3, purpose: "open" },
    {
      number: 2,
      title: "Three sets, and what each one is for",
      intent: "build_intuition",
      archetype: "annotated_object",
      minutes: 12,
      purpose: "make the split concrete",
      density: "sparse",
      text_roles: ["label", "annotation"],
      required_visual: "annotated split",
      visual_anchor: "evaluation_split",
      outcomes: ["LO-02"],
      concepts: ["CONCEPT-MODEL-EVALUATION"],
    },
    { number: 3, title: "What would you predict?", intent: "check_understanding", archetype: "activity", minutes: 8, purpose: "commit first" },
    { number: 4, title: "Where this goes next", intent: "integrate", archetype: "synthesis", minutes: 4, purpose: "hand over" },
  ],
};

/** A deck, its figure and optionally an outline, in a fresh directory. */
function workspace(options: { outline?: Outline | null; plan?: string; deck?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "pres-compile-"));
  writeFileSync(join(dir, "d.md"), options.deck ?? DECK);
  writeFileSync(join(dir, "d-fig-01-split.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  if (options.outline !== null) {
    const outline = options.outline ?? OUTLINE;
    writeFileSync(join(dir, "d.outline.yaml"), JSON.stringify(outline));
  }
  if (options.plan) writeFileSync(join(dir, "d.plan.yaml"), options.plan);
  return dir;
}

test("every plan field is carried from the outline or read off the markdown", () => {
  const { plan, warnings } = compilePlan("/x/d.md", DECK, {
    outline: OUTLINE,
    outlinePath: "/x/d.outline.yaml",
    mode: "deep",
  });

  assert.equal(plan.generated, true);
  assert.equal(plan.deck, "d.md");
  assert.equal(plan.title, "Model evaluation and overfitting");
  assert.equal(plan.outline, "d.outline.yaml");
  assert.equal(plan.status, "approved");
  assert.equal(plan.max_slides, 12);
  assert.equal(plan.slides.length, 4);

  // Numbers are positional and titles come from the markdown, because that is
  // what goes on the screen.
  assert.deepEqual(plan.slides.map((slide) => slide.number), [1, 2, 3, 4]);
  assert.equal(plan.slides[1]!.title, "Three sets, and what each one is for");

  // Everything the outline said about slide 2, without a word of it retyped.
  const second = plan.slides[1]!;
  assert.equal(second.minutes, 12);
  assert.equal(second.purpose, "make the split concrete");
  assert.equal(second.archetype, "annotated_object");
  assert.equal(second.intent, "build_intuition");
  assert.equal(second.density, "sparse");
  assert.deepEqual(second.text_roles, ["label", "annotation"]);
  assert.equal(second.required_visual, "annotated split");
  assert.equal(second.visual_anchor, "evaluation_split");
  assert.deepEqual(second.outcomes, ["LO-02"]);
  assert.equal(second.archetype_source, undefined, "an outline's archetype is not a guess");

  // The figure list is the deck's own image links.
  assert.deepEqual(Object.keys(plan.figures ?? {}), ["d-fig-01-split.svg"]);
  assert.equal(
    plan.figures!["d-fig-01-split.svg"]!.alt,
    "Train, validation and a held-out test set",
  );
  assert.deepEqual(warnings, []);
});

test("a title the deck and the outline disagree about is reported, and the deck wins", () => {
  const drifted: Outline = {
    ...OUTLINE,
    slides: OUTLINE.slides.map((slide) =>
      slide.number === 3 ? { ...slide, title: "Predict, then look" } : slide),
  };
  const { plan, warnings } = compilePlan("/x/d.md", DECK, { outline: drifted });
  assert.equal(plan.slides[2]!.title, "What would you predict?");
  assert.ok(warnings.some((line) => /slide 3/.test(line) && /Predict, then look/.test(line)));
});

test("a figure's attribution survives regeneration, because nothing else knows it", () => {
  const existing: DeckPlan = {
    deck: "d.md",
    title: "old",
    slides: [],
    figures: {
      "d-fig-01-split.svg": {
        title: "A split",
        alt: "hand-written alt",
        image_source: {
          provider: "openverse",
          source_url: "https://example.org/x",
          license: "CC BY 4.0",
          attribution: "Someone, CC BY 4.0",
        },
      },
    },
  };
  const { plan } = compilePlan("/x/d.md", DECK, { outline: OUTLINE, existing });
  const figure = plan.figures!["d-fig-01-split.svg"]!;
  assert.equal(figure.image_source?.attribution, "Someone, CC BY 4.0");
  // The alt already recorded is kept rather than replaced by the markdown's:
  // an attribution and the sentence beside it were written together.
  assert.equal(figure.alt, "hand-written alt");
});

test("a credited figure nothing links any more is kept and reported, never deleted", () => {
  const existing: DeckPlan = {
    deck: "d.md",
    title: "old",
    slides: [],
    figures: {
      "gone.svg": {
        title: "Removed",
        image_source: { attribution: "Someone, CC BY 4.0" },
      },
      "also-gone.svg": { title: "Just a drawing" },
    },
  };
  const { plan, warnings } = compilePlan("/x/d.md", DECK, { outline: OUTLINE, existing });
  assert.ok(plan.figures!["gone.svg"], "an attribution is not a thing bookkeeping deletes");
  assert.equal(plan.figures!["also-gone.svg"], undefined, "an uncredited orphan just goes");
  assert.ok(warnings.some((line) => /gone\.svg/.test(line)));
});

test("with no outline, archetypes are guessed conservatively and marked as guesses", () => {
  const { plan, warnings } = compilePlan("/x/d.md", DECK, { outline: null, mode: "fast", infer: true });
  const byNumber = new Map(plan.slides.map((slide) => [slide.number, slide]));
  assert.equal(byNumber.get(1)!.archetype, undefined, "the title slide is composed, not flowed");
  assert.equal(byNumber.get(2)!.archetype, "single_visual");
  assert.equal(byNumber.get(3)!.archetype, "question");
  assert.equal(byNumber.get(4)!.archetype, "structured_comparison");
  for (const number of [2, 3, 4]) {
    assert.equal(byNumber.get(number)!.archetype_source, "inferred");
  }
  assert.ok(warnings.some((line) => /guessed/.test(line)));
});

test("inference stays silent when it is not sure", () => {
  const blocks = parseBlocks("## A claim\n\nSome prose about the claim, at length.\n\n- one\n- two\n");
  assert.equal(inferArchetype(blocks, "A claim", 3), null);
  // A question mark in the title is the one strong signal, and it beats the body.
  assert.equal(inferArchetype(blocks, "Is this a claim?", 3), "question");
});

test("a guessed archetype is not measured against, and a declared one is", () => {
  const wordy = `---
marp: true
---

# Title

Kicker.

---

## Where are we?

Last time we split a dataset and reported an accuracy on the split we had
tuned against, which is a number that looks like evidence and is not one, and
today we will find out what to measure instead and why the difference matters
more than it looks, at some considerable length, in prose, on a slide.
`;
  const guessed = compilePlan("/x/d.md", wordy, { outline: null, infer: true }).plan;
  assert.equal(guessed.slides[1]!.archetype, "question");
  assert.equal(guessed.slides[1]!.archetype_source, "inferred");

  const dir = mkdtempSync(join(tmpdir(), "pres-density-"));
  writeFileSync(join(dir, "d.md"), wordy);
  writeFileSync(join(dir, "d.plan.yaml"), "");
  buildPlan(join(dir, "d.md"), { outline: null, mode: "fast" });
  const silent = checkDeck(join(dir, "d.md"));
  assert.equal(
    silent.problems.filter((problem) => /is planned 'question'/.test(problem.message)).length,
    0,
    "a warning derived from a guess is a warning about the guess",
  );

  // Declared, and now the same slide is measured.
  const declared: Outline = {
    deck: "d",
    title: "x",
    status: "approved",
    slides: [
      { number: 1, title: "Title" },
      { number: 2, title: "Where are we?", archetype: "question", purpose: "orient" },
    ],
  };
  writeFileSync(join(dir, "d.outline.yaml"), JSON.stringify(declared));
  buildPlan(join(dir, "d.md"), { mode: "standard" });
  const measured = checkDeck(join(dir, "d.md"));
  assert.ok(
    measured.problems.some((problem) => /is planned 'question'/.test(problem.message)),
    "a declared archetype is a promise, and the check keeps it",
  );
});

test("approval defaults follow the mode, and a plan with no mode still requires it", () => {
  assert.equal(defaultApproval("fast"), "not_required");
  assert.equal(defaultApproval("standard"), "not_required");
  assert.equal(defaultApproval("deep"), "required");
  assert.equal(defaultApproval(undefined), "required");

  // The backward-compatibility case: every plan written before modes existed
  // went through the gate, and still does.
  assert.equal(approvalRequired({}), true);
  assert.equal(approvalRequired(null), true);
  assert.equal(approvalRequired({ mode: "deep" }), true);
  assert.equal(approvalRequired({ mode: "fast" }), false);
  assert.equal(approvalRequired({ mode: "standard" }), false);
  // An explicit field beats the mode, so "standard, but I want to approve it"
  // is expressible.
  assert.equal(approvalRequired({ mode: "standard", approval: "required" }), true);
  assert.equal(approvalRequired({ mode: "deep", approval: "given" }), false);
});

test("a deep deck refuses to render from a draft outline; a standard one says so and passes", () => {
  const draft: Outline = { ...OUTLINE, status: "draft" };

  const strict = workspace({ outline: draft });
  buildPlan(join(strict, "d.md"), { mode: "deep" });
  const blocked = checkDeck(join(strict, "d.md"));
  assert.ok(errorsIn(blocked.problems).some((problem) => /not approved/.test(problem.message)));

  const relaxed = workspace({ outline: draft });
  buildPlan(join(relaxed, "d.md"), { mode: "standard" });
  const allowed = checkDeck(join(relaxed, "d.md"));
  assert.deepEqual(errorsIn(allowed.problems), []);
  assert.ok(
    allowed.problems.some(
      (problem) => problem.severity === "note" && /nobody explicitly approved/.test(problem.message),
    ),
    "a deck nobody reviewed always says so",
  );

  // And a professor who asked to approve first gets the gate back inside
  // standard mode.
  const asked = workspace({ outline: draft });
  buildPlan(join(asked, "d.md"), { mode: "standard", approval: "required" });
  assert.ok(errorsIn(checkDeck(join(asked, "d.md")).problems).length);
});

test("a fast deck needs no outline at all, and is not silent about that", () => {
  const dir = workspace({ outline: null });
  const result = buildPlan(join(dir, "d.md"), { mode: "fast" });
  assert.equal(result.plan.approval, "not_required");
  assert.equal(result.plan.outline, undefined);

  const checked = checkDeck(join(dir, "d.md"));
  assert.deepEqual(errorsIn(checked.problems), []);
  assert.ok(
    checked.problems.some(
      (problem) => problem.severity === "note" && /no outline/.test(problem.message),
    ),
  );

  // Whereas a deck with no outline whose plan requires approval is refused,
  // rather than being waved through by the absence of the thing it needs.
  buildPlan(join(dir, "d.md"), { mode: "deep", approval: "required" });
  assert.ok(errorsIn(checkDeck(join(dir, "d.md")).problems).length);
});

test("a stale generated plan is reported with the command that fixes it", () => {
  const dir = workspace();
  buildPlan(join(dir, "d.md"), { mode: "standard" });
  assert.deepEqual(errorsIn(checkDeck(join(dir, "d.md")).problems), []);

  // Change the outline without regenerating. This is the case the contract
  // check cannot see: count, order and titles all still agree, and the speaker
  // notes the renderer prints are the old ones.
  writeFileSync(
    join(dir, "d.outline.yaml"),
    JSON.stringify({
      ...OUTLINE,
      slides: OUTLINE.slides.map((slide) =>
        slide.number === 2 ? { ...slide, minutes: 20, purpose: "a different purpose" } : slide),
    }),
  );
  const stale = checkDeck(join(dir, "d.md"));
  assert.ok(
    stale.problems.some((problem) => /pres plan build/.test(problem.message)),
    "the fix for a projection that drifted is a command, not an afternoon",
  );

  // And running it clears the finding.
  buildPlan(join(dir, "d.md"), {});
  const fresh = checkDeck(join(dir, "d.md"));
  assert.ok(!fresh.problems.some((problem) => /out of date/.test(problem.message)));
});

test("the written plan is valid YAML, says it is generated, and round-trips", () => {
  const dir = workspace();
  const { planPath } = buildPlan(join(dir, "d.md"), { mode: "deep" });
  const text = readFileSync(planPath, "utf8");
  assert.match(text, /^# Generated by `pres plan build`/);
  const parsed = parseYaml(text) as DeckPlan;
  assert.equal(parsed.generated, true);
  assert.equal(parsed.mode, "deep");
  assert.equal(parsed.approval, "required");
  assert.equal(loadPlan(planPath).slides.length, splitSlides(DECK).length);
});

test("the title picture is carried from the outline, and a hand-written plan keeps its own", () => {
  const withImage: Outline = {
    ...OUTLINE,
    title_slide: { image: "t.jpg", image_alt: "An empty lecture theatre." },
    slide_numbers: false,
  };
  const fromOutline = compilePlan("/x/d.md", DECK, { outline: withImage }).plan;
  assert.equal(fromOutline.title_slide?.image, "t.jpg");
  assert.equal(fromOutline.slide_numbers, false);

  // A deck that predates the field keeps what its plan already said.
  const legacy: DeckPlan = {
    deck: "d.md",
    title: "x",
    slides: [],
    title_slide: { image: "old.jpg" },
  };
  const preserved = compilePlan("/x/d.md", DECK, { outline: OUTLINE, existing: legacy }).plan;
  assert.equal(preserved.title_slide?.image, "old.jpg");
});
