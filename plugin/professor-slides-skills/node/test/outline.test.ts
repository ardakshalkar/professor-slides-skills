/**
 * What an outline has to be true about before anything is written from it.
 *
 * The internal checks (numbering, timing, titles) catch a careless draft. The
 * checks against the module catch the thing that actually matters: an outline
 * that has quietly taken a decision belonging to the professor, either by
 * covering a concept the module does not claim or by dropping one it does.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildModuleContext } from "../src/context.ts";
import { checkOutline, type Outline } from "../src/plan.ts";
import { fromBundle, type Provenance } from "../src/model.ts";

const PROVENANCE: Provenance = {
  origin: "flat-file",
  detail: "test",
  attempted: [],
  read_at: "2026-08-29T00:00:00.000Z",
};

const COURSE = fromBundle(
  {
    course: { course_id: "CSS-4008", title: "Artificial Intelligence" },
    outcomes: [
      { outcome_id: "LO-02", title: "Evaluate a model", concepts: ["CONCEPT-EVAL"] },
    ],
    concepts: [
      { concept_id: "CONCEPT-EVAL", title: "Model evaluation", prerequisites: ["CONCEPT-SPLIT"] },
      { concept_id: "CONCEPT-OVERFIT", title: "Overfitting", prerequisites: [] },
      { concept_id: "CONCEPT-SPLIT", title: "Train-test separation", prerequisites: [] },
    ],
    modules: [
      { module_id: "MODULE-05", title: "Separation", week: 5, concepts: ["CONCEPT-SPLIT"], outcomes: [] },
      {
        module_id: "MODULE-06",
        title: "Evaluation",
        week: 6,
        outcomes: ["LO-02"],
        concepts: ["CONCEPT-EVAL", "CONCEPT-OVERFIT"],
      },
    ],
    activities: [
      { activity_id: "ACT-0601", module_id: "MODULE-06", type: "lecture", duration_minutes: 100 },
    ],
    resources: [
      { resource_id: "RES-441", title: "Reader", kind: "reading", concepts: ["CONCEPT-EVAL"] },
    ],
  },
  PROVENANCE,
);

const CONTEXT = buildModuleContext(COURSE, "MODULE-06");

const sound = (): Outline => ({
  deck: "MODULE-06-slides",
  title: "Model evaluation and overfitting",
  course_id: "CSS-4008",
  module_id: "MODULE-06",
  status: "draft",
  presentation: { duration_minutes: 100, max_slides: 24 },
  arc: { argues: "A high score is not by itself evidence." },
  slides: [
    { number: 1, title: "When a high score is not evidence", minutes: 50, purpose: "hook", concepts: ["CONCEPT-EVAL"], outcomes: ["LO-02"], sources: ["RES-441"] },
    { number: 2, title: "Overfitting", minutes: 45, purpose: "the correction", concepts: ["CONCEPT-OVERFIT"] },
  ],
});

const errors = (outline: Outline) =>
  checkOutline(outline, CONTEXT).filter((problem) => problem.severity === "error").map((p) => p.message);

test("a sound outline has no errors", () => {
  assert.deepEqual(errors(sound()), []);
});

test("the module context bounds what may be covered", () => {
  assert.deepEqual(CONTEXT.module.concepts, ["CONCEPT-EVAL", "CONCEPT-OVERFIT"]);
  assert.deepEqual(
    CONTEXT.prerequisites.map((concept) => [concept.concept_id, concept.introduced_by]),
    [["CONCEPT-SPLIT", "MODULE-05"]],
  );
});

test("a concept the module does not claim is refused", () => {
  const outline = sound();
  outline.slides[1]!.concepts = ["CONCEPT-SPLIT"];
  const found = errors(outline);
  assert.ok(found.some((message) => /CONCEPT-SPLIT, which MODULE-06 does not claim/.test(message)));
  assert.ok(found.some((message) => /CONCEPT-OVERFIT is claimed by MODULE-06/.test(message)));
});

test("dropping a concept is allowed only when it is declared, with a reason", () => {
  const outline = sound();
  outline.slides = [outline.slides[0]!];
  outline.slides[0]!.minutes = 90;
  assert.ok(errors(outline).some((message) => /CONCEPT-OVERFIT is claimed/.test(message)));

  outline.coverage = { concepts_omitted: [{ concept: "CONCEPT-OVERFIT", why: "moved to the lab" }] };
  assert.deepEqual(errors(outline), []);

  outline.coverage = { concepts_omitted: [{ concept: "CONCEPT-OVERFIT", why: "" }] };
  assert.ok(errors(outline).some((message) => /with no reason/.test(message)));
});

test("duplicate and missing slide numbers are errors", () => {
  const outline = sound();
  outline.slides[1]!.number = 1;
  const found = errors(outline);
  assert.ok(found.some((message) => /appears more than once/.test(message)));
  assert.ok(found.some((message) => /no slide numbered 2/.test(message)));
});

test("a deck that overruns its session is an error", () => {
  const outline = sound();
  outline.slides[0]!.minutes = 120;
  assert.ok(errors(outline).some((message) => /165 minutes for a 100-minute session/.test(message)));
});

test("a source the module has no reference for is refused", () => {
  const outline = sound();
  outline.slides[0]!.sources = ["RES-999"];
  assert.ok(errors(outline).some((message) => /RES-999/.test(message)));
});

test("an outline with no arc is a warning, not a refusal", () => {
  const outline = sound();
  delete outline.arc;
  assert.deepEqual(errors(outline), []);
  assert.ok(
    checkOutline(outline, CONTEXT).some((problem) => /no arc/.test(problem.message)),
  );
});
