import { openDB, type DBSchema } from 'idb';
import { makeBackup, type Backup } from './backup';
import { episodeOrder } from './episodes';
import { applyReview, localDate, newReview } from './review';
import { advancedNumber, CONTENT_VERSION, migrateSettings, newSession } from './session';
import { slug } from './text';
import type {
  Episode,
  Level,
  ReviewResult,
  Session,
  Settings,
  Word,
  WordCandidate,
} from './types';

interface Schema extends DBSchema {
  words: { key: string; value: Word };
  sessions: { key: [string, string]; value: Session };
  settings: { key: 'settings'; value: Settings };
}

const DEFAULT_SETTINGS: Settings = {
  seriesId: 'the-keynote',
  level: 'lv2',
  nextEpisodeNumber: 1,
  alarmTime: '07:00',
  voice: 'en-US',
  playbackRate: 1.0,
  contentVersion: CONTENT_VERSION,
};

const dbPromise = openDB<Schema>('english-meeting-app', 1, {
  upgrade(db) {
    db.createObjectStore('words', { keyPath: 'id' });
    db.createObjectStore('sessions', { keyPath: ['date', 'episodeId'] });
    db.createObjectStore('settings');
  },
});

export async function getSettings(): Promise<Settings> {
  const db = await dbPromise;
  const stored = await db.get('settings', 'settings');
  if (!stored) return DEFAULT_SETTINGS;
  const migrated = migrateSettings(stored, localDate());
  if (migrated !== stored) await db.put('settings', migrated, 'settings');
  return migrated;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await dbPromise;
  const next = { ...(await getSettings()), ...patch };
  await db.put('settings', next, 'settings');
  return next;
}

export async function allSessions(): Promise<Session[]> {
  return (await dbPromise).getAll('sessions');
}

export async function sessionsOn(date: string): Promise<Session[]> {
  return (await allSessions()).filter((s) => s.date === date);
}

/** 오늘 세션을 만들거나 고치고, 3단계가 끝났으면 연재를 한 화 넘긴다 */
export async function patchTodaySession(
  episode: Episode,
  level: Level,
  patch: Partial<Session>,
): Promise<Session> {
  const db = await dbPromise;
  const date = localDate();
  const current =
    (await db.get('sessions', [date, episode.id])) ??
    newSession({ date, episodeId: episode.id, level });
  const next: Session = { ...current, level, ...patch };
  await db.put('sessions', next);

  const settings = await getSettings();
  const nextEpisodeNumber = advancedNumber(settings, next, episodeOrder(episode));
  if (nextEpisodeNumber !== settings.nextEpisodeNumber) {
    await updateSettings({ nextEpisodeNumber });
  }
  return next;
}

export async function allWords(): Promise<Word[]> {
  const words = await (await dbPromise).getAll('words');
  return words.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function putWord(word: Word): Promise<void> {
  await (await dbPromise).put('words', word);
}

export async function deleteWord(id: string): Promise<void> {
  await (await dbPromise).delete('words', id);
}

async function syncWordsSaved(episode: Episode, level: Level): Promise<void> {
  const today = localDate();
  const saved = (await allWords()).filter(
    (w) => w.sourceEpisodeId === episode.id && w.createdAt.slice(0, 10) === today,
  );
  await patchTodaySession(episode, level, { wordsSaved: saved.length });
}

/**
 * 본문 밑줄을 탭했을 때의 저장/취소. 복습 이력이 쌓인 단어는 실수로 지우지 않도록 그대로 둔다.
 * 반환값은 탭 후 저장 상태.
 */
export async function toggleCandidate(
  episode: Episode,
  level: Level,
  candidate: WordCandidate,
): Promise<boolean> {
  const db = await dbPromise;
  const id = slug(candidate.term);
  const existing = await db.get('words', id);
  if (existing) {
    if (existing.review.history.length > 0) return true;
    await db.delete('words', id);
    await syncWordsSaved(episode, level);
    return false;
  }

  const now = new Date();
  await db.put('words', {
    id,
    term: candidate.term,
    meaningKo: candidate.meaningKo,
    examples: [
      {
        en: candidate.sentence.en,
        ko: candidate.sentence.ko,
        source: 'episode',
        episodeId: episode.id,
      },
    ],
    tags: [],
    sourceEpisodeId: episode.id,
    createdAt: `${localDate(now)}T${now.toTimeString().slice(0, 8)}`,
    review: newReview(localDate(now)),
  });
  await syncWordsSaved(episode, level);
  return true;
}

export async function recordReview(word: Word, result: ReviewResult): Promise<void> {
  await putWord({ ...word, review: applyReview(word.review, result, localDate()) });
}

export async function exportBackup(): Promise<Backup> {
  const [settings, words, sessions] = await Promise.all([getSettings(), allWords(), allSessions()]);
  return makeBackup({ settings, words, sessions }, new Date().toISOString());
}

/** 지금 기록을 백업 내용으로 바꾼다. 한 트랜잭션이라 도중에 실패하면 원래 기록이 남는다 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(['words', 'sessions', 'settings'], 'readwrite');
  const words = tx.objectStore('words');
  const sessions = tx.objectStore('sessions');
  await Promise.all([
    words.clear(),
    sessions.clear(),
    ...backup.words.map((word) => words.put(word)),
    ...backup.sessions.map((session) => sessions.put(session)),
    tx.objectStore('settings').put(backup.settings, 'settings'),
    tx.done,
  ]);
}
