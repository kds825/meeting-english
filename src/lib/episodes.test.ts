import { describe, expect, it } from 'vitest';
import { episodeOrder, orderLabel } from './episodes';

describe('연재 순번', () => {
  it('시즌을 이어 붙인다', () => {
    expect(episodeOrder({ season: 1, number: 40 })).toBe(40);
    expect(episodeOrder({ season: 2, number: 1 })).toBe(41);
  });

  it('순번을 시즌과 화로 표시한다', () => {
    expect(orderLabel(40)).toBe('시즌 1 40화');
    expect(orderLabel(43)).toBe('시즌 2 3화');
  });
});
