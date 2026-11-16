import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());
vi.mock("@azure/storage-blob", async (orig) => ({
  ...(await orig<object>()),
  ...(await import("./fakes/blob.js")).fakeBlobModule(),
}));

const { fakeCosmos } = await import("./fakes/cosmos.js");
const { handleSenderra } = await import("../../server/senderra/api.js");
const { ADMIN, DEVELOPER, STAFF, contextFrom, sessionCookie, signSession } = await import("../../server/auth.js");
const { configureEnv, SECRET } = await import("./fakes/env.js");
const { corpus } = await import("./fakes/corpus.js");

const staffCtx = () =>
  contextFrom({ cookie: sessionCookie(signSession({ email: "staff@emids.com", name: "Staff", role: STAFF }, SECRET)).split(";")[0] });
const devCtx = () =>
  contextFrom({ cookie: sessionCookie(signSession({ email: "dev@emids.com", name: "Dev", role: DEVELOPER }, SECRET)).split(";")[0] });
const adminCtx = () =>
  contextFrom({ cookie: sessionCookie(signSession({ email: "admin@emids.com", name: "Admin", role: ADMIN }, SECRET)).split(";")[0] });

function call(method: string, route: string, ctx: any, query = new URLSearchParams(), body: Record<string, unknown> = {}) {
  return handleSenderra(method, route, query, body, ctx);
}

beforeEach(() => {
  configureEnv();
  fakeCosmos.reset();
  fakeCosmos.container("documents").seed(...corpus());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("V2 Multi-Tenant Management", () => {
  it("GET /tenants: Developer and Admin can list tenants", async () => {
    const resDev = await call("GET", "/tenants", devCtx());
    expect(resDev.status).toBe(200);
    const bodyDev = resDev.body as any;
    expect(bodyDev.ok).toBe(true);
    expect(bodyDev.tenants.length).toBeGreaterThanOrEqual(3);
    expect(bodyDev.tenants.some((t: any) => t.id === "tenant-default")).toBe(true);

    const resStaff = await call("GET", "/tenants", staffCtx());
    expect(resStaff.status).toBe(403);
  });

  it("POST /tenants: Admin can register a new tenant", async () => {
    const resDev = await call("POST", "/tenants", devCtx(), new URLSearchParams(), {
      id: "tenant-cigna",
      name: "Cigna Commercial",
    });
    expect(resDev.status).toBe(403);

    const resAdmin = await call("POST", "/tenants", adminCtx(), new URLSearchParams(), {
      id: "tenant-cigna",
      name: "Cigna Commercial",
      tier: "enterprise",
    });
    expect(resAdmin.status).toBe(201);
    const body = resAdmin.body as any;
    expect(body.ok).toBe(true);
    expect(body.tenant.id).toBe("tenant-cigna");
    expect(body.tenant.name).toBe("Cigna Commercial");
  });
});

describe("V2 Multi-Document Transactions", () => {
  it("GET /transactions: lists synthesized and created packets", async () => {
    const res = await call("GET", "/transactions", staffCtx());
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.transactions.length).toBeGreaterThanOrEqual(1);
    const first = body.transactions[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("caseNumber");
    expect(first).toHaveProperty("channel");
    expect(first).toHaveProperty("status");
    expect(first).toHaveProperty("slaDueAt");
    expect(first).toHaveProperty("riskScore");
  });

  it("POST /transactions: ingests a new multi-document packet", async () => {
    const payload = {
      title: "Humana Oncology Prior Auth Bundle",
      tenantId: "tenant-payer-optum",
      channel: "api",
      priority: "high",
      documents: [
        { documentId: "doc-onc-01", name: "PA_Request_Form.pdf", docType: "Prior Authorization" },
        { documentId: "doc-onc-02", name: "Clinical_Lab_Pathology.pdf", docType: "Lab Report", isAttachment: true },
      ],
      notes: "Urgent turnaround requested for chemotherapy approval.",
    };

    const res = await call("POST", "/transactions", staffCtx(), new URLSearchParams(), payload);
    expect(res.status).toBe(201);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.transaction.title).toBe(payload.title);
    expect(body.transaction.priority).toBe("high");
    expect(body.transaction.totalDocuments).toBe(2);
    expect(body.transaction.documents).toHaveLength(2);

    // Verify it is queryable in GET /transaction
    const getRes = await call(
      "GET",
      "/transaction",
      staffCtx(),
      new URLSearchParams({ id: body.transaction.id })
    );
    expect(getRes.status).toBe(200);
    const getBody = getRes.body as any;
    expect(getBody.transaction.id).toBe(body.transaction.id);
  });

  it("PATCH /transaction: updates status and records audit log", async () => {
    // Create first
    const createRes = await call("POST", "/transactions", staffCtx(), new URLSearchParams(), {
      title: "Cardiology Review Bundle",
      documents: [{ documentId: "cardio-1", name: "ECG.pdf" }],
    });
    const createdId = (createRes.body as any).transaction.id;

    // Patch status and reviewer
    const patchRes = await call("PATCH", "/transaction", staffCtx(), new URLSearchParams({ id: createdId }), {
      status: "in_review",
      assignedTo: "staff@emids.com",
      notes: "Review started on ECG waveforms.",
    });
    expect(patchRes.status).toBe(200);
    const patched = (patchRes.body as any).transaction;
    expect(patched.status).toBe("in_review");
    expect(patched.assignedTo).toBe("staff@emids.com");
    expect(patched.auditLog.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /stats/tower: returns real-time Control Tower operational metrics", async () => {
    const res = await call("GET", "/stats/tower", staffCtx());
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.stats).toHaveProperty("totalPackets");
    expect(body.stats).toHaveProperty("stpRatePercent");
    expect(body.stats).toHaveProperty("slaCompliancePercent");
    expect(body.stats).toHaveProperty("channelBreakdown");
    expect(body.stats).toHaveProperty("hourlyThroughput");
    expect(body.stats).toHaveProperty("accuracyMean");
  });
});
