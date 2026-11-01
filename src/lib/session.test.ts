import { describe, expect, it } from 'vitest';
import {
  advancedNumber,
  CONTENT_VERSION,
  isComplete,
  migrateSettings,
  newSession,
  stepsDone,
  streak,
} from './session';
import type { Session, Settings } from './types';

const settings: Settings = {
  seriesId: 'the-keynote',
  level: 'lv2',
  nextEpisodeNumber: 3,
  alarmTime: '07:00',
  voice: 'en-US',
  playbackRate: 1.0,
};
const done = (date: string): Session => ({
  ...newSession({ date, episodeId: 'e', level: 'lv2' }),
  listeningDone: true,
  roleplayDone: true,
  readingDone: true,
});
/** 이전 앱 버전이 저장한 기록: 듣기·역할극 필드가 없다 */
const oldRecord = (date: string): Session => ({
  date,
  episodeId: 'e',
  level: 'lv2',
  readingDone: true,
  quizCorrect: 2,
  wordsSaved: 0,
  vocabDone: true,
  speakingCompleted: false,
});

describe('진행', () => {
  it('듣기·역할극·읽기를 끝내면 완료이고, 단어장과 30초 답변은 필요 없다', () => {
    expect(isComplete(done('2026-11-02'))).toBe(true);
    expect(stepsDone(done('2026-11-02'))).toBe(3);
    expect(stepsDone(newSession({ date: 'd', episodeId: 'e', level: 'lv2' }))).toBe(0);
  });

  it('한 단계라도 남으면 완료가 아니고, 어떤 순서로 해도 센다', () => {
    const partial = { ...done('d'), listeningDone: false };
    expect(isComplete(partial)).toBe(false);
    expect(stepsDone(partial)).toBe(2);
  });

  it('이전 순서로 끝낸 기록도 완료로 인정한다', () => {
    expect(isComplete(oldRecord('d'))).toBe(true);
    expect(stepsDone(oldRecord('d'))).toBe(3);
    expect(isComplete({ ...oldRecord('d'), vocabDone: false })).toBe(false);
  });

  it('현재 화를 마치면 한 화 넘어가고, 지난 화나 미완료는 넘어가지 않는다', () => {
    expect(advancedNumber(settings, done('d'), 3)).toBe(4);
    expect(advancedNumber(settings, done('d'), 2)).toBe(3);
    expect(advancedNumber(settings, { ...done('d'), roleplayDone: false }, 3)).toBe(3);
  });
});

describe('화 분할 이전 진도 옮기기', () => {
  it('옛 N화는 새 2N-1화가 되고 오늘의 현재 화로 고정된다', () => {
    const moved = migrateSettings({ ...settings, nextEpisodeNumber: 5 }, '2026-11-02');
    expect(moved.nextEpisodeNumber).toBe(9);
    expect(moved.activeEpisode).toEqual({ date: '2026-11-02', number: 9 });
    expect(moved.contentVersion).toBe(CONTENT_VERSION);
  });

  it('시즌 2 순번도 그대로 옮겨진다 (옛 21 → 새 41 = 시즌 2의 1화)', () => {
    expect(migrateSettings({ ...settings, nextEpisodeNumber: 21 }, 'd').nextEpisodeNumber).toBe(41);
  });

  it('한 번 옮긴 진도는 다시 옮기지 않는다', () => {
    const once = migrateSettings(settings, 'd');
    expect(migrateSettings(once, 'd')).toBe(once);
  });
});

describe('streak', () => {
  it('오늘 미완료면 어제부터 세고, 빠진 날에서 끊는다', () => {
    const sessions = [done('2026-11-01'), done('2026-10-31'), done('2026-10-29')];
    expect(streak(sessions, '2026-11-02')).toBe(2);
    expect(streak([...sessions, done('2026-11-02')], '2026-11-02')).toBe(3);
    expect(streak(sessions, '2026-11-03')).toBe(0);
  });

  it('이전 기록과 새 기록이 섞여도 이어진다', () => {
    expect(streak([done('2026-11-01'), oldRecord('2026-10-31')], '2026-11-01')).toBe(2);
  });
});
