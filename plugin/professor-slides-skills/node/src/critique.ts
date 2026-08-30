/**
 * The whole-deck critique, and the per-slide grammar checks under it.
 *
 * `checkOutline` asks whether an outline is *internally sound and honest about
 * its module*. This asks a different question: whether the sequence teaches.
 *
 * That question cannot be answered slide by slide, which is exactly why a
 * generator gets it wrong. Every slide in "title and three bullets, fifteen
 * times" passes a per-slide check. What fails is the deck: nothing ever creates
 * the need for the diagram, nothing resets the learner's position before the
 * next idea, and the cognitive operation never changes even though the material
 * does.
 *
 * Everything here is a warning, deliberately. These are strong defaults about
 * teaching, not facts about the course, and a professor with a reason to run
 * six dense slides in a row should not be stopped by a program. The two
 * exceptions are errors and both are about a slide contradicting its own
 * purpose: an answer printed on a question slide, and an unknown archetype.
 */

import {
  ARCHETYPES,
  OBJECT_CARRIED,
  RESET_ARCHETYPES,
  TEXT_CARRIED,
  isArchetype,
  isDensity,
  isIntent,
  isTextRole,
  type ArchetypeName,
} from "./archetypes.ts";
import type { Outline, OutlineSlide, Problem } from "./plan.ts";

const error = (message: string): Problem => ({ severity: "error", message });
const warning = (message: string): Problem => ({ severity: "warning", message });

/** How many identical archetypes in a row before the deck has stopped teaching. */
const SAME_ARCHETYPE_RUN = 3;
/** How many text-carried slides in a row before the room has nothing to look at. */
const TEXT_ONLY_RUN = 3;
/** How many slides of new material before the learner needs their position back. */
const SLIDES_BEFORE_RESET = 9;

/**
 * The grammar of one slide: is its archetype real, and does its text do what
 * that archetype is for?
 */
export function checkSlideGrammar(slide: OutlineSlide): Problem[] {
  const problems: Problem[] = [];
  const where = `slide ${slide.number}`;

  if (slide.archetype !== undefined && !isArchetype(slide.archetype)) {
    problems.push(error(
      `${where}: '${slide.archetype}' is not a slide archetype. ` +
      `The eighteen are: ${Object.keys(ARCHETYPES).join(", ")}.`,
    ));
    return problems;
  }
  if (slide.intent !== undefined && !isIntent(slide.intent)) {
    problems.push(warning(`${where}: '${slide.intent}' is not a known slide intent`));
  }
  if (slide.density !== undefined && !isDensity(slide.density)) {
    problems.push(warning(`${where}: '${slide.density}' is not a density mode (sparse, moderate, dense)`));
  }
  for (const role of slide.text_roles ?? []) {
    if (!isTextRole(role)) problems.push(warning(`${where}: '${role}' is not a text role`));
  }

  if (!slide.archetype) return problems;
  const archetype = ARCHETYPES[slide.archetype as ArchetypeName]!;

  for (const role of slide.text_roles ?? []) {
    if (!isTextRole(role)) continue;
    if (archetype.forbids?.includes(role)) {
      // The one place this is an error: a question slide that answers itself.
      // The missing answer and the whitespace are the teaching, and filling
      // either is a generator's first instinct.
      problems.push(error(
        `${where}: a '${slide.archetype}' slide must not carry ${role} text — ` +
        `${archetype.composition}. Putting the answer or the explanation here removes the ` +
        "reason the slide exists.",
      ));
      continue;
    }
    if (!archetype.roles.includes(role)) {
      problems.push(warning(
        `${where}: ${role} text on a '${slide.archetype}' slide, which is for ` +
        `${archetype.roles.join(", ")}. ${archetype.composition}.`,
      ));
    }
  }

  if (archetype.visual === "dominant" && !slide.required_visual && !slide.visual_anchor) {
    problems.push(warning(
      `${where}: a '${slide.archetype}' slide is carried by its picture, and neither ` +
      "required_visual nor visual_anchor says what that picture is",
    ));
  }
  if (slide.focus && !slide.visual_anchor) {
    problems.push(warning(`${where}: focus names part of a visual_anchor, but no anchor is set`));
  }
  return problems;
}

