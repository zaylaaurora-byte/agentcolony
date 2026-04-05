---
Task ID: 2
Agent: main
Task: Performance fix + pixel-agents sprites + alive agent behaviors

Work Log:
- Diagnosed Chrome freeze: root cause was canvas re-drawing 1200 tiles every frame at 60fps (no offscreen caching)
- Completely rewrote WorldRenderer.tsx with performance-first architecture:
  - Pre-rendered entire static world to offscreen canvas (drawn once, blitted every frame with single drawImage)
  - Tile rendering uses batched fillRect calls (grouped by type) instead of individual image drawImage calls
  - Frame rate throttled to 30fps (was 60fps)
  - Only animated elements redrawn per frame (water shimmer, decorations sway, character positions)
  - Removed all per-tile image loading (was loading 70+ PNG images)
- Integrated pixel-agents character sprites from https://github.com/pablodelucca/pixel-agents:
  - Downloaded 6 character sprites (char_0 through char_5)
  - Analyzed layout: 7 columns × 4 rows at 16×24px per frame
  - Cols: walk1,walk2,walk3,walk4, type1, type2, read
  - Rows: down, up, right, left
  - Scaled to 3x for visibility (48×72px rendered)
- Added alive agent behaviors:
  - Random wandering: agents walk to random nearby tiles when idle
  - Random emotes: 💭💤🎵👀✨🤔😄 float above idle agents
  - Wander animation state separate from task-driven walk
  - Summoned agents get 🤩 emote on spawn

Stage Summary:
- Chrome freeze FIXED: static world cached in offscreen canvas, 30fps throttle
- 6 diverse pixel-art characters from pixel-agents repo
- Agents now wander and emote when idle (feels alive!)
- Build passes cleanly, all sprites serve correctly
