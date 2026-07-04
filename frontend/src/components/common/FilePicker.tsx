import { useEffect, useState, useCallback } from 'react';
import { File, Folder, FolderOpen, HardDrive, Home, ArrowUp, Loader2, Check, FileText, Image } from 'lucide-react';
import { api } from '@/api/client';

interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'svg', 'tif', 'tiff'].includes(ext)) {
    return <Image size={13} className="text-clay-400 shrink-0" />;
  }
  return <FileText size={13} className="text-ink-400 shrink-0" />;
}

export function FilePicker({
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
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.fsBrowseFiles(path);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-lg bg-white rounded-lg shadow-lg border border-cream-300 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-cream-300 flex items-center gap-2">
          <File size={16} className="text-clay-500" />
          <span className="text-sm font-medium">Select File</span>
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
          <div className="flex-1 text-xs text-ink-500 truncate font-mono px-1.5 py-1 bg-white border border-cream-300 rounded">
            {cwd}
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
            <div className="px-4 py-8 text-center text-xs text-ink-300">Empty folder</div>
          )}
          {entries.map((entry) => {
            const isSelected = selected === entry.path;
            return (
              <button
                key={entry.path}
                className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors
                  ${isSelected ? 'bg-clay-50' : 'hover:bg-cream-100'}`}
                onClick={() => {
                  if (entry.is_dir) load(entry.path);
                  else setSelected(entry.path);
                }}
              >
                {entry.is_dir
                  ? (isSelected ? <FolderOpen size={13} className="text-clay-500 shrink-0" /> : <Folder size={13} className="text-clay-400 shrink-0" />)
                  : <FileIcon name={entry.name} />}
                <span className={`truncate flex-1 ${entry.is_dir ? 'text-ink-700' : 'text-ink-500'}`}>{entry.name}</span>
                {isSelected && <Check size={12} className="text-clay-500" />}
              </button>
            );
          })}
        </div>

        {roots.length > 1 && (
          <div className="px-3 py-2 border-t border-cream-300 flex flex-wrap gap-1">
            {roots.map((root) => (
              <button
                key={root}
                onClick={() => load(root)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-cream-300 text-ink-500 hover:bg-cream-100"
              >
                <HardDrive size={10} /> {root.replace('\\', '')}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-3 border-t border-cream-300 flex items-center justify-between bg-cream-50">
          <span className="text-xs text-ink-400 truncate flex-1 mr-2 font-mono">
            {selected ? selected.split(/[\\/]/).pop() : 'No file selected'}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={onCancel}>Cancel</button>
            <button className="btn-primary text-sm" onClick={() => onConfirm(selected)} disabled={!selected}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
