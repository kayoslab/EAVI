# EAVI v2 — Rewrite Plan (vgpu / WebGPU, 90s cyberdelic aesthetic)

Status: approved 2026-10-20 (rev 3: decisions in §11 resolved; rendering stack is **vgpu**)
Scope: replace the visual layer entirely; keep privacy model, audio pipeline, seed system, UI shell.

---

## 1. Intent

EAVI v2 is a **demoscene / 90s hacker-culture audiovisual installation**: wireframes, fractals,
kaleidoscopes, tunnels, strange attractors, phosphor glow, scanlines, chromatic fringing, feedback
trails, 4D rotations. Geometric and recursive rather than organic. Trippy through symmetry, recursion
and feedback rather than through realism.

Touchstones: Future Crew *Second Reality*, Winamp AVS / MilkDrop, *Tron*, *Hackers* (1995),
*The Lawnmower Man*, Electric Sheep, Mandelbulb/Mandelbox zooms, *Ghost in the Shell* title sequence.

### Design principles

1. **Always 3D.** Perspective camera, parallax, depth fog. Flat screen-savers are out.
2. **Void, not world.** Black space. No terrain *surfaces*, no sky, no lit solids. Emissive geometry on black — wire-and-dot landscapes qualify.
3. **Geometric, not organic.** Lines, points, facets, folds, grids, lattices. Noise is a modulator, not the subject.
4. **Trippy via recursion and symmetry.** Fractals, kaleidoscope folds, feedback loops, infinite tunnels.
5. **Music makes things happen.** Drops cut, builds ramp, breakdowns strip. Timer-based mode switching is gone.
6. **Every visit is a different composition**, not a different tint. Seed chooses structure, not just hue.
7. **Privacy rules unchanged.** Memory only, no storage, no identifiers on screen.

---

## 2. Rendering stack: vgpu

[vgpu](https://vgpu.sh) is Vercel Labs' WebGPU library: a small API (`init`, `surface`, `target`,
`effect`, `draw`, `compute`, `storage`, `frame`/`frameLoop`, `bundle`) over plain `.wgsl` files that
import and export like TypeScript modules. One codebase runs in the browser, headless in Node (Dawn),
and against a deterministic mock for tests.

Verified 2026-10-20 (npm `vgpu@0.6.0`, published 2026-10-12, MIT):

| Fact | Consequence for EAVI |
|---|---|
| WebGPU-only. `init()` throws `VGPU-RING1-UNSUPPORTED` when WebGPU is unavailable; there is no WebGL backend | Non-WebGPU browsers get a static, on-aesthetic message (decided; see §6). No fallback renderer. |
| Compute with storage buffers, read-write storage, storage textures, atomics are plain WGSL | Attractors, boids, fractal flame histograms are all first-class |
| `effect()` = fullscreen fragment pass; `target()` offscreen targets with formats like `rgba16float`; ping-pong supported | The post stack is an explicit chain of hand-written effects, which is what a tweakable 90s stack needs anyway |
| `draw()` takes a WGSL vertex+fragment shader, vertex count, instance count, blend state, topology | Instanced quads for points, line-lists for wireframes; no material system to fight |
| `vgpu/scene`: CPU transforms, groups, hierarchy, fixed-capacity instance records, camera state (orbit/pan/dolly/zoom/smoothing/projection), geometry recipes (`box`), `vgpu/scene/gpu` publishes instances as vertex streams | Enough for a camera rig and instanced geometry; we own the rest |
| `@vgpu/wgsl-std`: color (ACES/Reinhard tonemap, luminance threshold, sRGB), fullscreen triangle, hash, Voronoi/Perlin/simplex noise, scene transform helpers | No bloom/blur/CRT/kaleidoscope in the std lib; those are written by us (the examples ship reference implementations we can pull with `npx vgpu examples pull <id>`) |
| `vgpu/mock` (software Gpu for CI), `vgpu/node` (Dawn headless rendering), Playwright-WebGPU and agent-browser screenshot guides, `npx vgpu check` WGSL validation, MCP server + `llms.txt` | A far stronger test and agent story than Three.js WebGPU; real rendered screenshots in CI |
| `vgpu/three` adapter turns pure WGSL functions into Three.js TSL nodes; it does **not** share a device or render into Three | Not useful for v2; noted for completeness |
| Pre-1.0: 0.0.1 in May 2026 → 0.6.0 in October 2026, breaking changes between minors | Pin the exact version; wrap vgpu behind a thin `src/render/` adapter so churn is localised |
| Vite integration: `wgslVitePlugin()` from `@vgpu/wgsl/loader-vite`, `/// <reference types="@vgpu/wgsl/wgsl-types" />` | Fits the existing Vite 8 setup |
| Reference example `spiral-galaxy` (compute sim → additive instanced stars → 2-tier Gaussian bloom → composite with flare/vignette/ACES) is ~2,300 lines incl. 700 lines of WGSL | Realistic size for one EAVI recipe with post stack |

### Why vgpu over Three.js WebGPURenderer + TSL (recorded for the decision log)

