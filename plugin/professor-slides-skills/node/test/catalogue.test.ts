/**
 * The catalogues that replace reading the references.
 *
 * These exist to make selection cheap, and the way a compact catalogue fails is
 * by drifting from the thing it summarises. A grammar shipping a beat chain that
 * names a beat nobody wrote sends a planner to read a file that is not there and
 * then to invent one; an archetype table missing an archetype means a slide gets
 * planned as something the checks will refuse. So the tests here are mostly
 * consistency between the compact form and the full one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCHETYPES, DECK_ARCHETYPES, PHASES } from "../src/archetypes.ts";
import {
  COURSE_INTRO_SECTIONS,
  GRAMMARS,
  LADDERS,
  describeGrammar,
  describeGrammars,
  grammarFor,
  ladderFor,
} from "../src/grammars.ts";
import {
  describeBeat,
  describeCatalogue,
  families,
  findBeat,
  loadBeats,
  missingFromLibrary,
  selectBeats,
} from "../src/beats.ts";
import { describeArchetypes, describeRules, RULE_GROUPS, WRITING_NOTES } from "../src/rules.ts";

test("every deck archetype has a grammar, and every grammar a deck archetype", () => {
  for (const name of DECK_ARCHETYPES) {
    assert.ok(GRAMMARS[name], `${name} has no grammar`);
  }
  for (const name of Object.keys(GRAMMARS)) {
    assert.ok(
      (DECK_ARCHETYPES as readonly string[]).includes(name),
      `${name} is a grammar for a deck archetype that does not exist`,
    );
  }
});

test("every grammar weights all six phases, in the canonical order", () => {
  for (const [name, grammar] of Object.entries(GRAMMARS)) {
    assert.deepEqual(
      grammar.phases.map((entry) => entry.phase),
      [...PHASES],
      `${name} does not weight the six phases in order`,
    );
  }
});

test("every beat a grammar's default chain names exists in the library", () => {
  const beats = loadBeats();
  assert.ok(beats.length >= 20, `only ${beats.length} beats found — is beats/ reachable?`);
  for (const [name, grammar] of Object.entries(GRAMMARS)) {
    const missing = missingFromLibrary(grammar.chain, beats);
    assert.deepEqual(missing, [], `${name} names beats that do not exist: ${missing.join(", ")}`);
    assert.ok(grammar.chain.length >= 3, `${name}'s chain is too short to be a session`);
  }
});

test("a chain that names a missing beat is caught, which is the point of the check", () => {
  assert.deepEqual(missingFromLibrary(["problem-before-solution", "no-such-beat"]), ["no-such-beat"]);
});

test("the beat catalogue is one line per beat and enough to choose from", () => {
  const beats = loadBeats();
  const text = describeCatalogue(beats);
  for (const beat of beats) {
    assert.ok(text.includes(beat.beat), `${beat.beat} is not in the catalogue`);
    assert.ok(beat.family, `${beat.beat} has no family, so it cannot be selected by phase`);
    assert.ok(beat.purpose, `${beat.beat} has no purpose, so the catalogue line says nothing`);
  }
  // Compact means compact: one line each plus family headings, not the files.
  assert.ok(
    text.split("\n").length < beats.length * 2 + 20,
    "the catalogue has stopped being a catalogue",
  );
});

test("beats can be selected by family or by phase, and the phases cover the library", () => {
  const beats = loadBeats();
  assert.ok(selectBeats({ family: "create_need" }, beats).length >= 3);
  assert.equal(selectBeats({ family: "no-such-family" }, beats).length, 0);

  // Phases and families are two vocabularies over one library. A phase that maps
  // to nothing is a planner told to choose from an empty list.
  const covered = new Set<string>();
  for (const phase of PHASES) {
    const selected = selectBeats({ phase }, beats);
    assert.ok(selected.length, `no beats for the ${phase} phase`);
    for (const beat of selected) covered.add(beat.beat);
  }
  const uncovered = beats.filter((beat) => !covered.has(beat.beat)).map((beat) => beat.beat);
  assert.deepEqual(uncovered, [], `beats reachable by no phase: ${uncovered.join(", ")}`);
  assert.ok(families(beats).length >= 8);
});

test("one beat prints its sequence, which is what becomes slides", () => {
  const beat = findBeat("predict-reveal-explain");
  assert.ok(beat, "the highest-value beat in the library is missing");
  const text = describeBeat(beat!);
  assert.match(text, /sequence/);
  assert.match(text, /check_understanding/);
  assert.match(text, /exit:/);
  // Its `visual_rules` carry the one rule that is an error rather than a warning.
  assert.match(text, /answer_on_question_slide/);
  assert.equal(findBeat("no-such-beat"), null);
});

test("the archetype table covers all eighteen and says what to write for most", () => {
  const text = describeArchetypes();
  for (const name of Object.keys(ARCHETYPES)) {
    assert.ok(text.includes(name), `${name} is missing from the table`);
  }
  // Every writing note is about a real archetype.
  for (const name of Object.keys(WRITING_NOTES)) {
    assert.ok(ARCHETYPES[name as keyof typeof ARCHETYPES], `a writing note for unknown '${name}'`);
  }
  // And the archetypes most often got wrong have one.
  for (const name of ["question", "activity", "roadmap", "single_visual", "data_evidence"]) {
    assert.ok(WRITING_NOTES[name as keyof typeof WRITING_NOTES], `no writing note for ${name}`);
  }

  const one = describeArchetypes("question");
  assert.match(one, /must not carry: explanation, takeaway/);
  assert.match(describeArchetypes("nonsense"), /is not one of the eighteen/);
});

test("the rule card is grouped, cites its reference, and carries the rules that matter", () => {
  for (const group of RULE_GROUPS) {
    assert.ok(group.rules.length, `${group.key} has no rules`);
    assert.ok(group.reference, `${group.key} does not say where its reasoning lives`);
  }
  const all = describeRules();
  // A sample of the rules the plugin must not lose while getting shorter.
  for (const fragment of [
    "A headline asserts",
    "Sentence case",
    "Drawing is the default",
    "Reuse the visual anchor",
    "No answer, no explanation",
    "Alt text on every figure",
    "generated_by",
  ]) {
    assert.ok(all.includes(fragment), `the rule card lost: ${fragment}`);
  }
  assert.match(describeRules(["writing"]), /A headline asserts/);
  assert.ok(!describeRules(["writing"]).includes("Alt text on every figure"));
  assert.match(describeRules(["nope"]), /no such rule group/);
});

test("the discipline ladders match what professors actually type", () => {
  assert.equal(ladderFor("computer science")?.key, "cs");
  assert.equal(ladderFor("Computer Science")?.key, "cs");
  assert.equal(ladderFor("machine learning")?.key, "cs");
  assert.equal(ladderFor("maths")?.key, "mathematics");
  assert.equal(ladderFor("History")?.key, "history");
  assert.equal(ladderFor("second-year business studies")?.key, "business");
  assert.equal(ladderFor("basket weaving"), null);
  assert.equal(ladderFor(""), null);
  for (const [name, ladder] of Object.entries(LADDERS)) {
    assert.ok(ladder.length >= 5, `the ${name} ladder has too few rungs to be one`);
  }
});

test("the grammar report is short and says what to do next", () => {
  const all = describeGrammars();
  for (const name of DECK_ARCHETYPES) assert.ok(all.includes(name));
  assert.ok(all.split("\n").length < 30, "the whole catalogue should fit on a screen");

  const one = describeGrammar(grammarFor("technical_lecture")!, "computer science");
  assert.match(one, /problem-before-solution/);
  assert.match(one, /pseudocode/, "the discipline's ladder should be in there");
  assert.match(one, /pres beats/);

  // A course introduction is not a lecture, and its own sequence has to appear.
  const intro = describeGrammar(grammarFor("course_intro")!);
  for (const section of COURSE_INTRO_SECTIONS) assert.ok(intro.includes(section));
});
