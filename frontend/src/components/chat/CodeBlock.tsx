import { useRef, useState } from 'react';
import { Copy, Check, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';

export function CodeBlock({
  code,
  language,
  reviewable = true,
}: {
  code: string;
  language: string;
  reviewable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const lang = useI18n((s) => s.lang);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectPath =
    projects.find((p) => p.id === currentProjectId)?.local_path || '';

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const runReview = async () => {
    if (reviewing) {
      abortRef.current?.abort();
      return;
    }
    setOpen(true);
    setReview('');
    setError('');
    setReviewing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await api.reviewDocumentStream(
        { document_text: code, document_type: 'code', language: lang, project_path: currentProjectPath },
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
              setError(evt.message);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setError(e.message || 'Code review failed.');
      }
    } finally {
      setReviewing(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-[#3B2D23] shadow-subtle">
      <div className="flex items-center justify-between bg-[#2A211B] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[#BCA98F]">{language}</span>
        <div className="flex items-center gap-1">
          {reviewable && (
            <button
              onClick={open && review ? () => setOpen((v) => !v) : runReview}
              className="rounded p-1 text-[#BCA98F] transition-colors hover:bg-[#3A2D24] hover:text-white"
              title={reviewing ? 'Stop review' : 'Review code'}
            >
              {reviewing ? <Loader2 size={12} className="animate-spin text-clay-400" /> : <ShieldCheck size={12} />}
            </button>
          )}
          <button
            onClick={copy}
            className="rounded p-1 text-[#BCA98F] transition-colors hover:bg-[#3A2D24] hover:text-white"
            title="Copy"
          >
            {copied ? <Check size={12} className="text-[#7CB66B]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto bg-[#14241C] p-3.5 font-mono text-xs leading-relaxed text-[#F5F0E6]">
        <code>{code}</code>
      </pre>
      {open && (reviewing || review || error) && (
        <div className="border-t border-[#3B2D23] bg-cream-50 p-3">
          {error ? (
            <div className="flex items-start gap-2 text-xs text-err">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{error}</span>
            </div>
          ) : review ? (
            <div className={`prose prose-sm max-w-none text-sm ${reviewing ? 'stream-active' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{review}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Loader2 size={13} className="animate-spin text-clay-500" />
              <span>Reviewing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