| | vgpu | Three.js WebGPURenderer + TSL |
|---|---|---|
| Shader authoring | Plain WGSL files with imports; `npx vgpu check` | TSL (JS-chained DSL) compiled to WGSL/GLSL |
| Post-processing library | None; write each effect (~50–200 lines WGSL each) | ~40 display nodes incl. bloom, afterImage, CRT, RGB shift |
| Compute | Native, explicit | Via TSL `Fn().compute()`, works but abstracted |
| WebGL2 fallback | None | Automatic |
| Scene/camera/geometry | Thin (`vgpu/scene`) | Full engine |
| Testing | Mock + headless Dawn + Playwright guides | jsdom cannot render; headless Chromium only |
| Maturity | 0.6.0, pre-1.0, fast churn | r183, stable-ish, WebGPU path still evolving |
| Fit for EAVI v2 | Everything EAVI v2 needs is "fullscreen passes + compute + instanced points/lines", which is exactly vgpu's shape | Heavier than needed; fallback is the main draw |

Decision: **vgpu**. No legacy renderer is kept; non-WebGPU browsers get a static message (§6).

Browser reality (Oct 2026): WebGPU ships in Chrome, Edge, Android Chrome, Safari 26+ (macOS/iOS),
Firefox on Windows and most macOS/Linux builds. Older iOS and locked-down corporate browsers still miss it.

---

## 3. What stays, what goes, what gets reused

### Stays (untouched or lightly adapted)
- `src/input/*` — signals, pointer entropy, geo plumbing, `/api/geo`
- `src/seed/sessionSeed.ts`, `src/visual/prng.ts`
- `src/audio/player.ts`, `analyser.ts`, `trackList.ts` (dual-deck crossfade, muted analysis)
- `src/ui/*` — mute, info overlay, track display, name generator, debug overlay (extended)
- `src/visual/quality.ts` — tier heuristics (profile fields re-keyed)
- `src/visual/palette.ts` + geo → palette-family mapping
- `src/visual/evolution.ts` — slow harmonic drift of parameters
- Vite, TypeScript, Vercel, Vitest

### Reused as data generators (renderer-agnostic, produce Float32Arrays)
- `generators/polyhedraEdges.ts`, `dualPolyhedra.ts`, `nestedSolids.ts`, `geodesicSphere.ts`, `topologyDefinitions.ts`, `topologyInstances.ts`
- `generators/fractalGeometry.ts`, `lSystemTree.ts`, `cubeLattice.ts`, `latticeCluster.ts`, `cubeGrowth.ts`
- `generators/subdivideEdges.ts`, `extractVertices.ts`, `tessellateBezier.ts`

### Goes (deleted on the `v2` branch as soon as Phase 1 renders — nothing legacy stays around)
- `three` and `@types/three` dependencies (vgpu lists `three` only as an optional peer for its TSL adapter, which we do not use)
- All `src/visual/systems/*`, all GLSL shaders, `composer.ts` (UnrealBloomPass), `background.ts`, `placeholder.ts`, `occluder.ts`, `overlay.ts`, `curlLUT.ts`
- `shaderIntegrity.ts`, `shaderValidation.ts`, `shaderRegistry.ts`, `shaderErrorCollector.ts` (GLSL-specific)
- `modeManager.ts`, `compoundModes.ts` → replaced by the Director
- Terrain / tunnel / cave / torus / icosphere / morphpoly / trefoil generators (organic or solid; against the brief)
- Most of `tests/visual/*` (retired with the systems they test; generator tests stay)

---

## 4. Target architecture

```
src/
  render/
    gpu.ts             init() wrapper, capability probe, error codes → fallback decision
    surface.ts         canvas surface, DPR clamp per tier, resize
    targets.ts         HDR scene target (rgba16float), depth, half/quarter-res bloom targets, ping-pong pair
    healthGate.ts      v2: compile-ahead of all pipelines in a recipe; uncapturederror listener; finite-buffer checks
    loop.ts            frameLoop: audio → director → layers → post
  audio/
    player.ts analyser.ts trackList.ts      (existing)
    structure/
      analysis.ts      TrackAnalysis JSON schema
      timeline.ts      maps deck currentTime → upcoming events, lookahead
      eventBus.ts      typed events: beat, bar, section, build, drop, breakdown, trackStart/End
      liveOnset.ts     runtime spectral-flux fallback (exists today in renderLoop)
  director/
    recipe.ts          Recipe schema + validation
    recipes/           catalogue of seeded scene recipes
    director.ts        selects recipe, owns layer lifecycle, applies event→action rules
    rules.ts           event → action mapping (per-recipe overrides)
    transitions.ts     hard cut, flash cut, feedback smear, kaleidoscope wipe, glitch
    camera/            rigs on vgpu/scene camera state: orbit, fly, tumble4D, snapCut
  layers/
    Layer.ts           interface: create(gpu, ctx), update(frame), encode(frame, sceneTarget), dispose()
    environment/       GridVoid, HyperTunnel, StarWarp, WireCathedral
    subject/           WirePolyhedra, FractalZoom, Polytope4D, FractalTree, Harmonograph, VectorScope
    particles/         Attractor, FractalFlame, Boids, CurlField     (compute)
    texture/           Plasma, MatrixRain                             (storage-texture generators)
  post/
    stack.ts           builds the effect chain for a preset; owns targets
    presets.ts         phosphor, vhs, crt, acid, clean
    modulators.ts      audio/pointer/time → effect uniform bindings
    wgsl/              feedback.wgsl bright.wgsl blur.wgsl kaleidoscope.wgsl rgbshift.wgsl crt.wgsl grain.wgsl dither.wgsl grade.wgsl composite.wgsl
  wgsl/
    lib/               shared WGSL modules: palette, hsv, fold (KIFS), sdf, raymarch, rotate4d, lines (quad-expanded line segments), points (instanced quads)
  visual/
    quality.ts palette.ts evolution.ts prng.ts mappings.ts (kept)
scripts/
  analyzeTracks.ts     build-time track structure analysis → public/audio/analysis/*.json
  renderPoster.ts      vgpu/node headless render of a seeded recipe → OG image / README poster
```

