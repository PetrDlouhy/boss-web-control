This document is a code of conduct for AI to develop this app.

Main checkpoints:
- Follow semantic versioning with appendix parts for development versions (e.g., 2.22.14-alpha.1, 2.22.14-beta.2, 2.22.14-rc.1). Increment appendix during development after every change so I can see that something changed and the app updates.
- Read README.md, PLANNING.md, TASKS.md documents to understand the app.
- Documentation of Boss Cube Street II SysEx protocol is in the ../street-cube-II-sysex/README.md (relative to this file).
- For pickup mode functionality, see PICKUP_MODE.md for technical implementation details.
- For project history and cooperation insights, see AI_SELFTALK.md for comprehensive status summary.
- After every change update HISTORY.md with a summary of changes using the development version format.
- Try to make clean, well-structured code that will be easy to maintain in the future.
- I prefer clean and simple solutions. Don't overcomplicate things, make them rather simpler.
- When there is a bug, debug it first. You can always add debug outputs and ask me to send them results.

## Project Status & Cooperation Summary

**Current Version**: 2.23.0 (Stable Release - July 10, 2025)

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
