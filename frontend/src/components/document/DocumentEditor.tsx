import { useRef, useState } from 'react';
import { ShieldCheck, Loader2, FileText, Download, Save } from 'lucide-react';
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
  const abortRef = useRef<AbortController | null>(null);

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
    }
  };

  const persistTitle = (next: string) => {
    setTitle(next);
    if (currentProjectId) {
      try { localStorage.setItem(`${STORAGE_KEY_PREFIX}${currentProjectId}:title`, next); } catch {}
    }
  };

  const runReview = async () => {
    if (!text.trim()) return;
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
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setReviewError(e.message || 'Review failed. Make sure the backend is running and an API key is set.');
      }
    } finally {
      setReviewing(false);
      abortRef.current = null;
    }
  };

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
          <div className="w-16 h-16 rounded-full bg-cream-100 flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-clay-500" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink-500">{t('nav.no_project')}</p>
          <p className="text-xs text-ink-300 mt-1">{t('nav.no_project_desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex-1 flex overflow-hidden bg-cream-50">
      {/* Editor column */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-300">
        <div className="shrink-0 h-10 border-b border-cream-300 bg-white flex items-center gap-2 px-3">
          <FileText size={14} className="text-clay-500" />
          <input
            className="flex-1 min-w-0 text-sm font-medium bg-transparent focus:outline-none truncate"
            value={title}
            onChange={(e) => persistTitle(e.target.value)}
            placeholder={t('doc.save_ph')}
          />
          <select
            className="text-xs border border-cream-300 rounded-[6px] px-2 py-1 bg-white text-ink-700 focus:outline-none"
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

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-300 border-b border-cream-200">
              {t('doc.editor')}
            </div>
            <textarea
              className="flex-1 w-full resize-none bg-cream-50 text-sm text-ink-900 font-mono
                         focus:outline-none px-4 py-3 leading-relaxed"
              value={text}
              onChange={(e) => persistDraft(e.target.value)}
              placeholder={DOC_TYPES.find((d) => d.key === docType)?.placeholder}
              spellCheck={false}
            />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden border-l border-cream-200 bg-white">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-300 border-b border-cream-200">
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
