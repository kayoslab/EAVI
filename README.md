![EAVI](docs/EAVI%20digital%20audiovisual%20landscape.png)

# EAVI — Ephemeral Audiovisual Installation

A generative audiovisual experience that creates a non-repeatable scene from your browser context, the current time, pointer movement, and live audio analysis.

Every visit is unique. Nothing is stored. Nothing repeats.

## What It Does

EAVI renders a full-screen 3D particle landscape that responds to music in real time. The visuals are shaped by who you are — your device, your timezone, your location — but never reveal those details directly. The mapping is partially legible: you can feel the influence of your context without decoding it.

### Visual Modes

The experience cycles through multiple visual systems, each with distinct character:

- **Terrain Grid** — A regular grid of points forming rolling hills and valleys, viewed as a flyover landscape
- **Dramatic Terrain** — Exaggerated topography with height-based color gradients from deep valleys to bright peaks
- **Wireframe Terrain** — Retro digital landscape with grid lines connecting vertices in a cyan/green palette
- **Point Cloud** — Volumetric 3D shapes (torus, gyroid, supershape) that morph with audio
- **Particle Field** — Curl-noise driven particles flowing through attractor fields
- **Ribbon Field** — Parametric surfaces (helicoid, Mobius strip, torus knots) sampled as point bands
- **Flow Ribbon** — Streamline-based particles advected through a 3D curl field
- **Crystal Field** — Lattice clusters with facet shimmer and pulse deformation

### Audio Reactivity

- Bass drives macro motion: expansion, wave amplitude, shape breathing
- Treble drives fine detail: point shimmer, sparkle, micro-displacement
- Audio analysis continues even when muted
- Synthetic fallback ensures visuals always move, even without audio

### Seed System

Each session generates a unique seed from:
- Coarse geographic region (via server-side Vercel headers)
- Device characteristics (DPR, cores, screen size, touch capability)
- Time of day and timezone
- Timestamp at initialization

This seed determines: color palette, structural parameters, mode rotation order, camera motion harmonics, and evolution curves — all without storing anything.

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
- **Audio**: Web Audio API (AudioContext, AnalyserNode)

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
