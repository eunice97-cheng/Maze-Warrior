# Maze Warrior Seasonal Clan Contest Spec

## Purpose

This document defines the next product direction for Maze Warrior as a seasonal clan-based contest platform rather than a simple room-code game.

The core fantasy is:

- Players register for Maze Warrior.
- Each player joins one clan for the current season.
- When a new maze is published, each clan must choose one Marked Bearer to represent it.
- The maze only opens after all four clans have locked in one representative each.
- Once all four are confirmed, the system announces the official scheduled start time.
- The winner secures the maze core for their clan.

## Confirmed Design Decisions

### 1. Clan allegiance is seasonal

- A player belongs to one clan per season.
- Players cannot freely switch clans during an active season.
- Clan switching happens only during an offseason window, a season rollover, or an admin-approved exception.

### 2. Every published maze is an official clan contest

- A published maze is not just a casual lobby.
- It is a public event that invites one representative from each clan.
- The contest is tied to a specific maze publication record.

### 3. Each clan sends exactly one Marked Bearer

- Azure Dragon sends one.
- White Tiger sends one.
- Vermilion Bird sends one.
- Black Tortoise sends one.

The maze cannot open early with missing clans.

### 4. Start time is announced only after all four clans are ready

- A maze publication begins in a "collecting representatives" state.
- Once all four clans lock in their Marked Bearer, the system moves the contest to "ready to schedule".
- At that point, the platform announces the official start time.
- The match does not begin immediately by default.
- The scheduled time is the public commitment point for the event.

This creates anticipation and gives each clan a fair warning window.

## Seasonal Structure

Each season should contain:

- a season name
- a season start date
- a season end date
- clan standings for that season
- player participation records for that season
- maze publications assigned to that season

Example:

- Season 1: The First Descent
- Season 2: The Burning Veins

## Core User Roles

### Player

- Registers an account
- Links Discord if desired
- Joins one clan for the current season
- Volunteers for representation when a new maze is published

### Clan member

- Can view clan status, published mazes, and representative slots
- Can nominate themselves or support a nominee

### Clan captain or officer

- Confirms who will be the clan's Marked Bearer for a maze
- Can replace an unresponsive nominee before lock

### Admin

- Creates seasons
- Publishes mazes
- Opens or closes nomination windows
- Finalizes scheduled start time if needed
- Resolves no-show or dispute cases

## Contest Lifecycle

### 1. Maze authored

- You design and export a maze.
- The maze is stored as a publishable layout artifact.

### 2. Maze published

- The maze becomes an official contest for the active season.
- All four clans are notified.
- Status: `collecting_representatives`

### 3. Clans choose their Marked Bearers

- Members volunteer or are nominated.
- Clan leadership confirms one representative.
- Each clan slot becomes locked once confirmed.

### 4. All four clans locked

- Status changes to `ready`
- The system announces the official start time.
- Discord and email notifications go out.

### 5. Countdown to match

- Players can view:
  - which clan is represented by whom
  - the maze title
  - the scheduled start time
  - the contest status

### 6. Match goes live

- Status changes to `live`
- Only the four confirmed Marked Bearers may enter as players
- Others can spectate if enabled

### 7. Match resolves

- Status changes to `finished`
- Winner clan receives the maze core
- Seasonal records and standings update

## Scheduling Rule

The key rule for scheduling is:

> The official match time is not announced until all four clans have chosen their Marked Bearer.

Recommended behavior:

- Admin sets a scheduling policy per publication.
- Once all four clans are confirmed, the system computes the next valid start slot.
- Example policy:
  - nearest approved event window
  - minimum 12 or 24 hours notice
  - avoid overlapping with another live clan contest

Recommended v1 implementation:

- Once the fourth representative is confirmed, the system chooses the next available approved slot automatically.
- Admin can override before public announcement if needed.

## No-Show and Replacement Rules

Recommended v1 rules:

- Before public start-time announcement:
  - clan captain can replace their own representative