/** Whether the beats cover the slides once each, in order. */
function checkBeats(outline: Outline): Problem[] {
  const problems: Problem[] = [];
  const beats = outline.beats ?? [];
  if (!beats.length) {
    if (outline.slides.length > 6) {
      problems.push(warning(
        "the outline has no beats. A session planned as a flat list of slides tends to " +
        "produce slides that are individually reasonable and collectively inert — see " +
        "references/teaching-beats.md",
      ));
    }
    return problems;
  }

  const seen = new Map<number, number>();
  beats.forEach((beat, index) => {
    const name = beat.beat ?? beat.goal ?? `beat ${index + 1}`;
    if (!beat.slides?.length) {
      problems.push(warning(`${name} covers no slides`));
      return;
    }
    for (const number of beat.slides) {
      const owner = seen.get(number);
      if (owner !== undefined) {
        problems.push(warning(`slide ${number} is claimed by two beats (${owner + 1} and ${index + 1})`));
      }
      seen.set(number, index);
      if (!outline.slides.some((slide) => slide.number === number)) {
        problems.push(warning(`${name} lists slide ${number}, which the outline does not have`));
      }
    }
    if (!beat.exit_understanding) {
      problems.push(warning(
        `${name} does not say what is true for the learner when it ends, which is the ` +
        "only way to tell whether its slides are the right ones",
      ));
    }
    // Every beat but the last hands over to the next one. A deck whose beats do
    // not connect is a set of mini-lectures with one title page.
    if (index < beats.length - 1 && !beat.transition_question) {
      problems.push(warning(`${name} has no transition_question, so nothing sets up the beat after it`));
    }
  });

  for (const slide of outline.slides) {
    if (!seen.has(slide.number)) {
      problems.push(warning(`slide ${slide.number} belongs to no beat`));
    }
  }
  return problems;
}

/**
 * The deck read as a sequence: rhythm, resets, and pictures that arrive before
 * anything has made the room want one.
 */
