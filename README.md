![EAVI](docs/EAVI%20digital%20audiovisual%20landscape.png)

# EAVI — Ephemeral Audiovisual Installation

A generative audiovisual piece in the spirit of 90s demoscene and hacker culture: wireframes, fractals,
kaleidoscopic tunnels, 4D polytopes and strange attractors, rendered live on your GPU and steered by the
structure of the music. Every visit composes a scene that never repeats. Nothing is stored.

Live: https://eavi.cr0ss.org

## What it does

- **Recipes.** A session is a seeded composition of an environment (Tron grid, kaleidoscopic tunnel, star warp),
  a subject (Menger sponge, wireframe polyhedra, 4D polytopes up to the 600-cell, a live vector scope, a fractal
  flame) and an optional particle layer (Lorenz attractor, flame), under one of six post presets.
- **Music structure, not just loudness.** Each track is analysed once at build time (beat grid, bars, sections,
  builds, drops, breakdowns). At runtime a timeline replays those events against playback position and a
  Director reacts: drops melt the subject into a new variant, sections fold through the kaleidoscope, builds raise
  the tempo of motion, breakdowns desaturate and thin the scene. Live bass, mids and treble still modulate
  everything continuously, and analysis keeps running while muted.
- **Smooth and trippy, never flashy.** Every change is eased over seconds; there are no cuts, snaps or glitches.
  A luminance limiter bounds how fast the frame can brighten and a slow automatic gain keeps the picture dark
  and glowing, so nothing flashes.
- **Post stack.** Feedback trails, two-tier bloom, kaleidoscope, CRT barrel, RGB shift, colour bleed, scanlines,
  palette grading, grain and dither. Presets: `clean`, `phosphor`, `amber`, `vhs`, `crt`, `acid`. Open `/?debug`
  for a slider per parameter.
- **Partially legible context.** Coarse region, device class, time of day and pointer movement shape palette,
  structure and pace. Raw identifiers never appear.

## Privacy

No cookies, no localStorage, no analytics, no backend persistence, no geolocation prompt.
Everything visitor-derived lives in memory until the tab closes.

## Tech

- [vgpu](https://vgpu.sh) on WebGPU; shaders are plain `.wgsl` modules. Browsers without WebGPU get a static page.
- Vite, TypeScript, Vercel (`/api/geo` returns only coarse country/region with `cache-control: no-store`).
- Web Audio for live analysis; a build-time DSP script for track structure.

## Development

```bash
npm install
npm run dev              # http://localhost:5173  (add ?debug for the overlay and tweak panel)
npm run build
npm test
npm run analyze:tracks   # regenerate public/audio/analysis/*.json after changing public/audio
npm run poster -- --recipe tunnel-cube --preset crt --out .artifacts/poster.png
npm run smoke:browser    # headless Chrome against the dev server: console, page errors, screenshot
```

Headless rendering (tests and the poster) runs through Dawn via `vgpu/node`; every recipe is rendered in CI-style
tests with zero GPU errors asserted.

## Browser support

WebGPU: current Chrome and Edge, Safari 26 on macOS and iOS, Firefox on the desktop, Chrome on Android.

## License

All rights reserved.
