import { useEffect, useRef, useState } from 'react';
import { Plus, Folder, FolderOpen, MessageSquare, Trash2, ChevronDown, FolderPlus, Server, ExternalLink, Archive, Loader2, Settings2, Pencil } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { AGENT_ICONS } from '@/components/icons';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import type { AgentInfo, AgentKey, Project } from '@/types';

const AGENT_NAV: { key: AgentKey; tKey: any }[] = [
  { key: 'chat', tKey: 'nav.chat' },
  { key: 'brainstorm', tKey: 'nav.brainstorm' },
  { key: 'bio', tKey: 'nav.bio' },
  { key: 'protocol', tKey: 'nav.protocol' },
  { key: 'reviewer', tKey: 'nav.reviewer' },
  { key: 'module', tKey: 'nav.module' },
  { key: 'document', tKey: 'nav.document' },
];

export function Sidebar({ agents }: { agents: AgentInfo[] }) {
  const t = useI18n((s) => s.t);
  const agent = useStore((s) => s.agent);
  const setAgent = useStore((s) => s.setAgent);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const selectProject = useStore((s) => s.selectProject);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const createSession = useStore((s) => s.createSession);
  const selectSession = useStore((s) => s.selectSession);
  const archiveProject = useStore((s) => s.archiveProject);
  const loadProjects = useStore((s) => s.loadProjects);
  const streamingSessions = useStore((s) => s.streamingSessions);
  const creatingSession = useStore((s) => s.creatingSession);
  const renameSession = useStore((s) => s.renameSession);
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSessionId]);

  const startRename = (id: string, currentTitle: string) => {
    setRenamingSessionId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = async () => {
    const id = renamingSessionId;
    const value = renameValue;
    if (id) {
      await renameSession(id, value);
    }
    setRenamingSessionId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingSessionId(null);
    setRenameValue('');
  };
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
    <aside className="w-64 shrink-0 border-r border-cream-300 bg-cream-100/50 flex flex-col overflow-hidden shadow-[inset_-1px_0_0_rgba(255,255,255,0.62)]">
      <div className="px-3 py-3.5 space-y-1">
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

      <div className="flex-1 overflow-y-auto px-3 py-3.5">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
            {t('nav.section.projects')}
          </span>
          <button
            className="text-ink-400 hover:text-clay-600 p-1 rounded-[8px] hover:bg-white"
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
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[10px] cursor-pointer text-sm transition-colors
                    ${isActive ? 'bg-white text-ink-900 shadow-subtle ring-1 ring-cream-300' : 'text-ink-500 hover:bg-white/70 hover:text-ink-900'}`}
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
                  <Folder size={13} strokeWidth={1.75} className="shrink-0 text-clay-500" />
                  <span className="truncate flex-1" title={project.name}>{project.name}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-ink-300 hover:text-clay-600 p-1 rounded-[8px] hover:bg-cream-100"
                      title={t('nav.edit_project')}
                      onClick={(e) => { e.stopPropagation(); setEditingProject(project); }}
                    >
                      <Settings2 size={11} />
                    </button>
                    <button
                      className="text-ink-300 hover:text-warn p-1 rounded-[8px] hover:bg-cream-100"
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
                      className="text-ink-300 hover:text-err p-1 rounded-[8px] hover:bg-cream-100"
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
                  <div className="ml-5 mt-1 space-y-1 border-l border-cream-300 pl-2">
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
                        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[10px] cursor-pointer text-xs transition-colors
                          ${currentSessionId === session.id ? 'bg-clay-50 text-clay-600 ring-1 ring-clay-100' : 'text-ink-500 hover:bg-white/70 hover:text-ink-900'}`}
                        onClick={() => selectSession(session.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(session.id, session.title);
                        }}
                      >
                        <MessageSquare size={11} strokeWidth={1.75} className="shrink-0" />
                        {renamingSessionId === session.id ? (
                          <input
                            ref={renameInputRef}
                            className="flex-1 min-w-0 bg-white border border-clay-400 rounded px-1 py-0.5 text-xs text-ink-900 focus:outline-none"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                              else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                            }}
                            onBlur={commitRename}
                            placeholder={t('common.rename')}
                          />
                        ) : (
                          <span
                            className="truncate flex-1"
                            title={`${session.title}\n${t('common.rename_hint')}`}
                          >
                            {session.title}
                          </span>
                        )}
                        {streamingSessions[session.id] && (
                          <Loader2 size={10} className="shrink-0 animate-spin text-clay-500" />
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {renamingSessionId !== session.id && (
                            <button
                              className="text-ink-300 hover:text-clay-600 p-0.5 rounded hover:bg-cream-200"
                              title={t('common.rename')}
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(session.id, session.title);
                              }}
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                          <button
                            className="text-ink-300 hover:text-err p-0.5 rounded hover:bg-cream-200"
                            title={t('common.delete')}
                            onClick={async (e) => {
                              e.stopPropagation();
                              await api.deleteSession(session.id);
                              selectProject(currentProjectId!);
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-cream-300 px-3 py-2.5 bg-cream-50/50">
        <button
          className={`nav-item w-full ${agent === ('hpc' as any) ? 'nav-item-active' : ''}`}
          onClick={() => setAgent('hpc' as AgentKey)}
        >
          <Server size={16} strokeWidth={1.75} />
          <span>{t('nav.hpc')}</span>
        </button>
      </div>

      {newProjOpen && <NewProjectModal onClose={() => setNewProjOpen(false)} />}
      {editingProject && (
        <NewProjectModal
          editProject={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
    </aside>
  );
}
