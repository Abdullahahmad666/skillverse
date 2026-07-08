import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { useRoadmap } from "../hooks/useRoadmap";
import { supabase } from "../lib/supabase";
import { useToast } from "../context/ToastContext";
import { friendlyError } from "../lib/messages";
import {
  cleanText,
  validateAvatarUrl,
  validateDisplayName,
  validateUsername,
} from "../lib/sanitize";

export function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const {
    skill,
    doneCount,
    totalCount,
    progressPercent,
    milestones,
    achievedMilestones,
    loading,
  } = useRoadmap();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
      setShowOnLeaderboard(profile.show_on_leaderboard ?? false);
    }
  }, [profile]);

  if (!profile || loading) {
    return <AppShell><LoadingScreen /></AppShell>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaved(false);

    const uname = cleanText(username, 20);
    const dname = cleanText(displayName, 60);
    const aurl = cleanText(avatarUrl, 500);

    const validationError =
      validateUsername(uname) ??
      validateDisplayName(dname) ??
      validateAvatarUrl(aurl);
    if (validationError) return setError(validationError);

    setBusy(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username: uname,
        display_name: dname,
        avatar_url: aurl === "" ? null : aurl,
        show_on_leaderboard: showOnLeaderboard,
      })
      .eq("id", user.id);
    setBusy(false);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "That username is taken. Try another."
          : friendlyError(updateError, "Couldn't save your profile. Please try again."),
      );
      return;
    }
    await refreshProfile();
    setSaved(true);
    toast("Profile saved");
  };

  const achievedCount = Object.keys(achievedMilestones).length;

  return (
    <AppShell>
      <header className="reveal flex items-center gap-4">
        <Avatar
          size="lg"
          name={profile.display_name || profile.username || "?"}
          url={profile.avatar_url}
        />
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {profile.display_name || profile.username}
          </h1>
          {profile.username && (
            <p className="font-mono text-sm text-fog">@{profile.username}</p>
          )}
        </div>
      </header>

      {/* Progress summary */}
      <section
        aria-label="Progress summary"
        className="reveal mt-6 grid grid-cols-3 gap-3"
        style={{ animationDelay: "80ms" }}
      >
        <SummaryStat label="Current skill" value={skill?.title ?? "—"} />
        <SummaryStat
          label="Steps done"
          value={totalCount ? `${doneCount} / ${totalCount}` : "—"}
          hint={totalCount ? `${progressPercent}%` : undefined}
        />
        <SummaryStat
          label="Milestones"
          value={milestones.length ? `${achievedCount} / ${milestones.length}` : "—"}
        />
      </section>

      {/* Edit form */}
      <section
        aria-label="Edit profile"
        className="reveal mt-6 rounded-2xl border border-mist bg-card p-6 shadow-card"
        style={{ animationDelay: "160ms" }}
      >
        <h2 className="font-display text-lg font-bold">Edit profile</h2>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-lg bg-jade-tint px-3 py-2 text-sm text-jade-deep">
              Profile saved.
            </p>
          )}
          <div>
            <label htmlFor="p-username" className="eyebrow mb-1.5 block">Username</label>
            <input
              id="p-username"
              type="text"
              className="field"
              value={username}
              maxLength={20}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="learner_01"
            />
            <p className="mt-1 text-xs text-fog">
              3–20 characters. Letters, numbers, underscores.
            </p>
          </div>
          <div>
            <label htmlFor="p-display" className="eyebrow mb-1.5 block">Display name</label>
            <input
              id="p-display"
              type="text"
              className="field"
              value={displayName}
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your name appears"
            />
          </div>
          <div>
            <label htmlFor="p-avatar" className="eyebrow mb-1.5 block">
              Avatar URL <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="p-avatar"
              type="url"
              className="field"
              value={avatarUrl}
              maxLength={500}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-mist bg-paper p-4">
            <div>
              <label htmlFor="p-leaderboard" className="block text-sm font-semibold">
                Show me on the cohort leaderboard
              </label>
              <p className="mt-0.5 text-xs leading-relaxed text-fog">
                Cohort-mates see only your display name, avatar, and milestone
                count — never your detailed progress. Off means you're fully
                hidden from others.
              </p>
            </div>
            <button
              id="p-leaderboard"
              type="button"
              role="switch"
              aria-checked={showOnLeaderboard}
              onClick={() => setShowOnLeaderboard((v) => !v)}
              className={`relative mt-0.5 h-6 w-11 flex-none rounded-full transition-colors ${
                showOnLeaderboard ? "bg-jade" : "bg-mist"
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-[left] duration-200 ${
                  showOnLeaderboard ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-mist bg-card p-4 shadow-card">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 truncate font-display text-base font-bold sm:text-lg">
        {value}
      </div>
      {hint && <div className="font-mono text-xs text-jade-deep">{hint}</div>}
    </div>
  );
}
