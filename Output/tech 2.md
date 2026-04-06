# Technology Context

## Overview

EAVI is an ephemeral generative audiovisual website built as a client-side browser application with minimal server-side functionality. Each visit produces a unique, non-repeatable scene derived from in-memory visitor context, current time, pointer entropy, and real-time audio analysis. The project prioritises privacy (no cookies, no localStorage, no analytics, no backend persistence) and artistic expression.

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Build tool | Vite | Dev server and production bundler |
| Language | TypeScript | Strict preferred across all modules |
| Rendering | Three.js | WebGL-based 3D scene rendering |
| Audio | Web Audio API | `AudioContext`, `AnalyserNode`, `GainNode` |
| Hosting | Vercel | Static site + serverless/edge functions |
| Server functions | Vercel Functions | Single `/api/geo` endpoint only |

## Architecture

### Client-side modules

```
src/
├── input/
│   ├── signals.ts        — navigator, screen, preferences
│   ├── pointer.ts        — pointer/touch entropy tracking
│   └── geo.ts            — coarse Vercel geo hint plumbing
├── seed/
│   └── sessionSeed.ts    — hash + deterministic seeded params
├── audio/
│   ├── player.ts         — track loading and playback
│   └── analyser.ts       — analyser accessors (frequency/time-domain)
├── visual/
│   ├── mappings.ts       — partially legible mapping rules
│   ├── scene.ts          — Three.js scene bootstrap
│   └── renderLoop.ts     — frame updates
└── ui/
    ├── infoOverlay.ts    — artwork/privacy overlay
    └── audioToggle.ts    — mute control
```

### Server-side

| Endpoint | Purpose | Runtime |
|----------|---------|---------|
| `/api/geo` | Return coarse `{ country, region }` from Vercel `geolocation()` helper | Vercel Edge/Serverless |

The geo endpoint is the only server component. It returns `cache-control: no-store` and exposes no other data. If the endpoint fails, the client falls back to null geo values.

## Key Technical Decisions

### Privacy model
- All visitor-derived data lives in memory only — no cookies, localStorage, or analytics.
- Raw identifiers (IP, user-agent string, exact location) are never displayed or transmitted to third parties.
- Geo data is accessed only via coarse Vercel headers through the server endpoint, never via browser Geolocation API.

### Audio pipeline
- Audio files are served from `/public/audio` (mp3/ogg).
- Track selection is random per session with no-immediate-repeat logic.
- Playback is attempted muted to satisfy autoplay policies; visuals render regardless of autoplay success.
- The audio graph routes through an `AnalyserNode` before a `GainNode` so that frequency/time-domain analysis continues even while muted.
- Mute toggling adjusts gain rather than tearing down the audio graph.

### Rendering approach
- Full-screen dark canvas with no scrollbars.
- Scene parameters are derived from a deterministic session seed (hash of visitor signals + timestamp).
- The render loop reads audio analysis data and pointer state each frame.
- Buffer updates are preferred over per-frame object creation to minimise GC pressure.
- Expensive post-processing is deferred until the core loop is stable.

### Signal-to-visual mappings
Mappings are indirect and partially legible:

| Signal | Visual parameter | Character |
|--------|-----------------|-----------|
| Coarse geo (country/region) | Palette family | Warm/cool/neutral colour sets |
| Timezone / time-of-day | Cadence or modulation speed | Temporal rhythm |
| DPR / hardware capability | Density or structure range | Scene complexity |
| `prefers-reduced-motion` | Calmer motion profile | Reduced amplitude, preserved identity |
| Pointer entropy | Field disturbance | Organic perturbation |
| Bass (low frequency) | Macro motion | Camera drift, field expansion, wave amplitude |
| Treble (high frequency) | Fine detail / shimmer | Point jitter, line brightness, sparkle |

### Accessibility
- `prefers-reduced-motion` lowers motion amplitude without disabling the experience.
- Mobile devices receive scaled-down scene complexity (particle counts, shader detail).
- Touch and mouse input are both supported for pointer entropy.

## Dependencies

### Runtime (browser)
- **three** — 3D rendering
- **Web Audio API** — built-in browser API, no library dependency

### Build
- **vite** — bundler and dev server
- **typescript** — type checking

### Deployment
- **Vercel** — hosting, edge functions, geo headers

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Constraints

- No external streaming services or CDNs for audio.
- No third-party analytics, tracking, or fingerprinting libraries.
- No browser Geolocation API permission prompts.
- Desktop is the primary target; mobile must degrade gracefully.
- The experience must function fully even when audio autoplay is blocked.

## Definition of Done (per story)

- Production build succeeds (`npm run build`)
- No console errors on normal load
- No forbidden storage APIs used (cookies, localStorage, sessionStorage)
- Scene works with and without successful autoplay
- Mute toggle and info overlay remain functional
