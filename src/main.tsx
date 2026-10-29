import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { BootError } from './app/BootError';
import { aboutClient } from './app/about-client';
import { SERVER_MODE, createStorage } from './app/create-storage';
import { installErrorReporting } from './app/error-log';
import { initPalette } from './state/palette';
import './ui/tokens.css';
import './ui/styles.css';

initPalette();
installErrorReporting(SERVER_MODE ? aboutClient.sendError : null);
const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');
const root = createRoot(container);

createStorage().then(
  (storage) =>
    root.render(
      <StrictMode>
        <App storage={storage} />
      </StrictMode>,
    ),
  (error: unknown) => root.render(<BootError error={error} />),
);
