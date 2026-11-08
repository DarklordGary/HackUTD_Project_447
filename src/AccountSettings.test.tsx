// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountSettings } from "./AccountSettings";
import type { PingController } from "./usePing";
import { readState, STORAGE_KEY } from "./state";
import { seed } from "./seed";
afterEach(() => { cleanup(); localStorage.clear(); });
const controller = (saveAccount = vi.fn().mockResolvedValue(undefined)) => ({
  account: { displayName: "Taylor", email: "taylor@example.com", authenticated: true }, saveAccount,
}) as unknown as PingController;
it("saves an edited account name and reports success", async () => {
  const ping = controller();
  render(<AccountSettings ping={ping} />);
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(ping.saveAccount).toHaveBeenCalledWith("New name");
  expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
});
it("reports a failed profile save and allows retry", async () => {
  render(<AccountSettings ping={controller(vi.fn().mockRejectedValue(new Error("Disconnected; retry.")))} />);
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Disconnected; retry.");
  expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false);
});
it("loads account caches independently from other accounts and the guest", () => {
  const guest = seed(); guest.profile.name = "Guest";
  const alice = seed(); alice.profile.name = "Alice";
  const bob = seed(); bob.profile.name = "Bob";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  localStorage.setItem(`${STORAGE_KEY}.alice`, JSON.stringify(alice));
  localStorage.setItem(`${STORAGE_KEY}.bob`, JSON.stringify(bob));
  expect(readState().profile.name).toBe("Guest");
  expect(readState(`${STORAGE_KEY}.alice`).profile.name).toBe("Alice");
  expect(readState(`${STORAGE_KEY}.bob`).profile.name).toBe("Bob");
  expect(readState(`${STORAGE_KEY}.unknown`).profile.name).not.toBe("Guest");
});
