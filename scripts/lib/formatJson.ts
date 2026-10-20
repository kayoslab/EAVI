// scripts/lib/formatJson.ts
// Deterministic, diff-friendly JSON: one top-level key per line, number arrays
// wrapped at a fixed width, one object per line inside object arrays.

import type { TrackAnalysis } from '../../src/audio/structure/analysis.ts';

const NUMBERS_PER_LINE = 12;

function formatNumberArray(values: number[], indent: string): string {
  if (values.length === 0) return '[]';
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += NUMBERS_PER_LINE) {
    lines.push(indent + '  ' + values.slice(i, i + NUMBERS_PER_LINE).map((v) => JSON.stringify(v)).join(', '));
  }
  return '[\n' + lines.join(',\n') + '\n' + indent + ']';
}

function formatObjectArray(values: object[], indent: string): string {
  if (values.length === 0) return '[]';
  return '[\n' + values.map((v) => indent + '  ' + JSON.stringify(v)).join(',\n') + '\n' + indent + ']';
}

export function formatAnalysisJson(analysis: TrackAnalysis): string {
  const entries: [string, string][] = [
    ['version', JSON.stringify(analysis.version)],
    ['trackPath', JSON.stringify(analysis.trackPath)],
    ['duration', JSON.stringify(analysis.duration)],
    ['bpm', JSON.stringify(analysis.bpm)],
    ['beats', formatNumberArray(analysis.beats, '  ')],
    ['downbeats', formatNumberArray(analysis.downbeats, '  ')],
    ['energy', formatObjectArray(analysis.energy, '  ')],
    ['sections', formatObjectArray(analysis.sections, '  ')],
    ['events', formatObjectArray(analysis.events, '  ')],
  ];
  return '{\n' + entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${v}`).join(',\n') + '\n}\n';
}
