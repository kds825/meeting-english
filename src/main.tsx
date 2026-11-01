import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/source-serif-4';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';

// 단어와 진도는 이 기기에만 있으므로, 저장 공간이 부족해도 브라우저가 지우지 않도록 요청한다
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
