# ArcForge

ArcForge is a lightweight, local-first companion app for Dungeon Masters running in-person D&D 5e games. It brings together initiative tracking, combatant management, attack automation, status tracking, and loot handling in a single desktop-friendly interface backed by a minimal Express server.

## Features

- **Combat Tracker:** Manage initiative order with drag-and-drop reordering, round tracking, and current-turn highlighting.
- **Attack Workflow:** Select an attack and target directly on a combatant card, roll to hit with proper critical handling, preview damage, and confirm application to the defender.
- **Character Builder:** Create reusable player, NPC, or enemy stat blocks with ability scores, skills, attacks, and notes.
- **Effects Builder:** Define reusable status effects including automated HP adjustments, roll modifiers, and condition flags.
- **Loot Manager:** Track party loot pools and distribute rewards after encounters.
- **Local Persistence:** Encounter, character, and effect data are stored as JSON files so you retain full control of your campaign data.

## Quick Start

### Prerequisites

- Node.js 18 or newer
- npm (ships with Node.js)

### Install & Run

```bash
npm install
npm start
```

This starts the Express API on `http://localhost:3000` and serves the front-end from `public/`. On Windows you can also launch `start.bat`, which runs the same `npm start` command.

### Development Mode

```bash
npm run dev
```

The dev script uses `nodemon` for automatic server restarts when files in `server/` change. Front-end assets can be updated on the fly; refresh the browser to pick up changes.

## Usage Overview

1. **Add Combatants:** Build characters in the Character Builder or load existing JSON templates. Use the Agents list to add them to the encounter.
2. **Start Combat:** Once combatants have initiative values, start combat to lock in turn order and begin round tracking.
3. **Resolve Attacks:** For NPCs and enemies, choose an attack and target from the inline controls, roll to hit, adjust damage if needed, and confirm to apply HP changes.
4. **Track Effects:** Apply conditions and timed effects from the status controls. Durations automatically decrement at the end of each round.
5. **Manage Loot:** Switch to the Loot view to record treasure drops and distribute rewards.

## Project Structure

```
public/             # Front-end assets (HTML, CSS, JS)
server/             # Express server and API routes
data/               # JSON persistence for encounters, characters, effects, and creatures
package.json        # Project metadata and scripts
```

### API Endpoints (Highlights)

- `GET /api/encounter` – current encounter state
- `POST /api/combatants` – add a combatant
- `POST /api/combatants/:id/hp` – apply damage or healing
- `POST /api/combat/next-turn` – advance the initiative order and manage ongoing effects
- `GET /api/characters` / `POST /api/characters` – manage saved characters

All endpoints return JSON and operate on the locally persisted data under `data/`.

## Data & Persistence

- Encounter autosaves write to `data/encounters/`.
- Character templates are stored under `data/characters/`.
- Effects live in `data/effects/`.
- Creature templates (e.g., Goblin, Orc) are maintained in `data/creatures/` and can be extended freely.

You can back up or version control these JSON files to capture campaign history. The default `.gitignore` excludes sensitive or rapidly changing data directories by default; adjust as needed for your workflow.

## Testing

The project currently does not include automated tests. When adding new features, consider introducing `pytest` (for Python-based tooling), or JavaScript testing frameworks such as Jest or Vitest to cover critical workflows like initiative ordering and attack resolution.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/my-improvement`).
3. Commit your changes with descriptive messages.
4. Open a pull request with context about the change and any testing performed.

## License

This project is distributed under the ISC License as declared in `package.json`.

---

Hosted repository: [ArcForge](https://github.com/psdwizzard/ArcForge)

