# ArcForge

ArcForge is a lightweight, local-first companion app for Dungeon Masters running in-person D&D 5e games. It brings together initiative tracking, combatant management, attack automation, status tracking, monster library, and character codex in a single desktop-friendly interface backed by a minimal Express server.

## Features

### Arena (Combat Tracker)
- **Initiative Management:** Drag-and-drop reordering, round tracking, and current-turn highlighting
- **Attack Workflow:** Select attacks and targets directly on combatant cards with automated roll-to-hit, critical handling, and damage application
- **Monster Attacks:** Automatically extracts attack bonuses and damage rolls from Monster Library creatures
- **Special Abilities:** View non-attack abilities (Multiattack, Breath Weapons, etc.) with expandable descriptions
- **Status Effects:** Apply conditions and timed effects with automatic duration tracking
- **Agent Sidebar:** Quick-add characters from your saved roster with portrait thumbnails

### Crucible (Character & Content Builder)
- **Character Builder:** Create detailed player, NPC, or enemy stat blocks with ability scores, skills, attacks, and custom portraits
- **Effects Builder:** Define reusable status effects with automated HP adjustments, roll modifiers, and condition flags
- **Loot Manager:** Build item templates and treasure pools for distribution

### Atlas (Monster & Item Library)
- **Monster Library:** Browse 331+ monsters from the SRD with full stat blocks, traits, actions, and abilities
- **Items Catalog:** Searchable item database with categories and descriptions
- **Quick Add to Combat:** Add monsters directly to the Arena with all attacks and special abilities pre-configured

### Codex (Reference Sheets)
- **Character Sheets:** Read-only view of all player characters with compact, two-column layout
- **Enemy Sheets:** Browse all monsters and custom enemies with full stat blocks and trait icons
- **Notes System:** Add campaign notes to any character or enemy sheet
- **Journal:** (Coming soon) Campaign journal entries and session notes

### Network & Persistence
- **LAN Support:** Server binds to all interfaces - access from any device on your network
- **Local-First:** All data stored as JSON files for full control and easy backup
- **Auto-Save:** Encounter state persists automatically
- **Image Support:** Upload and display character/monster portraits

## Quick Start

### Prerequisites

- Node.js 18 or newer
- npm (ships with Node.js)

### Install & Run

```bash
npm install
npm start
```

This starts the Express API on `http://localhost:3000` and serves the front-end from `public/`. On Windows you can also launch `start.bat`, which runs the same `npm start` command. The server binds to `0.0.0.0`, so other machines on your LAN can reach ArcForge via `http://<your-local-ip>:3000/`.

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

