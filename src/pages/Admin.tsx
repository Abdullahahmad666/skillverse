import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { friendlyError } from "../lib/messages";
import type { Milestone, Resource, RoadmapStep, Skill, Stage, StepLevel } from "../lib/types";

/**
 * Admin content studio (/admin) — author roadmap CONTENT only. The app's
 * structure and its checkpoint / explain / quiz / milestone features are
 * untouched: this edits the exact columns those features already read
 * (roadmap_steps.checkpoint, .ai_explanation, resources, milestones, …).
 *
 * All writes go through the supabase client; migration 0009's RLS policies
 * allow them only for profiles.is_admin users, so the gate below is UX, not
 * the security boundary.
 */
export function AdminPage() {
  const { profile, loading } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadSkills = useCallback(async () => {
    const { data } = await supabase.from("skills").select("*").order("title");
    setSkills((data as Skill[] | null) ?? []);
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  if (loading) return null;
  if (!profile?.is_admin) return <Navigate to="/" replace />;

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  return (
    <AppShell>
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* Skill list */}
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold">Content studio</h1>
        </div>
        <p className="text-xs text-fog">Author roadmaps, steps &amp; resources.</p>
        <div className="mt-3 space-y-1">
          {skills.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedId(s.id);
                setCreating(false);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                s.id === selectedId ? "bg-jade-tint text-jade-deep" : "text-fog hover:bg-mist/40 hover:text-pine"
              }`}
            >
              {s.title}
              <span className="block font-mono text-[10px] text-fog/70">{s.slug}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          className="btn-ghost mt-2 w-full !py-2 text-sm"
        >
          + New skill
        </button>
      </aside>

      {/* Editor */}
      <div className="min-w-0">
        {creating ? (
          <SkillForm
            onSaved={async (id) => {
              await loadSkills();
              setSelectedId(id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <SkillEditor
            key={selected.id}
            skill={selected}
            onSkillChanged={loadSkills}
            onDeleted={() => {
              setSelectedId(null);
              void loadSkills();
            }}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-mist p-10 text-center text-sm text-fog">
            Select a skill on the left, or create a new one.
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}

/* ---------------- Skill create / edit ---------------- */

function SkillForm({
  skill,
  onSaved,
  onCancel,
}: {
  skill?: Skill;
  onSaved: (id: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [slug, setSlug] = useState(skill?.slug ?? "");
  const [title, setTitle] = useState(skill?.title ?? "");
  const [category, setCategory] = useState(skill?.category ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!title.trim()) return setError("Title is required.");
    if (!slug.trim()) return setError("Slug is required (e.g. web-development).");
    if (!/^[a-z0-9-]+$/.test(slug.trim()))
      return setError("Slug can only contain lowercase letters, numbers and hyphens.");
    setError(null);
    setBusy(true);
    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
    };
    const res = skill
      ? await supabase.from("skills").update(payload).eq("id", skill.id).select("id").single()
      : await supabase.from("skills").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) {
      toast(friendlyError(res.error, "Couldn't save the skill."), "error");
      return;
    }
    toast(skill ? "Skill updated" : "Skill created");
    await onSaved((res.data as { id: string }).id);
  };

  return (
    <Section title={skill ? "Skill details" : "New skill"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Title">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Web Development" />
        </Labeled>
        <Labeled label="Slug (URL id)">
          <input className="field" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="web-development" />
        </Labeled>
        <Labeled label="Category">
          <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Programming" />
        </Labeled>
      </div>
      <Labeled label="Description" className="mt-3">
        <textarea
          className="field !resize-none"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences describing the path."
        />
      </Labeled>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary !py-2 text-sm">
          {busy ? "Saving…" : skill ? "Save changes" : "Create skill"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="btn-ghost !py-2 text-sm">
            Cancel
          </button>
        )}
      </div>
    </Section>
  );
}

/* ---------------- One skill: stages, steps, milestones ---------------- */

function SkillEditor({
  skill,
  onSkillChanged,
  onDeleted,
}: {
  skill: Skill;
  onSkillChanged: () => void | Promise<void>;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [stages, setStages] = useState<Stage[]>([]);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const load = useCallback(async () => {
    const [st, sp, ms] = await Promise.all([
      supabase.from("stages").select("*").eq("skill_id", skill.id).order("order_index"),
      supabase.from("roadmap_steps").select("*").eq("skill_id", skill.id).order("order_index"),
      supabase.from("milestones").select("*").eq("skill_id", skill.id).order("order_index"),
    ]);
    setStages((st.data as Stage[] | null) ?? []);
    setSteps((sp.data as RoadmapStep[] | null) ?? []);
    setMilestones((ms.data as Milestone[] | null) ?? []);
  }, [skill.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteSkill = async () => {
    const ok = await confirm({
      title: `Delete "${skill.title}"?`,
      message: "This removes the skill and ALL its stages, steps, resources and milestones. This cannot be undone.",
      confirmLabel: "Delete skill",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("skills").delete().eq("id", skill.id);
    if (error) return toast(friendlyError(error, "Couldn't delete the skill."), "error");
    toast("Skill deleted");
    onDeleted();
  };

  return (
    <div className="space-y-6">
      <SkillForm key={skill.id} skill={skill} onSaved={onSkillChanged} />

      <StagesSection skillId={skill.id} stages={stages} reload={load} />

      <StepsSection skillId={skill.id} steps={steps} stages={stages} reload={load} />

      <MilestonesSection skillId={skill.id} steps={steps} milestones={milestones} reload={load} />

      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-danger">Danger zone</div>
            <div className="text-xs text-fog">Deleting a skill removes its steps, resources and milestones.</div>
          </div>
          <button onClick={deleteSkill} className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10">
            Delete skill
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Stages ---------------- */

function StagesSection({ skillId, stages, reload }: { skillId: string; stages: Stage[]; reload: () => Promise<void>; }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    const order = (stages[stages.length - 1]?.order_index ?? 0) + 1;
    const { error } = await supabase.from("stages").insert({ skill_id: skillId, title: title.trim(), order_index: order });
    if (error) return toast(friendlyError(error, "Couldn't add the stage."), "error");
    setTitle("");
    await reload();
  };

  const rename = async (s: Stage, next: string) => {
    const { error } = await supabase.from("stages").update({ title: next }).eq("id", s.id);
    if (error) toast(friendlyError(error, "Couldn't rename the stage."), "error");
    else await reload();
  };

  const remove = async (s: Stage) => {
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) toast(friendlyError(error, "Couldn't delete the stage."), "error");
    else await reload();
  };

  return (
    <Section title="Stages" hint="Group steps into stages (e.g. “Web foundations”).">
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="font-mono text-xs text-fog">{s.order_index}</span>
            <input
              className="field !py-2 text-sm"
              defaultValue={s.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && rename(s, e.target.value.trim())}
            />
            <button onClick={() => remove(s)} className="rounded-lg px-2 py-2 text-xs text-fog hover:text-danger">Delete</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="field !py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New stage title" />
        <button onClick={add} className="btn-ghost !py-2 text-sm">Add stage</button>
      </div>
    </Section>
  );
}

/* ---------------- Steps ---------------- */

function StepsSection({
  skillId,
  steps,
  stages,
  reload,
}: {
  skillId: string;
  steps: RoadmapStep[];
  stages: Stage[];
  reload: () => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <Section title="Steps" hint="Each step's title, description, checkpoint, explanation & resources.">
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="rounded-xl border border-mist bg-paper/40">
            <button
              onClick={() => setOpenId(openId === step.id ? null : step.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="font-mono text-xs text-fog">{step.order_index}</span>
              <span className="flex-1 text-sm font-medium">{step.title}</span>
              <span className="rounded-full border border-mist px-2 py-0.5 font-mono text-[10px] uppercase text-fog">
                {step.level ?? "beginner"}
              </span>
              <span className="text-fog">{openId === step.id ? "▲" : "▾"}</span>
            </button>
            {openId === step.id && (
              <div className="border-t border-mist px-3 py-3">
                <StepEditor step={step} stages={stages} reload={reload} onClose={() => setOpenId(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-3 rounded-xl border border-jade/30 bg-jade-tint/30 p-3">
          <StepEditor
            skillId={skillId}
            nextOrder={(steps[steps.length - 1]?.order_index ?? 0) + 1}
            stages={stages}
            reload={reload}
            onClose={() => setAdding(false)}
          />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-ghost mt-3 !py-2 text-sm">+ Add step</button>
      )}
    </Section>
  );
}

function StepEditor({
  step,
  skillId,
  nextOrder,
  stages,
  reload,
  onClose,
}: {
  step?: RoadmapStep;
  skillId?: string;
  nextOrder?: number;
  stages: Stage[];
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isNew = !step;
  const [title, setTitle] = useState(step?.title ?? "");
  const [description, setDescription] = useState(step?.description ?? "");
  const [level, setLevel] = useState<StepLevel>(step?.level ?? "beginner");
  const [orderIndex, setOrderIndex] = useState<number>(step?.order_index ?? nextOrder ?? 1);
  const [hours, setHours] = useState<string>(step?.estimated_hours != null ? String(step.estimated_hours) : "");
  const [stageId, setStageId] = useState<string>(step?.stage_id ?? "");
  const [checkpoint, setCheckpoint] = useState(step?.checkpoint ?? "");
  const [explanation, setExplanation] = useState(step?.ai_explanation ?? "");
  const [subtopics, setSubtopics] = useState((step?.subtopics ?? []).join("\n"));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const payload = {
      skill_id: step?.skill_id ?? skillId,
      order_index: orderIndex,
      title: title.trim(),
      description: description.trim() || null,
      level,
      estimated_hours: hours.trim() ? Number(hours) : null,
      stage_id: stageId || null,
      checkpoint: checkpoint.trim() || null,
      ai_explanation: explanation.trim() || null,
      subtopics: subtopics.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const res = isNew
      ? await supabase.from("roadmap_steps").insert(payload).select("id").single()
      : await supabase.from("roadmap_steps").update(payload).eq("id", step!.id).select("id").single();
    setBusy(false);
    if (res.error) {
      toast(friendlyError(res.error, "Couldn't save the step (is the order number unique?)."), "error");
      return;
    }
    toast(isNew ? "Step added" : "Step saved");
    await reload();
    if (isNew) onClose();
  };

  const remove = async () => {
    if (!step) return;
    const ok = await confirm({
      title: `Delete step "${step.title}"?`,
      message: "This also deletes the step's resources.",
      confirmLabel: "Delete step",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("roadmap_steps").delete().eq("id", step.id);
    if (error) return toast(friendlyError(error, "Couldn't delete the step."), "error");
    toast("Step deleted");
    await reload();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_9rem]">
        <Labeled label="Title">
          <input className="field !py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Labeled>
        <Labeled label="Order">
          <input type="number" className="field !py-2 text-sm" value={orderIndex} onChange={(e) => setOrderIndex(Number(e.target.value))} />
        </Labeled>
        <Labeled label="Level">
          <select className="field !py-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value as StepLevel)}>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </Labeled>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Labeled label="Stage">
          <select className="field !py-2 text-sm" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">— none —</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Est. hours">
          <input type="number" step="0.5" className="field !py-2 text-sm" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Labeled>
      </div>

      <Labeled label="Description">
        <textarea className="field !resize-none !py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Labeled>

      <Labeled label="Subtopics (one per line)">
        <textarea className="field !resize-none !py-2 text-sm" rows={3} value={subtopics} onChange={(e) => setSubtopics(e.target.value)} placeholder={"Selectors\nThe box model\nTypography"} />
      </Labeled>

      <Labeled label="Checkpoint (hands-on task)">
        <textarea className="field !resize-none !py-2 text-sm" rows={2} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} placeholder="Build and style a small multi-page site." />
      </Labeled>

      <Labeled label="Explanation (shown by “Explain”; quiz uses this too)">
        <textarea className="field !resize-none !py-2 text-sm" rows={4} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Labeled>

      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className="btn-primary !py-2 text-sm">
          {busy ? "Saving…" : isNew ? "Add step" : "Save step"}
        </button>
        <button onClick={onClose} className="btn-ghost !py-2 text-sm">Close</button>
        {!isNew && (
          <button onClick={remove} className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
            Delete step
          </button>
        )}
      </div>

      {!isNew && step && <ResourcesSection stepId={step.id} />}
    </div>
  );
}

/* ---------------- Resources (per step) ---------------- */

function ResourcesSection({ stepId }: { stepId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Resource[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("resources").select("*").eq("step_id", stepId).order("title");
    setItems((data as Resource[] | null) ?? []);
  }, [stepId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (r: Resource) => {
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) toast(friendlyError(error, "Couldn't delete the resource."), "error");
    else await load();
  };

  return (
    <div className="mt-2 rounded-xl border border-mist bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fog">Free resources</div>
      <div className="space-y-1.5">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="rounded border border-mist px-1.5 py-0.5 font-mono text-[10px] text-fog">{r.type}</span>
            <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-jade-deep hover:underline">{r.title}</a>
            <span className="font-mono text-[10px] text-fog">{r.source}</span>
            <button onClick={() => remove(r)} className="text-xs text-fog hover:text-danger">✕</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-fog">No resources yet.</p>}
      </div>
      <ResourceForm stepId={stepId} onAdded={load} />
    </div>
  );
}

function ResourceForm({ stepId, onAdded }: { stepId: string; onAdded: () => Promise<void>; }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<Resource["type"]>("article");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !/^https?:\/\//.test(url.trim()) || busy) return;
    setBusy(true);
    const { error } = await supabase.from("resources").insert({
      step_id: stepId,
      title: title.trim(),
      url: url.trim(),
      type,
      source: source.trim() || null,
      is_free: true,
    });
    setBusy(false);
    if (error) return toast(friendlyError(error, "Couldn't add the resource (check the URL)."), "error");
    setTitle(""); setUrl(""); setSource("");
    await onAdded();
  };

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_7rem_7rem_auto]">
      <input className="field !py-1.5 text-xs" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" />
      <input className="field !py-1.5 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      <select className="field !py-1.5 text-xs" value={type} onChange={(e) => setType(e.target.value as Resource["type"])}>
        <option value="article">article</option>
        <option value="video">video</option>
        <option value="doc">doc</option>
      </select>
      <input className="field !py-1.5 text-xs" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (MDN)" />
      <button onClick={add} disabled={busy} className="btn-ghost !py-1.5 text-xs">Add</button>
    </div>
  );
}

/* ---------------- Milestones ---------------- */

function MilestonesSection({
  skillId,
  steps,
  milestones,
  reload,
}: {
  skillId: string;
  steps: RoadmapStep[];
  milestones: Milestone[];
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Section title="Milestones" hint="A project unlocked after a given step.">
      <div className="space-y-2">
        {milestones.map((m) => (
          <MilestoneRow key={m.id} milestone={m} steps={steps} reload={reload} />
        ))}
        {milestones.length === 0 && <p className="text-xs text-fog">No milestones yet.</p>}
      </div>
      {adding ? (
        <div className="mt-3 rounded-xl border border-jade/30 bg-jade-tint/30 p-3">
          <MilestoneForm skillId={skillId} nextOrder={(milestones[milestones.length - 1]?.order_index ?? 0) + 1} steps={steps} reload={reload} onClose={() => setAdding(false)} />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-ghost mt-3 !py-2 text-sm">+ Add milestone</button>
      )}
    </Section>
  );
}

function MilestoneRow({ milestone, steps, reload }: { milestone: Milestone; steps: RoadmapStep[]; reload: () => Promise<void>; }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-mist bg-paper/40">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="font-mono text-xs text-fog">{milestone.order_index}</span>
        <span className="flex-1 text-sm font-medium">{milestone.title}</span>
        <span className="text-fog">{open ? "▲" : "▾"}</span>
      </button>
      {open && (
        <div className="border-t border-mist px-3 py-3">
          <MilestoneForm milestone={milestone} steps={steps} reload={reload} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MilestoneForm({
  milestone,
  skillId,
  nextOrder,
  steps,
  reload,
  onClose,
}: {
  milestone?: Milestone;
  skillId?: string;
  nextOrder?: number;
  steps: RoadmapStep[];
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isNew = !milestone;
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [brief, setBrief] = useState(milestone?.project_brief ?? "");
  const [orderIndex, setOrderIndex] = useState(milestone?.order_index ?? nextOrder ?? 1);
  const [afterStep, setAfterStep] = useState(milestone?.after_step_id ?? steps[steps.length - 1]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !afterStep || busy) return;
    setBusy(true);
    const payload = {
      skill_id: milestone?.skill_id ?? skillId,
      order_index: orderIndex,
      title: title.trim(),
      description: description.trim() || null,
      project_brief: brief.trim() || null,
      after_step_id: afterStep,
    };
    const res = isNew
      ? await supabase.from("milestones").insert(payload)
      : await supabase.from("milestones").update(payload).eq("id", milestone!.id);
    setBusy(false);
    if (res.error) return toast(friendlyError(res.error, "Couldn't save the milestone."), "error");
    toast(isNew ? "Milestone added" : "Milestone saved");
    await reload();
    if (isNew) onClose();
  };

  const remove = async () => {
    if (!milestone) return;
    const ok = await confirm({
      title: `Delete milestone "${milestone.title}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("milestones").delete().eq("id", milestone.id);
    if (error) return toast(friendlyError(error, "Couldn't delete the milestone."), "error");
    toast("Milestone deleted");
    await reload();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <Labeled label="Title">
          <input className="field !py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Labeled>
        <Labeled label="Order">
          <input type="number" className="field !py-2 text-sm" value={orderIndex} onChange={(e) => setOrderIndex(Number(e.target.value))} />
        </Labeled>
      </div>
      <Labeled label="Unlocked after step">
        <select className="field !py-2 text-sm" value={afterStep} onChange={(e) => setAfterStep(e.target.value)}>
          {steps.map((s) => (
            <option key={s.id} value={s.id}>{s.order_index}. {s.title}</option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Description">
        <textarea className="field !resize-none !py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Labeled>
      <Labeled label="Project brief">
        <textarea className="field !resize-none !py-2 text-sm" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Build and deploy a personal site to a public URL." />
      </Labeled>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary !py-2 text-sm">
          {busy ? "Saving…" : isNew ? "Add milestone" : "Save milestone"}
        </button>
        <button onClick={onClose} className="btn-ghost !py-2 text-sm">Close</button>
        {!isNew && (
          <button onClick={remove} className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">Delete</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- small UI helpers ---------------- */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-mist bg-card p-4 shadow-card sm:p-5">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-fog">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Labeled({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-fog">{label}</span>
      {children}
    </label>
  );
}
