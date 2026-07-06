import { useEffect, useState, useCallback } from 'react';
import { Folder, FolderOpen, HardDrive, Home, ArrowUp, Loader2, Check } from 'lucide-react';
import { api } from '@/api/client';

interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
}

export function FolderPicker({
  initialPath = '',
  onConfirm,
  onCancel,
}: {
  initialPath?: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}) {
  const [cwd, setCwd] = useState(initialPath);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [home, setHome] = useState('');
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.fsBrowse(path, true);
      setEntries(data);
      setCwd(path);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.fsHome().then((d) => {
      setHome(d.home);
      setRoots(d.roots);
      load(initialPath || d.home);
    });
  }, [initialPath, load]);

  const goParent = () => {
    const parent = cwd.replace(/[/\\][^/\\]*$/, '') || cwd;
    if (parent !== cwd) load(parent);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/30 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-cream-300 bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-cream-300 bg-cream-50 px-4 py-3">
          <Folder size={16} className="text-clay-500" />
          <span className="text-sm font-semibold text-ink-900">Select Folder</span>
        </div>

        <div className="px-3 py-2 border-b border-cream-300 flex items-center gap-1.5 bg-cream-50">
          <button className="text-ink-400 hover:text-ink-700 p-1 rounded hover:bg-cream-100" onClick={() => load(home)} title="Home">
            <Home size={13} />
          </button>
          <button
            className="text-ink-400 hover:text-ink-700 p-1 rounded hover:bg-cream-100"
            onClick={goParent}
            title="Parent Folder"
          >
            <ArrowUp size={13} />
          </button>
          <div className="flex-1 truncate rounded-[8px] border border-cream-300 bg-white px-1.5 py-1 font-mono text-xs text-ink-500">
            {cwd || 'No folder selected'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[300px]">
          {loading && (
            <div className="flex items-center justify-center py-8 text-ink-300">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
          {error && <div className="px-4 py-3 text-xs text-err">{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-ink-300">No subfolders</div>
          )}
          {entries.map((entry) => (
            <button
              key={entry.path}
              className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-cream-100"
              onClick={() => load(entry.path)}
            >
              {cwd === entry.path ? (
                <FolderOpen size={14} className="text-clay-500 shrink-0" />
              ) : (
                <Folder size={14} className="text-clay-400 shrink-0" />
              )}
              <span className="truncate flex-1">{entry.name}</span>
              {cwd === entry.path && <Check size={12} className="text-clay-500" />}
            </button>
          ))}
        </div>

        {roots.length > 1 && (
          <div className="px-3 py-2 border-t border-cream-300 flex flex-wrap gap-1">
            {roots.map((root) => (
              <button
                key={root}
                onClick={() => load(root)}
                className="flex items-center gap-1 rounded-[8px] border border-cream-300 px-2 py-0.5 text-[11px] text-ink-500 hover:bg-cream-100"
              >
                <HardDrive size={10} /> {root.replace('\\', '')}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-cream-300 bg-cream-50 px-4 py-3">
          <span className="text-xs text-ink-300 truncate flex-1 mr-2 font-mono">{cwd || 'No folder selected'}</span>
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={onCancel}>Cancel</button>
            <button className="btn-primary text-sm" onClick={() => onConfirm(cwd)} disabled={!cwd}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
