import { describe, expect, it } from 'vitest';
import { allEpisodes, episodeOrder, knownMeaning, orderLabel } from './episodes';

describe('knownMeaning', () => {
  it('핵심 표현과 단어 후보는 화에 쓴 뜻을 돌려준다', () => {
    const episode = allEpisodes()[0];
    const expression = episode.keyExpressions[0];
    const candidate = episode.levels.lv2!.wordCandidates[0];
    expect(knownMeaning(expression.phrase)).toBeTruthy();
    expect(knownMeaning(candidate.surface)).toBeTruthy();
  });

  it('대소문자와 상관없이 사전 단어의 뜻을 찾는다', () => {
    expect(knownMeaning('Budget')).toBe('예산');
  });

  it('등장인물 이름과 모르는 표현은 뜻을 지어내지 않는다', () => {
    expect(knownMeaning('Helen')).toBeUndefined();
    expect(knownMeaning('not in any episode')).toBeUndefined();
  });

  it('본문에 소문자로 나오는 단어는 거의 모두 뜻이 있다', () => {
    const words = new Set<string>();
    for (const episode of allEpisodes()) {
      for (const level of Object.values(episode.levels)) {
        for (const paragraph of level.paragraphs) {
          for (const word of paragraph.en.match(/(?<![A-Za-z'’-])[a-z][a-z'’-]*/g) ?? []) words.add(word);
        }
      }
    }
    const missing = [...words].filter((word) => !knownMeaning(word));
    expect(missing.length / words.size).toBeLessThan(0.01);
  });
});

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
