import { useEffect, useRef, useState } from 'react';
import { Icon, Page } from '../components';
import { parseBackup } from '../lib/backup';
import { allWords, deleteWord, exportBackup, putWord, restoreBackup } from '../lib/db';
import { termClipUrl } from '../lib/episodes';
import { playOnce } from '../lib/player';
import { localDate } from '../lib/review';
import { WORD_TAGS, type Word, type WordExample, type WordTag } from '../lib/types';

const MAX_EXAMPLES = 5;

function formatReview(word: Word): string {
  if (word.review.nextReviewDate === '') return '복습 완료';
  const label = word.review.graduated ? '재확인' : '다음 복습';
  return `${label} ${word.review.nextReviewDate.slice(5).replace('-', '/')}`;
}

function ExampleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: WordExample;
  onSave: (example: WordExample) => void;
  onCancel: () => void;
}) {
  const [en, setEn] = useState(initial.en);
  const [ko, setKo] = useState(initial.ko);
  return (
    <div className="stack example">
      <textarea
        className="field"
        rows={2}
        lang="en"
        placeholder="영어 예문"
        aria-label="영어 예문"
        value={en}
        onChange={(e) => setEn(e.target.value)}
      />
      <textarea
        className="field"
        rows={2}
        placeholder="한국어 뜻"
        aria-label="한국어 뜻"
        value={ko}
        onChange={(e) => setKo(e.target.value)}
      />
      <div className="row">
        <button className="text-button" onClick={onCancel}>
          취소
        </button>
        <button
          className="text-button"
          disabled={!en.trim()}
          onClick={() => onSave({ ...initial, en: en.trim(), ko: ko.trim() })}
        >
          저장
        </button>
      </div>
    </div>
  );
}

