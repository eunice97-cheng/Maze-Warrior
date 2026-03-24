create extension if not exists pgcrypto;

do $$
begin
  create type public.season_status_enum as enum ('draft', 'upcoming', 'active', 'completed', 'archived');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.membership_role_enum as enum ('member', 'officer', 'captain');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.membership_status_enum as enum ('active', 'inactive', 'removed');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.publication_status_enum as enum (
    'draft',
    'collecting_representatives',
    'ready',
    'scheduled',
    'live',
    'finished',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.nomination_status_enum as enum ('pending', 'accepted', 'declined', 'withdrawn', 'cancelled');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.representative_slot_status_enum as enum ('open', 'confirmed', 'locked', 'withdrawn', 'replaced', 'no_show');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.match_status_enum as enum ('pending', 'live', 'finished', 'cancelled');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 32),
  avatar_url text,
  discord_user_id text unique check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique,
  direction text not null unique check (direction in ('north', 'east', 'south', 'west')),
  summary text,
  accent_color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique,
  description text,
  status public.season_status_enum not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  clan_selection_starts_at timestamptz,
  clan_selection_ends_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint seasons_date_window_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint seasons_clan_selection_window_check check (
    clan_selection_ends_at is null
    or clan_selection_starts_at is null
    or clan_selection_ends_at > clan_selection_starts_at
  )
);

create table if not exists public.season_clan_memberships (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete restrict,
  role public.membership_role_enum not null default 'member',
  status public.membership_status_enum not null default 'active',
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint season_clan_memberships_one_clan_per_season unique (season_id, profile_id)
);

create table if not exists public.maze_publications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  layout_file text not null,
  short_description text,
  authored_by_profile_id uuid references public.profiles (id) on delete set null,
  published_by_profile_id uuid references public.profiles (id) on delete set null,
  status public.publication_status_enum not null default 'draft',
  published_at timestamptz,
  all_clans_locked_at timestamptz,
  scheduled_start_at timestamptz,
  scheduled_announced_at timestamptz,
  live_started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maze_publications_slug_per_season unique (season_id, slug)
);

