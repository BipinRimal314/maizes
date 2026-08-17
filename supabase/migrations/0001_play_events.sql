-- Playtest telemetry.
--
-- One row per thing a tester did with a level. The point is to answer the
-- questions a playtest is actually for: which level did people quit on, how
-- many deaths did a level really cost, did anyone reach the end.
--
-- Two deliberate constraints on what goes in here:
--
--   * Nothing identifying. `player_id` is a random uuid minted in the browser
--     and kept in localStorage. There is no name, no email, no IP column, no
--     free text. A tester who clears their storage becomes a new player, and
--     that is the correct trade for not holding anything about them.
--
--   * The browser can only ever INSERT. The anon key ships inside a public
--     page, so it must be assumed hostile: RLS below grants insert and nothing
--     else, so a reader of the page cannot pull back other testers' rows.

create table if not exists public.play_events (
  id           bigint generated always as identity primary key,

  player_id    uuid        not null,   -- stable per browser, random, anonymous
  session_id   uuid        not null,   -- one page load
  build        text        not null,   -- so old data is separable after a retune

  event        text        not null,
  level_name   text,
  level_index  smallint,

  deaths       smallint,
  ms           integer,                -- game-clock time on the level
  restarts     smallint,

  -- coarse client shape, to catch "it was unplayable on my phone"
  viewport     text,
  touch        boolean,

  created_at   timestamptz not null default now(),

  constraint play_events_event_known check (
    event in ('level_started', 'level_won', 'level_quit', 'campaign_finished')
  ),
  -- sanity bounds: a public insert endpoint should not accept nonsense
  constraint play_events_level_index_sane check (level_index is null or level_index between 0 and 500),
  constraint play_events_deaths_sane      check (deaths      is null or deaths      between 0 and 10000),
  constraint play_events_ms_sane          check (ms          is null or ms          between 0 and 86400000),
  constraint play_events_restarts_sane    check (restarts    is null or restarts    between 0 and 10000),
  constraint play_events_build_len        check (char_length(build) <= 40),
  constraint play_events_level_name_len   check (level_name is null or char_length(level_name) <= 60),
  constraint play_events_viewport_len     check (viewport   is null or char_length(viewport)   <= 20)
);

create index if not exists play_events_level_idx   on public.play_events (level_index, event);
create index if not exists play_events_player_idx  on public.play_events (player_id, created_at);
create index if not exists play_events_created_idx on public.play_events (created_at desc);

alter table public.play_events enable row level security;

-- Insert only. There is deliberately no SELECT, UPDATE or DELETE policy, so
-- anon and authenticated can write and cannot read. Read it from the SQL editor
-- or with the service role key, which never leaves your machine.
drop policy if exists "anonymous playtesters may insert" on public.play_events;
create policy "anonymous playtesters may insert"
  on public.play_events
  for insert
  to anon, authenticated
  with check (true);

-- Convenience views for reading the results yourself. Views run as their owner,
-- so these are reachable from the dashboard and still not from the anon key.

create or replace view public.level_funnel as
select
  level_index,
  level_name,
  count(*) filter (where event = 'level_started')          as started,
  count(*) filter (where event = 'level_won')              as won,
  count(*) filter (where event = 'level_quit')             as quit,
  round(avg(deaths) filter (where event = 'level_won'), 1) as avg_deaths_to_win,
  round(avg(ms)     filter (where event = 'level_won') / 1000.0, 1) as avg_seconds_to_win,
  count(distinct player_id)                                as players
from public.play_events
where level_index is not null
group by level_index, level_name
order by level_index;

create or replace view public.player_progress as
select
  player_id,
  min(created_at)                                            as first_seen,
  max(created_at)                                            as last_seen,
  count(distinct level_index) filter (where event = 'level_won') as levels_won,
  max(level_index) filter (where event in ('level_won', 'level_quit')) as furthest_level,
  sum(deaths) filter (where event = 'level_won')             as deaths,
  bool_or(event = 'campaign_finished')                       as finished
from public.play_events
group by player_id
order by last_seen desc;
