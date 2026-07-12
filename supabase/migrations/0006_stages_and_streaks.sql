-- ============================================================
-- SkillVerse V3 — stages, in-depth steps, streak freezes & timezone
-- Run after 0005.
--
-- Feature 1 (interactive roadmap):
--   * stages table + roadmap_steps.stage_id (steps group into stages)
--   * roadmap_steps.subtopics (jsonb string array) + checkpoint (text)
--   * milestones.project_brief (the project to build)
--   * user_milestones insert policy now ALSO requires the milestone to be
--     unlocked (all steps up to its anchor done) — enforced in the DB, so
--     the leaderboard's "milestones passed" metric can't be faked.
--   NOTE: roadmap_steps.level (difficulty) already exists from 0004 and
--   user_milestones/user_progress ownership RLS from 0001 — verified, unchanged.
--
-- Feature 2 (streaks):
--   * user_stats gains streak_freezes_available (default 1),
--     freezes_refilled_at, timezone (IANA name, validated via RPC).
--   * bump_user_streak is rewritten: timezone-aware day boundary, grace
--     freeze for a single missed day, weekly freeze refill; it now also
--     fires on user_milestones inserts (completing a project counts).
--   Timezone approach: the client reports its IANA timezone once per
--   session via set_user_timezone(); the trigger computes "today" as
--   (now() AT TIME ZONE user_stats.timezone)::date, defaulting to UTC.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Stages (content: read-only to clients, like all content tables)
-- ------------------------------------------------------------

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  skill_id    uuid not null references public.skills (id) on delete cascade,
  order_index integer not null,
  title       text not null,
  unique (skill_id, order_index)
);
alter table public.stages enable row level security;
create policy "stages readable by authenticated users"
  on public.stages for select to authenticated using (true);
-- No write policies: content is managed by the service role only.

alter table public.roadmap_steps
  add column if not exists stage_id  uuid references public.stages (id),
  add column if not exists subtopics jsonb not null default '[]'::jsonb,
  add column if not exists checkpoint text;

alter table public.milestones
  add column if not exists project_brief text;

-- ------------------------------------------------------------
-- 2. Milestone completion is now a user action, gated in the DB
-- ------------------------------------------------------------

-- A milestone is unlocked once every step up to (and including) its anchor
-- step is done for that user.
create or replace function public.milestone_unlocked(p_milestone_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1
    from public.milestones m
    join public.roadmap_steps anchor on anchor.id = m.after_step_id
    join public.roadmap_steps s
      on s.skill_id = m.skill_id and s.order_index <= anchor.order_index
    where m.id = p_milestone_id
      and not exists (
        select 1 from public.user_progress up
        where up.user_id = p_user_id and up.step_id = s.id and up.status = 'done'
      )
  );
$$;
revoke execute on function public.milestone_unlocked(uuid, uuid) from public, anon;
grant  execute on function public.milestone_unlocked(uuid, uuid) to authenticated;

drop policy "users insert own milestones" on public.user_milestones;
create policy "users insert own unlocked milestones"
  on public.user_milestones for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.milestone_unlocked(milestone_id, auth.uid())
  );

-- Completing a milestone project is a funnel event.
alter table public.events drop constraint if exists events_event_name_check;
alter table public.events add constraint events_event_name_check
  check (event_name in ('signup', 'skill_started', 'step_completed',
                        'roadmap_viewed', 'feedback_submitted', 'milestone_completed'));