function WordCard({
  word,
  open,
  onToggle,
  onChange,
  onDelete,
}: {
  word: Word;
  open: boolean;
  onToggle: () => void;
  onChange: (word: Word) => void;
  onDelete: () => void;
}) {
  /** 편집 중인 예문 위치. examples.length면 새 예문 */
  const [editing, setEditing] = useState<number | null>(null);
  const clip = termClipUrl(word.sourceEpisodeId, word.term);

  const toggleTag = (tag: WordTag) =>
    onChange({
      ...word,
      tags: word.tags.includes(tag) ? word.tags.filter((t) => t !== tag) : [...word.tags, tag],
    });

  const saveExample = (index: number, example: WordExample) => {
    const examples = [...word.examples];
    examples[index] = example;
    onChange({ ...word, examples });
    setEditing(null);
  };

  return (
    <article className="card" id={`word-${word.id}`}>
      <button className="word-card-head" aria-expanded={open} onClick={onToggle}>
        <span>
          <span className="word-term" lang="en">
            {word.term}
          </span>
          <br />
          <span>
            {word.pos && <span className="muted">{word.pos} · </span>}
            {word.meaningKo || <span className="meaning-empty">뜻을 아직 적지 않았어요</span>}
          </span>
        </span>
        <span className="small muted" style={{ flex: 'none' }}>
          {formatReview(word)}
        </span>
      </button>

      {!open && word.tags.length > 0 && (
        <div className="chips" style={{ marginTop: 6 }}>
          {word.tags.map((tag) => (
            <span className="tag" key={tag}>
              {WORD_TAGS.find((t) => t.id === tag)?.label}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="stack" style={{ marginTop: 10 }}>
          <input
            className="field meaning-field"
            placeholder="뜻 적기"
            aria-label="한국어 뜻"
            defaultValue={word.meaningKo}
            onBlur={(e) => {
              const meaningKo = e.target.value.trim();
              if (meaningKo !== word.meaningKo) onChange({ ...word, meaningKo });
            }}
          />
          {clip && (
            <button className="chip" style={{ alignSelf: 'flex-start', gap: 6 }} onClick={() => playOnce(clip)}>
              <Icon name="volume" size={18} /> 발음 듣기
            </button>
          )}

          <div className="chips" role="group" aria-label="태그">
            {WORD_TAGS.map((tag) => (
              <button
                key={tag.id}
                className="chip"
                aria-pressed={word.tags.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.label}
              </button>
            ))}
          </div>

          <div>
            <p className="section-title">
              예문 {word.examples.length}/{MAX_EXAMPLES}
            </p>
            {word.examples.map((example, i) =>
              editing === i ? (
                <ExampleEditor
                  key={i}
                  initial={example}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => saveExample(i, next)}
                />
              ) : (
                <div className="example" key={i}>
                  <p className="example-en" lang="en">
                    {example.en}
                  </p>
                  <p className="small muted">{example.ko}</p>
                  <div className="row">
                    <button className="text-button" style={{ paddingLeft: 0 }} onClick={() => setEditing(i)}>
                      수정
                    </button>
                    {i > 0 && (
                      <button
                        className="text-button danger"
                        onClick={() =>
                          onChange({ ...word, examples: word.examples.filter((_, j) => j !== i) })
                        }
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
            {editing === word.examples.length ? (
              <ExampleEditor
                initial={{ en: '', ko: '', source: 'user' }}
                onCancel={() => setEditing(null)}
                onSave={(next) => saveExample(word.examples.length, next)}
              />
            ) : (
              word.examples.length < MAX_EXAMPLES && (
                <button
                  className="text-button"
                  style={{ paddingLeft: 0 }}
                  onClick={() => setEditing(word.examples.length)}
                >
                  + 내 예문 추가
                </button>
              )
            )}
          </div>

          <button className="text-button danger" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={onDelete}>
            단어 삭제
          </button>
        </div>
      )}
    </article>
  );
}

/** 휴대폰에서는 공유 시트로 파일 앱·메일에 보내고, 그 밖에는 내려받는다 */
async function saveBackupFile(json: string, name: string): Promise<void> {
  const file = new File([json], name, { type: 'application/json' });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // 공유 창을 닫은 것은 오류가 아니다
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function BackupCard({ onRestored }: { onRestored: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const exportFile = async () => {
    try {
      const backup = await exportBackup();
      await saveBackupFile(JSON.stringify(backup), `meeting-english-backup-${localDate()}.json`);
      setMessage(`단어 ${backup.words.length}개와 학습 기록 ${backup.sessions.length}건을 내보냈어요.`);
    } catch {
      setMessage('내보내지 못했어요. 다시 시도해 주세요.');
    }
  };

  const importFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const summary = `단어 ${backup.words.length}개, 학습 기록 ${backup.sessions.length}건`;
      if (!window.confirm(`지금 기기의 기록을 지우고 이 파일(${summary})로 바꿀까요?`)) return;
      await restoreBackup(backup);
      onRestored();
      setMessage(`${summary}을 가져왔어요.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '가져오지 못했어요.');
    }
  };

  return (
    <section className="card stack">
      <div>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          기록 백업
        </h2>
        <p className="small muted">
          단어와 학습 기록은 이 기기에만 저장돼요. 기기를 바꾸기 전에 파일로 내보내 두세요.
        </p>
      </div>
      <div className="row">
        <button className="button" onClick={() => void exportFile()}>
          내보내기
        </button>
        <button className="button" onClick={() => input.current?.click()}>
          가져오기
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="백업 파일 선택"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

export function Vocab() {
  const [words, setWords] = useState<Word[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void allWords().then(setWords);
  }, []);

  const date = localDate();
  const todayWords = words.filter((w) => w.createdAt.slice(0, 10) === date);

  const change = async (word: Word) => {
    await putWord(word);
    setWords((current) => current.map((w) => (w.id === word.id ? word : w)));
  };

  const remove = async (word: Word) => {
    if (!window.confirm(`"${word.term}"을(를) 단어장에서 지울까요? 복습 기록도 함께 지워집니다.`)) return;
    await deleteWord(word.id);
    setWords((current) => current.filter((w) => w.id !== word.id));
  };

  const openChip = (id: string) => {
    setOpenId(id);
    requestAnimationFrame(() =>
      document.getElementById(`word-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  };

  return (
    <Page nav>
      <h1 className="page-title">단어장</h1>

      {todayWords.length > 0 && (
        <section>
          <p className="section-title" style={{ marginTop: 0, marginBottom: 8 }}>
            오늘 저장한 단어 {todayWords.length}개
          </p>
          <div className="chips" lang="en">
            {todayWords.map((word) => (
              <button
                key={word.id}
                className="chip"
                aria-pressed={openId === word.id}
                onClick={() => openChip(word.id)}
              >
                {word.term}
              </button>
            ))}
          </div>
        </section>
      )}

      {words.length === 0 ? (
        <div className="card empty">
          아직 저장한 단어가 없어요.
          <br />
          리딩 본문에서 점선 밑줄을 탭하면 저장됩니다.
        </div>
      ) : (
        words.map((word) => (
          <WordCard
            key={word.id}
            word={word}
            open={openId === word.id}
            onToggle={() => setOpenId(openId === word.id ? null : word.id)}
            onChange={(next) => void change(next)}
            onDelete={() => void remove(word)}
          />
        ))
      )}

      <BackupCard onRestored={() => void allWords().then(setWords)} />
    </Page>
  );
}
