import { describe, expect, it } from 'vitest';
import {
  dayStates,
  episodeProgress,
  monthGrid,
  recentSessions,
  recordSummary,
  shiftMonth,
} from './records';
import { newSession } from './session';
import type { Session } from './types';

const session = (date: string, episodeId: string, patch: Partial<Session> = {}): Session => ({
  ...newSession({ date, episodeId, level: 'lv2' }),
  ...patch,
});
const finished = { readingDone: true, listeningDone: true, roleplayDone: true };

describe('episodeProgress', () => {
  it('아무것도 하지 않은 세션은 세지 않는다', () => {
    expect(episodeProgress([session('2026-11-01', 'a')]).size).toBe(0);
  });

  it('날짜가 달라도 한 화의 단계를 합치고, 세 단계를 다 했으면 마친 화다', () => {
    const progress = episodeProgress([
      session('2026-11-01', 'a', { readingDone: true }),
      session('2026-11-02', 'a', { listeningDone: true }),
      session('2026-11-03', 'a', { roleplayDone: true }),
    ]).get('a');
    expect(progress).toMatchObject({ reading: true, listening: true, roleplay: true, complete: true });
    expect(progress?.lastDate).toBe('2026-11-03');
  });

  it('최신 날짜는 입력 순서와 상관없다', () => {
    const progress = episodeProgress([
      session('2026-11-03', 'a', { readingDone: true }),
      session('2026-11-01', 'a', { listeningDone: true }),
    ]).get('a');
    expect(progress?.lastDate).toBe('2026-11-03');
    expect(progress?.complete).toBe(false);
  });

  it('이전 순서로 끝낸 기록은 세 단계를 모두 한 것으로 본다', () => {
    const old = session('2026-10-01', 'a', { readingDone: true, vocabDone: true, speakingCompleted: false });
    expect(episodeProgress([old]).get('a')).toMatchObject({ listening: true, roleplay: true, complete: true });
  });
});

describe('recordSummary', () => {
  it('마친 화·학습한 날·30초 답변을 센다', () => {
    expect(
      recordSummary([
        session('2026-11-01', 'a', finished),
        session('2026-11-01', 'b', { readingDone: true, speakingCompleted: true }),
        session('2026-11-02', 'c', { speakingCompleted: false }),
        session('2026-11-03', 'd'),
      ]),
    ).toEqual({ completedEpisodes: 1, studyDays: 2, speakingAnswers: 1 });
  });
});

describe('recentSessions', () => {
  it('활동이 있는 기록만 최신순으로 자른다', () => {
    const recent = recentSessions(
      [
        session('2026-11-01', 'a', { readingDone: true }),
        session('2026-11-03', 'b', { wordsSaved: 1 }),
        session('2026-11-04', 'c'),
        session('2026-11-02', 'd', { readingDone: true }),
      ],
      2,
    );
    expect(recent.map((s) => s.episodeId)).toEqual(['b', 'd']);
  });
});

describe('달력', () => {
  it('2026년 11월은 일요일에 시작하고 30일이다', () => {
    const grid = monthGrid('2026-11');
    expect(grid.blanks).toBe(0);
    expect(grid.days).toHaveLength(30);
    expect(grid.days[0]).toBe('2026-11-01');
  });

  it('윤년 2월과 첫 칸 위치', () => {
    const grid = monthGrid('2028-02');
    expect(grid.days).toHaveLength(29);
    expect(grid.blanks).toBe(2);
  });

  it('연도를 넘겨 이동한다', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('그날 한 화라도 마쳤으면 완료로 표시하고 순서는 상관없다', () => {
    const states = dayStates([
      session('2026-11-01', 'a', finished),
      session('2026-11-01', 'b', { readingDone: true }),
      session('2026-11-02', 'c', { readingDone: true }),
      session('2026-11-03', 'd'),
    ]);
    expect(states.get('2026-11-01')).toBe('complete');
    expect(states.get('2026-11-02')).toBe('active');
    expect(states.has('2026-11-03')).toBe(false);
  });
});
