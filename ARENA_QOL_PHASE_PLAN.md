# Arena QoL Phase Plan

## Goal
Ship a focused Arena quality-of-life pass covering:
1. Better Agents list discovery
2. Richer agent summary stats
3. Optional initiative filtering for hidden enemies
4. Custom timed damage effects
5. Undo/back for accidental End Turn
6. Death sound cue
7. Dead enemy card visual state (gray)

## Scope Decisions
- This phase is Arena-first (`:3000`) with minimal display-side changes unless required.
- Keep backward compatibility with existing saved sessions/encounters.
- Add toggles where behavior can change table preference (for example: skip hidden in initiative).

## Work Breakdown

### Phase 1: Agents List Rework
### 1. Group by Type + Newest First
- Group sections in Agents sidebar:
  - Players
  - NPCs
  - Enemies
- Sort each group newest -> oldest.
- Keep existing filter control, but grouping should still be clear.

Implementation targets:
- `public/js/app.js` (`renderAgentsList`)
- Optional style updates in `public/css/styles.css`

Acceptance:
- Agents are visually grouped by type.
- Within each type, newest created agent appears first.

### 2. Expanded Agent Quick Stats (mods)
- In collapsed/expanded list details, show ability modifiers:
  - STR, DEX, CON, INT, WIS, CHA as `+N`/`-N`
- Keep HP/AC in summary.

Implementation targets:
- `public/js/app.js` (`renderAgentsList`)

Acceptance:
- Every agent card shows all six ability modifiers.

---

### Phase 2: Initiative Behavior + Safety Controls
### 3. Add Toggle: Skip Hidden in Initiative Order
- Add UI switch in Arena controls:
  - `Skip hidden enemies in Initiative Order`
- Behavior when enabled:
  - Hidden enemies are excluded from initiative card list and turn progression.
- Behavior when disabled:
  - Hidden enemies participate normally.

Implementation targets:
- `public/index.html` (new control)
- `public/js/app.js` (render/order logic)
- `server/routes/combatRoutes.js` (turn advancement logic)
- `server/services/displayService.js` (player initiative rail alignment)

Acceptance:
- Toggle can be changed during session.
- Turn order immediately respects current toggle.

### 5. End Turn Back/Undo
- Add `Back` button near End Turn.
- Keep short turn history stack:
  - previous `currentTurnIndex`
  - previous `roundNumber`
  - previous status/effect durations (snapshot or reversible delta)
- Undo should revert only the most recent End Turn step.

Implementation targets:
- `public/index.html` (button)
- `public/js/app.js` (history and UI logic)
- `server/routes/combatRoutes.js` (optional endpoint if server-authoritative undo needed)

Acceptance:
- DM can safely undo one accidental End Turn.
- No data corruption in status durations.

---

### Phase 3: Effects System Upgrade
### 4. Custom Damage-over-Time Effect Builder Inline
- Add `Custom` option in status/effect add UI.
- When selected, reveal fields:
  - Name
  - Dice/formula (`1d6`, `2d8+3`, etc.)
  - Duration (turns)
- Apply on configured timing (start/end of turn, align with existing effect engine).

Implementation targets:
- `public/js/app.js` (effect add UI and payload)
- `server/routes/combatRoutes.js` / `server/services/encounterService.js` (effect processing)
- Optional persistence shape updates for status effects

Acceptance:
- DM can create and apply a custom timed damage effect without pre-saving it globally.
- Damage auto-applies each turn for configured duration.

---

### Phase 4: Death Feedback Pass
### 6. Death Sound
- Play SFX when enemy transitions alive -> dead.
- Add settings toggle + optional volume slider in Arena settings.
- Prevent repeated sound if already dead.

Implementation targets:
- `public/js/app.js` (death transition detection + audio playback)
- `public/index.html` (settings controls)

Acceptance:
- Sound plays once per death event.
- User can disable it.

### 7. Dead Enemy Card Turns Gray
- Apply `.dead` visual class to defeated enemy cards.
- Keep readability while clearly indicating removed threat.

Implementation targets:
- `public/js/app.js` (`createCombatantCard`)
- `public/css/styles.css` (dead state styling)

Acceptance:
- Dead enemies are visually gray in Arena list.

---

## Cross-Cutting Data Notes
- Add new client settings object for Arena preferences:
  - `skipHiddenInInitiative`
  - `deathSoundEnabled`
  - `deathSoundVolume`
- Persist in local storage first; move to server settings only if needed.

## Risks and Mitigations
- Turn undo can conflict with effect decrement:
  - Mitigation: snapshot minimal reversible combat state before each End Turn.
- Hidden-skip toggle can desync display initiative rail:
  - Mitigation: apply same filter rules server-side for display payload.
- Custom damage formulas can be invalid:
  - Mitigation: strict parser/validation with user-facing errors.

## Suggested Implementation Order (Execution Session)
1. Agents grouping + sorting + stat mods
2. Dead gray cards + death sound
3. Skip hidden initiative toggle
4. End Turn undo/back
5. Custom timed damage effects
6. Final regression pass

## Regression Checklist
- Add/remove/hide/unhide enemy
- Start combat / next turn / end combat
- Dead enemy handling
- Player display initiative rail integrity
- Session reload persistence
- Minimap token/state consistency

## Open Questions for Next Session
1. For `Skip hidden in Initiative Order`, default ON or OFF?
2. Undo depth: one step only, or multi-step stack?
3. Death sound source: existing asset from `/maps`/uploads, or new bundled SFX file?
4. Custom damage timing default: start of turn or end of turn?
