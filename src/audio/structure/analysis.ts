// src/audio/structure/analysis.ts
// Shared schema for offline track analysis. Used by scripts/analyzeTracks.ts
// (build time, Node) and by the browser runtime (loader + timeline), so it
// must stay dependency-free and use only erasable TypeScript syntax.

export const TRACK_ANALYSIS_VERSION = 1 as const;

export type SectionLabel = 'intro' | 'build' | 'drop' | 'breakdown' | 'verse' | 'outro';
export type AnalysisEventKind = 'drop' | 'build-start' | 'breakdown' | 'section' | 'fill';

export interface EnergyFrame {
  /** Seconds from track start (100 ms hop). */
  t: number;
  bass: number;
  mid: number;
  treble: number;
  total: number;
}

export interface TrackSection {
  start: number;
  end: number;
  label: SectionLabel;
  /** Mean total energy of the section, 0..1 relative to the track. */
  energy: number;
}

export interface AnalysisEvent {
  t: number;
  kind: AnalysisEventKind;
  /** 0..1 */
  strength: number;
}

export interface TrackAnalysis {
  version: 1;
  /** URL path of the track as used by the player, e.g. `/audio/Roa - Glory.mp3`. */
  trackPath: string;
  duration: number;
  bpm: number;
  /** Beat times in seconds. */
  beats: number[];
  /** Downbeat (bar start) times in seconds. */
  downbeats: number[];
  /** 100 ms hop band-energy envelope, each band normalised to 0..1 per track. */
  energy: EnergyFrame[];
  sections: TrackSection[];
  events: AnalysisEvent[];
}

export const SECTION_LABELS: readonly SectionLabel[] = ['intro', 'build', 'drop', 'breakdown', 'verse', 'outro'];
export const ANALYSIS_EVENT_KINDS: readonly AnalysisEventKind[] = ['drop', 'build-start', 'breakdown', 'section', 'fill'];

export const ANALYSIS_BASE_URL = '/audio/analysis';

/** Basename of a track path after URL decoding, so `/audio/Roa%20-%20Glory.mp3` and `/audio/Roa - Glory.mp3` agree. */
export function trackBasename(trackPath: string): string {
  let decoded = trackPath;
  try {
    decoded = decodeURIComponent(trackPath);
  } catch {
    // keep the raw path if it is not valid percent-encoding
  }
  const slash = decoded.lastIndexOf('/');
  return slash >= 0 ? decoded.slice(slash + 1) : decoded;
}

/** 32-bit FNV-1a over the UTF-8 bytes of the string, as 8 hex chars. */
export function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  // Encode as UTF-8 by hand so Node and browsers produce identical bytes without TextEncoder.
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    const bytes: number[] = [];
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
    for (const b of bytes) {
      hash ^= b;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/** Stable id for a track: FNV-1a of the URL-decoded basename. */
export function analysisIdForTrack(trackPath: string): string {
  return fnv1a32Hex(trackBasename(trackPath));
}

export function analysisUrlForTrack(trackPath: string): string {
  return `${ANALYSIS_BASE_URL}/${analysisIdForTrack(trackPath)}.json`;
}

// --- validation -----------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every(isFiniteNumber);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEnergyFrame(v: unknown): v is EnergyFrame {
  return (
    isRecord(v) &&
    isFiniteNumber(v.t) &&
    isFiniteNumber(v.bass) &&
    isFiniteNumber(v.mid) &&
    isFiniteNumber(v.treble) &&
    isFiniteNumber(v.total)
  );
}

function isSection(v: unknown): v is TrackSection {
  return (
    isRecord(v) &&
    isFiniteNumber(v.start) &&
    isFiniteNumber(v.end) &&
    v.start <= v.end &&
    typeof v.label === 'string' &&
    (SECTION_LABELS as readonly string[]).includes(v.label) &&
    isFiniteNumber(v.energy)
  );
}

function isEvent(v: unknown): v is AnalysisEvent {
  return (
    isRecord(v) &&
    isFiniteNumber(v.t) &&
    typeof v.kind === 'string' &&
    (ANALYSIS_EVENT_KINDS as readonly string[]).includes(v.kind) &&
    isFiniteNumber(v.strength)
  );
}

/** Structural validation of a parsed JSON value. Returns the value typed, or null. Never throws. */
export function validateTrackAnalysis(value: unknown): TrackAnalysis | null {
  if (!isRecord(value)) return null;
  if (value.version !== TRACK_ANALYSIS_VERSION) return null;
  if (typeof value.trackPath !== 'string' || value.trackPath.length === 0) return null;
  if (!isFiniteNumber(value.duration) || value.duration <= 0) return null;
  if (!isFiniteNumber(value.bpm) || value.bpm <= 0) return null;
  if (!isNumberArray(value.beats) || !isNumberArray(value.downbeats)) return null;
  if (!Array.isArray(value.energy) || !value.energy.every(isEnergyFrame)) return null;
  if (!Array.isArray(value.sections) || !value.sections.every(isSection)) return null;
  if (!Array.isArray(value.events) || !value.events.every(isEvent)) return null;
  return value as unknown as TrackAnalysis;
}
