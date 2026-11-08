import { useEffect, useState } from "react";
import { useAccountSession } from "./accounts";
import type { PingController } from "./usePing";

export function AccountSettings({ ping }: { ping: PingController }) {
  const session = useAccountSession();
  const [name, setName] = useState(session.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (ping.account) setName(ping.account.displayName); }, [ping.account?.displayName]);
  return <section className="settings-panel account-settings">
    <h2>Your account</h2>
    <p>Update the name shown on your profile. Changes are saved to your account.</p>
    <p>{session.authenticated ? "Your profile and timelines belong to your signed-in account." : "Guest workspace · saved under this browser’s identity."}</p>
    {ping.account?.email && <p>{ping.account.email}</p>}
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setMessage("");
      try { await ping.saveAccount(name); setMessage("Profile saved."); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not save profile. Please retry."); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="account-name">Display name</label>
      <input id="account-name" autoComplete="nickname" value={name} maxLength={80} required
        onChange={event => setName(event.target.value)} aria-describedby="account-feedback" />
      <button className="secondary-button" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save profile"}</button>
      <p id="account-feedback" role={error ? "alert" : "status"}>{error || message || (!ping.account ? "Connect to SpacetimeDB to edit your profile." : "Your display name appears in the sidebar.")}</p>
    </form>
    {session.signOut ? <button className="secondary-button" onClick={session.signOut}>{session.authenticated ? "Sign out" : "Sign in / Create account"}</button> :
      <p>Account sign-in is not configured for this installation. Guest profiles and timelines still save to the connected database.</p>}
  </section>;
}