### Frame loop

```
poll analyser → bands (bass/mid/treble/flux) + live onset
timeline.tick(currentTime) → emit scheduled events (with lookahead)
director.update(frame, events) → may swap layers, trigger transitions, retarget camera
frame(gpu, f => {
  for layer in active: layer.encode(f, sceneTarget)      // compute passes + draws into HDR scene target
  post.encode(f, sceneTarget, canvasSurface)            // effect chain → canvas
})
```

### Capability flags (decided once at boot)

```ts
caps = {
  backend: 'webgpu',                     // the only backend; unsupported → static message, nothing else loads
  tier: 'low' | 'medium' | 'high',
  limits: { maxStorageBuffersInVertexStage, maxComputeWorkgroupSizeX, ... }  // from init()
}
```
Recipes declare `requires: { minTier?: Tier; limits?: Partial<Limits> }` and are filtered before seeded selection.

### Health gate v2

- `init()` failure with `VGPU-RING1-UNSUPPORTED` (or any other init error) → render the static unsupported message (§6). No render loop, audio, or pointer systems start.
- All pipelines of the selected recipe are compiled ahead during the intro fade (vgpu compiles lazily on first use; the docs recommend pre-warming).
- `device.addEventListener('uncapturederror', …)` collects runtime validation failures; the gate fails on any error in the first 5 s.
- Each layer validates generated buffers are finite before upload (keep `geometryValidator.ts`).
- CI: `npx vgpu check` on every `.wgsl`; Vitest with `vgpu/mock` for pass wiring; `vgpu/node` headless render of 3 recipes with non-black assertion and screenshot diff.
- Debug overlay shows backend, caps, active recipe, post preset, event log, per-pass GPU time (`timer()` when `timestamp-query` is available).

---

## 5. Phases

### Phase 0 — Decisions and spec
- Approve this plan.
- Revise `CLAUDE.md` constraints (proposed text in §10).
- Decide photosensitivity stance (hard cuts and flashes are on-brand but need a cap; see §8).
- Branch strategy: work on `v2` branch, replace in place, keep `main` deployable until parity.

### Phase 1 — Foundation spike  (exit gate for everything else)
Goal: prove the stack end-to-end before investing in visuals.
- `vgpu` + `wgslVitePlugin` in Vite 8; confirm bundle size, HMR, type references.
- `src/render/` adapter: init, surface with DPR clamp, HDR scene target, resize.
- One compute layer: Lorenz attractor, 500k points, read-write storage buffer integrated in a compute pass, drawn as instanced additive quads with a projection from `vgpu/scene` camera state.
- One raymarched layer: Menger sponge `effect()` writing depth so it composes with points.
- Minimal post: bright → blur ×2 → composite (port from `spiral-galaxy`), plus one feedback ping-pong (after-image).
- Unsupported path: static on-aesthetic message when `init()` throws; verified in a browser with WebGPU disabled.
- On exit: delete `src/visual/systems`, `src/visual/shaders`, `composer.ts`, old generators listed in §3, the `three` dependency, and their tests. The branch never carries both renderers.
- Health gate v2 catches a deliberately broken WGSL module at compile-ahead time; `npx vgpu check` fails it in CI.
- Tests: one `vgpu/mock` wiring test, one `vgpu/node` screenshot test.
- Test on: desktop Chrome, Safari 26, iOS 26 Safari, one Android, Firefox.
- Measure: first-frame time, frame time at high tier, memory.
Exit criteria: all of the above green, or we stop and reconsider.

#### Phase 1 status (2026-10-20)

