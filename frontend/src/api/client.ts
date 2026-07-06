import type { Project, SessionInfo, Message, Artifact, AgentInfo } from '@/types';

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api`;
const BASE = API_BASE;

async function jget(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function jpost(url: string, body: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function jput(url: string, body: any) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function jdel(url: string) {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

export const api = {
  listProjects: (archived?: boolean): Promise<Project[]> =>
    jget(`${BASE}/projects${archived !== undefined ? `?archived=${archived}` : ''}`),
  createProject: (name: string, description = '', localPath = '') =>
    jpost(`${BASE}/projects`, { name, description, local_path: localPath }),
  updateProject: (id: string, data: { name: string; description?: string; local_path?: string }) =>
    jput(`${BASE}/projects/${id}`, data),
  projectWorkspace: (id: string) =>
    jget(`${BASE}/projects/${id}/workspace`) as Promise<{ project_id: string; root: string; artifacts_dir: string; bound: boolean }>,
  deleteProject: (id: string) => jdel(`${BASE}/projects/${id}`),
  archiveProject: (id: string) => jpost(`${BASE}/projects/${id}/archive`, {}),

  fsBrowse: (path = '', dirsOnly = false) =>
    jget(`${BASE}/fs/browse?path=${encodeURIComponent(path)}${dirsOnly ? '&dirs_only=true' : ''}`),
  fsBrowseFiles: (path = '') =>
    jget(`${BASE}/fs/browse?path=${encodeURIComponent(path)}&include_files=true`),
  fsHome: () => jget(`${BASE}/fs/home`),
  fsProjectRoot: (projectId: string) =>
    jget(`${BASE}/fs/project/${projectId}`) as Promise<{ project_id: string; root: string; bound: boolean }>,
  fsValidate: (path: string) => jpost(`${BASE}/fs/validate`, { path }).catch(() => ({ valid: false })),
  fsOpenFolder: (path: string) => jpost(`${BASE}/fs/open-folder`, { path }),

  hpcList: (projectId?: string) =>
    jget(`${BASE}/hpc${projectId ? `?project_id=${projectId}` : ''}`),
  hpcCreate: (data: any) => jpost(`${BASE}/hpc`, data),
  hpcDelete: (id: string) => jdel(`${BASE}/hpc/${id}`),
  hpcTest: (id: string) => jpost(`${BASE}/hpc/${id}/test`, {}),
  hpcTestCreds: (creds: { host: string; port: number; username: string; password: string; work_dir?: string }) =>
    jpost(`${BASE}/hpc/test-creds`, creds),
  hpcExec: (id: string, command: string, timeout = 300) =>
    jpost(`${BASE}/hpc/${id}/exec`, { command, timeout }),
  hpcUpload: (id: string, localPath: string, remotePath: string) =>
    jpost(`${BASE}/hpc/${id}/upload`, { local_path: localPath, remote_path: remotePath }),
  hpcDownload: (id: string, remotePath: string, localPath: string) =>
    jpost(`${BASE}/hpc/${id}/download`, { remote_path: remotePath, local_path: localPath }),
  hpcLs: (id: string, path = '') => jget(`${BASE}/hpc/${id}/ls?path=${encodeURIComponent(path)}`),
  hpcQueue: (id: string) => jget(`${BASE}/hpc/${id}/queue`),
  hpcSbatch: (id: string, script: string, remotePath = '') =>
    jpost(`${BASE}/hpc/${id}/sbatch`, { script, remote_path: remotePath }),

  listSessions: (projectId: string): Promise<SessionInfo[]> =>
    jget(`${BASE}/sessions?project_id=${projectId}`),
  createSession: (projectId: string, mode: string, title = 'New Session') =>
    jpost(`${BASE}/sessions`, { project_id: projectId, mode, title }),
  deleteSession: (id: string) => jdel(`${BASE}/sessions/${id}`),
  renameSession: (id: string, title: string) =>
    fetch(`${BASE}/sessions/${id}?${new URLSearchParams({ title })}`, { method: 'PUT' })
      .then((response) => response.json()) as Promise<SessionInfo>,
  getMessages: (sid: string): Promise<Message[]> => jget(`${BASE}/sessions/${sid}/messages`),

  listAgents: (): Promise<AgentInfo[]> => jget(`${BASE}/chat/agents`),

  chatStream: (req: {
    session_id: string;
    agent: string;
    messages: { role: string; content: string }[];
    language: string;
    project_path?: string;
    reasoning_effort?: string;
  }, signal?: AbortSignal) =>
    fetch(`${BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    }),

  reviewDocumentStream: (req: {
    document_text: string;
    document_type: string;
    language: string;
    project_path?: string;
  }, signal?: AbortSignal) =>
    fetch(`${BASE}/chat/review-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    }),

  listArtifacts: (sid: string): Promise<Artifact[]> =>
    jget(`${BASE}/artifacts/session/${sid}`),
  artifactFileUrl: (path: string, projectPath = '') =>
    `${BASE}/artifacts/file/${path.split('/').map(encodeURIComponent).join('/')}` +
    (projectPath ? `?project_path=${encodeURIComponent(projectPath)}` : ''),
  artifactOpenFolder: (path: string, projectPath = '') =>
    jpost(`${BASE}/artifacts/open-folder`, { path, project_path: projectPath }),

  saveSettings: (settings: {
    llm_base_url: string; llm_api_key?: string; llm_model: string;
    reasoning_effort?: 'none' | 'high' | 'max';
    python_executable?: string; r_executable?: string; sandbox_timeout?: number;
  }) => jpost(`${BASE}/settings`, settings),
  clearApiKey: () => jdel(`${BASE}/settings/api-key`),
  getSettings: () => jget(`${BASE}/settings`),
  getMemory: (projectPath = '') =>
    jget(`${BASE}/settings/memory${projectPath ? `?project_path=${encodeURIComponent(projectPath)}` : ''}`) as Promise<{
      exists: boolean; target_path: string; active_paths: string[]; chars: number; content: string;
    }>,
  saveMemory: (projectPath: string, content: string) =>
    jpost(`${BASE}/settings/memory`, { project_path: projectPath, content }),
  getModels: () => jget(`${BASE}/settings/models`) as Promise<{
    current: string;
    current_context_window: number;
    current_max_output_tokens: number;
    current_supports_reasoning_effort: boolean;
    current_supports_long_context: boolean;
    models: Array<{
      id: string; label: string; context_window: number; max_output_tokens: number;
      supports_reasoning_effort: boolean; supports_long_context: boolean;
      long_context_window: number | null; long_context_suffix: string | null;
    }>;
  }>,

  health: () => jget(`${BASE}/health`),
};
