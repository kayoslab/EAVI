const WORDS = ['Passage', 'Drift', 'Descent', 'Ember', 'Horizon', 'Meridian', 'Solace', 'Vapor', 'Lumen', 'Reverie', 'Aether', 'Vesper'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function generateTrackName(seed: string, trackPath: string): string {
  const hash = fnv1a(seed + ':track:' + trackPath);
  const word = WORDS[hash % WORDS.length];
  const numeral = NUMERALS[(hash >>> 8) % NUMERALS.length];
  return `${word} ${numeral}`;
}
