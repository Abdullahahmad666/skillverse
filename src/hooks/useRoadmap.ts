import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type {
  Milestone,
  Resource,
  RoadmapStep,
  Skill,
  StepStatus,
  UserMilestone,
  UserProgress,
} from "../lib/types";

export interface RoadmapData {
  skill: Skill | null;
  steps: RoadmapStep[];
  resourcesByStep: Record<string, Resource[]>;
  milestones: Milestone[];
  progressByStep: Record<string, UserProgress>;
  achievedMilestones: Record<string, UserMilestone>;
  loading: boolean;
  error: string | null;
  setStepStatus: (stepId: string, status: StepStatus) => Promise<void>;
  doneCount: number;
  totalCount: number;
  progressPercent: number;
  nextStep: RoadmapStep | null;
  nextMilestone: Milestone | null;
}

export function useRoadmap(): RoadmapData {
  const { user, profile } = useAuth();
  const skillId = profile?.current_skill_id ?? null;

  const [skill, setSkill] = useState<Skill | null>(null);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [achieved, setAchieved] = useState<UserMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !skillId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [skillRes, stepsRes, milestonesRes, progressRes, achievedRes] =
          await Promise.all([
            supabase.from("skills").select("*").eq("id", skillId).single(),
            supabase
              .from("roadmap_steps")
              .select("*")
              .eq("skill_id", skillId)
              .order("order_index"),
            supabase
              .from("milestones")
              .select("*")
              .eq("skill_id", skillId)
              .order("order_index"),
            supabase.from("user_progress").select("*").eq("user_id", user.id),
            supabase.from("user_milestones").select("*").eq("user_id", user.id),
          ]);

        const firstError =
          skillRes.error ?? stepsRes.error ?? milestonesRes.error ??
          progressRes.error ?? achievedRes.error;
        if (firstError) throw firstError;

        const stepList = (stepsRes.data ?? []) as RoadmapStep[];
        const stepIds = stepList.map((s) => s.id);
        const resourcesRes = stepIds.length
          ? await supabase.from("resources").select("*").in("step_id", stepIds)
          : { data: [], error: null };
        if (resourcesRes.error) throw resourcesRes.error;

        if (!active) return;
        setSkill(skillRes.data as Skill);
        setSteps(stepList);
        setMilestones((milestonesRes.data ?? []) as Milestone[]);
        setProgress((progressRes.data ?? []) as UserProgress[]);
        setAchieved((achievedRes.data ?? []) as UserMilestone[]);
        setResources((resourcesRes.data ?? []) as Resource[]);
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Couldn't load your roadmap.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, skillId]);

  const progressByStep = useMemo(() => {
    const map: Record<string, UserProgress> = {};
    for (const p of progress) map[p.step_id] = p;
    return map;
  }, [progress]);

  const achievedMilestones = useMemo(() => {
    const map: Record<string, UserMilestone> = {};
    for (const m of achieved) map[m.milestone_id] = m;
    return map;
  }, [achieved]);

  const resourcesByStep = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    for (const r of resources) (map[r.step_id] ??= []).push(r);
    return map;
  }, [resources]);

  /**
   * Recompute milestone achievement from a given progress snapshot.
   * A milestone is achieved when every step up to (and including) its
   * anchor step is done. Un-achieves if a step is unchecked.
   */
  const syncMilestones = useCallback(
    async (nextProgress: UserProgress[]) => {
      if (!user) return;
      const doneIds = new Set(
        nextProgress.filter((p) => p.status === "done").map((p) => p.step_id),
      );
      const orderById: Record<string, number> = {};
      for (const s of steps) orderById[s.id] = s.order_index;

      const shouldBeAchieved = (m: Milestone) => {
        const anchorOrder = orderById[m.after_step_id];
        if (anchorOrder === undefined) return false;
        return steps
          .filter((s) => s.order_index <= anchorOrder)
          .every((s) => doneIds.has(s.id));
      };

      const toInsert = milestones.filter(
        (m) => shouldBeAchieved(m) && !achievedMilestones[m.id],
      );
      const toRemove = milestones.filter(
        (m) => !shouldBeAchieved(m) && achievedMilestones[m.id],
      );

      if (toInsert.length) {
        const rows = toInsert.map((m) => ({
          user_id: user.id,
          milestone_id: m.id,
        }));
        const { data } = await supabase
          .from("user_milestones")
          .upsert(rows, { onConflict: "user_id,milestone_id" })
          .select();
        if (data) {
          setAchieved((prev) => {
            const existing = new Set(prev.map((a) => a.milestone_id));
            return [
              ...prev,
              ...(data as UserMilestone[]).filter(
                (d) => !existing.has(d.milestone_id),
              ),
            ];
          });
        }
      }
      if (toRemove.length) {
        const ids = toRemove.map((m) => m.id);
        await supabase
          .from("user_milestones")
          .delete()
          .eq("user_id", user.id)
          .in("milestone_id", ids);
        setAchieved((prev) => prev.filter((a) => !ids.includes(a.milestone_id)));
      }
    },
    [user, steps, milestones, achievedMilestones],
  );

  const setStepStatus = useCallback(
    async (stepId: string, status: StepStatus) => {
      if (!user) return;
      const completed_at = status === "done" ? new Date().toISOString() : null;

      // Optimistic update.
      const optimistic: UserProgress = progressByStep[stepId]
        ? { ...progressByStep[stepId], status, completed_at }
        : {
            id: `optimistic-${stepId}`,
            user_id: user.id,
            step_id: stepId,
            status,
            completed_at,
          };
      const nextProgress = [
        ...progress.filter((p) => p.step_id !== stepId),
        optimistic,
      ];
      setProgress(nextProgress);

      const { data, error: upsertError } = await supabase
        .from("user_progress")
        .upsert(
          { user_id: user.id, step_id: stepId, status, completed_at },
          { onConflict: "user_id,step_id" },
        )
        .select()
        .single();

      if (upsertError) {
        // Roll back.
        setProgress(progress);
        setError("Couldn't save your progress. Check your connection and try again.");
        return;
      }
      setError(null);
      const confirmed = [
        ...progress.filter((p) => p.step_id !== stepId),
        data as UserProgress,
      ];
      setProgress(confirmed);
      await syncMilestones(confirmed);
    },
    [user, progress, progressByStep, syncMilestones],
  );

  const doneCount = useMemo(
    () =>
      steps.filter((s) => progressByStep[s.id]?.status === "done").length,
    [steps, progressByStep],
  );
  const totalCount = steps.length;
  const progressPercent = totalCount
    ? Math.round((doneCount / totalCount) * 100)
    : 0;

  const nextStep = useMemo(
    () => steps.find((s) => progressByStep[s.id]?.status !== "done") ?? null,
    [steps, progressByStep],
  );

  const nextMilestone = useMemo(
    () => milestones.find((m) => !achievedMilestones[m.id]) ?? null,
    [milestones, achievedMilestones],
  );

  return {
    skill,
    steps,
    resourcesByStep,
    milestones,
    progressByStep,
    achievedMilestones,
    loading,
    error,
    setStepStatus,
    doneCount,
    totalCount,
    progressPercent,
    nextStep,
    nextMilestone,
  };
}
