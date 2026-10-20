// scripts/analyzeTracks.ts
// Build-time analysis of every MP3 in public/audio. Run with
//   npm run analyze:tracks            (all tracks)
//   npm run analyze:tracks -- glory   (only tracks whose name contains "glory")
// Writes public/audio/analysis/<id>.json, where <id> = analysisIdForTrack().
// Decoding uses mpg123-decoder (WASM build of mpg123: no native addon, same
// output on every platform).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MPEGDecoder } from 'mpg123-decoder';
import { analysisIdForTrack } from '../src/audio/structure/analysis.ts';
import { analyzePcm } from './lib/analyzeTrack.ts';
import { formatAnalysisJson } from './lib/formatJson.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const audioDir = join(root, 'public', 'audio');
const outDir = join(audioDir, 'analysis');

function toMono(channels: Float32Array[], length: number): Float32Array {
  const mono = new Float32Array(length);
  const n = channels.length;
  if (n === 0) return mono;
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let c = 0; c < n; c++) s += channels[c][i] ?? 0;
    mono[i] = s / n;
  }
  return mono;
}

async function decodeMp3(path: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const bytes = new Uint8Array(readFileSync(path));
    const decoded = decoder.decode(bytes);
    if (decoded.errors.length > 0) {
      console.warn(`  ${decoded.errors.length} decode warning(s), first: ${decoded.errors[0].message}`);
    }
    return { samples: toMono(decoded.channelData, decoded.samplesDecoded), sampleRate: decoded.sampleRate };
  } finally {
    decoder.free();
  }
}

async function main(): Promise<void> {
  const filter = process.argv.slice(2).find((a) => !a.startsWith('-'))?.toLowerCase();
  const files = readdirSync(audioDir)
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .filter((f) => !filter || f.toLowerCase().includes(filter))
    .sort();

  if (files.length === 0) {
    console.error(`No MP3 files found in ${audioDir}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const trackPath = `/audio/${file}`;
    const id = analysisIdForTrack(trackPath);
    const started = Date.now();
    process.stdout.write(`${file}\n`);

    const { samples, sampleRate } = await decodeMp3(join(audioDir, file));
    const analysis = analyzePcm(samples, sampleRate, trackPath);
    const outPath = join(outDir, `${id}.json`);
    writeFileSync(outPath, formatAnalysisJson(analysis));

    const drops = analysis.events.filter((e) => e.kind === 'drop').length;
    const fills = analysis.events.filter((e) => e.kind === 'fill').length;
    const labels = analysis.sections.map((s) => s.label).join(' > ');
    console.log(
      `  -> ${id}.json  ${analysis.duration.toFixed(1)}s  ${analysis.bpm.toFixed(1)} bpm  ` +
        `${analysis.beats.length} beats  ${analysis.sections.length} sections  ${drops} drops  ${fills} fills  ` +
        `(${Date.now() - started} ms)\n     ${labels}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
