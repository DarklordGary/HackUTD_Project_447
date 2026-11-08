// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Accounts, useAccountSession } from "./accounts";

const auth = vi.hoisted(() => ({ isLoading: false, activeNavigator: undefined as string | undefined, isAuthenticated: false,
  user: undefined as undefined | { expired: boolean; id_token: string; profile: { iss: string; sub: string; name: string } },
  error: undefined, signinRedirect: vi.fn(), signoutRedirect: vi.fn() }));
vi.mock("react-oidc-context", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children, useAuth: () => auth }));
function Workspace() { const session = useAccountSession(); return <div><p>Workspace: {session.displayName ?? "Guest"}</p><p>{session.storageKey}</p><button onClick={session.signOut}>Leave workspace</button></div>; }
beforeEach(() => {
  vi.stubEnv("VITE_SPACETIMEAUTH_CLIENT_ID", "test-client");
  window.history.replaceState({}, "", "/");
  auth.isAuthenticated = false; auth.user = undefined; auth.activeNavigator = undefined;
  auth.signinRedirect.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("shows the homepage before mounting a guest workspace, and allows returning", () => {
  render(<Accounts><Workspace /></Accounts>);
  expect(screen.queryByText("Workspace: Guest")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Explore as a guest" }));
  expect(screen.getByText("Workspace: Guest")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Leave workspace" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("big move");
});
it.each(["signin", "signup"])("connects the %s entry point to hosted authentication", async page => {
  window.history.replaceState({}, "", `/#/${page}`);
  render(<Accounts><Workspace /></Accounts>);
  fireEvent.click(screen.getByRole("button", { name: page === "signin" ? "Sign in securely" : "Create account securely" }));
  await waitFor(() => expect(auth.signinRedirect).toHaveBeenCalledOnce());
});
it("reports redirect failure and enables retry", async () => {
  window.history.replaceState({}, "", "/#/signin");
  auth.signinRedirect.mockRejectedValueOnce(new Error("Network failure"));
  render(<Accounts><Workspace /></Accounts>);
  fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Please try again");
  expect((screen.getByRole("button", { name: "Sign in securely" }) as HTMLButtonElement).disabled).toBe(false);
});
it("restores an authenticated account without replacing the app during silent renewal", () => {
  auth.isAuthenticated = true; auth.activeNavigator = "signinSilent";
  auth.user = { expired: false, id_token: "test-token", profile: { iss: "issuer", sub: "alice", name: "Alice" } };
  render(<Accounts><Workspace /></Accounts>);
  expect(screen.getByText("Workspace: Alice")).toBeTruthy();
  expect(screen.getByText(/account.issuer%2Falice/)).toBeTruthy();
});
it("does not mount an expired account", () => {
  auth.isAuthenticated = true;
  auth.user = { expired: true, id_token: "expired", profile: { iss: "issuer", sub: "alice", name: "Alice" } };
  render(<Accounts><Workspace /></Accounts>);
  expect(screen.queryByText("Workspace: Alice")).toBeNull();
});
it("keeps the homepage and guest access available when auth is not configured", () => {
  vi.stubEnv("VITE_SPACETIMEAUTH_CLIENT_ID", "");
  window.history.replaceState({}, "", "/#/signup");
  render(<Accounts><Workspace /></Accounts>);
  expect((screen.getByRole("button", { name: "Create account securely" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Continue as guest/ }));
  expect(screen.getByText("Workspace: Guest")).toBeTruthy();
});
