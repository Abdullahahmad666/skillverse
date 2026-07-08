import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { Reveal } from "../components/Reveal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/messages";
import { logEvent } from "../lib/analytics";
import { cleanText, validateEmail } from "../lib/sanitize";
import type { Skill } from "../lib/types";

interface SkillMeta {
  steps: number;
  hours: number;
}

export function ExplorePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [meta, setMeta] = useState<Record<string, SkillMeta>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    (async () => {
      const [skillsRes, stepsRes] = await Promise.all([
        supabase.from("skills").select("*").order("title"),
        supabase.from("roadmap_steps").select("skill_id, estimated_hours"),
      ]);
      if (!active) return;
      if (skillsRes.error || stepsRes.error) {
        setError("Couldn't load skills. Refresh to try again.");
      } else {
        setSkills((skillsRes.data ?? []) as Skill[]);
        const m: Record<string, SkillMeta> = {};
        for (const row of stepsRes.data ?? []) {
          const r = row as { skill_id: string; estimated_hours: number | null };
          m[r.skill_id] ??= { steps: 0, hours: 0 };
          m[r.skill_id].steps += 1;
          m[r.skill_id].hours += r.estimated_hours ?? 0;
        }
        setMeta(m);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      `${s.title} ${s.description ?? ""} ${s.category ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [skills, query]);

  const startSkill = async (skillId: string) => {
    if (!user || busyId) return;
    setBusyId(skillId);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ current_skill_id: skillId })
      .eq("id", user.id);
    if (updateError) {
      setBusyId(null);
      toast(friendlyError(updateError, "Couldn't switch skills. Please try again."), "error");
      return;
    }
    // Join this skill's open cohort (server-side, idempotent). Progress on
    // previous skills is kept — switching back later restores it.
    await supabase.rpc("join_current_cohort", { p_skill_id: skillId });
    logEvent("skill_started", { skill_id: skillId, source: "explore" });
    await refreshProfile();
    toast("Skill started — welcome to your new cohort");
    navigate("/roadmap");
  };

  if (loading) return <AppShell><LoadingScreen label="Loading skills" /></AppShell>;

  return (
    <AppShell>
      <header className="reveal">
        <p className="eyebrow">Explore</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Find your next skill
        </h1>
        <p className="mt-2 max-w-xl leading-relaxed text-fog">
          Every roadmap is a curated path — beginner to advanced — with vetted
          free resources and a cohort of learners starting alongside you.
        </p>
      </header>

      {/* Search */}
      <div className="reveal relative mt-6" style={{ animationDelay: "80ms" }}>
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fog">
          <SearchIcon />
        </span>
        <input
          type="search"
          className="field !pl-11"
          placeholder="Search skills — “python”, “design”, “web”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search skills"
          maxLength={80}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-fog" role="status">
        {filtered.length} skill{filtered.length === 1 ? "" : "s"}
        {query.trim() && ` matching “${query.trim()}”`}
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {filtered.map((skill, i) => {
          const isCurrent = profile?.current_skill_id === skill.id;
          const m = meta[skill.id];
          return (
            <Reveal key={skill.id} delay={Math.min(i * 70, 350)}>
              <article
                className={`group flex h-full flex-col rounded-3xl border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                  isCurrent ? "border-jade/40" : "border-mist"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="eyebrow">{skill.category ?? "Skill"}</div>
                  {isCurrent && (
                    <span className="rounded-full bg-jade px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                      Current
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 font-display text-xl font-bold">{skill.title}</h2>
                {skill.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-fog">
                    {skill.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {m && (
                    <>
                      <MetaChip>{m.steps} steps</MetaChip>
                      <MetaChip>~{Math.ceil(m.hours)}h total</MetaChip>
                    </>
                  )}
                  <MetaChip>Beginner → Advanced</MetaChip>
                </div>

                <div className="mt-5 flex-1" />
                {isCurrent ? (
                  <button onClick={() => navigate("/roadmap")} className="btn-ghost w-full">
                    Continue this roadmap
                  </button>
                ) : (
                  <button
                    onClick={() => void startSkill(skill.id)}
                    disabled={busyId !== null}
                    className="btn-primary w-full"
                  >
                    {busyId === skill.id ? "Joining cohort…" : "Start this skill"}
                  </button>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>

      {filtered.length === 0 && !error && (
        <div className="mt-8 rounded-3xl border border-dashed border-mist bg-card p-8 text-center sm:p-10">
          <p className="font-display text-lg font-bold">
            We don't have “{query.trim()}” yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fog">
            Want us to build it? Leave your email and we'll let you know when
            this roadmap ships — requests tell us what to make next.
          </p>
          <SkillWaitlist key={query.trim()} skillText={query.trim()} defaultEmail={user?.email ?? ""} />
          <button onClick={() => setQuery("")} className="mt-4 text-sm font-medium text-jade-deep hover:underline">
            Clear search instead
          </button>
        </div>
      )}
    </AppShell>
  );
}

/** Demand capture for missing skills → rate-limited `request_skill` RPC. */
function SkillWaitlist({ skillText, defaultEmail }: { skillText: string; defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = cleanText(email, 254).toLowerCase();
    if (validateEmail(cleaned)) {
      toast("Please enter a valid email.", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("request_skill", {
      p_email: cleaned,
      p_skill: cleanText(skillText, 120),
    });
    setBusy(false);
    if (error) {
      toast(friendlyError(error, "Couldn't save your request. Please try again."), "error");
      return;
    }
    setSent(true);
    toast("Request saved — we'll email you when it's ready");
  };

  if (sent) {
    return (
      <p className="mx-auto mt-5 max-w-sm rounded-xl bg-jade-tint px-4 py-3 text-sm font-medium text-jade-deep">
        You're on the list for “{skillText}”.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-5 flex max-w-sm gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email for skill request"
        maxLength={254}
        className="field !py-2.5 text-sm"
      />
      <button type="submit" disabled={busy} className="btn-primary flex-none !px-4 !py-2.5 text-sm">
        {busy ? "Saving…" : "Notify me"}
      </button>
    </form>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-mist bg-paper px-2.5 py-1 font-mono text-[11px] font-medium text-fog">
      {children}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" strokeLinecap="round" />
    </svg>
  );
}
