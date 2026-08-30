/**
 * An approved deck to `.pptx`, and from there to PDF.
 *
 * Ported from `ProfessorHarness/node/bin/render-deck.ts`. The layout, the
 * palette and the overflow arithmetic are unchanged; what changed is where the
 * contract comes from. The parent read a `Document` record out of a course
 * repository, which a standalone plugin has no access to, so the contract is a
 * `<deck>.plan.yaml` sitting beside the markdown — see `plan.ts`.
 *
 * The four gates the parent enforced are enforced here, in `check.ts`, and this
 * module will not render a deck that fails them. Each is a mistake this made
 * before the gate existed:
 *
 *   - a deck rendered from an unapproved outline looks finished in PowerPoint;
 *   - a plan that no longer matches its markdown means one of the two was
 *     edited after the other, and nothing here reorders slides to agree;
 *   - a figure whose licence requires attribution and has none infringes
 *     quietly, and the deck builds anyway;
 *   - a slide that runs past the bottom margin is invisible in the source and
 *     obvious on the screen behind the lecturer.
 *
 * `pptxgenjs` and `sharp` are loaded lazily, so reading and checking a course
 * never depends on a native image library.
 */

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDeck, errorsIn, describeProblems } from "./check.ts";
import { CHAR_WIDTH, columnWidths, plain, tableRowHeights, textHeight, unescape, type Block } from "./deck.ts";
import { creditForFigure, type DeckPlan } from "./plan.ts";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

function loadDependency(name: string): any {
  const root = process.env.PRES_NODE_MODULES
    ? resolve(process.env.PRES_NODE_MODULES)
    : resolve(scriptDirectory, "..", "node_modules");
  try {
    return require(join(root, name));
  } catch {
    try {
      return require(name);
    } catch (error) {
      throw new Error(
        `Cannot load ${name}. Run \`npm install pptxgenjs sharp\` in the plugin's node/ directory, ` +
        `or set PRES_NODE_MODULES to a directory containing it.\n${String(error)}`,
      );
    }
  }
}

// --- the house palette ------------------------------------------------------
// One restrained set rather than a per-deck choice: these decks are the same
// course seen week after week, and a palette that changes with the topic reads
// as a different course.
const INK = "1F2933";
const MUTED = "52616B";
const PRIMARY = "4A5F7A";
const LIGHT = "DBE4F0";
const PAPER = "FFFFFF";
const RULE = "C6CED6";
const CODE_BG = "F2F4F7";
const CODE_LINE = "E2E7ED";

// --- the typefaces ----------------------------------------------------------
// Chosen for what is *present on the lecture-room machine*, not for what looks
// best in an editor. A deck that substitutes a missing font reflows, and it
// reflows on the projector rather than on the laptop it was built on.
//
//   Cambria    ships with Windows and with Office for Mac. A serif title
//              against a sans body separates the two without a second colour.
//   Calibri    still installed everywhere. Aptos replaced it as the Office
//              default in 2024 but substitutes on older installs, which is the
//              one thing a lecture deck cannot afford.
//   Consolas   ships with Windows and with Office for Mac. Replaces Courier
//              New, which is genuinely bad on a projector: a low x-height and
//              thin strokes at the back of a room, and a 0.6em advance that
//              wastes a fifth of every code line.
//
// `references/typography.md` has the reasoning and the alternatives.
const HEAD_FONT = "Cambria";
const BODY_FONT = "Calibri";
const MONO_FONT = "Consolas";

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MARGIN = 0.7;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const FLOOR = SLIDE_H - 0.5; // the 0.5" bottom margin, enforced rather than hoped for

/**
 * `**bold**`, `*italic*` and `` `code` `` into pptxgenjs runs.
 *
 * Bold is matched before italic, or `**x**` would be read as an empty italic
 * followed by a stray one. Italics were missing from the renderer this was
 * ported from, and the failure was silent in exactly the wrong way: the deck
 * built, and the asterisks were on the screen behind the lecturer.
 */
function runs(text: string, base: Record<string, unknown>): unknown[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**")) return { text: unescape(part.slice(2, -2)), options: { ...base, bold: true } };
      if (part.startsWith("*")) return { text: unescape(part.slice(1, -1)), options: { ...base, italic: true } };
      if (part.startsWith("`")) return { text: part.slice(1, -1), options: { ...base, fontFace: MONO_FONT } };
      return { text: unescape(part), options: { ...base } };
    });
}

