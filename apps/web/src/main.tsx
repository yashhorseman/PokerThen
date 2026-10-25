import '@fontsource/mulish/400.css';
import '@fontsource/mulish/700.css';
import '@fontsource/mulish/800.css';
import '@fontsource/abril-fatface/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App /></StrictMode>);
