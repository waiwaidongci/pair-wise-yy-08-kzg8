export type AssetSource = 'synthetic' | 'imported' | 'recorded' | 'rendered';
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
}

export interface FrozenTrackState {
  /** 冻结渲染结果对应的素材 id */
  assetId: string;
  /** 冻结时间戳 */
  renderedAt: number;
  /** 渲染区间在时间轴上的起点（秒） */
  start: number;
  /** 渲染结果时长（含效果尾音，秒） */
  duration: number;
  /** 冻结前的原始片段与混音参数，解冻时还原 */
  source: {
    clips: AudioClip[];
    volume: number;
    pan: number;
  };
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
  /** 冻结信息；旧工程数据没有该字段，打开时按 null 补齐 */
  frozen?: FrozenTrackState | null;
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
