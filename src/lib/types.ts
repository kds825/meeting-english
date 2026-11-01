export type Level = 'lv1' | 'lv2' | 'lv3';
export const LEVELS: Level[] = ['lv1', 'lv2', 'lv3'];

export interface WordCandidate {
  term: string;
  surface: string;
  meaningKo: string;
  paragraph: number;
  /** surface가 들어 있는 본문 문장과 그 문장만의 해석. 단어장 1번 예문이 된다 */
  sentence: { en: string; ko: string };
}

export interface EpisodeLevel {
  wordCount: number;
  paragraphs: { en: string; ko: string }[];
  keyExpressionMarks: string[];
  wordCandidates: WordCandidate[];
}

export interface Episode {
  id: string;
  series: string;
  season: number;
  number: number;
  title: string;
  recapKo: string | null;
  keyExpressions: { phrase: string; meaningKo: string; usage: string }[];
  levels: Partial<Record<Level, EpisodeLevel>>;
  quiz: { question: string; options: string[]; answerIndex: number; evidence: string }[];
  speaking: {
    readAloud: string[];
    summaryPromptKo: string;
    question: { speaker: string; en: string; ko: string };
    modelAnswer: string;
  };
  nextTeaserKo: string;
  /** 내가 재원이 되어 말하는 장면 */
  roleplay: Roleplay;
}

export interface RoleplayLine {
  speaker: string;
  voice: 'female' | 'male';
  en: string;
  ko: string;
  /** 사용자가 말할 차례 */
  you?: boolean;
}

export interface Roleplay {
  title: string;
  situationKo: string;
  lines: RoleplayLine[];
}

export type ReviewResult = 'knew' | 'hard' | 'forgot';
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewState {
  stage: Stage;
  /** YYYY-MM-DD. 빈 문자열이면 더 이상 복습 일정이 없다 (졸업 후 재확인 완료) */
  nextReviewDate: string;
  graduated: boolean;
  /** 졸업 후 마친 재확인 횟수 (0~2) */
  rechecksDone?: number;
  history: { date: string; result: ReviewResult }[];
}

export type WordTag = 'vendor' | 'client' | 'internal' | 'conference';
export const WORD_TAGS: { id: WordTag; label: string }[] = [
  { id: 'vendor', label: '협력사' },
  { id: 'client', label: '고객' },
  { id: 'internal', label: '내부' },
  { id: 'conference', label: '컨퍼런스' },
];

export interface WordExample {
  en: string;
  ko: string;
  source: 'episode' | 'generated' | 'user';
  episodeId?: string;
}

export interface Word {
  id: string;
  term: string;
  meaningKo: string;
  pos?: string;
  examples: WordExample[];
  tags: WordTag[];
  sourceEpisodeId?: string;
  createdAt: string;
  review: ReviewState;
}

export interface Session {
  date: string;
  episodeId: string;
  level: Level;
  /** 1단계 읽기 */
  readingDone: boolean;
  /** 2단계 듣기를 끝냈거나 넘겼는지 (이전 기록에는 없다) */
  listeningDone?: boolean;
  /** 3단계 역할극을 끝냈거나 넘겼는지 (이전 기록에는 없다) */
  roleplayDone?: boolean;
  quizCorrect: number;
  wordsSaved: number;
  /** 이전 학습 순서의 단어장 단계. 지난 기록을 판정할 때만 쓴다 */
  vocabDone: boolean;
  /** 선택 활동인 30초 답변의 자가 체크 */
  speakingCompleted: boolean | null;
  dictationAccuracy?: number;
}

export interface Settings {
  seriesId: string;
  level: Level;
  nextEpisodeNumber: number;
  alarmTime: string;
  voice: 'en-US';
  playbackRate: 0.8 | 1.0 | 1.2;
  /** 그날 한 화를 마치고 다음 화를 이어서 공부할 때의 현재 화 */
  activeEpisode?: { date: string; number: number };
  /** 직접 고른 화. 날이 바뀌어도 그 화를 마칠 때까지 현재 화로 둔다 */
  pinnedEpisode?: number;
  /** 2부터 화 하나를 둘로 나눈 번호 체계 (시즌당 40화) */
  contentVersion?: number;
}
