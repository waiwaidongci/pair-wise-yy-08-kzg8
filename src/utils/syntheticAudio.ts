const SAMPLE_RATE = 22050;
const cache = new Map<string, string>();

export const SYNTHETIC_ASSETS = [
  {
    id: 'synth-drums',
    name: '内置 · 紧凑鼓组',
    duration: 8,
    mimeType: 'audio/wav',
    description: '四拍鼓点、底鼓与闭合军鼓',
  },
  {
    id: 'synth-chords',
    name: '内置 · 暖色和弦',
    duration: 8,
    mimeType: 'audio/wav',
    description: 'Em9 到 Cmaj7 的铺底和弦',
  },
  {
    id: 'synth-bass',
    name: '内置 · 模拟贝斯',
    duration: 8,
    mimeType: 'audio/wav',
    description: '带轻微滤波的八分音符贝斯',
  },
] as const;

export function isSyntheticAsset(assetId: string): boolean {
  return SYNTHETIC_ASSETS.some((asset) => asset.id === assetId);
}

export function getSyntheticAssetUrl(assetId: string): string {
  const cached = cache.get(assetId);
  if (cached) return cached;
  const samples = renderSyntheticSamples(assetId, SAMPLE_RATE);
  const blob = encodeWav(samples, SAMPLE_RATE);
  const url = URL.createObjectURL(blob);
  cache.set(assetId, url);
  return url;
}

export function createSyntheticBuffer(
  context: BaseAudioContext,
  assetId: string,
): AudioBuffer {
  const samples = renderSyntheticSamples(assetId, context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  return buffer;
}

export function renderSyntheticSamples(assetId: string, sampleRate: number): Float32Array {
  const duration = SYNTHETIC_ASSETS.find((asset) => asset.id === assetId)?.duration ?? 8;
  const length = Math.floor(sampleRate * duration);
  const samples = new Float32Array(length);
  let noiseSeed = assetId.length * 7919;
  const random = () => {
    noiseSeed = (noiseSeed * 16807) % 2147483647;
    return (noiseSeed / 2147483647) * 2 - 1;
  };

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const beat = time % 0.5;
    let value = 0;
    if (assetId === 'synth-drums') {
      const kickEnvelope = Math.exp(-beat * 15);
      const kick = Math.sin(2 * Math.PI * (58 - beat * 36) * beat) * kickEnvelope * 0.7;
      const snareEnvelope = Math.exp(-((time + 0.25) % 1) * 28);
      const snare = random() * snareEnvelope * (((time + 0.25) % 1) < 0.13 ? 0.32 : 0);
      const hatEnvelope = Math.exp(-((time + 0.25) % 0.25) * 65);
      const hat = random() * hatEnvelope * 0.11;
      value = kick + snare + hat;
    } else if (assetId === 'synth-chords') {
      const progression = Math.floor(time / 2) % 4;
      const roots = [82.41, 65.41, 73.42, 65.41];
      const ratios = progression === 0 ? [1, 1.2, 1.5, 1.8] : progression === 1 ? [1, 1.25, 1.5, 1.9] : [1, 1.2, 1.5, 1.67];
      const envelope = Math.min(1, (time % 2) * 8) * Math.exp(-((time % 2) - 1.9) * 0.12);
      value =
        ratios.reduce(
          (sum, ratio, chordIndex) =>
            sum +
            Math.sin(2 * Math.PI * roots[progression] * ratio * time) *
              (0.16 - chordIndex * 0.018),
          0,
        ) * envelope;
      value += Math.sin(2 * Math.PI * 55 * time) * 0.045;
    } else {
      const note = Math.floor(time / 0.25) % 8;
      const frequencies = [55, 55, 65.41, 65.41, 49, 49, 73.42, 61.74];
      const noteTime = time % 0.25;
      const envelope = Math.min(1, noteTime * 30) * Math.exp(-noteTime * 5.5);
      const saw = ((time * frequencies[note]) % 1) * 2 - 1;
      const sub = Math.sin(2 * Math.PI * frequencies[note] * time);
      value = (saw * 0.16 + sub * 0.25) * envelope;
    }
    samples[index] = Math.max(-1, Math.min(1, value));
  }
  return samples;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeText(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  });
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeText(view: DataView, offset: number, text: string): void {
  text.split('').forEach((character, index) => {
    view.setUint8(offset + index, character.charCodeAt(0));
  });
}
