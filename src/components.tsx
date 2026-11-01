import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsOn, getSettings } from './lib/db';
import { episodeById, episodeByNumber, episodeOrder, orderLabel } from './lib/episodes';
import { localDate } from './lib/review';
import { todayEpisodeNumber } from './lib/session';
import type { Episode, Session, Settings } from './lib/types';

const PATHS = {
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h14',
  cards: 'M4 8h13v13H4zM8 4h12v12',
  car: 'M5 12l2-6h10l2 6M4 12h16v6H4zM7 18v2M17 18v2M7.5 15h.01M16.5 15h.01',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 5l7 7-7 7',
  volume: 'M4 9.5v5h4l5 4.5V5L8 9.5H4zM16.5 9a4 4 0 0 1 0 6',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21',
  chart: 'M4 20h16M7 20v-7M12 20V5M17 20v-10',
} as const;

export type IconName = keyof typeof PATHS | 'play' | 'pause' | 'next' | 'previous';

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const filled: Partial<Record<IconName, string>> = {
    play: 'M7 4.5v15l13-7.5z',
    pause: 'M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z',
    next: 'M5 5v14l10-7zM16 5h3v14h-3z',
    previous: 'M19 5v14L9 12zM5 5h3v14H5z',
  };
  const fill = filled[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {fill ? (
        <path d={fill} fill="currentColor" />
      ) : (
        <path
          d={PATHS[name as keyof typeof PATHS]}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function TopBar({ title, to = '/' }: { title: string; to?: string }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <button className="icon-button" onClick={() => navigate(to)} aria-label="뒤로">
        <Icon name="back" />
      </button>
      <h1>{title}</h1>
    </header>
  );
}

export function Page({ nav, children }: { nav?: boolean; children: ReactNode }) {
  return <main className={nav ? 'page with-nav' : 'page'}>{children}</main>;
}

export interface Today {
  settings: Settings;
  /** 오늘의 화 번호 (파일이 아직 없을 수 있다) */
  number: number;
  episode: Episode | undefined;
  session: Session | undefined;
}

/** 오늘의 화·세션·설정을 불러온다. 학습 화면이 공통으로 쓴다. */
export function useToday(): { today: Today | null; reload: () => Promise<void> } {
  const [today, setToday] = useState<Today | null>(null);
  const reload = useCallback(async () => {
    const [settings, sessions] = await Promise.all([getSettings(), sessionsOn(localDate())]);
    const sessionEpisode = sessions[0] ? episodeById(sessions[0].episodeId) : undefined;
    const sessionNumber = sessionEpisode && episodeOrder(sessionEpisode);
    const number = todayEpisodeNumber(settings, sessionNumber, localDate());
    const episode = episodeByNumber(number);
    const session = sessions.find((s) => s.episodeId === episode?.id);
    setToday({ settings, number, episode, session });
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { today, reload };
}

export function NoEpisode({ number }: { number: number }) {
  return <div className="card empty">{orderLabel(number)}는 아직 준비되지 않았어요.</div>;
}
