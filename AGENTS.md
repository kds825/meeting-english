# 회의 영어 학습 앱 — 개발 규칙

개인용 영어 학습 PWA. 아침 15분(리딩 → 단어장 → 스피킹) + 운전 출퇴근 오디오 + 틈새 단어 복습.
사용자는 1명(본인)이며, 목표는 영어 회의·발표·질의응답 실력 향상이다.

## 절대 원칙

1. **매일 쓰는 기능에는 LLM을 호출하지 않는다.** 리딩·단어장·스피킹·복습·오디오는 모두 미리 생성된 콘텐츠 파일과 규칙 기반 로직으로 동작한다. LLM(Codex API)은 4주차 이후 "AI 회의 롤플레이" 기능에서만 쓴다.
2. **운전 중 화면 조작이 필요 없게 한다.** 운전 모드는 재생 한 번이면 끝까지 자동 진행되고, 잠금 화면·CarPlay·Android Auto에서 재생/일시정지/다음 구간이 동작해야 한다.
3. **콘텐츠는 완전한 허구다.** 실존 기업·인물·고객명을 쓰지 않는다.
4. **모바일 우선.** 기준 화면 390×844, 터치 영역 44px 이상.
5. **부담을 주지 않는다.** 콘텐츠는 넉넉히 두되 의무처럼 느끼게 하지 않는다. 모든 단계는 건너뛸 수 있고 벌칙이 없다. 끊긴 연속 기록, 밀린 양, 타인과의 비교, 재촉 알림을 내세우지 않는다. 시간 압박이 있는 훈련은 사용자가 고를 때만 시작한다.

## 기술 스택

- Vite + React + TypeScript, `vite-plugin-pwa` (홈 화면 설치, 오프라인 캐시)
- 저장: IndexedDB (`idb` 라이브러리). 단어·학습 기록·설정은 기기에만 저장
- 배포: GitHub Pages (main 브랜치 push 시 GitHub Actions로 자동 배포)
- 오디오: `HTMLAudioElement` + Media Session API. Web Speech API(브라우저 음성 읽기)는 화면이 꺼지면 멈추므로 사용하지 않는다
- 음성 파일: `scripts/generate-audio.ts`가 클라우드 TTS(Google Cloud TTS, 미국식 음성)로 MP3 생성. API 키는 `.env`에만 두고 커밋하지 않는다. `--provider sapi`는 Windows 내장 음성을 쓰는 개발·재생 테스트 전용
- MP3 오프라인 저장: 사전 캐시하지 않고, 홈 진입 시 `prefetchAudio`가 `audio` 캐시에 통째로 넣는다. iOS 재생을 위해 서비스 워커는 Range 요청에 206으로 응답한다 (`rangeRequests`)
- 이 폴더처럼 경로에 한글이 있으면 Windows에서 Node `rmSync`가 오류 없이 파일을 지우지 못한다. 스크립트에서는 `unlinkSync`를 쓴다

## 폴더 구조

```
AGENTS.md
content/
  series/the-keynote/bible.md      스토리 설정집 (인물·줄거리·규칙)
  episodes/keynote-s1-eNN.json      화별 데이터
  audio/keynote-s1-eNN/             화별 MP3와 manifest.json
prompts/weekly-generation.md        주간 자동 생성 지시문
scripts/validate-episodes.ts        화 데이터 검사 (형식·단어 수·핵심 표현 공유)
scripts/generate-audio.ts           음성 파일 생성
src/screens/                        Home, Reading, Vocab, Speaking, Drive, Series, Progress, Review
src/lib/                            db.ts, review.ts, episodes.ts, player.ts
src/styles/tokens.css               디자인 토큰
```

## 화(Episode) 데이터 형식

`content/episodes/keynote-s1-e01.json`이 기준 예시다. 모든 화는 이 형식을 따른다.

