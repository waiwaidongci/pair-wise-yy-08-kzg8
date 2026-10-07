import {
  ContentCopy,
  DeleteOutline,
  GraphicEq,
  LockOpen,
  Tune,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useStudioStore } from '../stores/studioStore';
import type { ClipEffect } from '../types/audio';

export function ClipInspector() {
  const project = useStudioStore((state) => state.project);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const setClip = useStudioStore((state) => state.setClip);
  const setClipEffect = useStudioStore((state) => state.setClipEffect);
  const duplicateClip = useStudioStore((state) => state.duplicateClip);
  const deleteClip = useStudioStore((state) => state.deleteClip);
  const unfreezeTrack = useStudioStore((state) => state.unfreezeTrack);

  const selection = useMemo(() => {
    for (const track of project.tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  }, [project.tracks, selectedClipId]);

  if (!selection) {
    return (
      <aside className="inspector-panel">
        <div className="panel-heading">
          <Typography variant="subtitle2">片段检查器</Typography>
        </div>
        <div className="inspector-empty">
          <GraphicEq />
          <strong>选择一个音频片段</strong>
          <span>裁剪、淡入淡出、效果器和基础混音参数会显示在这里。</span>
        </div>
      </aside>
    );
  }

  const { track, clip } = selection;
  const asset = project.assets.find((item) => item.id === clip.assetId);
  const frozen = track.frozen || clip.frozen;

  const update = (patch: Parameters<typeof setClip>[2]) => {
    if (frozen) return;
    setClip(track.id, clip.id, patch);
  };

  return (
    <aside className="inspector-panel">
      <div className="panel-heading">
        <div>
          <Typography variant="subtitle2">片段检查器</Typography>
          <Typography variant="caption" color="text.secondary">{track.name}</Typography>
        </div>
        <Chip
          size="small"
          label={clip.effect === 'none' ? '干声' : clip.effect.toUpperCase()}
          color={clip.effect === 'none' ? 'default' : 'primary'}
        />
      </div>

      <Box className="clip-summary" style={{ borderColor: track.color }}>
        <span style={{ background: track.color }} />
        <div>
          <strong>{clip.name}</strong>
          <small>{asset?.name ?? '未知素材'} · {asset?.duration.toFixed(2) ?? '--'}s</small>
        </div>
      </Box>

      {frozen && (
        <Alert
          severity="info"
          className="inspector-frozen"
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<LockOpen />}
              onClick={() => unfreezeTrack(track.id)}
            >
              解冻
            </Button>
          }
        >
          轨道已冻结，片段与参数为只读。解冻后可恢复编辑。
        </Alert>
      )}

      <div className="inspector-section">
        <Typography className="section-label" variant="caption">时间位置</Typography>
        <Stack spacing={1.4}>
          <label>
            <span>开始时间 <b>{clip.start.toFixed(2)}s</b></span>
            <Slider
              size="small"
              min={0}
              max={30}
              step={project.snap}
              value={clip.start}
              disabled={frozen}
              onChange={(_, value) => update({ start: Math.max(0, Number(value)) })}
            />
          </label>
          <label>
            <span>片段时长 <b>{clip.duration.toFixed(2)}s</b></span>
            <Slider
              size="small"
              min={project.snap}
              max={asset?.duration ?? 12}
              step={project.snap}
              value={clip.duration}
              disabled={frozen}
              onChange={(_, value) => update({ duration: Number(value) })}
            />
          </label>
          <label>
            <span>素材偏移 <b>{clip.offset.toFixed(2)}s</b></span>
            <Slider
              size="small"
              min={0}
              max={Math.max(0, (asset?.duration ?? clip.duration) - clip.duration)}
              step={0.01}
              value={clip.offset}
              disabled={frozen}
              onChange={(_, value) => update({ offset: Number(value) })}
            />
          </label>
        </Stack>
      </div>

      <Divider />
      <div className="inspector-section">
        <Typography className="section-label" variant="caption">淡入淡出</Typography>
        <Stack spacing={1.4}>
          <label>
            <span>淡入 <b>{clip.fadeIn.toFixed(2)}s</b></span>
            <Slider
              size="small"
              min={0}
              max={Math.min(3, clip.duration / 2)}
              step={0.01}
              value={clip.fadeIn}
              disabled={frozen}
              onChange={(_, value) => update({ fadeIn: Number(value) })}
            />
          </label>
          <label>
            <span>淡出 <b>{clip.fadeOut.toFixed(2)}s</b></span>
            <Slider
              size="small"
              min={0}
              max={Math.min(3, clip.duration / 2)}
              step={0.01}
              value={clip.fadeOut}
              disabled={frozen}
              onChange={(_, value) => update({ fadeOut: Number(value) })}
            />
          </label>
        </Stack>
      </div>

      <Divider />
      <div className="inspector-section">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tune fontSize="small" color="primary" />
          <Typography className="section-label" variant="caption">基础效果器</Typography>
        </Stack>
        <FormControl fullWidth size="small">
          <InputLabel>效果类型</InputLabel>
          <Select
            label="效果类型"
            value={clip.effect}
            disabled={frozen}
            onChange={(event) =>
              setClipEffect(track.id, clip.id, event.target.value as ClipEffect, clip.effectAmount || 35)
            }
          >
            <MenuItem value="none">关闭</MenuItem>
            <MenuItem value="lowpass">低通滤波器</MenuItem>
            <MenuItem value="highpass">高通滤波器</MenuItem>
            <MenuItem value="echo">Echo 延迟</MenuItem>
          </Select>
        </FormControl>
        <label>
          <span>效果强度 <b>{clip.effectAmount}%</b></span>
          <Slider
            size="small"
            min={0}
            max={100}
            value={clip.effectAmount}
            disabled={frozen || clip.effect === 'none'}
            onChange={(_, value) =>
              setClipEffect(track.id, clip.id, clip.effect, Number(value))
            }
          />
        </label>
      </div>

      <Divider />
      {!frozen && (
        <Stack direction="row" spacing={1} className="inspector-actions">
          <Button
            fullWidth
            variant="outlined"
            startIcon={<ContentCopy />}
            onClick={() => duplicateClip(track.id, clip.id)}
          >
            复制片段
          </Button>
          <Button
            fullWidth
            color="error"
            variant="outlined"
            startIcon={<DeleteOutline />}
            onClick={() => deleteClip(track.id, clip.id)}
          >
            删除
          </Button>
        </Stack>
      )}
    </aside>
  );
}
