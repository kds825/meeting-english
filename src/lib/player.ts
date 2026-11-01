/**
 * 운전 모드 재생기. HTMLAudioElement 하나를 재사용해 트랙을 이어 붙이고 Media Session으로
 * 잠금 화면·CarPlay·Android Auto 조작을 받는다. 화면 전환과 무관하게 계속 재생되도록 모듈 싱글턴이다.
 */

export interface Track {
  url: string;
  section: number;
}

export interface Section {
  id: string;
  title: string;
}

export interface PlayerState {
  status: 'idle' | 'playing' | 'paused' | 'finished';
  section: number;
  currentTime: number;
  duration: number;
  rate: number;
  error: string | null;
}

const AUDIO_CACHE = 'audio';

/** MP3를 런타임 캐시에 통째로 넣어 오프라인에서도 재생되게 한다. 실패해도 재생은 네트워크로 된다. */
export async function prefetchAudio(urls: string[]): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    await Promise.all(
      urls.map(async (url) => {
        if (!(await cache.match(url))) await cache.add(url);
      }),
    );
  } catch {
    /* 저장 공간 부족·오프라인: 다음 진입 때 다시 시도한다 */
  }
}

class Player {
  private audio: HTMLAudioElement | null = null;
  private tracks: Track[] = [];
  private sections: Section[] = [];
  private label = '';
  private artwork = '';
  private index = 0;
  private listeners = new Set<() => void>();
  private state: PlayerState = {
    status: 'idle',
    section: 0,
    currentTime: 0,
    duration: 0,
    rate: 1,
    error: null,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => this.advance());
    // 파일 하나가 깨져도 운전 중 조작 없이 다음으로 넘어간다
    audio.addEventListener('error', () => {
      this.set({ error: '일부 음성을 재생하지 못해 건너뛰었습니다.' });
      this.advance();
    });
    audio.addEventListener('timeupdate', () =>
      this.set({ currentTime: audio.currentTime, duration: audio.duration || 0 }),
    );
    audio.addEventListener('loadedmetadata', () => {
      audio.playbackRate = this.state.rate;
      this.syncPosition();
    });
    audio.addEventListener('play', () => this.set({ status: 'playing' }));
    audio.addEventListener('pause', () => {
      if (!audio.ended && this.state.status === 'playing') this.set({ status: 'paused' });
    });
    this.audio = audio;
    this.bindMediaSession();
    return audio;
  }

  private bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.setActionHandler('play', () => this.play());
    session.setActionHandler('pause', () => this.pause());
    session.setActionHandler('nexttrack', () => this.nextSection());
    session.setActionHandler('previoustrack', () => this.previousSection());
  }

  private syncMetadata() {
    if (!('mediaSession' in navigator)) return;
    const section = this.sections[this.state.section];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: section?.title ?? '',
      artist: this.label,
      album: '회의 영어',
      artwork: this.artwork ? [{ src: this.artwork, sizes: '512x512', type: 'image/png' }] : [],
    });
  }

  private syncPosition() {
    const audio = this.audio;
    if (!audio || !('mediaSession' in navigator) || !Number.isFinite(audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch {
      /* 일부 브라우저는 위치 정보를 지원하지 않는다 */
    }
  }

  /** 같은 재생 목록이면 진행 위치를 유지한다 (화면을 나갔다 들어와도 끊기지 않게) */
  load(options: {
    key: string;
    label: string;
    artwork: string;
    sections: Section[];
    tracks: Track[];
    rate: number;
  }) {
    if (this.key === options.key) return;
    this.key = options.key;
    this.audio?.pause();
    this.tracks = options.tracks;
    this.sections = options.sections;
    this.label = options.label;
    this.artwork = options.artwork;
    this.index = 0;
    if (this.audio) this.audio.removeAttribute('src');
    this.set({
      status: 'idle',
      section: 0,
      currentTime: 0,
      duration: 0,
      rate: options.rate,
      error: null,
    });
  }
  private key = '';

  private start(index: number) {
    const track = this.tracks[index];
    if (!track) {
      this.finish();
      return;
    }
    const audio = this.element();
    this.index = index;
    this.set({ section: track.section, currentTime: 0, duration: 0 });
    audio.src = track.url;
    audio.playbackRate = this.state.rate;
    this.syncMetadata();
    void audio.play().catch(() => this.set({ status: 'paused' }));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  private advance() {
    this.start(this.index + 1);
  }

  private finish() {
    this.index = 0;
    this.set({ status: 'finished', section: 0, currentTime: 0, duration: 0 });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  }

  play() {
    const audio = this.element();
    if (this.state.status === 'paused' && audio.src) {
      void audio.play();
    } else {
      this.start(this.index);
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  pause() {
    this.audio?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  toggle() {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  playSection(section: number) {
    const index = this.tracks.findIndex((t) => t.section === section);
    if (index !== -1) this.start(index);
  }

  nextSection() {
    const current = this.tracks[this.index]?.section ?? 0;
    const index = this.tracks.findIndex((t) => t.section > current);
    if (index === -1) {
      this.audio?.pause();
      this.finish();
    } else {
      this.start(index);
    }
  }

  /** 구간 시작 3초 뒤면 현재 구간 처음으로, 그 전이면 이전 구간으로 */
  previousSection() {
    const current = this.tracks[this.index]?.section ?? 0;
    const first = this.tracks.findIndex((t) => t.section === current);
    if (this.index > first || (this.audio?.currentTime ?? 0) > 3) {
      this.start(first);
      return;
    }
    const before = this.tracks.findLast((t) => t.section < current);
    this.start(before ? this.tracks.findIndex((t) => t.section === before.section) : 0);
  }

  setRate(rate: number) {
    if (this.audio) this.audio.playbackRate = rate;
    this.set({ rate });
    this.syncPosition();
  }
}

export const player = new Player();

/** 단어 카드의 발음 듣기처럼 한 번만 재생 */
export function playOnce(url: string): void {
  void new Audio(url).play().catch(() => undefined);
}
