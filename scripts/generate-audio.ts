/**
 * 화별 MP3와 manifest.json 생성.
 *   npx tsx scripts/generate-audio.ts --episodes 1,2 [--season 2] [--provider google|sapi]
 *
 * google: Google Cloud TTS (.env의 GOOGLE_TTS_API_KEY). 실제 서비스용.
 * sapi:   Windows 내장 음성. API 키 없이 재생 테스트를 하기 위한 개발용.
 *
 * 합성 결과는 .cache/tts에 문장별로 저장하므로 다시 실행해도 같은 문장에 비용이 들지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { slug } from '../src/lib/text';
import { LEVELS, type Episode } from '../src/lib/types';

type Lang = 'en' | 'en-male' | 'ko';
type Part = { text: string; lang: Lang } | { silence: number };

const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache', 'tts');
const MANIFESTS = join(ROOT, 'content', 'audio-manifests');
const GOOGLE_VOICES: Record<Lang, { languageCode: string; name: string }> = {
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  'en-male': { languageCode: 'en-US', name: 'en-US-Neural2-D' },
  ko: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A' },
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const provider = (arg('provider') ?? 'google') as 'google' | 'sapi';
const season = Number(arg('season') ?? 1);
const numbers = (arg('episodes') ?? '')
  .split(',')
  .map(Number)
  .filter((n) => Number.isInteger(n) && n > 0);

if (numbers.length === 0 || !['google', 'sapi'].includes(provider)) {
  console.error('사용법: tsx scripts/generate-audio.ts --episodes 1,2 [--provider google|sapi]');
  process.exit(1);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (result.status !== 0) {
    throw new Error(`${command} 실패: ${result.stderr || result.error?.message}`);
  }
}

function ffmpeg(...args: string[]) {
  run(ffmpegPath as unknown as string, ['-y', '-loglevel', 'error', ...args]);
}

/** 어떤 입력이든 같은 형식(24kHz 모노 WAV)으로 맞춘다. 이어 붙일 때 어긋나지 않게 하기 위해서다. */
const NORMALIZE = ['-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le'];

async function synthGoogle(text: string, lang: Lang, out: string) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new Error('.env에 GOOGLE_TTS_API_KEY가 없습니다');
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: { text },
      voice: GOOGLE_VOICES[lang],
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!response.ok) throw new Error(`Google TTS ${response.status}: ${await response.text()}`);
  const { audioContent } = (await response.json()) as { audioContent: string };
  const raw = `${out}.mp3`;
  writeFileSync(raw, Buffer.from(audioContent, 'base64'));
  ffmpeg('-i', raw, ...NORMALIZE, out);
  unlinkSync(raw);
}

function synthSapi(text: string, lang: Lang, out: string) {
  const textFile = `${out}.txt`;
  const scriptFile = join(tmpdir(), `sapi-${process.pid}.ps1`);
  writeFileSync(textFile, text, 'utf8');
  writeFileSync(
    scriptFile,
    [
      'param($textFile, $culture, $wav, $hint)',
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $culture -and $_.VoiceInfo.Name -like "*$hint*" } | Select-Object -First 1',
      'if (-not $v) { throw "no voice for $culture" }',
      '$s.SelectVoice($v.VoiceInfo.Name)',
      '$s.SetOutputToWaveFile($wav)',
      '$s.Speak([IO.File]::ReadAllText($textFile, [Text.Encoding]::UTF8))',
      '$s.Dispose()',
    ].join('\n'),
  );
  const raw = `${out}.raw.wav`;
  run('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile,
    textFile, lang === 'ko' ? 'ko-KR' : 'en-US', raw, lang === 'en-male' ? 'David' : '',
  ]);
  ffmpeg('-i', raw, ...NORMALIZE, out);
  unlinkSync(raw);
  unlinkSync(textFile);
}

