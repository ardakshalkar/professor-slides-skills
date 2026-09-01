/**
 * The visual grammar and the whole-deck critique.
 *
 * Almost everything here is a warning, so the tests mostly assert that a
 * finding is *reported* rather than that it stops anything. The exception is
 * the one that matters most and is tested first: an answer on a question slide.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCHETYPES, INTENTS, TEXT_ROLES } from "../src/archetypes.ts";
import { checkSlideGrammar, critiqueDeck } from "../src/critique.ts";
import type { Outline, OutlineSlide } from "../src/plan.ts";

const slide = (over: Partial<OutlineSlide> & { number: number }): OutlineSlide => ({
  title: `slide ${over.number}`,
  ...over,
});

const deck = (slides: OutlineSlide[], over: Partial<Outline> = {}): Outline => ({
  deck: "d",
  title: "t",
  slides,
  ...over,
});

const messages = (problems: { message: string }[]) => problems.map((p) => p.message).join("\n");
const errorsOf = (problems: { severity: string; message: string }[]) =>
  problems.filter((p) => p.severity === "error");

test("the grammar is one vocabulary, and it is complete", () => {
  assert.equal(Object.keys(ARCHETYPES).length, 18);
  assert.equal(Object.keys(TEXT_ROLES).length, 10);
  assert.ok(INTENTS.includes("check_understanding"));
  // Every archetype's allowed roles are real roles, and nothing both allows and
  // forbids the same one.
  for (const [name, archetype] of Object.entries(ARCHETYPES)) {
    for (const role of archetype.roles) assert.ok(role in TEXT_ROLES, `${name}: ${role}`);
    for (const role of archetype.forbids ?? []) {
      assert.ok(role in TEXT_ROLES, `${name}: ${role}`);
      assert.ok(!archetype.roles.includes(role), `${name} both allows and forbids ${role}`);
    }
  }
});

test("an answer on a question slide is an error, not a warning", () => {
  const problems = checkSlideGrammar(
    slide({ number: 1, archetype: "question", text_roles: ["question", "explanation"] }),
  );
  const errors = errorsOf(problems);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /must not carry explanation/);
});

test("the same applies to an activity slide", () => {
  const errors = errorsOf(
    checkSlideGrammar(slide({ number: 2, archetype: "activity", text_roles: ["takeaway"] })),
  );
  assert.equal(errors.length, 1);
});

test("a role the archetype is not for is a warning", () => {
  const problems = checkSlideGrammar(
    slide({ number: 3, archetype: "single_visual", text_roles: ["label", "takeaway"] }),
  );
  assert.deepEqual(errorsOf(problems), []);
  assert.match(messages(problems), /takeaway text on a 'single_visual' slide/);
});

test("describing what the room can already see is refused on a photograph", () => {
  const errors = errorsOf(
    checkSlideGrammar(slide({ number: 4, archetype: "single_visual", text_roles: ["explanation"] })),
  );
  assert.equal(errors.length, 1);
});

test("an archetype that does not exist is an error and stops further grammar checks", () => {
  const problems = checkSlideGrammar(slide({ number: 5, archetype: "hero_banner" }));
  assert.equal(problems.length, 1);
  assert.match(problems[0]!.message, /is not a slide archetype/);
});

test("a picture-carried slide that names no picture is reported", () => {
  const problems = checkSlideGrammar(slide({ number: 6, archetype: "annotated_object" }));
  assert.match(messages(problems), /carried by its picture/);
});

test("three identical archetypes in a row are reported", () => {
  const problems = critiqueDeck(deck([
    slide({ number: 1, archetype: "definition" }),
    slide({ number: 2, archetype: "definition" }),
    slide({ number: 3, archetype: "definition" }),
  ]));
  assert.match(messages(problems), /slides 1–3 are all 'definition'/);
});

test("a mechanism shown before anything asks for it is reported", () => {
  const problems = critiqueDeck(deck([
    slide({ number: 1, archetype: "system_diagram", required_visual: "the pipeline" }),
    slide({ number: 2, archetype: "question", text_roles: ["question"] }),
  ]));
  assert.match(messages(problems), /before anything asks the question it answers/);
});

test("a visual anchor used once is reported — it is a figure, not an anchor", () => {
  const problems = critiqueDeck(deck([
    slide({ number: 1, archetype: "system_diagram", visual_anchor: "pipeline" }),
    slide({ number: 2, archetype: "worked_example" }),
  ]));
  assert.match(messages(problems), /visual_anchor 'pipeline' is used on one slide/);

  const reused = critiqueDeck(deck([
    slide({ number: 1, archetype: "question", text_roles: ["question"] }),
    slide({ number: 2, archetype: "system_diagram", visual_anchor: "pipeline", focus: "retrieval" }),
    slide({ number: 3, archetype: "system_diagram", visual_anchor: "pipeline", focus: "generation" }),
  ]));
  assert.doesNotMatch(messages(reused), /used on one slide/);
});

test("nine slides of new material with no reset are reported", () => {
  const many = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: index % 2 ? "worked_example" : "definition" }));
  assert.match(messages(critiqueDeck(deck(many))), /no roadmap, synthesis or section break/);
});

test("a deck that never asks the room anything is reported", () => {
  const many = Array.from({ length: 6 }, (_, index) =>
    slide({ number: index + 1, archetype: "worked_example" }));
  assert.match(messages(critiqueDeck(deck(many))), /no slide asks the students anything/);
});

test("beats have to cover the slides, and to hand over", () => {
  const problems = critiqueDeck(deck(
    [slide({ number: 1 }), slide({ number: 2 }), slide({ number: 3 })],
    {
      beats: [
        { beat: "open-lecture", slides: [1], exit_understanding: "they know what is coming" },
        { beat: "story-so-far", slides: [1], exit_understanding: "done" },
      ],
    },
  ));
  const text = messages(problems);
  assert.match(text, /slide 1 is claimed by two beats/);
  assert.match(text, /slide 2 belongs to no beat/);
  assert.match(text, /has no transition_question/);
});

test("a beat with no exit_understanding cannot say whether its slides are right", () => {
  const problems = critiqueDeck(deck([slide({ number: 1 })], {
    beats: [{ beat: "open-lecture", slides: [1] }],
  }));
  assert.match(messages(problems), /does not say what is true for the learner/);
});

test("a handout keeping slides that need the professor is reported", () => {
  const problems = critiqueDeck(deck(
    [slide({ number: 1, archetype: "single_visual", required_visual: "the map", delivery_dependency: "high" })],
    { presentation: { output_mode: "handout" } },
  ));
  assert.match(messages(problems), /output_mode is handout/);
});

test("the same deck as teaching material says nothing about it", () => {
  const problems = critiqueDeck(deck(
    [slide({ number: 1, archetype: "single_visual", required_visual: "the map", delivery_dependency: "high" })],
    { presentation: { output_mode: "teaching" } },
  ));
  assert.doesNotMatch(messages(problems), /output_mode is handout/);
});

test("a deck that plans almost no pictures is reported", () => {
  // Ten slides that could each carry a picture, and none does. This is the
  // shape a generator produces when left to write rather than to design.
  const prose = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: index % 2 ? "worked_example" : "synthesis" }));
  assert.match(messages(critiqueDeck(deck(prose))), /carried by prose/);
});

test("a code-heavy deck is not called prose-heavy for being code-heavy", () => {
  // A code block, a derivation and a comparison matrix are objects, not prose.
  const technical = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: index % 2 ? "algorithm" : "structured_comparison" }));
  const found = messages(critiqueDeck(deck(technical)));
  assert.doesNotMatch(found, /carried by prose/);
  // But nothing is drawn either, and that is worth saying on its own.
  assert.match(found, /no slide in this deck plans a drawn figure/);
});

test("planning pictures across the deck passes both checks", () => {
  const drawn = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: "worked_example", required_visual: "the split" }));
  const found = messages(critiqueDeck(deck(drawn)));
  assert.doesNotMatch(found, /carried by prose/);
  assert.doesNotMatch(found, /plans a drawn figure/);
});
test("a seminar on a primary source is not asked to draw one", () => {
  // Text-by-nature archetypes are out of the denominator, or a reading-led
  // session would fail for being a reading-led session.
  const seminar = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: index % 2 ? "primary_source" : "question", text_roles: ["question"] }));
  assert.doesNotMatch(messages(critiqueDeck(deck(seminar))), /could carry a picture plan one/);
});

test("a roadmap with nothing drawn is reported — the map is the slide", () => {
  // "Last time / today / builds on" as three bullets is the commonest un-drawn
  // slide in a teaching deck, and until `roadmap` became a dominant-visual
  // archetype nothing said so.
  const problems = checkSlideGrammar(slide({ number: 2, archetype: "roadmap" }));
  assert.match(messages(problems), /'roadmap' slide is carried by its picture/);
  assert.doesNotMatch(
    messages(checkSlideGrammar(slide({ number: 2, archetype: "roadmap", required_visual: "the course arc" }))),
    /carried by its picture/,
  );
});

test("an un-drawn roadmap still counts against the prose share", () => {
  // A dominant-visual archetype is normally read as an object in its own right.
  // A roadmap is the exception: it is what a deck looks like when the map was
  // never drawn, so counting it as carried would hide it from the one measure
  // that looks for un-drawn slides.
  const prose = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: index % 2 ? "roadmap" : "worked_example" }));
  assert.match(messages(critiqueDeck(deck(prose))), /carried by prose/);
});

test("an opening that orients the room without drawing anything is reported", () => {
  const problems = critiqueDeck(deck([
    slide({ number: 1, intent: "orient", archetype: "section_opener" }),
    slide({ number: 2, intent: "orient", archetype: "roadmap" }),
    slide({ number: 3, intent: "introduce_concept", archetype: "definition" }),
  ]));
  assert.match(messages(problems), /slides 1–2 orient the room and none of them draws anything/);
});

test("an opening that draws its map says nothing", () => {
  const problems = critiqueDeck(deck([
    slide({ number: 1, intent: "orient", archetype: "section_opener" }),
    slide({ number: 2, intent: "orient", archetype: "roadmap", required_visual: "the course arc" }),
    slide({ number: 3, intent: "introduce_concept", archetype: "definition" }),
  ]));
  assert.doesNotMatch(messages(problems), /orient the room/);
});

test("a session that opens straight into the problem has no orientation run to check", () => {
  // A seminar opens on the claim, not on a map. One orienting slide is not a run.
  const problems = critiqueDeck(deck([
    slide({ number: 1, intent: "create_need", archetype: "section_opener" }),
    slide({ number: 2, intent: "provide_evidence", archetype: "primary_source" }),
  ]));
  assert.doesNotMatch(messages(problems), /orient the room/);
});

test("a deck whose first picture arrives late is reported", () => {
  const late = Array.from({ length: 10 }, (_, index) =>
    slide({
      number: index + 1,
      archetype: "worked_example",
      ...(index >= 5 ? { required_visual: "the split" } : {}),
    }));
  assert.match(messages(critiqueDeck(deck(late))), /reads 5 slides before it is given anything to look at/);
});

test("a deck that draws nothing at all is told once, not twice", () => {
  // The late-first-picture check is silent when there is no first picture: that
  // deck already has its own warning, and saying it twice teaches the professor
  // to skim past both.
  const none = Array.from({ length: 10 }, (_, index) =>
    slide({ number: index + 1, archetype: "worked_example" }));
  const found = messages(critiqueDeck(deck(none)));
  assert.match(found, /no slide in this deck plans a drawn figure/);
  assert.doesNotMatch(found, /before it is given anything to look at/);
});
