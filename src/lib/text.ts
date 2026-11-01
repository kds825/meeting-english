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

/** 본문에서 선택한 글자를 단어장 표제어로 다듬는다. 단어·짧은 표현이 아니면 null */
export function cleanSelection(text: string): string | null {
  const term = text
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!/[A-Za-z]/.test(term) || term.length > 60 || countWords(term) > 6) return null;
  return term;
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
