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

## Status

v2 rewrite on the `v2` branch: phases 1–7 of `docs/REWRITE_PLAN.md` are implemented (some Phase 5 layers remain). Read the plan's status tables before touching rendering, audio-structure or composition code. Visual changes must be smooth and trippy, never flashy or fast: no cuts, snaps, glitches or instant jumps.

## Tech Stack

- Runtime: browser on Vercel
- App: Vite
- Language: TypeScript
- Rendering: **vgpu** (https://vgpu.sh) on WebGPU. Shaders are plain `.wgsl` modules loaded through `@vgpu/wgsl`.
- Audio: Web Audio API (`AudioContext`, `AnalyserNode`, `GainNode`)
- Track structure: build-time analysis JSON in `public/audio/analysis/`

## Core Rules

- Keep all visitor-derived data in memory only
- Do not transmit raw identifiers to third-party services
- Only use coarse Vercel geo headers when available
- Do not use browser Geolocation API
- Autoplay is attempted with sound on. If the browser blocks it, playback falls back to muted and unmutes on the first user gesture; it must never fail hard
- Audio analysis must continue while muted
- The experience must still render if audio autoplay is blocked
- If WebGPU is unavailable, show the static on-aesthetic message page. There is no fallback renderer and no legacy code path. Never keep legacy code around.

## Rendering (v2)

- All vgpu calls go through `src/render/`. Pin the exact `vgpu` version; upgrades are deliberate and go through the Phase 1 spike checklist.
- No GLSL. No Three.js. Shaders live in `src/wgsl/` (shared modules) and `src/post/wgsl/` (post stack).
- Every `.wgsl` file must pass `npx vgpu check`.
- Pipelines of the active recipe are compiled ahead during the intro fade; lazy first-frame compilation is not acceptable.

## Visual Target (v2)

- Aesthetic: 90s demoscene / hacker-culture cyberdelia. Wireframes, fractals, kaleidoscopes, tunnels, strange attractors, 4D polytopes, CRT/phosphor post-processing. Emissive geometry on black.
- Forbidden: solid shaded terrain, skies, lit realistic surfaces, flat 2D screen-saver visuals, organic blob shapes as the subject. Wire-and-dot landscapes (the warm valleys) are explicitly wanted; they are lines and points, never a surface.
- The scene MUST be 3D: perspective camera, parallax, depth. Points, lines, raymarched fractals and compute particles are all valid primitives.
- Every recipe declares its tier requirements and limits; recipes are filtered by device capability before seeded selection.

## Audio Reactivity (v2)

- Continuous: bass → macro deformation, treble → fine detail, mid → atmosphere. Must run while muted.
- Structural: track analysis (offline JSON + live onset fallback) drives events: beat, bar, build, drop, breakdown, section. Events trigger transitions, cuts, and recipe changes. Timer-based mode switching is not acceptable.
- Audio never binds to global brightness.

## Composition (v2)

- A session renders seeded **recipes** composed of environment + subject + particle layers + post preset + camera rig. The seed decides structure, not only colour.
- The post stack sits over every recipe and is tweakable per preset via the `?debug` panel.

## Photosensitivity (decided: no flashes)

- No flashes, strobes, or white frames anywhere. Transitions are hard cuts, feedback smears, kaleidoscope wipes, folds, glitches and camera cuts — all luminance-neutral.
- The composite pass luminance limiter is always on and clamps frame-to-frame brightness change.
- `prefers-reduced-motion` disables feedback, kaleidoscope rotation, snap cuts and fast camera motion.

## Product Shape

- Full-screen dark visual scene
- Minimal UI only: mute toggle + info button + brief generated track name on track change
- Random track selection from `/public/audio`
- Pointer input acts as entropy, not direct control
- Scene evolves over time and should feel fleeting

## Module Layout (v2)

- `src/render/` — vgpu bootstrap, surface, targets, health gate, frame loop
- `src/input/` — navigator, screen, preferences, pointer entropy, coarse geo
- `src/seed/` — hash + deterministic seeded params
- `src/audio/` — player, analyser; `audio/structure/` timeline + event bus
- `src/director/` — recipes, rules, transitions, camera rigs
- `src/layers/` — environment / subject / particles / texture layers
- `src/post/` — effect chain, presets, modulators, `post/wgsl/`
- `src/wgsl/lib/` — shared WGSL modules (palette, fold, sdf, raymarch, rotate4d, points, lines)
- `src/visual/` — quality tiers, palette families, evolution, prng, mappings (kept from v1)
- `src/ui/` — mute, info overlay, track display, debug overlay
- `scripts/` — `analyzeTracks.ts` (build-time), `renderPoster.ts` (headless OG image)

## Mapping Guidance

Prefer indirect but perceptible mappings:
- coarse geo -> palette family and post preset bias
- timezone/time -> cadence, grain, feedback baseline
- DPR/capability -> tier, point budgets, raymarch steps
- reduced-motion -> calmer motion profile
- pointer entropy -> post distortion wobble, raymarch jitter, IFS perturbation
- bass -> macro motion
- treble -> fine detail / shimmer
- track structure -> when things happen

Do not display:
- raw IP
- raw user agent
- exact location labels
- exact browser fingerprint values

## Performance Guidance

- Prefer buffer updates over per-frame object churn; record unchanging draws as render bundles
- Quality scaling MUST NOT shrink the canvas element's CSS size; lower tiers reduce DPR, point counts, raymarch steps and post stages
- Auto-downgrade drops post stages before dropping DPR
- Desktop is primary target, but mobile should degrade gracefully

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

## Render Completion Gate (v2)

Rendering work is only complete when:
- `npx vgpu check` passes for every `.wgsl` file
- the health gate reports zero validation errors when compiling ahead every pipeline of the active recipe
- no `uncapturederror` events during the first 5 seconds
- a `vgpu/node` headless render of the recipe produces a non-black frame
- the unsupported-WebGPU path shows the static message and starts nothing else
- no stage binds audio to global brightness and the luminance limiter is in the chain

## Definition of Done

A story is only complete when:
- build passes
- `npx vgpu check` passes
- no console errors on normal load
- no forbidden storage APIs are used
- scene works with and without successful autoplay
- mute toggle and info overlay still work
- no legacy code or dependencies remain from the replaced path
