/**
 * Solutions V2 (doc types) and Solutions V1.
 *
 *   GET    /api/solutions-v2   the catalog, from the Cosmos `solutions` container
 *                              (analyzers/out when that container is empty)
 *   PATCH  /api/solutions-v2   save draft edits of the types in the body to Cosmos
 *   POST   /api/solutions-v2   provision a type: the Function App compiles it and
 *                              writes Cosmos + the file share
 *   DELETE /api/solutions-v2   delete a type through the Function App
 *   POST   /api/solutions      V1: LLM -> a commit to GitHub (no screen uses it)
 *
 * Cosmos is the in-memory fake, the Function App and OpenAI are `fakeHttp`.
 * The local-disk fallback reads a temporary copy of analyzers/, so the
 * repository's own files are never touched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());

const { handleSolutionsV2 } = await import("../../server/solutionsV2Api.js");
const { createSolution } = await import("../../server/solutionsApi.js");
const { fakeCosmos } = await import("./fakes/cosmos.js");
const { fakeHttp, json } = await import("./fakes/http.js");
const { configureEnv, FUNCTION_URL, WITH_FUNCTION_APP } = await import("./fakes/env.js");

const REPO_ROOT = process.cwd();
const REPO_ANALYZERS = path.join(REPO_ROOT, "analyzers");
let root: string;
const at = (...parts: string[]) => path.join(root, ...parts);
const v2 = (method: string, body: unknown = {}) => handleSolutionsV2(method, body);
const solutions = () => fakeCosmos.container("solutions");

/** A row as the Function App / seed script writes it. */
const provisioned = (typeKey: string, extra: Record<string, unknown> = {}) => ({
  id: typeKey,
  typeKey,
  name: `Type ${typeKey}`,
  department: "Patient Intake",
  guidance: "original guidance",
  fields: [
    {
      name: "MemberId",
      type: "string",
      required: true,
      class: "A",
      criticality: "critical",
      validators: ["member_id_format"],
      validation_mode: "strict",
      aliases: ["Member #"],
    },
    // No `class` stored: the server must not invent one.
    { name: "Notes", type: "string", required: false },
  ],
  provisionedFields: [{ name: "MemberId" }],
  compiledAt: "2026-11-01T00:00:00Z",
  sortOrder: 3,
  compiledPromptDescription: "curated prompt text",
  version: 4,
  ...extra,
});

