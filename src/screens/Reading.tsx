import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoEpisode, Page, TopBar, useToday } from '../components';
import { allWords, patchTodaySession, saveBodyWord, toggleCandidate, updateSettings } from '../lib/db';
import { levelContent, resolveLevel } from '../lib/episodes';
import { cleanSelection, segmentParagraph, sentenceContaining, slug } from '../lib/text';
import { LEVELS, type Episode, type Level, type WordCandidate } from '../lib/types';

const LEVEL_LABEL: Record<Level, string> = { lv1: 'Lv.1', lv2: 'Lv.2', lv3: 'Lv.3' };
const TOAST_MS = 3000;
/** 선택 손잡이를 끄는 동안 창이 깜빡이지 않도록 선택이 멈춘 뒤에 읽는다 */
const SELECTION_SETTLE_MS = 200;

function Paragraph({
  index,
  en,
  ko,
  marks,
  candidates,
  savedIds,
  onTapWord,
}: {
  index: number;
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
    <div
      className="paragraph"
      onClick={() => {
        // 글자를 고르는 동작이 해석을 여닫지 않도록 한다
        if (!window.getSelection()?.isCollapsed) return;
        setOpen((v) => !v);
      }}
    >
      <p className="paragraph-text" lang="en" data-index={index}>
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

interface PickedText {
  term: string;
  paragraph: number;
}

/** 지금 본문에서 선택된 글자. 한 문단 안의 단어·짧은 표현일 때만 돌려준다 */
function readPickedText(): PickedText | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const bodyOf = (node: Node | null) =>
    (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.paragraph-text');
  const body = bodyOf(selection.anchorNode);
  if (!body || body !== bodyOf(selection.focusNode)) return null;
  const term = cleanSelection(selection.toString());
  return term ? { term, paragraph: Number(body.dataset.index) } : null;
}

/**
 * 길게 눌러 고른 단어를 저장하는 창. 키보드에 가리지 않도록 화면 위쪽에 둔다.
 * 입력칸을 누르면 선택이 풀리므로 선택 상태와 상관없이 닫을 때까지 남는다.
 */
function PickedWordBar({
  term,
  initialMeaning,
  alreadySaved,
  onSave,
  onClose,
}: {
  term: string;
  initialMeaning: string;
  alreadySaved: boolean;
  onSave: (meaningKo: string) => void;
  onClose: () => void;
}) {
  const [meaning, setMeaning] = useState(initialMeaning);
  return (
    <section className="picked-word" aria-label="고른 단어 저장">
      <div className="row between">
        <b lang="en">{term}</b>
        <button className="text-button" onClick={onClose}>
          닫기
        </button>
      </div>
      {alreadySaved ? (
        <p className="small muted">이미 단어장에 있어요.</p>
      ) : (
        <div className="row">
          <input
            className="field"
            placeholder="한국어 뜻"
            aria-label="한국어 뜻"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
          />
          <button
            className="button primary picked-save"
            disabled={!meaning.trim()}
            onClick={() => onSave(meaning.trim())}
          >
            저장
          </button>
        </div>
      )}
    </section>
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
  const [picked, setPicked] = useState<PickedText | null>(null);

  useEffect(() => {
    void allWords().then((words) => setSavedIds(new Set(words.map((w) => w.id))));
  }, []);

  // 길게 누르면 브라우저가 단어를 선택한다. 그 메뉴는 바꿀 수 없으므로 선택을 감지해 저장 창을 따로 띄운다
  useEffect(() => {
    let timer: number | undefined;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = readPickedText();
        if (next) setPicked(next);
      }, SELECTION_SETTLE_MS);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  const pickedCandidate =
    picked &&
    content.wordCandidates.find(
      (c) => slug(c.term) === slug(picked.term) || slug(c.surface) === slug(picked.term),
    );

  const closePicked = () => {
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  };

  const savePicked = async (meaningKo: string) => {
    if (!picked) return;
    const term = pickedCandidate?.term ?? picked.term;
    const sentence = pickedCandidate?.sentence ?? {
      en: sentenceContaining(content.paragraphs[picked.paragraph].en, picked.term),
      ko: '',
    };
    await saveBodyWord(episode, level, { term, meaningKo, sentence });
    setSavedIds((current) => new Set(current).add(slug(term)));
    setToast(`단어장에 저장했어요 · ${term} — ${meaningKo}`);
    closePicked();
  };

  const changeLevel = async (next: Level) => {
    closePicked();
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
    setToast(
      `${saved ? '단어장에 저장했어요' : '저장을 취소했어요'} · ${candidate.term} — ${candidate.meaningKo}`,
    );
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

          <p className="small muted">점선 단어는 탭하면 바로 저장돼요. 다른 단어는 길게 눌러 고르면 저장 창이 떠요.</p>

          <article className="card">
            {content.paragraphs.map((p, i) => (
              <Paragraph
                key={`${level}-${i}`}
                index={i}
                en={p.en}
                ko={p.ko}
                marks={content.keyExpressionMarks}
                candidates={content.wordCandidates.filter((c) => c.paragraph === i)}
                savedIds={savedIds}
                onTapWord={(c) => void tapWord(c)}
              />
            ))}
          </article>

          {picked && (
            <PickedWordBar
              key={`${picked.paragraph}-${picked.term}`}
              term={pickedCandidate?.term ?? picked.term}
              initialMeaning={pickedCandidate?.meaningKo ?? ''}
              alreadySaved={savedIds.has(slug(pickedCandidate?.term ?? picked.term))}
              onSave={(meaningKo) => void savePicked(meaningKo)}
              onClose={closePicked}
            />
          )}

          {/* 본문이 길어 흐름 속에 두면 화면 밖에 뜬다. 화면에 고정한다 */}
          {toast && (
            <p className="toast" role="status">
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
