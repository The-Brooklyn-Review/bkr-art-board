/**
 * Server-only Submittable API client.
 *
 * Auth: HTTP Basic with the API key as the username and a blank password,
 * i.e. `Authorization: Basic base64("<apiKey>:")`. The public docs word this
 * ambiguously ("Basic {apiKey}"), so `verifyAuth()` exists to confirm the
 * encoding against the live API before we trust it.
 *
 * Never import this into a client component — it reads the API key from the
 * environment and must stay server-side. (In Next.js, only import from server
 * components, route handlers, or standalone scripts.)
 */

const BASE_URL =
  process.env.SUBMITTABLE_API_BASE_URL ?? "https://submittable-api.submittable.com";

function getApiKey(): string {
  const key = process.env.SUBMITTABLE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing SUBMITTABLE_API_KEY. Set it in .env.local (and load it before running scripts).",
    );
  }
  return key;
}

/**
 * Build the Authorization header. The docs are ambiguous about the exact
 * encoding, so the format is selectable via SUBMITTABLE_AUTH_FORMAT and the
 * dry-run probes which one the live API accepts:
 *   - "standard" (default): Basic base64("<apiKey>:")  ← key as username, blank pw
 *   - "nocolon":            Basic base64("<apiKey>")
 *   - "raw":                Basic <apiKey>
 */
function getAuthHeader(): string {
  const key = getApiKey();
  const format = process.env.SUBMITTABLE_AUTH_FORMAT ?? "standard";
  switch (format) {
    case "bearer":
      return `Bearer ${key}`;
    case "raw":
      return `Basic ${key}`;
    case "nocolon":
      return `Basic ${Buffer.from(key).toString("base64")}`;
    case "standard":
    default:
      return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  }
}

export class SubmittableError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`Submittable API ${status} on ${path}: ${body.slice(0, 500)}`);
    this.name = "SubmittableError";
  }
}

/**
 * Low-level fetch wrapper. Throws SubmittableError on non-2xx (fail loud).
 * Returns parsed JSON, or null for 204.
 */
export async function submittableFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SubmittableError(res.status, path, body);
  }

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/** A page response using continuation-token pagination. */
export interface ContinuationPage<T> {
  continuationToken: string | null;
  items: T[] | null;
}

/**
 * Fetch every page of a continuation-token endpoint and return the flattened
 * items. `basePath` should include a `size` query param. On the first request
 * we send the full query; subsequent requests send ONLY the continuation token
 * (per the v4 docs — filters are fixed on the first request).
 */
export async function fetchAllPages<T>(
  basePath: string,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 100;
  const all: T[] = [];
  let token: string | null = null;
  let pages = 0;

  do {
    const sep = basePath.includes("?") ? "&" : "?";
    const path =
      token === null
        ? basePath
        : `${basePath.split("?")[0]}${sep}continuationToken=${encodeURIComponent(token)}`;

    const page: ContinuationPage<T> = await submittableFetch<ContinuationPage<T>>(path);
    if (page.items) all.push(...page.items);
    token = page.continuationToken ?? null;
    pages += 1;
    if (pages >= maxPages) {
      console.warn(`[submittable] hit maxPages=${maxPages} on ${basePath}; stopping pagination.`);
      break;
    }
  } while (token);

  return all;
}

/**
 * Confirm the auth encoding works against the live API by hitting a cheap
 * authenticated endpoint. Returns the org info on success; throws on failure.
 */
export async function verifyAuth(): Promise<unknown> {
  return submittableFetch<unknown>("/v4/organizations");
}

export { BASE_URL };
