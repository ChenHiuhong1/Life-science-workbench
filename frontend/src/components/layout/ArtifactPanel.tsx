import { useState } from 'react';
import { ChevronRight, FileImage, FileText, FolderOpen, Image, FileSpreadsheet } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';

function fileCategory(name: string): 'image' | 'data' | 'doc' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'svg', 'tiff', 'tif'].includes(ext)) return 'image';
  if (['csv', 'tsv', 'xlsx', 'xls', 'h5ad', 'h5', 'npy', 'npz', 'pkl', 'parquet', 'json'].includes(ext)) return 'data';
  return 'doc';
}

function FileIcon({ name }: { name: string }) {
  const cat = fileCategory(name);
  if (cat === 'image') return <Image size={12} className="text-clay-500 shrink-0" />;
  if (cat === 'data') return <FileSpreadsheet size={12} className="text-ink-500 shrink-0" />;
  return <FileText size={12} className="text-ink-500 shrink-0" />;
}

interface FileItem {
  path: string;
  name: string;
  category: 'image' | 'data' | 'doc';
  artId: string;
  artTitle: string;
  created_at?: string;
}

export function ArtifactPanel() {
  const t = useI18n((s) => s.t);
  const [collapsed, setCollapsed] = useState(false);
  const artifacts = useStore((s) => s.artifacts);
  const [activePath, setActivePath] = useState<string | null>(null);

  const fileItems: FileItem[] = artifacts
    .filter((a) => a.files && a.files.length > 0)
    .flatMap((a) =>
      a.files.map((f) => ({
        path: f,
        name: f.split('/').pop() || f,
        category: fileCategory(f),
        artId: a.id,
        artTitle: a.title,
        created_at: a.created_at,
      }))
    )
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  if (collapsed) {
    return (
      <button
        className="w-10 shrink-0 border-l border-cream-300 bg-cream-50 flex flex-col items-center pt-3 hover:bg-cream-100"
        onClick={() => setCollapsed(false)}
        title="Expand artifacts"
      >
        <ChevronRight size={16} className="rotate-180 text-ink-500" />
        <span className="mt-2 text-[10px] text-ink-300 rotate-180" style={{ writingMode: 'vertical-rl' }}>
          {t('artifact.title')}
        </span>
      </button>
    );
  }

  const active = fileItems.find((f) => f.path === activePath) || fileItems[0];

  return (
    <aside className="w-80 shrink-0 border-l border-cream-300 bg-white flex flex-col overflow-hidden">
      <div className="h-10 shrink-0 border-b border-cream-300 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          {t('artifact.title')}
          {fileItems.length > 0 && (
            <span className="ml-1.5 text-ink-300 normal-case">({fileItems.length})</span>
          )}
        </span>
        <button
          className="text-ink-300 hover:text-ink-700 p-1 rounded hover:bg-cream-100"
          onClick={() => setCollapsed(true)}
          title="Collapse artifacts"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {fileItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <FileImage size={32} className="mx-auto text-cream-400 mb-3" strokeWidth={1} />
            <p className="text-xs text-ink-300 leading-relaxed">{t('artifact.empty')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-36 shrink-0 border-r border-cream-300 overflow-y-auto py-1.5">
            {fileItems.map((f) => (
              <button
                key={`${f.artId}:${f.path}`}
                onClick={() => setActivePath(f.path)}
                className={`w-full text-left px-2.5 py-2 border-l-2 transition-colors ${
                  active?.path === f.path
                    ? 'border-clay-500 bg-clay-50'
                    : 'border-transparent hover:bg-cream-100'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileIcon name={f.name} />
                  <span className="text-[9px] uppercase text-ink-300">{f.category}</span>
                </div>
                <div className="text-xs text-ink-700 truncate leading-tight">{f.name}</div>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {active && <FileDetail item={active} onCollapse={() => setCollapsed(true)} />}
          </div>
        </div>
      )}
    </aside>
  );
}

function FileDetail({ item, onCollapse }: { item: FileItem; onCollapse: () => void }) {
  const url = api.artifactFileUrl(item.path);
  const isImage = item.category === 'image';

  const showInFolder = async () => {
    try {
      await api.artifactOpenFolder(item.path);
    } catch {}
  };

  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <FileIcon name={item.name} />
        <span className="text-xs font-medium text-ink-800 truncate flex-1" title={item.name}>
          {item.name}
        </span>
        <button
          className="text-ink-300 hover:text-ink-700 p-1 rounded hover:bg-cream-100"
          onClick={onCollapse}
          title="Collapse artifacts"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="text-[10px] text-ink-300 truncate">From: {item.artTitle}</div>

      {isImage && (
        <div className="rounded-lg overflow-hidden border border-cream-300 bg-cream-50">
          <img src={url} alt={item.name} className="w-full" />
        </div>
      )}

      {!isImage && (
        <div className="rounded-lg border border-cream-300 bg-cream-50 p-3 text-center">
          <FileText size={24} className="mx-auto text-ink-400 mb-1.5" />
          <p className="text-xs text-ink-500 break-all">{item.name}</p>
          <p className="text-[10px] text-ink-300 mt-0.5">{item.category === 'data' ? 'Data file' : 'Document'}</p>
        </div>
      )}

      <button
        onClick={showInFolder}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-[8px]
                   bg-clay-50 border border-clay-100 text-clay-600 hover:bg-clay-100 transition-colors"
      >
        <FolderOpen size={13} /> Show in Folder
      </button>
    </div>
  );
}