create table if not exists public.maze_representative_nominations (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.maze_publications (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nominated_by_profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.nomination_status_enum not null default 'pending',
  note text,
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maze_representative_nominations_unique_nominee unique (publication_id, clan_id, profile_id)
);

create table if not exists public.maze_representative_slots (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.maze_publications (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete restrict,
  profile_id uuid references public.profiles (id) on delete set null,
  nomination_id uuid references public.maze_representative_nominations (id) on delete set null,
  confirmed_by_profile_id uuid references public.profiles (id) on delete set null,
  status public.representative_slot_status_enum not null default 'open',
  confirmed_at timestamptz,
  lock_deadline_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maze_representative_slots_one_clan_per_publication unique (publication_id, clan_id)
);

create table if not exists public.maze_matches (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.maze_publications (id) on delete cascade,
  status public.match_status_enum not null default 'pending',
  runtime_room_code text unique,
  winner_clan_id uuid references public.clans (id) on delete set null,
  winner_profile_id uuid references public.profiles (id) on delete set null,
  final_state jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists seasons_single_active_idx
  on public.seasons (status)
  where status = 'active';

create index if not exists seasons_status_idx on public.seasons (status);
create index if not exists season_clan_memberships_season_clan_idx on public.season_clan_memberships (season_id, clan_id);
create index if not exists season_clan_memberships_profile_idx on public.season_clan_memberships (profile_id);
create index if not exists maze_publications_season_status_idx on public.maze_publications (season_id, status);
create index if not exists maze_publications_schedule_idx on public.maze_publications (scheduled_start_at);
create index if not exists maze_representative_nominations_publication_status_idx
  on public.maze_representative_nominations (publication_id, clan_id, status);
create index if not exists maze_representative_slots_publication_status_idx
  on public.maze_representative_slots (publication_id, status);
create unique index if not exists maze_representative_slots_publication_profile_idx
  on public.maze_representative_slots (publication_id, profile_id)
  where profile_id is not null;
create index if not exists maze_matches_status_idx on public.maze_matches (status);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_display_name text;
begin
  derived_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Marked Bearer'
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(derived_display_name, 32))
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.ensure_nomination_matches_membership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  publication_season_id uuid;
begin
  select season_id
  into publication_season_id
  from public.maze_publications
  where id = new.publication_id;

  if publication_season_id is null then
    raise exception 'Unknown maze publication %', new.publication_id;
  end if;

  if not exists (
    select 1
    from public.season_clan_memberships scm
    where scm.season_id = publication_season_id
      and scm.profile_id = new.profile_id
      and scm.clan_id = new.clan_id
      and scm.status = 'active'
  ) then
    raise exception 'The nominated player is not an active member of that clan for this season.';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_slot_matches_membership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  publication_season_id uuid;
begin
  if new.profile_id is null then
    return new;
  end if;

  select season_id
  into publication_season_id
  from public.maze_publications
  where id = new.publication_id;

  if publication_season_id is null then
    raise exception 'Unknown maze publication %', new.publication_id;
  end if;

  if not exists (
    select 1
    from public.season_clan_memberships scm
    where scm.season_id = publication_season_id
      and scm.profile_id = new.profile_id
      and scm.clan_id = new.clan_id
      and scm.status = 'active'
  ) then
    raise exception 'The selected Marked Bearer is not an active member of that clan for this season.';
  end if;

  return new;
end;
$$;

create or replace function public.create_publication_representative_slots()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.maze_representative_slots (publication_id, clan_id)
  select new.id, c.id
  from public.clans c
  on conflict (publication_id, clan_id) do nothing;

  return new;
end;
$$;

create or replace function public.sync_publication_representative_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_publication_id uuid;
  clan_total integer;
  locked_total integer;
begin
  if tg_op = 'DELETE' then
    target_publication_id := old.publication_id;
  else
    target_publication_id := new.publication_id;
  end if;

  select count(*)
  into clan_total
  from public.clans;

  select count(*)
  into locked_total
  from public.maze_representative_slots rs
  where rs.publication_id = target_publication_id
    and rs.profile_id is not null
    and rs.status in ('confirmed', 'locked');

  if clan_total > 0 and locked_total = clan_total then
    update public.maze_publications
    set all_clans_locked_at = coalesce(all_clans_locked_at, timezone('utc', now())),
        status = case
          when status in ('draft', 'collecting_representatives') and scheduled_start_at is null then 'ready'
          when status in ('draft', 'collecting_representatives', 'ready') and scheduled_start_at is not null then 'scheduled'
          else status
        end,
        updated_at = timezone('utc', now())
    where id = target_publication_id;
  else
    update public.maze_publications
    set all_clans_locked_at = case when status = 'ready' then null else all_clans_locked_at end,
        status = case when status = 'ready' then 'collecting_representatives' else status end,
        updated_at = timezone('utc', now())
    where id = target_publication_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.schedule_publication_start(
  p_publication_id uuid,
  p_scheduled_start_at timestamptz
)
returns public.maze_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  required_clans integer;
  confirmed_clans integer;
  result_row public.maze_publications;
begin
  if p_scheduled_start_at is null then
    raise exception 'A scheduled start time is required.';
  end if;

  if not exists (
    select 1
    from public.maze_publications mp
    where mp.id = p_publication_id
      and mp.status not in ('live', 'finished', 'cancelled')
  ) then
    raise exception 'This maze publication cannot be scheduled in its current state.';
  end if;

  select count(*)
  into required_clans
  from public.clans;

  select count(*)
  into confirmed_clans
  from public.maze_representative_slots rs
  where rs.publication_id = p_publication_id
    and rs.profile_id is not null
    and rs.status in ('confirmed', 'locked');

  if confirmed_clans <> required_clans then
    raise exception 'All four clans must lock in their Marked Bearer before the start time can be announced.';
  end if;

  update public.maze_representative_slots
  set status = case when status = 'confirmed' then 'locked' else status end,
      lock_deadline_at = coalesce(lock_deadline_at, p_scheduled_start_at),
      updated_at = timezone('utc', now())
  where publication_id = p_publication_id
    and profile_id is not null;

  update public.maze_publications
  set status = 'scheduled',
      all_clans_locked_at = coalesce(all_clans_locked_at, timezone('utc', now())),
      scheduled_start_at = p_scheduled_start_at,
      scheduled_announced_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_publication_id
  returning *
  into result_row;

  if result_row.id is null then
    raise exception 'Maze publication % was not found.', p_publication_id;
  end if;

  return result_row;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_clans_updated_at on public.clans;
create trigger set_clans_updated_at
before update on public.clans
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_seasons_updated_at on public.seasons;
create trigger set_seasons_updated_at
before update on public.seasons
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_season_clan_memberships_updated_at on public.season_clan_memberships;
create trigger set_season_clan_memberships_updated_at
before update on public.season_clan_memberships
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_maze_publications_updated_at on public.maze_publications;
create trigger set_maze_publications_updated_at
before update on public.maze_publications
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_maze_representative_nominations_updated_at on public.maze_representative_nominations;
create trigger set_maze_representative_nominations_updated_at
before update on public.maze_representative_nominations
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_maze_representative_slots_updated_at on public.maze_representative_slots;
create trigger set_maze_representative_slots_updated_at
before update on public.maze_representative_slots
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_maze_matches_updated_at on public.maze_matches;
create trigger set_maze_matches_updated_at
before update on public.maze_matches
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

drop trigger if exists validate_maze_representative_nomination_membership on public.maze_representative_nominations;
create trigger validate_maze_representative_nomination_membership
before insert or update on public.maze_representative_nominations
for each row
execute procedure public.ensure_nomination_matches_membership();

drop trigger if exists validate_maze_representative_slot_membership on public.maze_representative_slots;
create trigger validate_maze_representative_slot_membership
before insert or update on public.maze_representative_slots
for each row
execute procedure public.ensure_slot_matches_membership();

drop trigger if exists create_maze_publication_representative_slots on public.maze_publications;
create trigger create_maze_publication_representative_slots
after insert on public.maze_publications
for each row
execute procedure public.create_publication_representative_slots();

drop trigger if exists sync_publication_representative_state_on_insert on public.maze_representative_slots;
create trigger sync_publication_representative_state_on_insert
after insert on public.maze_representative_slots
for each row
execute procedure public.sync_publication_representative_state();

drop trigger if exists sync_publication_representative_state_on_update on public.maze_representative_slots;
create trigger sync_publication_representative_state_on_update
after update on public.maze_representative_slots
for each row
execute procedure public.sync_publication_representative_state();

drop trigger if exists sync_publication_representative_state_on_delete on public.maze_representative_slots;
create trigger sync_publication_representative_state_on_delete
after delete on public.maze_representative_slots
for each row
execute procedure public.sync_publication_representative_state();

insert into public.clans (slug, name, direction, summary, accent_color)
values
  ('azure-dragon', 'Azure Dragon', 'east', 'Storm wardens of the eastern district and dawn gate.', '#4dc7ff'),
  ('white-tiger', 'White Tiger', 'west', 'Steel guardians of the western district and dusk gate.', '#efe6d2'),
  ('vermilion-bird', 'Vermilion Bird', 'south', 'Radiant keepers of the southern district and fire gate.', '#ff6157'),
  ('black-tortoise', 'Black Tortoise', 'north', 'Night sentries of the northern district and sealed gate.', '#7188a8')
on conflict (slug) do update
set name = excluded.name,
    direction = excluded.direction,
    summary = excluded.summary,
    accent_color = excluded.accent_color,
    updated_at = timezone('utc', now());

insert into public.maze_representative_slots (publication_id, clan_id)
select mp.id, c.id
from public.maze_publications mp
cross join public.clans c
left join public.maze_representative_slots rs
  on rs.publication_id = mp.id
 and rs.clan_id = c.id
where rs.id is null;

alter table public.profiles enable row level security;
alter table public.clans enable row level security;
alter table public.seasons enable row level security;
alter table public.season_clan_memberships enable row level security;
alter table public.maze_publications enable row level security;
alter table public.maze_representative_nominations enable row level security;
alter table public.maze_representative_slots enable row level security;
alter table public.maze_matches enable row level security;

drop policy if exists "profiles_are_publicly_readable" on public.profiles;
create policy "profiles_are_publicly_readable"
on public.profiles
for select
using (true);

drop policy if exists "users_can_update_own_profile" on public.profiles;
create policy "users_can_update_own_profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "clans_are_publicly_readable" on public.clans;
create policy "clans_are_publicly_readable"
on public.clans
for select
using (true);

drop policy if exists "seasons_are_publicly_readable" on public.seasons;
create policy "seasons_are_publicly_readable"
on public.seasons
for select
using (true);

drop policy if exists "season_memberships_are_publicly_readable" on public.season_clan_memberships;
create policy "season_memberships_are_publicly_readable"
on public.season_clan_memberships
for select
using (true);

drop policy if exists "maze_publications_are_publicly_readable" on public.maze_publications;
create policy "maze_publications_are_publicly_readable"
on public.maze_publications
for select
using (true);

drop policy if exists "representative_slots_are_publicly_readable" on public.maze_representative_slots;
create policy "representative_slots_are_publicly_readable"
on public.maze_representative_slots
for select
using (true);

drop policy if exists "maze_matches_are_publicly_readable" on public.maze_matches;
create policy "maze_matches_are_publicly_readable"
on public.maze_matches
for select
using (true);

drop policy if exists "nominations_are_readable_by_authenticated_users" on public.maze_representative_nominations;
create policy "nominations_are_readable_by_authenticated_users"
on public.maze_representative_nominations
for select
to authenticated
using (true);

drop policy if exists "players_can_nominate_themselves" on public.maze_representative_nominations;
create policy "players_can_nominate_themselves"
on public.maze_representative_nominations
for insert
to authenticated
with check (
  auth.uid() = profile_id
  and auth.uid() = nominated_by_profile_id
  and exists (
    select 1
    from public.maze_publications mp
    join public.season_clan_memberships scm
      on scm.season_id = mp.season_id
     and scm.profile_id = auth.uid()
     and scm.clan_id = clan_id
     and scm.status = 'active'
    where mp.id = publication_id
      and mp.status in ('collecting_representatives', 'ready')
  )
);

revoke all on function public.schedule_publication_start(uuid, timestamptz) from public;
revoke all on function public.schedule_publication_start(uuid, timestamptz) from anon;
revoke all on function public.schedule_publication_start(uuid, timestamptz) from authenticated;
grant execute on function public.schedule_publication_start(uuid, timestamptz) to service_role;