| Criterion | Status |
|---|---|
| vgpu 0.6.0 + `@vgpu/wgsl` loader in Vite 8; `.wgsl` imports typed | done |
| `src/render/` adapter: gpu, surface, HDR targets with depth, health gate, frame loop | done |
| Compute layer: Lorenz attractor, storage read-write, instanced additive quads, depth-tested | done (400k high / 150k medium / 50k low) |
| Raymarched layer: Menger sponge, fullscreen draw writing `frag_depth` | done |
| Post: feedback ping-pong → bright → 2-tier blur → composite (ACES, sRGB, intro fade, vignette) | done |
| Static unsupported page; nothing else boots without a device | done; covered by `tests/scaffold.dom.test.ts` |
| Health gate catches a device-rejected pipeline | done; covered by `tests/render/spike.headless.test.ts` |
| Old stack deleted (`three`, GLSL, systems, generators, composer) | done; `polyhedraEdges`/`geodesicSphere` rewritten without Three |
| `npx vgpu check --require-validation` on all 9 WGSL files | pass |
| `vgpu/node` headless render (Dawn, Metal) non-black, zero errors | pass (14.5 % lit at 320×180) |
| `tsc`, `vite build`, `vitest` (46 files, 601 tests) | pass; bundle 272 kB / 73 kB gzip (was Three.js-sized) |
| Browser matrix: Chrome, Safari 26, iOS 26, Android, Firefox | **not done** — needs manual runs (`npm run dev`, open `/?debug`) |
| First-frame time and frame time at high tier | **not measured** yet |

### Phase 2 — Post stack
Explicit effect chain; every stage optional, parameterised, audio-modulated. Targets are `rgba16float`
until the final composite. All effects are hand-written WGSL in `src/post/wgsl/`:

```
scene (HDR)
 → feedback.wgsl        ping-pong after-image (damp), the MilkDrop smear          ~60 lines
 → bright.wgsl + blur.wgsl  threshold + 2-tier Gaussian bloom (port from example)  ~80 lines
 → kaleidoscope.wgsl    polar fold on screen UV, N segments + rotation            ~50 lines
 → rgbshift.wgsl        per-channel UV offset / radial chromatic aberration       ~40 lines
 → crt.wgsl             barrel UV, colour bleed, scanlines, vignette, mask         ~120 lines
 → grain.wgsl           film grain + optional dither / pixelation                 ~60 lines
 → grade.wgsl           palette LUT (1D ramp texture per family) + ACES            ~50 lines
 → composite.wgsl       final output to canvas                                    ~40 lines
```
- Presets: `phosphor` (green/amber mono CRT), `vhs` (bleed + shift + grain), `crt` (barrel + scanlines), `acid` (kaleidoscope + heavy feedback + hue cycling), `clean` (bloom only, low tier).
- Modulators (declarative bindings): bass→bloom strength, treble→rgbShift amount, beat→feedback damp dip, drop→kaleidoscope segment jump, build→feedback ramp, pointer entropy→barrel wobble, time of day→grain amount.
- Luminance cap before bloom; feedback + bloom blows out to white otherwise.
- **Luminance limiter (decided: no flashes).** The composite pass tracks mean frame luminance in a 1×1 readback-free target and clamps frame-to-frame change to a fixed slew rate, so no stage can produce a flash even by accident. Modulators never bind audio to global brightness; they bind to geometry, size, colour, fold, feedback and distortion instead.
- Reduced-motion: disable feedback, kaleidoscope rotation, snap cuts and fast camera motion.
- `?debug` panel with live sliders for every post parameter (tweakability was an explicit goal).

#### Phase 2 status (2026-10-20)

| Item | Status |
|---|---|
| Chain: feedback → bright → blur×4 → composite (HDR) → warp (pixelate, barrel, kaleidoscope, RGB shift) → measure (1×1 limiter state) → finish (bleed, ACES, ramp grade, hue rotate, scanlines, vignette, grain, dither, sRGB) | done, 10 passes at high tier; warp and bloom skipped by tier |
| Presets `clean`, `phosphor`, `amber`, `vhs`, `crt`, `acid` with per-preset modulators; seeded choice biased to the CRT family | done (`src/post/presets.ts`) |
| Modulators: declarative, clamped to ranges; `exposure` and limiter slews are unmodulatable at type level and at runtime | done (`src/post/modulators.ts`, tests) |
| Luminance limiter: measured vs limited mean, upward slew bounded, gain only attenuates | done; headless test proves a 10× exposure jump moves the next frame < 0.05 and releases over ~4 s |
| Reduced motion: feedback, kaleidoscope spin, hue cycling, barrel wobble disabled | done |
| `?debug` tweak panel: preset select, limiter bypass, slider per parameter | done (`src/ui/debugPanel.ts`) |
| Director sources `build`/`drop` | wired (Phase 4) |
| Visual tuning of presets in a real browser | **not done** |

### Phase 3 — Audio structure and events
**Offline analysis (build time).** Tracks are static files, so analyse them once:
- `scripts/analyzeTracks.ts` decodes each MP3 (candidate: `node-web-audio-api`, Rust-backed Web Audio for Node with MP3 decoding — verify in Phase 1; fallback is a headless-browser script using `OfflineAudioContext`).
- Output `public/audio/analysis/<trackHash>.json`:
  ```ts
  interface TrackAnalysis {
    duration: number; bpm: number;
    beats: number[]; downbeats: number[];          // seconds
    energy: { t: number; bass: number; mid: number; treble: number; total: number }[]; // 100 ms hop
    sections: { start: number; end: number; label: 'intro'|'build'|'drop'|'breakdown'|'outro'|'verse'; energy: number }[];
    events: { t: number; kind: 'drop'|'build-start'|'breakdown'|'section'|'fill'; strength: number }[];
  }
  ```
