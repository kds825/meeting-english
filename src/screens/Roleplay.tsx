import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, NoEpisode, Page, TopBar, useToday } from '../components';
import { patchTodaySession } from '../lib/db';
import { audioUrl, manifestFor, resolveLevel } from '../lib/episodes';
import { player } from '../lib/player';
import type { RoleplayLine } from '../lib/types';

/** 힌트 단계: 0 없음 → 1 한국어 → 2 첫 단어 → 3 전체 문장 */
const HINT_LABELS = ['힌트: 한국어 뜻', '힌트: 첫 단어', '힌트: 전체 문장'];

function firstWords(en: string): string {
  return `${en.split(/\s+/).slice(0, 3).join(' ')} …`;
}

/** 원할 때만 쓰는 녹음. 메모리에만 두고 다음 대사로 넘어가면 버린다. */
function useTurnRecorder() {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  const start = async () => {
    setFailed(false);
    setUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (e) => chunks.push(e.data);
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setUrl(URL.createObjectURL(new Blob(chunks, { type: media.mimeType })));
      };
      media.start();
      recorder.current = media;
      setRecording(true);
    } catch {
      setFailed(true);
    }
  };

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  };

  const reset = () => {
    stop();
    setUrl(null);
    setFailed(false);
  };

  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
    },
    [],
  );

  return { recording, url, failed, start, stop, reset };
}