```ts
type Level = 'lv1' | 'lv2' | 'lv3';
interface Episode {
  id: string;                 // "keynote-s1-e01"
  series: string;             // "the-keynote"
  season: number;
  number: number;             // 1~20
  title: string;
  recapKo: string | null;     // 지난 화 줄거리 2~3줄 (1화는 null)
  keyExpressions: {           // 5개, 세 레벨 공통
    phrase: string; meaningKo: string; usage: string;
  }[];
  levels: Partial<Record<Level, {
    wordCount: number;
    paragraphs: { en: string; ko: string }[];          // 8~14문단
    keyExpressionMarks: string[];                       // 5개. 본문에서 강조할 정확한 문자열
    wordCandidates: {                                   // 12개
      term: string; surface: string; meaningKo: string; paragraph: number;
      sentence: { en: string; ko: string };             // surface가 든 본문 문장과 그 문장만의 해석
    }[];
  }>>;
  quiz: { question: string; options: string[]; answerIndex: number; evidence: string }[]; // 4문제 (사실 2 + 추론·의도 2)
  speaking: {
    readAloud: string[];      // 5문장
    summaryPromptKo: string;
    question: { speaker: string; en: string; ko: string };
    modelAnswer: string;      // 60~90단어
  };
  nextTeaserKo: string;
}
```

레벨 규칙: Lv.1 약 400단어·문장 평균 10~14단어 / Lv.2 약 650단어·14~18단어 / Lv.3 약 900단어·17~22단어. 세 레벨은 같은 사건과 같은 핵심 표현 5개를 공유한다. 레벨이 아직 없으면 있는 레벨 중 가장 가까운 것을 보여준다.

## 개인 데이터 (IndexedDB)

```ts
interface Word {
  id: string; term: string; meaningKo: string; pos?: string;
  examples: { en: string; ko: string; source: 'episode' | 'generated' | 'user'; episodeId?: string }[]; // 최대 5개, 1번은 본문 문장
  tags: ('vendor' | 'client' | 'internal' | 'conference')[];
  sourceEpisodeId?: string;
  createdAt: string;
  review: { stage: 0 | 1 | 2 | 3 | 4 | 5;
            nextReviewDate: string;   // 빈 문자열이면 재확인까지 모두 끝남
            graduated: boolean;
            rechecksDone?: number;    // 졸업 후 마친 재확인 횟수 (0~2)
            history: { date: string; result: 'knew' | 'hard' | 'forgot' }[] };
}
interface Session {
  date: string; episodeId: string; level: Level;
  readingDone: boolean; quizCorrect: number; wordsSaved: number;
  vocabDone: boolean;                  // 아침 학습 2단계(단어장) 완료
  speakingCompleted: boolean | null;   // 30초 답변 '끝까지 말했어요' 여부
  dictationAccuracy?: number;
}
interface Settings {
  seriesId: string; level: Level; nextEpisodeNumber: number;
  alarmTime: string;   // "07:00"
  voice: 'en-US'; playbackRate: 0.8 | 1.0 | 1.2;
}
```

## 복습 규칙 (`src/lib/review.ts`)

- 새 단어는 0단계로 저장되어 다음 날 첫 복습
- 간격: 1단계 1일 → 2단계 3일 → 3단계 7일 → 4단계 14일 → 5단계 30일 → 졸업. 졸업 후 60일·90일에 한 번씩 재확인
- 알았음: 다음 단계 / 까다로움: 같은 단계, 간격의 절반(최소 1일) / 몰랐음: 1단계로, 다음 날
- 졸업 후 재확인에서 몰랐음: 졸업 취소, 3단계로 복귀
- 하루 카드 복습 최대 20개. 복습일이 가장 많이 지난 순 → '몰랐음' 이력 많은 순
- 순수 함수로 작성하고 단위 테스트를 반드시 둔다

## 연재 진행

