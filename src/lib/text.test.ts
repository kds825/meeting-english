import { describe, expect, it } from 'vitest';
import { cleanSelection, countWords, segmentParagraph, sentenceContaining, slug } from './text';

describe('cleanSelection', () => {
  it('앞뒤 문장 부호와 공백을 뗀다', () => {
    expect(cleanSelection(' "morning," ')).toBe('morning');
  });
  it('중간의 줄바꿈과 아포스트로피는 다듬어 유지한다', () => {
    expect(cleanSelection('pull\n out of')).toBe('pull out of');
    expect(cleanSelection("Jae-won's")).toBe("Jae-won's");
  });
  it('글자가 없거나 너무 길면 null', () => {
    expect(cleanSelection('7:40')).toBeNull();
    expect(cleanSelection('...')).toBeNull();
    expect(cleanSelection('one two three four five six seven')).toBeNull();
  });
});

describe('sentenceContaining', () => {
  const paragraph = 'It was early. She closed the door. Nobody spoke.';
  it('단어가 든 문장만 돌려준다', () => {
    expect(sentenceContaining(paragraph, 'closed')).toBe('She closed the door.');
  });
  it('문장을 넘어 고르면 문단 전체', () => {
    expect(sentenceContaining(paragraph, 'door. Nobody')).toBe(paragraph);
  });
});

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
