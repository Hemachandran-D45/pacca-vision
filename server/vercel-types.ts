/**
 * Minimal structural types for a Vercel Node function.
 *
 * Deliberately hand-written instead of importing `@vercel/node`. A project-level
 * `@vercel/node` dependency PINS the platform's builder to that version, and a
 * disagreement between the pinned version and the platform is one of the few
 * things that can stop a function booting at all. We only ever needed the two
 * type names, so we declare them and let Vercel use its own builder.
 *
 * These are structural subsets of what the runtime actually passes (Node's
 * IncomingMessage / ServerResponse plus Vercel's additions), covering only what
 * the handlers touch.
 */
export type VercelRequest = {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
};

export type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
  setHeader(name: string, value: string | string[]): VercelResponse;
  end(): VercelResponse;
};
