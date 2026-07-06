export type AgentKey =
  | 'chat' | 'brainstorm'
  | 'bio' | 'protocol' | 'reviewer' | 'module' | 'document' | 'hpc';

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

export type Lang = 'zh' | 'en';
