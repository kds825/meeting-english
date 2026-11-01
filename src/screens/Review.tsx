import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components';
import { allWords, recordReview } from '../lib/db';
import { dailyQueue, localDate } from '../lib/review';
import type { ReviewResult, Word } from '../lib/types';

const RESULTS: { id: ReviewResult; label: string }[] = [
  { id: 'forgot', label: '몰랐음' },
  { id: 'hard', label: '까다로움' },
  { id: 'knew', label: '알았음' },
];

export function Review() {
  const [queue, setQueue] = useState<Word[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    void allWords().then((words) => setQueue(dailyQueue(words, localDate())));
  }, []);

  if (!queue) return null;
  const word = queue[index];

  const answer = async (result: ReviewResult) => {
    await recordReview(word, result);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  return (
    <Page nav>
      <div className="row between">
        <h1 className="page-title">복습</h1>
        {word && (
          <span className="muted">
            {index + 1} / {queue.length}
          </span>
        )}
      </div>

      {word ? (
        <>
          <button
            className="flash"
            aria-label={flipped ? '카드 앞면 보기' : '카드 뒤집기'}
            onClick={() => setFlipped((v) => !v)}
          >
            <span className={word.kind === 'sentence' ? 'word-term sentence-term' : 'word-term'} lang="en">
              {word.term}
            </span>
            {flipped ? (
              <>
                <span className={word.meaningKo ? undefined : 'meaning-empty'}>
                  {word.meaningKo || '뜻을 적지 않은 단어예요'}
                </span>
                {word.kind !== 'sentence' && word.examples[0] && (
                  <span className="example-en" lang="en">
                    {word.examples[0].en}
                  </span>
                )}
              </>
            ) : (
              <span className="small muted">탭해서 뜻 확인</span>
            )}
          </button>
          {flipped && (
            <div className="result-buttons">
              {RESULTS.map((r) => (
                <button
                  key={r.id}
                  className={r.id === 'knew' ? 'button primary' : 'button'}
                  onClick={() => void answer(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card empty">
          {queue.length > 0 ? `오늘 복습 ${queue.length}개를 마쳤어요.` : '오늘 복습할 단어가 없어요.'}
          <br />
          <Link to="/vocab" className="text-button" style={{ display: 'inline-block', lineHeight: '44px' }}>
            단어장 보기
          </Link>
        </div>
      )}
    </Page>
  );
}
