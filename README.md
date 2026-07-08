# SkillVerse — V2

A curated, step-by-step roadmap app for beginners. One skill (Web Development) with vetted free resources, reviewed AI explanations, milestones, and per-user progress tracking. V2 adds **cohorts** (monthly groups of learners who start together), a **streak-and-standing dashboard**, and a **cohort-relative, opt-in leaderboard**. Community lives in an external Discord.

**Stack:** React + Vite + TypeScript + Tailwind · Supabase (Postgres, Auth, Edge Functions).

---

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the entire contents of
   `supabase/migrations/0001_init.sql`. This creates all tables, **enables RLS
   with policies on every table**, adds the signup trigger, and seeds the Web
   Development roadmap (steps, resources, milestones, reviewed explanations).
3. Run the entire contents of `supabase/migrations/0002_cohorts_and_dashboard.sql`
   (V2: cohorts, cohort members, streak stats, and the `join_current_cohort` /
   `get_cohort_standing` functions — all with RLS), then
   `supabase/migrations/0003_leaderboard_function.sql` (replaces the interim
   leaderboard view with the `get_cohort_leaderboard` security-definer
   function, per Supabase linter guidance), and finally
   `supabase/migrations/0004_levels_and_more_skills.sql` (adds
   beginner/intermediate/advanced levels to roadmap steps and seeds two more
   skills: Python Programming and UX Design), then
   `supabase/migrations/0005_feedback_analytics.sql` (feedback, skill
   requests, and funnel events — RLS-locked tables written only through
   rate-limited security-definer RPCs; reads are admin/service-role only).
4. In **Authentication → Providers**, make sure Email is enabled. In
   **Authentication → URL Configuration**, add your site URL(s) — including
   `http://localhost:5173` for local dev — so password-reset redirect links work.

## 2. Frontend environment variables

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → anon / public key |
| `VITE_DISCORD_URL` | Your Discord invite link |

Only the **anon (public)** key goes in the frontend. RLS enforces every access
rule server-side. Never put the `service_role` key or any AI key in `.env`,
in source, or anywhere the browser can reach.

## 3. Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Sign up, confirm your email if confirmation is enabled, pick Web Development
in onboarding, and you're on the roadmap.

## 4. Edge Function secrets & deployment

The two functions live in `supabase/functions/`. Deploy with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Secrets — these never touch the frontend:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ADMIN_USER_IDS=<your-auth-user-uuid>   # comma-separated for several admins

supabase functions deploy explain-step
supabase functions deploy generate-roadmap-draft
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected into functions automatically — don't set them yourself.)

### How the AI flow works in V1

- The app **only reads stored `ai_explanation` text from the database** — no
  live AI calls on page views.
- `explain-step` (POST, signed-in): returns the stored explanation. An admin
  can pass `{"step_id": "...", "regenerate": true, "save": true}` to generate
  a fresh one with the AI provider, review it, and persist it.
- `generate-roadmap-draft` (POST, **admin only**): pass
  `{"skill_title": "UX Design", "step_count": 12}` and get a draft roadmap as
  JSON to review and insert yourself. It never writes to the database.
- Both functions verify the caller's JWT and apply **per-user and per-IP rate
  limits** backed by the `edge_function_calls` table (RLS-locked to the
  service role).

Example admin call:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-roadmap-draft" \
  -H "Authorization: Bearer YOUR_USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"skill_title": "Web Development", "step_count": 12}'
