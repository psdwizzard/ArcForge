# Project Plan – ArcForge Battle Tracker

## Context
- Local-first D&D 5e companion app combining initiative tracking, combat automation, status management, and loot workflows (see `README.md`).
- Tech stack: Express backend served from `server/`, static frontend assets in `public/`, JSON persistence under `data/`.
- Workspace tools include utility batch scripts (`start.bat`, `restart-server.bat`, `kill-server.bat`) for Windows-driven workflows.

## Guidance from `@dnd-battle-tracker-architect`
- Follow phased development: Phase 1 initiative, Phase 2 combat stats, Phase 3 combatant management, Phase 4 loot, Phase 5 persistence.
- Prioritize DM workflow efficiency, minimizing click count and cognitive load.
- Enforce 5e rule accuracy (initiative ties, status durations, death saves, etc.).
- Maintain clean separation between game logic and UI; keep drag-and-drop smooth and resilient.
- Validate and persist encounter/creature data without corruption; prefer JSON unless complexity demands more.

## Current State Snapshot
- Core features already cover combat tracker, attack workflow, character/effects builders, loot manager, and local persistence.
- Data directories suggest existing content for encounters, characters, creatures, effects, and media assets.
- No automated tests yet per `README.md`; testing strategy remains an open gap.

## Active Focus & Next Steps
- Audit current initiative and turn-order implementation against Phase 1 guidelines and DM workflow expectations.
- Identify gaps in combat stats management (HP adjustments, status effect durations) to align with Phase 2 requirements.
- Plan incremental introduction of testing (pytest for Python tooling, or Jest/Vitest for JS) covering initiative and attack flows.
- Document architectural decisions and future enhancements here to keep team alignment.

## Open Questions
- Are there pending features or bug reports not captured in version control or `todo.md`?
- What automated testing framework should we standardize on for the JavaScript stack?
- Any upcoming UX changes that require additional asset or data restructuring?

