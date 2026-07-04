import { useEffect, useState } from 'react';
import { X, FolderOpen, Plus } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { FolderPicker } from '@/components/common/FolderPicker';

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const t = useI18n((s) => s.t);
  const createProject = useStore((s) => s.createProject);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [workspacesDir, setWorkspacesDir] = useState('');
  const [folderTouched, setFolderTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.fsHome()
      .then((data) => {
        const base = data.workspaces || data.app_home || data.home || '';
        setWorkspacesDir(base);
        if (!folder) setFolder(base);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (folderTouched || !workspacesDir) return;
    const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
    if (!safe) {
      setFolder(workspacesDir);
      return;
    }
    const sep = workspacesDir.includes('\\') ? '\\' : '/';
    setFolder(`${workspacesDir.replace(/[\\/]+$/, '')}${sep}${safe}`);
  }, [name, workspacesDir, folderTouched]);

  const handleCreate = async () => {
    if (!name.trim() || !folder.trim()) return;
    setCreating(true);
    try {
      await createProject(name.trim(), folder);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-lg border border-cream-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-300">
          <h2 className="text-base font-medium">{t('newproject.title')}</h2>
          <button className="text-ink-300 hover:text-ink-700" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-ink-500 mb-1">{t('newproject.name')}</label>
            <input
              autoFocus
              className="input"
              placeholder={t('newproject.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && folder && handleCreate()}
            />
          </div>

          <div>
            <label className="block text-xs text-ink-500 mb-1">{t('newproject.folder')}</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[8px] border border-cream-300 bg-cream-50 min-w-0">
                <FolderOpen size={14} className="text-clay-400 shrink-0" />
                <span className={`text-sm truncate ${folder ? 'text-ink-900' : 'text-ink-300'}`} title={folder}>
                  {folder || t('newproject.empty')}
                </span>
              </div>
              <button className="btn-outline text-sm" onClick={() => setPickerOpen(true)}>
                {t('newproject.browse')}
              </button>
            </div>
            <p className="text-[11px] text-ink-300 mt-1">
              Projects are saved in the app workspace by default. You can choose an external research folder instead.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-cream-300 bg-cream-50">
          <button className="btn-ghost text-sm" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn-primary text-sm"
            onClick={handleCreate}
            disabled={!name.trim() || !folder.trim() || creating}
          >
            <Plus size={14} /> {t('common.confirm')}
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
