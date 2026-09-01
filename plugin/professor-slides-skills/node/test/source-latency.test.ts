/**
 * Finding the course without waiting for a database that is not there.
 *
 * The provenance rules are tested in `source.test.ts`. What is tested here is
 * the arithmetic that decides how long a professor waits for them, because that
 * arithmetic is where this plugin was worst: twenty-eight serialised DNS
 * lookups, a ten-second deadline per route, fifty-seven routes, and nothing
 * remembering any of it between commands.
 *
 * The invariant that must survive all of the speed work is the one the whole
 * layer exists for: **a source that was skipped is recorded as skipped.** A
 * fast wrong answer is worse than a slow right one, and the way this fails is
 * silently — a deck built from a course directory last pulled in March, while
 * the professor believed they were on the shared database, looks exactly like a
 * correct deck.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  cachePath,
  candidates,
  failureTtl,
  forgetRoute,
  readCachedDsn,
  readRouteRecord,
  recordUnreachable,
  unreachableRecently,
  writeCachedDsn,
} from "../src/supabase.ts";
import { originsFor, resolveCourse } from "../src/source.ts";

const DASHBOARD = "postgresql://postgres:s3cr%2Fet@db.abcdefghij.supabase.co:5432/postgres";

/**
 * Run a body with PRES_HOME and friends pointed somewhere disposable.
 *
 * `await`ing the body matters and is easy to get wrong: a synchronous
 * `try/finally` around a call that returns a promise restores the environment
 * the instant the promise is *created*, so everything the body actually does
 * runs against the real environment — writing route caches into the developer's
 * home directory and passing for the wrong reason.
 */
