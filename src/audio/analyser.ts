export interface AnalyserBundle {
  analyser: AnalyserNode;
  gainNode: GainNode;
  connectSource: (source: AudioNode) => void;
}

/**
 * Create an audio analysis graph: source → AnalyserNode → GainNode → destination.
 * Analysis data flows even when gain is 0 (muted).
 */
export function createAnalyser(ctx: AudioContext): AnalyserBundle {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const gainNode = ctx.createGain();

  analyser.connect(gainNode);
  gainNode.connect(ctx.destination);

  const connectSource = (source: AudioNode): void => {
    source.connect(analyser);
  };

  return { analyser, gainNode, connectSource };
}

/** Return current frequency byte data from the analyser. */
export function getFrequencyData(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data;
}

/** Return current time-domain byte data from the analyser. */
export function getTimeDomainData(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  return data;
}