- After public start-time announcement but before match start:
  - replacement allowed only until a lock deadline
- After lock deadline:
  - replacement requires admin action
- If a clan fails to field a representative by the required cutoff:
  - the match does not open
  - contest returns to `collecting_representatives` or `delayed`

## Backing System Responsibilities

### Supabase

Use Supabase for:

- authentication
- player profiles
- clan membership by season
- maze publications
- representative nominations and locks
- match records
- standings
- notification state

### Discord

Use Discord for:

- clan role assignment
- new maze announcement posts
- representative callouts
- start-time announcements
- captain confirmation workflows

### Resend

Use Resend for:

- registration / magic link emails
- "your clan still needs a Marked Bearer" reminders
- "all four clans are ready" announcement emails
- start-time reminders
- contest result recaps

### Hosting and game server

Use the hosted app and server for:

- player dashboards
- clan pages
- publication pages
- live contest runtime
- result recording

## Recommended Data Model

### `seasons`

- `id`
- `slug`
- `name`
- `status`
- `starts_at`
- `ends_at`

### `clans`

- `id`
- `slug`
- `name`
- `status`

### `profiles`

- `id`
- `user_id`
- `display_name`
- `discord_user_id`
- `created_at`

### `season_clan_memberships`

- `id`
- `season_id`
- `profile_id`
- `clan_id`
- `role`
- `status`
- `joined_at`

### `maze_publications`

- `id`
- `season_id`
- `layout_file`
- `title`
- `status`
- `published_at`
- `scheduled_start_at`
- `live_started_at`
- `finished_at`

### `maze_representatives`

- `id`
- `publication_id`
- `clan_id`
- `profile_id`
- `status`
- `confirmed_by_profile_id`
- `confirmed_at`
- `lock_deadline_at`

### `maze_matches`

- `id`
- `publication_id`
- `status`
- `winner_clan_id`
- `winner_profile_id`
- `started_at`
- `finished_at`

### `clan_standings`

- `id`
- `season_id`
- `clan_id`
- `maze_cores_recovered`
- `wins`
- `appearances`
- `points`

## Key Product Screens

### Public pages

- current season overview
- clan leaderboard
- published maze list
- publication detail page

### Logged-in player pages

- account profile
- current clan page
- active maze contest page
- volunteer / nominate flow

### Admin pages

- season management
- publish maze flow
- representative overview
- schedule override controls

## Recommended API Surface

### Auth and profile

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

### Clan and season

- `GET /seasons/current`
- `POST /seasons/:id/join-clan`
- `GET /clans/:slug`

### Maze publications

- `POST /admin/maze-publications`
- `GET /maze-publications/current`
- `GET /maze-publications/:id`

### Representation

- `POST /maze-publications/:id/volunteer`
- `POST /maze-publications/:id/confirm-representative`
- `POST /maze-publications/:id/replace-representative`

### Scheduling

- `POST /admin/maze-publications/:id/finalize-schedule`
- `POST /admin/maze-publications/:id/start`

## Recommended MVP Build Order

### Phase 1

- Supabase auth
- profile creation
- seasonal clan selection

### Phase 2

- maze publication records
- representative nomination and confirmation
- ready-state detection when all four clans are locked

### Phase 3

- scheduled start-time announcement flow
- Discord announcement automation
- Resend notifications

### Phase 4

- live contest runtime backed by publication records
- post-match clan standings updates

## Deferred Decisions

These should be decided later, not block v1:

- whether captains are elected or assigned by admin
- whether clans can field backup representatives
- whether spectators can bet, predict, or cheer
- whether the winner must only touch the core or also extract it
- whether clan points reward participation as well as wins

## Implementation Note

The current Maze Warrior codebase is still optimized for local room creation and in-memory runtime state. To support this seasonal clan contest model cleanly, future work should move identity, publication, and clan logic into persistent storage first, then attach the real-time maze runtime to those records.
