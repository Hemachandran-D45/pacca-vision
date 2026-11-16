/**
 * The whole app in a test: the real React client, talking to the real server
 * dispatcher (`handleSenderra`) over a fake `fetch`, on the in-memory Cosmos
 * and blob fakes. Sign-in, cookies, roles, polling and uploads all run the
 * production code paths; only the network edge is fake, and the no-network
 * guard still applies.
 *
 *   const app = await startApp();          // signed out, at /
 *   await app.signIn(STAFF);               // through the real sign-in form
 *   app.pipeline.ocr("ui/x"); await app.nextPoll();
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import "./dom-polyfills.js";

vi.mock("@azure/cosmos", async () => (await import("../server/fakes/cosmos.js")).fakeCosmosModule());
vi.mock("@azure/storage-blob", async (orig) => ({
  ...(await orig<object>()),
  ...(await import("../server/fakes/blob.js")).fakeBlobModule(),
}));

const { default: App } = await import("@/App");
const { handleSenderra } = await import("../../server/senderra/api.js");
const { contextFrom, hashPassword } = await import("../../server/auth.js");
const { fakeCosmos } = await import("../server/fakes/cosmos.js");
const { fakeBlobs } = await import("../server/fakes/blob.js");
const { ADMIN, DEVELOPER, EMAIL, STAFF, configureEnv } = await import("../server/fakes/env.js");
const corpus = await import("../server/fakes/corpus.js");

export { ADMIN, DEVELOPER, EMAIL, STAFF };
export const PASSWORD = "correct-horse-battery";
/** The Documents page polls every 6 s (`usePolled(..., 6000)`). */
export const POLL_MS = 6000;

let passwordHash: Promise<string> | null = null;

/** Every request the browser made, as "GET /documents?needsReview=true" or "PUT blob ui/x.pdf". */
export const requests: string[] = [];

function installBackend() {
  const jar = new Map<string, string>();
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init.method ?? "GET").toUpperCase();

    if (url.origin === window.location.origin && url.pathname.startsWith("/api/senderra")) {
      const route = url.pathname.replace(/^\/api\/senderra/, "") || "/";
      requests.push(`${method} ${route}${url.search}`);
      const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const result = await handleSenderra(method, route, url.searchParams, body, contextFrom({ cookie }));
      const setCookie = result.headers?.["Set-Cookie"];
      if (setCookie) {
        const [pair, ...attrs] = setCookie.split(";");
        const [name, value] = pair.split("=");
        if (attrs.some((a) => /max-age=0/i.test(a.trim())) || !value) jar.delete(name.trim());
        else jar.set(name.trim(), value);
      }
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
    }

    // The browser's direct PUT to the SAS URL: what starts the pipeline.
    if (url.hostname === "fakeacct.blob.core.windows.net" && method === "PUT") {
      const [, container, ...blob] = url.pathname.split("/");
      const name = blob.map(decodeURIComponent).join("/");
      requests.push(`PUT blob ${name}`);
      const size = init.body instanceof Blob ? init.body.size : 0;
      fakeBlobs.add(container, name, { size, createdOn: new Date().toISOString() });
      return new Response(null, { status: 201 });
    }

    throw new TypeError(`fetch failed (client harness: no route for ${method} ${url.href})`);
  });
}

async function seedUsers() {
  passwordHash ??= hashPassword(PASSWORD);
  const hash = await passwordHash;
  const users = fakeCosmos.container("users");
  for (const role of [STAFF, DEVELOPER, ADMIN]) {
    const email = EMAIL[role];
    users.seed({ id: email, username: email, name: role, role, passwordHash: hash });
  }
}

/** What the Function App would write, so a test can move a document along. */
const pipeline = {
  ocr: (id: string, extra = {}) => fakeCosmos.container("documents").seed(corpus.ocr(id, { recorded_at: new Date().toISOString(), ...extra })),
  extract: (id: string, extra = {}) =>
    fakeCosmos.container("documents").seed(
      corpus.extract(id, { recorded_at: new Date().toISOString(), ...extra }),
      corpus.fields(id)
    ),
};

export async function startApp(options: { path?: string; seed?: Record<string, any>[] } = {}) {
  cleanup();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-10-08T12:00:00Z") });
  configureEnv();
  fakeCosmos.reset();
  fakeBlobs.reset();
  requests.length = 0;
  window.localStorage.clear();
  await seedUsers();
  fakeCosmos.container("documents").seed(...(options.seed ?? corpus.corpus()));
  installBackend();
  window.history.replaceState(null, "", options.path ?? "/");

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App />);

  return {
    user,
    pipeline,
    docs: () => fakeCosmos.container("documents"),
    blobs: fakeBlobs,

    /** Sign in through the real form, as that role's demo account. */
    async signIn(role: typeof STAFF, password = PASSWORD) {
      await user.type(await screen.findByLabelText("Email"), EMAIL[role]);
      await user.type(screen.getByLabelText("Password"), password);
      await user.click(screen.getByRole("button", { name: /continue to workspace/i }));
    },

    /** Let one poll interval pass, and the requests it starts settle. */
    async nextPoll() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
    },
  };
}

export async function stopApp() {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
}
