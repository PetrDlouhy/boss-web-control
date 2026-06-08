## AI Instructions — Boss Cube Web Control

> **Primary rules live in `.cursor/rules/project.mdc`** (auto-loaded by Cursor).
> This file exists for non-Cursor AI tools or manual reference.

### Quick Reference

- **Version bump**: Only for releases. During dev, just reload — SW is network-first.
- **SysEx protocol**: `../street-cube-II-sysex/README.md`
- **Pickup mode**: `PICKUP_MODE.md`
- **Release process**: `RELEASE_PROCESS.md`
- **Version history**: `HISTORY.md`

### Architecture

- `event-bus.js` — pub/sub replacing `window.*` globals
- `control-factory.js` — centralized UI control creation (sliders, button groups, looper)
- `constants.js` — shared constants, no magic numbers in modules
- CSS split: `styles/styles.css`, `styles/live-performance.css`, `styles/tuner.css`

### Rules

- Use `log()` / `this.log()` for debugging, not `console.log()` (invisible on mobile)
- Control behavior changes go in `control-factory.js`, not duplicated across modules
- New files must be added to `sw.js` `urlsToCache`
- Debug first before implementing complex solutions
- When unsure, ask — don't guess
