/**
 * Flow: uploading a document and watching it move through the pipeline,
 * as the Documents page shows it. The status must change on the next poll
 * after each pipeline write, with no reload and no click.
 */
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STAFF, requests, startApp, stopApp } from "./harness.js";

afterEach(stopApp);

const rowOf = async (documentId: string) => {
  const cell = await screen.findByText(documentId, {}, { timeout: 3000 });
  return within(cell.closest("tr")!);
};

describe("upload", () => {
  it("a PDF is Queued at once, then Processing and Needs Review on the following polls", async () => {
    const app = await startApp({ seed: [] });
    await app.signIn(STAFF);
    await screen.findByText(/0 documents|No documents/i, {}, { timeout: 3000 }).catch(() => null);

    await app.user.click(await screen.findByRole("button", { name: /upload document/i }));
    const dialog = within(await screen.findByRole("dialog"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await app.user.upload(input, new File(["%PDF-1.7 synthetic"], "new referral.pdf", { type: "application/pdf" }));
    await app.user.click(dialog.getByRole("button", { name: /^upload document$/i }));

    // The browser asked for a grant and PUT the file straight to Blob Storage.
    const row = await rowOf("ui/new_referral");
    expect(requests).toEqual(expect.arrayContaining(["POST /upload-sas", "PUT blob ui/new_referral.pdf"]));
    expect(app.blobs.get("docs-in", "ui/new_referral.pdf")?.contentLength).toBe(18);
    expect(row.getByText("Queued")).toBeTruthy();

    app.pipeline.ocr("ui/new_referral");
    await app.nextPoll();
    expect((await rowOf("ui/new_referral")).getByText("Processing")).toBeTruthy();

    app.pipeline.extract("ui/new_referral", { needs_review: true, fields_needing_review: 1 });
    await app.nextPoll();
    expect((await rowOf("ui/new_referral")).getByText("Needs Review")).toBeTruthy();
  });

  it("BUDGET: an idle Documents page costs two /documents calls per poll interval", async () => {
    const app = await startApp();
    await app.signIn(STAFF);
    await screen.findByText("approved-1.pdf", {}, { timeout: 3000 });
    requests.length = 0;
    await app.nextPoll();
    // The page's own list, plus the HIL badge's queue count (QueueCountContext).
    expect([...requests].sort()).toEqual(["GET /documents", "GET /documents?needsReview=true"]);
  });
});
