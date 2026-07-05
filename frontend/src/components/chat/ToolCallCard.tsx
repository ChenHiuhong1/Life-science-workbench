import { useState } from 'react';
import { ChevronRight, Wrench, CheckCircle2, Loader2, ChevronDown } from 'lucide-react';

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
  search_literature: 'Search Literature',
};

export function ToolCallCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[event.name] || event.name;

  return (
    <div className="my-2 rounded-lg border border-cream-300 bg-cream-50 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-100 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={13} className="text-ink-400 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-ink-400 shrink-0" />
        )}
        <Wrench size={13} className="text-clay-500 shrink-0" />
        <span className="text-xs font-medium text-ink-700">{label}</span>

        {event.args && (
          <span className="text-[11px] text-ink-400 truncate flex-1 font-mono">
            {summarizeArgs(event.name, event.args)}
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

      {expanded && (
        <div className="border-t border-cream-300 px-3 py-2 space-y-2 bg-white">
          {event.args && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-300 mb-1">Arguments</div>
              <pre className="bg-[#1E1E1E] text-[#E4E4E4] rounded p-2 text-[11px] font-mono overflow-x-auto max-h-40">
                {JSON.stringify(event.args, null, 2)}
              </pre>
            </div>
          )}
          {event.result && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-300 mb-1">Result</div>
              <pre className="bg-cream-100 text-ink-700 rounded p-2 text-[11px] font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
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