beforeEach(() => {
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_OWNER;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pacca-solutions-"));
  fs.cpSync(REPO_ANALYZERS, at("analyzers"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  configureEnv();
  fakeCosmos.reset();
  fakeHttp.install();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
  expect(fakeHttp.unmatched, "unexpected outbound request").toEqual([]);
});

describe("GET /api/solutions-v2", () => {
  it("lists the Cosmos rows with every stored field property and the row's etag", async () => {
    solutions().seed(provisioned("referralForm"));
    const res = await v2("GET");
    expect(res.status).toBe(200);
    const [type] = res.body.types as any[];
    expect(type).toMatchObject({ key: "referralForm", name: "Type referralForm", guidance: "original guidance" });
    expect(type.etag).toBe(solutions().get("referralForm", "referralForm")!._etag);
    expect(type.fields[0]).toMatchObject({
      name: "MemberId",
      criticality: "critical",
      validators: ["member_id_format"],
      validation_mode: "strict",
      aliases: ["Member #"],
    });
    expect(type.fields[1]).not.toHaveProperty("class");
  });

  it("falls back to analyzers/out/field_meta.json while the container is empty", async () => {
    const res = await v2("GET");
    expect(res.status).toBe(200);
    const fieldMeta = JSON.parse(fs.readFileSync(at("analyzers", "out", "field_meta.json"), "utf8"));
    const expected = Object.keys(fieldMeta).filter((k) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k));
    expect((res.body.types as any[]).map((t) => t.key)).toEqual(expected);
  });

  it("refuses other methods", async () => {
    expect((await v2("PUT")).status).toBe(405);
  });
});

describe("PATCH /api/solutions-v2", () => {
  it("needs a types array, valid keys and a fields array", async () => {
    expect((await v2("PATCH", {})).status).toBe(400);
    expect((await v2("PATCH", { types: [{ key: "1bad", fields: [] }] })).status).toBe(400);
    expect((await v2("PATCH", { types: [{ key: "ok" }] })).status).toBe(400);
    expect(solutions().calls.filter((c) => c.op === "upsert")).toEqual([]);
  });

  it("refuses a field name the Function App would reject at Save, when it is added", async () => {
    solutions().seed(provisioned("referralForm"));
    const [type] = (await v2("GET")).body.types as any[];
    const withSpace = { ...type, fields: [...type.fields, { name: "Member ID", type: "string", required: false }] };

    const res = await v2("PATCH", { types: [withSpace] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid field name 'Member ID'/);
    expect(solutions().calls.filter((c) => c.op === "upsert")).toEqual([]);
  });

  it("writes only the types in the body, and answers with the whole catalog", async () => {
    solutions().seed(provisioned("referralForm"), provisioned("priorAuth"));
    const before = solutions().get("priorAuth", "priorAuth");
    const [referral] = ((await v2("GET")).body.types as any[]).filter((t) => t.key === "referralForm");

    const res = await v2("PATCH", { types: [{ ...referral, guidance: "new guidance" }] });

    expect(res.status).toBe(200);
    expect((res.body.types as any[]).map((t) => t.key).sort()).toEqual(["priorAuth", "referralForm"]);
    const upserts = solutions().calls.filter((c) => c.op === "upsert");
    expect(upserts.map((c: any) => c.item.id)).toEqual(["referralForm"]);
    expect(solutions().get("priorAuth", "priorAuth")).toEqual(before);
    expect(solutions().get("referralForm", "referralForm")).toMatchObject({ guidance: "new guidance" });
  });

  it("round-trips a type unchanged: no metadata dropped, no class invented, compiled state kept", async () => {
    const row = provisioned("referralForm");
    solutions().seed(row);
    const [type] = (await v2("GET")).body.types as any[];

    expect((await v2("PATCH", { types: [type] })).status).toBe(200);

    const stored = solutions().get("referralForm", "referralForm")!;
    expect(stored.fields).toEqual(row.fields);
    expect(stored).toMatchObject({
      provisionedFields: row.provisionedFields,
      compiledAt: row.compiledAt,
      sortOrder: 3,
      compiledPromptDescription: "curated prompt text",
      version: 4,
    });
    expect(stored).not.toHaveProperty("etag");
  });

  it("refuses an edit made on a stale copy with 409 and keeps the newer one", async () => {
    solutions().seed(provisioned("referralForm"));
    const [mine] = (await v2("GET")).body.types as any[];
    const [theirs] = (await v2("GET")).body.types as any[];
    const added = { name: "TheirField", type: "string", required: false, class: "B" };
    expect((await v2("PATCH", { types: [{ ...theirs, fields: [...theirs.fields, added] }] })).status).toBe(200);

    const res = await v2("PATCH", { types: [{ ...mine, guidance: "my stale edit" }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/changed by someone else/);
    const stored = solutions().get("referralForm", "referralForm")!;
    expect(stored.fields.map((f: any) => f.name)).toContain("TheirField");
    expect(stored.guidance).toBe("original guidance");
  });

  it("creates a new draft type without a condition", async () => {
    solutions().seed(provisioned("referralForm"));
    const res = await v2("PATCH", { types: [{ key: "newDraft", name: "New Draft", guidance: "", fields: [] }] });
    expect(res.status).toBe(200);
    expect(solutions().get("newDraft", "newDraft")).toMatchObject({ typeKey: "newDraft", fields: [] });
    expect(solutions().get("newDraft", "newDraft")).not.toHaveProperty("compiledAt");
  });

  it("is a 503 while the solutions container is empty, though GET shows the bundled types", async () => {
    const [bundled] = (await v2("GET")).body.types as any[];
    expect(bundled).toBeDefined();

    const res = await v2("PATCH", { types: [bundled] });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/pnpm seed:solutions/);
    expect(solutions().all()).toEqual([]);
  });

  it("is a 503, not a silent save to local disk, when Cosmos is not configured", async () => {
    configureEnv({ COSMOS_KEY: "" });
    const guidancePath = at("analyzers", "out", "pacca_guidance.json");
    const before = fs.existsSync(guidancePath) ? fs.readFileSync(guidancePath, "utf8") : null;

    const res = await v2("PATCH", { types: [{ key: "referralForm", name: "R", guidance: "lost?", fields: [] }] });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(fs.existsSync(guidancePath) ? fs.readFileSync(guidancePath, "utf8") : null).toBe(before);
  });
});

describe("POST /api/solutions-v2 (provision)", () => {
  it("needs a typeKey", async () => {
    expect((await v2("POST", {})).status).toBe(400);
  });

  it("is a 404 for a type that is not in the catalog, and a 400 for a type with no fields", async () => {
    solutions().seed(provisioned("emptyDraft", { fields: [] }));
    expect((await v2("POST", { typeKey: "missing" })).status).toBe(404);
    expect((await v2("POST", { typeKey: "emptyDraft" })).status).toBe(400);
  });

  it("will not provision a bundled type while the container is empty: it would become the pipeline's only type", async () => {
    configureEnv(WITH_FUNCTION_APP);
    const [bundled] = (await v2("GET")).body.types as any[];

    const res = await v2("POST", { typeKey: bundled.key });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/pnpm seed:solutions/);
    expect(fakeHttp.to(FUNCTION_URL)).toEqual([]);
  });

  it("is a 503 without the Function App configured", async () => {
    solutions().seed(provisioned("referralForm"));
    const res = await v2("POST", { typeKey: "referralForm" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/SENDERRA_FUNCTION_URL/);
  });

  it("sends the stored fields with all their metadata, and passes on restartRequired and llmFallback", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    fakeHttp.on("POST", `${FUNCTION_URL}/api/solutions/provision`, () =>
      json({ ok: true, compiledAt: "2026-11-07T00:00:00Z", version: 5, restartRequired: true, llmFallback: true, message: "next cold start" })
    );

    const res = await v2("POST", { typeKey: "referralForm" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: 5, restartRequired: true, llmFallback: true, message: "next cold start" });
    const [call] = fakeHttp.to(`${FUNCTION_URL}/api/solutions/provision`);
    expect(call.url.searchParams.get("code")).toBe("fake-fn-key");
    expect((call.body as any).fields[0]).toMatchObject({ name: "MemberId", criticality: "critical", validators: ["member_id_format"] });
  });

  it("is a 504 that says the save may still complete when the Function App times out", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    fakeHttp.on("POST", `${FUNCTION_URL}/api/solutions/provision`, () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const res = await v2("POST", { typeKey: "referralForm" });
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/may still complete: reload in a minute/);
  });

  it("waits longer than the Function App's provisioning budget, inside Vercel's function limit", async () => {
    const { FA_TIMEOUT_MS } = await import("../../server/solutionsV2Api.js");
    const vercel = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8"));
    const maxDurationS = vercel.functions["api/**/*.ts"].maxDuration;
    // Function App worst case: 40 s LLM + 30 s lock wait + Cosmos and file work (senderra-idp-sol
    // tests/test_solutions_time_budget.py checks it fits 110 s).
    expect(FA_TIMEOUT_MS).toBeGreaterThanOrEqual(110_000);
    expect(FA_TIMEOUT_MS).toBeLessThan(maxDurationS * 1000);
  });

  it("passes on the Function App's error status and message", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    fakeHttp.on("POST", `${FUNCTION_URL}/api/solutions/provision`, () => json({ error: "compile failed" }, 500));
    const res = await v2("POST", { typeKey: "referralForm" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: "compile failed" });
  });
});

