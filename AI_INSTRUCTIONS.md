This document is a code of conduct for AI to develop this app.

Main checkpoints:
- **Quick version increment**: Use `./bump` script for fast version increments during development (updates constants.js, app.js, sw.js automatically)
- Read README.md, PLANNING.md, TASKS.md documents to understand the app.
- Documentation of Boss Cube Street II SysEx protocol is in the ../street-cube-II-sysex/README.md (relative to this file).
- For pickup mode functionality, see PICKUP_MODE.md for technical implementation details.
- For project history and cooperation insights, see AI_SELFTALK.md for comprehensive status summary.
- After every change update HISTORY.md with a summary of changes using the development version format.
- Try to make clean, well-structured code that will be easy to maintain in the future.
- I prefer clean and simple solutions. Don't overcomplicate things, make them rather simpler.
- When there is a bug, debug it first. You can always add debug outputs and ask me to send them results.
- If you don't know, please so. If are unsure how to solve something, please ask me first.

## Project Status & Cooperation Summary

**Current Version**: 2.25.0 (Stable Release - January 9, 2025)

**Key Documentation**:
- **AI_SELFTALK.md**: Complete cooperation summary, project status, and future guidance
- **PICKUP_MODE.md**: Technical pickup mode implementation and debugging guide
- **README.md**: User documentation with Live Performance mode features
- **HISTORY.md**: Clean release history with accurate git-based dates

**Recent Major Work Completed**:
- Live Performance mode mobile enhancements (drag & drop, long hold, visual feedback)
- Comprehensive pickup mode documentation and JSDoc comments
- Code cleanup and organization (templates, styles, debug logging removal)
- 2.23.0 release preparation with accurate version management

**Critical Technical Notes**:
- Live Performance mode requires different pickup mode behavior than main app
- Mobile touch handling needs `touch-action: none` and proper event management
- Red bar visual feedback requires careful timeout management
- Template system separation requires async loading patterns

**For Future Development**:
- Reference AI_SELFTALK.md for detailed technical insights and cooperation patterns
- Pickup mode changes must update both main app and Live Performance implementations
- Mobile features require testing on actual touch devices, not just browser dev tools
- Version releases must check actual git dates and update all JavaScript files consistently

## Development Workflow

**Standard Development Cycle** (in order of usage):

1. **Make code changes** (fix bugs, add features, etc.)
2. **Increment version**: `./bump` (fastest) or `npm run bump`
3. **Test changes**: User refreshes browser to get new cached version
4. **Debug if needed**: Add `this.log()` messages (not `console.log()`) for user-visible debugging
5. **Repeat cycle**: Bump version again after each significant change

**Version Bump Scripts Available**:
- `./bump` - Fastest option for rapid development
- `npm run bump` - Standard Node.js workflow
- `node increment-version.js` - Direct script execution
- See `VERSION-BUMP.md` for complete documentation

**Key Points**:
- **Always increment version** after code changes to force cache refresh on mobile
- **Use app logging** (`this.log()`) not browser console (`console.log()`) for debugging
- **Mobile testing** requires cache busting via version increments
- **Debug first** before implementing complex solutions
