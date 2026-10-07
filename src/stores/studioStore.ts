import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AudioAsset,
  AudioClip,
  AudioProject,
  AudioTrack,
  ClipEffect,
  FrozenTrackState,
  TrackColor,
} from '../types/audio';
import { audioEngine } from '../utils/audioEngine';
import { SYNTHETIC_ASSETS } from '../utils/syntheticAudio';
import {
  assertFreezeCapacity,
  estimateRenderBytes,
  measureFreezeRange,
  renderTrackToAudio,
} from '../utils/trackFreeze';

const TRACK_COLORS: TrackColor[] = ['#2563eb', '#0f9f7a', '#d97706', '#c2413b', '#7c3aed', '#0891b2'];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const builtinAssets: AudioAsset[] = SYNTHETIC_ASSETS.map((asset) => ({
  id: asset.id,
  name: asset.name,
  source: 'synthetic',
  duration: asset.duration,
  mimeType: asset.mimeType,
}));

function initialProject(): AudioProject {
  const tracks: AudioTrack[] = [
    {
      id: 'track-drums',
      name: '节奏 / Drums',
      color: '#2563eb',
      volume: 0.78,
      pan: 0,
      muted: false,
      solo: false,
      height: 112,
      frozen: null,
      clips: [
        {
          id: 'clip-drums-a',
          assetId: 'synth-drums',
          name: '紧凑鼓组 A',
          start: 0,
          duration: 8,
          offset: 0,
          fadeIn: 0.05,
          fadeOut: 0.3,
          effect: 'none',
          effectAmount: 0,
        },
      ],
    },
    {
      id: 'track-chords',
      name: '和声 / Chords',
      color: '#0f9f7a',
      volume: 0.58,
      pan: -0.08,
      muted: false,
      solo: false,
      height: 112,
      frozen: null,
      clips: [
        {
          id: 'clip-chords-a',
          assetId: 'synth-chords',
          name: '暖色和弦',
          start: 0,
          duration: 8,
          offset: 0,
          fadeIn: 0.65,
          fadeOut: 0.8,
          effect: 'lowpass',
          effectAmount: 22,
        },
      ],
    },
    {
      id: 'track-bass',
      name: '低频 / Bass',
      color: '#d97706',
      volume: 0.68,
      pan: 0,
      muted: false,
      solo: false,
      height: 112,
      frozen: null,
      clips: [
        {
          id: 'clip-bass-a',
          assetId: 'synth-bass',
          name: '模拟贝斯',
          start: 4,
          duration: 4,
          offset: 0,
          fadeIn: 0.1,
          fadeOut: 0.2,
          effect: 'none',
          effectAmount: 0,
        },
      ],
    },
  ];
  return {
    version: 1,
    name: '未命名工程 · Night Drive',
    bpm: 120,
    snap: 0.25,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 8,
    pixelsPerSecond: 92,
    tracks,
    assets: builtinAssets,
    updatedAt: Date.now(),
  };
}

interface StudioState {
  project: AudioProject;
  selectedClipId: string | null;
  selectedTrackId: string;
  isPlaying: boolean;
  playhead: number;
  zoom: number;
  projectSavedAt: number;
  setPlaying: (playing: boolean) => void;
  setPlayhead: (time: number) => void;
  setZoom: (zoom: number) => void;
  setProjectName: (name: string) => void;
  addTrack: () => void;
  updateTrack: (trackId: string, patch: Partial<AudioTrack>) => void;
  deleteTrack: (trackId: string) => void;
  addClip: (trackId: string, assetId: string, start?: number) => void;
  setClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void;
  setClipEffect: (trackId: string, clipId: string, effect: ClipEffect, amount?: number) => void;
  moveClipToTrack: (fromTrackId: string, clipId: string, toTrackId: string, start: number) => void;
  duplicateClip: (trackId: string, clipId: string) => void;
  deleteClip: (trackId: string, clipId: string) => void;
  freezeTrack: (trackId: string) => Promise<void>;
  unfreezeTrack: (trackId: string) => void;
  selectClip: (clipId: string | null) => void;
  updateTransport: (patch: Partial<Pick<AudioProject, 'bpm' | 'snap' | 'loopEnabled' | 'loopStart' | 'loopEnd' | 'pixelsPerSecond'>>) => void;
  importFile: (file: File) => Promise<void>;
  addRecordedBlob: (blob: Blob, duration: number) => Promise<void>;
  replaceProject: (project: AudioProject) => void;
  markSaved: () => void;
}

