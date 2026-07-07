-- ============================================================
-- SkillVerse V1 — schema, Row Level Security, seed content
-- Run this whole file in the Supabase SQL editor (or `supabase db push`).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text,
  category    text
);

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name     text check (char_length(display_name) <= 60),
  avatar_url       text check (avatar_url is null or (avatar_url ~ '^https?://' and char_length(avatar_url) <= 500)),
  current_skill_id uuid references public.skills (id),
  created_at       timestamptz not null default now()
);

create table public.roadmap_steps (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references public.skills (id) on delete cascade,
  order_index     integer not null,
  title           text not null,
  description     text,
  ai_explanation  text,
  estimated_hours numeric(5,1),
  unique (skill_id, order_index)
);

create table public.resources (
  id      uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.roadmap_steps (id) on delete cascade,
  title   text not null,
  url     text not null check (url ~ '^https?://'),
  type    text not null check (type in ('video', 'article', 'doc')),
  is_free boolean not null default true,
  source  text
);

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  skill_id      uuid not null references public.skills (id) on delete cascade,
  order_index   integer not null,
  title         text not null,
  description   text,
  after_step_id uuid not null references public.roadmap_steps (id) on delete cascade,
  unique (skill_id, order_index)
);

create table public.user_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  step_id      uuid not null references public.roadmap_steps (id) on delete cascade,
  status       text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  completed_at timestamptz,
  unique (user_id, step_id)
);

create table public.user_milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  achieved_at  timestamptz not null default now(),
  unique (user_id, milestone_id)
);

-- Used by Edge Functions for per-user / per-IP rate limiting.
-- RLS is enabled with NO policies: only the service role (Edge Functions) can touch it.
create table public.edge_function_calls (
  id        bigint generated always as identity primary key,
  fn        text not null,
  caller    text not null,
  called_at timestamptz not null default now()
);
create index edge_function_calls_lookup
  on public.edge_function_calls (fn, caller, called_at desc);

create index user_progress_user_idx on public.user_progress (user_id);
create index roadmap_steps_skill_idx on public.roadmap_steps (skill_id, order_index);
create index resources_step_idx on public.resources (step_id);

-- ------------------------------------------------------------
-- Row Level Security — enabled on EVERY table
-- ------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.skills              enable row level security;
alter table public.roadmap_steps       enable row level security;
alter table public.resources           enable row level security;
alter table public.milestones          enable row level security;
alter table public.user_progress       enable row level security;
alter table public.user_milestones     enable row level security;
alter table public.edge_function_calls enable row level security;

-- profiles: any authenticated user can read; only the owner can insert/update their row.
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Content tables: read-only to authenticated users. No insert/update/delete
-- policies exist, so writes are denied for everyone except the service role.
create policy "skills readable by authenticated users"
  on public.skills for select to authenticated using (true);

create policy "roadmap steps readable by authenticated users"
  on public.roadmap_steps for select to authenticated using (true);

create policy "resources readable by authenticated users"
  on public.resources for select to authenticated using (true);

create policy "milestones readable by authenticated users"
  on public.milestones for select to authenticated using (true);

-- user_progress: users can only see and manage their own rows.
create policy "users read own progress"
  on public.user_progress for select to authenticated
  using (user_id = auth.uid());

create policy "users insert own progress"
  on public.user_progress for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update own progress"
  on public.user_progress for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own progress"
  on public.user_progress for delete to authenticated
  using (user_id = auth.uid());

-- user_milestones: same ownership rule.
create policy "users read own milestones"
  on public.user_milestones for select to authenticated
  using (user_id = auth.uid());

create policy "users insert own milestones"
  on public.user_milestones for insert to authenticated
  with check (user_id = auth.uid());

create policy "users delete own milestones"
  on public.user_milestones for delete to authenticated
  using (user_id = auth.uid());

-- edge_function_calls: RLS enabled, zero policies → service-role only. (Intentional.)

-- ------------------------------------------------------------
-- Auto-create a profile row on signup
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Seed: Web Development skill, 12 steps, resources, 3 milestones.
-- ai_explanation values were generated via the explain-step Edge Function,
-- reviewed by the admin, and stored here — the app reads them from the DB.
-- ------------------------------------------------------------

insert into public.skills (id, slug, title, description, category) values
('11111111-1111-4111-8111-111111111111', 'web-development', 'Web Development',
 'Go from zero to building and shipping real websites: HTML, CSS, JavaScript, Git, and React.',
 'Programming');

insert into public.roadmap_steps (id, skill_id, order_index, title, description, ai_explanation, estimated_hours) values
('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1,
 'How the web works',
 'Browsers, servers, HTTP, URLs, and DNS — the moving parts behind every page load.',
 'Before writing any code, it helps to know what actually happens when you type a URL and press Enter. Your browser looks up the server''s address (DNS), asks it for a page (HTTP), and receives files it renders on screen. Everything you build later — HTML, CSS, JavaScript, APIs — plugs into this request-and-response loop, so a rough mental model here makes every later step less mysterious. Don''t memorize details; just aim to explain the journey of a page load in your own words.',
 4),
