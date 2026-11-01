import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup } from './backup';
import type { Session, Settings, Word } from './types';

const settings: Settings = {
  seriesId: 'the-keynote',
  level: 'lv2',
  nextEpisodeNumber: 12,
  alarmTime: '07:00',
  voice: 'en-US',
  playbackRate: 1.0,
  contentVersion: 2,
};
const word: Word = {
  id: 'scope',
  term: 'scope',
  meaningKo: '범위',
  examples: [{ en: 'Check the scope.', ko: '범위를 확인하세요.', source: 'user' }],
  tags: [],
  createdAt: '2026-11-01T08:00:00',
  review: { stage: 1, nextReviewDate: '2026-11-02', graduated: false, history: [] },
};
const session: Session = {
  date: '2026-11-01',
  episodeId: 'keynote-s1-e11',
  level: 'lv2',
  readingDone: true,
  quizCorrect: 2,
  wordsSaved: 1,
  vocabDone: false,
  speakingCompleted: null,
};
const backup = makeBackup({ settings, words: [word], sessions: [session] }, '2026-11-01T08:00:00Z');

describe('parseBackup', () => {
  it('내보낸 내용을 그대로 되돌린다', () => {
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('JSON이 아니면 거절한다', () => {
    expect(() => parseBackup('not json')).toThrow('JSON');
  });

  it('다른 앱의 파일은 거절한다', () => {
    expect(() => parseBackup(JSON.stringify({ words: [] }))).toThrow('백업 파일이 아니');
  });

  it('더 새로운 버전은 거절한다', () => {
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow('새로운 버전');
  });

  it('단어 하나라도 형식이 틀리면 전체를 거절한다', () => {
    const broken = { ...backup, words: [word, { id: 'x' }] };
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('손상');
  });

  it('기록이 배열이 아니면 거절한다', () => {
    expect(() => parseBackup(JSON.stringify({ ...backup, sessions: {} }))).toThrow('손상');
  });

  it('진도가 없는 설정은 거절한다', () => {
    expect(() => parseBackup(JSON.stringify({ ...backup, settings: {} }))).toThrow('손상');
  });
});
