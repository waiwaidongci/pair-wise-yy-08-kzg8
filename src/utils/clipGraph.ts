import type { AudioClip, AudioTrack } from '../types/audio';

export interface ClipGraph {
  /** 素材源节点接入点。 */
  input: AudioNode;
  /** 处理后的输出节点，连接到主输出或离线渲染终点。 */
  output: GainNode;
}

/**
 * 构建片段的处理图：声像 → 效果器 → 增益。
 * 实时播放与离线冻结渲染共用同一套逻辑，保证冻结前后听感一致。
 * 冻结片段的声像、淡入淡出和效果已烘焙进音频，这里不再重复处理。
 */
export function buildClipGraph(
  context: BaseAudioContext,
  track: AudioTrack,
  clip: AudioClip,
): ClipGraph {
  const gain = context.createGain();
  gain.gain.value = 0;

  if (clip.frozen) {
    return { input: gain, output: gain };
  }

  const panner = context.createStereoPanner();
  panner.pan.value = track.pan;
  let input: AudioNode = panner;

  if (clip.effect === 'lowpass') {
    input = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(220, 12000 - clip.effectAmount * 110);
    filter.Q.value = 0.8;
    input.connect(filter);
    filter.connect(panner);
  } else if (clip.effect === 'highpass') {
    input = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 80 + clip.effectAmount * 12;
    filter.Q.value = 0.9;
    input.connect(filter);
    filter.connect(panner);
  } else if (clip.effect === 'echo') {
    input = context.createGain();
    const delay = context.createDelay(1.2);
    delay.delayTime.value = 0.18 + (clip.effectAmount / 100) * 0.34;
    const feedback = context.createGain();
    feedback.gain.value = Math.min(0.62, clip.effectAmount / 130);
    const wet = context.createGain();
    wet.gain.value = Math.min(0.72, 0.18 + clip.effectAmount / 160);
    input.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(panner);
  }

  panner.connect(gain);
  return { input, output: gain };
}

/**
 * 应用片段的淡入淡出包络。
 * @param volume 峰值增益；冻结渲染时传 1（音量仍由轨道推子实时控制）。
 */
export function applyClipEnvelope(
  context: BaseAudioContext,
  gain: GainNode,
  when: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
  volume: number,
): void {
  const safeIn = Math.min(fadeIn, duration * 0.45);
  const safeOut = Math.min(fadeOut, duration * 0.45);
  const peak = Math.max(0.001, volume);
  gain.gain.cancelScheduledValues(when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + safeIn);
  gain.gain.setValueAtTime(peak, Math.max(when + safeIn, when + duration - safeOut));
  gain.gain.linearRampToValueAtTime(0, when + duration);
  if (context.state === 'suspended') {
    void (context as BaseAudioContext & { resume: () => Promise<void> }).resume();
  }
}
