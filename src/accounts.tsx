import { createContext, useContext, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "react-oidc-context";
import { STORAGE_KEY } from "./state";
import { Homepage } from "./Homepage";

type Session = { token?: string; storageKey: string; displayName?: string; authenticated: boolean; signOut?: () => void };
const SessionContext = createContext<Session>({ storageKey: STORAGE_KEY, authenticated: false });
export const useAccountSession = () => useContext(SessionContext);
export function Accounts({ children }: { children: ReactNode }) {
  const clientId = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID;
  if (!clientId) return <GuestGate>{children}</GuestGate>;
  return <AuthProvider authority="https://auth.spacetimedb.com/oidc" client_id={clientId}
    redirect_uri={`${window.location.origin}/callback`} post_logout_redirect_uri={window.location.origin}
    scope="openid profile email" response_type="code" automaticSilentRenew
    onSigninCallback={() => window.history.replaceState({}, document.title, "/")}>
    <SessionGate>{children}</SessionGate>
  </AuthProvider>;
}
function GuestGate({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState(false);
  if (!guest) return <Homepage configured={false} onAuthenticate={async () => {}} onGuest={() => { window.history.replaceState({}, "", "/"); setGuest(true); }} />;
  return <SessionContext.Provider value={{ storageKey: STORAGE_KEY, authenticated: false, signOut: () => setGuest(false) }}>{children}</SessionContext.Provider>;
}
function SessionGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState("");
  if (auth.isLoading || auth.activeNavigator === "signinRedirect" || auth.activeNavigator === "signoutRedirect") return <main className="account-welcome" aria-busy="true"><h1 role="status">Connecting your account…</h1></main>;
  const user = auth.isAuthenticated && !auth.user?.expired ? auth.user : undefined;
  if (!user && !guest) return <Homepage onAuthenticate={async () => { setError(""); await auth.signinRedirect(); }}
    onGuest={() => { window.history.replaceState({}, "", "/"); setGuest(true); }} error={error || (auth.error ? "Sign-in could not be completed. Please try again." : "")} />;
  const key = user ? `${STORAGE_KEY}.account.${encodeURIComponent(`${user.profile.iss}/${user.profile.sub}`)}` : STORAGE_KEY;
  return <SessionContext.Provider value={{ token: user?.id_token, storageKey: key,
    displayName: user?.profile.name ?? user?.profile.preferred_username, authenticated: !!user,
    signOut: () => { setGuest(false); if (user) void auth.signoutRedirect().catch(e => setError(String(e))); },
  }}><div key={key} className="account-app">{error && <p role="alert">{error}</p>}{children}</div></SessionContext.Provider>;
}
