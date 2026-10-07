import { GraphicEq, HelpOutline, Waves } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, Toolbar, Typography } from '@mui/material';
import { NavLink, Outlet } from 'react-router-dom';

export function App() {
  return (
    <Box className="app-shell">
      <AppBar position="static" elevation={0} className="app-bar">
        <Toolbar>
          <div className="app-brand">
            <span><Waves /></span>
            <div>
              <Typography variant="h6">WaveForge</Typography>
              <small>MULTITRACK AUDIO STUDIO</small>
            </div>
          </div>
          <nav>
            <NavLink to="/studio" className={({ isActive }) => (isActive ? 'active' : '')}>
              <GraphicEq /> 音频工作站
            </NavLink>
            <NavLink to="/help" className={({ isActive }) => (isActive ? 'active' : '')}>
              <HelpOutline /> 使用指南
            </NavLink>
          </nav>
          <span className="app-bar__spacer" />
          <Chip
            label="Web Audio · 本地工程"
            size="small"
            className="engine-chip"
            icon={<GraphicEq />}
          />
          <Button color="inherit" variant="outlined">未命名用户</Button>
        </Toolbar>
      </AppBar>
      <Outlet />
    </Box>
  );
}
