/**
 * A `fetch` that answers from handlers registered by the test: the IVR
 * backend, the Function App, Azure OpenAI. Install it in `beforeEach` with
 * `fakeHttp.install()`; it is removed by `vi.unstubAllGlobals()`.
 *
 * A request no handler matches fails like a dead network (a TypeError, as
 * undici throws) and is recorded in `unmatched`, so a test can assert that the
 * code did not call anything unexpected. The no-network guard is the backstop.
 */
import { vi } from "vitest";

export type FakeRequest = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
};

type Handler = (req: FakeRequest) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => (out[key] = value));
  return out;
}

class FakeHttp {
  private routes: { method: string; match: (url: URL) => boolean; handler: Handler }[] = [];
  readonly requests: FakeRequest[] = [];
  readonly unmatched: string[] = [];

  /** `match` is a URL prefix (scheme + host + path, no query) or a predicate. */
  on(method: string, match: string | ((url: URL) => boolean), handler: Handler) {
    const test =
      typeof match === "string" ? (url: URL) => `${url.origin}${url.pathname}`.startsWith(match) : match;
    this.routes.unshift({ method: method.toUpperCase(), match: test, handler });
    return this;
  }

  /** Requests to a URL prefix, in order. */
  to(prefix: string): FakeRequest[] {
    return this.requests.filter((r) => `${r.url.origin}${r.url.pathname}`.startsWith(prefix));
  }

  reset() {
    this.routes = [];
    this.requests.length = 0;
    this.unmatched.length = 0;
  }

  install() {
    this.reset();
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown = init?.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          // keep the raw string
        }
      }
      const req: FakeRequest = { method, url, headers: headersOf(init), body };
      this.requests.push(req);
      const route = this.routes.find((r) => r.method === method && r.match(url));
      if (!route) {
        this.unmatched.push(`${method} ${url.origin}${url.pathname}`);
        throw new TypeError(`fetch failed (fake http: no handler for ${method} ${url.origin}${url.pathname})`);
      }
      return route.handler(req);
    });
    return this;
  }
}

export const fakeHttp = new FakeHttp();
