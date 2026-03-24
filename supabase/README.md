# Maze Warrior Supabase Setup

This folder holds the first database foundation for the seasonal clan contest version of Maze Warrior.

## Included migration

- `migrations/20260324_000001_seasonal_clan_contest.sql`

This migration creates:

- player profiles backed by `auth.users`
- the four clans
- seasons
- seasonal clan memberships
- maze publications
- representative nominations
- one representative slot per clan per publication
- match records
- RLS policies for safe read access and self-nomination
- a secure `schedule_publication_start(...)` function that only works after all four clans are locked

## Apply in Supabase

If you are using the Supabase CLI:

```bash
supabase db push
```

If you are applying it manually:

1. Open the Supabase SQL Editor.
2. Paste the migration from `migrations/20260324_000001_seasonal_clan_contest.sql`.
3. Run it once.

## Seeded data

The migration automatically upserts the four canonical clans:

- Azure Dragon
- White Tiger
- Vermilion Bird
- Black Tortoise

It does not create a season automatically. Seasons should be created intentionally through admin tooling or SQL once you are ready.

## Important behavior

- New Supabase auth users automatically get a `public.profiles` row.
- New maze publications automatically get four representative slots, one for each clan.
- A publication moves to `ready` once all four clan slots are confirmed.
- The scheduled start time must be announced through `schedule_publication_start(...)`, which refuses to run unless all four clans are locked.

## Recommended next build step

After this schema, the next implementation step should be application-side integration:

1. create a Supabase client layer in the Maze Warrior server
2. add auth/session handling
3. add seasonal clan selection
4. add publication and representative confirmation flows
5. trigger Discord and Resend notifications when a contest becomes schedulable
