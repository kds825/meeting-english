import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 상대 경로: GitHub Pages 저장소 이름이 바뀌어도 그대로 동작한다
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
  },
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '회의 영어',
        short_name: '회의 영어',
        description: '읽고 듣고 말하는 회의 영어와 출근길 오디오',
        lang: 'ko',
        theme_color: '#0F766E',
        background_color: '#F3F5F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // MP3와 한글 폰트 조각은 용량이 커서 사전 캐시하지 않고 아래 런타임 캐시에 둔다
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // 화 데이터가 앱 코드에 함께 묶인다. 80화에 약 2.5MB이고 오프라인에서도 열려야 하므로 한도를 넉넉히 둔다
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // iOS Safari는 오디오를 Range 요청으로 받으므로 rangeRequests가 없으면 오프라인 재생이 실패한다.
            // 파일은 src/lib/player.ts의 prefetchAudio가 이 캐시에 통째로 미리 넣는다.
            urlPattern: /\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
