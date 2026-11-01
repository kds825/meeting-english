/**
 * content/episodes/*.json 검사. 하나라도 실패하면 종료 코드 1.
 * 실행: npx tsx scripts/validate-episodes.ts [--dir 다른폴더]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countWords, splitSentences } from '../src/lib/text';
import { LEVELS, type Episode, type EpisodeLevel, type Level } from '../src/lib/types';

const dirFlag = process.argv.indexOf('--dir');
const DIR = dirFlag === -1 ? join(import.meta.dirname, '..', 'content', 'episodes') : process.argv[dirFlag + 1];
const TARGET_WORDS: Record<Level, number> = { lv1: 200, lv2: 325, lv3: 450 };
const SENTENCE_LENGTH: Record<Level, [number, number]> = {
  lv1: [10, 14],
  lv2: [14, 18],
  lv3: [17, 22],
};
const PARAGRAPHS: [number, number] = [4, 8];
const KEY_EXPRESSIONS: [number, number] = [2, 3];
const WORD_CANDIDATES: [number, number] = [4, 8];
const QUIZ_QUESTIONS = 2;
const READ_ALOUD = 3;
const MODEL_ANSWER_WORDS: [number, number] = [60, 90];
const ROLEPLAY_TURNS: [number, number] = [4, 8];
const TOLERANCE = 0.15;

function checkLevel(level: Level, content: EpisodeLevel, errors: string[], warnings: string[]) {
  const tag = `[${level}]`;
  const { paragraphs, keyExpressionMarks: marks, wordCandidates: candidates } = content;

  if (paragraphs.length < PARAGRAPHS[0] || paragraphs.length > PARAGRAPHS[1]) {
    errors.push(`${tag} 문단은 ${PARAGRAPHS.join('~')}개여야 합니다 (현재 ${paragraphs.length}개)`);
  }
  paragraphs.forEach((p, i) => {
    if (!p.en?.trim() || !p.ko?.trim()) errors.push(`${tag} ${i}번 문단에 영어나 해석이 없습니다`);
  });

  const body = paragraphs.map((p) => p.en).join(' ');
  const words = countWords(body);
  const target = TARGET_WORDS[level];
  if (Math.abs(words - target) > target * TOLERANCE) {
    errors.push(`${tag} 본문 ${words}단어: 기준 ${target}단어의 ±15%를 벗어납니다`);
  }
  if (content.wordCount !== words) {
    errors.push(`${tag} wordCount ${content.wordCount}이 실제 단어 수 ${words}와 다릅니다`);
  }

  const average = words / splitSentences(body).length;
  const [min, max] = SENTENCE_LENGTH[level];
  if (average < min || average > max) {
    warnings.push(`${tag} 문장 평균 ${average.toFixed(1)}단어: 권장 ${min}~${max}단어`);
  }

  if (marks.length < KEY_EXPRESSIONS[0] || marks.length > KEY_EXPRESSIONS[1]) {
    errors.push(`${tag} keyExpressionMarks는 ${KEY_EXPRESSIONS.join('~')}개여야 합니다`);
  }
  for (const mark of marks) {
    if (!body.includes(mark)) errors.push(`${tag} 핵심 표현이 본문에 없습니다: "${mark}"`);
  }

  if (candidates.length < WORD_CANDIDATES[0] || candidates.length > WORD_CANDIDATES[1]) {
    errors.push(`${tag} 단어 후보는 ${WORD_CANDIDATES.join('~')}개여야 합니다 (현재 ${candidates.length}개)`);
  }
  for (const c of candidates) {
    if (!paragraphs[c.paragraph]?.en.includes(c.surface)) {
      errors.push(`${tag} "${c.surface}"가 ${c.paragraph}번 문단에 없습니다`);
    }
    if (!c.sentence?.en?.includes(c.surface) || !c.sentence.ko?.trim()) {
      errors.push(`${tag} "${c.surface}"의 예문에 단어가 없거나 해석이 비어 있습니다`);
    } else if (!paragraphs[c.paragraph]?.en.includes(c.sentence.en)) {
      errors.push(`${tag} "${c.surface}"의 예문이 ${c.paragraph}번 문단에 그대로 없습니다`);
    }
    if (!c.term?.trim() || !c.meaningKo?.trim()) {
      errors.push(`${tag} 단어 후보 "${c.surface}"의 term 또는 뜻이 없습니다`);
    }
  }
}

function checkEpisode(file: string, ep: Episode, errors: string[], warnings: string[]) {
  if (`${ep.id}.json` !== file) errors.push(`파일명과 id(${ep.id})가 다릅니다`);
  if (ep.id !== `keynote-s${ep.season}-e${String(ep.number).padStart(2, '0')}`) {
    errors.push(`id가 시즌·화 번호와 맞지 않습니다: ${ep.id}`);
  }
  if (!Number.isInteger(ep.number) || ep.number < 1 || ep.number > 40) {
    errors.push(`화 번호는 1~40이어야 합니다: ${ep.number}`);
  }
  if (!ep.title?.trim()) errors.push('제목이 없습니다');
  const seriesStart = ep.season === 1 && ep.number === 1;
  if (seriesStart ? ep.recapKo !== null : !ep.recapKo?.trim()) {
    errors.push(seriesStart ? '시즌 1 1화의 recapKo는 null이어야 합니다' : '지난 화 줄거리가 없습니다');
  }
  if (!ep.nextTeaserKo?.trim()) errors.push('다음 화 예고가 없습니다');

  const keyCount = ep.keyExpressions?.length ?? 0;
  if (keyCount < KEY_EXPRESSIONS[0] || keyCount > KEY_EXPRESSIONS[1]) {
    errors.push(`핵심 표현은 ${KEY_EXPRESSIONS.join('~')}개여야 합니다`);
  }
  for (const k of ep.keyExpressions ?? []) {
    if (!k.phrase?.trim() || !k.meaningKo?.trim() || !k.usage?.trim()) {
      errors.push(`핵심 표현 항목이 비어 있습니다: "${k.phrase}"`);
    }
  }

  const levels = LEVELS.filter((l) => ep.levels?.[l]);
  if (levels.length === 0) errors.push('레벨이 하나도 없습니다');
  for (const level of levels) checkLevel(level, ep.levels[level]!, errors, warnings);
  if (levels.length < 3) warnings.push(`없는 레벨: ${LEVELS.filter((l) => !ep.levels?.[l]).join(', ')}`);

  if (ep.quiz?.length !== QUIZ_QUESTIONS) errors.push(`퀴즈는 ${QUIZ_QUESTIONS}문제여야 합니다`);
  (ep.quiz ?? []).forEach((q, i) => {
    if (q.options?.length !== 4) errors.push(`퀴즈 ${i + 1}: 보기는 4개여야 합니다`);
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
      errors.push(`퀴즈 ${i + 1}: answerIndex가 0~3이 아닙니다`);
    }
    // 레벨마다 문장 길이가 달라 같은 문장을 강제할 수 없으므로, 어느 한 레벨에 있으면 통과한다
    const found = levels.some((level) =>
      ep.levels[level]!.paragraphs.some((p) => p.en.includes(q.evidence)),
    );
    if (!found) errors.push(`퀴즈 ${i + 1}: 근거 문장이 본문에 없습니다: "${q.evidence}"`);
  });

  const speaking = ep.speaking;
  if (speaking?.readAloud?.length !== READ_ALOUD) {
    errors.push(`소리 내어 읽기는 ${READ_ALOUD}문장이어야 합니다`);
  }
  if (!speaking?.summaryPromptKo?.trim()) errors.push('요약 안내가 없습니다');
  if (!speaking?.question?.speaker || !speaking.question.en || !speaking.question.ko) {
    errors.push('등장인물 질문이 비어 있습니다');
  }
  const answerWords = countWords(speaking?.modelAnswer ?? '');
  if (answerWords < MODEL_ANSWER_WORDS[0] || answerWords > MODEL_ANSWER_WORDS[1]) {
    errors.push(`모범 답안 ${answerWords}단어: ${MODEL_ANSWER_WORDS.join('~')}단어여야 합니다`);
  }
}

function checkRoleplay(ep: Episode, errors: string[]) {
  if (!ep.roleplay) {
    errors.push('역할극이 없습니다');
    return;
  }
  const { title, situationKo, lines } = ep.roleplay;
  if (!title?.trim() || !situationKo?.trim()) errors.push('역할극 제목이나 상황 설명이 없습니다');
  const turns = lines.filter((l) => l.you).length;
  if (turns < ROLEPLAY_TURNS[0] || turns > ROLEPLAY_TURNS[1]) {
    errors.push(`역할극의 내 차례는 ${ROLEPLAY_TURNS.join('~')}개여야 합니다 (현재 ${turns}개)`);
  }
  if (lines[0]?.you) errors.push('역할극은 상대 대사로 시작해야 합니다');
  lines.forEach((l, i) => {
    if (!l.speaker?.trim() || !l.en?.trim() || !l.ko?.trim()) errors.push(`역할극 ${i}번 대사가 비어 있습니다`);
    if (l.voice !== 'female' && l.voice !== 'male') errors.push(`역할극 ${i}번 대사의 voice가 잘못됐습니다`);
    if (l.you && l.speaker !== '강재원') errors.push(`역할극 ${i}번: 내 차례의 화자는 강재원이어야 합니다`);
    if (l.you && countWords(l.en) > 25) errors.push(`역할극 ${i}번: 내 대사는 25단어 이하여야 합니다`);
  });

  // 핵심 표현을 직접 말해 보는 장면이어야 한다. ~ 앞부분이 내 대사에 1개 이상 나오는지 본다
  const mine = lines.filter((l) => l.you).map((l) => l.en.toLowerCase()).join(' ');
  const used = ep.keyExpressions.filter((k) =>
    mine.includes(k.phrase.split('~')[0].replace(/[.?!\s]+$/, '').toLowerCase()),
  ).length;
  if (used < 1) errors.push('역할극의 내 대사에 핵심 표현이 없습니다 (1개 이상)');
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
let failed = 0;

for (const file of files) {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    const episode = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Episode;
    checkEpisode(file, episode, errors, warnings);
    checkRoleplay(episode, errors);
  } catch (error) {
    errors.push(`읽기 실패: ${(error as Error).message}`);
  }
  console.log(`${errors.length ? '실패' : '통과'}  ${file}`);
  warnings.forEach((w) => console.log(`  경고: ${w}`));
  errors.forEach((e) => console.log(`  오류: ${e}`));
  if (errors.length) failed += 1;
}

console.log(`\n${files.length}개 중 ${files.length - failed}개 통과`);
if (failed > 0 || files.length === 0) process.exit(1);
