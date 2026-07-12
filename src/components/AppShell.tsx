import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "../context/ThemeContext";
import { LoadingScreen } from "./LoadingScreen";
import { DISCORD_URL } from "../lib/supabase";

const tabs = [
  { to: "/", label: "Dashboard", icon: HomeIcon },
  { to: "/roadmap", label: "Roadmap", icon: TrailIcon },
  { to: "/explore", label: "Explore", icon: CompassIcon },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // A tiny floor keeps the overlay from flashing; the real wait is signOut.
    await Promise.all([
      signOut().catch((e) => console.error(e)),
      new Promise((r) => setTimeout(r, 400)),
    ]);
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {signingOut && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <LoadingScreen label="Signing out" />
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-mist/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 lg:max-w-4xl">
          <NavLink to="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-lg font-bold tracking-tight">
              SkillVerse
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-jade-tint text-jade-deep"
                      : "text-fog hover:text-pine"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {DISCORD_URL && (
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-lg border border-mist bg-card px-3 py-1.5 text-sm font-medium text-pine transition-colors hover:border-jade hover:text-jade-deep sm:inline-flex"
              >
                <DiscordIcon />
                Discord
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-fog transition-colors hover:text-danger"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-6 lg:max-w-4xl">{children}</main>

      <Footer />

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-card/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-jade-deep" : "text-fog"
                }`
              }
            >
              <t.icon />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    // `relative` keeps the footer above fixed z-0 canvases (galaxy view).
    <footer className="relative mt-16 bg-abyss text-glow">
      <div className="mx-auto grid max-w-3xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] lg:max-w-4xl">
        <div>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-lg font-bold tracking-tight">SkillVerse</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-glow/60">
            Curated roadmaps, monthly cohorts, and vetted free resources — so
            you always know what to learn next.
          </p>
        </div>
        <nav aria-label="Footer">
          <div className="eyebrow text-glow/50">Learn</div>
          <ul className="mt-3 space-y-2 text-sm">
            {tabs.map((t) => (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  className="text-glow/80 transition-colors hover:text-marigold"
                >
                  {t.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link to="/about" className="text-glow/80 transition-colors hover:text-marigold">
                About SkillVerse
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <div className="eyebrow text-glow/50">Community</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              {DISCORD_URL ? (
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-glow/80 transition-colors hover:text-marigold"
                >
                  <DiscordIcon />
                  Learners' Discord
                </a>
              ) : (
                <span className="text-glow/50">Discord coming soon</span>
              )}
            </li>
            <li>
              <a
                href="https://roadmap.sh"
                target="_blank"
                rel="noopener noreferrer"
                className="text-glow/80 transition-colors hover:text-marigold"
              >
                More inspiration
              </a>
            </li>
          </ul>
        </div>
      </div>
      {/* Extra bottom padding on mobile clears the fixed tab bar. */}
      <div className="border-t border-glow/10 pb-20 md:pb-0">
        <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-1 px-4 py-4 font-mono text-[11px] text-glow/50 sm:flex-row sm:items-center lg:max-w-4xl">
          <span>© {year} SkillVerse. Free for learners, always.</span>
          <span>Built with cohorts, not checkboxes.</span>
        </div>
      </div>
    </footer>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#173B33" />
      <path
        d="M10 22V10h4.5a4 4 0 0 1 0 8H12"
        stroke="#EDA419"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="21" cy="21" r="3" fill="#0E8A62" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V21h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="M8 5h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" strokeLinecap="round" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.3 5.3A16.9 16.9 0 0 0 15.2 4l-.2.4a15.4 15.4 0 0 1 3.8 1.9A12.6 12.6 0 0 0 8.7 6a15.6 15.6 0 0 1 3.9-2l-.2-.4a16.8 16.8 0 0 0-4.2 1.3C5.6 9.2 5 13 5.3 16.7a17 17 0 0 0 5.2 2.6l.7-1.1a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.4 0l.4.3c-.6.4-1.2.7-1.8.9l.7 1.1a17 17 0 0 0 5.2-2.6c.4-4.3-.7-8-2.4-11.4ZM9.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.9.9 1.8 2c0 1.1-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.9.9 1.8 2c0 1.1-.8 2-1.8 2Z" />
    </svg>
  );
}
