import type { Session, Settings, Word } from './types';

const FORMAT = 'english-meeting-app-backup';
const VERSION = 1;

export interface Backup {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings;
  words: Word[];
  sessions: Session[];
}

export function makeBackup(
  data: { settings: Settings; words: Word[]; sessions: Session[] },
  exportedAt: string,
): Backup {
  return { format: FORMAT, version: VERSION, exportedAt, ...data };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isWord(value: unknown): value is Word {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.term === 'string' &&
    Array.isArray(value.examples) &&
    isObject(value.review)
  );
}

function isSession(value: unknown): value is Session {
  return isObject(value) && typeof value.date === 'string' && typeof value.episodeId === 'string';
}

/** 가져오기는 지금 기록을 지우고 덮어쓰므로, 지우기 전에 파일 전체를 검사한다. 문제가 있으면 한국어 메시지로 던진다 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('백업 파일을 읽을 수 없어요. JSON 형식이 아닙니다.');
  }
  if (!isObject(data) || data.format !== FORMAT) {
    throw new Error('이 앱에서 내보낸 백업 파일이 아니에요.');
  }
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new Error('더 새로운 버전의 백업 파일이에요. 앱을 새로고침한 뒤 다시 시도해 주세요.');
  }
  if (
    !isObject(data.settings) ||
    typeof data.settings.nextEpisodeNumber !== 'number' ||
    !Array.isArray(data.words) ||
    !data.words.every(isWord) ||
    !Array.isArray(data.sessions) ||
    !data.sessions.every(isSession)
  ) {
    throw new Error('백업 파일 내용이 손상되어 가져오지 않았어요. 지금 기록은 그대로입니다.');
  }
  return data as unknown as Backup;
}