function Scene({
  lines,
  urls,
  audio,
  onRestart,
  onFinish,
}: {
  lines: RoleplayLine[];
  urls: (string | undefined)[];
  audio: HTMLAudioElement;
  onRestart: () => void;
  /** 이 단계를 끝낸 것으로 기록하고 홈으로 돌아간다 */
  onFinish: () => Promise<void>;
}) {
  /** 현재 대사 위치. lines.length면 장면 끝 */
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(0);
  // 음성 파일이 없으면 들을 수 없으니 자막을 켜 둔다
  const [subtitles, setSubtitles] = useState(() => urls.every((url) => !url));
  const recorder = useTurnRecorder();
  const bottom = useRef<HTMLDivElement>(null);
  const current = lines[index];
  // 내가 답하기 전까지 상대 말은 귀로만 듣는다. 내가 답한 뒤에야 그 앞 대사의 글자를 보여 준다
  const answeredUpTo =
    index >= lines.length
      ? lines.length
      : current.you && revealed
        ? index
        : lines.slice(0, index).map((line) => Boolean(line.you)).lastIndexOf(true);

  const play = (lineIndex: number, onEnded?: () => void) => {
    const url = urls[lineIndex];
    audio.onended = onEnded ?? null;
    if (!url) {
      onEnded?.();
      return;
    }
    audio.src = url;
    void audio.play().catch(() => undefined);
  };

  /** 상대 대사는 이어서 재생하고, 내 차례에서 멈춘다 */
  const goTo = (next: number) => {
    setIndex(next);
    setRevealed(false);
    setHint(0);
    recorder.reset();
    if (next < lines.length && !lines[next].you) {
      play(next, () => goTo(next + 1));
    }
  };

  useEffect(() => {
    goTo(0);
    return () => {
      audio.onended = null;
      audio.pause();
    };
    // 장면이 시작될 때 한 번만 재생한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [index, revealed, hint]);

  const reveal = () => {
    if (recorder.recording) recorder.stop();
    setRevealed(true);
    play(index);
  };

  return (
    <>
      <div className="row between">
        <span className="small muted">
          {Math.min(lines.slice(0, index + 1).filter((l) => l.you).length, lines.filter((l) => l.you).length)} /{' '}
          {lines.filter((l) => l.you).length} 차례
        </span>
        <button
          className="chip"
          aria-pressed={subtitles}
          onClick={() => setSubtitles((v) => !v)}
        >
          상대 자막
        </button>
      </div>

      <div className="scene">
        {lines.slice(0, index + 1).map((line, i) => {
          if (i === index && line.you && !revealed) return null;
          return (
            <div key={i} className={line.you ? 'bubble mine' : 'bubble'}>
              <div className="row between">
                <span className="small speaker">{line.speaker}</span>
                <button className="icon-button" aria-label={`${line.speaker} 대사 다시 듣기`} onClick={() => play(i)}>
                  <Icon name="volume" size={18} />
                </button>
              </div>
              {line.you || subtitles || i < answeredUpTo ? (
                <>
                  <p className="example-en" lang="en">
                    {line.en}
                  </p>
                  <p className="small muted">{line.ko}</p>
                </>
              ) : (
                <p className="small muted">
                  {i === index ? '듣는 중…' : '못 들었으면 스피커를 누르거나 상대 자막을 켜 보세요.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {current?.you && (
        <section className="card stack turn">
          {revealed ? (
            <>
              {recorder.url && (
                <audio className="recording" controls src={recorder.url} aria-label="내 목소리" />
              )}
              <button className="button primary" onClick={() => goTo(index + 1)}>
                다음
              </button>
              <button
                className="button"
                onClick={() => {
                  setRevealed(false);
                  recorder.reset();
                }}
              >
                다시 말해 보기
              </button>
            </>
          ) : (
            <>
              <h2 className="key-phrase">내 차례예요. 소리 내어 답해 보세요.</h2>
              {hint >= 1 && <p>{current.ko}</p>}
              {hint === 2 && (
                <p className="example-en" lang="en">
                  {firstWords(current.en)}
                </p>
              )}
              {hint >= 3 && (
                <p className="example-en" lang="en">
                  {current.en}
                </p>
              )}
              {hint < HINT_LABELS.length && (
                <button className="text-button" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setHint(hint + 1)}>
                  {HINT_LABELS[hint]}
                </button>
              )}
              {recorder.failed && <p className="notice">마이크를 쓸 수 없어요. 녹음 없이 말해 보세요.</p>}
              <button
                className="button"
                onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
              >
                <Icon name="mic" size={20} />
                {recorder.recording ? '녹음 끝내기' : recorder.url ? '다시 녹음하기' : '녹음하며 말하기 (선택)'}
              </button>
              <button className="button primary" onClick={reveal}>
                말했어요 · 원래 대사 듣기
              </button>
              <button className="text-button" onClick={() => void onFinish()}>
                여기까지 하기
              </button>
            </>
          )}
        </section>
      )}

      {index >= lines.length && (
        <section className="card stack turn">
          <h2 className="key-phrase">장면 끝</h2>
          <p className="muted">한 번 더 하면 말이 더 빨리 나와요. 물론 바로 넘어가도 좋습니다.</p>
          <button className="button primary" onClick={() => void onFinish()}>
            오늘 학습 마치기
          </button>
          <button className="button" onClick={onRestart}>
            처음부터 다시
          </button>
        </section>
      )}
      <div ref={bottom} />
    </>
  );
}

export function RoleplayScreen() {
  const navigate = useNavigate();
  const { today } = useToday();
  const [run, setRun] = useState(0);
  const [audio] = useState(() => new Audio());

  if (!today) return null;
  const { episode, settings, number } = today;
  if (!episode) {
    return (
      <Page>
        <TopBar title="역할극" />
        <NoEpisode number={number} />
      </Page>
    );
  }

  const { roleplay } = episode;
  const manifest = manifestFor(episode.id);
  const urls = roleplay.lines.map((_, i) => {
    const file = manifest?.roleplay?.[i];
    return file ? audioUrl(episode.id, file) : undefined;
  });

  const finish = async () => {
    await patchTodaySession(episode, resolveLevel(episode, settings.level), { roleplayDone: true });
    navigate('/');
  };

  return (
    <Page>
      <TopBar title={`${episode.number}화 역할극`} />
      {/* 음성이 없는 화에서도 대사와 힌트로 연습할 수 있다 */}
      {run === 0 ? (
        <section className="stack">
          <h1 className="page-title">{roleplay.title}</h1>
          <p className="card">{roleplay.situationKo}</p>
          <p className="notice">소리가 나옵니다. 상대 말은 글자 없이 먼저 들어 보세요. 막히면 힌트를 누르면 됩니다.</p>
          <button
            className="button primary"
            onClick={() => {
              player.pause();
              // iOS는 사용자가 탭한 순간에 재생을 시작한 오디오 요소만 이후에도 자동 재생을 허용한다
              if (urls[0]) {
                audio.src = urls[0];
                void audio.play().catch(() => undefined);
              }
              setRun(1);
            }}
          >
            시작
          </button>
          <button className="button" onClick={() => void finish()}>
            역할극 넘어가기
          </button>
        </section>
      ) : (
        <Scene
          key={run}
          lines={roleplay.lines}
          urls={urls}
          audio={audio}
          onRestart={() => setRun(run + 1)}
          onFinish={finish}
        />
      )}
    </Page>
  );
}
