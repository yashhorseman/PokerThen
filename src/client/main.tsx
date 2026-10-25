// PLACEHOLDER router - the shell agent owns this file and src/client/shell/**.
import { createRoot } from 'react-dom/client';
import './styles/canvas.css';
import { Canvas } from './table/Canvas';
import { TableApp } from './table/TableApp';
import { OverlayHost } from './shell/OverlayHost';

createRoot(document.getElementById('root')!).render(
  <Canvas><TableApp /><OverlayHost /></Canvas>,
);