describe("DELETE /api/solutions-v2", () => {
  it("needs a typeKey", async () => {
    expect((await v2("DELETE", {})).status).toBe(400);
  });

  it("is a 503 without the Function App, and deletes nothing", async () => {
    solutions().seed(provisioned("referralForm"));
    const res = await v2("DELETE", { typeKey: "referralForm" });
    expect(res.status).toBe(503);
    expect(solutions().get("referralForm", "referralForm")).toBeDefined();
  });

  it("reports the Function App's failure instead of success, without claiming nothing was deleted", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    fakeHttp.on("DELETE", `${FUNCTION_URL}/api/solutions/delete`, () => json({ error: "file share unavailable" }, 500));

    const res = await v2("DELETE", { typeKey: "referralForm" });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    // The Function App may have removed the row before failing; the retry is idempotent.
    expect(res.body.error).toMatch(/^file share unavailable/);
    expect(res.body.error).toMatch(/try again \(that is safe\)/);
    expect(res.body.error).not.toMatch(/nothing was deleted/i);
  });

  it("is a 502 when the Function App cannot be reached", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    // No handler registered: the fake fetch fails like a dead network.
    const res = await v2("DELETE", { typeKey: "referralForm" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Function App unreachable/);
    expect(res.body.error).not.toMatch(/nothing was deleted/i);
    fakeHttp.unmatched.length = 0;
  });

  it("is a 504 that says the delete may still complete when the Function App times out", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"));
    fakeHttp.on("DELETE", `${FUNCTION_URL}/api/solutions/delete`, () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const res = await v2("DELETE", { typeKey: "referralForm" });
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/may still complete/);
  });

  it("on success answers with the catalog the Function App left, and restartRequired", async () => {
    configureEnv(WITH_FUNCTION_APP);
    solutions().seed(provisioned("referralForm"), provisioned("priorAuth"));
    fakeHttp.on("DELETE", `${FUNCTION_URL}/api/solutions/delete`, () => {
      // The Function App removes the row itself.
      const rest = solutions().all().filter((row) => row.id !== "referralForm");
      solutions().reset();
      solutions().seed(...rest);
      return json({ ok: true, restartRequired: true });
    });

    const res = await v2("DELETE", { typeKey: "referralForm" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, restartRequired: true });
    expect((res.body.types as any[]).map((t) => t.key)).toEqual(["priorAuth"]);
    const [call] = fakeHttp.to(`${FUNCTION_URL}/api/solutions/delete`);
    expect(call.url.searchParams.get("typeKey")).toBe("referralForm");
  });
});

