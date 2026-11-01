import { describe, expect, it } from 'vitest';
import { addDays, applyReview, dailyQueue, isDue, newReview } from './review';
import type { ReviewState, Stage, Word } from './types';

const TODAY = '2026-11-02';
const at = (stage: Stage): ReviewState => ({
  stage,
  nextReviewDate: TODAY,
  graduated: false,
  history: [],
});
const graduated = (rechecksDone: number): ReviewState => ({
  stage: 5,
  nextReviewDate: TODAY,
  graduated: true,
  rechecksDone,
  history: [],
});

describe('addDays', () => {
  it('월과 윤년을 넘긴다', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('applyReview', () => {
  it('새 단어는 0단계로 시작해 다음 날 복습한다', () => {
    expect(newReview(TODAY)).toMatchObject({ stage: 0, nextReviewDate: '2026-11-03' });
  });

  it.each([
    [0, 1, 1],
    [1, 2, 3],
    [2, 3, 7],
    [3, 4, 14],
    [4, 5, 30],
  ] as [Stage, Stage, number][])('알았음: %i단계 → %i단계, %i일 뒤', (from, to, days) => {
    const next = applyReview(at(from), 'knew', TODAY);
    expect(next.stage).toBe(to);
    expect(next.nextReviewDate).toBe(addDays(TODAY, days));
  });

  it('5단계에서 알았음이면 졸업하고 60일 뒤 재확인한다', () => {
    const next = applyReview(at(5), 'knew', TODAY);
    expect(next.graduated).toBe(true);
    expect(next.nextReviewDate).toBe(addDays(TODAY, 60));
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 3],
    [4, 7],
    [5, 15],
  ] as [Stage, number][])('까다로움: %i단계 유지, 간격 절반 %i일', (stage, days) => {
    const next = applyReview(at(stage), 'hard', TODAY);
    expect(next.stage).toBe(stage);
    expect(next.nextReviewDate).toBe(addDays(TODAY, days));
  });

  it('몰랐음: 1단계로 돌아가 다음 날 복습한다', () => {
    const next = applyReview(at(4), 'forgot', TODAY);
    expect(next.stage).toBe(1);
    expect(next.nextReviewDate).toBe(addDays(TODAY, 1));
  });

  it('졸업 후 재확인은 졸업 기준 60일·90일 두 번으로 끝난다', () => {
    const first = applyReview(graduated(0), 'knew', TODAY);
    expect(first.graduated).toBe(true);
    expect(first.nextReviewDate).toBe(addDays(TODAY, 30));
    const second = applyReview(first, 'knew', first.nextReviewDate);
    expect(second.graduated).toBe(true);
    expect(second.nextReviewDate).toBe('');
    expect(isDue(second, '2099-01-01')).toBe(false);
  });

  it('졸업 후 재확인에서 몰랐음이면 졸업 취소, 3단계로 복귀', () => {
    const next = applyReview(graduated(1), 'forgot', TODAY);
    expect(next.graduated).toBe(false);
    expect(next.stage).toBe(3);
    expect(next.nextReviewDate).toBe(addDays(TODAY, 7));
    expect(next.rechecksDone).toBeUndefined();
  });

  it('이력을 남기고 입력을 변경하지 않는다', () => {
    const state = at(1);
    const next = applyReview(state, 'hard', TODAY);
    expect(next.history).toEqual([{ date: TODAY, result: 'hard' }]);
    expect(state.history).toEqual([]);
  });
});

describe('dailyQueue', () => {
  const word = (id: string, review: Partial<ReviewState>): Word => ({
    id,
    term: id,
    meaningKo: '',
    examples: [],
    tags: [],
    createdAt: TODAY,
    review: { ...at(1), ...review },
  });

  it('많이 지난 순 → 몰랐음 많은 순으로 정렬하고 미래 단어는 뺀다', () => {
    const queue = dailyQueue(
      [
        word('future', { nextReviewDate: '2026-11-03' }),
        word('recent', { nextReviewDate: '2026-11-01' }),
        word('fewForgot', {
          nextReviewDate: '2026-10-20',
          history: [{ date: '2026-10-19', result: 'forgot' }],
        }),
        word('manyForgot', {
          nextReviewDate: '2026-10-20',
          history: [
            { date: '2026-10-18', result: 'forgot' },
            { date: '2026-10-19', result: 'forgot' },
          ],
        }),
      ],
      TODAY,
    );
    expect(queue.map((w) => w.id)).toEqual(['manyForgot', 'fewForgot', 'recent']);
  });

  it('하루 20개 한도에서 오늘 이미 복습한 수를 뺀다', () => {
    const due = Array.from({ length: 30 }, (_, i) => word(`due${i}`, {}));
    const done = Array.from({ length: 5 }, (_, i) =>
      word(`done${i}`, {
        nextReviewDate: '2026-11-05',
        history: [{ date: TODAY, result: 'knew' }],
      }),
    );
    expect(dailyQueue(due, TODAY)).toHaveLength(20);
    expect(dailyQueue([...due, ...done], TODAY)).toHaveLength(15);
  });
});