function normalizeClip(clip: AudioClip): AudioClip {
  return {
    ...clip,
    duration: Math.max(0.02, clip.duration),
    offset: Math.max(0, clip.offset),
    fadeIn: Math.max(0, clip.fadeIn),
    fadeOut: Math.max(0, clip.fadeOut),
    effectAmount: Math.max(0, Math.min(100, clip.effectAmount)),
  };
}

/** 兼容旧数据：缺少冻结信息或结构不完整时按 null / 默认值补齐。 */
function normalizeFrozen(frozen: AudioTrack['frozen']): FrozenTrackState | null {
  if (!frozen || typeof frozen !== 'object') return null;
  const { assetId, renderedAt, start, duration, source } = frozen;
  if (!assetId || !source || !Array.isArray(source.clips)) return null;
  return {
    assetId,
    renderedAt: typeof renderedAt === 'number' ? renderedAt : Date.now(),
    start: Math.max(0, typeof start === 'number' ? start : 0),
    duration: Math.max(0.02, typeof duration === 'number' ? duration : 0.02),
    source: {
      clips: source.clips.map((clip) => normalizeClip(clip)),
      volume: Math.max(0, Math.min(1, typeof source.volume === 'number' ? source.volume : 1)),
      pan: Math.max(-1, Math.min(1, typeof source.pan === 'number' ? source.pan : 0)),
    },
  };
}

function normalizeProject(project: AudioProject): AudioProject {
  const customAssets = project.assets.filter(
    (asset) => !builtinAssets.some((builtin) => builtin.id === asset.id),
  );
  return {
    ...project,
    version: 1,
    tracks: project.tracks.map((track) => ({
      ...track,
      volume: Math.max(0, Math.min(1, track.volume)),
      pan: Math.max(-1, Math.min(1, track.pan)),
      frozen: normalizeFrozen(track.frozen),
      clips: track.clips.map((clip) => normalizeClip(clip)),
    })),
    assets: [...builtinAssets, ...customAssets],
  };
}

function timestamp(project: AudioProject): AudioProject {
  return { ...project, updatedAt: Date.now() };
}

/** 冻结轨道仍可调整的字段，其余一律视为只读。 */
const FROZEN_EDITABLE_KEYS = ['muted', 'solo', 'volume', 'name', 'height'] as const;

function findTrack(project: AudioProject, trackId: string): AudioTrack | undefined {
  return project.tracks.find((track) => track.id === trackId);
}

/** 清理不再被任何片段（含冻结快照）引用的冻结渲染素材，释放素材库容量。 */
function pruneOrphanedRenders(project: AudioProject): AudioProject {
  const referenced = new Set<string>();
  for (const track of project.tracks) {
    for (const clip of track.clips) referenced.add(clip.assetId);
    if (track.frozen) {
      for (const clip of track.frozen.source.clips) referenced.add(clip.assetId);
    }
  }
  const orphaned = project.assets.filter(
    (asset) => asset.source === 'rendered' && !referenced.has(asset.id),
  );
  if (!orphaned.length) return project;
  orphaned.forEach((asset) => audioEngine.releaseBuffer(asset.id));
  const dropped = new Set(orphaned.map((asset) => asset.id));
  return { ...project, assets: project.assets.filter((asset) => !dropped.has(asset.id)) };
}

async function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取音频文件失败'));
    reader.readAsDataURL(file);
  });
}

async function readAudioDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 8;
      resolve(duration);
      audio.src = '';
    };
    audio.onerror = () => reject(new Error('无法读取音频时长或格式不受浏览器支持'));
    audio.src = dataUrl;
  });
}

