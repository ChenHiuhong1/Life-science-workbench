export type AgentKey =
  | 'chat' | 'literature' | 'brainstorm'
  | 'bio' | 'protocol' | 'reviewer' | 'module' | 'hpc';

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
  mode: AgentKey;
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
  env_snapshot?: string;
  created_at?: string;
}

export interface Paper {
  title: string;
  authors?: string;
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  source?: string;
  url?: string;
  citation_count?: number;
}

export type Lang = 'zh' | 'en';
