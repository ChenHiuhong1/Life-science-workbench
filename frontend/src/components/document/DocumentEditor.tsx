import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Loader2, FileText, Download, Save, GitCompare, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { ReviewResultPanel } from './ReviewResultPanel';

type DocType = 'manuscript' | 'protocol' | 'proposal';

const DOC_TYPES: { key: DocType; tKey: any; placeholder: string }[] = [
  { key: 'manuscript', tKey: 'doc.type.manuscript', placeholder: '# Title\n\n## Abstract\n\n## Introduction\n\n## Methods\n\n## Results\n\n## Discussion\n' },
  { key: 'protocol', tKey: 'doc.type.protocol', placeholder: '# Protocol Title\n\n## Materials\n\n## Procedure\n1. Step one\n2. Step two\n\n## Notes\n' },
  { key: 'proposal', tKey: 'doc.type.proposal', placeholder: '# Proposal Title\n\n## Background\n\n## Hypothesis\n\n## Aims\n\n## Methods\n\n## Expected outcomes\n' },
];

const STORAGE_KEY_PREFIX = 'sw-doc:';
const BASELINE_KEY_PREFIX = 'sw-doc-baseline:';
const AUTOREVIEW_KEY = 'sw-doc-autoreview';
// Idle window before a background review fires after the user stops typing.
// Kept short so the review panel visibly updates as the user writes, which is
// what makes the "real-time review" feature discoverable.
const AUTOREVIEW_IDLE_MS = 12_000;
// Don't bother re-reviewing if the doc changed by fewer than this many chars
// since the last review (avoids re-running on a single stray keystroke).
const AUTOREVIEW_MIN_DELTA_CHARS = 40;

// Minimal line-level diff (LCS). Avoids pulling in a diff dependency; documents
// rarely exceed a few hundred lines so the O(n*m) table is fine here.
interface DiffLine { type: 'eq' | 'add' | 'del'; text: string; }
function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  // dp[i][j] = LCS length of a[i:], b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'eq', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
    else { out.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', text: a[i++] }); }
  while (j < m) { out.push({ type: 'add', text: b[j++] }); }
  return out;
}

