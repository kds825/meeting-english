import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Page, useToday } from '../components';
import { allSessions, allWords, selectEpisode } from '../lib/db';
import { allEpisodes, episodeById, episodeOrder } from '../lib/episodes';
import {
  dayStates,
  episodeProgress,
  monthGrid,
  recentSessions,
  recordSummary,
  shiftMonth,
  type EpisodeProgress,
} from '../lib/records';
import { localDate } from '../lib/review';
import { isComplete } from '../lib/session';
import type { Session } from '../lib/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const RECENT_LIMIT = 7;

/** 한 일만 보여 준다. 안 한 단계를 표시해 밀린 느낌을 주지 않는다 */
function doneSteps(progress: Pick<EpisodeProgress, 'reading' | 'listening' | 'roleplay' | 'speaking'>) {
  return [
    progress.reading && '읽기',
    progress.listening && '듣기',
    progress.roleplay && '역할극',
    progress.speaking && '30초 답변',
  ].filter((step): step is string => Boolean(step));
}

function sessionSteps(session: Session): string[] {
  const complete = isComplete(session);
  const steps = doneSteps({
    reading: session.readingDone || complete,
    listening: Boolean(session.listeningDone) || complete,
    roleplay: Boolean(session.roleplayDone) || complete,
    speaking: session.speakingCompleted !== null,
  });
  if (session.wordsSaved > 0) steps.push(`단어 ${session.wordsSaved}개`);
  return steps;
}

function Calendar({ sessions }: { sessions: Session[] }) {
  const today = localDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const states = useMemo(() => dayStates(sessions), [sessions]);
  const { blanks, days } = monthGrid(month);
  const [year, monthNumber] = month.split('-').map(Number);

  return (
    <section className="card">
      <div className="row between">
        <button className="icon-button" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="back" />
        </button>
        <h2 className="calendar-title">
          {year}년 {monthNumber}월
        </h2>
        <button
          className="icon-button"
          aria-label="다음 달"
          disabled={month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div className="calendar" role="grid" aria-label="월간 학습 달력">
        {WEEKDAYS.map((day) => (
          <span key={day} className="calendar-weekday">
            {day}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((date, i) => {
          const state = states.get(date);
          const label = state === 'complete' ? '한 화를 마침' : state === 'active' ? '학습함' : '';
          return (
            <span
              key={date}
              className={`calendar-day ${state ?? ''} ${date === today ? 'today' : ''}`}
              aria-label={label ? `${i + 1}일 ${label}` : `${i + 1}일`}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <p className="small muted calendar-legend">
        <span className="calendar-key complete" /> 한 화를 마침
        <span className="calendar-key active" /> 학습함
      </p>
    </section>
  );
}

export function Records() {
  const navigate = useNavigate();
  const { today } = useToday();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    void allSessions().then(setSessions);
    void allWords().then((words) => setWordCount(words.length));
  }, []);

  const episodes = allEpisodes();
  const progress = useMemo(() => episodeProgress(sessions), [sessions]);
  const summary = useMemo(() => recordSummary(sessions), [sessions]);
  const recent = useMemo(() => recentSessions(sessions, RECENT_LIMIT), [sessions]);
  const seasons = [...new Set(episodes.map((e) => e.season))];

  if (!today) return null;
  const currentSeason = season ?? today.episode?.season ?? seasons[0];

  const choose = async (order: number) => {
    await selectEpisode(order);
    navigate('/');
  };

  return (
    <Page nav>
      <h1 className="page-title">기록</h1>

      <div className="record-grid">
        <div className="card stat">
          <b>
            {summary.completedEpisodes}
            <span className="stat-total"> / {episodes.length}</span>
          </b>
          <span className="small muted">마친 화</span>
        </div>
        <div className="card stat">
          <b>{summary.studyDays}</b>
          <span className="small muted">학습한 날</span>
        </div>
        <div className="card stat">
          <b>{wordCount}</b>
          <span className="small muted">저장한 단어</span>
        </div>
        <div className="card stat">
          <b>{summary.speakingAnswers}</b>
          <span className="small muted">끝까지 한 30초 답변</span>
        </div>
      </div>

      <Calendar sessions={sessions} />

      <section className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          최근 학습
        </h2>
        {recent.length === 0 ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            아직 기록이 없어요. 학습을 시작하면 여기에 쌓여요.
          </p>
        ) : (
          <ul className="record-list">
            {recent.map((session) => {
              const episode = episodeById(session.episodeId);
              return (
                <li key={`${session.date}-${session.episodeId}`}>
                  <span className="small muted">{session.date.slice(5).replace('-', '/')}</span>
                  <span>
                    {episode ? `시즌 ${episode.season} ${episode.number}화 ${episode.title}` : session.episodeId}
                    <br />
                    <span className="small muted">{sessionSteps(session).join(' · ')}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">화 고르기</h2>
        <div className="level-switch" role="group" aria-label="시즌">
          {seasons.map((s) => (
            <button key={s} className="chip" aria-pressed={s === currentSeason} onClick={() => setSeason(s)}>
              시즌 {s}
            </button>
          ))}
        </div>
        <ol className="episode-list card">
          {episodes
            .filter((episode) => episode.season === currentSeason)
            .map((episode) => {
              const done = progress.get(episode.id);
              const isCurrent = episode.id === today.episode?.id;
              return (
                <li key={episode.id}>
                  <button
                    className="episode-row"
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => void choose(episodeOrder(episode))}
                  >
                    <span className="episode-number">{episode.number}</span>
                    <span className="episode-row-main">
                      <span lang="en">{episode.title}</span>
                      {done && <span className="small muted">{doneSteps(done).join(' · ')}</span>}
                    </span>
                    {isCurrent && <span className="tag">학습 중</span>}
                    {done?.complete && (
                      <span className="step-dot done" aria-label="마침">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        </ol>
      </section>
    </Page>
  );
}
