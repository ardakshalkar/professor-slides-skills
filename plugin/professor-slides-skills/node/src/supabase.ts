/**
 * Connecting to a Supabase course database from a network that has no IPv6.
 *
 * Ported from `ProfessorExoskeletonDHS/exo/db.py`, whose reasoning is worth
 * repeating because the symptom misleads. The DSN the Supabase dashboard hands
 * out is
 *
 *     postgresql://postgres:PW@db.<ref>.supabase.co:5432/postgres
 *
 * and `db.<ref>.supabase.co` resolves to an AAAA record and nothing else. On a
 * network without an IPv6 route — this university's, among many — that host is
 * not slow, it is unreachable, and the driver reports it as a name that cannot
 * be resolved, which reads like a typo rather than a routing problem.
 *
 * The way through is Supabase's connection pooler, which has A records:
 *
 *     postgresql://postgres.<ref>:PW@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Note the username: the pooler multiplexes every project in a region, so the
 * project ref moves out of the hostname and into the user. Getting that wrong
 * produces `Tenant or user not found`, which is also not about tenants.
 *
 * The region is not in the DSN and cannot be derived from it, so the routes are
 * tried and the one that answers is written down.
 */

import { createRequire } from "node:module";
import { resolve4 } from "node:dns/promises";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Ordered by how likely a deployment reading this is to be in one. */
const REGIONS = [
  "ap-northeast-1", "ap-southeast-1", "ap-south-1", "ap-southeast-2", "ap-northeast-2",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-north-1",
  "us-east-1", "us-west-1", "us-east-2", "sa-east-1", "ca-central-1",
] as const;

/** The pooler answers on both. 6543 is transaction pooling, which every query here is. */
const PORTS = [6543, 5432] as const;
const PREFIXES = ["aws-0", "aws-1"] as const;

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Where a probed route is remembered.
 *
 * Under the user's home, keyed by project ref — not in the course workspace and
 * not in the working directory. Three reasons, in order of how much each one
 * would annoy somebody:
 *
 *   - The workspace is usually a git checkout that belongs to someone else's
 *     project, and a tool that leaves untracked files in it is a tool people
 *     stop trusting.
 *   - What was discovered is a property of this machine's network and the
 *     project, not of the directory the command was run from, so per-directory
 *     caching would re-probe fifty-six hosts for no reason.
 *   - It is discovered state, never a curated credential, so it does not belong
 *     anywhere near the professor's `.env`.
 */
export function cachePath(ref: string | null): string {
  const home = process.env.PRES_HOME
    ?? process.env.HOME
    ?? process.env.USERPROFILE
    ?? ".";
  return join(home, ".pres", "routes", `${ref ?? "default"}`);
}

export class DatabaseUnreachable extends Error {
  readonly attempts: string[];

  constructor(message: string, attempts: string[] = []) {
    super(message);
    this.name = "DatabaseUnreachable";
    this.attempts = attempts;
  }
}

export interface Route {
  dsn: string;
  /** Host and port, no secret — this is what a failure report prints. */
  label: string;
  /** Whether this route goes through the pooler, read off the hostname. */
  pooled: boolean;
  /**
   * Whether the server's certificate chain was verified.
   *
   * False means the connection is encrypted but the certificate was not
   * checked — libpq's `sslmode=require`, and what `psycopg2` does by default,
   * which is why the Python original never had to mention it. It is mentioned
   * here: a downgrade nobody is told about is a downgrade nobody can decide
   * about.
   */
  verified?: boolean;
}

/**
 * The same route, with TLS asked for two different ways.
 *
 * `verify-full` checks the chain. `compat` is libpq's `sslmode=require` —
 * encrypted, certificate unverified — which `pg` only honours when told to use
 * libpq semantics, because its own `require` has meant `verify-full` since v8.
 */
export function withSsl(dsn: string, mode: "verify-full" | "compat"): string {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return dsn;
  }
  if (mode === "verify-full") {
    url.searchParams.delete("uselibpqcompat");
    url.searchParams.set("sslmode", "verify-full");
  } else {
    url.searchParams.set("uselibpqcompat", "true");
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

/** The first line of an error, which is the part that names the cause. */
const firstLine = (error: unknown): string =>
  String((error as Error)?.message ?? error).split(/\r?\n/)[0] ?? "";

/** Failures that mean "the chain was not trusted", not "the server said no". */
const CERTIFICATE_FAILURE = /certificate|self.signed|unable to (verify|get local issuer)|CERT_|DEPTH_ZERO/i;

/**
 * A DSN as it is safe to print: the password replaced, everything else kept.
 *
 * A failure report is the thing a professor screenshots when asking for help,
 * so it has to name the host it could not reach without carrying the password
 * to wherever the screenshot goes.
 */
export const redact = (dsn: string): string => dsn.replace(/(:\/\/[^:/@]+):[^@]*@/, "$1:***@");

/** The Supabase project ref, from either spelling of the DSN. */
export function projectRef(dsn: string): string | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    return host.slice(3, -".supabase.co".length);
  }
  const user = decodeURIComponent(url.username || "");
  if (user.startsWith("postgres.")) return user.slice("postgres.".length);
  return null;
}

function parse(dsn: string): URL | null {
  try {
    return new URL(dsn);
  } catch {
    return null;
  }
}

const labelFor = (url: URL | null): string =>
  url ? `${url.hostname || "?"}${url.port ? `:${url.port}` : ""}` : "?";

const hasIpv4 = async (host: string): Promise<boolean> => {
  try {
    return (await resolve4(host)).length > 0;
  } catch {
    return false;
  }
};

