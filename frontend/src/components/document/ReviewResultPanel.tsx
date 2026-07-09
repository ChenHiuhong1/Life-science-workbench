import { ShieldCheck, Loader2, Eraser, AlertCircle, FlaskConical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/i18n';
import { CodeBlock } from '@/components/chat/CodeBlock';

interface Props {
  content: string;
  reviewing: boolean;
  error: string;
  onClear: () => void;
}

export function ReviewResultPanel({ content, reviewing, error, onClear }: Props) {
  const t = useI18n((s) => s.t);

  return (
    <aside className="w-[26rem] shrink-0 bg-cream-50/70 flex flex-col overflow-hidden">
      <div className="h-11 shrink-0 border-b border-cream-200 bg-cream-50 flex items-center justify-between px-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-clay-500" />
          <span className="text-xs font-semibold text-ink-700">
            {t('doc.review_title')}
          </span>
        </div>
        {(content || error) && !reviewing && (
          <button
            className="rounded-[8px] p-1 text-ink-400 hover:bg-cream-100 hover:text-ink-700"
            onClick={onClear}
            title="Clear review"
          >
            <Eraser size={13} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {reviewing && !content ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 size={26} className="text-clay-500 animate-spin mb-3" />
            <p className="text-sm text-ink-500">{t('doc.reviewing')}</p>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-err/20 bg-err/10 px-3 py-2 text-xs text-err">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        ) : content ? (
          <div className={`prose prose-sm max-w-none text-sm ${reviewing ? 'stream-active' : ''}`}>
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
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-100 shadow-card">
              <ShieldCheck size={22} className="text-clay-500" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-ink-500 leading-relaxed max-w-xs">{t('doc.review_empty')}</p>
            <div className="mt-4 flex items-center gap-1 text-[11px] text-ink-500">
              <FlaskConical size={11} />
              <span>Reviewer agent · multi-domain checklist</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
