/**
 * LaTeX to text, and — more importantly — knowing when it cannot be done.
 *
 * The two formulas at the top are the ones that went up on a real lecture
 * slide as raw source. Everything else here exists to keep the converter from
 * being confidently wrong, which for a formula is worse than being absent.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { convertInline, displayMath, latexToUnicode } from "../src/math.ts";
import { parseBlocks } from "../src/deck.ts";

test("a conditional probability", () => {
  const { text, unconverted } = latexToUnicode(String.raw`P(x_t \mid x_1,\ldots,x_{t-1})`);
  assert.equal(text, "P(xₜ | x₁,…,xₜ₋₁)");
  assert.deepEqual(unconverted, []);
});

test("a cost formula with fractions and multi-letter subscripts", () => {
  const { text, unconverted } = latexToUnicode(
    String.raw`\text{cost}=\frac{T_{in}}{10^6}R_{in}+\frac{T_{out}}{10^6}R_{out}`,
  );
  assert.deepEqual(unconverted, []);
  assert.match(text, /^cost = /);
  assert.ok(text.includes("Tᵢₙ"), text);
  assert.ok(text.includes("10⁶"), text);
  assert.ok(text.includes("Rₒᵤₜ"), text);
  assert.ok(!text.includes("\\"), `LaTeX survived: ${text}`);
});

test("superscripts and subscripts", () => {
  assert.equal(latexToUnicode("x^2").text, "x²");
  assert.equal(latexToUnicode("x_1").text, "x₁");
  assert.equal(latexToUnicode("x^{10}").text, "x¹⁰");
  assert.equal(latexToUnicode("e^{-x}").text, "e⁻ˣ");
});

test("a script Unicode cannot set is written out, not flattened", () => {
  // No subscript capitals exist. Flattening would make x_Q and xQ the same
  // thing, which on a slide of indexed variables is a real ambiguity.
  const { text } = latexToUnicode("x_{Q}");
  assert.equal(text, "x_(Q)");
  assert.ok(!/^xQ$/.test(text));
});

test("a compound fraction keeps its brackets", () => {
  assert.equal(latexToUnicode(String.raw`\frac{a+b}{c}`).text, "(a + b)⁄c");
  assert.equal(latexToUnicode(String.raw`\frac{a}{b}`).text, "a⁄b");
});

test("nested braces are counted, not matched to the first close", () => {
  const { text } = latexToUnicode(String.raw`\frac{x_{1}}{y}`);
  assert.equal(text, "x₁⁄y");
});

test("symbols, and a command name that is a prefix of another", () => {
  assert.equal(latexToUnicode(String.raw`a \le b \leq c`).text, "a ≤ b ≤ c");
  assert.equal(latexToUnicode(String.raw`\alpha \times \beta`).text, "α × β");
  assert.equal(latexToUnicode(String.raw`\sum \log \infty`).text, "∑ log ∞");
});

test("an unknown command is reported and left alone", () => {
  const { text, unconverted } = latexToUnicode(String.raw`\begin{bmatrix} a \end{bmatrix}`);
  assert.ok(unconverted.includes("\\begin"), unconverted.join(","));
  assert.ok(text.includes("\\begin"), "the original must survive so nothing is silently mangled");
});

test("display maths is recognised in both spellings", () => {
  assert.equal(displayMath(String.raw`\[ x^2 \]`), "x^2");
  assert.equal(displayMath("$$ x^2 $$"), "x^2");
  assert.equal(displayMath("just a sentence"), null);
});

test("inline maths is converted where it stands", () => {
  const { text } = convertInline(String.raw`For tokens \(x_1\), the model estimates:`);
  assert.equal(text, "For tokens x₁, the model estimates:");
});

test("prices are not mistaken for inline maths", () => {
  // The deck that prompted all this has "$0.05 → $30.00" on a slide. Treating
  // dollars as maths delimiters would eat it.
  const { text } = convertInline("The spread is $0.05 → $30.00 per million.");
  assert.equal(text, "The spread is $0.05 → $30.00 per million.");
});

test("a display formula becomes its own block, and prose keeps its maths inline", () => {
  const blocks = parseBlocks(
    ["For context tokens \\(x_1\\), the model estimates:", "", "\\[", "P(x_t)", "\\]"].join("\n"),
  );
  const math = blocks.find((block) => block.kind === "math");
  assert.ok(math && math.kind === "math", "display maths should be its own block");
  assert.equal(math.text, "P(xₜ)");
  assert.deepEqual(math.unconverted, []);

  const paragraph = blocks.find((block) => block.kind === "paragraph");
  assert.ok(paragraph && paragraph.kind === "paragraph");
  assert.equal(paragraph.text, "For context tokens x₁, the model estimates:");
});