```

## 5. Deploy the frontend

Any static host works (Netlify, Vercel, Cloudflare Pages):

```bash
npm run build      # outputs dist/
```

- Set the three `VITE_*` environment variables in your host's dashboard.
- Add an SPA rewrite so all routes serve `index.html`
  (Netlify: `/* /index.html 200` in `_redirects`; Vercel handles Vite SPAs automatically).
- Add the deployed URL to Supabase **Authentication → URL Configuration**.

## How V2 numbers are computed

**Cohorts.** On enrolling in a skill, the client calls the
`join_current_cohort(skill_id)` RPC — a `SECURITY DEFINER` function that finds
the open cohort for that skill (one per skill, enforced by a partial unique
index), creates one if none is open, closes open cohorts from previous months
(monthly windows, rotated lazily — no cron needed), and inserts the caller's
membership. Clients can never write `cohorts` directly. The dashboard calls
the same idempotent RPC on load, which also migrates pre-V2 accounts.

**Streaks.** A streak is consecutive UTC days with at least one step completed.
A `SECURITY DEFINER` trigger on `user_progress` bumps `user_stats`
(`current_streak`, `longest_streak`, `last_active_date`) whenever a row
transitions into `done`: same day → unchanged, yesterday → +1, otherwise reset
to 1. Un-checking a step never shrinks a streak. The client renders a lapsed
streak (last activity before yesterday) as 0.

**Milestones passed.** Derived live, never cached: a count of
`user_milestones` rows joined to the cohort skill's `milestones`. (V1 rule: a
milestone is achieved when every step up to its anchor step is done, synced in
`useRoadmap`.) The leaderboard and "ahead of N%" standing rank by this count —
not raw checkboxes. **TODO(V3):** when checkpoint quizzes ship, count a
milestone only when its quiz is passed (marked in `get_cohort_leaderboard`).

**Leaderboard privacy.** `profiles.show_on_leaderboard` defaults to `false`
(users are prompted once on the dashboard). The `get_cohort_leaderboard`
security-definer function only returns rows where the target user opted in (or
is the viewer), only for cohorts the viewer belongs to, and only exposes
display name, username, avatar, and milestone count. `get_cohort_standing` returns
pure aggregates (member count, members behind you) so opted-out members are
counted anonymously but never listed. Opt-out is enforced at the DB layer —
no client query can return an opted-out user.

## Feedback & launch analytics (V2.3)

- **Feedback widget** (floating button on every page, works signed out):
  writes rating + optional message via the `submit_feedback` RPC — max 5 per
  caller per hour, keyed by user id or client IP.
- **Skill requests**: when an Explore search has no match, users can leave an
  email via `request_skill` (max 3/hour per caller) — demand per skill lands
  in `skill_requests`.
- **Funnel events** (`signup`, `skill_started`, `step_completed`,
  `roadmap_viewed`, `feedback_submitted`) go to the `events` table via the
  authenticated-only `log_event` RPC (name whitelist + rate limit in the DB).
  Note: with email confirmation enabled the `signup` event is skipped (no
  session exists yet at signup time).
- All three tables have **RLS enabled with zero policies** — clients cannot
  read or write them directly; the definer RPCs are the only write path, and
  reads happen in the Supabase dashboard (service role) only. Text is
  control-character-stripped and length-capped in the database on the way in.
- **User-facing messages**: `src/lib/messages.ts` maps internal errors to
  safe copy (real errors go to the console only); `ToastContext` is the
  single notification layer. Login and password reset are anti-enumeration:
  identical responses whether or not the email exists.

## Security checklist (already implemented)

- ✅ RLS enabled on **every** table; policies exactly as specced (owner-only
  writes on `profiles`, ownership on `user_progress` / `user_milestones`,
  read-only content tables, service-role-only rate-limit table).
- ✅ `service_role` and AI keys exist only as Supabase Function secrets.
- ✅ No `dangerouslySetInnerHTML` anywhere; React escapes all rendered text;
  inputs validated/normalized before writes; DB `CHECK` constraints back it up.
- ✅ All queries go through the Supabase client (parameterized) — no raw SQL
  strings in app code.
- ✅ Rate limiting (per-user **and** per-IP) on both Edge Functions.

## Project structure

```
src/
  components/    AppShell, StepCard + StatusControl + MilestoneMarker,
                 ProgressRing, Avatar, ProtectedRoute, LoadingScreen
  context/       AuthContext (session + profile)
  hooks/         useRoadmap (data, progress mutations, milestone auto-achieve)
  lib/           supabase client, types, input validation
  pages/         AuthPages (login/signup/forgot/reset), Onboarding,
                 Dashboard, Roadmap, Explore (skill search + switch),
                 Profile
supabase/
  migrations/    0001_init.sql (schema + RLS + seed)
  functions/     explain-step, generate-roadmap-draft, _shared
```
