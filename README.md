# Maze Warrior

An editor-first square maze foundation with a multiplayer runtime layered on top.

## Current focus

The project now prioritizes maze authoring over gameplay rules.

## Planned product direction

The next major direction is a persistent seasonal clan contest model:

- players register and join one clan per season
- each published maze becomes an official clan contest
- each clan sends one Marked Bearer
- the contest only opens after all four clans lock their representative
- the official match time is announced only after all four are confirmed

See [SEASONAL_CLAN_CONTEST_SPEC.md](./SEASONAL_CLAN_CONTEST_SPEC.md) for the working product spec.
The first Supabase migration and setup notes live in [supabase/README.md](./supabase/README.md).

Core foundation pieces:

- `maze-core.js`
  - wall-segment and pillar source of truth
  - derived cell adjacency
  - validation checks
  - exportable layout definitions
- `maze-editor.js`
  - editor canvas settings
  - variable layer sizing
  - rule snapshots for the current canvas
- `public/app.js`
  - pillar-and-wall editor UI
  - undo / redo
  - validation panel
  - minimap
  - zoom / pan / reset / center tools
  - export workflow

Gameplay is still present, but it is no longer the primary design target.

## Editor features

- Variable square canvas from `4` to `20` layers
- `4` side-center entry gates
- Wall-bar editing between pillars
- Mirror modes: `off`, `opposite`, `four-way`
- Hide node color / hide diamonds
- Undo / redo history
- Validation:
  - reachable cells
  - isolated cells
  - dead ends
  - gate-to-core reachability
  - symmetry / fairness gap
- Minimap viewport preview
- Export to JSON in [exports](./exports)

## Files that matter most

- [maze-core.js](./maze-core.js)
- [maze-editor.js](./maze-editor.js)
- [game-engine.js](./game-engine.js)
- [server.js](./server.js)
- [public/app.js](./public/app.js)
- [public/index.html](./public/index.html)
- [public/styles.css](./public/styles.css)
- [BETA_HUMAN_TRIALS.md](./BETA_HUMAN_TRIALS.md)

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Main routes:

- `/` cinematic landing page
- `/season` player registration and clan command hall
- `/play` beta room-code flow
- `/gm` maze workshop

For the seasonal registry panel to support email sign-in, make sure:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are set
- `APP_BASE_URL` matches your public site base URL, for example `http://localhost:3000`
- `/season` on that same site is allowed in Supabase Auth redirect settings

## Maze layouts

The JSON files in [exports](./exports) are the authored maze layouts, including the current published beta maze.

- `exports/DENUG-layout.json` is the current default playable maze.
- Local editor exports write back into `exports/` by default.
- Hosted deploys can use `MAZE_EXPORTS_DIR` to write new layouts into a persistent volume without losing the repo-shipped layouts.

When `MAZE_EXPORTS_DIR` points somewhere else, Maze Warrior:

- still reads the published layouts from [exports](./exports)
- prefers the external copy if a file with the same name exists there
- writes new exports into the external directory

That gives you a clean split between versioned, published mazes and runtime-created layouts.

## Export flow

1. Create a room as host.
2. Stay in the lobby editor.
3. Design the maze.
4. Click `Export Layout`.
5. The saved file is written into the active export directory, for example:

```text
exports/ABCDE-layout.json
```

That exported file is the handoff artifact for future refinement and, later, gameplay loading.

## Deploy storage

For Railway or any hosted deploy where you want exported mazes to persist:

1. Mount a persistent volume.
2. Set `MAZE_EXPORTS_DIR` to a folder on that volume, for example `/data/maze-exports`.
3. Keep `DEFAULT_PLAY_LAYOUT_FILE=DENUG-layout.json` unless you intentionally publish a different default maze.

That way:

- the app can keep writing new maze designs safely
- the published repo layouts still remain available
- a deploy restart does not wipe the hosted export directory

## Verify

```bash
npm test
```
