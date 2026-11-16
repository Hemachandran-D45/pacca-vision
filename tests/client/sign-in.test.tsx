/**
 * Flow: signing in. The real form, the real /login (scrypt + signed cookie),
 * and the tabs each role gets.
 */
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ADMIN, STAFF, requests, startApp, stopApp } from "./harness.js";

afterEach(stopApp);

const sidebar = () => within(screen.getByRole("complementary"));

describe("sign-in", () => {
  it("Client Staff lands on Documents, sees the live list and only the staff tabs", async () => {
    const app = await startApp();
    await app.signIn(STAFF);

    expect(await screen.findByText("approved-1.pdf", {}, { timeout: 3000 })).toBeTruthy();
    expect(window.location.pathname).toBe("/documents");
    for (const tab of ["Dashboard", "Documents", "HIL Review"]) expect(sidebar().getByText(tab)).toBeTruthy();
    for (const tab of ["Observability", "Analytics & Cost", "Solutions", "Settings"]) expect(sidebar().queryByText(tab)).toBeNull();
  });

  it("a Platform Admin also gets Observability, Analytics, Solutions and Settings", async () => {
    const app = await startApp();
    await app.signIn(ADMIN);
    await screen.findByText("approved-1.pdf", {}, { timeout: 3000 });
    for (const tab of ["Observability", "Analytics & Cost", "Solutions", "Settings"]) expect(sidebar().getByText(tab)).toBeTruthy();
  });

  it("a wrong password keeps you on sign-in with the server's message", async () => {
    const app = await startApp();
    await app.signIn(STAFF, "wrong-password");
    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(requests).toContain("POST /login");
  });

  it("a non-@emids address is refused before anything is sent", async () => {
    const app = await startApp();
    await app.user.type(await screen.findByLabelText("Email"), "someone@example.com");
    await app.user.type(screen.getByLabelText("Password"), "x");
    await app.user.click(screen.getByRole("button", { name: /continue to workspace/i }));
    expect(await screen.findByText("Use your @emids.com email address.")).toBeTruthy();
    expect(requests).not.toContain("POST /login");
  });
});
