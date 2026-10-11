// @vitest-environment jsdom
// Smoke tests: render the real app in demo mode (no Supabase env) at each new or
// changed route and check what the user sees. Run: npm test
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { App } from "./App";
import { auth } from "./lib/api";

const at = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const find = (t: string | RegExp) => screen.findAllByText(t, undefined, { timeout: 3000 }).then((x) => x[0]);

afterEach(cleanup);

describe("hub (demo mode)", () => {
  it("dashboard shows organization access and that Directory/WSSO SSO is not configured", async () => {
    at("/app");
    await find(/Good to see you, Avery/);
    const directory = await screen.findByRole("article", { name: "Drone Directory" });
    const wsso = screen.getByRole("article", { name: "WSSO" });
    expect(within(directory).getByText("SSO not configured")).toBeTruthy();
    expect(within(wsso).getByText("SSO not configured")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Workforce 2.0" })).getByText("Desktop app")).toBeTruthy();
    expect(screen.queryByText("SSO enabled")).toBeNull();
    expect(screen.getAllByText(/Skyline Aerial Survey/).length).toBeGreaterThan(0);
  });

  it("opening WSSO explains SSO isn't live and links to WSSO's own login", async () => {
    at("/app/m/wsso");
    fireEvent.click(await find(/Open WSSO/));
    await find(/Single sign-on to WSSO isn't live yet/);
    const links = screen.getAllByRole("link", { name: "wsso.tlbisbig.world" });
    expect(links.every((l) => l.getAttribute("href") === "https://wsso.tlbisbig.world")).toBe(true);
    expect(screen.getByText(/Seat in/)).toBeTruthy();
  });

  it("the /launch route never claims a hand-off happened", async () => {
    at("/launch/directory");
    await find(/Single sign-on to Drone Directory isn't live yet/);
  });

  it("organizations list and detail with roles, seats and invitations", async () => {
    at("/app/orgs");
    fireEvent.click(await find("Skyline Aerial Survey"));
    await find(/Jordan Reyes/);
    expect(screen.getByLabelText("WSSO seat for Riley")).toBeTruthy();
    expect(screen.getByText(/3 of 50 seats used/)).toBeTruthy();
    await find("casey@skylineaerial.example");

    fireEvent.click(screen.getByText("Invite people"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: "new@skylineaerial.example" } });
    fireEvent.click(within(dialog).getByText("Create invitation link"));
    await find(/It works once, for that email address only/);
  });

  it("invitation acceptance page", async () => {
    at("/invite/some-token");
    await find("Join Skyline Aerial Survey");
  });

  it("buying for an organization", async () => {
    at("/plans?org=o-1");
    await find("Pick products for Skyline Aerial Survey");
  });

  it("application sign-in page shows an error instead of redirecting in demo", async () => {
    at("/oauth/authorize?client_id=x&redirect_uri=https://app.test/cb&response_type=code");
    await find("Can't sign you in");
  });

  it("admin: applications and SSO switches start off and refuse to enable without a client", async () => {
    at("/admin/apps");
    await find("No applications registered");
    const sel = (await screen.findByLabelText("WSSO sign-in")) as HTMLSelectElement;
    expect(sel.value).toBe("not_configured");
    fireEvent.change(sel, { target: { value: "enabled" } });
    // a consequential switch needs explicit confirmation, and is still refused without an enabled client
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Only do this after the WSSO team/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText("Enable for everyone"));
    await find(/Enable an application client/);
  });

  it("admin: identity link review requires a note before approving", async () => {
    at("/admin/links");
    await find("Lena Vogt");
    const approve = screen.getByText("Approve").closest("button")!;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("How you verified"), { target: { value: "Called Lena, confirmed BD login" } });
    expect(approve.disabled).toBe(false);
  });

  it("admin: organizations", async () => {
    at("/admin/organizations");
    fireEvent.click(await find("Bell Ag Spraying"));
    await find("Organization access");
  });

  it("password reset: request a link, then set a new password", async () => {
    at("/forgot");
    fireEvent.change(await screen.findByLabelText(/^Email/), { target: { value: "avery@skylineaerial.example" } });
    fireEvent.click(screen.getByText("Send reset link"));
    await find("Check your email");
    cleanup();

    at("/reset-password");
    await find("Choose a new password");
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "NewPassword123" } });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: "Different123" } });
    fireEvent.click(screen.getByText("Update password"));
    expect((await screen.findAllByText(/don't match/)).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: "NewPassword123" } });
    fireEvent.click(screen.getByText("Update password"));
    await find("Your password was changed. Sign in with the new one.");
    await auth.signIn("avery@skylineaerial.example", "NewPassword123"); // demo session for the next tests
  });

  it("removing a member asks for confirmation and Escape cancels it", async () => {
    at("/app/orgs/o-1");
    await find(/Riley Chen/);
    const row = screen.getByText(/Riley Chen/).closest("tr")!;
    fireEvent.click(within(row).getByText("Remove"));
    const dialog = await screen.findByRole("dialog", { name: "Remove Riley Chen?" });
    expect(document.activeElement && dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Riley Chen/)).toBeTruthy();
  });

  it("theme toggle switches between dark and light", async () => {
    document.documentElement.dataset.theme = "dark";
    at("/app/settings");
    fireEvent.click(await find("Avery Cole"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /light theme/ }));
    expect(document.documentElement.dataset.theme).toBe("light");
    document.documentElement.dataset.theme = "dark";
  });
});
