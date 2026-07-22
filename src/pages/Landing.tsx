import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../components/Reveal";
import { useAuth } from "../context/AuthContext";
import { DISCORD_URL } from "../lib/supabase";

// The 3D bundle only loads when this page renders (and only if the device
// can handle it) — it never blocks the app's initial render.
const Starfield = lazy(() => import("../components/Starfield"));

/* Static marketing copy — mirrors the seeded roadmaps. No DB reads here, so
   the page works logged-out without loosening any RLS. */
const COLLECTIONS = [
  {
    slug: "web-development",
    category: "Programming",
    title: "Web Development",
    blurb:
      "Zero to shipping real websites — HTML, CSS, JavaScript, Git, and React, ending with a deployed project of your own.",
    stages: ["Web foundations", "Interactive pages", "React & shipping"],
    steps: 12,
    hours: 122,
    projects: 3,
  },
  {
    slug: "python",
    category: "Programming",
    title: "Python Programming",
    blurb:
      "The friendliest first language — scripts, data structures, files, OOP, and a published CLI tool on GitHub.",
    stages: ["Python basics", "Working with real data", "Real-world Python"],
    steps: 9,
    hours: 73,
    projects: 3,
  },
  {
    slug: "ux-design",
    category: "Design",
    title: "UX Design",
    blurb:
      "Research, wireframes, visual principles, Figma prototyping — finished as a tested portfolio case study.",
    stages: ["Understand users", "Design the solution", "Prototype & prove it"],
    steps: 9,
    hours: 67,
    projects: 3,
  },
];

const FEATURES = [
  {
    icon: "🧭",
    title: "Curated, not generated",
    body: "Every step, resource, and checkpoint is hand-vetted. No AI slop, no 400-item checklists — one clear path per skill.",
  },
  {
    icon: "🚀",
    title: "Monthly cohorts",
    body: "Enroll and you join a cohort of people starting the same month. Progress is always relative to them — never a global scoreboard.",
  },
  {
    icon: "🔥",
    title: "Streaks with grace",
    body: "Daily momentum with a built-in streak freeze — miss one day and your streak survives. Encouraging, never punishing.",
  },
  {
    icon: "🛠️",
    title: "Real milestone projects",
    body: "Stages end in projects you actually build and ship — a deployed site, a CLI tool, a tested prototype. Not checkboxes.",
  },
  {
    icon: "✨",
    title: "AI when you're stuck",
    body: "Every step can re-explain itself in simpler words or quiz you — powered server-side, tuned to that exact step.",
  },
  {
    icon: "🔒",
    title: "Privacy-first leaderboard",
    body: "The cohort leaderboard is opt-in and enforced in the database. Others only ever see your name, avatar, and milestone count.",
  },
];

