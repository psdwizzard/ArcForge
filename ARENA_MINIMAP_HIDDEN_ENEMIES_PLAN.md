# Arena Minimap Hidden Enemies Plan

## Goal
Fix the Arena DM minimap on `:3000` so **all placed enemies appear** (hidden or visible), with readable names and clear hidden-state indicators, while preserving player-visibility rules on `:3001`.

## Confirmed Requirements
1. DM minimap (`:3000`) must show every placed enemy, including hidden enemies.
2. Player display (`:3001`) must keep current behavior:
only enemies not marked hidden in Atlas Encounters are visible to players.
3. Hidden status should be obvious:
- On DM minimap: show hidden indicator text (for example `Hidden`).
- In initiative order: show hidden state plus a quick `Unhide` control.
4. Label overlap is acceptable for now.

## Current Behavior (Problem)
- `public/js/app.js` filters DM minimap enemies with `enemy.visible !== false`, so hidden enemies are excluded.
- DM minimap currently reads from atlas settings `encounter.placedEnemies`, which can drift from live encounter state.
- Name labels exist but need stronger hidden-state signaling.

## Implementation Plan
1. **DM minimap source + visibility rule**
- Update minimap data selection to prefer live encounter data (`atlasMapState.encounter.pending`) and include both visible + hidden placed enemies for active map.
- Keep fallback logic for map/settings loading robust.

2. **Hidden indicator on DM minimap**
- Add hidden-state marker in token label rendering (for example `Enemy Name (Hidden)` or second line `Hidden`).
- Add CSS style for hidden tokens/labels so the state is instantly recognizable to DM.

3. **Initiative hidden state + quick action**
- In Arena combatant card rendering, surface hidden state when linked Atlas token/combatant is hidden.
- Add an `Unhide` button for hidden enemies in initiative cards.
- Wire button to existing visibility update path so it updates Atlas token state and re-renders minimap/display correctly.

4. **Preserve player display contract**
- Do not change `:3001` filtering logic; hidden enemies remain hidden from players.
- Verify server/display token payload behavior is unchanged for hidden enemies.

5. **Validation checklist**
- Hidden enemy appears on DM minimap after placement.
- Hidden enemy label shows hidden indicator.
- Hidden enemy does not appear on player display.
- Clicking `Unhide` from initiative makes enemy visible to players and updates DM views.
- Reloading session/encounter preserves expected hidden/visible behavior.

## Files Expected to Change
- `public/js/app.js`
- `public/css/styles.css`
- (If needed for edge-case sync only) `public/js/session-manager.js`

## Acceptance Criteria
1. DM sees all placed enemies on Arena minimap regardless of hidden flag.
2. Hidden enemies are clearly marked as hidden on DM controls.
3. Player display still hides hidden enemies until explicitly unhidden.
4. DM can unhide directly from initiative order without switching views.
