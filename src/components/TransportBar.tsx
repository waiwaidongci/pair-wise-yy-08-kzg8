import {
  Add,
  FiberManualRecord,
  Loop,
  Pause,
  PlayArrow,
  Save,
  Stop,
} from '@mui/icons-material';
import {
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useStudioStore } from '../stores/studioStore';

interface TransportBarProps {
  recording: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSaveProject: () => void;
}

export function TransportBar({
  recording,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onSaveProject,
}: TransportBarProps) {
  const project = useStudioStore((state) => state.project);
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const playhead = useStudioStore((state) => state.playhead);
  const zoom = useStudioStore((state) => state.zoom);
  const setZoom = useStudioStore((state) => state.setZoom);
  const addTrack = useStudioStore((state) => state.addTrack);
  const updateTransport = useStudioStore((state) => state.updateTransport);

  return (
    <section className="transport-bar">
      <Stack direction="row" alignItems="center" spacing={0.7}>
        <Tooltip title={isPlaying ? '暂停 Space' : '播放 Space'}>
          <IconButton
            className="transport-play"
            color="primary"
            onClick={isPlaying ? onPause : onPlay}
          >
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
        </Tooltip>
        <Tooltip title="停止并回到起点">
          <IconButton onClick={onStop}><Stop /></IconButton>
        </Tooltip>
        <Tooltip title={recording ? '正在录音' : '开始录音'}>
          <IconButton color="error" disabled={recording} onClick={onRecord}>
            <FiberManualRecord />
          </IconButton>
        </Tooltip>
      </Stack>

      <div className="transport-time">
        <strong>{formatTime(playhead)}</strong>
        <span>/ {formatTime(Math.max(project.loopEnd, 32))}</span>
      </div>

      <Divider orientation="vertical" flexItem />
      <Stack direction="row" alignItems="center" spacing={1}>
        <TextField
          size="small"
          label="BPM"
          type="number"
          value={project.bpm}
          className="bpm-field"
          inputProps={{ min: 40, max: 240 }}
          onChange={(event) =>
            updateTransport({ bpm: Math.max(40, Math.min(240, Number(event.target.value))) })
          }
        />
        <FormControl size="small" className="snap-field">
          <InputLabel>吸附</InputLabel>
          <Select
            label="吸附"
            value={project.snap}
            onChange={(event) => updateTransport({ snap: Number(event.target.value) })}
          >
            <MenuItem value={0.1}>0.10s</MenuItem>
            <MenuItem value={0.25}>0.25s</MenuItem>
            <MenuItem value={0.5}>0.50s</MenuItem>
            <MenuItem value={1}>1.00s</MenuItem>
          </Select>
        </FormControl>
        <Button
          variant={project.loopEnabled ? 'contained' : 'outlined'}
          color={project.loopEnabled ? 'secondary' : 'primary'}
          startIcon={<Loop />}
          onClick={() => updateTransport({ loopEnabled: !project.loopEnabled })}
        >
          循环
        </Button>
        <TextField
          size="small"
          label="循环起点"
          type="number"
          value={project.loopStart}
          className="loop-field"
          inputProps={{ min: 0, step: project.snap }}
          onChange={(event) => updateTransport({ loopStart: Math.max(0, Number(event.target.value)) })}
        />
        <TextField
          size="small"
          label="循环终点"
          type="number"
          value={project.loopEnd}
          className="loop-field"
          inputProps={{ min: project.loopStart + project.snap, step: project.snap }}
          onChange={(event) =>
            updateTransport({ loopEnd: Math.max(project.loopStart + project.snap, Number(event.target.value)) })
          }
        />
      </Stack>

      <span className="transport-spacer" />
      <Stack direction="row" alignItems="center" spacing={1} className="zoom-control">
        <Typography variant="caption">时间轴</Typography>
        <Slider
          size="small"
          min={0.5}
          max={2.2}
          step={0.05}
          value={zoom}
          onChange={(_, value) => setZoom(Number(value))}
        />
        <Chip size="small" label={`${Math.round(zoom * 100)}%`} />
      </Stack>
      <Button startIcon={<Add />} variant="outlined" onClick={addTrack}>
        新增轨道
      </Button>
      <Button startIcon={<Save />} onClick={onSaveProject}>
        保存工程
      </Button>
    </section>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(2).padStart(5, '0')}`;
}
