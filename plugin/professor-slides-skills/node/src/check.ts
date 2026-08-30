/**
 * What must be true before a deck is rendered.
 *
 * These run without pptxgenjs, without sharp and without LibreOffice, so a
 * professor can check a deck on a machine that cannot build one — and so the
 * build skill can check its own work before handing over. `pres render` runs
 * the same function; there is one definition of "this deck is renderable" and
 * both paths use it.
 *
 * Every check here is a mistake that was made before it existed. That is the
 * only reason a check is here rather than left to judgement.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkContract, parseBlocks, splitSlides, type Block } from "./deck.ts";
import { checkDensity } from "./density.ts";
import {
  creditForFigure,
  isApproved,
  loadPlan,
  outlineBehind,
  planPathFor,
  type DeckPlan,
  type Outline,
  type Problem,
} from "./plan.ts";

export interface DeckCheck {
  deck: string;
  planPath: string;
  plan: DeckPlan;
  outline: Outline | null;
  slides: Block[][];
  problems: Problem[];
}

const error = (message: string): Problem => ({ severity: "error", message });
const warning = (message: string): Problem => ({ severity: "warning", message });

/**
 * Read a deck and everything that governs it, and say what is wrong.
 *
 * Missing files throw; anything else is a `Problem`, because a caller that
 * wants to print all of them should not be stopped by the first.
 */
export function checkDeck(deckPath: string): DeckCheck {
  if (!existsSync(deckPath)) throw new Error(`${deckPath} does not exist`);
  const planPath = planPathFor(deckPath);
  if (!existsSync(planPath)) {
    throw new Error(
      `${deckPath} has no ${planPath} beside it.\n` +
      "The plan is the render contract: without it nothing checks the deck's structure, the\n" +
      "slides carry no speaker notes, and no figure's licence is enforced. Build the deck with\n" +
      "/build-presentation, which writes both.",
    );
  }

  const plan = loadPlan(planPath);
  const outline = outlineBehind(planPath, plan);
  const slides = splitSlides(readFileSync(deckPath, "utf8")).map(parseBlocks);
  const problems: Problem[] = [];

  if (!slides.length) problems.push(error(`${deckPath} has no slides`));

  // --- the approval gate ---------------------------------------------------
  // In the parent this was "the document must not still be in work/". Here the
  // outline's own status is the only record of a professor's decision, so it is
  // the gate. A deck rendered from an unapproved outline looks exactly like a
  // finished one once it is open in PowerPoint.
  if (outline) {
    if (!isApproved(outline)) {
      problems.push(error(
        `the outline behind this deck is '${outline.status ?? "draft"}', not approved.\n` +
        "  Nobody has agreed to what is in it. Approval is the professor's to give — they set\n" +
        "  status: approved in the outline, or say so explicitly.",
      ));
    }
  } else {
    problems.push(warning(
      `no outline found beside ${planPath}, so nothing records that this deck was agreed to`,
    ));
  }

  // --- the plan is the contract -------------------------------------------
  // No tolerance and no repair. A plan that no longer matches its deck means
  // one of the two was edited after the other, and which one is wrong is the
  // professor's question.
  for (const mismatch of checkContract(slides, plan)) problems.push(error(mismatch));

  // --- mathematics that did not convert ------------------------------------
  // A formula is read as authoritative and nobody proofreads the projector, so
  // a half-converted one is worse than none at all. This is an error rather
  // than a warning for that reason: the deck does not build until the professor
  // either simplifies the expression or draws it as a figure.
  for (const [index, blocks] of slides.entries()) {
    for (const block of blocks) {
      if (block.kind !== "math" || !block.unconverted.length) continue;
      problems.push(error(
        `slide ${index + 1}: ${block.unconverted.join(", ")} has no text equivalent, so the formula ` +
        `would go up mangled.\n  Source: ${block.source}\n  Either write it in a form Unicode can ` +
        "set, or draw it as a figure and link it like any other picture.",
      ));
    }
  }

  // --- emphasis that will not survive the render ---------------------------
  // PowerPoint can hold a bold word inside a bulleted line; pptxgenjs cannot
  // write one without losing the bullet (see the list case in `render.ts`), so
  // the renderer drops the emphasis and keeps the bullet. Naming it here is the
  // difference between a decision and a surprise.
  for (const [index, blocks] of slides.entries()) {
    for (const block of blocks) {
      if (block.kind !== "list") continue;
      const emphasised = block.items.filter((item) => /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/.test(item));
      if (emphasised.length) {
        problems.push(warning(
          `slide ${index + 1}: ${emphasised.length} list item(s) use bold, italic or code, which renders ` +
          "as plain text — a bulleted line cannot carry both a bullet and mixed formatting. Move the " +
          "emphasis into a paragraph, or accept the plain rendering.",
        ));
      }
    }
  }

  // --- the archetype the slide was planned as -----------------------------
  // The plan declares a density band and a set of text roles for every slide,
  // and until this ran nothing compared either against the markdown. A slide
  // could be planned sparse and ship five paragraphs, and the deck built clean.
  problems.push(...checkDensity(slides, plan));

  // --- figures -------------------------------------------------------------
  const materialsDir = dirname(deckPath);
  const figures = plan.figures ?? {};
  const used = new Set<string>();

  for (const [index, blocks] of slides.entries()) {
    for (const block of blocks) {
      if (block.kind !== "image") continue;
      used.add(block.src);
      if (!existsSync(join(materialsDir, block.src))) {
        problems.push(error(`slide ${index + 1}: ${block.src} is linked but not beside the deck`));
      }
      if (block.src.includes("/") || block.src.includes("\\")) {
        problems.push(error(
          `slide ${index + 1}: ${block.src} is not a sibling path. Figures live flat beside the deck; ` +
          "a subdirectory link breaks silently in a deck nobody opens until the lecture.",
        ));
      }
      if (!block.alt.trim()) {
        problems.push(error(
          `slide ${index + 1}: ${block.src} has no alt text. Slides are read by people who cannot see them.`,
        ));
      }
      try {
        creditForFigure(figures[block.src], block.src);
      } catch (failure) {
        problems.push(error(String((failure as Error).message ?? failure)));
      }
    }
  }

  for (const name of Object.keys(figures)) {
    if (!used.has(name)) {
      problems.push(warning(`the plan records figure ${name}, but no slide links it`));
    }
  }

  // --- visuals the outline asked for and the deck does not have ------------
  for (const slide of plan.slides ?? []) {
    if (!slide.required_visual) continue;
    const blocks = slides[slide.number - 1] ?? [];
    if (!blocks.some((block) => block.kind === "image")) {
      problems.push(warning(
        `slide ${slide.number} was planned with a visual ("${slide.required_visual}") and has none. ` +
        "Either draw it, record the prompt that would produce it, or take the requirement off the plan.",
      ));
    }
  }

  return { deck: deckPath, planPath, plan, outline, slides, problems };
}

export const errorsIn = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.severity === "error");

/** Checks as a report, most serious first. */
export function describeProblems(problems: Problem[]): string {
  if (!problems.length) return "No problems found.";
  const order = { error: 0, warning: 1 } as const;
  return [...problems]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((problem) => `  ${problem.severity === "error" ? "error  " : "warning"}  ${problem.message}`)
    .join("\n");
}