export function critiqueDeck(outline: Outline): Problem[] {
  const problems: Problem[] = [...checkBeats(outline)];
  const slides = [...outline.slides].sort((a, b) => a.number - b.number);

  for (const slide of slides) problems.push(...checkSlideGrammar(slide));

  // Same shape, over and over. Not a variety rule — a signal that the
  // pedagogical job stopped changing while the material kept going.
  let run = 1;
  for (let index = 1; index < slides.length; index += 1) {
    const previous = slides[index - 1]!.archetype;
    const current = slides[index]!.archetype;
    if (current && current === previous) {
      run += 1;
      if (run === SAME_ARCHETYPE_RUN) {
        problems.push(warning(
          `slides ${slides[index - run + 1]!.number}–${slides[index]!.number} are all ` +
          `'${current}'. Repeating a shape is right while the learner's task is the same and ` +
          "wrong once it changes — check that it has not changed here.",
        ));
      }
    } else {
      run = 1;
    }
  }

  // Nothing to look at for a stretch. Legitimate in a seminar; usually an
  // oversight in a lecture that has diagrams available.
  let textRun = 0;
  for (const slide of slides) {
    const textOnly = slide.archetype
      ? TEXT_CARRIED.has(slide.archetype) && !slide.required_visual && !slide.visual_anchor
      : false;
    textRun = textOnly ? textRun + 1 : 0;
    if (textRun === TEXT_ONLY_RUN) {
      problems.push(warning(
        `slides up to ${slide.number} carry ${TEXT_ONLY_RUN} text-only slides in a row. ` +
        "Text is a legitimate information carrier; three in succession usually is not.",
      ));
    }
  }

  // A picture that arrives before anything has created the need for it is a
  // picture the room has no question to attach it to.
  const firstNeed = slides.findIndex(
    (slide) => slide.intent === "create_need" || slide.intent === "demonstrate_problem" ||
      slide.archetype === "question" || slide.archetype === "big_idea",
  );
  const firstStructure = slides.findIndex(
    (slide) => slide.archetype === "system_diagram" || slide.archetype === "process",
  );
  if (firstStructure >= 0 && (firstNeed < 0 || firstStructure < firstNeed)) {
    problems.push(warning(
      `slide ${slides[firstStructure]!.number} shows a ${slides[firstStructure]!.archetype} before ` +
      "anything asks the question it answers. A mechanism explained before the problem it solves " +
      "is a mechanism nobody has a reason to follow.",
    ));
  }

  // Long runs of new material with no point at which the learner's conceptual
  // position is restored. This is the "story so far" slide, and it is the one
  // most often left out of a generated deck.
  let sinceReset = 0;
  for (const slide of slides) {
    const isReset = slide.archetype
      ? RESET_ARCHETYPES.has(slide.archetype)
      : slide.intent === "integrate" || slide.intent === "orient";
    if (isReset) {
      sinceReset = 0;
      continue;
    }
    sinceReset += 1;
    if (sinceReset === SLIDES_BEFORE_RESET) {
      problems.push(warning(
        `${SLIDES_BEFORE_RESET} slides of new material up to slide ${slide.number} with no ` +
        "roadmap, synthesis or section break. The learner's position needs restoring before " +
        "another idea is introduced.",
      ));
    }
  }

  // A visual anchor exists so a diagram can be built up rather than replaced.
  // One declared and used once is a diagram that was going to be redrawn.
  const anchors = new Map<string, number>();
  for (const slide of slides) {
    if (slide.visual_anchor) anchors.set(slide.visual_anchor, (anchors.get(slide.visual_anchor) ?? 0) + 1);
  }
  for (const [anchor, count] of anchors) {
    if (count === 1) {
      problems.push(warning(
        `visual_anchor '${anchor}' is used on one slide. An anchor is for keeping a diagram ` +
        "stable while highlighting parts of it; used once it is just a figure.",
      ));
    }
  }

  // How much of the deck the audience is being asked to *read*.
  //
  // Drawing is the default in this plugin, and this is where that is measured.
  // The failure it catches is the deck that was written rather than designed:
  // prose is what a generator is fluent in, so left alone it writes, and the
  // pictures end up being whatever survived rather than what the content
  // deserved. A real lecture deck measured against this carried a drawn figure
  // on 7% of its slides.
  //
  // A slide counts as carried when it plans a picture, or when its archetype is
  // an object in its own right — a code block, a derivation, a comparison
  // matrix. Counting pictures alone would tell a programming lecture it is
  // prose-heavy for being a programming lecture. Text-by-nature archetypes are
  // out of the reckoning entirely, or a seminar on a primary source would fail
  // for being one.
  if (slides.length >= 8) {
    const eligible = slides.filter(
      (slide) => !slide.archetype || !TEXT_CARRIED.has(slide.archetype),
    );
    const drawn = eligible.filter((slide) => slide.required_visual ?? slide.visual_anchor);
    const carried = eligible.filter(
      (slide) =>
        slide.required_visual ||
        slide.visual_anchor ||
        (slide.archetype && OBJECT_CARRIED.has(slide.archetype)),
    );
    const prose = eligible.length - carried.length;

    if (eligible.length >= 6 && prose > eligible.length / 2) {
      problems.push(warning(
        `${prose} of ${eligible.length} slides are carried by prose. Drawing is the default here: ` +
        "ask of each what it would look like drawn, and keep the sentence only where the answer is " +
        "worse. A bulleted list of pipeline stages is a diagram somebody declined to draw — see " +
        "references/visual-grammar.md, 'Draw first, write second'.",
      ));
    }
    // Separately: a deck with no drawn figure at all is almost never right, and
    // is the specific shape an agent produces when nobody asked it to draw.
    if (!drawn.length && eligible.length >= 6) {
      problems.push(warning(
        "no slide in this deck plans a drawn figure. Sequences, interacting parts, comparisons, " +
        "structures and annotated objects should be drawn rather than described; set " +
        "required_visual on the slides where a picture would carry the idea better than a sentence.",
      ));
    }
  }

  // A deck that never asks the room anything.
  if (slides.length >= 6 && !slides.some((slide) =>
    slide.archetype === "question" || slide.archetype === "activity" ||
    slide.intent === "check_understanding" || slide.intent === "diagnose_misconception")) {
    problems.push(warning(
      "no slide asks the students anything. A session with no check has no way of finding out " +
      "whether it worked while there is still time to do something about it.",
    ));
  }

  const mode = outline.presentation?.output_mode;
  if (mode === "handout") {
    const dependent = slides.filter((slide) => slide.delivery_dependency === "high");
    if (dependent.length) {
      problems.push(warning(
        `output_mode is handout, but slide(s) ${dependent.map((s) => s.number).join(", ")} are ` +
        "marked delivery_dependency: high — they are deliberately incomplete without the " +
        "professor talking over them, which a handout does not have.",
      ));
    }
  }
  return problems;
}
