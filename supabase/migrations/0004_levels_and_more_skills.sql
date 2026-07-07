-- ============================================================
-- SkillVerse V2.2 — step levels + two more seeded skills
-- Run after 0003. Adds:
--   * roadmap_steps.level ('beginner' | 'intermediate' | 'advanced')
--   * levels for the existing Web Development roadmap
--   * two new skills with full roadmaps: Python Programming, UX Design
-- Content tables stay read-only to clients (RLS from 0001 unchanged).
-- ============================================================

alter table public.roadmap_steps
  add column if not exists level text not null default 'beginner'
  check (level in ('beginner', 'intermediate', 'advanced'));

-- Levels for the seeded Web Development roadmap.
update public.roadmap_steps set level = 'beginner'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index <= 5;
update public.roadmap_steps set level = 'intermediate'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index between 6 and 9;
update public.roadmap_steps set level = 'advanced'
 where skill_id = '11111111-1111-4111-8111-111111111111' and order_index >= 10;

-- ------------------------------------------------------------
-- Seed: Python Programming
-- ------------------------------------------------------------

insert into public.skills (id, slug, title, description, category) values
('22222222-2222-4222-8222-222222222222', 'python', 'Python Programming',
 'Learn to program from scratch with the friendliest mainstream language: scripts, data structures, files, and your first real project.',
 'Programming');

insert into public.roadmap_steps (id, skill_id, order_index, level, title, description, ai_explanation, estimated_hours) values
('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 1, 'beginner',
 'Install Python & first steps',
 'Set up Python, meet the REPL, and run your first script from a file.',
 'Getting Python installed and printing something to the screen removes the biggest barrier to programming: setup. The interactive REPL lets you test ideas instantly, and you''ll use that habit for the rest of the roadmap. Finish by running a program from a .py file, not just the prompt — that''s how real projects work.',
 3),
('c0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 2, 'beginner',
 'Variables & data types',
 'Numbers, strings, booleans, input and output — the raw material of every program.',
 'Every program is data being transformed, so start by getting comfortable with Python''s basic types and how variables name them. Type every example yourself and predict the output before running it — the misses teach you more than the hits. f-strings and input() let you make tiny interactive programs immediately.',
 6),
('c0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 3, 'beginner',
 'Control flow',
 'Make decisions with if/elif/else and repeat work with while and for loops.',
 'Control flow is where code starts to feel like programming: branching on conditions and looping over work. It''s also where beginners hit their first real confusion, which is normal — trace programs line by line on paper when you''re stuck. Build small classics like a number-guessing game; they exercise every concept in this step.',
 8),
('c0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 4, 'intermediate',
 'Functions & modules',
 'Package logic into reusable functions and split programs across files.',
 'Functions turn repeated code into named, testable building blocks — they''re the single biggest jump in code quality you''ll make. Learn parameters, return values, and scope, then split a growing script into modules that import each other. If you can explain the difference between printing and returning, you''ve got it.',
 8),
('c0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 5, 'intermediate',
 'Data structures',
 'Lists, dictionaries, tuples, sets, and comprehensions — organizing real data.',
 'Most practical Python is choosing the right container: lists for sequences, dicts for lookups, sets for uniqueness. Comprehensions then let you transform them in one readable line. Practice by modeling real things — a contact book, a word counter — because choosing structures for real data is the actual skill.',
 10),
('c0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 6, 'intermediate',
 'Files & error handling',
 'Read and write files, handle exceptions, and make programs that survive bad input.',
 'Real programs touch the outside world — files that are missing, input that''s malformed — and exceptions are Python''s way of coping without crashing. Learn try/except/finally and the with-statement for files. A program that fails gracefully is the difference between a script and software.',
 8),
('c0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 7, 'advanced',
 'Object-oriented Python',
 'Classes, methods, and attributes — modeling things instead of just steps.',
 'Classes let you bundle data and the functions that act on it into one concept, which is how large programs stay understandable. Don''t aim for textbook OOP theory; aim to model something concrete like a bank account or a deck of cards. You''ll also finally understand what all those objects you''ve been using actually are.',
 10),