- Section detection: novelty curve on a self-similarity matrix of band energies + spectral centroid; label by relative energy and onset density. Drop = large positive energy step after a sustained rise. Good enough for a 7-track catalogue; hand-tweak JSON if a track is misread.
- No visitor data involved; nothing here touches privacy rules.

**Runtime.**
- `timeline.ts` loads the JSON for the active deck, tracks `audio.currentTime`, emits events with a configurable lookahead (e.g. `drop` emitted 2 s early as `drop:anticipate`, then `drop` on time) so the director can build tension before impact.
- Works while muted: timeline is driven by playback position, not gain.
- Crossfade: both decks have timelines; the incoming one takes over at crossfade midpoint.
- Live analyser stays for bands and spectral-flux onsets (fallback when JSON is missing or a track is added without analysis).
- `eventBus.ts` typed events; director and post modulators subscribe.

#### Phase 3 status (2026-10-20)

| Item | Status |
|---|---|
| `scripts/analyzeTracks.ts` (`npm run analyze:tracks`), MP3 via `mpg123-decoder` (WASM), own radix-2 FFT, band envelope, spectral-flux onsets, ACF tempo with comb-search beat grid, downbeats, Foote novelty sections, labels, events | done; 7 JSON files in `public/audio/analysis/` |
| Schema + validation + stable track id (`src/audio/structure/analysis.ts`) | done |
| Event bus, timeline (lookahead, seek reset, late window), live-onset fallback, loader | done; 92 tests |
| `player.getPlayback()` | done |
| `src/audio/structure/sync.ts` feeds the bus from playback (timeline when analysis exists, live otherwise) | done |

### Phase 4 — Director and recipes
**Recipe schema**
```ts
interface Recipe {
  id: string;
  requires: { minTier?: Tier; limits?: Partial<Limits> };
  environment: LayerSpec | null;      // GridVoid, HyperTunnel, StarWarp, WireCathedral
  subject: LayerSpec | null;          // WirePolyhedra, FractalZoom, Polytope4D, ...
  particles: LayerSpec | null;        // Attractor, FractalFlame, Boids, CurlField
  post: PostPreset;
  camera: CameraRig;                  // orbit | fly | tumble4D | snapCut
  palette: PaletteSpec;               // family from geo, plus per-recipe constraints (mono, duo, full)
  grammar: AudioGrammar;              // per-recipe overrides for event → action
  weight?: number;
}
```
- Seeded selection from the filtered pool; the seed also picks per-layer variant parameters (fractal type, fold count, attractor family, grid density, polytope).
- Director owns layer lifecycle; layers are pooled and reinitialised, never created per frame. Draws that do not change per frame are recorded as `bundle()`s.
- Default event grammar:

| Event | Default action |
|---|---|
| beat | pulse (scale, point size, line thickness — not brightness), bar-locked rotation step |
| bar / downbeat | camera micro-cut on snapCut rigs; kaleidoscope rotate by 1 segment |
| build-start | ramp feedback damp, bloom, camera speed; tighten fog |
| drop:anticipate | strip to subject only, dim, hold |
| drop | hard cut to new subject/recipe variant, particle burst, kaleidoscope jump, chromatic spike, camera zoom-cut — all luminance-neutral |
| breakdown | drop particles, slow camera, widen fog, mono palette |
| section | crossfade subject variant or swap environment |
| trackStart | new recipe (seeded sequence), show generated track name |

- Transitions (no flashes, decided; smooth not flashy, decided): `melt` (long feedback trails + gentle zoom, 4.5 s), `fold` (kaleidoscope folds to 8 segments and opens again, 5 s), `drift` (crossfade with a slow camera distance bell, 4 s). Every change is eased over seconds; there are no cuts, snaps, glitches or instant jumps.
- Camera rigs on `vgpu/scene` camera state: `orbit`, `fly` (through tunnels/grids), `tumble4D` (object rotates in XW/YW/ZW planes, camera fixed), `snapCut` (bar-locked jumps between seeded viewpoints — very demoscene).

#### Phase 4 status (2026-10-20)

| Item | Status |
|---|---|
| `src/director/director.ts`: recipe lifecycle, standby subject compiled ahead so cuts are instant, per-slot opacity fades, envelopes (`build`, `drop`, timeline `beatPulse`), breakdown/anticipation modes | done; 7 unit tests + 1 on-device test |
| Grammar (revised 2026-10-20 after "smooth and trippy, not flashy and fast"): beat → subtle pulse; bar → kaleidoscope glides one segment, wander camera eases a turn over 8 s every 4 bars; build-start → build ramp (+gentle motion); drop:anticipate → particles dim, motion slows, all eased; drop → `melt` or `fold` (4.5–5 s) into the standby subject with a 3 s crossfade, drop envelope decays over 2.5 s; breakdown → desaturate, particles fade out, motion halves, eased over seconds; section → `drift`/`fold`/`melt` with a 4 s crossfade; trackStart → new seeded recipe prepared then melted in. No cuts, snaps, glitches or instant jumps anywhere | done |
| Transitions are luminance-neutral by construction; transients may never touch exposure or limiter (enforced in `PostStack.setTransient`); periodic offsets wrap instead of clamping | done |
| Camera rigs: `orbit`, `wander` (eased yaw/pitch turns, bell-shaped distance drift) | done; `fly`/`tumble4D` not yet |
| Per-recipe grammar overrides, palette constraints, post preset per recipe | not yet (post preset is seeded per session) |

