# Project Context

## Purpose

EAVI is an ephemeral generative audiovisual website.
Each visit creates a non-repeatable scene from in-memory visitor context, current time, live pointer entropy, and audio analysis.

The work is artistic and privacy-conscious:
- no cookies
- no localStorage
- no analytics
- no backend persistence
- no geolocation permission prompt

The mapping should be partially legible:
visitor context influences the scene in ways a viewer can feel and loosely understand, but raw identifiers must never be shown.

## Tech Stack

- Runtime: browser on Vercel
- App: Vite
- Language: TypeScript preferred
- Rendering: Three.js preferred
- Audio: Web Audio API (`AudioContext`, `AnalyserNode`, `GainNode`)

## Core Rules

- Keep all visitor-derived data in memory only
- Do not transmit raw identifiers to third-party services
- Only use coarse Vercel geo headers when available
- Do not use browser Geolocation API
- Autoplay should be attempted muted and must fail gracefully
- Audio analysis must continue while muted
- The experience must still render if audio autoplay is blocked

## Product Shape

- Full-screen dark visual scene
- Minimal UI only: mute toggle + info button
- Random track selection from `/public/audio`
- Visuals react to bass and treble differently
- Pointer input acts as entropy, not direct control
- Scene evolves over time and should feel fleeting

## Recommended Module Split

- `src/input/signals.ts` — navigator, screen, preferences
- `src/input/pointer.ts` — pointer/touch entropy
- `src/input/geo.ts` — coarse Vercel geo hint plumbing
- `src/seed/sessionSeed.ts` — hash + deterministic seeded params
- `src/audio/player.ts` — track loading and playback
- `src/audio/analyser.ts` — analyser accessors
- `src/visual/mappings.ts` — partially legible mapping rules
- `src/visual/scene.ts` — scene bootstrap
- `src/visual/renderLoop.ts` — frame updates
- `src/ui/infoOverlay.ts` — artwork/privacy overlay
- `src/ui/audioToggle.ts` — mute control

## Mapping Guidance

Prefer indirect but perceptible mappings:
- coarse geo -> palette family
- timezone/time -> cadence or modulation speed
- DPR/capability -> density or structure range
- reduced-motion -> calmer motion profile
- pointer entropy -> field disturbance
- bass -> macro motion
- treble -> fine detail / shimmer

Do not display:
- raw IP
- raw user agent
- exact location labels
- exact browser fingerprint values

## Performance Guidance

- Keep first mode lightweight
- Prefer buffer updates over per-frame object churn
- Avoid expensive post-processing until core loop is stable
- Desktop is primary target, but mobile should degrade gracefully

## Definition of Done

A story is only complete when:
- build passes
- no console errors on normal load
- no forbidden storage APIs are used
- scene works with and without successful autoplay
- mute toggle and info overlay still work


## Geo Handling (Important)

- Geo data MUST NOT be accessed directly from browser request headers
- Implement a server endpoint at `/api/geo`
- Use Vercel `geolocation()` helper to extract:
  - country
  - region
- Only return coarse values (no city unless explicitly needed)
- Response must include `cache-control: no-store`
- Client must fetch this endpoint once at startup
- If endpoint fails, fallback to null values

Example structure:

`api/geo.ts`
- read geolocation(request)
- return { country, region }

Client:
- fetch('/api/geo')
- merge into session inputs

## Non-Negotiable Visual Target
- Visuals MUST be 3D (perspective camera, visible depth/parallax).
- The primary visual primitive MUST be a 3D point cloud (Three.js Points + BufferGeometry).
- Canvas2D is NOT an acceptable final rendering backend (only optional fallback if WebGL is unavailable).

## Mobile Full-Screen Requirement
- Quality scaling MUST NOT shrink the canvas element’s CSS size.
- Lower tiers reduce GPU cost via pixel ratio / point count / shader complexity, while remaining full-screen.

## Audio Reactivity Requirement
- Bass MUST drive macro 3D deformation.
- Treble MUST drive fine detail behaviour (sparkle/micro-displacement/point size).
- Audio reactivity must still run when muted.

## Non-Negotiable Spatial Requirement

The final visual MUST be three-dimensional.

Flat 2D canvas-based implementations do NOT satisfy the artistic goal.
The scene must include:
- Perspective camera
- Volumetric point cloud geometry
- Shader-based 3D deformation
- Visible depth/parallax

Implementations that render only screen-space 2D particles or sine waves are invalid.

## Shader Integrity Rules

- Any ShaderMaterial ticket automatically fails if the browser console shows:
  - shader compile errors
  - WebGLProgram VALIDATE_STATUS errors
  - invalid program errors

- Every GLSL symbol used in expressions must be one of:
  - a declared attribute
  - a declared uniform
  - a declared varying
  - a declared local variable

- Every custom GLSL attribute must be attached to BufferGeometry before first render.
- Optional attributes must have a safe fallback path that still renders correctly.
- A visually broken but "running" scene does not count as complete.

## Render Completion Gate

Rendering work is only complete when:
- shaders compile cleanly
- no WebGL validation errors appear
- geometry attributes are present and finite
- the scene renders a stable first frame
- the scene still renders in a safe baseline mode with optional modulation disabled