('c0000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 8, 'advanced',
 'Packages & the ecosystem',
 'Virtual environments, pip, and third-party libraries like requests.',
 'Python''s superpower is its ecosystem: someone has already written the hard part of almost anything you want to build. Learn to create a virtual environment, install packages with pip, and read library documentation. Fetching live data from a web API with requests makes this step click.',
 8),
('c0000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 9, 'advanced',
 'Build & share a project',
 'Take an idea of your own from empty folder to a project on GitHub.',
 'Tutorials end; projects begin. Pick something small and genuinely yours — a habit tracker, a file organizer, a tiny game — and push through the stuck moments by reading docs and searching, because that persistence is the professional skill. Put it on GitHub with a README so your work is visible.',
 12);

insert into public.resources (step_id, title, url, type, is_free, source) values
('c0000000-0000-4000-8000-000000000001', 'Python for beginners: getting started', 'https://www.python.org/about/gettingstarted/', 'doc', true, 'python.org'),
('c0000000-0000-4000-8000-000000000001', 'How to get started with Python', 'https://realpython.com/python-first-steps/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000002', 'An informal introduction to Python', 'https://docs.python.org/3/tutorial/introduction.html', 'doc', true, 'python.org'),
('c0000000-0000-4000-8000-000000000002', 'W3Schools Python tutorial (basics)', 'https://www.w3schools.com/python/', 'article', true, 'W3Schools'),
('c0000000-0000-4000-8000-000000000003', 'Automate the Boring Stuff — Flow control', 'https://automatetheboringstuff.com/2e/chapter2/', 'article', true, 'Automate the Boring Stuff'),
('c0000000-0000-4000-8000-000000000003', 'Learn Python — full course for beginners (video)', 'https://www.youtube.com/watch?v=rfscVS0vtbw', 'video', true, 'freeCodeCamp'),
('c0000000-0000-4000-8000-000000000004', 'Defining functions (official tutorial)', 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions', 'doc', true, 'python.org'),
('c0000000-0000-4000-8000-000000000004', 'Defining your own Python function', 'https://realpython.com/defining-your-own-python-function/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000005', 'Data structures (official tutorial)', 'https://docs.python.org/3/tutorial/datastructures.html', 'doc', true, 'python.org'),
('c0000000-0000-4000-8000-000000000005', 'Lists and tuples in Python', 'https://realpython.com/python-lists-tuples/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000006', 'Automate the Boring Stuff — Reading and writing files', 'https://automatetheboringstuff.com/2e/chapter9/', 'article', true, 'Automate the Boring Stuff'),
('c0000000-0000-4000-8000-000000000006', 'Python exceptions: an introduction', 'https://realpython.com/python-exceptions/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000007', 'Classes (official tutorial)', 'https://docs.python.org/3/tutorial/classes.html', 'doc', true, 'python.org'),
('c0000000-0000-4000-8000-000000000007', 'Object-oriented programming in Python 3', 'https://realpython.com/python3-object-oriented-programming/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000008', 'Installing packages with pip and venv', 'https://packaging.python.org/en/latest/tutorials/installing-packages/', 'doc', true, 'PyPA'),
('c0000000-0000-4000-8000-000000000008', 'Python''s requests library (guide)', 'https://realpython.com/python-requests/', 'article', true, 'Real Python'),
('c0000000-0000-4000-8000-000000000009', 'Python projects for beginners', 'https://www.freecodecamp.org/news/python-projects-for-beginners/', 'article', true, 'freeCodeCamp'),
('c0000000-0000-4000-8000-000000000009', 'How to write a good README', 'https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/', 'article', true, 'freeCodeCamp');

insert into public.milestones (id, skill_id, order_index, title, description, after_step_id) values
('e0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 1,
 'Thinking in code',
 'You can write small programs with variables, conditions, and loops.',
 'c0000000-0000-4000-8000-000000000003'),
('e0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 2,
 'Confident scripter',
 'You structure programs with functions and handle real data and errors.',
 'c0000000-0000-4000-8000-000000000006'),
('e0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 3,
 'Project shipped',
 'You built a Python project of your own and published it on GitHub.',
 'c0000000-0000-4000-8000-000000000009');

-- ------------------------------------------------------------
-- Seed: UX Design
-- ------------------------------------------------------------

insert into public.skills (id, slug, title, description, category) values
('33333333-3333-4333-8333-333333333333', 'ux-design', 'UX Design',
 'Design products people actually understand: research, wireframes, visual principles, prototyping in Figma, and a portfolio case study.',
 'Design');

insert into public.roadmap_steps (id, skill_id, order_index, level, title, description, ai_explanation, estimated_hours) values
('d0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 1, 'beginner',
 'What UX actually is',
 'The field, the process, and how UX differs from UI, graphic design, and research.',
 'UX is the practice of making products work for the humans using them — the visuals are only one slice of it. Understanding the whole loop (research, structure, interface, testing) up front keeps you from equating UX with "making screens pretty." You should finish this step able to explain what a UX designer does all day.',
 3),
('d0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 2, 'beginner',
 'User research fundamentals',
 'Interviews, surveys, and observation — learning what users need, not what they say.',
 'Every good design decision traces back to something you learned about real users, and interviews are the workhorse method. The craft is asking open questions about past behavior instead of pitching your idea and hearing polite lies. Practice by interviewing two friends about how they plan trips or manage money — you''ll be surprised what surfaces.',
 8),
('d0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 3, 'beginner',
 'Personas & journey maps',
 'Turn research into shareable pictures of who users are and what they go through.',
 'Personas condense research into a memorable character; journey maps plot their steps, moods, and pain points over time. Both exist to stop teams designing for "everyone," which means designing for no one. Build one persona and one journey map from the interviews you ran in the last step.',
 6),
('d0000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 4, 'intermediate',
 'Information architecture',
 'Organize content so people can find things: structures, labels, and card sorting.',
 'Before any screen is drawn, someone decides how content is grouped, named, and navigated — that''s information architecture. Get it wrong and no amount of visual polish saves the product. Card sorting is the classic technique: try a quick one on a friend using sticky notes or a free online tool.',
 6),
('d0000000-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', 5, 'intermediate',
 'Wireframing',
 'Sketch low-fidelity layouts fast to explore ideas before committing to pixels.',
 'Wireframes are deliberately rough so you can try five layouts in the time polish would cost you for one. Boxes and labels on paper are a legitimate professional tool — fidelity comes later. Wireframe a familiar app''s key flow from memory, then compare with the real thing to see what its designers prioritized.',
 8),
('d0000000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', 6, 'intermediate',
 'Visual design principles',
 'Hierarchy, spacing, typography, color, and the psychology behind what feels "clean."',
 'A handful of principles — visual hierarchy, proximity, contrast, consistency — explain most of why some interfaces feel effortless. The Laws of UX give you named patterns (Fitts''s Law, Hick''s Law) you can cite in design decisions. Redesign one of your wireframes applying deliberate hierarchy and spacing; the before/after will convince you.',
 8),
('d0000000-0000-4000-8000-000000000007', '33333333-3333-4333-8333-333333333333', 7, 'advanced',
 'Prototyping in Figma',
 'Build clickable prototypes: components, auto layout, and interactive flows.',
 'Figma is the industry-standard tool, and prototypes are how designs get tested before a line of code exists. Learn frames, components, and auto layout, then wire screens together into a clickable flow. Rebuild your wireframed flow at higher fidelity — this artifact becomes the heart of your portfolio piece.',
 10),
('d0000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', 8, 'advanced',
 'Usability testing',
 'Watch five people use your prototype and learn to love what breaks.',
 'Testing with even five users uncovers most serious problems, and watching someone struggle with your design is the fastest UX education there is. Master the think-aloud protocol: ask users to narrate, then stay quiet and resist helping. Run tests on your Figma prototype and iterate on what you observe.',
 8),
('d0000000-0000-4000-8000-000000000009', '33333333-3333-4333-8333-333333333333', 9, 'advanced',
 'Portfolio case study',
 'Package your process — research to tested prototype — into a story employers read.',
 'A UX portfolio is judged on how you think, not just how the final screens look, so the case study format is: problem, research, decisions, iterations, outcome. You''ve produced every ingredient in the previous eight steps. Write it up honestly — including what you''d do differently — because reflection reads as seniority.',
 10);

insert into public.resources (step_id, title, url, type, is_free, source) values
('d0000000-0000-4000-8000-000000000001', 'The definition of user experience (UX)', 'https://www.nngroup.com/articles/definition-user-experience/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000001', 'What is UX design?', 'https://www.interaction-design.org/literature/topics/ux-design', 'article', true, 'IxDF'),
('d0000000-0000-4000-8000-000000000002', 'User interviews 101', 'https://www.nngroup.com/articles/user-interviews/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000002', 'When to use which UX research method', 'https://www.nngroup.com/articles/which-ux-research-methods/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000003', 'Personas 101', 'https://www.nngroup.com/articles/persona/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000003', 'Journey mapping 101', 'https://www.nngroup.com/articles/journey-mapping-101/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000004', 'Information architecture: study guide', 'https://www.nngroup.com/articles/ia-study-guide/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000004', 'Card sorting: uncover users'' mental models', 'https://www.nngroup.com/articles/card-sorting-definition/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000005', 'What is wireframing?', 'https://www.figma.com/resource-library/what-is-wireframing/', 'article', true, 'Figma'),
('d0000000-0000-4000-8000-000000000005', 'What are wireframes?', 'https://balsamiq.com/learn/articles/what-are-wireframes/', 'article', true, 'Balsamiq'),
('d0000000-0000-4000-8000-000000000006', 'Laws of UX', 'https://lawsofux.com/', 'article', true, 'Laws of UX'),
('d0000000-0000-4000-8000-000000000006', 'Visual hierarchy in UX: definition', 'https://www.nngroup.com/articles/visual-hierarchy-ux-definition/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000007', 'Guide to prototyping in Figma', 'https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma', 'doc', true, 'Figma'),
('d0000000-0000-4000-8000-000000000007', 'Design basics (Figma resource library)', 'https://www.figma.com/resource-library/design-basics/', 'article', true, 'Figma'),
('d0000000-0000-4000-8000-000000000008', 'Usability testing 101', 'https://www.nngroup.com/articles/usability-testing-101/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000008', 'Thinking aloud: the #1 usability tool', 'https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/', 'article', true, 'NN/g'),
('d0000000-0000-4000-8000-000000000009', 'How to create a UX portfolio', 'https://www.interaction-design.org/literature/article/how-to-create-a-ux-portfolio', 'article', true, 'IxDF'),
('d0000000-0000-4000-8000-000000000009', 'UX portfolio inspiration', 'https://www.behance.net/search/projects/ux%20case%20study', 'article', true, 'Behance');

insert into public.milestones (id, skill_id, order_index, title, description, after_step_id) values
('f0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 1,
 'User-first thinker',
 'You can research real users and turn findings into personas and journeys.',
 'd0000000-0000-4000-8000-000000000003'),
('f0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 2,
 'From idea to interface',
 'You structure content and design wireframes with deliberate visual principles.',
 'd0000000-0000-4000-8000-000000000006'),
('f0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 3,
 'Case study complete',
 'You tested a real prototype and told the story in a portfolio case study.',
 'd0000000-0000-4000-8000-000000000009');
