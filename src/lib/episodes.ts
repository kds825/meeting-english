import glossary from '../../content/glossary.json';
import { slug } from './text';
import { LEVELS, type Episode, type EpisodeLevel, type Level } from './types';

const episodeModules = import.meta.glob<Episode>('/content/episodes/*.json', {
  eager: true,
  import: 'default',
});
const manifestModules = import.meta.glob<AudioManifest>('/content/audio-manifests/*.json', {
  eager: true,
  import: 'default',
});

export const SEASON_LENGTH = 40;

export interface AudioManifest {
  episodeId: string;
  provider: 'google' | 'sapi';
  narration: Partial<Record<Level, string>>;
  words: Partial<Record<Level, string>>;
  recall: string;
  /** 영어 단어 + 한국어 뜻 (복습 구간) */
  wordClips: Record<string, string>;
  /** 영어 단어만 (발음 듣기) */
  termClips: Record<string, string>;
  /** 역할극 대사별 음성. 인덱스는 roleplay.lines와 같다 */
  roleplay?: string[];
}

/** 시즌을 이어 붙인 연재 순번. 시즌 1의 40화 다음이 41(시즌 2의 1화)이다 */
export function episodeOrder(episode: Pick<Episode, 'season' | 'number'>): number {
  return (episode.season - 1) * SEASON_LENGTH + episode.number;
}

const episodes = Object.values(episodeModules).sort((a, b) => episodeOrder(a) - episodeOrder(b));

export function allEpisodes(): Episode[] {
  return episodes;
}

let meaningIndex: Map<string, string> | undefined;

/**
 * 본문에서 고른 단어의 뜻. 화마다 공들여 쓴 핵심 표현과 단어 후보를 먼저 쓰고,
 * 없으면 본문 단어로 미리 만든 사전(content/glossary.json)을 쓴다. 모르면 undefined.
 */
export function knownMeaning(term: string): string | undefined {
  if (!meaningIndex) {
    meaningIndex = new Map(Object.entries(glossary));
    for (const episode of episodes) {
      for (const level of Object.values(episode.levels)) {
        for (const candidate of level.wordCandidates) {
          meaningIndex.set(slug(candidate.surface), candidate.meaningKo);
          meaningIndex.set(slug(candidate.term), candidate.meaningKo);
        }
      }
      for (const expression of episode.keyExpressions) {
        meaningIndex.set(slug(expression.phrase), expression.meaningKo);
      }
    }
  }
  return meaningIndex.get(slug(term));
}

/** 순번으로 화를 찾는다 (Settings.nextEpisodeNumber와 같은 기준) */
export function episodeByNumber(order: number): Episode | undefined {
  return episodes.find((e) => episodeOrder(e) === order);
}

/** 순번을 "시즌 2 3화" 형태로 */
export function orderLabel(order: number): string {
  const season = Math.ceil(order / SEASON_LENGTH);
  return `시즌 ${season} ${order - (season - 1) * SEASON_LENGTH}화`;
}

export function episodeById(id: string): Episode | undefined {
  return episodes.find((e) => e.id === id);
}

/** 요청한 레벨이 없으면 있는 레벨 중 가장 가까운 것을 고른다 (같은 거리면 쉬운 쪽) */
export function resolveLevel(episode: Episode, wanted: Level): Level {
  const index = LEVELS.indexOf(wanted);
  const available = LEVELS.filter((l) => episode.levels[l]);
  return [...available].sort(
    (a, b) =>
      Math.abs(LEVELS.indexOf(a) - index) - Math.abs(LEVELS.indexOf(b) - index) ||
      LEVELS.indexOf(a) - LEVELS.indexOf(b),
  )[0];
}

export function levelContent(episode: Episode, wanted: Level): EpisodeLevel {
  return episode.levels[resolveLevel(episode, wanted)]!;
}

export function manifestFor(episodeId: string): AudioManifest | undefined {
  return manifestModules[`/content/audio-manifests/${episodeId}.json`];
}

/** MP3는 public/audio의 정적 파일이다. 수천 개를 모듈로 불러오지 않도록 주소만 만든다 */
export function audioUrl(episodeId: string, file: string): string {
  return `${import.meta.env.BASE_URL}audio/${episodeId}/${file}`;
}

/** 이 화의 모든 MP3 URL. 출근 전에 미리 받아 두는 데 쓴다 */
export function episodeAudioUrls(episodeId: string): string[] {
  const manifest = manifestFor(episodeId);
  if (!manifest) return [];
  const files = [
    ...Object.values(manifest.narration),
    ...Object.values(manifest.words),
    manifest.recall,
    ...Object.values(manifest.wordClips),
    ...Object.values(manifest.termClips),
    ...(manifest.roleplay ?? []),
  ];
  return files.filter((f): f is string => Boolean(f)).map((f) => audioUrl(episodeId, f));
}

/**
 * 단어 클립을 찾는다. 화를 나누기 전에 저장한 단어는 옛 화 번호를 갖고 있어 그 화에 클립이 없을 수 있으므로,
 * 없으면 다른 화에서 같은 단어를 찾는다.
 */
function findClip(
  episodeId: string | undefined,
  term: string,
  kind: 'termClips' | 'wordClips',
): string | undefined {
  const own = episodeId ? manifestFor(episodeId)?.[kind][term] : undefined;
  if (episodeId && own) return audioUrl(episodeId, own);
  const other = Object.values(manifestModules).find((m) => m[kind][term]);
  return other && audioUrl(other.episodeId, other[kind][term]);
}

/** 발음 듣기용 영어 클립. 없으면 undefined */
export function termClipUrl(episodeId: string | undefined, term: string): string | undefined {
  return findClip(episodeId, term, 'termClips');
}

/** 복습 구간용 단어 클립(영어+뜻). 없으면 undefined */
export function wordClipUrl(episodeId: string | undefined, term: string): string | undefined {
  return findClip(episodeId, term, 'wordClips');
}
