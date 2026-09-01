/**
 * Choosing the harness.
 *
 * The router is the one new decision in this plugin that is made on every
 * request, so it is the one that must not be surprising. These are the cases
 * that decide whether a professor trusts it: the small request that should not
 * trigger an instructional-design workflow, the request with a concrete reason
 * that should, the explicit override that must win over both, and the request
 * that pulls in two directions and should land in the middle rather than have
 * one side silently picked for it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideMode,
  explicitModeIn,
  minutesIn,
  recipeFor,
  slidesIn,
  MODES,
} from "../src/route.ts";

test("a small, straightforward request routes to fast", () => {
  for (const request of [
    "Make 5 slides explaining RAG.",
    "Create a few slides comparing agents and workflows.",
    "Turn these notes into slides.",
    "Just throw together something on prompt caching.",
    "quick deck on vector databases",
  ]) {
    const routed = decideMode({ request });
    assert.equal(routed.mode, "fast", `${request} -> ${routed.mode} (${routed.why})`);
    assert.ok(routed.signals.length, "a routing decision always says what fired it");
  }
});

test("an ordinary lecture request routes to standard, which is the default", () => {
  for (const request of [
    "Outline next week's lecture on model evaluation for CSS-4008.",
    "Prepare slides for MODULE-06.",
    "I need a deck on gradient descent for second-year students.",
    "",
  ]) {
    const routed = decideMode({ request });
    assert.equal(routed.mode, "standard", `${request} -> ${routed.mode} (${routed.why})`);
  }
});

test("a concrete reason routes to deep, and the reason is named", () => {
  const cases: Array<[string, string]> = [
    ["Research how Stanford teaches attention and build the lecture.", "external research asked for"],
    ["This is a new course; design the first lecture from scratch.", "a new lecture or course"],
    ["The deck goes in our accreditation self-study.", "accreditation or audit"],
    ["Make it reusable by other instructors in the department.", "reusable by other instructors"],
    ["Show me the outline first so I can approve it before you build slides.", "approval before building asked for"],
    ["I want proper instructional design on this one.", "deep instructional design asked for"],
    ["Students reliably get this wrong and I am not sure what order to teach it in.", "sequencing is uncertain"],
  ];
  for (const [request, expected] of cases) {
    const routed = decideMode({ request });
    assert.equal(routed.mode, "deep", `${request} -> ${routed.mode}`);
    assert.ok(
      routed.signals.includes(expected),
      `${request}: expected signal '${expected}', got ${routed.signals.join("; ")}`,
    );
  }
});

test("a long deck or a long session is a reason for deep on its own", () => {
  assert.equal(decideMode({ request: "I need about 24 slides on transformers." }).mode, "deep");
  assert.equal(decideMode({ request: "a deck for a 180 minute workshop" }).mode, "deep");
  assert.equal(decideMode({ slides: 30 }).mode, "deep");
  // And the boundaries are where they are documented to be.
  assert.equal(decideMode({ slides: 19 }).mode, "standard");
  assert.equal(decideMode({ slides: 20 }).mode, "deep");
  assert.equal(decideMode({ slides: 9 }).mode, "standard");
  assert.equal(decideMode({ slides: 8 }).mode, "fast");
});

test("an explicit mode wins over every signal, from the flag or from the sentence", () => {
  for (const mode of MODES) {
    const routed = decideMode({
      request: "Research this thoroughly for our accreditation review, 40 slides.",
      mode,
    });
    assert.equal(routed.mode, mode);
    assert.equal(routed.explicit, true);
  }

  const asked = decideMode({ request: "make 5 slides on RAG, use deep" });
  assert.equal(asked.mode, "deep");
  assert.equal(asked.explicit, true);

  assert.equal(decideMode({ request: "fast" }).mode, "fast");
  assert.equal(decideMode({ request: "--standard" }).mode, "standard");
  assert.equal(decideMode({ request: "mode: deep" }).mode, "deep");

  assert.throws(() => decideMode({ mode: "quick" }), /not a mode/);
});

test("a mode word inside the content is not a mode request", () => {
  // The failure this prevents: routing a lecture about the FFT to FAST because
  // the word "fast" is in the topic.
  assert.equal(explicitModeIn("a lecture on the fast Fourier transform"), null);
  assert.equal(explicitModeIn("a deep dive into attention"), null);
  assert.equal(explicitModeIn("standard deviation and variance"), null);
  assert.equal(
    decideMode({ request: "Prepare a lecture on the fast Fourier transform." }).mode,
    "standard",
  );
});

test("a request pulling both ways lands in the middle, and says both fired", () => {
  const routed = decideMode({ request: "Make me a quick 5-slide deck, but with sources." });
  assert.equal(routed.mode, "standard");
  assert.equal(routed.explicit, false);
  assert.ok(routed.signals.some((line) => line.startsWith("deep:")));
  assert.ok(routed.signals.some((line) => line.startsWith("fast:")));
});

test("slide counts and durations are read out of the sentence", () => {
  assert.equal(slidesIn("make 5 slides on RAG"), 5);
  assert.equal(slidesIn("about twelve slides please"), 12);
  assert.equal(slidesIn("a 30-slide deck"), 30);
  assert.equal(slidesIn("a deck on slide design"), null);

  assert.equal(minutesIn("a 90 minute lecture"), 90);
  assert.equal(minutesIn("a two-hour seminar"), 120);
  assert.equal(minutesIn("a 50-min session"), 50);
  assert.equal(minutesIn("no duration here"), null);
});

test("each mode's recipe says what it does and what it skips", () => {
  const fast = recipeFor("fast");
  assert.equal(fast.source, "local");
  assert.equal(fast.research, "no");
  assert.equal(fast.outline, "none");
  assert.equal(fast.approval, "none");
  // The point of `skips` is that a mode doing less is a choice rather than a
  // bug, and a choice has to be printable.
  assert.ok(fast.skips.length >= 4);
  assert.ok(fast.steps.length <= 5, "fast is a short path or it is not fast");

  const standard = recipeFor("standard");
  assert.equal(standard.source, "auto");
  assert.equal(standard.approval, "on-request");
  assert.equal(standard.outline, "compact");
  assert.equal(standard.beats, "catalogue");
  // STANDARD must not be told to read the long references.
  assert.ok(
    !standard.load.some((entry) => /references\//.test(entry)),
    `standard should not load reference documents: ${standard.load.join(", ")}`,
  );

  const deep = recipeFor("deep");
  assert.equal(deep.approval, "required");
  assert.equal(deep.research, "yes");
  assert.equal(deep.beats, "library");
  assert.deepEqual(deep.skips, [], "deep skips nothing; that is what it is for");
  assert.ok(deep.load.some((entry) => /teaching-beats/.test(entry)));
});