const FAQS = [
  {
    q: "Is SkillVerse really free?",
    a: "Yes — free forever, no credit card. Every resource on every roadmap is a vetted free resource: MDN, freeCodeCamp, official docs, NN/g, and similar.",
  },
  {
    q: "Do I need any experience?",
    a: "No. Every path starts from absolute zero and is staged beginner → intermediate → advanced, with estimated hours so you can pace yourself.",
  },
  {
    q: "What exactly is a cohort?",
    a: "Everyone who starts a skill in the same month is grouped together. Your standing and leaderboard compare you only to them — people at your stage, not veterans with a five-year head start.",
  },
  {
    q: "Can I stay off the leaderboard?",
    a: "Yes. It's opt-in and off by default, enforced at the database layer — opted-out learners are never visible to anyone, full stop.",
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const [showStars, setShowStars] = useState(false);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let webglOk = false;
    try {
      const canvas = document.createElement("canvas");
      webglOk = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      /* no WebGL — static gradient fallback */
    }
    if (!webglOk) return;

    // Defer the 3D starfield until the browser is idle so the ~135KB three.js
    // chunk and WebGL init stay off the initial-render / LCP critical path.
    // The static cosmos gradient is already visible in the meantime.
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const schedule = win.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const cancel = win.cancelIdleCallback ?? window.clearTimeout;
    const id = schedule(() => setShowStars(true));
    return () => cancel(id);
  }, []);

  const primaryCta = user ? "/" : "/signup";
  const primaryCtaLabel = user ? "Open your dashboard" : "Start free";

  return (
    // The landing is intrinsically cosmic-dark: the `dark` class scopes the
    // dark design tokens here regardless of the in-app theme toggle.
    <div className="dark relative min-h-screen text-pine">
      {/* Backdrop: gradient always; 3D starfield when the device allows. */}
      <div aria-hidden className="cosmos-bg fixed inset-0 -z-10" />
      {showStars && (
        <div aria-hidden className="fixed inset-0 -z-10">
          <Suspense fallback={null}>
            <Starfield />
          </Suspense>
        </div>
      )}

      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050b09]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/about" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-lg font-bold tracking-tight text-white">
              SkillVerse
            </span>
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-5 text-sm text-white/70 md:flex">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#collections" className="transition-colors hover:text-white">Roadmaps</a>
            <a href="#features" className="transition-colors hover:text-white">Why SkillVerse</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && (
              <Link to="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white">
                Sign in
              </Link>
            )}
            <Link to={primaryCta} className="btn-primary !px-4 !py-2 text-sm">
              {user ? "Dashboard" : "Start free"}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <p className="eyebrow !text-jade">Guided · social · free forever</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Learn any skill, with people learning{" "}
            <span className="bg-gradient-to-r from-jade to-marigold bg-clip-text text-transparent">
              beside you
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Stop drowning in tutorials. One curated path per skill, real
            projects at every milestone, a streak that forgives, and a cohort
            that started exactly when you did.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to={primaryCta} className="btn-primary !px-7 !py-3.5 text-base">
              {primaryCtaLabel}
              <span aria-hidden>→</span>
            </Link>
            <a href="#collections" className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 font-medium text-white backdrop-blur transition-all hover:border-jade/60 hover:text-jade">
              Browse the roadmaps
            </a>
          </div>
          <p className="mt-4 font-mono text-xs text-white/60">
            No credit card · no ads · your progress stays yours
          </p>

          {/* Stats band */}
          <Reveal delay={300} className="mx-auto mt-14 max-w-3xl">
            <dl className="glass grid grid-cols-2 gap-6 px-6 py-6 sm:grid-cols-4">
              <Stat value="3" label="curated paths" />
              <Stat value="30" label="expert-picked steps" />
              <Stat value="60+" label="free resources" />
              <Stat value="9" label="milestone projects" />
            </dl>
          </Reveal>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
          <Reveal>
            <p className="eyebrow !text-jade">How it works</p>
            <h2 id="how-title" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">
              From “where do I even start” to shipped work
            </h2>
          </Reveal>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Pick your path", "Choose a skill and join this month's cohort — everyone around you is starting too."],
              ["Follow curated steps", "Each step has vetted free resources, a why-it-matters, subtopics, and a hands-on checkpoint."],
              ["Build milestone projects", "Stages end in real projects — a live website, a CLI tool, a tested prototype."],
              ["Climb with your cohort", "Streaks keep you moving daily; the cohort leaderboard shows how far you've come."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 90} as="li">
                <div className="glass h-full p-5">
                  <span className="font-mono text-sm font-semibold text-jade">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-lg font-bold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Roadmap collections */}
        <section id="collections" aria-labelledby="collections-title" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
          <Reveal>
            <p className="eyebrow !text-jade">Premium roadmap collections</p>
            <h2 id="collections-title" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">
              Three deep paths. Zero guesswork.
            </h2>
            <p className="mt-2 max-w-xl text-white/65">
              Staged beginner → advanced, with estimated hours, curated free
              resources, and a project at the end of every stage.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {COLLECTIONS.map((c, i) => (
              <Reveal
                key={c.slug}
                delay={i * 110}
                className={i === 2 ? "sm:col-span-2 lg:col-span-1" : ""}
              >
                <article className="glass group flex h-full flex-col p-6 transition-transform duration-300 hover:-translate-y-1">
                  <div className="eyebrow !text-white/60">{c.category}</div>
                  <h3 className="mt-1.5 font-display text-2xl font-bold text-white">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{c.blurb}</p>
                  <ol className="mt-5 space-y-2.5">
                    {c.stages.map((stage, si) => (
                      <li key={stage} className="flex items-center gap-3 text-sm text-white/80">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-jade/40 font-mono text-[10px] font-semibold text-jade">
                          {si + 1}
                        </span>
                        {stage}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px] text-white/70">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">{c.steps} steps</span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">~{c.hours}h</span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">{c.projects} projects</span>
                  </div>
                  <div className="mt-6 flex-1" />
                  <Link
                    to={user ? "/explore" : "/signup"}
                    className="btn-primary w-full !py-2.5 text-sm"
                  >
                    Start this path
                    <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200} className="mt-6 text-center">
            <p className="text-sm text-white/70">
              Don't see your skill?{" "}
              <Link to={user ? "/explore" : "/signup"} className="font-medium text-jade hover:underline">
                Request it
              </Link>{" "}
              — the most-wanted roadmaps get built next.
            </p>
          </Reveal>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
          <Reveal>
            <p className="eyebrow !text-jade">Why SkillVerse</p>
            <h2 id="features-title" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">
              Built for finishing, not collecting
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="glass h-full p-5">
                  <span aria-hidden className="text-2xl">{f.icon}</span>
                  <h3 className="mt-2.5 font-display text-base font-bold text-white">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
          <Reveal>
            <p className="eyebrow !text-jade">FAQ</p>
            <h2 id="faq-title" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">
              Fair questions
            </h2>
          </Reveal>
          <div className="mt-8 space-y-3">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 70}>
                <details className="glass group !rounded-2xl px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-base font-bold text-white [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="text-jade transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <Reveal>
            <div className="glass relative overflow-hidden p-8 text-center sm:p-12">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-jade/15 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-marigold/10 blur-3xl" />
              <h2 className="relative font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Your cohort starts this month.
              </h2>
              <p className="relative mx-auto mt-3 max-w-md text-white/65">
                The best time to start was the first of the month. The second
                best time is right now — the cohort is still open.
              </p>
              <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link to={primaryCta} className="btn-primary !px-8 !py-3.5 text-base">
                  {primaryCtaLabel}
                </Link>
                {DISCORD_URL && (
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 font-medium text-white transition-all hover:border-jade/60 hover:text-jade"
                  >
                    Join the Discord
                  </a>
                )}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Landing footer */}
      <footer className="border-t border-white/10 bg-[#050b09]">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 px-4 py-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display font-bold text-white">SkillVerse</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
            <a href="#collections" className="hover:text-white">Roadmaps</a>
            <Link to="/login" className="hover:text-white">Sign in</Link>
            <Link to="/signup" className="hover:text-white">Create account</Link>
            {DISCORD_URL && (
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                Discord
              </a>
            )}
          </nav>
          <p className="font-mono text-[11px] text-white/60">
            © {new Date().getFullYear()} SkillVerse · free for learners, always
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="font-display text-3xl font-extrabold text-white">{value}</span>
        <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-white/70">
          {label}
        </span>
      </dd>
    </div>
  );
}

function LogoMark(): ReactNode {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
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