/**
 * A block in a few words, for a warning a person has to act on.
 */
function describeBlock(block: Block): string {
  const snip = (text: string): string => {
    const flat = plain(text).replace(/\s+/g, " ").trim();
    return flat.length > 54 ? `${flat.slice(0, 54)}…` : flat;
  };
  switch (block.kind) {
    case "heading": return `the heading "${snip(block.text)}"`;
    case "paragraph": return `the paragraph "${snip(block.text)}"`;
    case "quote": return `the quotation "${snip(block.text)}"`;
    case "math": return `the formula "${snip(block.text)}"`;
    case "code": return `the code block starting "${snip(block.text.split(/\r?\n/)[0] ?? "")}"`;
    case "list": return `the list ending "${snip(block.items[block.items.length - 1] ?? "")}"`;
    case "table": return `the ${block.rows.length}-row table`;
    case "image": return `the figure ${block.src}`;
  }
}

interface RenderContext {
  materialsDir: string;
  outDir: string;
  name: string;
  title: string;
  plan: DeckPlan;
}

async function build(slides: Block[][], context: RenderContext): Promise<{ file: string; warnings: string[] }> {
  const pptxgen = loadDependency("pptxgenjs");
  const sharp = loadDependency("sharp");
  const warnings: string[] = [];
  const figures = context.plan.figures ?? {};

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // before any slide is added, or coordinates lie
  pres.author = "build-presentation-skill";
  pres.title = context.title;

  const noteFor = (index: number): string | null => {
    const spec = context.plan.slides?.find((slide) => slide.number === index + 1);
    if (!spec) return null;
    const minutes = spec.minutes ? `${spec.minutes} min` : null;
    return [minutes, spec.purpose].filter(Boolean).join(" — ") || null;
  };

  /** The archetype the plan gave this slide, if any. */
  const archetypeOf = (index: number): string | undefined =>
    context.plan.slides?.find((slide) => slide.number === index + 1)?.archetype;

  for (const [index, blocks] of slides.entries()) {
    const heading = blocks.find((block) => block.kind === "heading");
    const isTitleSlide = index === 0 && heading?.kind === "heading" && heading.level === 1;
    const archetype = archetypeOf(index);
    const slide = pres.addSlide();
    slide.background = { color: isTitleSlide ? INK : PAPER };

    // Two archetypes whose layout *is* the teaching, so they are not flowed
    // like body copy. A question set in 17pt at the top of an otherwise empty
    // slide reads as an aside; the same words large and alone read as something
    // the room is expected to answer. The whitespace is deliberate — see
    // references/visual-grammar.md.
    if (!isTitleSlide && (archetype === "question" || archetype === "activity" || archetype === "big_idea")) {
      let y = 1.7;
      let titled = false;
      for (const block of blocks) {
        if (block.kind === "heading") {
          // Same rule as the flowing layout: the first heading is the title at
          // a fixed position, and a later one is a sub-heading in the flow.
          // Drawing both at 0.55 prints them on top of each other.
          if (!titled) {
            titled = true;
            const height = textHeight(block.text, 30, CONTENT_W, 1.15);
            slide.addText(block.text, {
              x: MARGIN, y: 0.55, w: CONTENT_W, h: height,
              fontFace: HEAD_FONT, fontSize: 30, bold: true, color: MUTED, margin: 0,
            });
            continue;
          }
          const height = textHeight(block.text, 22, CONTENT_W - 1.0, 1.2);
          slide.addText(block.text, {
            x: MARGIN + 0.5, y, w: CONTENT_W - 1.0, h: height,
            fontFace: HEAD_FONT, fontSize: 22, bold: true, color: PRIMARY, margin: 0,
          });
          y += height + 0.2;
          continue;
        }
        if (block.kind === "paragraph") {
          const height = textHeight(block.text, 30, CONTENT_W - 1.0, 1.25);
          slide.addText(runs(block.text, { color: INK }), {
            x: MARGIN + 0.5, y, w: CONTENT_W - 1.0, h: height,
            fontFace: HEAD_FONT, fontSize: 30, lineSpacingMultiple: 1.25, margin: 0,
          });
          y += height + 0.45;
          continue;
        }
        if (block.kind === "list") {
          // Options on a poll: readable, evenly spaced, and nothing else on the
          // slide competing with them.
          const height = block.items.reduce(
            (total, item) => total + textHeight(item, 22, CONTENT_W - 1.4) + 0.3, 0,
          );
          slide.addText(
            block.items.map((item, position) => ({
              text: plain(item),
              options: {
                color: INK,
                bullet: block.ordered ? { type: "number", startAt: position + 1 } : true,
                breakLine: position < block.items.length - 1,
              },
            })),
            {
              x: MARGIN + 0.7, y, w: CONTENT_W - 1.4, h: height,
              fontFace: BODY_FONT, fontSize: 22, margin: 0, paraSpaceAfter: 16,
            },
          );
          y += height + 0.35;
          continue;
        }
        warnings.push(
          `slide ${index + 1} is a '${archetype}' slide and contains a ${block.kind} block, ` +
          "which this archetype does not carry; it was left off",
        );
      }
      if (y > FLOOR) {
        warnings.push(`slide ${index + 1} runs to ${y.toFixed(2)}" of ${FLOOR}" — shorten it`);
      }
      const note = noteFor(index);
      if (note) slide.addNotes(note);
      continue;
    }

    let cursor = 1.6;
    // Where the last block actually ends, as against where the next one would
    // start. Without the distinction every full slide reports an overflow of
    // exactly one inter-block gap.
    let bottom = cursor;
    // Whether this slide has had its title drawn. A slide may carry several
    // headings; only the first is the title.
    let titleDrawn = false;
    /** The first block that crossed the bottom margin, described for the report. */
    let lost: string | null = null;
    /** Set by the block loop before each `advance`, so the crossing can be named. */
    let placing: Block | null = null;
    const advance = (height: number, gap = 0.3): void => {
      bottom = cursor + height;
      cursor = bottom + gap;
      // Blamed at the slide edge, not at the margin. A block that ends between
      // the two is tight but visible; only past `SLIDE_H` is it actually gone,
      // and naming the wrong block sends the professor to shorten something
      // that was never the problem.
      if (bottom > SLIDE_H && !lost && placing) lost = describeBlock(placing);
    };

    if (isTitleSlide) {
      cursor = 1.9;
      for (const block of blocks) {
        if (block.kind === "heading") {
          const height = textHeight(block.text, 46, 9.0, 1.15);
          slide.addText(block.text, {
            x: MARGIN, y: cursor, w: 9.6, h: height,
            fontFace: HEAD_FONT, fontSize: 46, bold: true, color: PAPER,
            lineSpacingMultiple: 1.05, margin: 0,
          });
          advance(height, 0.5);
        } else if (block.kind === "paragraph") {
          const height = textHeight(block.text, 16, 10.0);
          slide.addText(runs(block.text, { color: LIGHT }), {
            x: MARGIN, y: cursor, w: 10.0, h: height,
            fontFace: BODY_FONT, fontSize: 16, margin: 0,
          });
          advance(height, 0.28);
        }
      }
      const note = noteFor(index);
      if (note) slide.addNotes(note);
      continue;
    }

    for (const block of blocks) {
      placing = block;
      switch (block.kind) {
        case "heading": {
          // Only the first heading is the slide's title. Every later one is a
          // sub-heading and belongs in the flow.
          //
          // Drawing all of them at the title's fixed position is a bug that
          // does not look like one in the markdown: a slide written with a
          // `##` title and two `###` sections came out with three titles
          // printed on top of one another and all three bodies starting at the
          // same y. Nothing in the source hints at it, and the plan check does
          // not catch it either, because it compares only the first heading.
          if (!titleDrawn) {
            titleDrawn = true;
            slide.addText(block.text, {
              x: MARGIN, y: 0.45, w: CONTENT_W, h: 0.8,
              fontFace: HEAD_FONT, fontSize: 34, bold: true, color: INK, margin: 0,
            });
            slide.addShape(pres.ShapeType.line, {
              x: MARGIN, y: 1.32, w: CONTENT_W, h: 0,
              line: { color: RULE, width: 1 },
            });
            cursor = 1.6;
            bottom = cursor;
            break;
          }
          const height = textHeight(block.text, 21, CONTENT_W, 1.2);
          slide.addText(block.text, {
            x: MARGIN, y: cursor, w: CONTENT_W, h: height,
            fontFace: HEAD_FONT, fontSize: 21, bold: true, color: PRIMARY, margin: 0,
          });
          // A tighter gap than a paragraph's: a sub-heading belongs to the text
          // under it, and an even gap on both sides makes it belong to neither.
          advance(height, 0.14);
          break;
        }

        case "paragraph": {
          const height = textHeight(block.text, 17, CONTENT_W);
          slide.addText(runs(block.text, { color: INK }), {
            x: MARGIN, y: cursor, w: CONTENT_W, h: height,
            fontFace: BODY_FONT, fontSize: 17, lineSpacingMultiple: 1.15, margin: 0,
          });
          advance(height);
          break;
        }

        case "quote": {
          const height = textHeight(block.text, 15, CONTENT_W - 0.6) + 0.4;
          slide.addShape(pres.ShapeType.roundRect, {
            x: MARGIN, y: cursor, w: CONTENT_W, h: height,
            fill: { color: LIGHT }, line: { color: LIGHT }, rectRadius: 0.06,
          });
          slide.addText(runs(block.text, { color: INK }), {
            x: MARGIN + 0.3, y: cursor + 0.2, w: CONTENT_W - 0.6, h: height - 0.4,
            fontFace: BODY_FONT, fontSize: 15, lineSpacingMultiple: 1.15, margin: 0,
          });
          advance(height);
          break;
        }

        case "code": {
          // The panel is sized to the code, not fixed at half the slide.
          //
          // It used to be 6" wide whatever it held, which fits 37 monospace
          // characters at 18pt. Almost no real code is that narrow: a deck
          // measured after this was written had ten blocks between 39 and 72
          // characters, every one of them wrapped, and wrapping destroys the
          // one thing code has that prose does not — its alignment. A
          // PROMPT/RESPONSE block laid out in columns came out shredded, beside
          // half a slide of white space.
          //
          // So: measure the longest line, and give it the width it needs. Only
          // when the full content width is not enough does the size step down,
          // and only when 12pt is still not enough is the text left to wrap.
          const lines = block.text.split(/\r?\n/);
          const longest = Math.max(1, ...lines.map((line) => line.length));
          const available = CONTENT_W - 0.6; // the panel's inner width

          let size = 18;
          for (const candidate of [18, 16, 14, 12]) {
            size = candidate;
            if ((longest * candidate * CHAR_WIDTH.mono) / 72 <= available) break;
          }
          if (size < 18) {
            warnings.push(
              `slide ${index + 1}: a code line is ${longest} characters, so the block is set at ` +
              `${size}pt to fit the slide. Shorter lines read better at the back of a room.`,
            );
          }

          // Never narrower than a third of the slide — a two-word block in a
          // tiny panel looks like a mistake rather than a choice.
          const needed = (longest * size * CHAR_WIDTH.mono) / 72;
          const textW = Math.min(Math.max(needed, CONTENT_W / 3), available);
          const height = textHeight(block.text, size, textW, 1.4, CHAR_WIDTH.mono) + 0.4;

          slide.addShape(pres.ShapeType.roundRect, {
            x: MARGIN, y: cursor, w: textW + 0.6, h: height,
            fill: { color: CODE_BG }, line: { color: CODE_LINE }, rectRadius: 0.06,
          });
          slide.addText(block.text, {
            x: MARGIN + 0.3, y: cursor + 0.2, w: textW, h: height - 0.4,
            fontFace: MONO_FONT, fontSize: size, color: INK, lineSpacingMultiple: 1.25, margin: 0,
          });
          advance(height);
          break;
        }

        case "list": {
          // One run per item, and the emphasis inside it is dropped. That is a
          // limit of pptxgenjs rather than a choice: it emits a set of
          // paragraph properties for *every* run, and a run carrying no bullet
          // emits `buNone` — so a second run inside an item cancels its bullet,
          // while giving every run the bullet starts a new paragraph per run.
          // Either way the list comes out wrong, and the version that comes out
          // wrong quietly is the one with no bullets at all.
          //
          // So bullets and hanging indents win over bold inside a bullet, and
          // `pres check` names any item whose emphasis was dropped rather than
          // letting the author find out from the projector.
          //
          // pptxgenjs also restarts numbering at 1 for every paragraph unless
          // each one says where it sits in the sequence.
          const body = block.items.map((item, position) => ({
            text: plain(item),
            options: {
              color: INK,
              bullet: block.ordered ? { type: "number", startAt: position + 1 } : true,
              breakLine: position < block.items.length - 1,
            },
          }));
          const height =
            block.items.reduce((total, item) => total + textHeight(item, 17, CONTENT_W - 0.6), 0) +
            block.items.length * 0.16;
          slide.addText(body, {
            x: MARGIN + 0.15, y: cursor, w: CONTENT_W - 0.3, h: height,
            fontFace: BODY_FONT, fontSize: 17, margin: 0,
            paraSpaceAfter: 14, lineSpacingMultiple: 1.15,
          });
          advance(height);
          break;
        }

        case "table": {
          const [header, ...body] = block.rows;
          if (!header) break;
          const width = CONTENT_W - 0.4;
          const rows = [
            header.map((cell) => ({
              text: plain(cell),
              options: { bold: true, color: PAPER, fill: { color: PRIMARY }, fontSize: 15 },
            })),
            ...body.map((row) =>
              row.map((cell) => ({ text: plain(cell), options: { color: INK, fontSize: 15 } })),
            ),
          ];
          const widths = columnWidths(block.rows, width, 15);
          // Per row, not one fixed height: a wrapped cell makes the table taller
          // than a fixed height claims, and everything placed under it is then
          // overprinted.
          const heights = tableRowHeights(block.rows, widths, 15);
          slide.addTable(rows, {
            x: MARGIN, y: cursor, w: width,
            colW: widths,
            fontFace: BODY_FONT, border: { type: "solid", color: CODE_LINE, pt: 1 },
            rowH: heights, valign: "middle", margin: 0.12, fill: { color: PAPER },
          });
          advance(heights.reduce((sum, height) => sum + height, 0), 0.35);
          break;
        }

        // Display mathematics: centred, larger than body copy, in the serif.
        // Set in text rather than typeset — see src/math.ts for what that can
        // and cannot carry.
        case "math": {
          const height = textHeight(block.text, 24, CONTENT_W, 1.3);
          slide.addText(block.text, {
            x: MARGIN, y: cursor, w: CONTENT_W, h: height,
            fontFace: HEAD_FONT, fontSize: 24, color: INK, align: "center",
            lineSpacingMultiple: 1.3, margin: 0,
          });
          advance(height, 0.34);
          break;
        }

        case "image": {
          const source = join(context.materialsDir, block.src);
          if (!existsSync(source)) {
            warnings.push(`slide ${index + 1}: ${block.src} is missing; left off the slide`);
            break;
          }
          // The SVG is the committed source; the PNG is a render, and it goes
          // to output/ with the deck rather than back beside the markdown.
          const placedW = Math.min(CONTENT_W * 0.75, 8.6);
          // Figures are already named after their deck, so prefixing the deck
          // name again produced `MODULE-06-slides-MODULE-06-slides-fig-01-…`.
          // Not merely ugly: Windows still caps a path at 260 characters by
          // default, and a course kept somewhere with a long path lost the
          // render entirely, with an error from the image library that named
          // neither the deck nor the cause.
          const stem = block.src.replace(/\.[^.]+$/, "");
          const png = join(
            context.outDir,
            `${stem.startsWith(context.name) ? stem : `${context.name}-${stem}`}.png`,
          );
          const credit = creditForFigure(figures[block.src], block.src);
          const creditH = credit ? 0.3 : 0;
          const meta = await sharp(source)
            .resize({ width: Math.round(placedW * 96 * 2) }) // 2x its placed size
            .png()
            .toFile(png);
          let width = placedW;
          let height = width * (meta.height / meta.width);
          const available = FLOOR - cursor - creditH;
          if (height > available) {
            height = available;
            width = height * (meta.width / meta.height);
          }
          slide.addImage({
            path: png,
            x: (SLIDE_W - width) / 2, y: cursor, w: width, h: height,
            altText: block.alt,
          });
          if (credit) {
            slide.addText(credit, {
              x: (SLIDE_W - width) / 2, y: cursor + height + 0.04, w: width, h: 0.22,
              fontFace: BODY_FONT, fontSize: 10, color: MUTED, margin: 0,
            });
          }
          advance(height + creditH);
          break;
        }
      }
    }

    if (bottom > FLOOR) {
      // Naming what is lost, not only that something is. "Slide 29 runs to
      // 7.86 inches" is a number to weigh up; "the paragraph 'Continued on the
      // next slide…' is not on the slide" is a thing to go and fix, and it is
      // the difference between a warning that gets read and one that does not.
      warnings.push(
        `slide ${index + 1} runs to ${bottom.toFixed(2)}" of ${FLOOR}"` +
        (lost
          ? ` — ${lost} is off the slide`
          : " — into the bottom margin, still visible but tight"),
      );
    }

    // The slide number, bottom right, quiet.
    //
    // Its real job is not navigation during the talk — it is that a student can
    // write "slide 23" in their notes and ask about it afterwards, and that a
    // colleague reviewing the deck can say which slide they mean. Skipped on
    // the title slide, where it is only clutter, and suppressed entirely with
    // `slide_numbers: false` in the plan.
    if (!isTitleSlide && context.plan.slide_numbers !== false) {
      slide.addText(String(index + 1), {
        x: SLIDE_W - MARGIN - 1.0, y: SLIDE_H - 0.44, w: 1.0, h: 0.26,
        fontFace: BODY_FONT, fontSize: 11, color: MUTED, align: "right", margin: 0,
      });
    }

    const note = noteFor(index);
    if (note) slide.addNotes(note);
  }

  const file = join(context.outDir, `${context.name}.pptx`);
  await pres.writeFile({ fileName: file });
  return { file, warnings };
}

