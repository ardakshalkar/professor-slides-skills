/**
 * The draft deck: which visuals it says are missing, and how it calls out to a
 * generator when one is configured.
 *
 * The tokenizer is the part worth testing hardest. It is one line of user
 * configuration standing between a working generator and one that silently
 * produces nothing, and the failure it exists to prevent — a course living at
 * `C:/Users/Ardak Shalkar/Documents/AI Course 2026/…` — is the ordinary case on
 * the machine this was written on, not an edge case.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDraft, missingVisuals, tokenize } from "../src/draft.ts";
import type { Block } from "../src/deck.ts";
import type { DeckPlan } from "../src/plan.ts";

const paragraph = (text: string): Block => ({ kind: "paragraph", text });
const image = (src: string): Block => ({ kind: "image", src, alt: "a picture" });

test("a command splits on spaces like a shell", () => {
  assert.deepEqual(tokenize("gen --prompt {prompt} --out {out}"), [
    "gen", "--prompt", "{prompt}", "--out", "{out}",
  ]);
});

test("a quoted path with spaces stays one argument", () => {
  assert.deepEqual(
    tokenize('node "C:/Users/Ardak Shalkar/AI Course/gen.mjs" --out {out}'),
    ["node", "C:/Users/Ardak Shalkar/AI Course/gen.mjs", "--out", "{out}"],
  );
});

test("single quotes work too, and repeated spaces do not make empty arguments", () => {
  assert.deepEqual(tokenize("gen   'my tool'  --out {out}"), ["gen", "my tool", "--out", "{out}"]);
});

test("an empty quoted argument survives as an empty argument", () => {
  // `--style ""` means "no style", which is not the same as omitting the flag.
  assert.deepEqual(tokenize('gen --style "" --out {out}'), ["gen", "--style", "", "--out", "{out}"]);
});

test("a slide the plan wants a picture for, and has none, is missing one", () => {
  const slides: Block[][] = [[paragraph("Sampling picks a token.")]];
  const plan = {
    slides: [{ number: 1, title: "Sampling", required_visual: "the sampling loop" }],
    figures: { "slide-1": { image_prompt: { prompt: "a clean schematic of a loop" } } },
  } as unknown as DeckPlan;

  assert.deepEqual(missingVisuals(slides, plan), [
    { slide: 1, required: "the sampling loop", prompt: "a clean schematic of a loop" },
  ]);
});

test("a slide that already carries a figure is not missing one", () => {
  // The plan records the intention; the markdown records the fact. When they
  // disagree about whether a picture exists, the markdown is right.
  const slides: Block[][] = [[paragraph("Sampling picks a token."), image("fig-01.svg")]];
  const plan = {
    slides: [{ number: 1, title: "Sampling", required_visual: "the sampling loop" }],
  } as unknown as DeckPlan;

  assert.deepEqual(missingVisuals(slides, plan), []);
});

test("a deck with nothing missing says so rather than saying nothing", () => {
  assert.match(describeDraft([]), /Every planned visual is drawn/);
});

test("the hand-over names each hole and how to fill it", () => {
  const report = describeDraft([{ slide: 4, required: "the broker path", prompt: "two services" }]);
  assert.match(report, /slide 4: the broker path/);
  assert.match(report, /PRES_IMAGE_COMMAND/);
});
