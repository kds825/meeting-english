import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, NoEpisode, Page, TopBar, useToday } from '../components';
import { patchTodaySession, updateSettings } from '../lib/db';
import { audioUrl, manifestFor, resolveLevel } from '../lib/episodes';
import { player } from '../lib/player';
import type { Episode, Level, Settings } from '../lib/types';

const RATES: Settings['playbackRate'][] = [0.8, 1.0, 1.2];
const REWIND_SECONDS = 10;

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function ListenPlayer({
  url,
  initialRate,
  onEnded,
}: {
  url: string;
  initialRate: Settings['playbackRate'];
  onEnded: () => void;
}) {
  const [audio] = useState(() => new Audio());
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(initialRate);

  useEffect(() => {
    // 운전 모드 오디오가 재생 중이면 겹치지 않게 멈춘다
    player.pause();
    const syncTime = () => setTime(audio.currentTime);
    const syncDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.playbackRate = rate;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const finish = () => {
      setPlaying(false);
      onEnded();
    };
    audio.addEventListener('timeupdate', syncTime);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', finish);
    audio.src = url;
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', syncTime);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', finish);
    };
    // 재생 속도 변경은 아래 changeRate가 처리하므로 다시 불러오지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, url]);

  const changeRate = (next: Settings['playbackRate']) => {
    audio.playbackRate = next;
    setRate(next);
    void updateSettings({ playbackRate: next });
  };

  return (
    <section className="card stack">
      <div className="listen-controls">
        <button
          className="text-button"
          aria-label={`${REWIND_SECONDS}초 뒤로`}
          onClick={() => {
            audio.currentTime = Math.max(0, audio.currentTime - REWIND_SECONDS);
          }}
        >
          −{REWIND_SECONDS}초
        </button>
        <button
          className="listen-play"
          aria-label={playing ? '일시정지' : '재생'}
          onClick={() => (playing ? audio.pause() : void audio.play().catch(() => undefined))}
        >
          <Icon name={playing ? 'pause' : 'play'} size={36} />
        </button>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: duration ? `${(time / duration) * 100}%` : 0 }} />
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>
        {clock(time)} / {clock(duration)}
      </p>
      <div className="level-switch" role="group" aria-label="재생 속도">
        {RATES.map((r) => (
          <button key={r} className="chip" aria-pressed={rate === r} onClick={() => changeRate(r)}>
            {r.toFixed(1)}배
          </button>
        ))}
      </div>
    </section>
  );
}

function ListeningBody({ episode, level, settings }: { episode: Episode; level: Level; settings: Settings }) {
  const navigate = useNavigate();
  const [ended, setEnded] = useState(false);
  const file = manifestFor(episode.id)?.narration[level];
  const url = file ? audioUrl(episode.id, file) : undefined;

  const finish = async () => {
    await patchTodaySession(episode, level, { listeningDone: true });
    navigate('/roleplay');
  };

  return (
    <>
      <h2 className="page-title">글자 없이 들어 보세요</h2>
      <p className="muted">방금 읽은 내용이에요. 다 못 알아들어도 괜찮으니 흐름만 따라가 보세요.</p>
      {url ? (
        <ListenPlayer url={url} initialRate={settings.playbackRate} onEnded={() => setEnded(true)} />
      ) : (
        <div className="card empty">이 화의 음성 파일이 아직 없어요.</div>
      )}
      <button className={ended ? 'button primary' : 'button'} onClick={() => void finish()}>
        {ended ? '다 들었어요 · 역할극으로' : '듣기 넘어가기 · 역할극으로'}
      </button>
    </>
  );
}

export function Listening() {
  const { today } = useToday();
  if (!today) return null;
  const { episode, settings, number } = today;
  return (
    <Page>
      <TopBar title={episode ? `${episode.number}화 듣기` : '듣기'} />
      {episode ? (
        <ListeningBody episode={episode} level={resolveLevel(episode, settings.level)} settings={settings} />
      ) : (
        <NoEpisode number={number} />
      )}
    </Page>
  );
}