const SOFFICE = [
  process.env.SOFFICE_PATH,
  "soffice",
  "C:/Program Files/LibreOffice/program/soffice.exe",
  "/usr/bin/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
].filter(Boolean) as string[];

/**
 * PDF by converting *this exact deck*.
 *
 * The dependency on LibreOffice is chosen rather than inherited: anything that
 * renders the markdown a second time produces a different document that merely
 * looks the same, and then there are two PDFs and no way to say which one the
 * slides are.
 */
export function toPdf(pptx: string, outDir: string): string | null {
  for (const binary of SOFFICE) {
    const result = spawnSync(binary, ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptx], {
      encoding: "utf8",
    });
    if (result.error) continue;
    const pdf = pptx.replace(/\.pptx$/, ".pdf");
    if (existsSync(pdf)) return pdf;
  }
  return null;
}

export interface RenderResult {
  pptx: string;
  pdf: string | null;
  warnings: string[];
}

/**
 * Check, then render, then optionally convert.
 *
 * Nothing is written until every error-level check has passed. Warnings are
 * carried out to the caller rather than swallowed: an overflowing slide is not
 * a reason to refuse a deck, and it is very much a reason to say so.
 */
export async function renderDeck(
  deckPath: string,
  options: { outDir?: string; pdf?: boolean } = {},
): Promise<RenderResult> {
  const checked = checkDeck(deckPath);
  const failures = errorsIn(checked.problems);
  if (failures.length) {
    throw new Error(
      `${deckPath} is not renderable:\n${describeProblems(failures)}\n\n` +
      "Nothing here reorders slides, fills in an attribution or approves an outline to make a\n" +
      "deck build. Which of the two files is wrong is the professor's question.",
    );
  }

  const name = deckPath.replace(/^.*[\\/]/, "").replace(/\.md$/i, "");
  const outDir = resolve(options.outDir ?? join(process.cwd(), "output"));
  await mkdir(outDir, { recursive: true });

  const { file, warnings } = await build(checked.slides, {
    materialsDir: dirname(deckPath),
    outDir,
    name,
    title: checked.plan.title ?? name,
    plan: checked.plan,
  });

  const carried = [
    ...warnings,
    ...checked.problems.filter((problem) => problem.severity === "warning").map((problem) => problem.message),
  ];

  return { pptx: file, pdf: options.pdf ? toPdf(file, outDir) : null, warnings: carried };
}