### Phase 5 — Layer library
Each layer: look, technique, audio grammar, seed variance. Rendering primitives are shared WGSL modules:
`points` (instanced additive quads, size by depth), `lines` (quad-expanded segments from an index list), `fullscreen` (raymarch).

**Environments**
- **GridVoid** — infinite wireframe grid floor + ceiling receding to a vanishing point (*Tron*). Line instancing; grid scrolls with bass, line glow with treble. Variance: cell size, two-tone palette, perspective tilt.
- **HyperTunnel** — raymarched kaleidoscopic IFS tunnel; walls fold and rotate, camera flies forward. Bass: tunnel radius breathes; drop: fold count jumps. Variance: fold symmetry, twist rate.
- **StarWarp** — hyperspace starfield in compute, 1M points, streaks lengthen with energy.
- **WireCathedral** — KIFS-folded space raymarched with edge detection on SDF normals (wireframe look). High tier only.

**Subjects**
- **WirePolyhedra** — reuse existing generators: nested solids, duals, geodesics, morphing between polyhedra on bars. Lines + glow points at vertices.
- **FractalZoom** — raymarched Mandelbulb / Mandelbox / Menger / Apollonian; audio modulates power/fold/scale; camera orbits or dives. Variance: fractal family, iteration count by tier, orbit-trap colouring.
- **Polytope4D** — tesseract, 16-cell, 24-cell, 120-cell edge sets; rotated in 4D planes and projected to 3D. Rotations step on bars; bass warps projection distance.
- **FractalTree** — reuse `lSystemTree`; grows on builds, prunes on breakdowns; wireframe.
- **Harmonograph** — Lissajous / harmonograph ribbons in 3D, frequencies from seed and bpm; traces with feedback.
- **VectorScope** — time-domain waveform from the analyser drawn as an XY oscilloscope curve in 3D (works muted because analysis runs regardless).

**Particles (compute)**
- **Attractor** — Lorenz, Thomas, Aizawa, Halvorsen, Sprott; 500k–2M points integrated in compute; params modulated by bass; feedback gives trails.
- **FractalFlame** — chaos-game IFS; compute iterates points through seeded affine + variation functions, `atomicAdd` into a storage-buffer histogram, log-density tone-mapped to a quad placed in 3D depth with parallax layers. Variations change on sections; drop re-seeds the IFS.
- **Boids** — flocking with spatial hashing in compute; treble scatters, bass cohesion.
- **CurlField** — curl-noise advection with long trails.

**Texture layers (storage-texture generators)**
- **Plasma** — classic sine-plasma into a storage texture, mapped onto tunnel walls or grid cells.
- **MatrixRain** — glyph rain into a storage texture; used as a wall/floor material, never as a flat overlay.

#### Phase 5 status (2026-10-20, partial — delivered ahead of Phase 4 because layers are director-independent)

| Layer | Kind | Status |
|---|---|---|
| GridVoid | environment, procedural line instancing, scrolls with cadence/bass | done |
| HyperTunnel | environment, raymarched kaleidoscopic tube ahead of the camera, depth-writing, glowing grooves | done |
| Menger sponge | subject, raymarched, depth-writing | done (Phase 1) |
| WirePolyhedra | subject, plain/nested/dual/geodesic edge sets, simplex ripple | done; generators rewritten without Three |
| Polytope4D | subject, 5-cell/tesseract/16-cell/24-cell/600-cell rotated in XW/YW/ZW on the GPU | done; edge counts unit-tested |
| VectorScope | subject, live waveform ring (works muted) | done |
| Attractor | particles, Lorenz in compute, density-normalised additive points | done (Phase 1) |
| FractalFlame | texture/particles, chaos game with atomics, max-relative log density, parallax sheet | done; WebGPU-only by nature |
| StarWarp | environment, compute streaks in the camera frame | done |
| Harmonograph | subject, damped 3D Lissajous ribbon generated in the vertex stage | done |
| FractalTree | subject, L-system wire branches (reuses `wire-lines.wgsl`) | done |
| CurlField | particles, curl-noise advection in compute (reuses the point shader) | done |
| Terrain (gentle / dramatic) | environment, procedural heightfield as grid lines + vertex dots, warm indigo→amber ramp, aerial drift (restores the pre-rewrite valleys the user liked) | done (2026-10-20) |
| WireCathedral, Boids, Plasma, MatrixRain | — | not started |

Shared WGSL: `lines.wgsl` (segment → screen quad), `color.wgsl`, `transform.wgsl`. Seeded recipe catalogue in `src/director/recipe.ts` (23 recipes, tier-gated, each with a post preset and optional camera rig); every recipe is rendered headless by `tests/render/recipes.headless.test.ts` with zero GPU errors.

