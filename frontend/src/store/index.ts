import { create } from 'zustand';
import type { Project, SessionInfo, Message, Artifact, AgentKey } from '@/types';
import { api } from '@/api/client';

const pendingSessionCreates: Partial<Record<string, Promise<string | null>>> = {};
const SUPPORTED_AGENT_KEYS: AgentKey[] = [
  'chat',
  'brainstorm',
  'bio',
  'protocol',
  'reviewer',
  'module',
  'document',
  'hpc',
];

function normalizeAgentKey(mode?: string | null): AgentKey {
  return SUPPORTED_AGENT_KEYS.includes(mode as AgentKey) ? (mode as AgentKey) : 'chat';
}

// ---------------------------------------------------------------------------
// Streaming delta coalescing
//
// A model streams dozens of tokens per second, and naively each delta would
// trigger a full store update + a re-parse of the entire assistant message.
// While one session is streaming, that re-render competes with whatever the
// user is doing in another session/agent, which is the main cause of the
// "switching agents feels laggy while a stream runs" symptom.
//
// We buffer per-(session,message) deltas and flush them in a single rAF (or a
// 16ms timer on the rare non-browser/Tauri-webview without rAF), so the store
// only updates ~60 times/second total instead of per-token.
// ---------------------------------------------------------------------------
interface PendingDelta { msgId: number; text: string; }
const _pendingDeltas: Record<string, PendingDelta> = {}; // key: `${sid}:${msgId}`
let _flushScheduled = false;
const _FLUSH_OPS: Array<() => void> = [];