('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2,
 'HTML fundamentals',
 'Structure content with elements, attributes, forms, and semantic tags.',
 'HTML is the skeleton of every web page: headings, paragraphs, links, images, and forms. It is not a programming language — it''s a way of labeling content so browsers (and screen readers, and search engines) understand it. Focus on semantic tags like <header>, <nav>, <main>, and <article>, because using the right element for the job is what separates clean pages from tag soup. Build a small multi-page site about anything you like; typing tags by hand is how they stick.',
 8),
('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 3,
 'CSS fundamentals',
 'Selectors, the box model, colors, typography, and basic layout.',
 'CSS turns your HTML skeleton into something people actually want to look at. The two ideas that unlock everything are selectors (how you point at elements) and the box model (every element is a box with content, padding, border, and margin). Most beginner frustration is box-model confusion, so slow down here and inspect elements in your browser''s DevTools constantly. Style the site you built in the HTML step — restyling real work beats styling toy examples.',
 12),
('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 4,
 'Responsive layout: Flexbox & Grid',
 'Build layouts that adapt to any screen with Flexbox, Grid, and media queries.',
 'More than half of web traffic is on phones, so pages must adapt to any screen size. Flexbox handles one-dimensional layouts (rows or columns) and Grid handles two-dimensional ones; together they replace the layout hacks of the past. Media queries let you change styles at specific widths, but a well-structured Flexbox or Grid layout often adapts with barely any of them. The games linked below make practicing these genuinely fun — finish both.',
 10),
('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 5,
 'Git & GitHub',
 'Track changes, write commits, push to GitHub, and publish with GitHub Pages.',
 'Git is a save system for your code: every commit is a checkpoint you can return to, and GitHub is where those checkpoints live online. Every developer job and every collaboration runs through it, so learning it early means all your future practice work becomes a visible portfolio for free. You only need a small daily vocabulary — status, add, commit, push, pull — plus branches. Put your HTML/CSS site on GitHub and publish it with GitHub Pages: your first live URL.',
 6),
('a0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 6,
 'JavaScript basics',
 'Variables, types, functions, conditionals, loops, arrays, and objects.',
 'JavaScript is where your pages come alive — it''s the programming language of the browser. This step is the longest on the roadmap because programming fundamentals (variables, functions, loops, arrays, objects) are a new way of thinking, not just new syntax. Expect confusion; it''s the feeling of your brain building the muscle. Write tiny programs constantly and type every example yourself instead of reading passively — copy-paste teaches nothing.',
 20),
('a0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 7,
 'The DOM & events',
 'Select elements, react to clicks and input, and update the page from code.',
 'The DOM (Document Object Model) is the browser''s live, editable version of your HTML — JavaScript can read it, change it, and listen to it. Events are how the page talks back: clicks, keypresses, form submissions. Once you can select an element, attach a listener, and update the page in response, you can build real interfaces. Cement it by building small classics: a counter, a to-do list, a tip calculator.',
 10),
('a0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 8,
 'Working with APIs & fetch',
 'Request live data with fetch, handle promises and async/await, parse JSON.',
 'APIs let your page pull in live data — weather, movies, GitHub profiles — instead of only showing what you typed. The fetch function makes the request, and because the answer takes time, JavaScript uses promises and async/await to handle "do this when the data arrives." JSON is simply the text format the data travels in, and it looks almost exactly like JavaScript objects. Build one small app against a free public API and this clicks quickly.',
 8),
('a0000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 9,
 'Modern JavaScript & tooling',
 'ES6+ features, modules, npm, and how a Vite project fits together.',
 'Real projects aren''t one giant script file. Modern JavaScript splits code into modules that import each other, npm installs packages other people wrote, and tools like Vite bundle it all for the browser. You''ll also lock in the ES6+ features professional code uses everywhere: arrow functions, destructuring, template literals, and spread. This step is mostly about becoming comfortable with a project folder that has node_modules and a package.json in it — every framework, including React next, assumes this setup.',
 8),
('a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 10,
 'React fundamentals',
 'Components, props, state, and rendering lists — thinking in React.',
 'React is the most widely used tool for building interfaces, and its core idea is simple: describe your UI as components (reusable functions that return markup), and when data changes, React updates the page for you. The mental shift from "manually update the DOM" to "update state, let React re-render" is the whole game. Stick to the official react.dev tutorial and docs — they are genuinely excellent — and rebuild your earlier to-do list in React to feel the difference.',
 20),
('a0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 11,
 'Build & deploy a real project',
 'Plan, build, and ship a complete project of your own to a public URL.',
 'Tutorials teach syntax; a project of your own teaches you to be a developer. Pick something small but genuinely yours — a tracker for a hobby, a tool a friend would use — and take it from blank folder to public URL on Netlify or Vercel (both free). You will get stuck, and working through being stuck by reading docs and searching is the single most important professional skill you''ll practice here. Finished and imperfect beats ambitious and abandoned.',
 10),
