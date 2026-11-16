import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { takeBlockedConnections } from "../setup/no-network.js";
import { CosmosError, FakeContainer } from "./fakes/cosmos.js";

// Only what a route test could not notice by itself: the network guard holds,
// and the fake Cosmos answers the server's queries correctly (a fake that
// returned nothing would let a route test pass vacuously).

describe("no-network guard", () => {
  it("refuses a connection to a remote host", async () => {
    const socket = net.connect({ host: "203.0.113.7", port: 443 });
    const error = await new Promise<Error>((resolve) => socket.on("error", resolve));
    expect(error.message).toMatch(/no-network: blocked/);
    expect(takeBlockedConnections()).toEqual(["203.0.113.7:443"]);
  });

  it("refuses a real fetch, even when the caller swallows the error", async () => {
    await fetch("https://example.com/").catch(() => null);
    expect(takeBlockedConnections()).toEqual(["example.com:443"]);
  });

  it("lets loopback through", async () => {
    const server = net.createServer((s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    const socket = net.connect({ host: "127.0.0.1", port });
    await new Promise((resolve) => socket.on("connect", resolve));
    socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    expect(takeBlockedConnections()).toEqual([]);
  });
});

describe("fake cosmos", () => {
  const c = new FakeContainer("documents", "/documentId");
  const docs = [
    { id: "ocr", itemType: "ocr", documentId: "ui/a", file_bytes: 10, recorded_at: "2026-10-01" },
    { id: "extract", itemType: "extract", documentId: "ui/a", runId: "ui" },
    { id: "ocr", itemType: "ocr", documentId: "ui/b", file_bytes: 10, recorded_at: "2026-10-02" },
    { id: "fields", itemType: "fields", documentId: "ui/b" },
  ];
  const run = async (query: string, parameters: { name: string; value: unknown }[] = [], partitionKey?: string) =>
    (await c.items.query({ query, parameters }, { partitionKey }).fetchAll()).resources;

  afterEach(() => c.reset());

  it("evaluates the WHERE shapes the server uses", async () => {
    c.seed(...docs);
    expect(await run("SELECT VALUE COUNT(1) FROM c")).toEqual([4]);
    expect((await run("SELECT * FROM c WHERE c.itemType = 'ocr' OR c.itemType = 'extract'")).length).toBe(3);
    expect(
      (await run("SELECT * FROM c WHERE c.documentId = @k AND (c.itemType = 'review' OR c.itemType = 'fields')", [
        { name: "@k", value: "ui/b" },
      ])).map((r: any) => r.id)
    ).toEqual(["fields"]);
    expect(
      await run(
        "SELECT c.documentId, c.recorded_at, c.docId FROM c WHERE c.itemType = 'ocr' AND c.file_bytes = @bytes AND c.documentId != @currentDocId",
        [
          { name: "@bytes", value: 10 },
          { name: "@currentDocId", value: "ui/a" },
        ]
      )
    ).toEqual([{ documentId: "ui/b", recorded_at: "2026-10-02" }]);
    expect((await run("SELECT * FROM c", [], "ui/a")).length).toBe(2);
  });

  it("throws on a query shape it does not understand", async () => {
    await expect(run("SELECT TOP 5 * FROM c")).rejects.toThrow(/fake cosmos/);
    await expect(run("SELECT * FROM c WHERE c.n > 1")).rejects.toThrow(/not supported/);
  });

  it("reads, upserts and patches by id and partition key, with ETags", async () => {
    c.seed({ id: "gaps", documentId: "ui/a", openCount: 2 });
    const { resource } = await c.item("gaps", "ui/a").read();
    expect(resource?.openCount).toBe(2);
    expect((await c.item("gaps", "ui/zzz").read()).statusCode).toBe(404);

    await c.item("gaps", "ui/a").patch([{ op: "set", path: "/openCount", value: 0 }], {
      accessCondition: { type: "IfMatch", condition: resource!._etag },
    });
    expect(c.get("gaps", "ui/a")?.openCount).toBe(0);
    await expect(
      c.item("gaps", "ui/a").patch([{ op: "set", path: "/openCount", value: 9 }], {
        accessCondition: { type: "IfMatch", condition: resource!._etag },
      })
    ).rejects.toBeInstanceOf(CosmosError);
  });

});
