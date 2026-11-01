import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, useToday } from '../components';
import { allWords, updateSettings } from '../lib/db';
import { audioUrl, manifestFor, orderLabel, resolveLevel, wordClipUrl } from '../lib/episodes';
import { player, prefetchAudio, type Section, type Track } from '../lib/player';
import { dailyQueue, localDate } from '../lib/review';
import type { Episode, Level, Settings, Word } from '../lib/types';

const RATES: Settings['playbackRate'][] = [0.8, 1.0, 1.2];

/** 구간 4개: 오늘 화 낭독·오늘 단어·복습 단어·한→영 즉답. 파일이 없는 구간은 건너뛴다. */
function buildPlaylist(episode: Episode, level: Level, dueWords: Word[]) {
  const manifest = manifestFor(episode.id);
  if (!manifest) return null;
  const sections: (Section & { urls: string[] })[] = [
    { id: 'narration', title: '오늘 화 낭독', urls: [manifest.narration[level]] },
    { id: 'words', title: '오늘 단어', urls: [manifest.words[level]] },
    { id: 'review', title: '복습 단어', urls: [] },
    { id: 'recall', title: '한→영 즉답', urls: [manifest.recall] },
  ].map((section) => ({
    ...section,
    urls: section.urls
      .map((file) => (file ? audioUrl(episode.id, file) : undefined))
      .filter((url): url is string => Boolean(url)),
  }));
  sections[2].urls = dueWords
    .map((word) => wordClipUrl(word.sourceEpisodeId, word.term))
    .filter((url): url is string => Boolean(url));

  const tracks: Track[] = sections.flatMap((section, index) =>
    section.urls.map((url) => ({ url, section: index })),
  );
  return { sections, tracks };
}

function DrivePlayer({ episode, settings }: { episode: Episode; settings: Settings }) {
  const state = useSyncExternalStore(player.subscribe, player.getState);
  const [words, setWords] = useState<Word[] | null>(null);
  const level = resolveLevel(episode, settings.level);

  useEffect(() => {
    void allWords().then((all) => setWords(dailyQueue(all, localDate())));
  }, []);

  const playlist = useMemo(
    () => (words ? buildPlaylist(episode, level, words) : null),
    [episode, level, words],
  );

  useEffect(() => {
    if (!playlist) return;
    player.load({
      key: `${localDate()}|${episode.id}|${level}`,
      label: `The Keynote 시즌 ${episode.season} ${episode.number}화 · ${episode.title}`,
      artwork: new URL('./icon-512.png', window.location.href).href,
      sections: playlist.sections,
      tracks: playlist.tracks,
      rate: settings.playbackRate,
    });
    void prefetchAudio(playlist.tracks.map((t) => t.url));
  }, [playlist, episode, level, settings.playbackRate]);

  if (!words) return null;
  if (!playlist || playlist.tracks.length === 0) {
    return <p className="drive-now muted">이 화의 음성 파일이 아직 없어요.</p>;
  }

  const isPlaying = state.status === 'playing';
  const progress = state.duration ? (state.currentTime / state.duration) * 100 : 0;
  const changeRate = (rate: Settings['playbackRate']) => {
    player.setRate(rate);
    void updateSettings({ playbackRate: rate });
  };

  return (
    <>
      <div className="drive-now">
        <div>
          <p className="muted">
            {episode.number}화 {episode.title}
          </p>
          <h2 className="drive-section-title">
            {state.status === 'finished' ? '오늘 오디오 끝' : playlist.sections[state.section].title}
          </h2>
        </div>
        <div className="drive-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="drive-controls">
          <button className="drive-skip" aria-label="이전 구간" onClick={() => player.previousSection()}>
            <Icon name="previous" size={28} />
          </button>
          <button
            className="drive-play"
            aria-label={isPlaying ? '일시정지' : '재생'}
            onClick={() => player.toggle()}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={56} />
          </button>
          <button className="drive-skip" aria-label="다음 구간" onClick={() => player.nextSection()}>
            <Icon name="next" size={28} />
          </button>
        </div>
        {state.error && (
          <p className="small muted" role="status">
            {state.error}
          </p>
        )}
      </div>

      <div className="rate-switch" role="group" aria-label="재생 속도">
        {RATES.map((rate) => (
          <button key={rate} aria-pressed={state.rate === rate} onClick={() => changeRate(rate)}>
            {rate.toFixed(1)}배
          </button>
        ))}
      </div>

      <div className="section-list">
        {playlist.sections.map((section, index) => (
          <button
            key={section.id}
            aria-current={state.status !== 'finished' && state.section === index}
            disabled={section.urls.length === 0}
            onClick={() => player.playSection(index)}
          >
            {index + 1}. {section.title}
            {section.id === 'review' && ` (${section.urls.length}개)`}
          </button>
        ))}
      </div>
    </>
  );
}

export function Drive() {
  const navigate = useNavigate();
  const { today } = useToday();
  return (
    <main className="drive">
      <div className="drive-inner">
        <header className="topbar">
          <button className="icon-button" aria-label="나가기" onClick={() => navigate('/')}>
            <Icon name="back" />
          </button>
          <h1>운전 모드</h1>
        </header>
        {today &&
          (today.episode ? (
            <DrivePlayer episode={today.episode} settings={today.settings} />
          ) : (
            <p className="drive-now muted">{orderLabel(today.number)}는 아직 준비되지 않았어요.</p>
          ))}
      </div>
    </main>
  );
}
