export type StepStatus = "not_started" | "in_progress" | "done";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  current_skill_id: string | null;
  show_on_leaderboard: boolean;
  created_at: string;
}

export interface Skill {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
}

export type StepLevel = "beginner" | "intermediate" | "advanced";

export interface RoadmapStep {
  id: string;
  skill_id: string;
  order_index: number;
  /** Optional until migration 0004 is applied; treat missing as "beginner". */
  level?: StepLevel;
  title: string;
  description: string | null;
  ai_explanation: string | null;
  estimated_hours: number | null;
}

export interface Resource {
  id: string;
  step_id: string;
  title: string;
  url: string;
  type: "video" | "article" | "doc";
  is_free: boolean;
  source: string | null;
}

export interface Milestone {
  id: string;
  skill_id: string;
  order_index: number;
  title: string;
  description: string | null;
  after_step_id: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  step_id: string;
  status: StepStatus;
  completed_at: string | null;
}

export interface UserMilestone {
  id: string;
  user_id: string;
  milestone_id: string;
  achieved_at: string;
}

// --- V2: cohorts, streaks, leaderboard ---

export interface Cohort {
  id: string;
  skill_id: string;
  label: string;
  start_date: string;
  status: "open" | "closed";
  created_at: string;
}

export interface UserStats {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  updated_at: string;
}

/** One row from the `get_cohort_leaderboard` security-definer RPC.
 *  Only safe fields: name, avatar, milestone count. */
export interface LeaderboardRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  joined_at: string;
  milestones_passed: number;
}

/** Aggregates from the `get_cohort_standing` RPC. */
export interface CohortStanding {
  total_members: number;
  members_behind: number;
  my_milestones: number;
}
