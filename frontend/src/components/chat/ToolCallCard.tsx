import { useState } from 'react';
import { ChevronRight, Wrench, CheckCircle2, Loader2, ChevronDown, FileCode2 } from 'lucide-react';
import { useStore, type CodeReviewEntry } from '@/store';

export interface ToolEvent {
  id: string;
  name: string;
  args?: any;
  status: 'calling' | 'done' | 'error';
  result?: string;
  contentOffset?: number;
}

const TOOL_LABELS: Record<string, string> = {
  run_python: 'Run Python',
  run_r: 'Run R',
  search_literature: 'Search Sources',
};

export function ToolCallCard({ event, previousCode = '' }: { event: ToolEvent; previousCode?: string }) {
  const [expanded, setExpanded] = useState(false);
  const openCodeReview = useStore((s) => s.openCodeReview);
  const label = TOOL_LABELS[event.name] || event.name;
  const code = isCodeTool(event.name) ? String(event.args?.code || '') : '';
  const diff = code ? buildLineDiff(previousCode, code) : null;
  const language = event.name === 'run_r' ? 'R' : 'Python';
  const argsSummary = event.args ? summarizeArgs(event.name, event.args) : undefined;

  const openReview = () => {
    if (!diff) return;
    openCodeReview({
      id: event.id,
      language,
      added: diff.added,
      removed: diff.removed,
      lines: diff.lines,
      toolLabel: label,
      argsSummary,
    });
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg bg-cream-100 shadow-card">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-cream-150"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={13} className="text-ink-400 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-ink-400 shrink-0" />
        )}
        <Wrench size={13} className="shrink-0 text-clay-500" />
        <span className="text-xs font-medium text-ink-700">{label}</span>

        {event.args && (
          <span className="text-[11px] text-ink-500 truncate flex-1 font-mono">
            {argsSummary}
          </span>
        )}

        <span className="shrink-0 ml-auto">
          {event.status === 'calling' && (
            <span className="flex items-center gap-1 text-[11px] text-clay-500">
              <Loader2 size={11} className="animate-spin" /> Running
            </span>
          )}
          {event.status === 'done' && (
            <span className="flex items-center gap-1 text-[11px] text-ok">
              <CheckCircle2 size={11} /> Done
            </span>
          )}
          {event.status === 'error' && (
            <span className="text-[11px] text-err">Failed</span>
          )}
        </span>
      </button>

      {/* A compact "Review code" affordance — the full diff no longer crowds
          the streaming window. Click to open it in the side review panel. */}
      {diff && (
        <button
          type="button"
          onClick={openReview}
          className="flex w-full items-center gap-2 border-t border-cream-200 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-cream-150"
          title="Open code review in side panel"
        >
          <FileCode2 size={12} className="shrink-0 text-clay-500" />
          <span className="font-medium text-ink-600">{language} code review</span>
          <span className="ml-auto font-mono tabular-nums">
            <span className="text-ok">+{diff.added}</span>
            <span className="mx-1 text-ink-400">/</span>
            <span className="text-err">-{diff.removed}</span>
          </span>
          <span className="ml-2 hidden text-ink-500 sm:inline">Review →</span>
        </button>
      )}

      {expanded && (
        <div className="space-y-2 border-t border-cream-200 bg-cream-100 px-3 py-2">
          {event.args && (
            <div>
              <div className="text-[10px] font-medium text-ink-500 mb-1">Arguments</div>
              <pre className="max-h-40 overflow-x-auto rounded bg-ink-900 p-2 font-mono text-[11px] text-cream-100">
                {JSON.stringify(redactVerboseCode(event.args), null, 2)}
              </pre>
            </div>
          )}
          {event.result && (
            <div>
              <div className="text-[10px] font-medium text-ink-500 mb-1">Result</div>
              <pre className="max-h-60 overflow-x-auto whitespace-pre-wrap rounded bg-cream-50 p-2 font-mono text-[11px] text-ink-700">
                {event.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeArgs(name: string, args: any): string {
  if (!args) return '';
  if (name === 'search_literature') {
    return `query="${args.query || ''}"` + (args.sources ? ` - ${args.sources.join('/')}` : '');
  }
  if (name === 'run_python' || name === 'run_r') {
    const code = args.code || '';
    const firstLine = code.split('\n').find((line: string) => line.trim()) || '';
    return firstLine.slice(0, 60) + (code.length > 60 ? '...' : '');
  }
  return JSON.stringify(args).slice(0, 60);
}

function isCodeTool(name: string): boolean {
  return name === 'run_python' || name === 'run_r';
}

function redactVerboseCode(args: any): any {
  if (!args || typeof args !== 'object' || !('code' in args)) return args;
  const code = String(args.code || '');
  return {
    ...args,
    code: `[shown in live code review: ${splitLines(code).length} lines]`,
  };
}

function splitLines(code: string): string[] {
  if (!code) return [];
  return code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string; lineNumber: number };

function buildLineDiff(previous: string, next: string): { added: number; removed: number; lines: DiffLine[] } {
  const oldLines = splitLines(previous);
  const newLines = splitLines(next);
  if (!oldLines.length) {
    return {
      added: newLines.length,
      removed: 0,
      lines: newLines.map((text, index) => ({ type: 'add', text, lineNumber: index + 1 })),
    };
  }

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const before = newLines.slice(Math.max(0, prefix - 3), prefix);
  const afterStart = newLines.length - suffix;
  const after = newLines.slice(afterStart, Math.min(newLines.length, afterStart + 3));
  const lines: DiffLine[] = [];

  before.forEach((text, index) => {
    lines.push({ type: 'ctx', text, lineNumber: Math.max(1, prefix - before.length + index + 1) });
  });
  removed.forEach((text, index) => {
    lines.push({ type: 'del', text, lineNumber: prefix + index + 1 });
  });
  added.forEach((text, index) => {
    lines.push({ type: 'add', text, lineNumber: prefix + index + 1 });
  });
  after.forEach((text, index) => {
    lines.push({ type: 'ctx', text, lineNumber: afterStart + index + 1 });
  });

  return { added: added.length, removed: removed.length, lines };
}
