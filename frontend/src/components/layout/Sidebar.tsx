import { useState } from 'react';
import { Plus, Folder, FolderOpen, MessageSquare, Trash2, ChevronDown, FolderPlus, Server, ExternalLink, Archive, Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { AGENT_ICONS } from '@/components/icons';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import type { AgentInfo, AgentKey } from '@/types';

const AGENT_NAV: { key: AgentKey; tKey: any }[] = [
  { key: 'chat', tKey: 'nav.chat' },
  { key: 'literature', tKey: 'nav.literature' },
  { key: 'brainstorm', tKey: 'nav.brainstorm' },
  { key: 'bio', tKey: 'nav.bio' },
  { key: 'protocol', tKey: 'nav.protocol' },
  { key: 'reviewer', tKey: 'nav.reviewer' },
  { key: 'module', tKey: 'nav.module' },
];

export function Sidebar({ agents }: { agents: AgentInfo[] }) {
  const t = useI18n((s) => s.t);
  const {
    agent, setAgent,
    projects, currentProjectId, selectProject,
    sessions, currentSessionId, createSession, selectSession,
    archiveProject, loadProjects, streamingSessions, creatingSession,
  } = useStore();
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [projCollapsed, setProjCollapsed] = useState<Record<string, boolean>>({});

  const openInExplorer = async (path: string) => {
    if (!path) return;
    try {
      await api.fsOpenFolder(path);
    } catch {
      navigator.clipboard?.writeText(path);
    }
  };

  return (
    <aside className="w-60 shrink-0 border-r border-cream-300 bg-cream-50 flex flex-col overflow-hidden">
      <div className="px-3 py-3 space-y-0.5">
        {AGENT_NAV.map(({ key, tKey }) => {
          const Icon = AGENT_ICONS[agents.find((item) => item.key === key)?.icon || 'message'] || MessageSquare;
          const active = agent === key;
          return (
            <button
              key={key}
              className={`nav-item w-full ${active ? 'nav-item-active' : ''}`}
              onClick={() => setAgent(key)}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span>{t(tKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-cream-300 mx-3" />

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">
            {t('nav.section.projects')}
          </span>
          <button
            className="text-ink-300 hover:text-clay-600 p-1 rounded hover:bg-cream-100"
            onClick={() => setNewProjOpen(true)}
            title={t('nav.new_project')}
          >
            <FolderPlus size={14} />
          </button>
        </div>

        {projects.length === 0 && (
          <div className="px-2 py-6 text-center">
            <p className="text-xs text-ink-300">{t('nav.no_project')}</p>
            <p className="text-xs text-ink-300 mt-1">{t('nav.no_project_desc')}</p>
          </div>
        )}

        <div className="space-y-0.5">
          {projects.map((project) => {
            const isActive = currentProjectId === project.id;
            const collapsed = projCollapsed[project.id];
            return (
              <div key={project.id}>
                <div
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] cursor-pointer text-sm
                    ${isActive ? 'bg-cream-100 text-ink-900' : 'text-ink-500 hover:bg-cream-100'}`}
                  onClick={() => selectProject(project.id)}
                >
                  <button
                    className="text-ink-300 hover:text-ink-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjCollapsed((cur) => ({ ...cur, [project.id]: !cur[project.id] }));
                    }}
                    title={collapsed ? 'Expand project' : 'Collapse project'}
                  >
                    <ChevronDown size={12} className={collapsed ? '-rotate-90 transition-transform' : 'transition-transform'} />
                  </button>
                  <Folder size={13} strokeWidth={1.75} className="shrink-0 text-clay-400" />
                  <span className="truncate flex-1" title={project.name}>{project.name}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-ink-300 hover:text-warn p-1 rounded hover:bg-cream-200"
                      title="Archive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Archive project "${project.name}"? Archived projects are hidden from this list. Data is not deleted.`)) {
                          await archiveProject(project.id);
                        }
                      }}
                    >
                      <Archive size={11} />
                    </button>
                    <button
                      className="text-ink-300 hover:text-err p-1 rounded hover:bg-cream-200"
                      title="Delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete project "${project.name}"?\n\nThis removes sessions, messages, and artifact records. Local folders are not deleted. This cannot be undone.`)) {
                          await api.deleteProject(project.id);
                          await loadProjects();
                        }
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {isActive && !collapsed && (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-cream-300 pl-2">
                    {project.local_path && (
                      <div className="group flex items-center gap-1.5 px-2 py-1 text-xs text-ink-400">
                        <FolderOpen size={11} className="shrink-0" />
                        <span className="truncate flex-1 font-mono" title={project.local_path}>
                          {project.local_path}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-clay-600"
                          title={t('nav.open_folder')}
                          onClick={(e) => { e.stopPropagation(); openInExplorer(project.local_path); }}
                        >
                          <ExternalLink size={11} />
                        </button>
                      </div>
                    )}
                    <button
                      className="nav-item text-xs w-full disabled:opacity-50 disabled:cursor-wait"
                      onClick={() => createSession()}
                      disabled={creatingSession}
                    >
                      {creatingSession ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} />
                      )}
                      <span className="text-ink-300">{creatingSession ? 'Creating...' : t('nav.new_session')}</span>
                    </button>
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] cursor-pointer text-xs
                          ${currentSessionId === session.id ? 'bg-clay-50 text-clay-600' : 'text-ink-500 hover:bg-cream-100'}`}
                        onClick={() => selectSession(session.id)}
                      >
                        <MessageSquare size={11} strokeWidth={1.75} className="shrink-0" />
                        <span className="truncate flex-1" title={session.title}>{session.title}</span>
                        {streamingSessions[session.id] && (
                          <Loader2 size={10} className="shrink-0 animate-spin text-clay-500" />
                        )}
                        <button
                          className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-err"
                          title="Delete session"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await api.deleteSession(session.id);
                            selectProject(currentProjectId!);
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-cream-300 px-3 py-2">
        <button
          className={`nav-item w-full ${agent === ('hpc' as any) ? 'nav-item-active' : ''}`}
          onClick={() => setAgent('hpc' as AgentKey)}
        >
          <Server size={16} strokeWidth={1.75} />
          <span>{t('nav.hpc')}</span>
        </button>
      </div>

      {newProjOpen && <NewProjectModal onClose={() => setNewProjOpen(false)} />}
    </aside>
  );
}