function addAssetClip(project: AudioProject, trackId: string, asset: AudioAsset, start: number) {
  const clip: AudioClip = {
    id: uid('clip'),
    assetId: asset.id,
    name: asset.name.replace(/^内置 · /, ''),
    start: Math.max(0, start),
    duration: asset.duration,
    offset: 0,
    fadeIn: 0.04,
    fadeOut: 0.12,
    effect: 'none',
    effectAmount: 0,
  };
  return {
    ...project,
    assets: project.assets.some((item) => item.id === asset.id)
      ? project.assets
      : [...project.assets, asset],
    tracks: project.tracks.map((track) =>
      track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track,
    ),
    updatedAt: Date.now(),
  };
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      project: initialProject(),
      selectedClipId: 'clip-chords-a',
      selectedTrackId: 'track-drums',
      isPlaying: false,
      playhead: 0,
      zoom: 1,
      projectSavedAt: Date.now(),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
      setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2.2, zoom)) }),
      setProjectName: (name) =>
        set((state) => ({
          project: timestamp({ ...state.project, name: name || '未命名工程' }),
        })),
      addTrack: () =>
        set((state) => {
          const index = state.project.tracks.length;
          const track: AudioTrack = {
            id: uid('track'),
            name: `音频轨 ${index + 1}`,
            color: TRACK_COLORS[index % TRACK_COLORS.length],
            volume: 0.72,
            pan: 0,
            muted: false,
            solo: false,
            height: 112,
            frozen: null,
            clips: [],
          };
          return {
            selectedTrackId: track.id,
            project: timestamp({ ...state.project, tracks: [...state.project.tracks, track] }),
          };
        }),
      updateTrack: (trackId, patch) =>
        set((state) => {
          const track = findTrack(state.project, trackId);
          if (!track) return {};
          let nextPatch = patch;
          if (track.frozen) {
            // 冻结轨道只读：仅放行静音、独奏、音量和外观字段
            nextPatch = {};
            for (const key of FROZEN_EDITABLE_KEYS) {
              if (key in patch) {
                (nextPatch as Record<string, unknown>)[key] = patch[key];
              }
            }
            if (!Object.keys(nextPatch).length) return {};
          }
          return {
            project: timestamp({
              ...state.project,
              tracks: state.project.tracks.map((item) =>
                item.id === trackId ? { ...item, ...nextPatch } : item,
              ),
            }),
          };
        }),
      deleteTrack: (trackId) =>
        set((state) => {
          if (state.project.tracks.length <= 1) return {};
          const tracks = state.project.tracks.filter((track) => track.id !== trackId);
          const project = pruneOrphanedRenders(timestamp({ ...state.project, tracks }));
          return {
            selectedTrackId: tracks[0].id,
            selectedClipId: null,
            project,
          };
        }),
      addClip: (trackId, assetId, start) =>
        set((state) => {
          if (findTrack(state.project, trackId)?.frozen) return {};
          const asset = state.project.assets.find((item) => item.id === assetId);
          if (!asset) return {};
          const next = addAssetClip(state.project, trackId, asset, start ?? state.playhead);
          const track = next.tracks.find((item) => item.id === trackId);
          const clip = track?.clips.at(-1);
          return { project: next, selectedTrackId: trackId, selectedClipId: clip?.id ?? null };
        }),
      setClip: (trackId, clipId, patch) =>
        set((state) => {
          if (findTrack(state.project, trackId)?.frozen) return {};
          return {
            project: timestamp({
              ...state.project,
              tracks: state.project.tracks.map((track) =>
                track.id === trackId
                  ? {
                      ...track,
                      clips: track.clips.map((clip) =>
                        clip.id === clipId ? { ...clip, ...patch } : clip,
                      ),
                    }
                  : track,
              ),
            }),
          };
        }),
      setClipEffect: (trackId, clipId, effect, amount) =>
        get().setClip(trackId, clipId, {
          effect,
          effectAmount: amount ?? 35,
        }),
      moveClipToTrack: (fromTrackId, clipId, toTrackId, start) =>
        set((state) => {
          const sourceTrack = state.project.tracks.find((track) => track.id === fromTrackId);
          const targetTrack = state.project.tracks.find((track) => track.id === toTrackId);
          if (sourceTrack?.frozen || targetTrack?.frozen) return {};
          const clip = sourceTrack?.clips.find((item) => item.id === clipId);
          if (!clip) return {};
          const moved = { ...clip, start: Math.max(0, start) };
          return {
            project: timestamp({
              ...state.project,
              tracks: state.project.tracks.map((track) => {
                if (track.id === fromTrackId && track.id === toTrackId) {
                  return {
                    ...track,
                    clips: track.clips.map((item) => (item.id === clipId ? moved : item)),
                  };
                }
                if (track.id === fromTrackId) {
                  return { ...track, clips: track.clips.filter((item) => item.id !== clipId) };
                }
                if (track.id === toTrackId) {
                  return { ...track, clips: [...track.clips, moved] };
                }
                return track;
              }),
            }),
            selectedTrackId: toTrackId,
            selectedClipId: clipId,
          };
        }),
      duplicateClip: (trackId, clipId) =>
        set((state) => {
          const track = state.project.tracks.find((item) => item.id === trackId);
          if (track?.frozen) return {};
          const clip = track?.clips.find((item) => item.id === clipId);
          if (!track || !clip) return {};
          const copy = {
            ...clip,
            id: uid('clip'),
            name: `${clip.name} 副本`,
            start: clip.start + clip.duration,
          };
          return {
            selectedClipId: copy.id,
            project: timestamp({
              ...state.project,
              tracks: state.project.tracks.map((item) =>
                item.id === trackId ? { ...item, clips: [...item.clips, copy] } : item,
              ),
            }),
          };
        }),
      deleteClip: (trackId, clipId) =>
        set((state) => {
          if (findTrack(state.project, trackId)?.frozen) return {};
          return {
            selectedClipId: null,
            project: timestamp({
              ...state.project,
              tracks: state.project.tracks.map((track) =>
                track.id === trackId
                  ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
                  : track,
              ),
            }),
          };
        }),
      freezeTrack: async (trackId) => {
        const before = get().project;
        const track = findTrack(before, trackId);
        if (!track || track.frozen) return;
        const range = measureFreezeRange(track);
        if (!range) throw new Error('该轨道没有可冻结的片段');
        try {
          // 先按估算大小做容量预检，超限直接拒绝，不进入渲染
          assertFreezeCapacity(before.assets, estimateRenderBytes(range.duration));
          const render = await renderTrackToAudio(before, track);
          // 渲染完成后按实际大小再校验一次，超限则放弃结果
          assertFreezeCapacity(before.assets, render.size);
          const asset: AudioAsset = {
            id: uid('freeze'),
            name: `${track.name} · 冻结渲染`,
            source: 'rendered',
            duration: render.duration,
            mimeType: 'audio/wav',
            dataUrl: render.dataUrl,
            size: render.size,
          };
          const frozenClip: AudioClip = {
            id: uid('clip'),
            assetId: asset.id,
            name: `${track.name} · 冻结`,
            start: render.start,
            duration: render.duration,
            offset: 0,
            fadeIn: 0,
            fadeOut: 0,
            effect: 'none',
            effectAmount: 0,
          };
          const current = findTrack(get().project, trackId);
          if (!current || current.frozen) return;
          if (current !== track) {
            throw new Error('冻结期间轨道被修改，请调整后重试');
          }
          const frozenTrack: AudioTrack = {
            ...current,
            // 音量与声像已渲染进音频，重置为直通值避免二次叠加；
            // 原值保存在 frozen.source 中，解冻时还原
            volume: 1,
            pan: 0,
            clips: [frozenClip],
            frozen: {
              assetId: asset.id,
              renderedAt: Date.now(),
              start: render.start,
              duration: render.duration,
              source: {
                clips: current.clips.map((clip) => ({ ...clip })),
                volume: current.volume,
                pan: current.pan,
              },
            },
          };
          set((state) => ({
            selectedClipId: frozenClip.id,
            project: timestamp({
              ...state.project,
              assets: [...state.project.assets, asset],
              tracks: state.project.tracks.map((item) =>
                item.id === trackId ? frozenTrack : item,
              ),
            }),
          }));
        } catch (error) {
          // 渲染或写入失败：恢复冻结前的工程，避免留下半段冻结结果
          set({ project: before });
          throw error instanceof Error ? error : new Error('冻结渲染失败，已保留原轨道');
        }
      },
      unfreezeTrack: (trackId) =>
        set((state) => {
          const track = findTrack(state.project, trackId);
          const frozen = track?.frozen;
          if (!track || !frozen) return {};
          const restored: AudioTrack = {
            ...track,
            volume: frozen.source.volume,
            pan: frozen.source.pan,
            clips: frozen.source.clips.map((clip) => ({ ...clip })),
            frozen: null,
          };
          const project = pruneOrphanedRenders(
            timestamp({
              ...state.project,
              tracks: state.project.tracks.map((item) =>
                item.id === trackId ? restored : item,
              ),
            }),
          );
          const selectionAlive =
            state.selectedClipId != null &&
            project.tracks.some((item) =>
              item.clips.some((clip) => clip.id === state.selectedClipId),
            );
          return {
            project,
            selectedClipId: selectionAlive
              ? state.selectedClipId
              : restored.clips[0]?.id ?? null,
          };
        }),
      selectClip: (selectedClipId) => set({ selectedClipId }),
      updateTransport: (patch) =>
        set((state) => ({
          project: timestamp({ ...state.project, ...patch }),
        })),
      importFile: async (file) => {
        if (file.size > 8 * 1024 * 1024) {
          throw new Error('单个音频文件请小于 8 MB，以避免浏览器本地存储超限');
        }
        const dataUrl = await readFileAsDataUrl(file);
        const duration = await readAudioDuration(dataUrl);
        const asset: AudioAsset = {
          id: uid('asset'),
          name: file.name.replace(/\.[^.]+$/, ''),
          source: 'imported',
          duration,
          mimeType: file.type || 'audio/mpeg',
          dataUrl,
          size: file.size,
        };
        set((state) => {
          const trackId = state.selectedTrackId || state.project.tracks[0].id;
          if (findTrack(state.project, trackId)?.frozen) {
            throw new Error('当前轨道已冻结，请先解冻或选择其他轨道');
          }
          const project = addAssetClip(state.project, trackId, asset, state.playhead);
          const track = project.tracks.find((item) => item.id === trackId);
          return {
            project,
            selectedTrackId: trackId,
            selectedClipId: track?.clips.at(-1)?.id ?? null,
          };
        });
      },
      addRecordedBlob: async (blob, duration) => {
        const dataUrl = await readFileAsDataUrl(blob);
        const asset: AudioAsset = {
          id: uid('record'),
          name: `录音 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
          source: 'recorded',
          duration,
          mimeType: blob.type || 'audio/webm',
          dataUrl,
          size: blob.size,
        };
        set((state) => {
          const trackId = state.selectedTrackId || state.project.tracks[0].id;
          if (findTrack(state.project, trackId)?.frozen) {
            throw new Error('当前轨道已冻结，请先解冻或选择其他轨道');
          }
          const project = addAssetClip(state.project, trackId, asset, state.playhead);
          const track = project.tracks.find((item) => item.id === trackId);
          return {
            project,
            selectedTrackId: trackId,
            selectedClipId: track?.clips.at(-1)?.id ?? null,
          };
        });
      },
      replaceProject: (project) =>
        set({
          project: normalizeProject(project),
          playhead: 0,
          isPlaying: false,
          selectedClipId: project.tracks.flatMap((track) => track.clips)[0]?.id ?? null,
          selectedTrackId: project.tracks[0]?.id ?? '',
        }),
      markSaved: () => set({ projectSavedAt: Date.now() }),
    }),
    {
      name: 'pair-wise-yy-08-studio',
      partialize: (state) => ({
        project: state.project,
        zoom: state.zoom,
        selectedClipId: state.selectedClipId,
        selectedTrackId: state.selectedTrackId,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<StudioState> | undefined;
        return {
          ...current,
          ...saved,
          project: normalizeProject(saved?.project ?? current.project),
        };
      },
    },
  ),
);
