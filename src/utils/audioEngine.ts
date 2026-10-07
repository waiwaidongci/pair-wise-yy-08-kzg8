import type { AudioAsset, AudioProject } from '../types/audio';
import { applyClipEnvelope, buildClipGraph } from './clipGraph';
import { createSyntheticBuffer, isSyntheticAsset } from './syntheticAudio';

export class AudioEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private playStartedAt = 0;
  private playFrom = 0;
  private endTimer: number | null = null;
  private master: GainNode | null = null;

  async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.94;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  async getBuffer(asset: AudioAsset): Promise<AudioBuffer> {
    const context = await this.ensureContext();
    const cached = this.buffers.get(asset.id);
    if (cached) return cached;
    let buffer: AudioBuffer;
    if (isSyntheticAsset(asset.id) || !asset.dataUrl) {
      buffer = createSyntheticBuffer(context, asset.id);
    } else {
      const response = await fetch(asset.dataUrl);
      const arrayBuffer = await response.arrayBuffer();
      buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    }
    this.buffers.set(asset.id, buffer);
    return buffer;
  }

  async play(project: AudioProject, from: number, onEnded?: () => void): Promise<void> {
    this.stop(false);
    const context = await this.ensureContext();
    const soloTracks = project.tracks.filter((track) => track.solo);
    const activeTracks = soloTracks.length ? soloTracks : project.tracks;
    const activeTrackIds = new Set(activeTracks.filter((track) => !track.muted).map((track) => track.id));
    const scheduleStart = context.currentTime + 0.035;
    this.playStartedAt = scheduleStart;
    this.playFrom = from;
    let timelineEnd = from;

    for (const track of project.tracks) {
      if (!activeTrackIds.has(track.id)) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;
        if (clipEnd <= from || clip.duration <= 0) continue;
        const asset = project.assets.find((item) => item.id === clip.assetId);
        if (!asset) continue;
        const buffer = await this.getBuffer(asset);
        const source = context.createBufferSource();
        source.buffer = buffer;
        const graph = buildClipGraph(context, track, clip);
        source.connect(graph.input);
        graph.output.connect(this.master as GainNode);
        const startsIn = Math.max(0, clip.start - from);
        const offset = Math.min(buffer.duration, clip.offset + Math.max(0, from - clip.start));
        const available = Math.max(0, buffer.duration - offset);
        const duration = Math.max(0, Math.min(clip.duration - Math.max(0, from - clip.start), available));
        if (duration <= 0.005) continue;
        const when = scheduleStart + startsIn;
        applyClipEnvelope(context, graph.output, when, duration, clip.fadeIn, clip.fadeOut, track.volume);
        source.start(when, offset, duration);
        this.sources.push(source);
        timelineEnd = Math.max(timelineEnd, clipEnd);
      }
    }

    const playbackDuration = Math.max(0.05, timelineEnd - from);
    this.endTimer = window.setTimeout(() => onEnded?.(), playbackDuration * 1000 + 80);
  }

  stop(clearEndedCallback = true): void {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 已自然结束的 source 再次 stop 会抛错，可安全忽略。
      }
    });
    this.sources = [];
    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    if (clearEndedCallback) this.playFrom = 0;
  }

  getPlayhead(): number {
    if (!this.context || !this.master) return this.playFrom;
    return this.playFrom + Math.max(0, this.context.currentTime - this.playStartedAt);
  }
}

export const audioEngine = new AudioEngine();
