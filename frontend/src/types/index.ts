export type AgentKey =
  | 'chat' | 'brainstorm'
  | 'bio' | 'structure' | 'protocol' | 'reviewer' | 'module' | 'document' | 'hpc';

export interface AgentInfo {
  key: AgentKey;
  label_zh: string;
  label_en: string;
  icon: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  local_path: string;
  archived: boolean;
  session_count: number;
  // Optional remote execution server (bio-analysis / structure-bio). Empty
  // server_host = run locally. has_server_password mirrors the backend's
  // masked echo so the edit form knows whether a password is already stored.
  server_host: string;
  server_port: number;
  server_username: string;
  has_server_password: boolean;
  server_workdir: string;
}

/** Shape used by the create/edit form and sent to the create/update API. */
export interface ProjectServerFields {
  server_host: string;
  server_port: number;
  server_username: string;
  server_password: string;
  server_workdir: string;
}

export interface SessionInfo {
  id: string;
  project_id: string;
  title: string;
  mode: string;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
  toolEvents?: any[];
  citations?: any[];
  artifact_ids?: string[];
  created_at?: string;
}

export interface Artifact {
  id: string;
  kind: 'code' | 'figure' | 'table' | 'file' | 'protocol' | 'spec' | 'review';
  title: string;
  language: string;
  code: string;
  output: string;
  files: string[];
  project_path?: string;
  env_snapshot?: string;
  created_at?: string;
}

export interface ChatAttachment {
  name: string;
  path: string;
  read_path: string;
  size: number;
  content_type?: string;
}

export interface SkillInfo {
  name: string;
  group: string;
  description: string;
}

export type Lang = 'zh' | 'en';
