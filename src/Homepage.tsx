import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch, MessageCircle } from "lucide-react";
import { Parrot } from "./components";
import "./homepage.css";

type Page = "home" | "signin" | "signup";
const readPage = (): Page => window.location.hash === "#/signin" ? "signin" : window.location.hash === "#/signup" ? "signup" : "home";

export function Homepage({ onAuthenticate, onGuest, error = "", configured = true }: {
  onAuthenticate: () => Promise<void>; onGuest: () => void; error?: string; configured?: boolean;
}) {
  const [page, setPage] = useState<Page>(readPage);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const change = () => { setPage(readPage()); setFailure(""); };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => { document.title = `${page === "home" ? "Explore your possible futures" : page === "signin" ? "Sign in" : "Create your account"} · Ping`; heading.current?.focus(); }, [page]);
  const signup = page === "signup";
  return <div className="ping-home">
    <header className="home-header">
      <a className="home-brand" href="#/" aria-label="Ping home"><Parrot size={38} /><span>ping<span className="brand-period">.</span></span></a>
      <nav aria-label="Account navigation"><a className="home-button home-login" href="#/signin">Sign in</a><a className="home-button home-primary" href="#/signup">Sign up <ArrowRight size={16} aria-hidden="true" /></a></nav>
    </header>
    <main id="home-main">
      {page === "home" ? <>
        <section className="home-hero">
          <div className="home-copy">
            <h1 ref={heading} tabIndex={-1}>A little clarity for<br />your next <em>big move.</em></h1>
            <p className="home-intro">A new city. A different career. A place of your own. Explore how life’s what-ifs could shape your finances, with Ping by your side.</p>
            <div className="home-actions"><a href="#/signup" className="home-button home-primary">Start your next chapter <ArrowRight size={18} aria-hidden="true" /></a><button onClick={onGuest} className="home-button home-secondary">Explore as a guest</button></div>
          </div>
          <div className="home-preview" aria-label="Illustration of different possible life paths">
            <div className="preview-heading"><span className="home-eyebrow">YOUR POSSIBLE FUTURES</span><GitBranch size={20} aria-hidden="true" /></div>
            <div className="preview-origin"><Parrot size={44} /><div><strong>You are here</strong><span>A good place to begin.</span></div></div>
            <div className="home-paths"><div><span className="path-dot" /><strong>A new city</strong><span>Make room for a fresh start</span></div><div><span className="path-dot" /><strong>A career leap</strong><span>See what a change could mean</span></div><div><span className="path-dot" /><strong>A home of your own</strong><span>Explore the road to your goal</span></div></div>
            <div className="preview-prompt"><MessageCircle size={19} aria-hidden="true" /><span>“What if I moved to a new city?”</span></div>
          </div>
        </section>
        <section className="home-how" aria-labelledby="how-title"><div><p className="home-eyebrow">FROM WHAT IF TO WHAT’S NEXT</p><h2 id="how-title">Think it through. Then move forward.</h2></div>
          <div className="home-features">{[
            ["01", "Start with your reality", "Bring your income, expenses, and goals into one clear picture."],
            ["02", "Follow a possibility", "Ask Ping about a life change and explore a new financial timeline."],
            ["03", "See the bigger picture", "Compare possible paths and keep your plans together as life changes."],
          ].map(([number, title, copy]) => <article key={number}><span className="feature-number">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>
      </> : <section className="home-auth">
        <div className="auth-story"><p className="home-eyebrow">YOUR NEXT CHAPTER</p><h2>More possibilities.<br /><em>A clearer perspective.</em></h2><p>Give your what-ifs a place to grow. Keep your profile and timelines together, wherever life takes you.</p><Parrot size={110} /></div>
        <div className="auth-card"><a className="auth-back" href="#/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>
          <h1 ref={heading} tabIndex={-1}>{signup ? "Make room for what’s next." : "Welcome back."}</h1>
          <p>{signup ? "Create your Ping account to save your profile and explore your possible futures." : "Sign in to pick up your plans right where you left them."}</p>
          <button disabled={busy || !configured} className="home-button home-primary" onClick={async () => {
            setBusy(true); setFailure("");
            try { await onAuthenticate(); } catch { setFailure("We couldn’t connect to sign-in. Please try again."); } finally { setBusy(false); }
          }}>{busy ? "Connecting…" : signup ? "Create account securely" : "Sign in securely"}<ArrowRight size={18} aria-hidden="true" /></button>
          {!configured && <p role="status">Account sign-in isn’t available on this installation yet. You can explore as a guest.</p>}
          {(failure || error) && <p className="auth-error" role="alert">{failure || error}</p>}
          <p className="auth-switch">{signup ? "Already have an account?" : "New to Ping?"} <a href={signup ? "#/signin" : "#/signup"}>{signup ? "Sign in" : "Sign up"}</a></p>
          <button className="auth-guest" onClick={onGuest}>Continue as guest <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
      </section>}
    </main>
  </div>;
}
