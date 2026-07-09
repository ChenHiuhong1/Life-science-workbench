import { useEffect, useState } from 'react';
import { X, FolderOpen, Plus, Check, ChevronDown, Server, Cpu } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { FolderPicker } from '@/components/common/FolderPicker';
import type { Project } from '@/types';

interface Props {
  onClose: () => void;
  /** When provided, the modal edits this project instead of creating a new one. */
  editProject?: Project | null;
}

const DEFAULT_PORT = 22;

export function NewProjectModal({ onClose, editProject }: Props) {
  const t = useI18n((s) => s.t);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const isEdit = !!editProject;
  const [name, setName] = useState(editProject?.name || '');
  const [folder, setFolder] = useState(editProject?.local_path || '');
  const [workspacesDir, setWorkspacesDir] = useState('');
  const [folderTouched, setFolderTouched] = useState(isEdit);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Optional remote execution server. Empty host = run locally (default).
  const [serverHost, setServerHost] = useState(editProject?.server_host || '');
  const [serverPort, setServerPort] = useState<number>(editProject?.server_port || DEFAULT_PORT);
  const [serverUsername, setServerUsername] = useState(editProject?.server_username || '');
  const [serverPassword, setServerPassword] = useState('');
  const [serverWorkdir, setServerWorkdir] = useState(editProject?.server_workdir || '');
  const [serverOpen, setServerOpen] = useState<boolean>(
    // On edit, auto-expand the server section if a host is already configured.
    !!(editProject?.server_host),
  );
  const hadPassword = !!editProject?.has_server_password;

  useEffect(() => {
    api.fsHome()
      .then((data) => {
        const base = data.workspaces || data.app_home || data.home || '';
        setWorkspacesDir(base);
        if (!folder && !isEdit) setFolder(base);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit || folderTouched || !workspacesDir) return;
    const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
    if (!safe) {
      setFolder(workspacesDir);
      return;
    }
    const sep = workspacesDir.includes('\\') ? '\\' : '/';
    setFolder(`${workspacesDir.replace(/[\\/]+$/, '')}${sep}${safe}`);
  }, [name, workspacesDir, folderTouched, isEdit]);

  const handleSave = async () => {
    if (!name.trim() || !folder.trim()) return;
    setSaving(true);
    try {
      // A server is "configured" only when a host is present. Empty host →
      // run locally, and we send empty server fields so the backend clears
      // any previously stored credentials on edit.
      const host = serverHost.trim();
      const server =
        host && serverOpen
          ? {
              server_host: host,
              server_port: serverPort || DEFAULT_PORT,
              server_username: serverUsername.trim(),
              // On edit, a blank password keeps the existing one (keep-on-empty).
              // On create, blank simply means "no password stored".
              server_password: serverPassword,
              server_workdir: serverWorkdir.trim(),
            }
          : {
              server_host: '',
              server_port: DEFAULT_PORT,
              server_username: '',
              server_password: '',
              server_workdir: '',
            };
      if (isEdit && editProject) {
        await updateProject(editProject.id, { name: name.trim(), local_path: folder.trim(), server });
      } else {
        await createProject(name.trim(), folder, server);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-cream-50 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-[-0.015em] text-ink-900">
            {isEdit ? t('newproject.edit_title') : t('newproject.title')}
          </h2>
          <button className="text-ink-400 hover:text-ink-700" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-ink-600 mb-1">{t('newproject.name')}</label>
            <input
              autoFocus
              className="input"
              placeholder={t('newproject.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && folder && handleSave()}
            />
          </div>

          <div>
            <label className="block text-xs text-ink-600 mb-1">{t('newproject.folder')}</label>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-cream-100 px-3 py-2">
                <FolderOpen size={14} className="text-clay-500 shrink-0" />
                <span className={`text-sm truncate ${folder ? 'text-ink-900' : 'text-ink-400'}`} title={folder}>
                  {folder || t('newproject.empty')}
                </span>
              </div>
              <button className="btn-outline text-sm" onClick={() => setPickerOpen(true)}>
                {t('newproject.browse')}
              </button>
            </div>
            <p className="text-[11px] text-ink-500 mt-1">
              {isEdit
                ? t('newproject.folder_hint_edit')
                : t('newproject.folder_hint_new')}
            </p>
          </div>

          {/* Optional remote execution server (bio-analysis / structure-bio).
              Collapsed by default on create; empty host runs locally. */}
          <div className="rounded-[10px] bg-cream-100">
            <button
              type="button"
              onClick={() => setServerOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <ChevronDown
                size={14}
                className={`shrink-0 text-ink-400 transition-transform ${serverOpen ? '' : '-rotate-90'}`}
              />
              {serverHost.trim() ? (
                <Server size={14} className="shrink-0 text-clay-500" />
              ) : (
                <Cpu size={14} className="shrink-0 text-ink-500" />
              )}
              <span className="text-xs font-medium text-ink-700">
                {serverHost.trim() ? `Remote · ${serverHost.trim()}` : 'Execution server (optional)'}
              </span>
              <span className="ml-auto text-[10px] text-ink-500">
                {serverHost.trim() ? 'remote' : 'local'}
              </span>
            </button>

            {serverOpen && (
              <div className="space-y-3 border-t border-cream-200 px-3 py-3">
                <p className="text-[11px] leading-relaxed text-ink-500">
                  For bio-analysis and structure-bio workloads, run code on a remote Linux server over SSH instead of the local sandbox. Leave the host blank to run locally.
                </p>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <div>
                    <label className="block text-[11px] text-ink-600 mb-1">Host (IP)</label>
                    <input
                      className="input"
                      placeholder="10.0.0.5"
                      value={serverHost}
                      onChange={(e) => setServerHost(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-600 mb-1">Port</label>
                    <input
                      type="number"
                      className="input"
                      value={serverPort}
                      onChange={(e) => setServerPort(Number(e.target.value) || DEFAULT_PORT)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-ink-600 mb-1">Username</label>
                  <input
                    className="input"
                    placeholder="researcher"
                    value={serverUsername}
                    onChange={(e) => setServerUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-600 mb-1">
                    Password {isEdit && hadPassword && <span className="text-ink-400">(leave blank to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    className="input"
                    placeholder={isEdit && hadPassword ? '••••••• (unchanged)' : 'password'}
                    value={serverPassword}
                    onChange={(e) => setServerPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-600 mb-1">Working directory</label>
                  <input
                    className="input"
                    placeholder="/home/researcher/work"
                    value={serverWorkdir}
                    onChange={(e) => setServerWorkdir(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-cream-200 bg-cream-100 px-5 py-3.5">
          <button className="btn-ghost text-sm" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn-primary text-sm"
            onClick={handleSave}
            disabled={!name.trim() || !folder.trim() || saving}
          >
            {isEdit ? <Check size={14} /> : <Plus size={14} />} {t('common.confirm')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <FolderPicker
          initialPath={folder}
          onConfirm={(path) => { setFolder(path); setFolderTouched(true); setPickerOpen(false); }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
