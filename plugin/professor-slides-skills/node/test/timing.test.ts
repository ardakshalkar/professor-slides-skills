/**
 * The measuring stick.
 *
 * Two things have to be true of local instrumentation for it to be worth having.
 * It must be free when it is off — otherwise it is a permanent tax paid for a
 * report nobody is reading — and it must never send anything anywhere, which is
 * why there is no client, no file and no aggregation in `timing.ts` at all.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeTimings,
  enableTiming,
  formatMs,
  noteTiming,
  reportTimings,
  resetTimings,
  startSpan,
  takeTimings,
  timed,
  timedSync,
  timingEnabled,
} from "../src/timing.ts";

test("nothing is recorded until timing is asked for", async () => {
  enableTiming(false);
  assert.equal(timingEnabled(), false);
  const value = await timed("a step", () => 42);
  assert.equal(value, 42);
  noteTiming("another", 100);
  assert.deepEqual(takeTimings(), []);
  assert.equal(describeTimings(), "");

  // And the report writes nothing rather than an empty heading.
  let written = 0;
  reportTimings(() => { written += 1; });
  assert.equal(written, 0);
});

test("spans nest, and the report indents them", async () => {
  enableTiming(true);
  resetTimings();
  try {
    await timed("course source", async () => {
      await timed("database probe", async () => {
        await timed("dns", () => undefined);
      });
    });
    timedSync("checks", () => undefined);

    const spans = takeTimings();
    assert.deepEqual(spans.map((span) => span.label), [
      // Innermost first: a span is recorded when it finishes.
      "dns",
      "database probe",
      "course source",
      "checks",
    ]);
    assert.deepEqual(spans.map((span) => span.depth), [2, 1, 0, 0]);

    const report = describeTimings();
    assert.match(report, /^ {4}dns: /m);
    assert.match(report, /^ {2}database probe: /m);
    assert.match(report, /^course source: /m);
  } finally {
    enableTiming(false);
  }
});

test("a value or an error passes through a span untouched", async () => {
  enableTiming(true);
  resetTimings();
  try {
    assert.equal(await timed("ok", async () => "value"), "value");
    await assert.rejects(() => timed("bad", async () => { throw new Error("boom"); }), /boom/);
    // The failed step is still timed, which is the case worth measuring: the
    // interesting six seconds are usually a failure.
    assert.deepEqual(takeTimings().map((span) => span.label), ["ok", "bad"]);
    // And a thrown span does not leave the depth counter wrong for what follows.
    assert.equal(takeTimings().every((span) => span.depth === 0), true);
  } finally {
    enableTiming(false);
  }
});

test("a skip is a measurement, because why a step was fast is the interesting half", () => {
  enableTiming(true);
  resetTimings();
  try {
    noteTiming("database probe", 0, "skipped — unreachable 40 s ago");
    const report = describeTimings();
    assert.match(report, /database probe: 0 ms \(skipped — unreachable 40 s ago\)/);
  } finally {
    enableTiming(false);
  }
});

test("a stopwatch works across function boundaries", () => {
  enableTiming(true);
  resetTimings();
  try {
    const done = startSpan("configured dsn");
    done("db.example.supabase.co:5432");
    assert.match(describeTimings(), /configured dsn: \d+ ms \(db\.example/);
  } finally {
    enableTiming(false);
  }
  // And is a no-op when timing is off, without the caller checking.
  const done = startSpan("nothing");
  done("detail");
  assert.deepEqual(takeTimings(), []);
});

test("durations are readable at all three scales a professor sees", () => {
  assert.equal(formatMs(0), "0 ms");
  assert.equal(formatMs(180.4), "180 ms");
  assert.equal(formatMs(999), "999 ms");
  assert.equal(formatMs(1_800), "1.8 s");
  assert.equal(formatMs(2_400), "2.4 s");
  // A ten-minute time-to-live should not print as "600.0 s".
  assert.equal(formatMs(600_000), "10 min");
});
