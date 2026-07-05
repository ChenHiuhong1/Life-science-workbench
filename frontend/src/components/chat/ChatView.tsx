import { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle, Square, FlaskConical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import type { AgentInfo, Message } from '@/types';
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
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const currentSessionStreaming = currentSessionId ? !!streamingSessions[currentSessionId] : streaming;

  const send = async () => {
    if (!input.trim()) return;

    let sid = currentSessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) {
        setError('Create or select a project first.');
        return;
      }
    }

    const userText = input.trim();
    setInput('');
    setError('');

    const history = [...messages.filter((m) => m.id !== -1), { role: 'user', content: userText }]
      .map((m) => ({ role: m.role, content: m.content }));

    const assistantId = Date.now() + 1;
    addMessage({ id: Date.now(), role: 'user', content: userText });
    addMessage({ id: assistantId, role: 'assistant', content: '', toolEvents: [] });

    const streamSid = sid;
    const streamKey = `${streamSid}:${assistantId}`;
    activeStreamsRef.current.add(streamKey);
    setStreamingState(streamSid, true);
    setStreaming(true);

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
              const toolEvent = { id: tid, name: evt.name, args: evt.args, status: 'calling' } as ToolEvent;
              pendingTools[evt.name] = [...(pendingTools[evt.name] || []), toolEvent];
              addToolEvent(toolEvent);
            } else if (evt.type === 'tool_result') {
              const pt = pendingTools[evt.name]?.shift();
              if (pt) updateToolEvent(pt.id, { status: 'done', result: String(evt.result).slice(0, 4000) });
              loadArtifacts(streamSid);
            } else if (evt.type === 'error') {
              setError(evt.message);
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
        setError(e.message || 'Connection failed. Make sure the backend is running.');
      }
    } finally {
      delete controllersRef.current[streamKey];
      activeStreamsRef.current.delete(streamKey);
      setStreaming(activeStreamsRef.current.size > 0);
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

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-cream-50">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 ? (
            <EmptyState agent={agent} t={t} />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} streaming={currentSessionStreaming} />
            ))
          )}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FDF0F0] border border-err/20 text-xs text-err">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
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
      <div className="w-14 h-14 rounded-full bg-clay-50 border border-clay-100 flex items-center justify-center mb-4">
        <FlaskConical size={22} className="text-clay-500" strokeWidth={1.5} />
      </div>
      <p className="text-base font-serif text-ink-700 mb-1">{guides[agent] || t('chat.empty.title')}</p>
      <p className="text-xs text-ink-300">{t('chat.empty.desc')}</p>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: Message; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-clay-500 text-white rounded-lg rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 shrink-0 rounded-full bg-cream-100 border border-cream-300 flex items-center justify-center">
        <FlaskConical size={14} className="text-clay-500" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="mb-2">
            {message.toolEvents.map((ev) => (
              <ToolCallCard key={ev.id} event={ev} />
            ))}
          </div>
        )}
        <div className={`prose prose-sm max-w-none text-sm ${streaming && !message.content ? 'stream-cursor' : ''}`}>
          <MarkdownRender content={message.content} />
        </div>
      </div>
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