### Phase 6 — Tiers, fallback, mobile
- Tier → point budgets, raymarch step counts, post stages enabled, DPR cap (`surface(gpu, canvas, { dpr: [1, max] })`).
- Canvas stays full-screen at every tier (existing requirement).
- **Non-WebGPU browsers get a static message** (decided). Pure HTML/CSS in the new aesthetic: black, phosphor-green or amber monospace, scanline overlay via CSS, the EAVI name, one sentence saying the piece needs WebGPU, and a short list of browsers that have it. No canvas, no audio, no pointer tracking. Same page is shown for any other `init()` failure.
- Auto-downgrade keeps the existing FPS watchdog; adds "drop post stages" before "drop DPR" (vgpu's adaptive-quality guide pattern: a cheaper pipeline set swapped once).

#### Phase 6 status (2026-10-20)

| Item | Status |
|---|---|
| Tier → particle counts, raymarch iterations, flame resolution, bloom/warp availability, DPR cap (2 / 1.5 / 1) | done (`src/director/recipe.ts`, `src/main.ts`) |
| Adaptive quality watchdog: sustained < 30 fps → disable warp → disable bloom → lower DPR cap (surface recreated, canvas stays full-screen) | done (`src/render/adaptive.ts`) |
| Static unsupported page for non-WebGPU browsers; device loss → same page | done |
| Portrait FOV, touch pointer, reduced motion | done |
| Real-device matrix (iOS 26, Android, Firefox) | **not done** — Chrome on macOS verified via `npm run smoke:browser` |

### Phase 7 — Tests, copy, docs
- Confirm nothing from the old visual stack remains (`three` gone from `package.json`, no `.glsl` files, no `src/visual/systems`).
- Unit tests for pure logic: timeline, event bus, director rules, recipe selection, analysis labelling, post preset resolution.
- `vgpu/mock` tests for pass wiring; `vgpu/node` screenshot tests for 3 recipes; Playwright WebGPU run for the live page.
- `scripts/renderPoster.ts`: headless render of a seeded recipe for the OG image and README.
- Info overlay copy rewritten in the new aesthetic while keeping every existing section: what EAVI is, how the seed and mapping work, the privacy list (no cookies, no storage, no analytics, no geolocation prompt, memory only), the WebGPU requirement, the credits and both GitHub links. Generated track names stay.
- README rewritten to match; OG image regenerated by `scripts/renderPoster.ts`.

---

#### Phase 7 status (2026-10-20)

| Item | Status |
|---|---|
| No old stack remains (`three` gone, no `.glsl`, no `src/visual/systems`) | done |
| Unit tests for timeline, event bus, director rules, recipe selection, analysis labelling, presets, modulators | done (706 tests) |
| Headless on-device tests: every recipe, the Director through live events, the limiter | done |
| Browser smoke (`scripts/browserSmoke.ts`, Playwright + system Chrome) | done |
| `scripts/renderPoster.ts` via a Node loader hook for `.wgsl` and extensionless imports; `public/og-image.png` and `docs/poster.png` are real renders | done |
| Info overlay copy rewritten (all sections kept, ≤ 500 chars), README rewritten | done |
| Per-recipe post preset and camera rig | done |

## 6. Three example recipes

**"Phosphor Cathedral"** (high tier)
GridVoid (amber mono) + Polytope4D (120-cell, tumble4D) + Attractor (Thomas, 1M) · post `phosphor` · grammar: bars step 4D rotation, drop flash-cuts to a different polytope, breakdown kills attractor.

**"Acid Flame"** (high tier)
HyperTunnel (fold 7) + FractalFlame · post `acid` (kaleidoscope 6 → 12 on drop, heavy feedback) · grammar: sections re-seed IFS variations, build ramps feedback, drop jumps kaleidoscope segments.

**"Demo Party"** (medium tier)
StarWarp + WirePolyhedra (nested duals, snapCut rig) + VectorScope · post `crt` · grammar: bar-locked camera cuts, beat pulse, drop hard-cuts to next polyhedron set.

---

## 7. Variance model (what the seed decides)

| Source | Decides |
|---|---|
| Geo class | palette family (unchanged) and post preset bias (northern → phosphor/ice, tropical → acid) |
| Device capability | tier, point budgets, raymarch steps, DPR cap |
| Time of day | grain, cadence, feedback damp baseline |
| Session seed | recipe sequence, every per-layer variant (fractal family, fold count, attractor, polytope, grid density), camera harmonics, transition style |
| Pointer entropy | post distortion wobble, raymarch camera jitter, IFS perturbation |
| Track analysis | when things happen; which grammar actions fire |
| Live audio | continuous modulation (bands) and onset fallback |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| vgpu is pre-1.0 (0.0.1 May → 0.6.0 Oct 2026, breaking minors) | pin exact version; all vgpu calls go through `src/render/`; upgrade deliberately with the spike checklist |
| No WebGL fallback in vgpu | static message page (decided); accept the loss of non-WebGPU visitors |
| Every post effect is hand-written | start by pulling reference implementations (`npx vgpu examples pull spiral-galaxy`, `particle-orbit` for the CRT finish); ~500 lines WGSL total for the full stack |
| Thin scene API (no lines/points materials) | two shared WGSL modules (`points`, `lines`) written once in Phase 1 |
| Shader errors surface as device validation errors | compile-ahead in the health gate; `npx vgpu check` in CI; `uncapturederror` listener |
| Feedback + bloom blows out | luminance cap pre-bloom; damp clamped ≤ 0.97; debug sliders |
| Photosensitivity | no flashes or strobes anywhere (decided); luminance limiter in the composite pass; honour `prefers-reduced-motion`; one-line notice in the info overlay |
| MP3 decoding in Node for offline analysis | verify `node-web-audio-api` in Phase 1; fallback: headless-browser `OfflineAudioContext`; last resort: runtime analysis in a worker |
| Bundle size | measure in Phase 1; `three` is removed, which offsets vgpu |
| Mobile thermal throttling with compute | compute budgets per tier; watchdog drops post stages first |

---

## 9. Sequencing and rough effort

| Phase | Depends on | Effort (focused days) |
|---|---|---|
| 0 Decisions | — | 0.5 |
| 1 Foundation spike | 0 | 5–7 |
| 2 Post stack | 1 | 4–6 |
| 3 Audio structure | 1 | 4–6 |
| 4 Director & recipes | 2, 3 | 4–6 |
| 5 Layer library | 4 | 10–15 (parallelisable per layer) |
| 6 Tiers & fallback | 5 | 2–3 |
| 7 Retire, tests, docs | 6 | 2–3 |

Phases 2 and 3 are independent and can run in parallel after Phase 1. Layers in Phase 5 are independent of each other; ship the first recipe with 3 layers and add the rest incrementally.

---

## 10. Proposed `CLAUDE.md` revisions

Replace the "Tech Stack" rendering line and the "Non-Negotiable Visual Target", "Non-Negotiable Spatial Requirement", "Shader Integrity Rules" and "Render Completion Gate" sections with:

> ## Rendering (v2)
> - Rendering: **vgpu** (WebGPU). Shaders are plain `.wgsl` modules under `src/wgsl/` and `src/post/wgsl/`, imported through `@vgpu/wgsl`. No GLSL. No Three.js in the v2 path.
> - All vgpu calls go through `src/render/`. Pin the exact `vgpu` version; upgrades are deliberate.
> - Browsers without WebGPU get a static on-aesthetic message. There is no fallback renderer and no legacy code path.
>
> ## Visual Target (v2)
> - Aesthetic: 90s demoscene / hacker-culture cyberdelia. Wireframes, fractals, kaleidoscopes, tunnels, strange attractors, CRT/phosphor post-processing. Emissive geometry on black.
> - Forbidden: solid shaded terrain, skies, lit realistic surfaces, flat 2D screen-saver visuals.
> - The scene MUST be 3D: perspective camera, parallax, depth. Points, lines, raymarched fractals and compute particles are all valid primitives.
>
> ## Audio Reactivity (v2)
> - Continuous: bass → macro deformation, treble → fine detail, mid → atmosphere. Must run while muted.
> - Structural: track analysis (offline JSON + live onset fallback) drives events: beat, bar, build, drop, breakdown, section. Events trigger transitions, cuts, and recipe changes. Timer-based mode switching is not acceptable.
>
> ## Composition
> - A session renders seeded **recipes** composed of environment + subject + particle layers + post preset + camera rig. The seed decides structure, not only colour.
>
> ## Render Completion Gate (v2)
> - `npx vgpu check` passes for every `.wgsl` file.
> - Health gate reports zero validation errors when compiling ahead every pipeline of the active recipe.
> - No `uncapturederror` events during the first 5 seconds.
> - `vgpu/node` headless render of the recipe produces a non-black frame.
> - Works with and without autoplay; mute and info overlay work.
> - No flashes or strobes: no stage may bind audio to global brightness; the composite luminance limiter is always on; `prefers-reduced-motion` is honoured.

Keep all privacy, geo, mobile full-screen and "Definition of Done" sections as they are.

---

## 11. Decisions (resolved 2026-10-20)

1. **Photosensitivity:** no flashes or strobes. Activity comes from cuts, geometry, camera, folds, feedback and colour, never from brightness spikes. Enforced by the composite luminance limiter.
2. **Track analysis:** build-time, JSON shipped in `public/audio/analysis/`.
3. **Non-WebGPU browsers:** static on-aesthetic message. No legacy renderer, no fallback bundle. Old visual code is deleted on the branch as soon as Phase 1 renders.
4. **Branching:** `v2` branch, replace in place, `main` stays deployable until parity.
5. **Copy:** info overlay and README rewritten to the new aesthetic, with every existing section retained.

---

## Sources
- https://vgpu.sh — https://vgpu.sh/docs/reference — https://vgpu.sh/docs/guides — https://vgpu.sh/docs/get-started/web.md
- https://github.com/vercel-labs/vgpu — `npm view vgpu@0.6.0`
- Reference example pulled with `npx vgpu examples pull spiral-galaxy`