('a0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 12,
 'Portfolio & what''s next',
 'Polish your GitHub, write READMEs, assemble a simple portfolio, and pick a direction.',
 'You now have real work — this step makes it visible. Clean up your GitHub profile, write a short README for each project (what it does, what you learned, a link to the live version), and put together a simple portfolio page using the skills you already have. Then look at the roadmap ahead: deeper React, TypeScript, and backend basics are the common next directions. You''re no longer asking "where do I start" — you''re choosing where to go.',
 6);

insert into public.resources (step_id, title, url, type, is_free, source) values
('a0000000-0000-4000-8000-000000000001', 'How the Internet works', 'https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/How_does_the_Internet_work', 'article', true, 'MDN'),
('a0000000-0000-4000-8000-000000000001', 'How the web works: HTTP and the browser', 'https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/How_the_Web_works', 'doc', true, 'MDN'),
('a0000000-0000-4000-8000-000000000002', 'HTML basics', 'https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/HTML_basics', 'doc', true, 'MDN'),
('a0000000-0000-4000-8000-000000000002', 'freeCodeCamp: Responsive Web Design (HTML sections)', 'https://www.freecodecamp.org/learn/2022/responsive-web-design/', 'article', true, 'freeCodeCamp'),
('a0000000-0000-4000-8000-000000000003', 'CSS first steps', 'https://developer.mozilla.org/en-US/docs/Learn/CSS/First_steps', 'doc', true, 'MDN'),
('a0000000-0000-4000-8000-000000000003', 'The Odin Project: Foundations — CSS', 'https://www.theodinproject.com/paths/foundations/courses/foundations', 'article', true, 'The Odin Project'),
('a0000000-0000-4000-8000-000000000004', 'Flexbox Froggy (practice game)', 'https://flexboxfroggy.com/', 'article', true, 'Codepip'),
('a0000000-0000-4000-8000-000000000004', 'Grid Garden (practice game)', 'https://cssgridgarden.com/', 'article', true, 'Codepip'),
('a0000000-0000-4000-8000-000000000004', 'A complete guide to Flexbox', 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/', 'article', true, 'CSS-Tricks'),
('a0000000-0000-4000-8000-000000000005', 'Git and GitHub for beginners (video)', 'https://www.youtube.com/watch?v=RGOj5yH7evk', 'video', true, 'freeCodeCamp'),
('a0000000-0000-4000-8000-000000000005', 'GitHub Pages: publish your site', 'https://pages.github.com/', 'doc', true, 'GitHub'),
('a0000000-0000-4000-8000-000000000006', 'The Modern JavaScript Tutorial — Part 1', 'https://javascript.info/', 'doc', true, 'javascript.info'),
('a0000000-0000-4000-8000-000000000006', 'freeCodeCamp: JavaScript Algorithms and Data Structures', 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8/', 'article', true, 'freeCodeCamp'),
('a0000000-0000-4000-8000-000000000007', 'Introduction to browser events', 'https://javascript.info/introduction-browser-events', 'doc', true, 'javascript.info'),
('a0000000-0000-4000-8000-000000000007', 'DOM manipulation crash course (video)', 'https://www.youtube.com/watch?v=y17RuWkWdn8', 'video', true, 'Traversy Media'),
('a0000000-0000-4000-8000-000000000008', 'Using the Fetch API', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', 'doc', true, 'MDN'),
('a0000000-0000-4000-8000-000000000008', 'Async/await explained', 'https://javascript.info/async-await', 'doc', true, 'javascript.info'),
('a0000000-0000-4000-8000-000000000009', 'JavaScript modules', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules', 'doc', true, 'MDN'),
('a0000000-0000-4000-8000-000000000009', 'Vite: getting started', 'https://vitejs.dev/guide/', 'doc', true, 'Vite'),
('a0000000-0000-4000-8000-000000000010', 'React: quick start & tutorial', 'https://react.dev/learn', 'doc', true, 'react.dev'),
('a0000000-0000-4000-8000-000000000010', 'Thinking in React', 'https://react.dev/learn/thinking-in-react', 'doc', true, 'react.dev'),
('a0000000-0000-4000-8000-000000000011', 'Deploying a site on Netlify', 'https://docs.netlify.com/get-started/', 'doc', true, 'Netlify'),
('a0000000-0000-4000-8000-000000000011', '5 project ideas to level up (video)', 'https://www.youtube.com/watch?v=8Nd8beCf1sY', 'video', true, 'YouTube'),
('a0000000-0000-4000-8000-000000000012', 'How to write a good README', 'https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/', 'article', true, 'freeCodeCamp'),
('a0000000-0000-4000-8000-000000000012', 'Frontend roadmap: what comes next', 'https://roadmap.sh/frontend', 'article', true, 'roadmap.sh');

insert into public.milestones (id, skill_id, order_index, title, description, after_step_id) values
('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1,
 'First page, styled by you',
 'You can structure and style a real web page from scratch.',
 'a0000000-0000-4000-8000-000000000003'),
('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2,
 'Interactive developer',
 'Your pages are live on GitHub and respond to users with JavaScript.',
 'a0000000-0000-4000-8000-000000000007'),
('b0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 3,
 'Shipped to the web',
 'You built a React project of your own and put it in front of the world.',
 'a0000000-0000-4000-8000-000000000012');
