import {
  AcUnit,
  AudioFile,
  FiberManualRecord,
  FolderOpen,
  GraphicEq,
  Mic,
  StopCircle,
  Waves,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../stores/studioStore';
import { SYNTHETIC_ASSETS } from '../utils/syntheticAudio';

export function AssetLibrary() {
  const assets = useStudioStore((state) => state.project.assets);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const addClip = useStudioStore((state) => state.addClip);
  const importFile = useStudioStore((state) => state.importFile);
  const addRecordedBlob = useStudioStore((state) => state.addRecordedBlob);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordSeconds((performance.now() - recordStartedAt.current) / 1000),
      100,
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  const handleImport = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importFile(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '导入音频失败');
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const duration = Math.max(0.2, (performance.now() - recordStartedAt.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await addRecordedBlob(blob, duration);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setRecordSeconds(0);
      };
      recorder.start(250);
      recorderRef.current = recorder;
      streamRef.current = stream;
      recordStartedAt.current = performance.now();
      setRecordSeconds(0);
      setRecording(true);
    } catch {
      setError('未获得麦克风权限，可使用内置合成音频或导入本地文件。');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  return (
    <aside className="library-panel">
      <div className="panel-heading">
        <div>
          <Typography variant="subtitle2">素材库</Typography>
          <Typography variant="caption" color="text.secondary">
            合成、录音与本地文件
          </Typography>
        </div>
        <Chip size="small" label={`${assets.length} 项`} />
      </div>

      <Stack spacing={1} className="record-card">
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <div>
            <Typography variant="body2" fontWeight={700}>录音输入</Typography>
            <Typography variant="caption" color="text.secondary">
              添加为当前所选轨道的新片段
            </Typography>
          </div>
          <Tooltip title={recording ? '停止录音' : '开始录音'}>
            <IconButton
              className={recording ? 'record-button record-button--active' : 'record-button'}
              onClick={recording ? stopRecording : () => void startRecording()}
            >
              {recording ? <StopCircle /> : <FiberManualRecord />}
            </IconButton>
          </Tooltip>
        </Stack>
        {recording && (
          <div className="recording-status">
            <span />
            <strong>正在录音 {recordSeconds.toFixed(1)}s</strong>
            <small>输出到所选轨道</small>
          </div>
        )}
      </Stack>

      <Divider />
      <Typography className="library-label" variant="caption">内置合成片段</Typography>
      <List dense className="asset-list">
        {SYNTHETIC_ASSETS.map((asset) => (
          <ListItem
            key={asset.id}
            secondaryAction={
              <Tooltip title="添加到当前轨道">
                <IconButton edge="end" size="small" onClick={() => addClip(selectedTrackId, asset.id)}>
                  <GraphicEq fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            <ListItemIcon><Waves color="primary" /></ListItemIcon>
            <ListItemText
              primary={asset.name}
              secondary={`${asset.duration}s · ${asset.description}`}
              slotProps={{ secondary: { noWrap: true } }}
            />
          </ListItem>
        ))}
      </List>

      <Divider />
      <Typography className="library-label" variant="caption">导入素材</Typography>
      <List dense className="asset-list asset-list--scroll">
        {assets
          .filter((asset) => asset.source !== 'synthetic')
          .map((asset) => (
            <ListItem
              key={asset.id}
              secondaryAction={
                <Tooltip title="添加到当前轨道">
                  <IconButton edge="end" size="small" onClick={() => addClip(selectedTrackId, asset.id)}>
                    <GraphicEq fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemIcon>
                {asset.source === 'recorded' ? (
                  <Mic color="error" />
                ) : asset.source === 'frozen' ? (
                  <AcUnit color="info" />
                ) : (
                  <AudioFile color="success" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={asset.name}
                secondary={`${asset.duration.toFixed(1)}s · ${asset.source === 'recorded' ? '浏览器录音' : asset.source === 'frozen' ? '冻结渲染' : '本地导入'}`}
              />
            </ListItem>
          ))}
        {!assets.some((asset) => asset.source !== 'synthetic') && (
          <Box className="asset-empty">尚未导入文件，内置素材已经可以直接编辑。</Box>
        )}
      </List>

      <Button
        fullWidth
        variant="outlined"
        startIcon={busy ? <CircularProgress size={15} /> : <FolderOpen />}
        disabled={busy || recording}
        onClick={() => fileInputRef.current?.click()}
      >
        导入音频文件
      </Button>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="audio/*"
        onChange={(event) => {
          void handleImport(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}
    </aside>
  );
}
