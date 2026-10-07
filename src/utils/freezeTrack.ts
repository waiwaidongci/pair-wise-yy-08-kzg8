import type { AudioAsset, AudioProject, AudioTrack } from '../types/audio';
import { buildClipGraph, applyClipEnvelope } from './clipGraph';
import { createSyntheticBuffer, isSyntheticAsset } from './syntheticAudio';

/** 素材库总容量上限（dataUrl 字符串字节数，受浏览器本地存储约束）。 */
export const ASSET_LIBRARY_CAPACITY = 48 * 1024 * 1024;

/** 冻结渲染的采样率。 */
const BOUNCE_SAMPLE_RATE = 44100;

/** 渲染尾部余量，用于容纳 Echo 等效果的衰减尾音。 */
const BOUNCE_TAIL_SECONDS = 4;

/** 尾音判定阈值，低于该幅值视为无声。 */
const SILENCE_THRESHOLD = 0.0008;

export function assetStorageBytes(asset: AudioAsset): number {
  return asset.dataUrl ? asset.dataUrl.length : 0;
}

export function projectAssetUsage(project: AudioProject): number {
  return project.assets.reduce((sum, asset) => sum + assetStorageBytes(asset), 0);
}

/** 估算冻结结果的 dataUrl 字节数，用于渲染前的容量预判。 */
export function estimateBounceBytes(duration: number): number {
  const samples = Math.ceil(duration * BOUNCE_SAMPLE_RATE);
  const wavBytes = 44 + samples * 2 * 2; // 立体声 16-bit PCM
  return Math.ceil((wavBytes * 4) / 3) + 96; // base64 膨胀 + Data URL 前缀
}

async function getAssetBuffer(
  context: BaseAudioContext,
  asset: AudioAsset,
): Promise<AudioBuffer> {
  if (isSyntheticAsset(asset.id) || !asset.dataUrl) {
    return createSyntheticBuffer(context, asset.id);
  }
  const response = await fetch(asset.dataUrl);
  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer.slice(0));
}

/**
 * 离线渲染整条轨道：把声像、淡入淡出和效果烘焙进一段立体声音频。
 * 音量不烘焙——冻结后轨道推子仍实时控制音量，保证冻结前后听感一致。
 */
export async function renderTrackBounce(
  project: AudioProject,
  track: AudioTrack,
): Promise<AudioBuffer> {
  const clips = track.clips;
  if (clips.length === 0) {
    throw new Error('轨道没有片段，无需冻结');
  }
  const contentEnd = Math.max(...clips.map((clip) => clip.start + clip.duration));
  const renderDuration = contentEnd + BOUNCE_TAIL_SECONDS;
  const offline = new OfflineAudioContext(
    2,
    Math.ceil(renderDuration * BOUNCE_SAMPLE_RATE),
    BOUNCE_SAMPLE_RATE,
  );

  for (const clip of clips) {
    const asset = project.assets.find((item) => item.id === clip.assetId);
    if (!asset) continue;
    const buffer = await getAssetBuffer(offline, asset);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const graph = buildClipGraph(offline, track, clip);
    source.connect(graph.input);
    graph.output.connect(offline.destination);

    const offset = Math.min(buffer.duration, clip.offset);
    const available = Math.max(0, buffer.duration - offset);
    const clipDuration = Math.max(0, Math.min(clip.duration, available));
    if (clipDuration <= 0.005) continue;

    // 峰值传 1：音量由冻结后的轨道推子实时控制，此处不重复烘焙。
    applyClipEnvelope(offline, graph.output, clip.start, clipDuration, clip.fadeIn, clip.fadeOut, 1);
    source.start(clip.start, offset, clipDuration);
  }

  const rendered = await offline.startRendering();
  return trimTrailingSilence(rendered, contentEnd);
}

/** 裁掉渲染尾部的静音（保留效果尾音与少量余量）。 */
function trimTrailingSilence(buffer: AudioBuffer, contentEnd: number): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }
  let lastAudible = -1;
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    if (channels.some((data) => Math.abs(data[index]) > SILENCE_THRESHOLD)) {
      lastAudible = index;
      break;
    }
  }
  if (lastAudible < 0) {
    // 全静音：保留内容长度即可。
    return buffer;
  }
  const keepSeconds = lastAudible / buffer.sampleRate + 0.08;
  const keepSamples = Math.min(
    buffer.length,
    Math.ceil(Math.max(contentEnd, keepSeconds) * buffer.sampleRate),
  );
  if (keepSamples >= buffer.length) return buffer;
  const trimmed = new AudioBuffer({
    length: keepSamples,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    trimmed.copyToChannel(channels[channel].slice(0, keepSamples), channel);
  }
  return trimmed;
}

/** 把 AudioBuffer 编码为立体声 16-bit WAV 的 Data URL。 */
export async function encodeWavDataUrl(buffer: AudioBuffer): Promise<string> {
  const numberOfChannels = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const dataSize = buffer.length * numberOfChannels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  writeText(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numberOfChannels * bytesPerSample, true);
  view.setUint16(32, numberOfChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }
  let offset = 44;
  for (let index = 0; index < buffer.length; index += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][index]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  const blob = new Blob([view], { type: 'audio/wav' });
  return readBlobAsDataUrl(blob);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('冻结音频编码失败'));
    reader.readAsDataURL(blob);
  });
}

function writeText(view: DataView, offset: number, text: string): void {
  text.split('').forEach((character, index) => {
    view.setUint8(offset + index, character.charCodeAt(0));
  });
}
