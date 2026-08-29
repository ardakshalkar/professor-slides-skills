#!/usr/bin/env node

/**
 * `pres` — the mechanical half of the presentation skills.
 *
 * Everything here is a thing better done by a program than by judgement:
 * finding the course, bounding what one session may cover, and refusing to
 * render a deck that nobody approved or whose figures carry no credit. The
 * writing is the skills' job; the checking is this.
 *
 *     pres source  --course CSS-4008
 *     pres context --course CSS-4008 --module MODULE-06
 *     pres outline check work/CSS-4008-2026-FALL/presentations/MODULE-06-slides.outline.yaml
 *     pres check   work/.../MODULE-06-slides.md
 *     pres render  work/.../MODULE-06-slides.md --pdf
 *     pres find-image --search "confusion matrix"
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildModuleContext, describeContext, inTeachingOrder, moduleOnDate } from "../src/context.ts";
import { checkDeck, describeProblems, errorsIn } from "../src/check.ts";
import { describeResults, downloadImage, figureEntry, searchImages } from "../src/find-image.ts";
import { checkOutline, loadOutline } from "../src/plan.ts";
import { renderDeck } from "../src/render.ts";
import { describeProvenance, resolveCourse, type ResolveOptions } from "../src/source.ts";
import type { Origin } from "../src/model.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name: string): boolean => args.includes(`--${name}`);

/** Flags that consume the token after them, so a path is never mistaken for one. */
const VALUE_FLAGS = new Set([
  "--course", "--version", "--course-file", "--only", "--module", "--date",
  "--out", "--search", "--limit", "--pick", "--name", "--into",
]);

/**
 * The bare arguments after the command word, in order.
 *
 * `pres render --out DIR DECK.md` has to find `DECK.md` and not `DIR`, so this
 * skips the value of every flag that takes one rather than taking the first
 * token that does not start with a dash.
 */
