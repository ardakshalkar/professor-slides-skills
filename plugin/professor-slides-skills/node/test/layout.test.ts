/**
 * The measuring the layout rests on.
 *
 * Every test here is a slide that came out wrong in a real deck. The estimates
 * are estimates — PowerPoint does the actual typesetting — but they decide
 * where the *next* block goes, so an under-estimate is not a cosmetic problem:
 * it prints two blocks on top of each other, and it does so invisibly, because
 * nothing in the markdown looks unusual.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAR_WIDTH,
  charsPerLine,
  columnWidths,
  tableRowHeights,
  textHeight,
} from "../src/deck.ts";

// The table that broke: six columns, one of them a 79-character headline.
const NEWS = [
  ["Language", "Headline", "Chars", "Bytes", "Tokens", "vs EN"],
  ["English", "Kassym-Jomart Tokayev receives credentials from ambassadors of nine countries", "77", "77", "**16**", "1.00×"],
  ["Russian", "Токаев принял верительные грамоты послов девяти стран", "53", "100", "**14**", "0.88×"],
  ["Kazakh", "Қасым-Жомарт Тоқаев бірқатар мемлекеттің елшісінен сенім грамоталарын қабылдады", "79", "150", "**28**", "1.75×"],
];

const WIDTH = 13.33 - 0.7 * 2 - 0.4; // what the renderer gives a table

test("monospace is measured wider than proportional text", () => {
  const mono = textHeight("x".repeat(200), 18, 5.4, 1.4, CHAR_WIDTH.mono);
  const proportional = textHeight("x".repeat(200), 18, 5.4, 1.4);
  assert.ok(mono > proportional, "a code block must not be measured as if it were body copy");
});

test("a code block is tall enough for the lines it actually wraps to", () => {
  // The line that overflowed its panel: it is longer than one monospace line at
  // 18pt in 5.4 inches, so the block is two lines whatever the markdown looks like.
  const line = "Astana is the capital of  → Kazakhstan";
  const perLine = charsPerLine(5.4, 18, CHAR_WIDTH.mono);
  assert.ok(line.length > perLine, "fixture is no longer a wrapping line; pick a longer one");
  const height = textHeight(line, 18, 5.4, 1.4, CHAR_WIDTH.mono);
  assert.ok(height >= (2 * 18 * 1.4) / 72 - 1e-9, "two wrapped lines must be measured as two");
});

test("no column is narrower than its longest word", () => {
  const widths = columnWidths(NEWS, WIDTH, 15);
  // "Language" is 8 characters and must fit on one line, or PowerPoint breaks
  // it mid-word into "Langu / age".
  const needed = (8 * 15 * CHAR_WIDTH.proportional) / 72 + 0.24;
  assert.ok(widths[0]! >= needed - 1e-9, `column 0 is ${widths[0]}", needs ${needed}"`);
  for (const [column, width] of widths.entries()) {
    assert.ok(width > 0, `column ${column} has no width`);
  }
});

test("the columns still add up to the table's width", () => {
  const widths = columnWidths(NEWS, WIDTH, 15);
  const total = widths.reduce((sum, width) => sum + width, 0);
  assert.ok(Math.abs(total - WIDTH) < 1e-6, `columns sum to ${total}", table is ${WIDTH}"`);
});

test("the long column still gets the most room", () => {
  const widths = columnWidths(NEWS, WIDTH, 15);
  const headline = widths[1]!;
  for (const [column, width] of widths.entries()) {
    if (column === 1) continue;
    assert.ok(headline > width, "the headline column should still be the widest");
  }
});

test("words that cannot fit at all are scaled together rather than dropped", () => {
  const impossible = [["antidisestablishmentarianism", "antidisestablishmentarianism"]];
  const widths = columnWidths(impossible, 1.0, 15);
  const total = widths.reduce((sum, width) => sum + width, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-6);
  assert.ok(widths.every((width) => width > 0));
});

test("a row with a wrapping cell is measured taller than one without", () => {
  const widths = columnWidths(NEWS, WIDTH, 15);
  const heights = tableRowHeights(NEWS, widths, 15);
  assert.equal(heights.length, NEWS.length);
  assert.ok(heights.every((height) => height >= 0.62), "no row may be shorter than the minimum");
  // The Kazakh headline is the longest cell in the table, so its row is the one
  // that wraps; a fixed row height is what let the table overprint the
  // paragraph beneath it.
  const kazakh = heights[3]!;
  const numbersOnly = tableRowHeights([["a", "b", "c", "d", "e", "f"]], widths, 15)[0]!;
  assert.ok(kazakh > numbersOnly, "a wrapped row must be measured taller than a short one");
});

test("charsPerLine never returns something unusable", () => {
  assert.ok(charsPerLine(0.01, 40, CHAR_WIDTH.mono) >= 4);
  assert.ok(charsPerLine(10, 15, CHAR_WIDTH.proportional) > 40);
});
