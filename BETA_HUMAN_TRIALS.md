# Maze Warrior Beta Human Trials

This document defines the beta trial target for the current project.

The beta maze is the exported 7-layer layout:

- `exports/DENUG-layout.json`

The goal of beta is not "final balance." It is to prove that human players can:

- understand the rules quickly
- move confidently without confusion
- read danger, score, and purge pressure
- understand why they won or lost
- finish a round wanting to play again

## Beta Scope

- Maze: `DENUG`
- Layers: `7`
- Gates: `4`
- Trial format: `4` human players preferred
- Platform target: desktop browser first
- Match length target: `4` minutes maximum

For human trials, we should treat bots as non-essential. If the build still auto-fills seats, the preferred test setup is still a full 4-human room.

## Beta Rules

### Core loop

- Every player spawns at one gate.
- Every diamond is worth `1` point.
- Purge happens every `60` seconds.
- The outer live layer collapses on each purge.
- When only `3` safe layers remain, the round ends and score decides the winner if more than one player is still alive.

### Scoring

- Diamond pickup: `+1`
- Combat win: eliminate the opponent and steal their current score
- Scoreboard order: alive status, score, kills, diamonds collected

### Combat

For beta, combat must be readable and deterministic enough for humans to trust it.

Recommended human-trial rule:

- If two or more players land on the same cell, compare score first.
- If score is tied, compare diamonds collected.
- If both are still tied, do not use a silent random result in the shipped human-trial rules.

Recommended tie outcome:

- Both tied players survive the clash.
- Both are pushed back to their previous legal cell if possible.
- Both are briefly locked out of movement for a short moment, around `500-800ms`.
- The feed explicitly says it was a tie clash.

Why: human players will tolerate losing to a higher score; they usually will not tolerate "I guess the game picked one of us."

### Win conditions

- Immediate win: last living player
- Finals win: highest score when the maze reaches the last `3` safe layers
- If score is tied at round end, use diamonds collected as the first tie-breaker
- If still tied, declare shared first place for beta rather than invent a hidden rule

## Controls

The beta control scheme should stay simple and readable.

### Desktop controls

- `WASD` or arrow keys: move one step in that direction
- Click a reachable cell: auto-route there
- `Space`: cancel the queued route

### Control rules

- The latest input always overrides the old path
- Manual directional input takes priority over click-route
- A queued route should be visible in the UI
- Invalid input should fail silently on the board, but the player should still understand why nothing happened

### Human-trial control target

Players should be able to answer "what happens when I press this?" without guessing.

That means the UI should always make these things obvious:

- your current cell
- your queued path or next step
- whether you are alive, stunned, routed, or safe
- where the next purge will matter

## Gameplay Targets

The `DENUG` maze should create three recognizable phases.

### Early game: spread and claim

- Players leave spawn quickly
- The first thirty seconds should feel like route choice, not waiting
- Players should naturally take different lanes even without forced asymmetry

### Mid game: pressure and crossing

- Central routes should become more attractive
- Players should start making choices between safe points and risky engagement
- At least one real scoring fight should happen in a healthy round

### Late game: forced decisions

- Purge pressure should pull players inward
- The last two live purges should create obvious tension
- Players should understand why the board became dangerous

## UI Requirements For Beta

The current UI is a strong base, but human trials need clarity over style.

### Must-have HUD

- Match clock
- Next purge timer
- Current safe layer
- Your score
- Your alive / eliminated state
- Your gate or seat number

### Must-have board readability

- Clear player labels on tokens
- Strong visual distinction between safe layers and purged layers
- Reachable-click feedback for route targets
- Visible current path or next intended movement
- Stronger indication of current player position when spectating is off

### Must-have scoreboard

- Score
- Kills
- Diamonds collected
- Alive / out
- Current location or current target for readability

### Must-have battle log

- Match-time timestamps, not just "just now"
- Event badges: spawn, diamond, combat, purge, finish
- Combat details that explain who collided, where, and what the scores were
- Tie-specific wording when tie logic is involved

### Must-have death clarity

When a player dies, they should instantly know:

- who killed them or whether purge killed them
- where it happened
- what score comparison decided it
- whether they are now spectating

### Post-match summary

The end screen should answer:

- who won
- why they won
- final score line
- kills per player
- how the round ended: survivor, finals, or extinction

## Human Trial Format

Recommended first trial block:

- `4` players
- `3` rounds on `DENUG`
- no maze edits during the session
- `5-10` minutes of feedback after each round set

### Trial questions

Ask every tester:

- Did you understand how to score points?
- Did you understand why combat resolved the way it did?
- Did you understand what the purge would remove next?
- Did movement feel responsive and predictable?
- Did the board feel fair from your gate?

## Beta Success Criteria

We should consider the beta ready for wider human testing when most groups can do the following without coaching:

- explain the win condition after one round
- understand the purge by the first collapse
- understand at least one combat result from the feed alone
- move using both keyboard and click-route without confusion
- identify whether they lost to purge, low score, or a tie-break rule

## Implementation Priorities

### Priority 1

- Lock `DENUG` as the beta maze
- Make 4-human trials the default target
- Remove hidden random tie resolution from human combat
- Improve death recap and combat clarity
- Show current path / intended movement

### Priority 2

- Add a real post-match summary screen
- Add a short pre-match rules panel
- Add a "spectator mode" label and state copy
- Improve route hover / click feedback on the board

### Priority 3

- Mobile-specific control tuning
- Audio feedback
- Round stats and replay tools

## Product Positioning For Beta

Beta should be described as:

"A fast, four-player survival maze where route planning, timing, and score pressure matter as much as reflexes."

Not as:

- a finished competitive game
- a bot-driven sandbox
- a balance-complete release

The point of this phase is to validate the human experience on one strong maze before we generalize.
