import { useEffect, useState } from 'react';
import { X, FolderOpen, Plus, Check } from 'lucide-react';
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
      if (isEdit && editProject) {
        await updateProject(editProject.id, { name: name.trim(), local_path: folder.trim() });
      } else {
        await createProject(name.trim(), folder);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-cream-300 bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cream-300 bg-cream-50 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-ink-900">
            {isEdit ? t('newproject.edit_title') : t('newproject.title')}
          </h2>
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
              onKeyDown={(e) => e.key === 'Enter' && folder && handleSave()}
            />
          </div>

          <div>
            <label className="block text-xs text-ink-500 mb-1">{t('newproject.folder')}</label>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2">
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
              {isEdit
                ? t('newproject.folder_hint_edit')
                : t('newproject.folder_hint_new')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-cream-300 bg-cream-50 px-5 py-3.5">
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
