import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/LoadingScreen";
import { logEvent } from "../lib/analytics";
import type { Skill } from "../lib/types";

export function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Already onboarded? Skip straight to the dashboard.
    if (profile?.current_skill_id) navigate("/", { replace: true });
  }, [profile, navigate]);

  useEffect(() => {
    let active = true;
    supabase
      .from("skills")
      .select("*")
      .order("title")
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError("Couldn't load skills. Refresh to try again.");
        const list = (data ?? []) as Skill[];
        setSkills(list);
        if (list.length === 1) setSelected(list[0].id);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const confirm = async () => {
    if (!user || !selected) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ current_skill_id: selected })
      .eq("id", user.id);
    if (updateError) {
      setBusy(false);
      setError("Couldn't save your choice. Try again.");
      return;
    }
    // Join the current open cohort for this skill (created server-side by a
    // SECURITY DEFINER function if none is open). Non-fatal: the dashboard
    // retries this idempotent RPC on load.
    await supabase.rpc("join_current_cohort", { p_skill_id: selected });
    logEvent("skill_started", { skill_id: selected, source: "onboarding" });
    await refreshProfile();
    navigate("/", { replace: true });
  };

  if (loading) return <LoadingScreen label="Setting up" />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="reveal w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="eyebrow mb-2">Step 1 of 1</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            What do you want to learn?
          </h1>
          <p className="mt-2 text-fog">
            Pick a skill and we'll hand you the full path — steps, milestones,
            and vetted free resources. More skills are coming soon.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="space-y-3" role="radiogroup" aria-label="Choose a skill">
          {skills.map((skill) => {
            const active = selected === skill.id;
            return (
              <button
                key={skill.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(skill.id)}
                className={`w-full rounded-2xl border-2 bg-card p-5 text-left shadow-card transition-all hover:shadow-lift ${
                  active ? "border-jade" : "border-mist"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {skill.category && <div className="eyebrow mb-1">{skill.category}</div>}
                    <h2 className="font-display text-lg font-bold">{skill.title}</h2>
                    {skill.description && (
                      <p className="mt-1 text-sm leading-relaxed text-fog">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                      active ? "border-jade bg-jade text-white" : "border-mist"
                    }`}
                  >
                    {active && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={confirm}
          disabled={!selected || busy}
          className="btn-primary mt-6 w-full"
        >
          {busy ? "Building your roadmap…" : "Start learning"}
        </button>
      </div>
    </div>
  );
}
