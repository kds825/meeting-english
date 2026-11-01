import { isComplete } from './session';
import type { Session } from './types';

/** 한 화에서 지금까지 한 일. 날짜가 달라도 합쳐서 본다 */
export interface EpisodeProgress {
  reading: boolean;
  listening: boolean;
  roleplay: boolean;
  speaking: boolean;
  complete: boolean;
  lastDate: string;
}

export function sessionHasActivity(session: Session): boolean {
  return (
    session.readingDone ||
    Boolean(session.listeningDone) ||
    Boolean(session.roleplayDone) ||
    session.speakingCompleted !== null ||
    session.wordsSaved > 0 ||
    isComplete(session)
  );
}

export function episodeProgress(sessions: Session[]): Map<string, EpisodeProgress> {
  const result = new Map<string, EpisodeProgress>();
  for (const session of sessions) {
    if (!sessionHasActivity(session)) continue;
    const complete = isComplete(session);
    const current = result.get(session.episodeId);
    const merged: EpisodeProgress = {
      // 이전 순서로 끝낸 기록에는 듣기·역할극 값이 없으므로 완료면 모두 한 것으로 본다
      reading: Boolean(current?.reading) || session.readingDone || complete,
      listening: Boolean(current?.listening) || Boolean(session.listeningDone) || complete,
      roleplay: Boolean(current?.roleplay) || Boolean(session.roleplayDone) || complete,
      speaking: Boolean(current?.speaking) || session.speakingCompleted !== null,
      complete: Boolean(current?.complete) || complete,
      lastDate: current && current.lastDate > session.date ? current.lastDate : session.date,
    };
    // 하루에 끝내지 않아도 세 단계를 모두 했으면 마친 화다
    merged.complete ||= merged.reading && merged.listening && merged.roleplay;
    result.set(session.episodeId, merged);
  }
  return result;
}

export interface RecordSummary {
  completedEpisodes: number;
  studyDays: number;
  speakingAnswers: number;
}

export function recordSummary(sessions: Session[]): RecordSummary {
  const active = sessions.filter(sessionHasActivity);
  return {
    completedEpisodes: [...episodeProgress(sessions).values()].filter((p) => p.complete).length,
    studyDays: new Set(active.map((s) => s.date)).size,
    speakingAnswers: sessions.filter((s) => s.speakingCompleted === true).length,
  };
}

/** 최근 학습 기록. 최신 날짜부터 */
export function recentSessions(sessions: Session[], limit: number): Session[] {
  return sessions
    .filter(sessionHasActivity)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** 달력에 표시할 날짜별 상태. 그날 한 화라도 마쳤으면 'complete' */
export function dayStates(sessions: Session[]): Map<string, 'active' | 'complete'> {
  const states = new Map<string, 'active' | 'complete'>();
  for (const session of sessions.filter(sessionHasActivity)) {
    if (isComplete(session)) states.set(session.date, 'complete');
    else if (!states.has(session.date)) states.set(session.date, 'active');
  }
  return states;
}

/** "YYYY-MM"의 달력. blanks는 1일 앞의 빈칸 수 (일요일 시작) */
export function monthGrid(month: string): { blanks: number; days: string[] } {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return {
    blanks: new Date(Date.UTC(year, m - 1, 1)).getUTCDay(),
    days: Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  };
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