function positional(from: number): string[] {
  const out: string[] = [];
  for (let index = from; index < args.length; index += 1) {
    const token = args[index]!;
    if (token.startsWith("--")) {
      if (VALUE_FLAGS.has(token)) index += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

const USAGE = `pres — course source, outline checking and deck rendering

  pres source [--course ID] [--version TERM] [--only SOURCE] [--json]
      Where the course is, and what it says. --only is supabase,
      course-directory or flat-file, for diagnosing a fallback.

  pres courses
      Every course this machine can reach, and from where.

  pres context --module MODULE-ID [--course ID] [--version TERM] [--json]
  pres context --date YYYY-MM-DD [--course ID]
      Everything one session's outline may be built from, and nothing else.

  pres outline check FILE [--course ID] [--module MODULE-ID]
      Whether an outline is sound, and honest about what it leaves out.

  pres check DECK.md
      Whether a deck is renderable: approved, matching its plan, figures
      present and credited.

  pres render DECK.md [--pdf] [--out DIR]
      The .pptx, and with --pdf the LibreOffice conversion of that same deck.

  pres find-image --search QUERY [--limit N] [--any-licence]
                  [--pick N --name STEM --into DIR]
      An openly-licensed picture, with the plan entry that credits it.

Common flags: --help on any command.`;

const SOURCE_FLAGS = (): ResolveOptions => {
  const options: ResolveOptions = {};
  const course = flag("course");
  if (course) options.course = course;
  const version = flag("version");
  if (version) options.version = version;
  const courseFile = flag("course-file");
  if (courseFile) options.courseFile = courseFile;
  const only = flag("only");
  if (only) options.only = only as Origin;
  return options;
};

const print = (value: unknown): void => console.log(JSON.stringify(value, null, 2));

async function commandSource(): Promise<void> {
  const { source, warnings } = await resolveCourse(SOURCE_FLAGS());
  if (has("json")) {
    print({ ...source, warnings });
    return;
  }
  console.log(describeProvenance(source));
  console.log("");
  console.log(`${source.course.course_id} — ${source.course.title}`);
  if (source.version) {
    const window = [source.version.start_date, source.version.end_date].filter(Boolean).join(" to ");
    console.log(`Run: ${source.version.course_version_id}${window ? ` (${window})` : ""}`);
  } else {
    console.log("Run: none chosen — pass --version if the course has more than one.");
  }
  console.log(
    `${source.outcomes.length} outcomes · ${source.concepts.length} concepts · ` +
    `${source.modules.length} modules · ${source.activities.length} scheduled · ` +
    `${source.references.length} references`,
  );
  console.log("");
  for (const module of inTeachingOrder(source.modules)) {
    const week = module.week === undefined ? "  " : String(module.week).padStart(2, " ");
    console.log(`  ${week}  ${module.module_id}  ${module.title}`);
  }
  for (const warning of warnings) console.warn(`\nwarning: ${warning}`);
}

async function commandCourses(): Promise<void> {
  const { source } = await resolveCourse(SOURCE_FLAGS());
  console.log(describeProvenance(source));
  console.log(`  ${source.course.course_id} — ${source.course.title}`);
}

async function commandContext(): Promise<void> {
  const { source, warnings } = await resolveCourse(SOURCE_FLAGS());
  let moduleId = flag("module");
  const date = flag("date");
  if (!moduleId && date) {
    const found = moduleOnDate(source, date);
    if (!found) throw new Error(`nothing is scheduled on ${date}, so there is no module to prepare`);
    moduleId = found.module_id;
  }
  if (!moduleId) throw new Error("pres context needs --module MODULE-ID or --date YYYY-MM-DD");

  const context = buildModuleContext(source, moduleId);
  if (has("json")) {
    print({ ...context, warnings });
    return;
  }
  console.log(describeProvenance(source));
  console.log("");
  console.log(describeContext(context));
  for (const warning of warnings) console.warn(`\nwarning: ${warning}`);
}

async function commandOutlineCheck(): Promise<void> {
  const [path] = positional(2);
  if (!path) throw new Error("pres outline check needs the path to an outline file");
  const outline = loadOutline(resolve(path));

  // The module check is the half that matters, so it is attempted even when the
  // command line does not name a course: the outline says which one it is for.
  let context = null;
  const moduleId = flag("module") ?? outline.module_id;
  if (moduleId) {
    try {
      const options = SOURCE_FLAGS();
      if (!options.course && outline.course_id) options.course = outline.course_id;
      if (!options.version && outline.course_version_id) options.version = outline.course_version_id;
      const { source } = await resolveCourse(options);
      context = buildModuleContext(source, moduleId);
    } catch (error) {
      console.warn(
        `Could not load ${moduleId} to check coverage against it, so only the outline's internal\n` +
        `consistency was checked: ${String((error as Error).message ?? error).split("\n")[0]}\n`,
      );
    }
  }

  const problems = checkOutline(outline, context);
  console.log(describeProblems(problems));
  if (errorsIn(problems).length) process.exitCode = 1;
}

function commandCheck(): void {
  const [path] = positional(1);
  if (!path) throw new Error("pres check needs the path to a deck");
  const checked = checkDeck(resolve(path));
  console.log(`${checked.deck}: ${checked.slides.length} slides, plan ${checked.planPath}`);
  console.log(describeProblems(checked.problems));
  if (errorsIn(checked.problems).length) process.exitCode = 1;
}

async function commandRender(): Promise<void> {
  const [path] = positional(1);
  if (!path) throw new Error("pres render needs the path to a deck");
  const outDir = flag("out");
  const result = await renderDeck(resolve(path), {
    pdf: has("pdf"),
    ...(outDir ? { outDir } : {}),
  });
  console.log(`wrote ${result.pptx}`);
  if (has("pdf")) {
    if (result.pdf) console.log(`wrote ${result.pdf}`);
    else {
      console.warn(
        "LibreOffice not found — the .pptx is written, the PDF is not. Set SOFFICE_PATH, or\n" +
        "render a review PDF with Marp and say which it is:\n" +
        `    npx @marp-team/marp-cli ${path} --pdf --pdf-outlines -o output/review.pdf\n` +
        "That is a second rendering of the markdown, not a picture of this deck — fine for\n" +
        "reading through, wrong for anything presented or handed out.",
      );
    }
  }
  for (const warning of result.warnings) console.warn(`  ${warning}`);
  console.log("\nThen look at it. The first render usually has a real defect or two, and they are\nobvious in the pages and invisible in the source.");
}

async function commandFindImage(): Promise<void> {
  const query = flag("search");
  if (!query) throw new Error("pres find-image needs --search QUERY");
  const results = await searchImages(query, Number(flag("limit") ?? 8), has("any-licence"));
  if (!results.length) {
    console.log(`nothing for "${query}". Try fewer words, or draw it instead.`);
    return;
  }

  const pick = flag("pick");
  if (!pick) {
    console.log(describeResults(results));
    return;
  }
  const chosen = results[Number(pick) - 1];
  if (!chosen) throw new Error(`--pick ${pick} but there are ${results.length} results`);

  const into = flag("into") ?? join(process.cwd(), "work");
  if (resolve(into).includes(`${"courses"}`) && existsSync(join(resolve(into), "..", "course.yaml"))) {
    throw new Error("refusing to download beside a course definition — a found image is a draft");
  }
  const name = flag("name") ?? `figure-${chosen.id.slice(0, 8)}`;
  const file = await downloadImage(chosen, { directory: into, name });
  const filename = file.replace(/^.*[\\/]/, "");

  console.log(`wrote ${file}`);
  console.log("\nRecord it in the deck's plan — the credit is part of the record, not a note to self:\n");
  console.log(figureEntry(chosen, filename));
  console.log(
    `\nOn the slide, link it as a sibling of the deck:\n\n    ![DESCRIBE WHAT IT SHOWS](${filename})\n\n` +
    "The alt text is not the title. Say what a student who cannot see it would need.",
  );
}

async function main(): Promise<void> {
  const command = args[0];
  if (!command || has("help") && !command) {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case "source": return commandSource();
    case "courses": return commandCourses();
    case "context": return commandContext();
    case "outline": {
      const sub = args[1];
      if (sub !== "check") throw new Error("the only outline subcommand is `check`");
      return commandOutlineCheck();
    }
    case "check": return commandCheck();
    case "render": return commandRender();
    case "find-image": return commandFindImage();
    case "help": case "--help": console.log(USAGE); return;
    default:
      console.error(`unknown command '${command}'.\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(String((error as Error).message ?? error));
  process.exitCode = 1;
});
