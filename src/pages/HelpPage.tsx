import { AcUnit, ArrowBack, GraphicEq, Loop, Mic, Tune, Waves } from '@mui/icons-material';
import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

const TOPICS = [
  {
    icon: <Waves />,
    title: '波形与时间轴',
    body: 'WaveSurfer 会按当前像素每秒重新绘制波形。拖动片段可跨轨移动，拖动左右边缘可裁剪素材区间。',
  },
  {
    icon: <Mic />,
    title: '录音与导入',
    body: '没有麦克风权限时可直接使用内置鼓组、和弦和贝斯。导入文件建议小于 8 MB，以适配浏览器本地存储。',
  },
  {
    icon: <Tune />,
    title: '效果与混音',
    body: '每个片段支持淡入、淡出、低通、高通和 Echo。轨道提供音量、声像、静音和独奏控制。',
  },
  {
    icon: <AcUnit />,
    title: '轨道冻结',
    body: '片段或效果过多导致播放卡顿时，点击轨道上的雪花按钮可把该轨的声像、淡入淡出和效果渲染成一段音频。冻结后轨道只读，音量、静音和独奏仍可实时调整；再次点击即可解冻，还原全部片段与参数。',
  },
  {
    icon: <Loop />,
    title: '同步播放',
    body: '所有轨道由同一个 AudioContext 时钟调度，循环播放不会累积时间漂移。',
  },
];

export function HelpPage() {
  return (
    <div className="help-page">
      <header>
        <div>
          <Typography className="eyebrow">WORKSTATION GUIDE</Typography>
          <Typography variant="h4">WaveForge 使用指南</Typography>
          <Typography color="text.secondary">
            浏览器内的多轨音频编辑流程与快捷键说明。
          </Typography>
        </div>
        <Link to="/studio">
          <Button variant="contained" startIcon={<ArrowBack />}>返回工作站</Button>
        </Link>
      </header>
      <main>
        <div className="help-grid">
          {TOPICS.map((topic) => (
            <Card key={topic.title} variant="outlined">
              <CardContent>
                <span className="help-icon">{topic.icon}</span>
                <Typography variant="h6">{topic.title}</Typography>
                <Typography color="text.secondary">{topic.body}</Typography>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1}>
              <GraphicEq color="primary" />
              <Typography variant="h6">快捷键</Typography>
            </Stack>
            <div className="shortcut-grid">
              <span><kbd>Space</kbd><em>播放 / 暂停</em></span>
              <span><kbd>拖动片段</kbd><em>移动或跨轨</em></span>
              <span><kbd>左右边缘</kbd><em>裁剪片段</em></span>
              <span><kbd>时间轴标尺</kbd><em>定位播放头</em></span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
