import {
  AcUnit,
  ContentCopy,
  DeleteOutline,
  GraphicEq,
  Lock,
  VolumeOff,
  VolumeUp,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useRef, useState } from 'react';
import { useStudioStore } from '../stores/studioStore';
import type { AudioClip, AudioTrack } from '../types/audio';
import { WaveformClip } from './WaveformClip';

interface DragState {
  mode: 'move' | 'trim-left' | 'trim-right';
  clip: AudioClip;
  trackId: string;
  startX: number;
  startTrackIndex: number;
  lastTrackId: string;
}

function snapValue(value: number, snap: number): number {
  return Math.max(0, Math.round(value / snap) * snap);
}

export function TrackTimeline() {
  const project = useStudioStore((state) => state.project);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const playhead = useStudioStore((state) => state.playhead);
  const setPlayhead = useStudioStore((state) => state.setPlayhead);
  const updateTrack = useStudioStore((state) => state.updateTrack);
  const setClip = useStudioStore((state) => state.setClip);
  const moveClipToTrack = useStudioStore((state) => state.moveClipToTrack);
  const selectClip = useStudioStore((state) => state.selectClip);
  const deleteClip = useStudioStore((state) => state.deleteClip);
  const duplicateClip = useStudioStore((state) => state.duplicateClip);
  const freezeTrack = useStudioStore((state) => state.freezeTrack);
  const unfreezeTrack = useStudioStore((state) => state.unfreezeTrack);
  const dragState = useRef<DragState | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [freezingTrackId, setFreezingTrackId] = useState<string | null>(null);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const pps = project.pixelsPerSecond;

  const timelineDuration = useMemo(() => {
    const clipEnd = Math.max(
      0,
      ...project.tracks.flatMap((track) =>
        track.clips.map((clip) => clip.start + clip.duration),
      ),
    );
    return Math.max(20, Math.ceil(Math.max(clipEnd + 4, project.loopEnd + 4)));
  }, [project.loopEnd, project.tracks]);

  const timeMarkers = useMemo(
    () => Array.from({ length: Math.floor(timelineDuration) + 1 }, (_, index) => index),
    [timelineDuration],
  );

  const trackIndexAtY = (clientY: number): number => {
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    project.tracks.forEach((track, index) => {
      const rect = rowRefs.current[track.id]?.getBoundingClientRect();
      if (!rect) return;
      const nextDistance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    return nearest;
  };

  const toggleFreeze = async (track: AudioTrack) => {
    setFreezeError(null);
    if (track.frozen) {
      unfreezeTrack(track.id);
      return;
    }
    setFreezingTrackId(track.id);
    try {
      await freezeTrack(track.id);
    } catch (error) {
      setFreezeError(error instanceof Error ? error.message : '冻结轨道失败');
    } finally {
      setFreezingTrackId(null);
    }
  };

  const startDrag = (
    event: React.PointerEvent,
    track: AudioTrack,
    clip: AudioClip,
    mode: DragState['mode'],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectClip(clip.id);
    if (track.frozen) return; // 冻结轨道内容只读，不允许拖动或裁剪
    dragState.current = {
      mode,
      clip: { ...clip },
      trackId: track.id,
      startX: event.clientX,
      startTrackIndex: project.tracks.findIndex((item) => item.id === track.id),
      lastTrackId: track.id,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const deltaSeconds = (event.clientX - drag.startX) / pps;
    if (drag.mode === 'move') {
      const targetIndex = trackIndexAtY(event.clientY);
      const targetTrack = project.tracks[targetIndex];
      const nextStart = snapValue(drag.clip.start + deltaSeconds, project.snap);
      if (targetTrack && targetTrack.id !== drag.lastTrackId) {
        moveClipToTrack(drag.lastTrackId, drag.clip.id, targetTrack.id, nextStart);
        drag.lastTrackId = targetTrack.id;
      } else {
        setClip(drag.lastTrackId, drag.clip.id, { start: nextStart });
      }
      return;
    }
    if (drag.mode === 'trim-left') {
      const maxDelta = drag.clip.duration - project.snap;
      const delta = Math.min(maxDelta, Math.max(-drag.clip.offset, deltaSeconds));
      const next = {
        start: snapValue(drag.clip.start + delta, project.snap),
        offset: Math.max(0, drag.clip.offset + delta),
        duration: Math.max(project.snap, drag.clip.duration - delta),
      };
      setClip(drag.lastTrackId, drag.clip.id, next);
      return;
    }
    const nextDuration = Math.max(
      project.snap,
      snapValue(drag.clip.duration + deltaSeconds, project.snap),
    );
    setClip(drag.lastTrackId, drag.clip.id, { duration: nextDuration });
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragState.current) return;
    dragState.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  const movePlayhead = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = snapValue((event.clientX - rect.left) / pps, project.snap);
    setPlayhead(Math.min(timelineDuration, time));
  };

  return (
    <section className="timeline-panel">
      <div className="timeline-scroll" ref={scrollRef}>
        <div className="timeline-content" style={{ width: `${180 + timelineDuration * pps}px` }}>
          <div className="timeline-ruler-row">
            <div className="track-controls ruler-controls">
              <Typography variant="caption" color="text.secondary">
                轨道与混音
              </Typography>
              <Chip label={`${project.tracks.length} 轨`} size="small" />
            </div>
            <div
              className="timeline-ruler"
              style={{ width: `${timelineDuration * pps}px` }}
              onClick={movePlayhead}
            >
              {timeMarkers.map((second) => (
                <span
                  key={second}
                  className={`time-marker ${second % 5 === 0 ? 'time-marker--major' : ''}`}
                  style={{ left: `${second * pps}px` }}
                >
                  {second % 5 === 0 ? `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}` : ''}
                </span>
              ))}
              <div
                className={`loop-region ${project.loopEnabled ? 'loop-region--active' : ''}`}
                style={{
                  left: `${project.loopStart * pps}px`,
                  width: `${Math.max(1, project.loopEnd - project.loopStart) * pps}px`,
                }}
              />
              <div className="playhead playhead--ruler" style={{ left: `${playhead * pps}px` }} />
            </div>
          </div>

          <div
            className="timeline-lanes"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {project.tracks.map((track) => (
              <div
                className={`track-row ${selectedTrackId === track.id ? 'track-row--selected' : ''} ${track.frozen ? 'track-row--frozen' : ''}`}
                key={track.id}
                ref={(element) => {
                  rowRefs.current[track.id] = element;
                }}
                style={{ height: track.height }}
              >
                <div className="track-controls">
                  <div className="track-name-row">
                    <span className="track-color" style={{ background: track.color }} />
                    <input
                      value={track.name}
                      aria-label="轨道名称"
                      onChange={(event) => updateTrack(track.id, { name: event.target.value })}
                    />
                    <Tooltip title={track.muted ? '取消静音' : '静音'}>
                      <IconButton
                        size="small"
                        color={track.muted ? 'warning' : 'default'}
                        onClick={() => updateTrack(track.id, { muted: !track.muted })}
                      >
                        {track.muted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <button
                      type="button"
                      className={`solo-button ${track.solo ? 'solo-button--active' : ''}`}
                      onClick={() => updateTrack(track.id, { solo: !track.solo })}
                    >
                      S
                    </button>
                    <Tooltip
                      title={track.frozen ? '解冻轨道：还原片段与参数' : '冻结轨道：渲染为单段音频'}
                    >
                      <span>
                        <IconButton
                          size="small"
                          className={track.frozen ? 'freeze-button freeze-button--active' : 'freeze-button'}
                          disabled={freezingTrackId === track.id}
                          onClick={() => void toggleFreeze(track)}
                        >
                          {freezingTrackId === track.id ? (
                            <CircularProgress size={15} />
                          ) : (
                            <AcUnit fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                  <div className="track-mix-row">
                    <span>音量</span>
                    <Slider
                      size="small"
                      min={0}
                      max={1}
                      step={0.01}
                      value={track.volume}
                      onChange={(_, value) => updateTrack(track.id, { volume: Number(value) })}
                    />
                    <span>{Math.round(track.volume * 100)}</span>
                  </div>
                  <div className="track-mix-row">
                    <span>声像</span>
                    <Slider
                      size="small"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={track.pan}
                      disabled={Boolean(track.frozen)}
                      onChange={(_, value) => updateTrack(track.id, { pan: Number(value) })}
                    />
                    <span>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : `R${Math.round(track.pan * 100)}`}</span>
                  </div>
                </div>
                <div
                  className="track-lane"
                  style={{ width: `${timelineDuration * pps}px` }}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPlayhead(snapValue((event.clientX - rect.left) / pps, project.snap));
                  }}
                >
                  {Array.from({ length: Math.ceil(timelineDuration * 2) }).map((_, index) => (
                    <span
                      key={index}
                      className={`lane-grid ${index % 8 === 0 ? 'lane-grid--major' : ''}`}
                      style={{ left: `${index * pps * 0.5}px` }}
                    />
                  ))}
                  {track.clips.map((clip) => {
                    const asset = project.assets.find((item) => item.id === clip.assetId);
                    const selected = selectedClipId === clip.id;
                    const frozen = Boolean(track.frozen);
                    return (
                      <Box
                        key={clip.id}
                        className={`audio-clip ${selected ? 'audio-clip--selected' : ''} ${frozen ? 'audio-clip--frozen' : ''}`}
                        style={{
                          left: `${clip.start * pps}px`,
                          width: `${Math.max(20, clip.duration * pps)}px`,
                          top: `${(track.height - 82) / 2}px`,
                          background: `${track.color}22`,
                          borderColor: selected ? track.color : `${track.color}99`,
                        }}
                        onPointerDown={(event) => startDrag(event, track, clip, 'move')}
                      >
                        <div className="clip-title" title={clip.name}>
                          {frozen ? <AcUnit fontSize="inherit" /> : <GraphicEq fontSize="inherit" />}
                          <span>{clip.name}</span>
                          <small>{clip.duration.toFixed(2)}s</small>
                        </div>
                        {asset && (
                          <WaveformClip
                            asset={asset}
                            clip={clip}
                            pixelsPerSecond={pps}
                            color={track.color}
                          />
                        )}
                        {!frozen && (
                          <span
                            className="trim-handle trim-handle--left"
                            title="裁剪片段左边缘"
                            onPointerDown={(event) => startDrag(event, track, clip, 'trim-left')}
                          />
                        )}
                        {!frozen && (
                          <span
                            className="trim-handle trim-handle--right"
                            title="裁剪片段右边缘"
                            onPointerDown={(event) => startDrag(event, track, clip, 'trim-right')}
                          />
                        )}
                        {selected && !frozen && (
                          <span className="clip-actions" onPointerDown={(event) => event.stopPropagation()}>
                            <IconButton
                              size="small"
                              title="复制片段"
                              onClick={() => duplicateClip(track.id, clip.id)}
                            >
                              <ContentCopy fontSize="inherit" />
                            </IconButton>
                            <IconButton
                              size="small"
                              title="删除片段"
                              color="error"
                              onClick={() => deleteClip(track.id, clip.id)}
                            >
                              <DeleteOutline fontSize="inherit" />
                            </IconButton>
                          </span>
                        )}
                      </Box>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="playhead playhead--timeline" style={{ left: `${180 + playhead * pps}px` }}>
              <span />
            </div>
          </div>
        </div>
      </div>
      {freezeError && (
        <Alert severity="warning" className="freeze-alert" onClose={() => setFreezeError(null)}>
          {freezeError}
        </Alert>
      )}
      <Stack className="timeline-footer" direction="row" spacing={2}>
        <span><Lock fontSize="inherit" /> 吸附步长 {project.snap.toFixed(2)}s</span>
        <span>时间轴 {project.pixelsPerSecond}px / 秒</span>
        <span>总时长约 {timelineDuration}s</span>
      </Stack>
    </section>
  );
}