async function speech(text: string, lang: Lang): Promise<string> {
  const voice = provider === 'google' ? GOOGLE_VOICES[lang].name : `sapi-${lang}`;
  const hash = createHash('sha256').update(`${voice}\n${text}`).digest('hex').slice(0, 24);
  const out = join(CACHE, `${hash}.wav`);
  if (!existsSync(out)) {
    if (provider === 'google') await synthGoogle(text, lang, out);
    else synthSapi(text, lang, out);
  }
  return out;
}

function silence(seconds: number): string {
  const out = join(CACHE, `silence-${seconds}.wav`);
  if (!existsSync(out)) {
    ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(seconds), ...NORMALIZE, out);
  }
  return out;
}

async function render(parts: Part[], out: string) {
  const files: string[] = [];
  for (const part of parts) {
    files.push('silence' in part ? silence(part.silence) : await speech(part.text, part.lang));
  }
  const list = `${out}.txt`;
  writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '64k', out);
  unlinkSync(list);
}

/** 낭독에 맞지 않는 표기(~, 괄호 설명)를 지운다 */
function spoken(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/[~～]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

mkdirSync(CACHE, { recursive: true });
mkdirSync(MANIFESTS, { recursive: true });

for (const number of numbers) {
  const id = `keynote-s${season}-e${String(number).padStart(2, '0')}`;
  const episodeFile = join(ROOT, 'content', 'episodes', `${id}.json`);
  if (!existsSync(episodeFile)) throw new Error(`화 파일이 없습니다: ${id}`);
  const episode = JSON.parse(readFileSync(episodeFile, 'utf8')) as Episode;
  const outDir = join(ROOT, 'public', 'audio', id);
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    episodeId: id,
    provider,
    narration: {} as Record<string, string>,
    words: {} as Record<string, string>,
    recall: 'recall.mp3',
    wordClips: {} as Record<string, string>,
    termClips: {} as Record<string, string>,
  };

  for (const level of LEVELS) {
    const content = episode.levels[level];
    if (!content) continue;

    manifest.narration[level] = `narration-${level}.mp3`;
    await render(
      content.paragraphs.flatMap((p): Part[] => [{ text: p.en, lang: 'en' }, { silence: 1 }]),
      join(outDir, manifest.narration[level]),
    );

    const wordParts: Part[] = [];
    for (const c of content.wordCandidates) {
      wordParts.push(
        { text: c.term, lang: 'en' },
        { silence: 0.6 },
        { text: spoken(c.meaningKo), lang: 'ko' },
        { silence: 0.6 },
        { text: c.sentence.en, lang: 'en' },
        { silence: 1.5 },
      );

      const key = slug(c.term);
      if (!manifest.termClips[c.term]) {
        manifest.termClips[c.term] = `term-${key}.mp3`;
        manifest.wordClips[c.term] = `word-${key}.mp3`;
        await render([{ text: c.term, lang: 'en' }], join(outDir, manifest.termClips[c.term]));
        await render(
          [
            { text: c.term, lang: 'en' },
            { silence: 0.6 },
            { text: spoken(c.meaningKo), lang: 'ko' },
            { silence: 1.5 },
          ],
          join(outDir, manifest.wordClips[c.term]),
        );
      }
    }
    manifest.words[level] = `words-${level}.mp3`;
    await render(wordParts, join(outDir, manifest.words[level]));
  }

  // 한→영 즉답: 한국어 뜻을 듣고 4초 안에 떠올린 뒤 예문으로 확인
  await render(
    episode.keyExpressions.flatMap((k): Part[] => [
      { text: spoken(k.meaningKo), lang: 'ko' },
      { silence: 4 },
      { text: k.usage, lang: 'en' },
      { silence: 1.5 },
    ]),
    join(outDir, manifest.recall),
  );

  if (episode.roleplay) {
    const files: string[] = [];
    for (const [index, line] of episode.roleplay.lines.entries()) {
      const file = `roleplay-${String(index).padStart(2, '0')}.mp3`;
      await render([{ text: line.en, lang: line.voice === 'male' ? 'en-male' : 'en' }], join(outDir, file));
      files.push(file);
    }
    Object.assign(manifest, { roleplay: files });
  }

  writeFileSync(join(MANIFESTS, `${id}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`완료: ${id} (${provider})`);
}
