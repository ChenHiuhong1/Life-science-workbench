import { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle, Square, FolderOpen, FolderPlus, X, ShieldCheck, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import type { AgentInfo, Message } from '@/types';
import { BrandAvatar } from '@/components/BrandMark';
import { CodeBlock } from './CodeBlock';
import { AgentPresets } from './AgentPresets';
import { ToolCallCard, type ToolEvent } from './ToolCallCard';

export function ChatView({ agents: _agents }: { agents: AgentInfo[] }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const {
    agent, currentSessionId, messages, addMessage, appendToMessage, loadArtifacts,
    createSession, patchMessageById, setStreamingState, streamingSessions,
  } = useStore();
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectPath =
    projects.find((p) => p.id === currentProjectId)?.local_path || '';
  const [input, setInput] = useState('');
  // Errors are kept per session so a background stream's failure never leaks
  // into whatever session the user is currently viewing (module isolation).
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The set of assistant message ids that are actively streaming right now, so
  // several concurrent streams in one session each keep their own caret.
  const [streamingIds, setStreamingIds] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Record<string, AbortController>>({});
  // Stick-to-bottom: only auto-scroll while the user is already parked near the
  // bottom, so scrolling up to read earlier output is never yanked back down
  // (matches Claude / Codex desktop behavior).
  const stickToBottomRef = useRef(true);

  const errorKey = currentSessionId || '_';
  const error = errors[errorKey] || '';
  const setErrorFor = (key: string, message: string) =>
    setErrors((prev) => (prev[key] === message ? prev : { ...prev, [key]: message }));

  const markStreaming = (id: number, active: boolean) =>
    setStreamingIds((prev) => {
      if (active) return { ...prev, [id]: true };
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const onScroll = () => {
    stickToBottomRef.current = isNearBottom();
  };

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // On session switch, re-pin to the bottom and jump to the latest message so a
  // freshly opened session never inherits the previous session's scroll state.
  useEffect(() => {
    stickToBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentSessionId]);

  const currentSessionStreaming = currentSessionId ? !!streamingSessions[currentSessionId] : false;

  const send = async () => {
    if (!input.trim()) return;

    let sid = currentSessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) {
        setErrorFor(errorKey, 'Create or select a project first.');
        return;
      }
    }

    const userText = input.trim();
    setInput('');
    setErrorFor(sid, '');
    stickToBottomRef.current = true;

    const history = [...messages.filter((m) => m.id !== -1), { role: 'user', content: userText }]
      .map((m) => ({ role: m.role, content: m.content }));

    const assistantId = Date.now() + 1;
    addMessage({ id: Date.now(), role: 'user', content: userText });
    addMessage({ id: assistantId, role: 'assistant', content: '', toolEvents: [] });

    const streamSid = sid;
    const streamKey = `${streamSid}:${assistantId}`;
    activeStreamsRef.current.add(streamKey);
    setStreamingState(streamSid, true);
    markStreaming(assistantId, true);

    try {
      const controller = new AbortController();
      controllersRef.current[streamKey] = controller;
      const resp = await api.chatStream(
        { session_id: streamSid, agent, messages: history, language: lang, project_path: currentProjectPath },
        controller.signal
      );
      if (!resp.ok) throw new Error(await resp.text());
      if (!resp.body) throw new Error('The chat stream did not return a response body.');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const pendingTools: Record<string, ToolEvent[]> = {};

      const addToolEvent = (ev: ToolEvent) => {
        const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
        const events = [...(cur?.toolEvents || []), ev];
        patchMessageById(streamSid, assistantId, { toolEvents: events });
      };
      const updateToolEvent = (id: string, patch: Partial<ToolEvent>) => {
        const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
        const events = (cur?.toolEvents || []).map((ev) => (ev.id === id ? { ...ev, ...patch } : ev));
        patchMessageById(streamSid, assistantId, { toolEvents: events });
      };

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
              appendToMessage(streamSid, assistantId, evt.content);
            } else if (evt.type === 'tool_call') {
              const tid = `${evt.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
              const toolEvent = {
                id: tid,
                name: evt.name,
                args: evt.args,
                status: 'calling',
                contentOffset: cur?.content?.length || 0,
              } as ToolEvent;
              pendingTools[evt.name] = [...(pendingTools[evt.name] || []), toolEvent];
              addToolEvent(toolEvent);
            } else if (evt.type === 'tool_result') {
              const pt = pendingTools[evt.name]?.shift();
              const resultText = String(evt.result ?? '');
              const failed = /^\[tool error\]|^Error:/i.test(resultText.trim());
              if (pt) updateToolEvent(pt.id, { status: failed ? 'error' : 'done', result: resultText });
              loadArtifacts(streamSid);
              // Surface tool failures inline in the conversation so the user
              // sees them as an assistant reply (matches lobe-chat / assistant-ui
              // behavior) instead of a silent corner badge with an empty bubble.
              if (pt && /^\[tool error\]/i.test(resultText)) {
                const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
                const prefix = cur?.content?.trim() ? `${cur.content}\n\n` : '';
                patchMessageById(streamSid, assistantId, { content: `${prefix}Warning: ${resultText.trim()}` });
              }
            } else if (evt.type === 'error') {
              // Bind the error to its own stream's session so it never leaks
              // into whatever session the user is currently viewing.
              if (!evt.session_id || evt.session_id === streamSid) {
                setErrorFor(streamSid, evt.message);
                // Also write it into the assistant bubble so the conversation
                // always shows what went wrong (no more "blank after error").
                const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
                const prefix = cur?.content?.trim() ? `${cur.content}\n\n` : '';
                patchMessageById(streamSid, assistantId, { content: `${prefix}Warning: ${evt.message}` });
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
        const stoppedText = cur?.content?.trim()
          ? `${cur.content}\n\n_${t('chat.output_stopped')}_`
          : t('chat.output_stopped');
        patchMessageById(streamSid, assistantId, { content: stoppedText });
      } else {
        const msg = e?.message || 'Connection failed. Make sure the backend is running.';
        setErrorFor(streamSid, msg);
        // Network/parse failure must also land in the bubble, not vanish.
        const cur = (useStore.getState().messagesBySession[streamSid] || []).find((m) => m.id === assistantId);
        const prefix = cur?.content?.trim() ? `${cur.content}\n\n` : '';
        patchMessageById(streamSid, assistantId, { content: `${prefix}Warning: ${msg}` });
      }
    } finally {
      markStreaming(assistantId, false);
      delete controllersRef.current[streamKey];
      activeStreamsRef.current.delete(streamKey);
      const stillActiveForSid = Array.from(activeStreamsRef.current)
        .some((key) => key.startsWith(`${streamSid}:`));
      setStreamingState(streamSid, stillActiveForSid);
      loadArtifacts(streamSid);
    }
  };

  const stopCurrent = () => {
    if (!currentSessionId) return;
    for (const [key, controller] of Object.entries(controllersRef.current)) {
      if (key.startsWith(`${currentSessionId}:`)) {
        controller.abort();
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const openFolder = (path: string) => {
    if (path) api.fsOpenFolder(path).catch(() => {});
  };

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-cream-50">
      <WorkspaceBar
        path={currentProjectPath}
        onOpen={() => openFolder(currentProjectPath)}
      />
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 ? (
            <EmptyState agent={agent} t={t} />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} streaming={!!streamingIds[m.id]} agent={agent} />
            ))
          )}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FDF0F0] border border-err/20 text-xs text-err">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button
                className="shrink-0 text-err/60 hover:text-err"
                onClick={() => setErrorFor(errorKey, '')}
                title={t('common.cancel')}
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-cream-300 bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <AgentPresets onInject={(text) => setInput((prev) => (prev ? prev + '\n' : '') + text)} />
          <div className="relative flex items-end gap-2 card p-2">
            <textarea
              className="flex-1 resize-none bg-transparent text-sm text-ink-900 placeholder:text-ink-300
                         focus:outline-none px-2 py-1.5 max-h-32 min-h-[40px]"
              rows={1}
              placeholder={currentSessionStreaming ? t('chat.streaming_placeholder') : t('chat.placeholder')}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
              onKeyDown={onKeyDown}
            />
            <button
              className={currentSessionStreaming ? 'btn-outline px-3 py-2 shrink-0 text-err hover:bg-[#FDF0F0]' : 'btn-primary px-3 py-2 shrink-0'}
              onClick={currentSessionStreaming ? stopCurrent : send}
              disabled={currentSessionStreaming ? false : !input.trim()}
              title={currentSessionStreaming ? 'Stop current response' : 'Send message'}
            >
              {currentSessionStreaming ? <Square size={13} /> : <Send size={14} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-2">
            <span className="text-[10px] text-ink-300">
              {currentSessionStreaming ? (
                <span className="text-clay-500">Streaming - you can keep typing</span>
              ) : (
                'Enter to send - Shift+Enter for a new line'
              )}
            </span>
            <span className="text-[10px] text-ink-300">
              {currentSessionId ? `session ${currentSessionId.slice(0, 8)}` : 'New chat starts on first send'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ agent, t }: { agent: string; t: (k: any) => string }) {
  const guides: Record<string, string> = {
    chat: 'General chat - run Python/R code when needed',
    brainstorm: 'Study design - literature-grounded hypothesis planning',
    bio: 'bulk RNA-seq / single-cell / spatial multiomics analysis',
    protocol: 'Protocol building / data processing / Q&A',
    reviewer: 'Multi-domain scientific review',
    module: 'Workflow extraction / module packaging / harness specs',
  };
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BrandAvatar size={56} rounded="rounded-2xl" className="mb-4" />
      <p className="text-base font-serif text-ink-700 mb-1">{guides[agent] || t('chat.empty.title')}</p>
      <p className="text-xs text-ink-300">{t('chat.empty.desc')}</p>
    </div>
  );
}

function MessageBubble({ message, streaming, agent }: { message: Message; streaming?: boolean; agent: string }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-clay-500 text-white rounded-lg rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  const hasTools = !!(message.toolEvents && message.toolEvents.length > 0);
  const showTypingDots = streaming && !message.content && !hasTools;
  return (
    <div className="flex gap-3">
      <BrandAvatar
        size={28}
        rounded={streaming ? 'rounded-full animate-pulse-slow' : 'rounded-full'}
      />
      <div className="flex-1 min-w-0">
        {showTypingDots ? (
          <TypingDots />
        ) : (
          <MessageTimeline
            content={message.content}
            toolEvents={message.toolEvents || []}
            streaming={streaming}
          />
        )}
        {!streaming && message.content?.trim() && (
          <AssistantOutputReview content={message.content} agent={agent} />
        )}
      </div>
    </div>
  );
}

function MessageTimeline({
  content,
  toolEvents,
  streaming,
}: {
  content: string;
  toolEvents: ToolEvent[];
  streaming?: boolean;
}) {
  if (!toolEvents.length) {
    return (
      <div className={`prose prose-sm max-w-none text-sm ${streaming ? 'stream-active' : ''}`}>
        <MarkdownRender content={content} />
      </div>
    );
  }

  const ordered = toolEvents.map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.contentOffset ?? 0) - (b.event.contentOffset ?? 0) || a.index - b.index);
  const blocks: JSX.Element[] = [];
  let cursor = 0;

  ordered.forEach(({ event }, idx) => {
    const offset = Math.max(cursor, Math.min(event.contentOffset ?? 0, content.length));
    const chunk = content.slice(cursor, offset);
    if (chunk) {
      blocks.push(
        <div key={`text-${event.id}-${idx}`} className="prose prose-sm max-w-none text-sm">
          <MarkdownRender content={chunk} />
        </div>
      );
    }
    blocks.push(<ToolCallCard key={event.id} event={event} />);
    cursor = offset;
  });

  const tail = content.slice(cursor);
  if (tail || streaming) {
    blocks.push(
      <div key="text-tail" className={`prose prose-sm max-w-none text-sm ${streaming ? 'stream-active' : ''}`}>
        <MarkdownRender content={tail} />
      </div>
    );
  }

  return <div>{blocks}</div>;
}

function AssistantOutputReview({ content, agent }: { content: string; agent: string }) {
  const lang = useI18n((s) => s.lang);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectPath =
    projects.find((p) => p.id === currentProjectId)?.local_path || '';
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const reviewType = content.includes('```') ? 'code' : agent === 'document' ? 'document' : 'assistant_output';

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
        { document_text: content, document_type: reviewType, language: lang, project_path: currentProjectPath },
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
        setError(e.message || 'Review failed.');
      }
    } finally {
      setReviewing(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="mt-2">
      <button
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-cream-300 bg-white px-2 py-1 text-[11px] text-ink-500 hover:bg-cream-100"
        onClick={open && review ? () => setOpen((v) => !v) : runReview}
        title="Review this output"
      >
        {reviewing ? <Loader2 size={12} className="animate-spin text-clay-500" /> : <ShieldCheck size={12} />}
        <span>{reviewing ? 'Reviewing' : open && review ? 'Hide review' : 'Review output'}</span>
      </button>
      {open && (reviewing || review || error) && (
        <div className="mt-2 rounded-lg border border-cream-300 bg-cream-50 p-3">
          {error ? (
            <div className="flex items-start gap-2 text-xs text-err">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{error}</span>
            </div>
          ) : review ? (
            <div className={`prose prose-sm max-w-none text-sm ${reviewing ? 'stream-active' : ''}`}>
              <MarkdownRender content={review} />
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

function TypingDots() {
  return (
    <div className="flex items-center gap-1 h-5 pl-0.5" aria-label="thinking">
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
      <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
    </div>
  );
}

function MarkdownRender({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }: any) {
          const text = String(children);
          const match = /language-(\w+)/.exec(className || '');
          const isBlock = (!className && text.includes('\n')) || match;
          if (isBlock && match) {
            return <CodeBlock code={text.replace(/\n$/, '')} language={match[1]} />;
          }
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function WorkspaceBar({ path, onOpen }: { path: string; onOpen: () => void }) {
  const t = useI18n((s) => s.t);
  if (path) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-cream-200 bg-cream-100/60 text-xs">
        <FolderOpen size={12} className="shrink-0 text-clay-500" />
        <span className="text-ink-400">{t('chat.workspace')}</span>
        <span className="truncate flex-1 font-mono text-ink-700" title={path}>{path}</span>
        <button
          className="text-ink-400 hover:text-clay-600 shrink-0"
          onClick={onOpen}
          title={t('nav.open_folder')}
        >
          <ExternalLinkIcon />
        </button>
      </div>
    );
  }
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-cream-200 bg-cream-100/60 text-xs text-ink-400">
      <FolderPlus size={12} className="shrink-0" />
      <span>{t('chat.no_workspace')}</span>
    </div>
  );
}

function ExternalLinkIcon() {
  // tiny inline to avoid an extra lucide import name clash
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
