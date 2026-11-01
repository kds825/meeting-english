import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoEpisode, Page, TopBar, useToday } from '../components';
import { allWords, patchTodaySession, toggleCandidate, updateSettings } from '../lib/db';
import { levelContent, resolveLevel } from '../lib/episodes';
import { segmentParagraph, slug } from '../lib/text';
import { LEVELS, type Episode, type Level, type WordCandidate } from '../lib/types';

const LEVEL_LABEL: Record<Level, string> = { lv1: 'Lv.1', lv2: 'Lv.2', lv3: 'Lv.3' };

function Paragraph({
  en,
  ko,
  marks,
  candidates,
  savedIds,
  onTapWord,
}: {
  en: string;
  ko: string;
  marks: string[];
  candidates: WordCandidate[];
  savedIds: Set<string>;
  onTapWord: (candidate: WordCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const segments = useMemo(
    () => segmentParagraph(en, marks, candidates.map((c) => c.surface)),
    [en, marks, candidates],
  );

  return (
    <div className="paragraph" onClick={() => setOpen((v) => !v)}>
      <p className="paragraph-text" lang="en">
        {segments.map((segment, i) => {
          const candidate = candidates.find((c) => c.surface === segment.candidate);
          const inner = candidate ? (
            <button
              className={savedIds.has(slug(candidate.term)) ? 'word saved' : 'word'}
              aria-pressed={savedIds.has(slug(candidate.term))}
              aria-label={`${candidate.term}: ${candidate.meaningKo}. 단어장 저장`}
              onClick={(event) => {
                event.stopPropagation();
                onTapWord(candidate);
              }}
            >
              {segment.text}
            </button>
          ) : (
            segment.text
          );
          return segment.marked ? (
            <mark key={i} className="mark" style={{ color: 'inherit' }}>
              {inner}
            </mark>
          ) : (
            <span key={i}>{inner}</span>
          );
        })}
      </p>
      <button
        className="translate-toggle"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {open ? '해석 접기' : '해석 보기'}
      </button>
      {open && <p className="translation">{ko}</p>}
    </div>
  );
}

function Quiz({ episode, onDone }: { episode: Episode; onDone: (correct: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const allAnswered = Object.keys(answers).length === episode.quiz.length;
  const correct = episode.quiz.filter((q, i) => answers[i] === q.answerIndex).length;

  return (
    <div className="stack">
      {episode.quiz.map((q, i) => {
        const answered = answers[i] !== undefined;
        return (
          <section key={q.question} className="card stack">
            <p className="eyebrow">퀴즈 {i + 1}</p>
            <h2 className="key-phrase" lang="en">
              {q.question}
            </h2>
            <div className="options" lang="en">
              {q.options.map((option, j) => {
                const state = !answered
                  ? ''
                  : j === q.answerIndex
                    ? 'correct'
                    : j === answers[i]
                      ? 'wrong'
                      : '';
                return (
                  <button
                    key={option}
                    className={`option ${state}`}
                    disabled={answered}
                    onClick={() => setAnswers({ ...answers, [i]: j })}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div className="stack">
                <p className="small muted">
                  {answers[i] === q.answerIndex ? '맞았어요. 본문 근거:' : '본문 근거를 확인해 보세요:'}
                </p>
                <p className="evidence" lang="en">
                  {q.evidence}
                </p>
              </div>
            )}
          </section>
        );
      })}
      {allAnswered ? (
        <button className="button primary" onClick={() => onDone(correct)}>
          {correct}/{episode.quiz.length} 맞힘 · 듣기로
        </button>
      ) : (
        <button className="button" onClick={() => onDone(correct)}>
          퀴즈는 넘어가기
        </button>
      )}
    </div>
  );
}

export function Reading() {
  const navigate = useNavigate();
  const { today, reload } = useToday();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [quizOpen, setQuizOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void allWords().then((words) => setSavedIds(new Set(words.map((w) => w.id))));
  }, []);

  if (!today) return null;
  const { episode, settings, number } = today;
  if (!episode) {
    return (
      <Page>
        <TopBar title="리딩" />
        <NoEpisode number={number} />
      </Page>
    );
  }

  const level = resolveLevel(episode, settings.level);
  const content = levelContent(episode, level);

  const changeLevel = async (next: Level) => {
    await updateSettings({ level: next });
    await reload();
  };

  const tapWord = async (candidate: WordCandidate) => {
    const saved = await toggleCandidate(episode, level, candidate);
    const id = slug(candidate.term);
    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
    setToast(`${candidate.term} — ${candidate.meaningKo}${saved ? '' : ' (저장 취소)'}`);
  };

  const finishQuiz = async (quizCorrect: number) => {
    await patchTodaySession(episode, level, { readingDone: true, quizCorrect });
    navigate('/listening');
  };

  return (
    <Page>
      <TopBar title={`${episode.number}화 ${episode.title}`} />

      {quizOpen ? (
        <Quiz episode={episode} onDone={(correct) => void finishQuiz(correct)} />
      ) : (
        <>
          {episode.recapKo && (
            <div className="recap">
              <b>지난 화</b>
              <p>{episode.recapKo}</p>
            </div>
          )}

          <div className="level-switch" role="group" aria-label="레벨">
            {LEVELS.map((l) => (
              <button
                key={l}
                className="chip"
                aria-pressed={l === level}
                disabled={!episode.levels[l]}
                onClick={() => void changeLevel(l)}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>

          <article className="card">
            {content.paragraphs.map((p, i) => (
              <Paragraph
                key={`${level}-${i}`}
                en={p.en}
                ko={p.ko}
                marks={content.keyExpressionMarks}
                candidates={content.wordCandidates.filter((c) => c.paragraph === i)}
                savedIds={savedIds}
                onTapWord={(c) => void tapWord(c)}
              />
            ))}
          </article>

          {toast && (
            <p className="notice" role="status">
              {toast}
            </p>
          )}

          <section className="card">
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              오늘의 핵심 표현
            </p>
            {episode.keyExpressions.map((k) => (
              <div key={k.phrase} className="key-expression">
                <p className="key-phrase" lang="en">
                  {k.phrase}
                </p>
                <p>{k.meaningKo}</p>
                <p className="key-usage" lang="en">
                  {k.usage}
                </p>
              </div>
            ))}
          </section>

          <button
            className="button primary"
            onClick={() => {
              setQuizOpen(true);
              window.scrollTo(0, 0);
            }}
          >
            다 읽었어요 · 퀴즈 풀기
          </button>
        </>
      )}
    </Page>
  );
}
