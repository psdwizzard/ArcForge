# Atlas Encounter Layout Change Plan

## Scope
Adjust Atlas encounter layout so:
1. The target encounter content under `#atlas-encounters-section` spans full available width.
2. `#atlas-enemy-panel` and `#atlas-agent-panel` are even in width.
3. `#atlas-encounters-section > div > div` (current `.atlas-encounter-layout`) is 30% taller to increase scroll/working space.

## What I Found
- Main encounter markup is in `public/index.html`.
- Core layout rules live in `public/css/styles.css`.
- Atlas-specific overrides that currently force unequal panel sizes live in `public/css/atlas-overrides.css`.
- Current values conflict:
  - `.atlas-agent-panel` has one width in `styles.css`, then a different width in `atlas-overrides.css`.
  - `.atlas-enemy-panel` has one width in `styles.css`, then a different width in `atlas-overrides.css`.
  - `.atlas-encounter-layout` height is currently `900px` in `styles.css`.

## Implementation Plan
1. Normalize encounter row width behavior
- Update encounter container/layout rules so the row inside `#atlas-encounters-section` uses full available width (`width: 100%`, no accidental shrink from conflicting flex-basis/min-width combos).
- Keep existing mobile breakpoint behavior intact (stacked columns under 1024px).

2. Make enemy + agent panels even
- Set shared sizing for both panels under `#atlas-encounters-section`.
- Use one consistent source of truth (prefer section-scoped rules in `atlas-overrides.css`) so both panels resolve to equal widths.
- Remove/override conflicting fixed widths that currently make agent panel wider than enemy panel.

3. Increase encounter layout height by 30%
- Change `.atlas-encounter-layout` from `900px` to `1170px` for both `height` and `min-height`.
- Verify inner scrollable areas (`overflow-y: auto`) still behave correctly.

4. Validate and harden
- Verify desktop layout:
  - Encounter stage still renders correctly.
  - Enemy and agent panels are equal width.
  - Section uses full horizontal space.
- Verify mobile/tablet breakpoint still stacks without horizontal overflow.
- Confirm no regressions in panel scrolling and staging interactions.

## Open Questions (Need Your Confirmation)
1. For "span the 100% width `#atlas-encounters-section`", should this apply specifically to `.atlas-encounter-layout` (the row with stage + enemy + agent), or did you mean `.atlas-encounter-container` (everything including header/footer/flavor media)?
2. For "even" panel sizes, do you want strict 50/50 between `#atlas-enemy-panel` and `#atlas-agent-panel` (same width exactly), or just the same fixed width while the stage takes remaining space?
3. For the 30% taller target (`#atlas-encounters-section > div > div`), should this be fixed at `1170px` always, or scaled responsively using viewport-based height?

## File Targets (planned)
- `public/css/styles.css`
- `public/css/atlas-overrides.css`

## Acceptance Criteria
- `#atlas-encounters-section` encounter row fills available width.
- `#atlas-enemy-panel` and `#atlas-agent-panel` render with equal width on desktop.
- `#atlas-encounters-section > div > div` is 30% taller than current baseline.
- No horizontal overflow regressions at desktop and mobile breakpoints.
