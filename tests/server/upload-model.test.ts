import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleSenderra } = await import("../../server/senderra/api.js");
const { STAFF, contextFrom, sessionCookie, signSession } = await import("../../server/auth.js");

const SECRET = "u".repeat(40);
const staff = contextFrom({
  cookie: sessionCookie(signSession({ email: "pacca.staff@emids.com", name: "S", role: STAFF }, SECRET)).split(";")[0],
});

const catalog = {
  default: "gpt-5.4-mini",
  active: { model: "gpt-5.4-mini" },
  phi_run_ids: ["prod", "ui"],
  require_phi_approved: true,
  models: [
    { id: "gpt-5.4-mini", selectable: true, phi_approved: true },
    { id: "gpt-5.6-luna", selectable: true, phi_approved: true },
    { id: "kimi-k2.6", selectable: false, phi_approved: false },
    { id: "preview-x", selectable: true, phi_approved: false },
  ],
};
let faCalls = 0;

beforeEach(() => {
  faCalls = 0;
  for (const [k, v] of Object.entries({
    PACCA_JWT_SECRET: SECRET,
    COSMOS_ENDPOINT: "https://c.documents.azure.com:443/",
    COSMOS_KEY: "k",
    AZURE_STORAGE_ACCOUNT: "acct",
    AZURE_STORAGE_KEY: Buffer.from("storage-key").toString("base64"),
    SENDERRA_FUNCTION_URL: "https://func.example.net",
    SENDERRA_FUNCTION_KEY: "fn-key",
  })) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async () => {
    faCalls += 1;
    return new Response(JSON.stringify(catalog), { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const upload = (body: Record<string, unknown>) =>
  handleSenderra("POST", "/upload-sas", new URLSearchParams(), { files: [{ name: "a.pdf" }], ...body }, staff);

describe("per-upload model", () => {
  it("no model: no metadata and no Function App call", async () => {
    const res = await upload({});
    expect(res.status).toBe(200);
    expect((res.body as any).grants[0].metadata).toBeUndefined();
    expect(faCalls).toBe(0);
  });

  it("an allowed model is attached as blob metadata", async () => {
    const res = await upload({ model: "gpt-5.6-luna" });
    expect(res.status).toBe(200);
    expect((res.body as any).grants[0].metadata).toEqual({ llm_model: "gpt-5.6-luna" });
    expect((res.body as any).model).toBe("gpt-5.6-luna");
  });

  it.each([
    ["kimi-k2.6", 422],      // not selectable
    ["preview-x", 422],      // not PHI-approved, and ui/ is a PHI run
    ["gpt-9", 422],          // not listed
    ["../etc", 400],         // not an id
  ])("%s is refused (%i)", async (model, status) => {
    expect((await upload({ model })).status).toBe(status);
  });

  it("a non-PHI run may use a non-PHI-approved model", async () => {
    expect((await upload({ model: "preview-x", runId: "r010-bench" })).status).toBe(200);
  });
});
