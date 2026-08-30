/**
 * The archetype as a promise, checked against the markdown that kept or broke it.
 *
 * The case at the bottom is the one this was written for, taken verbatim from a
 * real deck: a slide planned `roadmap` — sparse, headline and labels — carrying
 * seventy-eight words of prose about three things that could have been drawn.
 * Everything else about that deck checked clean.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDensity, measureText } from "../src/density.ts";
import type { Block } from "../src/deck.ts";
import type { DeckPlan } from "../src/plan.ts";

const planFor = (number: number, archetype: string): DeckPlan =>
  ({ slides: [{ number, title: "t", archetype }] }) as unknown as DeckPlan;

test("the slide title is not counted as text on the slide", () => {
  // Every slide has a title. Counting it would tax every slide equally, which
  // is the same as not measuring at all.
  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Where Week 2 left you" },
    { kind: "paragraph", text: "Three things." },
  ];
  assert.equal(measureText(blocks).words, 2);
});

test("a sub-heading is text on the slide", () => {
  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Title here" },
    { kind: "heading", level: 3, text: "A sub heading" },
  ];
  assert.equal(measureText(blocks).words, 3);
});

test("code and tables are objects, not prose", () => {
  // A programming lecture is not talkative for containing programs.
  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Title" },
    { kind: "code", text: "for token in tokens:\n    print(token, tokenizer.decode(token))" },
    { kind: "table", rows: [["Model", "Built by"], ["KazLLM", "ISSAI"]] },
  ];
  assert.equal(measureText(blocks).words, 0);
});

test("markdown emphasis is not counted as words", () => {
  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Title" },
    { kind: "paragraph", text: "**Today** is the *rest* of the `request`" },
  ];
  assert.equal(measureText(blocks).words, 7);
});

test("a sparse archetype carrying a moderate amount of text is left alone", () => {
  // The bands are generation defaults, not limits: warning at the exact edge
  // would fire on slides nobody would call overfull.
  const blocks: Block[][] = [[
    { kind: "heading", level: 2, text: "Title" },
    { kind: "paragraph", text: Array.from({ length: 30 }, () => "word").join(" ") },
  ]];
  assert.deepEqual(checkDensity(blocks, planFor(1, "roadmap")), []);
});

test("the title slide is never measured", () => {
  const blocks: Block[][] = [[
    { kind: "heading", level: 1, text: "Prompting and structured output" },
    { kind: "paragraph", text: Array.from({ length: 90 }, () => "word").join(" ") },
  ]];
  assert.deepEqual(checkDensity(blocks, planFor(1, "section_opener")), []);
});

test("a slide planned as a roadmap and written as an essay is named", () => {
  const blocks: Block[][] = [[], [
    { kind: "heading", level: 2, text: "Where Week 2 left you" },
    { kind: "paragraph", text: "You already have three things, and we are not doing them again:" },
    { kind: "list", ordered: false, items: [
      "the prompt is ordinary tokens entering the same stack",
      "a more specific prompt weights the distribution toward what you wanted",
      "a chat is you resending the whole history every turn",
    ] },
    { kind: "paragraph", text: "**Today is the rest of the request** — the examples, the standing instructions, and the shape the answer has to come back in." },
    { kind: "paragraph", text: "**Why it matters now:** from Week 6 onward a *program* reads these answers, not a person. A program cannot shrug at a surprise." },
  ]];

  const problems = checkDensity(blocks, planFor(2, "roadmap"));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.severity, "warning");
  assert.match(problems[0]!.message, /slide 2 is planned 'roadmap'/);
  assert.match(problems[0]!.message, /with nothing drawn/);
  // A roadmap asks for labels, so the remedy is to draw, not merely to cut.
  assert.match(problems[0]!.message, /they do not replace it/);
});

test("an archetype that does want prose is told to cut, not to draw", () => {
  const blocks: Block[][] = [[], [
    { kind: "heading", level: 2, text: "Title" },
    { kind: "paragraph", text: Array.from({ length: 100 }, () => "word").join(" ") },
  ]];
  const problems = checkDensity(blocks, planFor(2, "synthesis"));
  assert.equal(problems.length, 1);
  assert.match(problems[0]!.message, /Cut it, or split it/);
});

test("an archetype the vocabulary does not have is left to the outline check", () => {
  const blocks: Block[][] = [[], [
    { kind: "heading", level: 2, text: "Title" },
    { kind: "paragraph", text: Array.from({ length: 100 }, () => "word").join(" ") },
  ]];
  assert.deepEqual(checkDensity(blocks, planFor(2, "not_an_archetype")), []);
});
