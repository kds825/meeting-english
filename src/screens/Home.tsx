import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, NoEpisode, Page, useToday } from '../components';
import { allSessions, allWords, updateSettings } from '../lib/db';
import { episodeAudioUrls, episodeByNumber, episodeOrder } from '../lib/episodes';
import { prefetchAudio } from '../lib/player';
import { dailyQueue, localDate } from '../lib/review';
import { isComplete, stepsDone, streak } from '../lib/session';

const STEPS = [
  { label: '읽기', to: '/reading', minutes: '약 4분' },
  { label: '듣기', to: '/listening', minutes: '약 3분' },
  { label: '역할극', to: '/roleplay', minutes: '약 3분' },
];

export function Home() {
  const navigate = useNavigate();
  const { today, reload } = useToday();
  const [stats, setStats] = useState({ streak: 0, due: 0, total: 0 });

  useEffect(() => {
    void (async () => {
      const [sessions, words] = await Promise.all([allSessions(), allWords()]);
      const date = localDate();
      setStats({
        streak: streak(sessions, date),
        due: dailyQueue(words, date).length,
        total: words.length,
      });
    })();
  }, []);

  // 집에서 홈을 여는 순간 받아 둔다. 차 안에서 처음 운전 모드를 열 때 인터넷이 없어도 재생되도록.
  const episodeId = today?.episode?.id;
  useEffect(() => {
    if (episodeId) void prefetchAudio(episodeAudioUrls(episodeId));
  }, [episodeId]);

  if (!today) return null;
  const { episode, session, number } = today;
  const done = stepsDone(session);
  const complete = isComplete(session);
  const nextEpisode = episodeByNumber(today.settings.nextEpisodeNumber);
  // 이전 순서로 끝낸 날은 세 칸을 모두 끝난 것으로 보여 준다
  const flags = [
    complete || session?.readingDone,
    complete || session?.listeningDone,
    complete || session?.roleplayDone,
  ];
  const nextStep = STEPS[flags.findIndex((f) => !f)] ?? STEPS[0];

  return (
    <Page nav>
      <div className="home-head">
        <div>
          <p className="eyebrow">읽고, 듣고, 말하기</p>
          <h1 className="page-title">{complete ? '오늘 학습을 마쳤어요' : '오늘의 회의 영어'}</h1>
        </div>
        {stats.streak > 0 && (
          <div className="streak">
            <b>{stats.streak}</b>
            <span className="small muted">일 연속</span>
          </div>
        )}
      </div>

      {episode ? (
        <section className="card stack">
          <div>
            <p className="eyebrow">
              The Keynote · 시즌 {episode.season} · {episode.number}화
            </p>
            <h2 className="episode-title">{episode.title}</h2>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={done}
            aria-label="오늘 학습 진행률"
          >
            <span style={{ width: `${(done / 3) * 100}%` }} />
          </div>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.to}>
                <Link to={step.to}>
                  <span className={flags[i] ? 'step-dot done' : 'step-dot'}>
                    {flags[i] ? <Icon name="check" size={14} /> : i + 1}
                  </span>
                  <span className="step-label">{step.label}</span>
                  <span className="small muted">{step.minutes}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link to="/speaking">
                <span className={session?.speakingCompleted != null ? 'step-dot done' : 'step-dot'}>
                  {session?.speakingCompleted != null ? <Icon name="check" size={14} /> : '+'}
                </span>
                <span className="step-label">30초 답변</span>
                <span className="small muted">선택</span>
              </Link>
            </li>
          </ol>
          {complete ? (
            <>
              <p className="notice">{episode.nextTeaserKo}</p>
              {nextEpisode && (
                <button
                  className="button primary"
                  onClick={() =>
                    void updateSettings({
                      activeEpisode: { date: localDate(), number: episodeOrder(nextEpisode) },
                    }).then(reload)
                  }
                >
                  시즌 {nextEpisode.season} {nextEpisode.number}화 이어서 학습
                </button>
              )}
            </>
          ) : (
            <button className="button primary" onClick={() => navigate(nextStep.to)}>
              {done === 0 ? '학습 시작' : `이어서: ${nextStep.label}`}
            </button>
          )}
        </section>
      ) : (
        <NoEpisode number={number} />
      )}

      <Link to="/drive" className="audio-card">
        <span className="audio-play">
          <Icon name="play" />
        </span>
        <span>
          <b>출근길 오디오</b>
          <br />
          <span className="small muted">재생 한 번이면 끝까지 자동으로 들려드려요</span>
        </span>
      </Link>

      <div className="stat-grid">
        <Link to="/review" className="card stat">
          <b>{stats.due}</b>
          <span className="small muted">오늘 복습 단어</span>
        </Link>
        <Link to="/vocab" className="card stat">
          <b>{stats.total}</b>
          <span className="small muted">누적 단어</span>
        </Link>
      </div>
    </Page>
  );
}
