/**
 * Flow: a reviewer resolves a document in the HIL workbench. What the server
 * stores is the contract; the queue and the badge must follow it.
 */
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EMAIL, STAFF, startApp, stopApp } from "./harness.js";
import { CORPUS, corpus } from "../server/fakes/corpus.js";

afterEach(stopApp);

/** One document awaiting review (PatientDOB blank), and one already processed. */
const seed = () => corpus().filter((i) => i.documentId === CORPUS.needsReview || i.documentId === CORPUS.processed);

async function openWorkbench() {
  const app = await startApp({ seed: seed() });
  await app.signIn(STAFF);
  await app.user.click(within(await screen.findByRole("complementary")).getByText("HIL Review"));
  const dob = await screen.findByLabelText(/patient ?dob/i, {}, { timeout: 3000 });
  return { app, dob: dob as HTMLInputElement };
}

describe("HIL review", () => {
  it("correcting a field and approving stores both, signed by the reviewer, and empties the queue", async () => {
    const { app, dob } = await openWorkbench();
    await app.user.clear(dob);
    await app.user.type(dob, "1980-01-01");
    await app.user.click(screen.getByRole("button", { name: /approve & deliver/i }));

    await screen.findByText(/approved & delivered/i, {}, { timeout: 3000 });
    const review = app.docs().get("review", CORPUS.needsReview)!;
    expect(review).toMatchObject({
      status: "approved",
      reviewed_by: EMAIL[STAFF],
      corrections: { PatientDOB: { value: "1980-01-01", by: EMAIL[STAFF] } },
    });
    expect(app.docs().get("fields", CORPUS.needsReview)!.fields.PatientDOB).toMatchObject({ value: "1980-01-01", needs_review: false });

    await app.nextPoll();
    expect(await screen.findByText(/0 awaiting decision/i, {}, { timeout: 3000 })).toBeTruthy();
  });

  it("saving a correction keeps the document in review", async () => {
    const { app, dob } = await openWorkbench();
    await app.user.clear(dob);
    await app.user.type(dob, "1980-01-01");
    await app.user.click(screen.getByRole("button", { name: /save \(1\)/i }));

    await screen.findByText(/1 correction saved/i, {}, { timeout: 3000 });
    expect(app.docs().get("review", CORPUS.needsReview)).toMatchObject({
      status: "pending",
      corrections: { PatientDOB: { value: "1980-01-01" } },
    });
  });

  it("rejecting stores the rejection, signed by the reviewer", async () => {
    const { app } = await openWorkbench();
    await app.user.click(screen.getByRole("button", { name: /reject document/i }));
    await screen.findByText(/rejected/i, {}, { timeout: 3000 });
    expect(app.docs().get("review", CORPUS.needsReview)).toMatchObject({ status: "rejected", reviewed_by: EMAIL[STAFF] });
  });

  it("a blank field shows an empty input, so typing into it saves \"1980-01-01\"", async () => {
    const { app, dob } = await openWorkbench();
    expect(dob.value).toBe("");
    await app.user.type(dob, "1980-01-01");
    await app.user.click(screen.getByRole("button", { name: /save \(1\)/i }));
    await screen.findByText(/1 correction saved/i, {}, { timeout: 3000 });
    expect(app.docs().get("review", CORPUS.needsReview)!.corrections.PatientDOB.value).toBe("1980-01-01");
  });
});
