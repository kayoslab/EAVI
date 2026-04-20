![EAVI](docs/EAVI%20digital%20audiovisual%20landscape.png)

# EAVI — Ephemeral Audiovisual Installation

A generative audiovisual experience that creates a non-repeatable scene from your browser context, the current time, pointer movement, and live audio analysis.

Every visit is unique. Nothing is stored. Nothing repeats.

## What It Does

EAVI renders a full-screen 3D visual experience that responds to music in real time. The visuals are shaped by who you are — your device, your timezone, your location — but never reveal those details directly. The mapping is partially legible: you can feel the influence of your context without decoding it.

The experience fades in from black over 3 seconds and cycles through visual modes with cinematic transitions — a brief dark moment between scenes, like cuts in a film.

### Visual Modes

The experience cycles through visual systems, each with distinct character:

**Environments** — immersive spaces the camera flies through:
- **Terrain Grid** — A wide grid of points forming rolling hills and valleys, viewed as a slow aerial flyover
- **Dramatic Terrain** — Exaggerated topography with height-based color gradients from deep indigo valleys to warm amber peaks
- **Wireframe Terrain** — Triangulated mesh surface with glowing triangle edges forming a retro digital landscape
- **Tunnel** — A cylindrical mesh the camera travels through, walls undulating gently with bass
- **Cave** — Floor and ceiling terrain meshes creating an enclosed corridor that breathes with audio

**3D Objects** — geometric forms the camera slowly orbits:
- **Icosphere** — A subdivided icosahedron that expands and morphs with audio energy
- **Torus** — A triangulated donut that breathes and shimmers
- **Morphing Polyhedra** — An organic shape with strong radial displacement, constantly evolving

**Particle Systems** — point-based visual fields with organic Lissajous camera drift:
- **Point Cloud** — Volumetric 3D shapes (torus, gyroid, supershape) that morph with audio
- **Particle Field** — Curl-noise driven particles flowing through attractor fields
- **Ribbon Field** — Parametric surfaces (helicoid, Mobius strip, torus knots) sampled as point bands
- **Flow Ribbon** — Streamline-based particles advected through a 3D curl field
- **Crystal Field** — Lattice clusters with facet shimmer and pulse deformation

### Audio Reactivity

Every visual mode responds to music through three frequency bands:

- **Bass** (0-25%) drives macro motion — expansion, wave amplitude, shape breathing, radial deformation
- **Mid-range** (25-75%) modulates atmospheric depth — higher mids pull fog closer, creating a cozy enclosed feeling; lower mids open the view
- **Treble** (75-100%) drives fine detail — point shimmer, sparkle, micro-displacement
- **Color warmth** — bass gently warms the palette toward amber tones; combined energy enriches saturation
- **Track mood** — a rolling 5-second energy average shifts the overall palette warmth, so calm tracks stay cool and energetic tracks glow warmer
- **Chromatic dispersion** — combined audio energy drives per-channel color fringing

Audio tracks crossfade smoothly over 2 seconds. Analysis continues even when muted, with a synthetic bass fallback ensuring visuals always move.

### Camera Motion

Each mode category has its own camera behavior:

- **Environments**: Continuous forward flythrough with gentle lateral sway. Camera stays at a fixed height above the geometry.
- **3D Objects**: Slow cinematic elliptical orbit (2-3 minutes per revolution) revealing the form from all angles.
- **Particle Systems**: Organic Lissajous drift using incommensurate frequencies — the camera wanders without ever retracing the same path.

### Background Atmosphere

A subtle deep-space gradient sits behind all geometry — dark center fading to deep blue-purple edges. Bass energy gently warms the background tint, creating a breathing ambient space.

### Pointer Interaction

Mouse or touch movement creates a gentle ripple in nearby geometry — a field disturbance that pushes points and vertices away from the cursor. The effect is more pronounced on desktop.

### Seed System

Each session generates a unique seed from:
- Coarse geographic region (via server-side Vercel headers)
- Device characteristics (DPR, cores, screen size, touch capability)
- Time of day and timezone
- Timestamp at initialization

This seed determines: color palette family, structural parameters (noise frequency, twist strength, radial scale), mode rotation order, camera motion harmonics, and evolution curves. Parameters drift over time via layered sine harmonics with incommensurate periods, so the scene continuously evolves — all without storing anything.

### Depth of Field

Each mode type has tuned depth-of-field:
- Particle systems: soft, dreamy (dofStrength 0.5)
- Wireframe/triangle meshes: sharp, geometric clarity (dofStrength 0.1)
- Terrains: moderate landscape feel (quality-tier dependent)

### Mobile

Portrait orientation automatically widens the camera field of view (75° vs 60°) to show more of the scene.

## Privacy

- No cookies
- No localStorage
- No analytics or tracking
- No backend persistence
- No browser geolocation prompts
- All visitor-derived data stays in memory only

## Tech Stack

- **Runtime**: Browser, deployed on Vercel
- **Build**: Vite
- **Language**: TypeScript
- **Rendering**: Three.js (WebGL, perspective camera, custom GLSL shaders)
- **Audio**: Web Audio API (AudioContext, AnalyserNode, dual-deck crossfade)
- **Post-processing**: UnrealBloomPass (medium/high quality tiers)

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build

```bash
npm run build
```

### Test

```bash
npx vitest run
```

## Deployment

Deployed on Vercel. The `/api/geo` endpoint uses Vercel's `geolocation()` helper to provide coarse geographic context without client-side geolocation prompts.

## License

All rights reserved.
