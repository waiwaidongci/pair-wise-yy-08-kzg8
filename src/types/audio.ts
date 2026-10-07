export type AssetSource = 'synthetic' | 'imported' | 'recorded' | 'frozen';
export type TrackColor = '#2563eb' | '#0f9f7a' | '#d97706' | '#c2413b' | '#7c3aed' | '#0891b2';
export type ClipEffect = 'none' | 'lowpass' | 'highpass' | 'echo';

export interface AudioAsset {
  id: string;
  name: string;
  source: AssetSource;
  duration: number;
  mimeType: string;
  dataUrl?: string;
  size?: number;
}

export interface AudioClip {
  id: string;
  assetId: string;
  name: string;
  start: number;
  duration: number;
  offset: number;
  fadeIn: number;
  fadeOut: number;
  effect: ClipEffect;
  effectAmount: number;
  /** 冻结轨道渲染出的片段：已包含声像、淡入淡出与效果，播放时不再重复处理。 */
  frozen?: boolean;
}

export interface AudioTrack {
  id: string;
  name: string;
  color: TrackColor;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  height: number;
  clips: AudioClip[];
  /** 轨道是否已冻结。冻结后 clips 为只读的渲染结果，解冻时还原。 */
  frozen?: boolean;
  /** 冻结渲染生成的素材 id，解冻时用于回收素材库容量。 */
  frozenAssetId?: string;
  /** 冻结前的原始片段快照，解冻时还原。 */
  savedClips?: AudioClip[];
}

export interface AudioProject {
  version: 1;
  name: string;
  bpm: number;
  snap: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  pixelsPerSecond: number;
  tracks: AudioTrack[];
  assets: AudioAsset[];
  updatedAt: number;
}
