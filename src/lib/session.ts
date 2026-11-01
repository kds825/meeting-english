import { addDays } from './review';
import type { Session, Settings } from './types';

export function newSession(partial: Pick<Session, 'date' | 'episodeId' | 'level'>): Session {
  return {
    ...partial,
    listeningDone: false,
    roleplayDone: false,
    readingDone: false,
    quizCorrect: 0,
    wordsSaved: 0,
    vocabDone: false,
    speakingCompleted: null,
  };
}

export const CONTENT_VERSION = 2;

/**
 * 화를 둘로 나누기 전의 진도를 새 번호로 옮긴다. 옛 N화 → 새 2N-1화.
 * 오늘 기록은 옛 번호를 가리키므로 오늘의 현재 화를 새 번호로 고정한다.
 */
export function migrateSettings(settings: Settings, today: string): Settings {
  if ((settings.contentVersion ?? 1) >= CONTENT_VERSION) return settings;
  const nextEpisodeNumber = settings.nextEpisodeNumber * 2 - 1;
  return {
    ...settings,
    nextEpisodeNumber,
    activeEpisode: { date: today, number: nextEpisodeNumber },
    contentVersion: CONTENT_VERSION,
  };
}

/** 이전 순서(리딩·단어장·스피킹)로 끝낸 기록. 그때의 연속 학습일과 진도를 잃지 않기 위해 인정한다 */
function completedInOldOrder(session: Session): boolean {
  return session.readingDone && session.vocabDone && session.speakingCompleted !== null;
}

/** 3단계(읽기·듣기·역할극)를 모두 끝냈거나 넘겼는가. 단어장과 30초 답변은 선택이다 */
export function isComplete(session: Session | undefined): boolean {
  if (!session) return false;
  return (
    Boolean(session.listeningDone && session.roleplayDone && session.readingDone) ||
    completedInOldOrder(session)
  );
}

export function stepsDone(session: Session | undefined): number {
  if (!session) return 0;
  if (isComplete(session)) return 3;
  return (
    Number(Boolean(session.listeningDone)) +
    Number(Boolean(session.roleplayDone)) +
    Number(session.readingDone)
  );
}

/**
 * 오늘의 화 번호. 연재는 날짜가 아니라 순서로 진행하되, 학습을 마친 날에는 출근길 오디오와
 * 홈이 방금 공부한 화를 계속 가리켜야 하므로 오늘 세션이 있으면 그 화를 쓴다.
 */
export function todayEpisodeNumber(
  settings: Settings,
  todaySessionEpisodeNumber: number | undefined,
): number {
  return todaySessionEpisodeNumber ?? settings.nextEpisodeNumber;
}

/** 3단계를 마친 시점에 연재를 한 화 넘긴다. 지난 화 다시 보기로는 넘어가지 않는다. */
export function advancedNumber(
  settings: Settings,
  session: Session,
  episodeNumber: number,
): number {
  return isComplete(session) && episodeNumber === settings.nextEpisodeNumber
    ? settings.nextEpisodeNumber + 1
    : settings.nextEpisodeNumber;
}

/** 연속 학습일. 오늘 아직 안 했어도 어제까지 이어졌으면 끊기지 않는다. */
export function streak(sessions: Session[], today: string): number {
  const completed = new Set(sessions.filter(isComplete).map((s) => s.date));
  let cursor = completed.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (completed.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}