async function withEnvironment<T>(
  vars: Record<string, string | undefined>,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await body();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const home = (): string => mkdtempSync(join(tmpdir(), "pres-home-"));

test("hostnames are resolved together, not one after another", async () => {
  // The bug this pins: twenty-eight independent DNS lookups awaited in a loop.
  // Each resolution here sleeps, so serial execution would take the sum.
  let peak = 0;
  let live = 0;
  const routes = await candidates(DASHBOARD, async () => {
    live += 1;
    peak = Math.max(peak, live);
    await new Promise((done) => setTimeout(done, 5));
    live -= 1;
    return true;
  });
  assert.ok(peak > 1, `resolutions ran ${peak} at a time, which is one at a time`);
  // 28 hosts × 2 ports, plus the configured DSN.
  assert.equal(routes.length, 57);
});

test("a pinned region turns the search into one attempt", async () => {
  await withEnvironment({ PRES_SUPABASE_REGION: "eu-central-1" }, async () => {
    const routes = await candidates(DASHBOARD, async () => true);
    // Two prefixes in one region, on two ports, plus the configured DSN.
    assert.equal(routes.length, 5);
    for (const route of routes.slice(1)) assert.match(route.label, /eu-central-1/);
  });
});

test("a working route is remembered, and a failure is remembered separately", async () => {
  await withEnvironment({ PRES_HOME: home(), PRES_DB_FAIL_TTL_MS: undefined }, () => {
    const pooler = "postgresql://postgres.abcdefghij:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
    assert.equal(readCachedDsn(DASHBOARD), null);
    assert.equal(unreachableRecently(DASHBOARD), null);

    writeCachedDsn(DASHBOARD, pooler);
    assert.equal(readCachedDsn(DASHBOARD), pooler);
    assert.ok(readRouteRecord(DASHBOARD)?.ok_at, "a remembered route says when it worked");
    assert.equal(unreachableRecently(DASHBOARD), null);

    recordUnreachable(DASHBOARD, "Could not reach the course database on any route.\nand details");
    const failed = unreachableRecently(DASHBOARD);
    assert.ok(failed, "the failure is remembered");
    assert.match(failed!.why, /Could not reach/);
    assert.ok(!/details/.test(failed!.why), "only the first line, which is the cause");
    assert.ok(failed!.ageMs >= 0 && failed!.ageMs < 5_000);
    // The route that stopped answering is dropped rather than retried forever on
    // the strength of having worked once.
    assert.equal(readCachedDsn(DASHBOARD), null);

    forgetRoute(DASHBOARD);
    assert.equal(unreachableRecently(DASHBOARD), null);
    assert.equal(readRouteRecord(DASHBOARD), null);
  });
});

test("a remembered failure expires", async () => {
  await withEnvironment({ PRES_HOME: home() }, () => {
    recordUnreachable(DASHBOARD, "nothing answered");
    assert.ok(unreachableRecently(DASHBOARD, 60_000));
    // A zero-length window is the boundary: a failure recorded a moment ago is
    // already older than it.
    assert.equal(unreachableRecently(DASHBOARD, -1), null);
  });
});

test("the time-to-live is configurable, because a lecture is not a data centre", async () => {
  await withEnvironment({ PRES_DB_FAIL_TTL_MS: "1234" }, () => {
    assert.equal(failureTtl(), 1234);
  });
  await withEnvironment({ PRES_DB_FAIL_TTL_MS: "nonsense" }, () => {
    assert.equal(failureTtl(), 600_000);
  });
});

test("a cache file written by the previous version is still read", async () => {
  await withEnvironment({ PRES_HOME: home() }, () => {
    // Before the record was JSON it held a bare DSN. A professor who upgrades
    // should not pay to rediscover a route they already have.
    const pooler = "postgresql://postgres.abcdefghij:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
    const path = cachePath("abcdefghij");
    writeCachedDsn(DASHBOARD, pooler);
    writeFileSync(path, `${pooler}\n`);
    assert.equal(readCachedDsn(DASHBOARD), pooler);
  });
});

test("the cache file holds no plaintext beyond the DSN it was given", async () => {
  await withEnvironment({ PRES_HOME: home() }, () => {
    recordUnreachable(DASHBOARD, "nothing answered");
    const text = readFileSync(cachePath("abcdefghij"), "utf8");
    assert.ok(!text.includes("s3cr"), "a failure record has no reason to carry a password");
  });
});

test("a source preference decides which origins are in play at all", () => {
  assert.deepEqual(originsFor("auto"), ["supabase", "course-directory", "flat-file"]);
  assert.deepEqual(originsFor("database"), ["supabase"]);
  assert.deepEqual(originsFor("local"), ["course-directory", "flat-file"]);
  assert.deepEqual(originsFor(), ["supabase", "course-directory", "flat-file"]);
});

/** A directory holding a flat `course.yaml`, which is the cheapest real course. */
function flatCourse(): string {
  const dir = mkdtempSync(join(tmpdir(), "pres-flat-"));
  writeFileSync(
    join(dir, "course.yaml"),
    [
      "course:",
      "  course_id: WS-1",
      "  title: A workshop",
      "outcomes:",
      "  - outcome_id: LO-01",
      "    title: Do a thing",
      "topics:",
      "  - module_id: MODULE-01",
      "    title: Opening",
      "    concepts: []",
      "    outcomes: [LO-01]",
    ].join("\n"),
  );
  return dir;
}

test("--source local never touches the network, and says the database was skipped", async () => {
  const cwd = flatCourse();
  await withEnvironment(
    {
      PRES_HOME: home(),
      PRES_COURSE_URL: "postgresql://postgres:pw@db.zzzzzzzzzz.supabase.co:5432/postgres",
      PRES_WORKSPACE: undefined,
      AINAR_WORKSPACE: undefined,
    },
    async () => {
      const started = performance.now();
      const { source } = await resolveCourse({ course: "WS-1", source: "local", cwd });
      const elapsed = performance.now() - started;

      assert.equal(source.provenance.origin, "flat-file");
      assert.ok(elapsed < 1_000, `local resolution took ${Math.round(elapsed)} ms`);
      const skipped = source.provenance.attempted.find((entry) => entry.origin === "supabase");
      assert.ok(skipped, "a skipped database is on the record");
      assert.match(skipped!.why, /not tried/);
      assert.match(skipped!.why, /--source local/);
    },
  );
});

test("a remembered failure makes the next command instant, and it says why", async () => {
  const cwd = flatCourse();
  await withEnvironment(
    {
      PRES_HOME: home(),
      PRES_COURSE_URL: "postgresql://postgres:pw@db.zzzzzzzzzz.supabase.co:5432/postgres",
      PRES_WORKSPACE: undefined,
      AINAR_WORKSPACE: undefined,
    },
    async () => {
      recordUnreachable(process.env.PRES_COURSE_URL!, "Could not reach the course database on any route.");
      const started = performance.now();
      const { source } = await resolveCourse({ course: "WS-1", cwd });
      const elapsed = performance.now() - started;

      assert.equal(source.provenance.origin, "flat-file");
      assert.ok(elapsed < 1_000, `a remembered failure still cost ${Math.round(elapsed)} ms`);
      const skipped = source.provenance.attempted.find((entry) => entry.origin === "supabase");
      assert.match(skipped!.why, /skipped/);
      assert.match(skipped!.why, /ago/, "the age is in the report, so the reader knows it expires");
      assert.match(skipped!.why, /--source database/, "and how to retry now");
    },
  );
});

test("--source database refuses to fall back, and retries a remembered failure", async () => {
  const cwd = flatCourse();
  await withEnvironment(
    {
      PRES_HOME: home(),
      PRES_COURSE_URL: "postgresql://postgres:pw@db.zzzzzzzzzz.supabase.co:5432/postgres",
      PRES_WORKSPACE: undefined,
      AINAR_WORKSPACE: undefined,
      // Keep the probe short: this test is about the refusal, not the waiting.
      PRES_SUPABASE_REGION: "eu-central-1",
      PRES_CONNECT_TIMEOUT_MS: "300",
      PRES_DB_BUDGET_MS: "900",
    },
    async () => {
      recordUnreachable(process.env.PRES_COURSE_URL!, "Could not reach the course database on any route.");
      await assert.rejects(
        () => resolveCourse({ course: "WS-1", source: "database", cwd }),
        (error: Error) => {
          // The flat course sitting right there was not used, and the message
          // says why refusing is the right answer.
          assert.match(error.message, /--source database was asked for/);
          assert.match(error.message, /looks exactly like a correct one/);
          return true;
        },
      );
      // And it did retry rather than trusting the remembered failure: the record
      // was rewritten by this attempt.
      const record = readRouteRecord(process.env.PRES_COURSE_URL!);
      assert.ok(record?.failed_at, "the retry happened and was recorded");
    },
  );
});

test("the probe is bounded by a budget rather than by a multiplication", async () => {
  const cwd = flatCourse();
  await withEnvironment(
    {
      PRES_HOME: home(),
      PRES_COURSE_URL: "postgresql://postgres:pw@db.zzzzzzzzzz.supabase.co:5432/postgres",
      PRES_WORKSPACE: undefined,
      AINAR_WORKSPACE: undefined,
      PRES_CONNECT_TIMEOUT_MS: "250",
      PRES_DB_BUDGET_MS: "1500",
    },
    async () => {
      const started = performance.now();
      const { source } = await resolveCourse({ course: "WS-1", cwd });
      const elapsed = performance.now() - started;
      assert.equal(source.provenance.origin, "flat-file");
      // Fifty-seven routes at the old ten seconds each was minutes. The budget
      // plus a little slack for DNS is the ceiling now.
      assert.ok(elapsed < 12_000, `the bounded probe took ${Math.round(elapsed)} ms`);
    },
  );
});
