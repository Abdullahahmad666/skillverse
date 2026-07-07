import { Avatar } from "./Avatar";
import type { LeaderboardRow } from "../lib/types";

const TOP_N = 5;

interface Props {
  /** Rows pre-sorted by milestones desc, joined_at asc (from get_cohort_leaderboard). */
  rows: LeaderboardRow[];
  currentUserId: string;
  /** Whether the current user is visible to others (profiles.show_on_leaderboard). */
  optedIn: boolean;
  milestonesTotal: number;
}

/** https/http only — profile URLs are DB-constrained, this is defense in depth. */
function safeAvatarUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Cohort leaderboard: top members ranked by milestones passed, with the
 * current user's row always shown (and highlighted) even outside the top.
 * The data source only ever contains opted-in users + the viewer — opt-out
 * is enforced by RLS/the security-definer RPC, not here.
 */
export function Leaderboard({ rows, currentUserId, optedIn, milestonesTotal }: Props) {
  // Competition ranking: rank = 1 + count of members with strictly more milestones.
  const rankOf = (row: LeaderboardRow) =>
    1 + rows.filter((r) => r.milestones_passed > row.milestones_passed).length;

  const top = rows.slice(0, TOP_N);
  const self = rows.find((r) => r.user_id === currentUserId) ?? null;
  const selfOutsideTop = self !== null && !top.some((r) => r.user_id === self.user_id);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-mist bg-paper px-4 py-6 text-center text-sm text-fog">
        Your cohort leaderboard will appear here once members show up.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5" aria-label="Cohort leaderboard">
      {top.map((row, i) => (
        <LeaderRow
          key={row.user_id}
          row={row}
          rank={rankOf(row)}
          isSelf={row.user_id === currentUserId}
          optedIn={optedIn}
          milestonesTotal={milestonesTotal}
          delay={i * 60}
        />
      ))}
      {selfOutsideTop && self && (
        <>
          <li aria-hidden className="py-0.5 text-center font-mono text-xs tracking-[0.5em] text-fog">
            ···
          </li>
          <LeaderRow
            row={self}
            rank={rankOf(self)}
            isSelf
            optedIn={optedIn}
            milestonesTotal={milestonesTotal}
            delay={TOP_N * 60}
          />
        </>
      )}
    </ol>
  );
}

function LeaderRow({
  row,
  rank,
  isSelf,
  optedIn,
  milestonesTotal,
  delay,
}: {
  row: LeaderboardRow;
  rank: number;
  isSelf: boolean;
  optedIn: boolean;
  milestonesTotal: number;
  delay: number;
}) {
  const name = row.display_name || row.username || "Learner";
  const pct = milestonesTotal > 0 ? (row.milestones_passed / milestonesTotal) * 100 : 0;

  return (
    <li
      className={`reveal flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        isSelf
          ? "bg-jade-tint ring-1 ring-jade/25"
          : "hover:bg-paper"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold ${
          rank === 1
            ? "bg-marigold text-white shadow-card"
            : rank <= 3
              ? "bg-pine text-paper"
              : "bg-paper text-fog"
        }`}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      <Avatar name={name} url={safeAvatarUrl(row.avatar_url)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-semibold ${isSelf ? "text-jade-deep" : "text-pine"}`}>
            {name}
          </span>
          {isSelf && (
            <span className="flex-none rounded-full bg-jade px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
              You
            </span>
          )}
        </div>
        {isSelf && !optedIn ? (
          <span className="flex items-center gap-1 text-[11px] text-fog">
            <EyeOffIcon /> Only visible to you
          </span>
        ) : (
          row.username && (
            <span className="block truncate font-mono text-[11px] text-fog">
              @{row.username}
            </span>
          )
        )}
      </div>

      <div className="flex flex-none flex-col items-end gap-1">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-pine">
          <FlagIcon className={row.milestones_passed > 0 ? "text-marigold" : "text-mist"} />
          {row.milestones_passed}
          <span className="font-normal text-fog">/ {milestonesTotal}</span>
        </span>
        <span className="h-1 w-16 overflow-hidden rounded-full bg-mist" aria-hidden>
          <span
            className="block h-full rounded-full bg-jade transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
    </li>
  );
}

function FlagIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 21V4a1 1 0 0 1 1-1h11.3a1 1 0 0 1 .8 1.6L15.8 8l2.3 3.4a1 1 0 0 1-.8 1.6H7v8H5Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a16.3 16.3 0 0 1-3.2 4.2M6.6 6.6A16 16 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
    </svg>
  );
}