describe("POST /api/solutions (V1)", () => {
  it("is 503 without an OpenAI key", async () => {
    const res = await createSolution({ content: "a doc type" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, error: "Chat Completions is not configured. Set OPENAI_API_KEY on the server." });
  });

  it("commits the model's output to GitHub with the configured token", async () => {
    configureEnv({
      OPENAI_API_KEY: "k",
      OPENAI_BASE_URL: "https://openai.test/v1",
      GITHUB_TOKEN: "gh-token",
      GITHUB_REPO: "Chegu-Pavanaditya-Sairam/senderra-idp-sol",
    });
    fakeHttp.on("POST", "https://openai.test/v1/chat/completions", () => json({ choices: [{ message: { content: "types: []" } }] }));
    fakeHttp.on("PUT", "https://api.github.com/repos/Chegu-Pavanaditya-Sairam/senderra-idp-sol/contents/analyzers/out", () =>
      json({ content: { html_url: "https://github.test/file" } }, 201)
    );
    const res = await createSolution({ content: "a doc type" });
    expect(res.status).toBe(201);
    const [put] = fakeHttp.to("https://api.github.com");
    expect(put.headers.authorization).toBe("Bearer gh-token");
    expect(put.body).toMatchObject({ branch: "main", content: Buffer.from("types: []").toString("base64") });
  });
});
