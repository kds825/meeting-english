/** 브라우저 API에 의존하지 않는 텍스트 처리. 앱과 scripts/에서 함께 쓴다. */

export interface Segment {
  text: string;
  marked: boolean;
  /** 단어 후보 surface면 그 문자열 */
  candidate?: string;
}

function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  if (!needle) return found;
  let at = text.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = text.indexOf(needle, at + needle.length);
  }
  return found;
}

/**
 * 문단을 핵심 표현(형광펜)과 단어 후보(밑줄) 구간으로 나눈다.
 * 핵심 표현은 모든 위치, 단어 후보는 첫 위치만 표시하고, 후보끼리 겹치면 먼저 온 쪽을 쓴다.
 */
export function segmentParagraph(text: string, marks: string[], surfaces: string[]): Segment[] {
  const marked = new Array<boolean>(text.length).fill(false);
  const candidate = new Array<string | undefined>(text.length).fill(undefined);

  for (const mark of marks) {
    for (const start of occurrences(text, mark)) {
      marked.fill(true, start, start + mark.length);
    }
  }
  for (const surface of surfaces) {
    const start = occurrences(text, surface)[0];
    if (start === undefined) continue;
    const range = candidate.slice(start, start + surface.length);
    if (range.some(Boolean)) continue;
    candidate.fill(surface, start, start + surface.length);
  }

  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.marked === marked[i] && last.candidate === candidate[i]) {
      last.text += text[i];
    } else {
      segments.push({
        text: text[i],
        marked: marked[i],
        ...(candidate[i] ? { candidate: candidate[i] } : {}),
      });
    }
  }
  return segments;
}

export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

export interface SelectedText {
  term: string;
  kind: 'word' | 'sentence';
}

const MAX_PHRASE_WORDS = 6;
const MAX_PHRASE_CHARS = 60;
const MAX_SENTENCE_WORDS = 60;

/**
 * 본문에서 선택한 글자를 단어장 항목으로 다듬는다. 짧으면 단어·표현이고,
 * 길거나 완전한 문장 모양이면 문장이다. 글자가 없거나 너무 길면 null.
 */
export function cleanSelection(text: string): SelectedText | null {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const term = collapsed.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!/[A-Za-z]/.test(term)) return null;

  const words = countWords(term);
  if (words > MAX_SENTENCE_WORDS) return null;
  const ending = /[.!?]+(?=["'”’]*$)/.exec(collapsed)?.[0] ?? '';
  const looksLikeSentence = words >= 3 && Boolean(ending) && /^["'“‘]?[A-Z]/.test(collapsed);
  if (!looksLikeSentence && words <= MAX_PHRASE_WORDS && term.length <= MAX_PHRASE_CHARS) {
    return { term, kind: 'word' };
  }
  return { term: term + ending, kind: 'sentence' };
}

/** 표제어가 처음 나오는 문장. 문장 경계를 넘어 선택했으면 문단 전체 */
export function sentenceContaining(paragraph: string, term: string): string {
  return splitSentences(paragraph).find((s) => s.includes(term)) ?? paragraph;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
