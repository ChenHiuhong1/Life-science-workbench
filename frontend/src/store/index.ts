import { create } from 'zustand';
import type { Project, SessionInfo, Message, Artifact, AgentKey } from '@/types';
import { api } from '@/api/client';

let pendingSessionCreate: Promise<string | null> | null = null;

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
  setAgent: (agent: AgentKey) => Promise<void>;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendToLast: (delta: string) => void;
  appendToMessage: (streamSid: string, msgId: number, delta: string) => void;
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

    const map: Record<string, string> = {};
    for (const session of sessions) {
      const key = `${id}:${session.mode}`;
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
    if (get().creatingSession && pendingSessionCreate) return pendingSessionCreate;
    const pid = get().currentProjectId;
    if (!pid) return null;
    const selectedMode = mode || get().agent;
    set({ creatingSession: true });
    pendingSessionCreate = (async () => {
      const session = await api.createSession(pid, selectedMode);
      set({
        sessions: [session, ...get().sessions],
        currentSessionId: session.id,
        messages: [],
        artifacts: [],
        agentSessionMap: { ...get().agentSessionMap, [`${pid}:${selectedMode}`]: session.id },
        messagesBySession: { ...get().messagesBySession, [session.id]: [] },
        artifactsBySession: { ...get().artifactsBySession, [session.id]: [] },
      });
      return session.id;
    })();
    try {
      return await pendingSessionCreate;
    } finally {
      pendingSessionCreate = null;
      set({ creatingSession: false });
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
    set({
      currentSessionId: id,
      messages: cleaned,
      artifacts,
      messagesBySession: { ...get().messagesBySession, [id]: cleaned },
      artifactsBySession: { ...get().artifactsBySession, [id]: artifacts },
      agent: (session?.mode as AgentKey) || get().agent,
    });
  },

  setAgent: async (agent) => {
    const pid = get().currentProjectId;
    set({ agent });
    if (!pid) return;
    const mapKey = `${pid}:${agent}`;
    const sid = get().agentSessionMap[mapKey];
    if (sid && sid !== get().currentSessionId) {
      await get().selectSession(sid);
    } else if (!sid) {
      set({ currentSessionId: null, messages: [], artifacts: [] });
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
