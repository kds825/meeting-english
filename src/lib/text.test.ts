import { describe, expect, it } from 'vitest';
import { cleanSelection, countWords, segmentParagraph, sentenceContaining, slug } from './text';

describe('cleanSelection', () => {
  it('앞뒤 문장 부호와 공백을 뗀다', () => {
    expect(cleanSelection(' "morning," ')).toEqual({ term: 'morning', kind: 'word' });
  });
  it('중간의 줄바꿈과 아포스트로피는 다듬어 유지한다', () => {
    expect(cleanSelection('pull\n out of')?.term).toBe('pull out of');
    expect(cleanSelection("Jae-won's")?.term).toBe("Jae-won's");
  });
  it('글자가 없으면 null', () => {
    expect(cleanSelection('7:40')).toBeNull();
    expect(cleanSelection('...')).toBeNull();
  });
  it('6단어를 넘으면 문장으로 본다', () => {
    expect(cleanSelection('one two three four five six')?.kind).toBe('word');
    expect(cleanSelection('one two three four five six seven')?.kind).toBe('sentence');
  });
  it('60자를 넘으면 단어 수가 적어도 문장으로 본다', () => {
    expect(cleanSelection('a'.repeat(61))?.kind).toBe('sentence');
  });
  it('짧아도 완전한 문장 모양이면 문장이고 마침표와 물음표를 남긴다', () => {
    expect(cleanSelection('She closed the door.')).toEqual({ term: 'She closed the door.', kind: 'sentence' });
    expect(cleanSelection('"Can you stop by my office?"')).toEqual({
      term: 'Can you stop by my office?',
      kind: 'sentence',
    });
  });
  it('두 단어짜리나 소문자로 시작하면 문장으로 보지 않는다', () => {
    expect(cleanSelection('Thank you.')?.kind).toBe('word');
    expect(cleanSelection('the team meeting.')?.kind).toBe('word');
  });
  it('60단어를 넘으면 null', () => {
    expect(cleanSelection(Array(61).fill('word').join(' '))).toBeNull();
    expect(cleanSelection(Array(60).fill('word').join(' '))?.kind).toBe('sentence');
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
