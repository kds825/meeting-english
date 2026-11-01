import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/source-serif-4';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

// 단어와 진도는 이 기기에만 있으므로, 저장 공간이 부족해도 브라우저가 지우지 않도록 요청한다
void navigator.storage?.persist?.();

// 새 버전이 활성화되면 registerSW가 페이지를 새로고침한다 (registerType: autoUpdate).
// 휴대폰은 앱을 닫아도 메모리에 남아 페이지를 다시 열지 않으므로, 돌아올 때마다 새 버전을 확인한다.
// 학습·운전 화면에서는 새로고침으로 소리가 끊기거나 퀴즈 답·녹음이 사라지므로 확인하지 않는다.
const BUSY_SCREENS = /^#\/(reading|listening|roleplay|speaking|drive)/;
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !BUSY_SCREENS.test(window.location.hash)) {
        void registration.update();
      }
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