- 날짜가 아니라 순서로 진행. 아침 학습 3단계를 마치면 `nextEpisodeNumber + 1`
- 학습을 마친 날은 홈과 운전 모드가 다음 날까지 방금 공부한 화를 계속 가리킨다 (출근길에 그 화를 듣기 위해)
- `nextEpisodeNumber`는 시즌을 이어 붙인 순번이다 (시즌 2의 1화 = 21)
- 한 화를 마치면 홈에서 다음 화를 바로 이어서 공부할 수 있다 (`Settings.activeEpisode`)
- 빠진 날은 다음 날 같은 화부터. 20화를 마치면 시리즈 선택 화면으로 안내

## 화면 (디자인 캔버스와 동일하게)

| 화면 | 핵심 |
|---|---|
| 홈 | 연속 학습일, 오늘 학습 카드(시리즈·화·진행률·3단계), 출근길 오디오 카드, 복습·누적 단어, 회의 준비 진입 |
| 리딩 | 지난 화 줄거리 → 영어 본문(세리프체) → 문단 탭 시 해석 펼침, 핵심 표현 노란 형광펜, 단어 후보 밑줄(탭하면 저장), 레벨 전환, 다 읽으면 퀴즈 2문제 |
| 단어장 | 오늘 저장 단어 칩, 단어 카드(뜻·품사·발음 듣기·태그·다음 복습일), 예문 5개, 예문 수정 |
| 스피킹 | 소리 내어 읽기 3문장 → 3문장 요약 → 등장인물 질문 30초 답변(타이머·녹음) → 모범 답안 → 완주 자가 체크 |
| 운전 모드 | 어두운 화면, 112px 재생 버튼, 속도 0.8/1.0/1.2배, 구간 4개(오늘 화 낭독·오늘 단어·복습 단어·한→영 즉답) |
| 복습 | 카드 앞면 단어 → 뒤집으면 뜻·예문 → 알았음/까다로움/몰랐음 |
| 시리즈 | 레벨 3단계, 시리즈 카드 4종 |
| 기록 | 월간 학습 달력, 읽은 화·누적 단어·30초 답변 완주율·받아쓰기 정확도 |

## 디자인 토큰 (`src/styles/tokens.css`)

```css
:root {
  --accent: #0F766E;       /* 틸: 버튼, 진행 바, 선택 상태 */
  --accent-strong: #0B5A54;
  --accent-soft: #DDF3EF;  /* 연한 민트: 선택 배경, 태그 */
  --ink: #16302C;          /* 글자 */
  --muted: #5B6875;
  --ground: #F3F5F7;       /* 배경 */
  --surface: #FFFFFF;
  --line: #E1E6EB;
  --highlight: #FFE9A8;    /* 핵심 표현 형광펜 */
  --drive-bg: #0E2624;     /* 운전 모드 배경 */
  --drive-panel: #1F4A45;
  --drive-accent: #7FE0D0; /* 운전 모드 재생 버튼 */
}
/* 서체: 한국어·UI Noto Sans KR / 영어 본문 Source Serif 4 */
```

## 1주차 작업 순서

1. 프로젝트 생성, PWA 설정, GitHub Pages 배포
2. 디자인 토큰과 하단 메뉴
3. 화 데이터 로딩, 리딩 화면 (레벨 전환·해석 펼치기·형광펜·밑줄)
4. 지난 화 줄거리, 내용 확인 퀴즈
5. 단어 저장, 단어장 화면
6. **화면 꺼짐 상태 MP3 연속 재생 실기기 테스트 (iPhone + CarPlay, Android + Android Auto)**. 실패하면 개인 팟캐스트 RSS 피드 방식으로 전환 검토
7. 1화 Lv.2 데이터로 아침 학습 전체 흐름 확인

## 작업 방식

- 기능 하나를 끝낼 때마다 실제 휴대폰 크기(390px)에서 확인한다
- `scripts/validate-episodes.ts`가 통과하지 않는 화 데이터는 앱에 넣지 않는다
- 개인 데이터 내보내기/가져오기(JSON 백업)는 2주차 안에 만든다