export function DocumentEditor() {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectPath =
    projects.find((p) => p.id === currentProjectId)?.local_path || '';

  const [docType, setDocType] = useState<DocType>('manuscript');
  const [text, setText] = useState<string>(() => {
    if (!currentProjectId) return '';
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${currentProjectId}`) || DOC_TYPES[0].placeholder;
    } catch {
      return DOC_TYPES[0].placeholder;
    }
  });
  const [title, setTitle] = useState<string>(() => {
    if (!currentProjectId) return 'Untitled';
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${currentProjectId}:title`) || 'Untitled';
    } catch {
      return 'Untitled';
    }
  });
  const [review, setReview] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [savedHint, setSavedHint] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Baseline snapshot for "what changed since last review" tracking. Defaults
  // to the loaded draft so the diff is meaningful from the first edit.
  const [baseline, setBaseline] = useState<string>('');
  const [showDiff, setShowDiff] = useState(false);
  // Live review toggle. Defaults ON so the feature is visible: as the user
  // writes, the right-hand review panel streams a fresh review after a short
  // idle window. The user can turn it off to review manually.
  const [autoReview, setAutoReview] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AUTOREVIEW_KEY);
      // Default to enabled when never set before.
      return stored === null ? true : stored === '1';
    } catch { return true; }
  });
  // Tracks the document length at the time of the last (auto or manual)
  // review, so we only re-run when enough has changed to be worth it.
  const lastReviewedLenRef = useRef<number>(0);
  // Counts down (seconds) to the next scheduled auto-review for visibility.
  const [nextReviewIn, setNextReviewIn] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Initialise baseline from storage / current draft once per project.
  useEffect(() => {
    if (!currentProjectId) return;
    let b = '';
    try { b = localStorage.getItem(`${BASELINE_KEY_PREFIX}${currentProjectId}`) || ''; } catch {}
    setBaseline(b || text);
    setLastSavedAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  // Derived doc stats. Recomputed only when text changes; cheap (single pass).
  const stats = useMemo(() => {
    const lines = text ? text.split('\n') : [];
    const words = (text.match(/\S+/g) || []).length;
    const sections = (text.match(/^#{1,3}\s+\S/gm) || []).length;
    return { lines: lines.length, words, chars: text.length, sections };
  }, [text]);

  // Line-level diff vs baseline; recompute lazily only when the diff panel
  // is open. Keeps typing latency independent of document length.
  const diff = useMemo(() => {
    if (!showDiff) return null;
    return lineDiff(baseline.split('\n'), text.split('\n'));
  }, [showDiff, baseline, text]);

  const diffSummary = useMemo(() => {
    if (!text && !baseline) return { added: 0, removed: 0 };
    const d = lineDiff(baseline.split('\n'), text.split('\n'));
    return {
      added: d.filter((x) => x.type === 'add').length,
      removed: d.filter((x) => x.type === 'del').length,
    };
  }, [baseline, text]);

  const handleTypeChange = (next: DocType) => {
    setDocType(next);
    if (!text.trim() || DOC_TYPES.some((d) => d.placeholder === text)) {
      const ph = DOC_TYPES.find((d) => d.key === next)?.placeholder || '';
      setText(ph);
    }
  };

  const persistDraft = (next: string) => {
    setText(next);
    if (currentProjectId) {
      try { localStorage.setItem(`${STORAGE_KEY_PREFIX}${currentProjectId}`, next); } catch {}
      setLastSavedAt(Date.now());
    }
  };

  const resetBaseline = () => {
    setBaseline(text);
    if (currentProjectId) {
      try { localStorage.setItem(`${BASELINE_KEY_PREFIX}${currentProjectId}`, text); } catch {}
    }
  };

  // Persist the auto-review toggle across reloads.
  useEffect(() => {
    try { localStorage.setItem(AUTOREVIEW_KEY, autoReview ? '1' : '0'); } catch {}
  }, [autoReview]);

  // Always-current reference to the review runner so the idle effect below can
  // call the latest version without re-subscribing on every render.
  const runReviewRef = useRef<() => void>(() => {});

  // Idle auto-review: when enabled, schedule a review AUTOREVIEW_IDLE_MS after
  // the last edit. Re-runs are skipped while a review is in flight or when the
  // document has not changed enough since the last review. A visible countdown
  // tells the user a live review is pending, which makes the feature
  // discoverable (the original symptom was "no real-time review"; it was
  // actually running but invisibly and only after 30s).
  useEffect(() => {
    if (!autoReview || !text.trim() || reviewing) {
      setNextReviewIn(null);
      return;
    }
    const deltaSinceReview = text.length - lastReviewedLenRef.current;
    // Not enough change to justify another API call yet.
    if (deltaSinceReview >= 0 && deltaSinceReview < AUTOREVIEW_MIN_DELTA_CHARS) {
      setNextReviewIn(null);
      return;
    }
    const totalSecs = Math.round(AUTOREVIEW_IDLE_MS / 1000);
    setNextReviewIn(totalSecs);
    const fireAt = Date.now() + AUTOREVIEW_IDLE_MS;
    const fire = () => { runReviewRef.current(); };
    const timeout = setTimeout(fire, AUTOREVIEW_IDLE_MS);
    const ticker = setInterval(() => {
      const remaining = Math.max(0, Math.round((fireAt - Date.now()) / 1000));
      setNextReviewIn(remaining);
      if (remaining <= 0) clearInterval(ticker);
    }, 500);
    return () => { clearTimeout(timeout); clearInterval(ticker); setNextReviewIn(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReview, text, reviewing]);

  const persistTitle = (next: string) => {
    setTitle(next);
    if (currentProjectId) {
      try { localStorage.setItem(`${STORAGE_KEY_PREFIX}${currentProjectId}:title`, next); } catch {}
    }
  };

  const runReview = async () => {
    if (!text.trim()) return;
    // Snapshot the length we reviewed from so the idle effect can decide
    // whether a subsequent edit is big enough to warrant another pass.
    const reviewedLen = text.length;
    setReviewing(true);
    setReview('');
    setReviewError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await api.reviewDocumentStream(
        { document_text: text, document_type: docType, language: lang, project_path: currentProjectPath },
        controller.signal
      );
      if (!resp.ok) throw new Error(await resp.text());
      if (!resp.body) throw new Error('No response body');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta') {
              acc += evt.content;
              setReview(acc);
            } else if (evt.type === 'error') {
              setReviewError(evt.message);
            }
          } catch {}
        }
      }
      lastReviewedLenRef.current = reviewedLen;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setReviewError(e.message || 'Review failed. Make sure the backend is running and an API key is set.');
      }
    } finally {
      setReviewing(false);
      abortRef.current = null;
    }
  };
  // Keep the ref pointed at the freshest runner for the idle effect.
  runReviewRef.current = runReview;

  const stopReview = () => abortRef.current?.abort();

  const exportMarkdown = () => {
    const safe = (title.trim() || 'document').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1500);
  };

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-100 shadow-card">
            <FileText size={24} className="text-clay-500" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink-600">{t('nav.no_project')}</p>
          <p className="text-xs text-ink-500 mt-1">{t('nav.no_project_desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex-1 flex overflow-hidden bg-cream-50">
      {/* Editor column */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-200">
        <div className="h-11 shrink-0 border-b border-cream-200 bg-cream-100/60 flex items-center gap-2 px-3">
          <FileText size={14} className="text-clay-500" />
          <input
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-ink-900 focus:outline-none"
            value={title}
            onChange={(e) => persistTitle(e.target.value)}
            placeholder={t('doc.save_ph')}
          />
          <select
            className="rounded-[8px] bg-cream-100 px-2 py-1 text-xs text-ink-700 focus:outline-none focus:ring-2 focus:ring-clay-400/20"
            value={docType}
            onChange={(e) => handleTypeChange(e.target.value as DocType)}
            title={t('doc.type')}
          >
            {DOC_TYPES.map((d) => (
              <option key={d.key} value={d.key}>{t(d.tKey)}</option>
            ))}
          </select>
          <button
            className="btn-outline text-xs px-2 py-1"
            onClick={exportMarkdown}
            title={t('doc.export_md')}
          >
            {savedHint ? <Save size={13} className="text-ok" /> : <Download size={13} />}
            <span className="ml-1">{savedHint ? t('doc.saved') : t('doc.export_md')}</span>
          </button>
          <button
            className={reviewing ? 'btn-outline text-xs px-2.5 py-1 text-err' : 'btn-primary text-xs px-2.5 py-1'}
            onClick={reviewing ? stopReview : runReview}
            disabled={!text.trim()}
            title={t('doc.review')}
          >
            {reviewing ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            <span className="ml-1">{reviewing ? t('doc.reviewing') : t('doc.review')}</span>
          </button>
        </div>

        {/* Stats + change-tracking bar. Always visible while editing so the user
            can see at a glance how much has been written and how much has
            drifted from the last review baseline. */}
        <div className="shrink-0 flex items-center gap-3 border-b border-cream-200 bg-cream-100 px-3 py-1 text-[11px] text-ink-500">
          <span title="Lines"><strong className="text-ink-700">{stats.lines}</strong> lines</span>
          <span className="text-cream-300">·</span>
          <span title="Words"><strong className="text-ink-700">{stats.words}</strong> words</span>
          <span className="text-cream-300">·</span>
          <span title="Sections"><strong className="text-ink-700">{stats.sections}</strong> sections</span>
          <span className="text-cream-300">·</span>
          <span title="Diff vs baseline since last review">
            <span className={diffSummary.added ? 'text-ok font-medium' : 'text-ink-400'}>+{diffSummary.added}</span>
            <span className="text-cream-300"> / </span>
            <span className={diffSummary.removed ? 'text-err font-medium' : 'text-ink-400'}>-{diffSummary.removed}</span>
            <span className="text-ink-500 ml-1">since baseline</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1 text-ink-500 hover:text-ink-700" title="Live review: re-runs shortly after you stop editing">
              <input
                type="checkbox"
                className="h-3 w-3 accent-clay-500"
                checked={autoReview}
                onChange={(e) => setAutoReview(e.target.checked)}
              />
              <span>Live review</span>
            </label>
            {autoReview && nextReviewIn != null && !reviewing && (
              <span className="flex items-center gap-1 text-clay-500" title="A fresh review will run automatically">
                <Loader2 size={11} className="animate-spin opacity-70" />
                <span>review in {nextReviewIn}s</span>
              </span>
            )}
            {autoReview && reviewing && (
              <span className="flex items-center gap-1 text-clay-500" title="Review is streaming into the right panel">
                <Loader2 size={11} className="animate-spin" />
                <span>reviewing…</span>
              </span>
            )}
            <button
              className="flex items-center gap-1 text-ink-500 hover:text-ink-900"
              onClick={() => setShowDiff((v) => !v)}
              title="Toggle diff view"
            >
              <GitCompare size={11} />
              <span>{showDiff ? 'Hide diff' : 'Show diff'}</span>
            </button>
            <button
              className="flex items-center gap-1 text-ink-500 hover:text-ink-900"
              onClick={resetBaseline}
              title="Set current text as the new baseline"
            >
              <RotateCcw size={11} />
              <span>Reset baseline</span>
            </button>
            {lastSavedAt && (
              <span className="text-ink-500" title="Last autosave">
                saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-cream-200 bg-cream-100 px-3 py-1.5 text-[11px] font-semibold text-ink-600">
              {t('doc.editor')}
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 w-full resize-none bg-cream-50/70 text-sm text-ink-900 font-mono
                         focus:outline-none px-4 py-3 leading-relaxed"
              value={text}
              onChange={(e) => persistDraft(e.target.value)}
              placeholder={DOC_TYPES.find((d) => d.key === docType)?.placeholder}
              spellCheck={false}
            />
            {showDiff && diff && <DiffView diff={diff} />}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden border-l border-cream-200 bg-cream-100/60">
            <div className="border-b border-cream-200 bg-cream-100 px-3 py-1.5 text-[11px] font-semibold text-ink-600">
              {t('doc.preview')}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }: any) {
                      const txt = String(children);
                      const match = /language-(\w+)/.exec(className || '');
                      const isBlock = (!className && txt.includes('\n')) || match;
                      if (isBlock && match) {
                        return <CodeBlock code={txt.replace(/\n$/, '')} language={match[1]} />;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    },
                  }}
                >
                  {text || t('doc.empty')}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Review column */}
      <ReviewResultPanel
        content={review}
        reviewing={reviewing}
        error={reviewError}
        onClear={() => { setReview(''); setReviewError(''); }}
      />
    </section>
  );
}

function DiffView({ diff }: { diff: DiffLine[] }) {
  return (
    <div className="max-h-56 shrink-0 overflow-y-auto border-t border-cream-200 bg-ink-900 font-mono text-[11px]">
      {diff.map((line, idx) => {
        const cls = line.type === 'add'
          ? 'bg-[#1e3a2e] text-[#b9e6c4]'
          : line.type === 'del'
            ? 'bg-[#3a1e1e] text-[#e6b9b9]'
            : 'text-[#9a9a9a]';
        const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
        return (
          <div key={idx} className={`px-3 py-0.5 whitespace-pre-wrap break-words ${cls}`}>
            <span className="select-none opacity-60 mr-2">{marker}</span>
            {line.text || ' '}
          </div>
        );
      })}
    </div>
  );
}
