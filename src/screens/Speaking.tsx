import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, NoEpisode, Page, TopBar, useToday } from '../components';
import { patchTodaySession } from '../lib/db';
import { resolveLevel } from '../lib/episodes';
import type { Episode } from '../lib/types';

const ANSWER_SECONDS = 30;
const STEP_COUNT = 5;

/** 30초 타이머와 녹음. 녹음은 메모리에만 두고 화면을 떠나면 사라진다. 마이크가 없어도 타이머는 돈다. */
function useAnswerRecorder() {
  const [seconds, setSeconds] = useState(ANSWER_SECONDS);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setRunning(false);
    setFinished(true);
  };

  const start = async () => {
    setFinished(false);
    setRecordingUrl(null);
    setMicError(false);
    setSeconds(ANSWER_SECONDS);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream.current);
      const chunks: Blob[] = [];
      media.ondataavailable = (e) => chunks.push(e.data);
      media.onstop = () =>
        setRecordingUrl(URL.createObjectURL(new Blob(chunks, { type: media.mimeType })));
      media.start();
      recorder.current = media;
    } catch {
      setMicError(true);
    }
    setRunning(true);
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          stop();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { seconds, running, finished, recordingUrl, micError, start, stop };
}

function Steps({ episode, onFinish }: { episode: Episode; onFinish: (spoke: boolean) => Promise<void> }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showKo, setShowKo] = useState(false);
  const [completed, setCompleted] = useState(false);
  const recorder = useAnswerRecorder();
  const { readAloud, summaryPromptKo, question, modelAnswer } = episode.speaking;

  const next = () => {
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  };

  const check = async (spoke: boolean) => {
    await onFinish(spoke);
    setCompleted(true);
  };

  return (
    <>
      <div className="dots" aria-hidden="true">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <section className="stack">
          <h2 className="page-title">소리 내어 읽기</h2>
          <p className="muted">또박또박 소리 내어 읽어 보세요.</p>
          {readAloud.map((sentence) => (
            <p key={sentence} className="card read-sentence" lang="en">
              {sentence}
            </p>
          ))}
          <button className="button primary" onClick={next}>
            다 읽었어요
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="stack">
          <h2 className="page-title">3문장 요약</h2>
          <p className="card">{summaryPromptKo}</p>
          <button className="button primary" onClick={next}>
            말해 봤어요
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="stack">
          <h2 className="page-title">30초 답변</h2>
          <div className="card stack">
            <p className="speaker">{question.speaker}</p>
            <p className="read-sentence" lang="en">
              {question.en}
            </p>
            {showKo ? (
              <p className="muted">{question.ko}</p>
            ) : (
              <button
                className="text-button"
                style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                onClick={() => setShowKo(true)}
              >
                해석 보기
              </button>
            )}
          </div>

          <div className="timer" role="timer" aria-label="남은 시간">
            0:{String(recorder.seconds).padStart(2, '0')}
          </div>

          {recorder.micError && (
            <p className="notice">마이크를 쓸 수 없어 녹음 없이 타이머만 진행합니다.</p>
          )}

          {recorder.running ? (
            <button className="button" onClick={recorder.stop}>
              답변 끝내기
            </button>
          ) : (
            <button className="button primary" onClick={() => void recorder.start()}>
              <Icon name="mic" size={20} /> {recorder.finished ? '다시 답변하기' : '답변 시작'}
            </button>
          )}

          {recorder.recordingUrl && (
            <audio className="recording" controls src={recorder.recordingUrl} aria-label="내 답변 녹음" />
          )}

          {recorder.finished && (
            <button className="button primary" onClick={next}>
              모범 답안 보기
            </button>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="stack">
          <h2 className="page-title">모범 답안</h2>
          <p className="card read-sentence" lang="en">
            {modelAnswer}
          </p>
          <button className="button primary" onClick={next}>
            다음
          </button>
        </section>
      )}

      {step === 4 && !completed && (
        <section className="stack">
          <h2 className="page-title">30초를 끝까지 말했나요?</h2>
          <p className="muted">문법이 틀려도 괜찮아요. 멈추지 않고 말했는지만 체크합니다.</p>
          <button className="button primary" onClick={() => void check(true)}>
            끝까지 말했어요
          </button>
          <button className="button" onClick={() => void check(false)}>
            중간에 멈췄어요
          </button>
        </section>
      )}

      {!completed && step < 4 && (
        <button className="button" onClick={() => navigate('/')}>
          여기까지 하기
        </button>
      )}

      {completed && (
        <section className="stack">
          <h2 className="page-title">30초 답변까지 마쳤어요</h2>
          <button className="button primary" onClick={() => navigate('/drive')}>
            출근길 오디오 듣기
          </button>
          <button className="button" onClick={() => navigate('/')}>
            홈으로
          </button>
        </section>
      )}
    </>
  );
}

export function Speaking() {
  const { today } = useToday();
  if (!today) return null;
  const { episode, session, settings, number } = today;
  return (
    <Page>
      <TopBar title="스피킹" />
      {episode ? (
        <Steps
          episode={episode}
          onFinish={async (spoke) => {
            await patchTodaySession(episode, session?.level ?? resolveLevel(episode, settings.level), {
              speakingCompleted: spoke,
            });
          }}
        />
      ) : (
        <NoEpisode number={number} />
      )}
    </Page>
  );
}
