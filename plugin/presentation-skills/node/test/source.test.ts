/**
 * Finding the course, and saying which of the three places answered.
 *
 * The pooler arithmetic is tested without a network, because the bug it exists
 * to prevent is a wrong username rather than a wrong route: the pooler
 * multiplexes a whole region, so the project ref has to move out of the
 * hostname and into the user, and getting that wrong produces an error message
 * about tenants that sends people looking in the wrong place entirely.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cachePath, candidates, projectRef, readCachedDsn, redact, withSsl, writeCachedDsn } from "../src/supabase.ts";
import { parseEnvFile } from "../src/env.ts";
import { expand, readCourseDirectory } from "../src/yaml-source.ts";
import { fromBundle, fromFlatFile, type Provenance } from "../src/model.ts";

const DASHBOARD = "postgresql://postgres:s3cr%2Fet@db.abcdefghij.supabase.co:5432/postgres";

const PROVENANCE: Provenance = { origin: "flat-file", detail: "test", attempted: [], read_at: "" };

test("the project ref is read from either spelling of the DSN", () => {
  assert.equal(projectRef(DASHBOARD), "abcdefghij");
  assert.equal(
    projectRef("postgresql://postgres.abcdefghij:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"),
    "abcdefghij",
  );
  assert.equal(projectRef("postgresql://someone:pw@example.org/db"), null);
});

test("a DSN prints without its password", () => {
  assert.equal(
    redact(DASHBOARD),
    "postgresql://postgres:***@db.abcdefghij.supabase.co:5432/postgres",
  );
});

test("pooler candidates move the ref into the username and keep the password intact", async () => {
  const routes = await candidates(DASHBOARD, async (host) => host === "aws-0-eu-west-1.pooler.supabase.com");
  // The configured DSN leads, then the one resolvable host on both ports.
  assert.equal(routes.length, 3);
  assert.equal(routes[0]!.dsn, DASHBOARD);
  assert.equal(routes[0]!.pooled, false);
  assert.deepEqual(routes.slice(1).map((route) => route.label), [
    "aws-0-eu-west-1.pooler.supabase.com:6543",
    "aws-0-eu-west-1.pooler.supabase.com:5432",
  ]);
  const url = new URL(routes[1]!.dsn);
  assert.equal(decodeURIComponent(url.username), "postgres.abcdefghij");
  assert.equal(decodeURIComponent(url.password), "s3cr/et");
  assert.equal(routes[1]!.pooled, true);
});

test("a host with no A record is never tried", async () => {
  const routes = await candidates(DASHBOARD, async () => false);
  assert.equal(routes.length, 1);
});

test("TLS is asked for two different ways, and they are distinguishable", () => {
  const strict = new URL(withSsl("postgresql://u:p@h:6543/postgres", "verify-full"));
  assert.equal(strict.searchParams.get("sslmode"), "verify-full");
  assert.equal(strict.searchParams.get("uselibpqcompat"), null);

  const compat = new URL(withSsl(strict.toString(), "compat"));
  assert.equal(compat.searchParams.get("sslmode"), "require");
  assert.equal(compat.searchParams.get("uselibpqcompat"), "true");
});

test("a probed route is cached under the home directory, keyed by project, never in a workspace", () => {
  const home = mkdtempSync(join(tmpdir(), "pres-home-"));
  const previous = process.env.PRES_HOME;
  process.env.PRES_HOME = home;
  try {
    const pooler = "postgresql://postgres.abcdefghij:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
    assert.equal(readCachedDsn(DASHBOARD), null);
    writeCachedDsn(DASHBOARD, pooler);
    assert.equal(readCachedDsn(DASHBOARD), pooler);
    // Keyed by project ref, so the dashboard DSN and the pooler DSN for the
    // same project find the same cached route.
    assert.equal(readCachedDsn(pooler), pooler);
    // A different project does not read another project's route.
    assert.equal(readCachedDsn("postgresql://postgres:pw@db.zzzzzzzzzz.supabase.co:5432/postgres"), null);
    assert.equal(cachePath("abcdefghij"), join(home, ".pres", "routes", "abcdefghij"));
  } finally {
    if (previous === undefined) delete process.env.PRES_HOME;
    else process.env.PRES_HOME = previous;
  }
});

test("a .env is read as plain key=value, quotes and export and BOM allowed", () => {
  const directory = mkdtempSync(join(tmpdir(), "pres-env-"));
  const path = join(directory, ".env");
  writeFileSync(path, '﻿# a comment\nexport SUPABASE_URL="postgresql://a:b@c/d"\nEMPTY=\nAINAR_USER=USER-ARD-A01\n');
  const parsed = parseEnvFile(path);
  assert.equal(parsed.SUPABASE_URL, "postgresql://a:b@c/d");
  assert.equal(parsed.AINAR_USER, "USER-ARD-A01");
  assert.equal(parsed.EMPTY, "");
});

test("a course directory is read into a bundle, and the run's records are kept", () => {
  const root = mkdtempSync(join(tmpdir(), "pres-course-"));
  writeFileSync(join(root, "course.yaml"), "course_id: TEST-101\ntitle: A Course\n");
  writeFileSync(
    join(root, "outcomes.yaml"),
    "outcomes:\n  - outcome_id: LO-01\n    title: Do a thing\n    concepts: [CONCEPT-A]\n",
  );
  mkdirSync(join(root, "concepts"));
  writeFileSync(
    join(root, "concepts", "approved.yaml"),
    "concepts:\n  - concept_id: CONCEPT-A\n    title: A\n    prerequisites: []\n",
  );
  mkdirSync(join(root, "versions", "2026-FALL"), { recursive: true });
  writeFileSync(
    join(root, "versions", "2026-FALL", "version.yaml"),
    "course_version_id: TEST-101-2026-FALL\nterm: 2026-FALL\nstart_date: 2026-09-01\n",
  );
  writeFileSync(
    join(root, "versions", "2026-FALL", "resources.yaml"),
    "resources:\n  - resource_id: RES-1\n    title: A book\n    kind: textbook_chapter\n    concepts: [CONCEPT-A]\n",
  );

  assert.equal(expand(root, "concepts/*.yaml").length, 1);
  const { bundle, files } = readCourseDirectory(root);
  assert.ok(files.length >= 5);

  const source = fromBundle(bundle, PROVENANCE);
  assert.equal(source.course.course_id, "TEST-101");
  assert.equal(source.outcomes.length, 1);
  assert.equal(source.concepts.length, 1);
  assert.equal(source.version?.course_version_id, "TEST-101-2026-FALL");
  assert.equal(source.references[0]?.kind, "textbook_chapter");
});

test("the flat shape reads topics as modules and references as resources", () => {
  const source = fromFlatFile(
    {
      course: { course_id: "WS-1", title: "A workshop", audience: "practitioners" },
      outcomes: [{ outcome_id: "LO-01", title: "Do a thing" }],
      topics: [{ module_id: "MODULE-01", title: "Opening", concepts: [], outcomes: ["LO-01"] }],
      references: [{ resource_id: "RES-1", title: "The book", kind: "textbook_chapter", locator: "ch. 4" }],
    },
    PROVENANCE,
  );
  assert.equal(source.course.audience, "practitioners");
  assert.equal(source.modules[0]?.module_id, "MODULE-01");
  assert.equal(source.references[0]?.locator, "ch. 4");
});

test("prerequisite edges stated separately are folded onto the concepts", () => {
  const source = fromBundle(
    {
      course: { course_id: "C", title: "C" },
      concepts: [
        { concept_id: "CONCEPT-A", title: "A", prerequisites: [] },
        { concept_id: "CONCEPT-B", title: "B" },
      ],
      concept_edges: [
        { source_concept_id: "CONCEPT-A", target_concept_id: "CONCEPT-B", relationship_type: "prerequisite" },
      ],
    },
    PROVENANCE,
  );
  const b = source.concepts.find((concept) => concept.concept_id === "CONCEPT-B");
  assert.deepEqual(b?.prerequisites, ["CONCEPT-A"]);
});