create or replace function public.log_event(p_event_name text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  perform public.rl_check('log_event', 120, interval '1 hour');
  if p_event_name not in
     ('signup', 'skill_started', 'step_completed', 'roadmap_viewed',
      'feedback_submitted', 'milestone_completed') then
    raise exception 'invalid_input';
  end if;
  if pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 2048 then
    raise exception 'invalid_input';
  end if;
  insert into public.events (user_id, event_name, metadata)
  values (auth.uid(), p_event_name, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ------------------------------------------------------------
-- 3. Streaks: freezes, timezone, grace — trigger rewrite
-- ------------------------------------------------------------

alter table public.user_stats
  add column if not exists streak_freezes_available integer not null default 1
    check (streak_freezes_available between 0 and 1),
  add column if not exists freezes_refilled_at date not null default current_date,
  add column if not exists timezone text not null default 'UTC'
    check (char_length(timezone) <= 64);

-- Client reports its IANA timezone (validated by actually evaluating it).
-- This is the only client-writable field of user_stats, and only via RPC —
-- streak counters themselves stay trigger-only so they can't be forged.
create or replace function public.set_user_timezone(p_tz text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_tz is null or char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z0-9_+/\-]+$' then
    raise exception 'invalid_input';
  end if;
  begin
    perform now() at time zone p_tz;  -- throws for unknown zone names
  exception when others then
    raise exception 'invalid_input';
  end;
  insert into public.user_stats (user_id, timezone)
  values (auth.uid(), p_tz)
  on conflict (user_id) do update
    set timezone = excluded.timezone, updated_at = now();
end;
$$;
revoke execute on function public.set_user_timezone(text) from public, anon;
grant  execute on function public.set_user_timezone(text) to authenticated;

-- A day "counts" when the user completes a step (user_progress → done) or
-- completes a milestone project (user_milestones insert).
-- Grace: exactly one missed day + a freeze available → the freeze is
-- consumed and the streak continues. Freezes refill to 1 once per week.
-- Unchecking work never shrinks a streak.
create or replace function public.bump_user_streak()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_qualifies boolean;
  v_stats     public.user_stats%rowtype;
  v_today     date;
  v_gap       integer;
  v_streak    integer;
  v_freezes   integer;
  v_refilled  date;
begin
  if tg_table_name = 'user_milestones' then
    v_qualifies := (tg_op = 'INSERT');
  else
    v_qualifies := (tg_op = 'INSERT' and new.status = 'done')
      or (tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done');
  end if;
  if not v_qualifies then
    return new;
  end if;

  select * into v_stats from public.user_stats
   where user_id = new.user_id for update;

  if not found then
    insert into public.user_stats
      (user_id, current_streak, longest_streak, last_active_date, updated_at)
    values
      (new.user_id, 1, 1, (now() at time zone 'UTC')::date, now())
    on conflict (user_id) do nothing;
    return new;
  end if;

  v_today   := (now() at time zone coalesce(v_stats.timezone, 'UTC'))::date;
  v_freezes := v_stats.streak_freezes_available;
  v_refilled := v_stats.freezes_refilled_at;

  -- Weekly refill (max 1 banked freeze).
  if v_freezes < 1 and v_refilled <= v_today - 7 then
    v_freezes := 1;
    v_refilled := v_today;
  end if;

  if v_stats.last_active_date is null then
    v_streak := 1;
  else
    v_gap := v_today - v_stats.last_active_date;
    if v_gap <= 0 then
      v_streak := v_stats.current_streak;          -- already counted today
    elsif v_gap = 1 then
      v_streak := v_stats.current_streak + 1;      -- consecutive day
    elsif v_gap = 2 and v_freezes > 0 then
      v_freezes := v_freezes - 1;                  -- grace: freeze covers the miss
      v_streak := v_stats.current_streak + 1;
    else
      v_streak := 1;                               -- lapsed with no freeze
    end if;
  end if;

  update public.user_stats
     set current_streak = v_streak,
         longest_streak = greatest(longest_streak, v_streak),
         last_active_date = v_today,
         streak_freezes_available = v_freezes,
         freezes_refilled_at = v_refilled,
         updated_at = now()
   where user_id = new.user_id;

  return new;
end;
$$;

-- (Re)attach triggers: the user_progress one already exists from 0002 and
-- picks up the replaced function automatically; milestones are new.
drop trigger if exists on_user_milestone_added on public.user_milestones;
create trigger on_user_milestone_added
  after insert on public.user_milestones
  for each row execute function public.bump_user_streak();

-- ------------------------------------------------------------
-- 4. Seed: stages, subtopics, checkpoints, project briefs
-- ------------------------------------------------------------

insert into public.stages (id, skill_id, order_index, title) values
-- Web Development (milestone anchors: steps 3, 7, 12)
('51000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1, 'Web foundations'),
('51000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2, 'Interactive pages'),
('51000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 3, 'React & shipping'),
-- Python (anchors: 3, 6, 9)
('52000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 1, 'Python basics'),
('52000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 2, 'Working with real data'),
('52000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 3, 'Real-world Python'),
-- UX Design (anchors: 3, 6, 9)
('53000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 1, 'Understand users'),
('53000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 2, 'Design the solution'),
('53000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 3, 'Prototype & prove it');

-- Assign steps to stages (aligned so each stage ends at a milestone anchor).
update public.roadmap_steps set stage_id = '51000000-0000-4000-8000-000000000001'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index between 1 and 3;
update public.roadmap_steps set stage_id = '51000000-0000-4000-8000-000000000002'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index between 4 and 7;
update public.roadmap_steps set stage_id = '51000000-0000-4000-8000-000000000003'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index between 8 and 12;
update public.roadmap_steps set stage_id = '52000000-0000-4000-8000-000000000001'
 where skill_id = '22222222-2222-4222-8222-222222222222' and order_index between 1 and 3;
update public.roadmap_steps set stage_id = '52000000-0000-4000-8000-000000000002'
 where skill_id = '22222222-2222-4222-8222-222222222222' and order_index between 4 and 6;
update public.roadmap_steps set stage_id = '52000000-0000-4000-8000-000000000003'
 where skill_id = '22222222-2222-4222-8222-222222222222' and order_index between 7 and 9;
update public.roadmap_steps set stage_id = '53000000-0000-4000-8000-000000000001'
 where skill_id = '33333333-3333-4333-8333-333333333333' and order_index between 1 and 3;
update public.roadmap_steps set stage_id = '53000000-0000-4000-8000-000000000002'
 where skill_id = '33333333-3333-4333-8333-333333333333' and order_index between 4 and 6;
update public.roadmap_steps set stage_id = '53000000-0000-4000-8000-000000000003'
 where skill_id = '33333333-3333-4333-8333-333333333333' and order_index between 7 and 9;

-- Web Development: subtopics + checkpoints
update public.roadmap_steps set
  subtopics = '["Browsers & servers","HTTP requests & responses","DNS & domain names","Anatomy of a URL"]'::jsonb,
  checkpoint = 'Draw what happens between typing a URL and seeing a page — six boxes or fewer — and explain it out loud to someone.'
 where id = 'a0000000-0000-4000-8000-000000000001';
update public.roadmap_steps set
  subtopics = '["Elements & attributes","Headings, lists & links","Images & media","Forms & inputs","Semantic tags"]'::jsonb,
  checkpoint = 'Build a three-page site about a hobby with a nav linking the pages, using at least ten different semantic tags.'
 where id = 'a0000000-0000-4000-8000-000000000002';
update public.roadmap_steps set
  subtopics = '["Selectors & specificity","The box model","Colors & typography","Inspecting with DevTools"]'::jsonb,
  checkpoint = 'Style your HTML site with your own fonts, color palette, and spacing — no frameworks allowed.'
 where id = 'a0000000-0000-4000-8000-000000000003';
update public.roadmap_steps set
  subtopics = '["Flexbox axes & alignment","Grid templates & areas","Media queries","Mobile-first workflow"]'::jsonb,
  checkpoint = 'Make your site fully responsive — single column on mobile, grid on desktop — and finish Flexbox Froggy and Grid Garden.'
 where id = 'a0000000-0000-4000-8000-000000000004';
update public.roadmap_steps set
  subtopics = '["init, add, commit","Branches & merging","Pushing to GitHub","Publishing with GitHub Pages"]'::jsonb,
  checkpoint = 'Publish your site on GitHub Pages with a history of at least ten meaningful commits.'
 where id = 'a0000000-0000-4000-8000-000000000005';
update public.roadmap_steps set
  subtopics = '["Variables & types","Functions","Conditionals & loops","Arrays & objects"]'::jsonb,
  checkpoint = 'Write a console number-guessing game that uses functions, a loop, and conditionals.'
 where id = 'a0000000-0000-4000-8000-000000000006';
update public.roadmap_steps set
  subtopics = '["Selecting elements","Event listeners","Creating & updating nodes","Reading form input"]'::jsonb,
  checkpoint = 'Build a to-do list in the browser: add, complete, and delete items with no page reloads.'
 where id = 'a0000000-0000-4000-8000-000000000007';
update public.roadmap_steps set
  subtopics = '["fetch & promises","async/await","Parsing JSON","Loading & error states"]'::jsonb,
  checkpoint = 'Build a mini-app against a free public API with visible loading and error states.'
 where id = 'a0000000-0000-4000-8000-000000000008';
update public.roadmap_steps set
  subtopics = '["ES modules & imports","npm & package.json","The Vite dev server","Arrow functions, destructuring, spread"]'::jsonb,
  checkpoint = 'Split your API app into modules and run it as a Vite project.'
 where id = 'a0000000-0000-4000-8000-000000000009';
update public.roadmap_steps set
  subtopics = '["Components & props","State & events","Conditional rendering","Rendering lists"]'::jsonb,
  checkpoint = 'Rebuild your to-do app in React using at least three components and lifted state.'
 where id = 'a0000000-0000-4000-8000-000000000010';
update public.roadmap_steps set
  subtopics = '["Scoping a small project","Component structure","Debugging & reading docs","Deploying to Netlify or Vercel"]'::jsonb,
  checkpoint = 'Ship a project of your own — idea to public URL.'
 where id = 'a0000000-0000-4000-8000-000000000011';
update public.roadmap_steps set
  subtopics = '["Writing READMEs","Polishing your GitHub profile","A simple portfolio page","Choosing your next path"]'::jsonb,
  checkpoint = 'Publish a portfolio page linking three projects, each with a written README.'
 where id = 'a0000000-0000-4000-8000-000000000012';

-- Python: subtopics + checkpoints
update public.roadmap_steps set
  subtopics = '["Installing Python","Using the REPL","Running .py files","print() & comments"]'::jsonb,
  checkpoint = 'Write and run a script (from a file, not the REPL) that prints a formatted introduction of yourself.'
 where id = 'c0000000-0000-4000-8000-000000000001';
update public.roadmap_steps set
  subtopics = '["Numbers & strings","Booleans","input() & output","f-strings"]'::jsonb,
  checkpoint = 'Build a tip calculator that takes user input and prints a cleanly formatted result.'
 where id = 'c0000000-0000-4000-8000-000000000002';
update public.roadmap_steps set
  subtopics = '["if / elif / else","while loops","for & range","break & continue"]'::jsonb,
  checkpoint = 'Build a number-guessing game that counts attempts and offers a replay.'
 where id = 'c0000000-0000-4000-8000-000000000003';
update public.roadmap_steps set
  subtopics = '["def & parameters","Return values","Scope","Modules & import"]'::jsonb,
  checkpoint = 'Refactor your game into functions split across two modules that import each other.'
 where id = 'c0000000-0000-4000-8000-000000000004';
update public.roadmap_steps set
  subtopics = '["Lists & tuples","Dictionaries","Sets","Comprehensions"]'::jsonb,
  checkpoint = 'Build a word-frequency counter that reports the top ten words in any text.'
 where id = 'c0000000-0000-4000-8000-000000000005';
update public.roadmap_steps set
  subtopics = '["Reading & writing files","The with statement","try / except","Raising errors"]'::jsonb,
  checkpoint = 'Make your word counter accept any file path and fail gracefully on missing or unreadable files.'
 where id = 'c0000000-0000-4000-8000-000000000006';
update public.roadmap_steps set
  subtopics = '["Classes & instances","Methods & attributes","__init__ & __repr__","When OOP helps"]'::jsonb,
  checkpoint = 'Model a bank account as a class — deposit, withdraw, history — with errors for overdrafts.'
 where id = 'c0000000-0000-4000-8000-000000000007';
update public.roadmap_steps set
  subtopics = '["Virtual environments","pip install","Reading library docs","requests & web APIs"]'::jsonb,
  checkpoint = 'In a fresh venv, use requests to fetch and display live data from a public API.'
 where id = 'c0000000-0000-4000-8000-000000000008';
update public.roadmap_steps set
  subtopics = '["Scoping a project","Structuring a repo","Writing a README","Publishing on GitHub"]'::jsonb,
  checkpoint = 'Ship a small CLI tool of your own to GitHub with a README and usage examples.'
 where id = 'c0000000-0000-4000-8000-000000000009';

-- UX Design: subtopics + checkpoints
update public.roadmap_steps set
  subtopics = '["UX vs UI","The design process","Roles in a product team","Learning from famous failures"]'::jsonb,
  checkpoint = 'Write a one-page breakdown of a product you love: what exactly makes its experience work?'
 where id = 'd0000000-0000-4000-8000-000000000001';
update public.roadmap_steps set
  subtopics = '["Interview technique","Open vs leading questions","Lightweight surveys","Synthesizing notes"]'::jsonb,
  checkpoint = 'Interview two people about a daily task and write down five insights you did not expect.'
 where id = 'd0000000-0000-4000-8000-000000000002';
update public.roadmap_steps set
  subtopics = '["Proto-personas","Journey stages","Pain points","Opportunity mapping"]'::jsonb,
  checkpoint = 'Create one persona and one journey map from your interview notes.'
 where id = 'd0000000-0000-4000-8000-000000000003';
update public.roadmap_steps set
  subtopics = '["Mental models","Card sorting","Site maps","Navigation & labeling"]'::jsonb,
  checkpoint = 'Run a mini card sort with a friend and draw the site map it produces.'
 where id = 'd0000000-0000-4000-8000-000000000004';
update public.roadmap_steps set
  subtopics = '["Sketching fast","Low-fidelity wireframes","Flows across screens","Annotating decisions"]'::jsonb,
  checkpoint = 'Wireframe your solution''s key flow across five to eight screens, on paper or in a free tool.'
 where id = 'd0000000-0000-4000-8000-000000000005';
update public.roadmap_steps set
  subtopics = '["Visual hierarchy","Spacing & alignment","Type & color basics","Laws of UX"]'::jsonb,
  checkpoint = 'Redesign one wireframe applying three named principles — and write down which and why.'
 where id = 'd0000000-0000-4000-8000-000000000006';
update public.roadmap_steps set
  subtopics = '["Frames & components","Auto layout","Prototype connections","Sharing for feedback"]'::jsonb,
  checkpoint = 'Turn your wireframed flow into a clickable Figma prototype.'
 where id = 'd0000000-0000-4000-8000-000000000007';
update public.roadmap_steps set
  subtopics = '["Planning a test","Think-aloud protocol","Observing without leading","Turning findings into changes"]'::jsonb,
  checkpoint = 'Run think-aloud tests with three people and list what you would change.'
 where id = 'd0000000-0000-4000-8000-000000000008';
update public.roadmap_steps set
  subtopics = '["Case study structure","Storytelling","Showing process, not just screens","Presenting your work"]'::jsonb,
  checkpoint = 'Publish a case study covering problem → research → design → test → result.'
 where id = 'd0000000-0000-4000-8000-000000000009';

-- Milestone project briefs
update public.milestones set project_brief =
  'Build and style a personal multi-page website from scratch — semantic HTML structure, styled entirely with your own CSS, no frameworks.'
 where id = 'b0000000-0000-4000-8000-000000000001';
update public.milestones set project_brief =
  'Put your site live on GitHub Pages and add a JavaScript-powered interactive feature to it — your to-do list or something better.'
 where id = 'b0000000-0000-4000-8000-000000000002';
update public.milestones set project_brief =
  'Plan, build, and deploy a complete React app of your own to a public URL, with a README that explains what it does and why.'
 where id = 'b0000000-0000-4000-8000-000000000003';
update public.milestones set project_brief =
  'A replayable number-guessing game in the terminal — loops, conditionals, functions, and clean output.'
 where id = 'e0000000-0000-4000-8000-000000000001';
update public.milestones set project_brief =
  'A file-reading word-frequency tool that survives bad input gracefully and reports the top ten words of any text.'
 where id = 'e0000000-0000-4000-8000-000000000002';
update public.milestones set project_brief =
  'A small CLI tool of your own on GitHub — fresh venv, at least one third-party library, README with usage examples.'
 where id = 'e0000000-0000-4000-8000-000000000003';
update public.milestones set project_brief =
  'A research pack for a real problem: two interviews, one persona, and one journey map.'
 where id = 'f0000000-0000-4000-8000-000000000001';
update public.milestones set project_brief =
  'An annotated wireframe set for your solution''s core flow, organized by a card-sort-informed site map.'
 where id = 'f0000000-0000-4000-8000-000000000002';
update public.milestones set project_brief =
  'A clickable Figma prototype tested with three people, written up as a portfolio case study.'
 where id = 'f0000000-0000-4000-8000-000000000003';
