import type { ReviewResult, ReviewState, Stage, Word } from './types';

/** 단계별 복습 간격(일). 인덱스가 단계. 0단계는 저장 직후 상태다. */
const INTERVALS = [1, 1, 3, 7, 14, 30];
/** 졸업 후 재확인 간격: 졸업 60일 뒤, 다시 30일 뒤(졸업 기준 90일) */
const RECHECK_GAPS = [60, 30];
export const DAILY_REVIEW_LIMIT = 20;

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 기기 현지 시간 기준 YYYY-MM-DD */
export function localDate(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function newReview(today: string): ReviewState {
  return { stage: 0, nextReviewDate: addDays(today, 1), graduated: false, history: [] };
}

const halved = (days: number) => Math.max(1, Math.floor(days / 2));

export function applyReview(state: ReviewState, result: ReviewResult, today: string): ReviewState {
  const history = [...state.history, { date: today, result }];

  if (state.graduated) {
    const done = state.rechecksDone ?? 0;
    const gap = RECHECK_GAPS[Math.min(done, RECHECK_GAPS.length - 1)];
    if (result === 'forgot') {
      return { stage: 3, nextReviewDate: addDays(today, INTERVALS[3]), graduated: false, history };
    }
    if (result === 'hard') {
      return { ...state, nextReviewDate: addDays(today, halved(gap)), history };
    }
    const nextDone = done + 1;
    return {
      ...state,
      rechecksDone: nextDone,
      nextReviewDate: nextDone < RECHECK_GAPS.length ? addDays(today, RECHECK_GAPS[nextDone]) : '',
      history,
    };
  }

  if (result === 'forgot') {
    return { stage: 1, nextReviewDate: addDays(today, INTERVALS[1]), graduated: false, history };
  }
  if (result === 'hard') {
    return { ...state, nextReviewDate: addDays(today, halved(INTERVALS[state.stage])), history };
  }
  if (state.stage === 5) {
    return {
      stage: 5,
      nextReviewDate: addDays(today, RECHECK_GAPS[0]),
      graduated: true,
      rechecksDone: 0,
      history,
    };
  }
  const stage = (state.stage + 1) as Stage;
  return { stage, nextReviewDate: addDays(today, INTERVALS[stage]), graduated: false, history };
}

export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReviewDate !== '' && state.nextReviewDate <= today;
}

const forgotCount = (word: Word) => word.review.history.filter((h) => h.result === 'forgot').length;

/** 오늘 복습할 단어: 많이 지난 순 → '몰랐음' 많은 순, 오늘 이미 복습한 수를 뺀 하루 한도까지 */
export function dailyQueue(words: Word[], today: string, limit = DAILY_REVIEW_LIMIT): Word[] {
  const doneToday = words.filter((w) => w.review.history.some((h) => h.date === today)).length;
  return words
    .filter((w) => isDue(w.review, today))
    .sort(
      (a, b) =>
        a.review.nextReviewDate.localeCompare(b.review.nextReviewDate) ||
        forgotCount(b) - forgotCount(a),
    )
    .slice(0, Math.max(0, limit - doneToday));
}