function _scheduleFlush() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  const run = () => {
    _flushScheduled = false;
    // Snapshot then clear so deltas arriving during the flush queue again.
    const ops = _FLUSH_OPS.splice(0);
    for (const op of ops) op();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  sessions: SessionInfo[];
  currentSessionId: string | null;

  agent: AgentKey;

  messages: Message[];
  artifacts: Artifact[];
  messagesBySession: Record<string, Message[]>;
  artifactsBySession: Record<string, Artifact[]>;
  agentSessionMap: Record<string, string>;

  loading: boolean;
  creatingSession: boolean;
  streaming: boolean;
  streamingSessionId: string | null;
  streamingSessions: Record<string, boolean>;

  loadProjects: () => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string, localPath?: string) => Promise<void>;
  updateProject: (id: string, data: { name?: string; description?: string; local_path?: string }) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  createSession: (mode?: AgentKey) => Promise<string | null>;
  selectSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => void;
  setAgent: (agent: AgentKey) => Promise<void>;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  addMessageToSession: (sessionId: string, message: Message) => void;
  appendToLast: (delta: string) => void;
  appendToMessage: (streamSid: string, msgId: number, delta: string) => void;
  _flushAppend: (streamSid: string, msgId: number, delta: string) => void;
  patchMessageById: (streamSid: string, msgId: number, patch: Partial<Message>) => void;
  setStreamingState: (sid: string | null, active?: boolean) => void;
  loadArtifacts: (sid: string) => Promise<void>;
  resetSession: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  sessions: [],
  currentSessionId: null,
  agent: 'chat',
  messages: [],
  artifacts: [],
  messagesBySession: {},
  artifactsBySession: {},
  agentSessionMap: {},
  loading: false,
  creatingSession: false,
  streaming: false,
  streamingSessionId: null,
  streamingSessions: {},

  loadProjects: async () => {
    const projects = await api.listProjects(false);
    set({ projects });
    if (projects.length && !get().currentProjectId) {
      await get().selectProject(projects[0].id);
    }
  },

  selectProject: async (id) => {
    set({
      currentProjectId: id,
      sessions: [],
      currentSessionId: null,
      messages: [],
      artifacts: [],
      agentSessionMap: {},
      messagesBySession: {},
      artifactsBySession: {},
    });
    const sessions = await api.listSessions(id);
    set({ sessions });

    // Map "the last session the user was in for this module". Unlike the old
    // 1:1 mapping, this never *prevents* multiple same-module sessions: it
    // simply records which one to return to when the user re-opens a module.
    const map: Record<string, string> = {};
    // sessions come back ordered by updated_at desc, so the first per-mode
    // entry is the most recently touched session of that module.
    for (const session of sessions) {
      const key = `${id}:${normalizeAgentKey(session.mode)}`;
      if (!map[key]) map[key] = session.id;
    }
    set({ agentSessionMap: map });
    await get().setAgent(get().agent);
  },

  createProject: async (name, localPath = '') => {
    const project = await api.createProject(name, '', localPath);
    set({ projects: [project, ...get().projects] });
    await get().selectProject(project.id);
  },

  updateProject: async (id, data) => {
    const current = get().projects.find((p) => p.id === id);
    const merged = {
      name: data.name ?? current?.name ?? '',
      description: data.description ?? current?.description ?? '',
      local_path: data.local_path ?? current?.local_path ?? '',
    };
    const updated = await api.updateProject(id, merged);
    set({ projects: get().projects.map((p) => (p.id === id ? updated : p)) });
    if (get().currentProjectId === id) {
      // Refresh session cache so the bound folder change is visible immediately.
      set({ currentProjectId: null });
      await get().selectProject(id);
    }
  },

  archiveProject: async (id) => {
    await api.archiveProject(id);
    const remaining = get().projects.filter((project) => project.id !== id);
    set({ projects: remaining });
    if (get().currentProjectId === id) {
      set({ currentProjectId: null, sessions: [], currentSessionId: null, messages: [] });
      if (remaining.length) await get().selectProject(remaining[0].id);
    }
  },

  createSession: async (mode) => {
    const pid = get().currentProjectId;
    if (!pid) return null;
    const selectedMode = mode || get().agent;
    const pendingKey = `${pid}:${selectedMode}`;
    const pendingCreate = pendingSessionCreates[pendingKey];
    if (pendingCreate) return pendingCreate;

    set({ creatingSession: true });
    pendingSessionCreates[pendingKey] = (async () => {
      const session = await api.createSession(pid, selectedMode);
      set({
        sessions: [session, ...get().sessions],
        currentSessionId: session.id,
        messages: [],
        artifacts: [],
        // Switch the active agent to the new session's module so the preset
        // chips and input reflect THIS session, not whatever module was active
        // before. This is the core fix for "new session keeps the old module's
        // presets".
        agent: selectedMode,
        agentSessionMap: { ...get().agentSessionMap, [`${pid}:${selectedMode}`]: session.id },
        messagesBySession: { ...get().messagesBySession, [session.id]: [] },
        artifactsBySession: { ...get().artifactsBySession, [session.id]: [] },
      });
      return session.id;
    })();
    try {
      return await pendingSessionCreates[pendingKey]!;
    } finally {
      delete pendingSessionCreates[pendingKey];
      set({ creatingSession: Object.keys(pendingSessionCreates).length > 0 });
    }
  },

  selectSession: async (id) => {
    const cachedMessages = get().messagesBySession[id];
    const cachedArtifacts = get().artifactsBySession[id];
    if (cachedMessages) {
      set({
        currentSessionId: id,
        messages: cachedMessages,
        artifacts: cachedArtifacts || [],
      });
      return;
    }

    const [messages, artifacts] = await Promise.all([
      api.getMessages(id),
      api.listArtifacts(id),
    ]);
    const legacyWelcomeSnippets = ["Hi, I'm your research assistant", '\u4f60\u597d'];
    const cleaned = messages.filter((message: Message) =>
      message.id !== -1 && !legacyWelcomeSnippets.some((snippet) => (message.content || '').includes(snippet))
    );
    const session = get().sessions.find((item) => item.id === id);
    const newAgent = normalizeAgentKey(session?.mode);
    const pid = get().currentProjectId;
    // Keep agent + "last active" map in sync with what the user is actually
    // viewing, so presets and the chat input reflect the selected session's
    // module rather than the previously-active one.
    const mapUpdate = pid && session
      ? { ...get().agentSessionMap, [`${pid}:${newAgent}`]: id }
      : get().agentSessionMap;
    set({
      currentSessionId: id,
      messages: cleaned,
      artifacts,
      messagesBySession: { ...get().messagesBySession, [id]: cleaned },
      artifactsBySession: { ...get().artifactsBySession, [id]: artifacts },
      agent: newAgent,
      agentSessionMap: mapUpdate,
    });
  },

  setAgent: async (agent) => {
    const pid = get().currentProjectId;
    const prevAgent = get().agent;
    set({ agent });
    if (!pid) return;

    // If the user is already viewing a session that belongs to the target
    // module, keep them there. This is what lets a freshly-created same-module
    // session stay active instead of being yanked back to an older one, and
    // also what stops a module switch from clobbering the chat-family ChatView
    // when the user is mid-conversation in another module that shares it.
    const cur = get().currentSessionId;
    const curSession = cur ? get().sessions.find((s) => s.id === cur) : null;
    if (curSession && normalizeAgentKey(curSession.mode) === agent) {
      // Make this the "last active" session for the module so re-entering it
      // (after visiting another module) returns here.
      const mapKey = `${pid}:${agent}`;
      if (get().agentSessionMap[mapKey] !== cur) {
        set({ agentSessionMap: { ...get().agentSessionMap, [mapKey]: cur! } });
      }
      return;
    }

    const mapKey = `${pid}:${agent}`;
    const sid = get().agentSessionMap[mapKey];
    if (sid && sid !== cur) {
      await get().selectSession(sid);
    } else if (!sid) {
      // No session for this module yet; show an empty surface. A session is
      // created lazily on first send.
      set({ currentSessionId: null, messages: [], artifacts: [] });
    } else if (prevAgent !== agent) {
      // sid === cur but module differs from stored agent: still clear the
      // displayed messages so we don't show another module's history.
      await get().selectSession(sid);
    }
  },

  renameSession: async (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await api.renameSession(id, trimmed);
    set({
      sessions: get().sessions.map((s) => (s.id === id ? { ...s, title: trimmed } : s)),
    });
  },

  updateSessionTitle: (id, title) => {
    if (!title) return;
    set({
      sessions: get().sessions.map((s) => (s.id === id ? { ...s, title } : s)),
    });
  },

  setMessages: (messages) => {
    const sid = get().currentSessionId;
    set({
      messages,
      messagesBySession: sid ? { ...get().messagesBySession, [sid]: messages } : get().messagesBySession,
    });
  },

  addMessage: (message) => {
    const sid = get().currentSessionId;
    const messages = [...get().messages, message];
    set({
      messages,
      messagesBySession: sid ? { ...get().messagesBySession, [sid]: messages } : get().messagesBySession,
    });
  },

  addMessageToSession: (sessionId, message) => {
    const cur = get().currentSessionId;
    const targetMessages = sessionId === cur
      ? get().messages
      : (get().messagesBySession[sessionId] || []);
    const messages = [...targetMessages, message];
    set({
      messages: sessionId === cur ? messages : get().messages,
      messagesBySession: { ...get().messagesBySession, [sessionId]: messages },
    });
  },

  appendToLast: (delta) => {
    const cur = get().currentSessionId;
    const streamSid = get().streamingSessionId || cur;
    if (!streamSid) return;
    const targetMessages = streamSid === cur
      ? get().messages
      : (get().messagesBySession[streamSid] || []);
    const messages = targetMessages.map((message, index) =>
      index === targetMessages.length - 1 && message.role === 'assistant'
        ? { ...message, content: message.content + delta }
        : message
    );
    set({
      messages: streamSid === cur ? messages : get().messages,
      messagesBySession: { ...get().messagesBySession, [streamSid]: messages },
    });
  },

  appendToMessage: (streamSid, msgId, delta) => {
    if (!delta) return;
    const key = `${streamSid}:${msgId}`;
    const existing = _pendingDeltas[key];
    if (existing) {
      existing.text += delta;
    } else {
      _pendingDeltas[key] = { msgId, text: delta };
      // Register the flush op once per pending key.
      _FLUSH_OPS.push(() => {
        const pending = _pendingDeltas[key];
        delete _pendingDeltas[key];
        if (!pending) return;
        get()._flushAppend(streamSid, pending.msgId, pending.text);
      });
    }
    _scheduleFlush();
  },

  _flushAppend: (streamSid, msgId, delta) => {
    const cur = get().currentSessionId;
    const targetMessages = streamSid === cur
      ? get().messages
      : (get().messagesBySession[streamSid] || []);
    if (!targetMessages.length) return;
    const messages = targetMessages.map((message) =>
      message.id === msgId && message.role === 'assistant'
        ? { ...message, content: message.content + delta }
        : message
    );
    set({
      messages: streamSid === cur ? messages : get().messages,
      messagesBySession: { ...get().messagesBySession, [streamSid]: messages },
    });
  },

  patchMessageById: (streamSid, msgId, patch) => {
    // Drain any buffered streaming text for this message first, so a patch
    // (e.g. attaching tool events, or writing the final content on error) is
    // applied on top of the fully-up-to-date content instead of racing a
    // pending rAF flush.
    const key = `${streamSid}:${msgId}`;
    const pending = _pendingDeltas[key];
    if (pending) {
      delete _pendingDeltas[key];
      get()._flushAppend(streamSid, msgId, pending.text);
    }
    const cur = get().currentSessionId;
    const targetMessages = streamSid === cur
      ? get().messages
      : (get().messagesBySession[streamSid] || []);
    const messages = targetMessages.map((message) =>
      message.id === msgId ? { ...message, ...patch } : message
    );
    set({
      messages: streamSid === cur ? messages : get().messages,
      messagesBySession: { ...get().messagesBySession, [streamSid]: messages },
    });
  },

  setStreamingState: (sid, active = true) => {
    if (!sid) {
      set({ streamingSessionId: null, streaming: false, streamingSessions: {} });
      return;
    }
    const next = { ...get().streamingSessions };
    if (active) next[sid] = true;
    else delete next[sid];
    const ids = Object.keys(next);
    set({
      streamingSessions: next,
      streamingSessionId: ids[ids.length - 1] || null,
      streaming: ids.length > 0,
    });
  },

  loadArtifacts: async (sid) => {
    const artifacts = await api.listArtifacts(sid);
    const cur = get().currentSessionId;
    set({
      artifactsBySession: { ...get().artifactsBySession, [sid]: artifacts },
      artifacts: sid === cur ? artifacts : get().artifacts,
    });
  },

  resetSession: () => set({ messages: [], artifacts: [] }),
}));
