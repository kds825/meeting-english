import { describe, expect, it } from 'vitest';
import { countWords, segmentParagraph, slug } from './text';

describe('segmentParagraph', () => {
  it('핵심 표현과 단어 후보를 나누고 원문을 그대로 보존한다', () => {
    const text = 'To be honest, the keynote is hard. To be honest, I agree.';
    const segments = segmentParagraph(text, ['To be honest'], ['keynote']);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.marked).map((s) => s.text)).toEqual([
      'To be honest',
      'To be honest',
    ]);
    expect(segments.filter((s) => s.candidate).map((s) => s.text)).toEqual(['keynote']);
  });

  it('핵심 표현 안의 단어 후보는 두 표시를 함께 갖는다', () => {
    const segments = segmentParagraph('I would stop by soon.', ['would stop by'], ['stop by']);
    expect(segments.find((s) => s.candidate)).toMatchObject({ text: 'stop by', marked: true });
  });

  it('본문에 없는 표시는 무시한다', () => {
    expect(segmentParagraph('Hello.', ['x'], ['y'])).toEqual([{ text: 'Hello.', marked: false }]);
  });
});

describe('기타', () => {
  it('단어 수와 slug', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(slug("Go Blank (it's)")).toBe('go-blank-it-s');
  });
});
