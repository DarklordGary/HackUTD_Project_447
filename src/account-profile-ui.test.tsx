// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { connectPersistence, type AccountProfile, type SyncOptions } from "./sync";

vi.mock("./accounts", () => ({ useAccountSession: () => ({ authenticated: true, displayName: "Login name", token: "test-token", storageKey: "test.account.workspace" }) }));
vi.mock("./sync", () => ({ connectPersistence: vi.fn() }));
let options: SyncOptions;
let persisted: AccountProfile;
let saveAccount = vi.fn<(displayName: string) => Promise<void>>();
beforeEach(() => {
  localStorage.clear();
  persisted = { displayName: "Taylor Nguyen", email: "taylor@example.com", authenticated: true };
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ai: "Nemotron" }) }));
  saveAccount = vi.fn(async (displayName: string) => {
    persisted = { ...persisted, displayName };
    options.onAccount?.(persisted);
  });
  vi.mocked(connectPersistence).mockImplementation((_remote, status, supplied) => {
    options = supplied!;
    status("Live with SpacetimeDB");
    return { save: vi.fn(), close: vi.fn(), saveAccount };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the database account name, opens its editor, and reflects saved and remote edits", async () => {
  const view = render(<App />);
  // Until the subscription arrives, use the login name, never the demo persona.
  expect(screen.getByRole("button", { name: "Edit profile for Login name" })).toBeTruthy();
  expect(screen.queryByText("Alex Morgan")).toBeNull();
  act(() => options.onAccount?.(persisted));
  const profile = screen.getByRole("button", { name: "Edit profile for Taylor Nguyen" });
  expect(within(profile).getByText("TN")).toBeTruthy();
  fireEvent.click(profile);
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Taylor Lee" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(saveAccount).toHaveBeenCalledWith("Taylor Lee");
  expect(within(screen.getByRole("button", { name: "Edit profile for Taylor Lee" })).getByText("TL")).toBeTruthy();
  expect(screen.getByText("Financial profile")).toBeTruthy();
  view.unmount(); render(<App />);
  act(() => options.onAccount?.(persisted));
  expect(screen.getByRole("button", { name: "Edit profile for Taylor Lee" })).toBeTruthy();
  act(() => options.onAccount?.({ ...persisted, displayName: "Remote edit" }));
  expect(screen.getByRole("button", { name: "Edit profile for Remote edit" })).toBeTruthy();
});
