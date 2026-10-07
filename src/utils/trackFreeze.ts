import type { AudioAsset, AudioProject, AudioTrack } from '../types/audio';
import { applyClipEnvelope, buildClipGraph, loadAssetBuffer } from './audioEngine';

/** 冻结渲染的离线采样率。 */
export const FREEZE_SAMPLE_RATE = 44100;
/** 单个冻结渲染结果上限，与导入文件的大小限制一致。 */
export const MAX_RENDER_ASSET_BYTES = 8 * 1024 * 1024;
/** 素材库总容量预算，渲染结果会让总量超限则拒绝冻结。 */
export const MAX_LIBRARY_BYTES = 24 * 1024 * 1024;

const ECHO_TAIL_SECONDS = 1.5;
const DEFAULT_TAIL_SECONDS = 0.1;

export interface FreezeRender {
  dataUrl: string;
  size: number;
  /** 渲染区间在时间轴上的起点（秒） */
  start: number;
  /** 渲染结果时长（含效果尾音，秒） */
  duration: number;
}

/** 估算单个素材占用的本地存储字节数。 */
export function assetStorageBytes(asset: AudioAsset): number {
  if (asset.size != null) return asset.size;
  if (asset.dataUrl) {
    const base64 = asset.dataUrl.slice(asset.dataUrl.indexOf(',') + 1);
    return Math.ceil((base64.length * 3) / 4);
  }
  return 0;
}

/** 素材库当前总占用。 */
export function libraryStorageBytes(assets: AudioAsset[]): number {
  return assets.reduce((sum, asset) => sum + assetStorageBytes(asset), 0);
}

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 计算冻结渲染的时间范围：首个片段起点到最后一个片段终点，外加效果尾音。 */
export function measureFreezeRange(track: AudioTrack): { start: number; duration: number } | null {
  const clips = track.clips.filter((clip) => clip.duration > 0);
  if (!clips.length) return null;
  const start = Math.min(...clips.map((clip) => clip.start));
  const end = Math.max(...clips.map((clip) => clip.start + clip.duration));
  const hasEcho = clips.some((clip) => clip.effect === 'echo' && clip.effectAmount > 0);
  return {
    start,
    duration: end - start + (hasEcho ? ECHO_TAIL_SECONDS : DEFAULT_TAIL_SECONDS),
  };
}

/** 按 16-bit 立体声 PCM 估算渲染结果大小，用于渲染前的容量预检。 */
export function estimateRenderBytes(durationSeconds: number): number {
  return 44 + Math.ceil(durationSeconds * FREEZE_SAMPLE_RATE) * 2 * 2;
}

/** 容量检查：渲染结果超限或素材库放不下时抛出错误，调用方保持原轨不变。 */
export function assertFreezeCapacity(assets: AudioAsset[], renderBytes: number): void {
  if (renderBytes > MAX_RENDER_ASSET_BYTES) {
    throw new Error(
      `冻结渲染约 ${formatMB(renderBytes)}，超过单个素材 ${formatMB(MAX_RENDER_ASSET_BYTES)} 上限，已保留原轨道`,
    );
  }
  const used = libraryStorageBytes(assets);
  if (used + renderBytes > MAX_LIBRARY_BYTES) {
    throw new Error(
      `素材库容量不足（已用 ${formatMB(used)} / ${formatMB(MAX_LIBRARY_BYTES)}），无法保存冻结结果，已保留原轨道`,
    );
  }
}

/**
 * 离线渲染整条轨道：把片段、淡入淡出、效果、轨道音量与声像
 * 按播放时相同的图结构渲染成一段立体声 WAV。
 */
export async function renderTrackToAudio(
  project: AudioProject,
  track: AudioTrack,
): Promise<FreezeRender> {
  const range = measureFreezeRange(track);
  if (!range) throw new Error('该轨道没有可冻结的片段');
  const context = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(range.duration * FREEZE_SAMPLE_RATE)),
    FREEZE_SAMPLE_RATE,
  );
  let scheduled = 0;
  for (const clip of track.clips) {
    if (clip.duration <= 0) continue;
    const asset = project.assets.find((item) => item.id === clip.assetId);
    if (!asset) continue;
    const buffer = await loadAssetBuffer(context, asset);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const graph = buildClipGraph(context, track, clip);
    source.connect(graph.input);
    graph.output.connect(context.destination);
    const offset = Math.min(buffer.duration, clip.offset);
    const available = Math.max(0, buffer.duration - offset);
    const duration = Math.min(clip.duration, available);
    if (duration <= 0.005) continue;
    const when = clip.start - range.start;
    applyClipEnvelope(graph.gain, when, duration, clip.fadeIn, clip.fadeOut, track.volume);
    source.start(when, offset, duration);
    scheduled += 1;
  }
  if (!scheduled) throw new Error('轨道素材缺失或已失效，无法完成冻结渲染');
  const rendered = await context.startRendering();
  const blob = encodeWavBuffer(rendered);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, size: blob.size, start: range.start, duration: range.duration };
}

/** 把渲染结果编码为 16-bit PCM WAV（交错多声道）。 */
function encodeWavBuffer(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const dataSize = length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  writeText(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][index]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

function writeText(view: DataView, offset: number, text: string): void {
  text.split('').forEach((character, index) => {
    view.setUint8(offset + index, character.charCodeAt(0));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('冻结结果编码失败'));
    reader.readAsDataURL(blob);
  });
}