/**
 * The routes worth trying, best first.
 *
 * The given DSN always leads: if it works it is what the professor configured
 * and there is no reason to second-guess it. Pooler routes follow, and only
 * those whose hostname actually resolves — an unresolvable guess costs a ten
 * second timeout and there are fifty-six of them.
 *
 * `resolveHost` is injectable so the candidate arithmetic can be tested without
 * a network.
 */
export async function candidates(
  dsn: string,
  resolveHost: (host: string) => Promise<boolean> = hasIpv4,
): Promise<Route[]> {
  const url = parse(dsn);
  if (!url) return [{ dsn, label: "?", pooled: false }];

  const out: Route[] = [
    { dsn, label: labelFor(url), pooled: url.hostname.endsWith(".pooler.supabase.com") },
  ];

  const ref = projectRef(dsn);
  const password = url.password;
  if (!ref || !password) return out;

  const user = encodeURIComponent(`postgres.${ref}`);
  const secret = encodeURIComponent(decodeURIComponent(password));
  const database = (url.pathname || "/postgres").replace(/^\//, "") || "postgres";

  for (const prefix of PREFIXES) {
    for (const region of REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      if (!(await resolveHost(host))) continue;
      for (const port of PORTS) {
        out.push({
          dsn: `postgresql://${user}:${secret}@${host}:${port}/${database}`,
          label: `${host}:${port}`,
          pooled: true,
        });
      }
    }
  }
  return out;
}

interface QueryResult<Row> { rows: Row[] }

export interface Client {
  query<Row extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  end(): Promise<void>;
}

function loadPg(): any {
  try {
    return require("pg");
  } catch (error) {
    throw new DatabaseUnreachable(
      "The `pg` driver is not installed, so the database route cannot be tried.\n" +
      "Install it (cd node && npm install pg), or work from a YAML course instead.\n" +
      String(error),
    );
  }
}

/**
 * A live connection, or an error naming every route that was tried and why it
 * failed.
 *
 * With `probe: false` the given DSN is used exactly as given — which is what a
 * caller wants once a route has been resolved and written down, including its
 * TLS parameters.
 *
 * Certificates are verified first. If the chain is not trusted — a university
 * proxy that re-signs everything, most often — the *same* route is retried with
 * libpq's `require` semantics, and the returned route says `verified: false` so
 * the caller can pass that on. After the first such failure the strict attempt
 * is skipped for the remaining routes: the answer will not be different for the
 * fifty-fifth host, and each strict attempt costs a round trip.
 */
export async function connect(
  dsn: string,
  options: { probe?: boolean } = {},
): Promise<{ client: Client; route: Route }> {
  const { Client: PgClient } = loadPg();
  if (options.probe === false) {
    const route: Route = { dsn, label: labelFor(parse(dsn)), pooled: false };
    const client = new PgClient({ connectionString: dsn, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
    try {
      await client.connect();
      return { client, route };
    } catch (error) {
      try { await client.end(); } catch { /* never opened */ }
      throw new DatabaseUnreachable("The recorded route no longer answers.", [
        `${route.label}: ${firstLine(error)}`,
      ]);
    }
  }

  const routes = await candidates(dsn);
  const attempts: string[] = [];
  let chainIsTrusted = true;

  const open = async (candidate: string): Promise<Client> => {
    const client: Client = new PgClient({
      connectionString: candidate,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    await (client as unknown as { connect(): Promise<void> }).connect();
    return client;
  };

  for (const route of routes) {
    if (chainIsTrusted) {
      const strict = withSsl(route.dsn, "verify-full");
      try {
        return { client: await open(strict), route: { ...route, dsn: strict, verified: true } };
      } catch (error) {
        const message = firstLine(error);
        if (!CERTIFICATE_FAILURE.test(message)) {
          attempts.push(`${route.label}: ${message}`);
          continue;
        }
        chainIsTrusted = false;
      }
    }
    const compat = withSsl(route.dsn, "compat");
    try {
      return { client: await open(compat), route: { ...route, dsn: compat, verified: false } };
    } catch (error) {
      attempts.push(`${route.label}: ${firstLine(error)}`);
    }
  }
  throw new DatabaseUnreachable("Could not reach the course database on any route.", attempts);
}

/** A working route, remembered so the next command does not probe again. */
export function readCachedDsn(configuredDsn: string): string | null {
  const path = cachePath(projectRef(configuredDsn));
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  return value || null;
}

export function writeCachedDsn(configuredDsn: string, dsn: string): void {
  const path = cachePath(projectRef(configuredDsn));
  mkdirSync(dirname(path), { recursive: true });
  // The file holds a password, so it is created readable by its owner only on
  // any system that honours the mode. Windows ignores it; there the file's
  // protection is the profile directory it sits in.
  writeFileSync(path, `${dsn}\n`, { encoding: "utf8", mode: 0o600 });
}

/**
 * The whole course, as one row.
 *
 * `content.course_bundle_read_models` is the same read model the parent's MCP
 * server reads, so a course served from the database and the same course read
 * from YAML arrive in one shape and nothing downstream has to branch on where
 * it came from.
 */
export const BUNDLE_SQL = `
SELECT course_code, format_version, payload
  FROM content.course_bundle_read_models
 WHERE course_code = $1
`;

export async function fetchBundle(
  client: Client,
  courseCode: string,
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{ payload: unknown }>(BUNDLE_SQL, [courseCode]);
  const payload = result.rows[0]?.payload;
  if (payload === undefined || payload === null) return null;
  return typeof payload === "string"
    ? (JSON.parse(payload) as Record<string, unknown>)
    : (payload as Record<string, unknown>);
}

/** Every course the database can serve, for `pres source` with no `--course`. */
export async function listCourses(client: Client): Promise<string[]> {
  const result = await client.query<{ course_code: string }>(
    "SELECT course_code FROM content.course_bundle_read_models ORDER BY course_code",
  );
  return result.rows.map((row) => row.course_code);
}
