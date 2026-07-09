import { X, FileCode2, Trash2, FileText } from 'lucide-react';
import { useStore, type CodeReviewEntry } from '@/store';

/**
 * Side panel that renders the code review (diff) a tool call emitted.
 *
 * Previously this diff lived permanently under each streaming tool call inside
 * the conversation window, which crowded the stream and made long sessions hard
 * to read. Now a tool call only shows a compact "+N / -M · Review" button; the
 * full diff opens here, on demand, as an overlay on the right rail.
 *
 * The diff surface uses a neutral dark ink background (not the SYSU green) so
 * the +/- syntax highlighting reads cleanly against the warm-ivory app chrome.
 */
export function CodeReviewPanel() {
  const active = useStore((s) => s.codeReview.active);
  const history = useStore((s) => s.codeReview.history);
  const close = useStore((s) => s.closeCodeReview);
  const open = useStore((s) => s.openCodeReview);
  const clearHistory = useStore((s) => s.clearCodeReviewHistory);

  if (!active) return null;

  return (
    <>
      {/* Backdrop — click to dismiss. Does not block the conversation below
          visually (semi-transparent), only captures the close click. */}
      <div
        className="fixed inset-0 z-40 bg-ink-900/20"
        onClick={close}
        aria-hidden
      />

      <aside className="fixed right-0 top-0 z-50 flex h-dvh w-[34rem] max-w-[88vw] flex-col bg-cream-50 shadow-lift">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-cream-200 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 size={16} className="shrink-0 text-clay-500" />
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-semibold tracking-[-0.01em] text-ink-900 truncate">
                Code review · {active.language}
              </h2>
              <p className="text-[10px] text-ink-500 truncate">
                {active.toolLabel}{active.argsSummary ? ` · ${active.argsSummary}` : ''}
              </p>
            </div>
          </div>
          <button
            className="rounded-[8px] p-1.5 text-ink-400 hover:bg-cream-100 hover:text-ink-700"
            onClick={close}
            title="Close review"
          >
            <X size={16} />
          </button>
        </header>

        {/* Summary line: total additions / removals. */}
        <div className="flex items-center gap-3 border-b border-cream-200 px-4 py-2 text-[11px]">
          <span className="font-mono tabular-nums">
            <span className="text-ok">+{active.added} added</span>
            <span className="mx-2 text-ink-400">·</span>
            <span className="text-err">-{active.removed} removed</span>
          </span>
        </div>

        {/* The diff itself — neutral dark surface for clean syntax reading. */}
        <div className="flex-1 overflow-auto bg-ink-900 p-0 font-mono text-[12px] leading-[1.6]">
          {active.lines.map((line, index) => (
            <div
              key={`${line.type}-${index}`}
              className={`grid grid-cols-[3rem_1.1rem_1fr] gap-1.5 px-3 ${
                line.type === 'add'
                  ? 'bg-ok/15 text-cream-50'
                  : line.type === 'del'
                    ? 'bg-err/15 text-cream-50'
                    : 'text-cream-100/70'
              }`}
            >
              <span className="select-none text-right text-cream-100/40">{line.lineNumber || ''}</span>
              <span
                className={`select-none ${
                  line.type === 'add' ? 'text-ok' : line.type === 'del' ? 'text-err' : 'text-cream-100/40'
                }`}
              >
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>
              <code className="whitespace-pre-wrap break-words">{line.text || ' '}</code>
            </div>
          ))}
        </div>

        {/* Recent reviews — quick re-open without scrolling the conversation. */}
        {history.length > 1 && (
          <div className="shrink-0 border-t border-cream-200 bg-cream-100/60 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-ink-600">Recent reviews</span>
              <button
                className="flex items-center gap-1 text-[10px] text-ink-500 hover:text-err"
                onClick={clearHistory}
                title="Clear review history"
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.map((entry) => {
                const isActive = entry.id === active.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => open(entry)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                      isActive
                        ? 'bg-clay-100 text-clay-600'
                        : 'bg-cream-50 text-ink-600 hover:bg-cream-150'
                    }`}
                    title={`${entry.toolLabel} · ${entry.language}`}
                  >
                    <FileText size={10} className="shrink-0" />
                    <span className="font-mono tabular-nums">
                      +{entry.added}/-{entry.removed}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
