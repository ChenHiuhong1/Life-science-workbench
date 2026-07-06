import { useEffect, useRef, useState, memo } from 'react';
import { Send, AlertCircle, Square, FolderOpen, FolderPlus, X, ShieldCheck, Loader2, Brain, ListChecks, Plus, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import type { AgentInfo, AgentKey, Message } from '@/types';
import { BrandAvatar } from '@/components/BrandMark';
import { CodeBlock } from './CodeBlock';
import { AgentPresets } from './AgentPresets';
import { ToolCallCard, type ToolEvent } from './ToolCallCard';

// Parse a long-task plan the agent emitted inside a ```sw-plan fence.
// Returns the numbered step lines (trimmed); empty when no plan is present.
function extractPlanItems(content: string): string[] {
  const match = content.match(/```sw-plan\s*([\s\S]*?)```/i);
  if (!match) return [];
  const body = match[1];
  const items: string[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Accept "1. ..." / "- ..." / "*" lines; keep everything else (context
    // lines) as plain items too, so the user sees the agent's framing.
    items.push(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, ''));
  }
  return items.slice(0, 30);
}

export function ChatView({ agents: _agents }: { agents: AgentInfo[] }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const agent = useStore((s) => s.agent);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const messages = useStore((s) => s.messages);
  const addMessage = useStore((s) => s.addMessage);
  const addMessageToSession = useStore((s) => s.addMessageToSession);
  const appendToMessage = useStore((s) => s.appendToMessage);
  const loadArtifacts = useStore((s) => s.loadArtifacts);
  const createSession = useStore((s) => s.createSession);
  const patchMessageById = useStore((s) => s.patchMessageById);
  const setStreamingState = useStore((s) => s.setStreamingState);
  const updateSessionTitle = useStore((s) => s.updateSessionTitle);
  const currentProjectPath = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId)?.local_path || ''
  );
  const currentSessionStreaming = useStore((s) =>
    currentSessionId ? !!s.streamingSessions[currentSessionId] : false
  );
  const [input, setInput] = useState('');
  // Per-message thinking tier override. Default 'max' matches the global
  // setting; the user can dial it down per message in the chat box.
  const [effort, setEffort] = useState<'none' | 'high' | 'max'>('max');
  // Pending long-task plan the agent proposed and is waiting for the user to
  // confirm/edit before executing. Mirrors the harness-core "planning gate".
  const [pendingPlan, setPendingPlan] = useState<{ sid: string; agent: AgentKey; projectPath: string; items: string[] } | null>(null);
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
    const streamAgent = agent;
    const streamProjectPath = currentProjectPath;
    const streamKey = `${streamSid}:${assistantId}`;
    activeStreamsRef.current.add(streamKey);
    setStreamingState(streamSid, true);
    markStreaming(assistantId, true);

    try {
      const controller = new AbortController();
      controllersRef.current[streamKey] = controller;
      const resp = await api.chatStream(
        { session_id: streamSid, agent: streamAgent, messages: history, language: lang, project_path: streamProjectPath, reasoning_effort: effort },
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
            if (evt.type === 'meta') {
              // Backend may have just renamed the session (first-message
              // summary); reflect it in the sidebar immediately.
              if (evt.title) updateSessionTitle(streamSid, evt.title);
            } else if (evt.type === 'delta') {
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
      // After the stream finishes, look for a long-task plan the agent proposed
      // (harness-core "planning gate": ```sw-plan ... ```). If present, pop a
      // confirmation modal instead of letting the agent run on automatically.
      const finalContent = (useStore.getState().messagesBySession[streamSid] || [])
        .find((m) => m.id === assistantId)?.content || '';
      const items = extractPlanItems(finalContent);
      if (items.length) setPendingPlan({ sid: streamSid, agent: streamAgent, projectPath: streamProjectPath, items });
    }
  };

  // Send arbitrary text through the normal streaming pipeline (used to feed a
  // confirmed/edited plan back to the agent as the user's go-ahead).
  const sendRaw = async (
    text: string,
    targetSid = currentSessionId || '',
    targetAgent: AgentKey = agent,
    targetProjectPath = currentProjectPath
  ) => {
    if (!text.trim()) return;
    const sid = targetSid;
    if (!sid) return;
    setInput('');
    setErrorFor(sid, '');
    stickToBottomRef.current = true;
    const cur = useStore.getState().messagesBySession[sid] || [];
    const history = [...cur.filter((m) => m.id !== -1), { role: 'user', content: text }]
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = Date.now() + 1;
    addMessageToSession(sid, { id: Date.now(), role: 'user', content: text });
    addMessageToSession(sid, { id: assistantId, role: 'assistant', content: '', toolEvents: [] });
    const streamKey = `${sid}:${assistantId}`;
    activeStreamsRef.current.add(streamKey);
    setStreamingState(sid, true);
    markStreaming(assistantId, true);
    const controller = new AbortController();
    controllersRef.current[streamKey] = controller;
    try {
      const resp = await api.chatStream(
        { session_id: sid, agent: targetAgent, messages: history, language: lang, project_path: targetProjectPath, reasoning_effort: effort },
        controller.signal
      );
      if (!resp.ok || !resp.body) throw new Error(await resp.text());
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const pendingTools: Record<string, ToolEvent[]> = {};
      const addToolEvent = (ev: ToolEvent) => {
        const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
        const events = [...(curMessage?.toolEvents || []), ev];
        patchMessageById(sid, assistantId, { toolEvents: events });
      };
      const updateToolEvent = (id: string, patch: Partial<ToolEvent>) => {
        const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
        const events = (curMessage?.toolEvents || []).map((ev) => (ev.id === id ? { ...ev, ...patch } : ev));
        patchMessageById(sid, assistantId, { toolEvents: events });
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
            if (evt.type === 'meta' && evt.title) {
              updateSessionTitle(sid, evt.title);
            } else if (evt.type === 'delta') {
              appendToMessage(sid, assistantId, evt.content);
            } else if (evt.type === 'tool_call') {
              const tid = `${evt.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
              const toolEvent = {
                id: tid,
                name: evt.name,
                args: evt.args,
                status: 'calling',
                contentOffset: curMessage?.content?.length || 0,
              } as ToolEvent;
              pendingTools[evt.name] = [...(pendingTools[evt.name] || []), toolEvent];
              addToolEvent(toolEvent);
            } else if (evt.type === 'tool_result') {
              const pt = pendingTools[evt.name]?.shift();
              const resultText = String(evt.result ?? '');
              const failed = /^\[tool error\]|^Error:/i.test(resultText.trim());
              if (pt) updateToolEvent(pt.id, { status: failed ? 'error' : 'done', result: resultText });
              loadArtifacts(sid);
              if (pt && /^\[tool error\]/i.test(resultText)) {
                const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
                const prefix = curMessage?.content?.trim() ? `${curMessage.content}\n\n` : '';
                patchMessageById(sid, assistantId, { content: `${prefix}Warning: ${resultText.trim()}` });
              }
            } else if (evt.type === 'error') {
              if (!evt.session_id || evt.session_id === sid) {
                setErrorFor(sid, evt.message);
                const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
                const prefix = curMessage?.content?.trim() ? `${curMessage.content}\n\n` : '';
                patchMessageById(sid, assistantId, { content: `${prefix}Warning: ${evt.message}` });
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
        const stoppedText = curMessage?.content?.trim()
          ? `${curMessage.content}\n\n_${t('chat.output_stopped')}_`
          : t('chat.output_stopped');
        patchMessageById(sid, assistantId, { content: stoppedText });
      } else {
        const msg = e?.message || 'Connection failed.';
        setErrorFor(sid, msg);
        const curMessage = (useStore.getState().messagesBySession[sid] || []).find((m) => m.id === assistantId);
        const prefix = curMessage?.content?.trim() ? `${curMessage.content}\n\n` : '';
        patchMessageById(sid, assistantId, { content: `${prefix}Warning: ${msg}` });
      }
    } finally {
      markStreaming(assistantId, false);
      delete controllersRef.current[streamKey];
      activeStreamsRef.current.delete(streamKey);
      const still = Array.from(activeStreamsRef.current).some((k) => k.startsWith(`${sid}:`));
      setStreamingState(sid, still);
      loadArtifacts(sid);
      const finalContent = (useStore.getState().messagesBySession[sid] || [])
        .find((m) => m.id === assistantId)?.content || '';
      const items = extractPlanItems(finalContent);
      if (items.length) setPendingPlan({ sid, agent: targetAgent, projectPath: targetProjectPath, items });
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
    <section className="flex-1 flex flex-col overflow-hidden bg-cream-50/70">
      <WorkspaceBar
        path={currentProjectPath}
        onOpen={() => openFolder(currentProjectPath)}
      />
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {messages.length === 0 ? (
            <EmptyState agent={agent} t={t} />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} streaming={!!streamingIds[m.id]} agent={agent} />
            ))
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-err/20 bg-err/10 px-3 py-2 text-xs text-err">
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

      <div className="shrink-0 border-t border-cream-300 bg-cream-50/95 px-5 py-3.5 shadow-[0_-10px_32px_rgba(80,50,28,0.06)]">
        <div className="mx-auto max-w-4xl">
          <AgentPresets onInject={(text) => setInput((prev) => (prev ? prev + '\n' : '') + text)} />
          <div className="relative flex items-end gap-2 rounded-xl border border-cream-300 bg-white/95 p-2 shadow-card">
            <textarea
              className="flex-1 resize-none bg-transparent text-sm text-ink-900 placeholder:text-ink-300
                         focus:outline-none px-2.5 py-2 max-h-32 min-h-[44px]"
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
              className={currentSessionStreaming ? 'btn-outline px-3 py-2 shrink-0 text-err hover:bg-err/10' : 'btn-primary px-3 py-2 shrink-0'}
              onClick={currentSessionStreaming ? stopCurrent : send}
              disabled={currentSessionStreaming ? false : !input.trim()}
              title={currentSessionStreaming ? 'Stop current response' : 'Send message'}
            >
              {currentSessionStreaming ? <Square size={13} /> : <Send size={14} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-2 gap-2">
            <span className="text-[10px] text-ink-400 shrink-0">
              {currentSessionStreaming ? (
                <span className="text-clay-500">Streaming - you can keep typing</span>
              ) : (
                'Enter to send - Shift+Enter for a new line'
              )}
            </span>
            <ContextAndEffortBar
              messages={messages}
              input={input}
              effort={effort}
              onEffort={setEffort}
              streaming={!!currentSessionStreaming}
            />
            <span className="text-[10px] text-ink-400 shrink-0">
              {currentSessionId ? `session ${currentSessionId.slice(0, 8)}` : 'New chat starts on first send'}
            </span>
          </div>
        </div>
      </div>
      {pendingPlan && (
        <PlanConfirmModal
          items={pendingPlan.items}
          onCancel={() => setPendingPlan(null)}
          onConfirm={(editedItems, note) => {
            const target = pendingPlan;
            const plan = editedItems.map((it, i) => `${i + 1}. ${it}`).join('\n');
            setPendingPlan(null);
            const goMsg = note?.trim()
              ? `Plan confirmed (edited). Proceed:\n${plan}\n\nAdditional note: ${note.trim()}`
              : `Plan confirmed. Proceed:\n${plan}`;
            sendRaw(goMsg, target.sid, target.agent, target.projectPath);
          }}
        />
      )}
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
      <BrandAvatar size={60} rounded="rounded-2xl" className="mb-4 shadow-card" />
      <p className="mb-1 font-serif text-lg font-semibold text-ink-900">{guides[agent] || t('chat.empty.title')}</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-400">{t('chat.empty.desc')}</p>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message, streaming, agent }: { message: Message; streaming?: boolean; agent: string }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl rounded-tr-sm border border-clay-100 bg-clay-50 px-4 py-2.5 text-sm leading-relaxed text-ink-900 shadow-subtle whitespace-pre-wrap">
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
});

const MessageTimeline = memo(function MessageTimeline({
  content,
  toolEvents,
  streaming,
}: {
  content: string;
  toolEvents: ToolEvent[];
  streaming?: boolean;
}) {
  if (!toolEvents.length) {
    // Pure-text message: render Markdown when stable, plain-text-with-caret
    // while streaming. Streaming the tail as plain text avoids re-parsing the
    // growing Markdown AST on every token (the main cause of input lag during
    // a long generation). Once the stream ends we switch back to full Markdown.
    if (streaming) {
      return (
        <div className="prose prose-sm max-w-none text-sm stream-active">
          <PlainText content={content} />
        </div>
      );
    }
    return (
      <div className="prose prose-sm max-w-none text-sm">
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
    // The tail (everything after the last tool call) is what is actively
    // streaming; render it as plain text while streaming to skip per-token
    // Markdown re-parsing, then fall back to Markdown once done.
    if (streaming) {
      blocks.push(
        <div key="text-tail" className="prose prose-sm max-w-none text-sm stream-active">
          <PlainText content={tail} />
        </div>
      );
    } else {
      blocks.push(
        <div key="text-tail" className="prose prose-sm max-w-none text-sm">
          <MarkdownRender content={tail} />
        </div>
      );
    }
  }

  return <div>{blocks}</div>;
});

// Cheap whitespace-preserving text block used only for the actively-streaming
// tail. Keeps the caret affordance from .stream-active working.
const PlainText = memo(function PlainText({ content }: { content: string }) {
  return <span className="whitespace-pre-wrap break-words">{content}</span>;
});

const MarkdownRender = memo(function MarkdownRender({ content }: { content: string }) {
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
});

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
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-cream-300 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink-500 hover:bg-cream-100"
        onClick={open && review ? () => setOpen((v) => !v) : runReview}
        title="Review this output"
      >
        {reviewing ? <Loader2 size={12} className="animate-spin text-clay-500" /> : <ShieldCheck size={12} />}
        <span>{reviewing ? 'Reviewing' : open && review ? 'Hide review' : 'Review output'}</span>
      </button>
      {open && (reviewing || review || error) && (
        <div className="mt-2 rounded-lg border border-cream-300 bg-white/70 p-3">
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

// Rough context-window meter. Tokens are estimated from character count
// (~4 chars/token for mixed EN/code). The window is fetched from the backend
// so it matches the *actual* configured model (e.g. GLM-5.2 = 128K,
// GLM-5.2[1m] = 1M), not a hard-coded guess.
const FALLBACK_CONTEXT_WINDOW_TOKENS = 128_000;
const CHARS_PER_TOKEN = 4;

function ContextAndEffortBar({
  messages,
  input,
  effort,
  onEffort,
  streaming,
}: {
  messages: { role: string; content: string }[];
  input: string;
  effort: 'none' | 'high' | 'max';
  onEffort: (e: 'none' | 'high' | 'max') => void;
  streaming: boolean;
}) {
  // Fetch the real context window for the configured model (GLM-5.2 = 128K,
  // GLM-5.2[1m] = 1M, etc.) once on mount so the meter is accurate.
  const [windowTokens, setWindowTokens] = useState(FALLBACK_CONTEXT_WINDOW_TOKENS);
  const [modelName, setModelName] = useState('');
  useEffect(() => {
    api.getModels().then((m) => {
      setWindowTokens(m.current_context_window || FALLBACK_CONTEXT_WINDOW_TOKENS);
      setModelName(m.current || '');
    }).catch(() => {});
  }, []);

  const usedChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) + input.length;
  const usedTokens = Math.round(usedChars / CHARS_PER_TOKEN);
  const pct = Math.min(100, Math.round((usedTokens / windowTokens) * 100));
  // Colour shifts from calm to warning as the window fills.
  const barColor = pct > 85 ? 'bg-err' : pct > 60 ? 'bg-warn' : 'bg-clay-500';
  const effortLabel = effort === 'none' ? 'No thinking' : effort === 'high' ? 'High' : 'Highest';
  // Per-message char breakdown for the click-to-expand ctx popover.
  const userTokens = Math.round(
    messages.filter((m) => m.role === 'user').reduce((s, m) => s + (m.content?.length || 0), 0) / CHARS_PER_TOKEN
  );
  const assistantTokens = Math.round(
    messages.filter((m) => m.role === 'assistant').reduce((s, m) => s + (m.content?.length || 0), 0) / CHARS_PER_TOKEN
  );
  const inputTokens = Math.round(input.length / CHARS_PER_TOKEN);
  const remainingTokens = Math.max(0, windowTokens - usedTokens);
  const [ctxOpen, setCtxOpen] = useState(false);

  return (
    <div className="relative flex min-w-0 flex-1 items-center justify-center gap-2.5">
      {/* Context window meter: click to expand a detailed breakdown popover. */}
      <button
        type="button"
        onClick={() => setCtxOpen((v) => !v)}
        className="flex items-center gap-1.5 min-w-0 shrink-0 hover:opacity-80 transition-opacity"
        title="Click for context-window details"
      >
        <span className="hidden shrink-0 text-[10px] text-ink-400 sm:inline">ctx</span>
        <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-cream-200 shadow-[inset_0_1px_2px_rgba(49,37,28,0.08)]">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <span className="text-[10px] text-ink-400 tabular-nums shrink-0">{pct}%</span>
      </button>
      {ctxOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setCtxOpen(false)} />
          <div className="absolute bottom-6 left-1/2 z-40 w-64 -translate-x-1/2 rounded-lg border border-cream-300 bg-white p-3 text-[11px] text-ink-600 shadow-lift">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-ink-800">Context window</span>
              <span className="text-ink-400">{(usedTokens / 1000).toFixed(1)}K / {(windowTokens / 1000).toFixed(0)}K</span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-cream-200">
              <div className={`h-full ${barColor}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <div className="space-y-1">
              <CtxRow label="Your messages" value={userTokens} total={windowTokens} />
              <CtxRow label="Assistant replies" value={assistantTokens} total={windowTokens} />
              <CtxRow label="Current input" value={inputTokens} total={windowTokens} />
              <CtxRow label="Used total" value={usedTokens} total={windowTokens} strong />
              <CtxRow label="Remaining" value={remainingTokens} total={windowTokens} />
            </div>
            <p className="text-[10px] text-ink-300 mt-1">
              {modelName ? `Model: ${modelName} · ` : ''}{(windowTokens / 1000).toFixed(0)}K window
            </p>
            <p className="text-[10px] text-ink-300 mt-1 leading-relaxed">Estimate from character count (~4 chars/token). Long histories are auto-compacted near the limit.</p>
          </div>
        </>
      )}
      {/* Per-message thinking tier selector */}
      <div className="flex items-center gap-1 shrink-0" title="Thinking intensity for this message">
        <Brain size={11} className="text-ink-400" />
        <div className="flex overflow-hidden rounded-[8px] border border-cream-300 bg-white/50">
          {(['none', 'high', 'max'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={streaming}
              onClick={() => onEffort(tier)}
              className={`px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                effort === tier ? 'bg-clay-50 text-clay-600 font-medium' : 'text-ink-400 hover:bg-cream-100'
              }`}
            >
              {tier === 'none' ? 'Off' : tier === 'high' ? 'High' : 'Max'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-ink-300 sr-only">{effortLabel}</span>
      </div>
    </div>
  );
}

function CtxRow({ label, value, total, strong }: { label: string; value: number; total: number; strong?: boolean }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'text-ink-800 font-medium' : 'text-ink-500'}>{label}</span>
      <span className="tabular-nums text-ink-400">
        {value.toLocaleString()} <span className="text-ink-300">({pct}%)</span>
      </span>
    </div>
  );
}

function PlanConfirmModal({
  items,
  onConfirm,
  onCancel,
}: {
  items: string[];
  onConfirm: (editedItems: string[], note: string) => void;
  onCancel: () => void;
}) {
  // Editable plan: each item is a text field the user can tweak, plus an
  // optional overall note. Mirrors the "plan mode" approval pattern.
  const [edited, setEdited] = useState<string[]>(items);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(true);

  const update = (i: number, v: string) =>
    setEdited((prev) => prev.map((it, idx) => (idx === i ? v : it)));
  const remove = (i: number) => setEdited((prev) => prev.filter((_, idx) => idx !== i));
  const add = () => setEdited((prev) => [...prev, 'new step']);

  const close = () => { setOpen(false); onCancel(); };
  const confirm = () => {
    const cleaned = edited.map((s) => s.trim()).filter(Boolean);
    if (!cleaned.length) { close(); return; }
    setOpen(false);
    onConfirm(cleaned, note);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-clay-600/15 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-xl border border-cream-300 bg-white shadow-lift max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-cream-300 px-5 py-3.5">
          <ListChecks size={16} className="text-clay-500" />
          <h3 className="font-serif text-base font-semibold text-ink-900">Confirm the plan</h3>
        </div>
        <div className="border-b border-cream-200 bg-cream-50 px-5 py-3 text-xs text-ink-500">
          The agent has decomposed this task into the steps below. Edit, remove, or add steps, then confirm to let it proceed. Cancel to redirect the agent.
        </div>
        <div className="px-5 py-4 space-y-2">
          {edited.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-ink-300 mt-2 tabular-nums w-5 shrink-0">{i + 1}.</span>
              <textarea
                className="input flex-1 min-h-[36px] py-1.5"
                value={item}
                onChange={(e) => update(i, e.target.value)}
                rows={1}
              />
              <button
                className="text-ink-300 hover:text-err p-1 mt-1 shrink-0"
                onClick={() => remove(i)}
                title="Remove step"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button onClick={add} className="text-xs text-clay-600 hover:text-clay-500 flex items-center gap-1">
            <Plus size={12} /> Add step
          </button>
          <textarea
            className="input mt-2"
            placeholder="Optional note for the agent (constraints, things to watch)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-cream-300 bg-cream-50 px-5 py-3">
          <button className="btn-ghost text-sm" onClick={close}>Cancel</button>
          <button className="btn-primary text-sm" onClick={confirm}>
            Confirm & proceed
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceBar({ path, onOpen }: { path: string; onOpen: () => void }) {
  const t = useI18n((s) => s.t);
  if (path) {
    return (
      <div className="shrink-0 flex items-center gap-2 border-b border-cream-300 bg-cream-100/70 px-4 py-1.5 text-xs">
        <FolderOpen size={12} className="shrink-0 text-clay-500" />
        <span className="text-ink-400">{t('chat.workspace')}</span>
        <span className="truncate flex-1 font-mono text-ink-700" title={path}>{path}</span>
        <button
          className="text-ink-400 hover:text-clay-600 shrink-0"
          onClick={onOpen}
          title={t('nav.open_folder')}
        >
          <ExternalLink size={12} />
        </button>
      </div>
    );
  }
  return (
    <div className="shrink-0 flex items-center gap-2 border-b border-cream-300 bg-cream-100/70 px-4 py-1.5 text-xs text-ink-400">
      <FolderPlus size={12} className="shrink-0" />
      <span>{t('chat.no_workspace')}</span>
    </div>
  );
}
