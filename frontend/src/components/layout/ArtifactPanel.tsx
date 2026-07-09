import { useEffect, useState } from 'react';
import { ChevronRight, FileImage, FileText, FolderOpen, Image, FileSpreadsheet, Loader2, ExternalLink } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import type { Artifact } from '@/types';
import { StructurePreview } from './StructurePreview';

type FileCategory = 'Figure' | 'Table' | 'Script' | 'Data' | 'Structure' | 'Document';

function fileCategory(name: string): FileCategory {
  const parts = name.split(/[\\/]/);
  const folder = parts.length > 1 ? parts[parts.length - 2] : '';
  if (['Figure', 'Table', 'Script', 'Data', 'Structure', 'Document'].includes(folder)) {
    return folder as FileCategory;
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'svg', 'tiff', 'tif', 'pdf'].includes(ext)) return 'Figure';
  if (['csv', 'tsv', 'xlsx', 'xls', 'parquet', 'json'].includes(ext)) return 'Table';
  if (['py', 'r', 'ipynb'].includes(ext)) return 'Script';
  if (['pdb', 'ent', 'cif', 'mmcif', 'mol', 'sdf', 'mol2', 'pdbqt'].includes(ext)) return 'Structure';
  if (['h5ad', 'h5', 'npy', 'npz', 'pkl'].includes(ext)) return 'Data';
  return 'Document';
}

function FileIcon({ name }: { name: string }) {
  const cat = fileCategory(name);
  if (cat === 'Figure') return <Image size={12} className="shrink-0 text-clay-500" />;
  if (cat === 'Table' || cat === 'Data') return <FileSpreadsheet size={12} className="shrink-0 text-ink-600" />;
  if (cat === 'Structure') return <FileImage size={12} className="shrink-0 text-clay-600" />;
  return <FileText size={12} className="shrink-0 text-ink-600" />;
}

interface FileItem {
  path: string;
  name: string;
  category: FileCategory;
  artId: string;
  artTitle: string;
  projectPath?: string;
  created_at?: string;
  artifact: Artifact;
}

export function ArtifactPanel() {
  const t = useI18n((s) => s.t);
  const [collapsed, setCollapsed] = useState(false);
  const artifacts = useStore((s) => s.artifacts);
  const agent = useStore((s) => s.agent);
  const [activePath, setActivePath] = useState<string | null>(null);

  const fileItems: FileItem[] = artifacts
    .filter((a) => a.files && a.files.length > 0)
    .flatMap((a) =>
      a.files
        .map((f) => ({
          path: f,
          name: f.split('/').pop() || f,
          category: fileCategory(f),
          artId: a.id,
          artTitle: a.title,
          projectPath: a.project_path || '',
          created_at: a.created_at,
          artifact: a,
        }))
        .filter((item) => ['Figure', 'Table', 'Structure', 'Document'].includes(item.category))
    )
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  if (collapsed) {
    return (
      <button
        className="flex w-10 shrink-0 flex-col items-center border-l border-cream-200 bg-cream-100/60 pt-3 hover:bg-cream-100"
        onClick={() => setCollapsed(false)}
        title="Expand artifacts"
      >
        <ChevronRight size={16} className="rotate-180 text-ink-500" />
        <span className="mt-2 text-[10px] text-ink-500 rotate-180" style={{ writingMode: 'vertical-rl' }}>
          {t('artifact.title')}
        </span>
      </button>
    );
  }

  const active = fileItems.find((f) => f.path === activePath) || fileItems[0];
  const structurePreviewMode = agent === 'structure' || active?.category === 'Structure';
  const panelWidth = structurePreviewMode ? 'w-[38rem]' : 'w-[21rem]';
  const listWidth = structurePreviewMode ? 'w-44' : 'w-40';

  return (
    <aside className={`${panelWidth} shrink-0 border-l border-cream-200 bg-cream-50/80 flex flex-col overflow-hidden`}>
      <div className="h-11 shrink-0 border-b border-cream-200 flex items-center justify-between px-3">
        <span className="text-xs font-semibold text-ink-700">
          {t('artifact.title')}
          {fileItems.length > 0 && (
            <span className="ml-1.5 text-ink-400">({fileItems.length})</span>
          )}
        </span>
        <button
          className="rounded-[8px] p-1 text-ink-400 hover:bg-cream-100 hover:text-ink-700"
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
            <p className="text-xs text-ink-500 leading-relaxed">{t('artifact.empty')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className={`${listWidth} shrink-0 overflow-y-auto border-r border-cream-200 bg-cream-100/40 py-1.5`}>
            {fileItems.map((f) => (
              <button
                key={`${f.artId}:${f.path}`}
                onClick={() => setActivePath(f.path)}
                className={`w-full px-2.5 py-2 text-left transition-colors ${
                  active?.path === f.path
                    ? 'bg-cream-50'
                    : 'hover:bg-cream-50/70'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileIcon name={f.name} />
                  <span className={`text-[9px] uppercase ${active?.path === f.path ? 'text-clay-500' : 'text-ink-400'}`}>{f.category}</span>
                </div>
                <div className={`truncate text-xs font-medium leading-tight ${active?.path === f.path ? 'text-ink-900' : 'text-ink-700'}`}>{f.name}</div>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {active && <FileDetail item={active} onCollapse={() => setCollapsed(true)} structureFocus={structurePreviewMode} />}
          </div>
        </div>
      )}
    </aside>
  );
}

function FileDetail({ item, onCollapse, structureFocus }: { item: FileItem; onCollapse: () => void; structureFocus: boolean }) {
  const url = api.artifactFileUrl(item.path, item.projectPath);
  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  const isImage = item.category === 'Figure' && ['png', 'jpg', 'jpeg', 'svg', 'tiff', 'tif'].includes(ext);
  const isPdf = item.category === 'Figure' && ext === 'pdf';
  const isTable = item.category === 'Table' && ['csv', 'tsv'].includes(ext);
  const isStructure = item.category === 'Structure';
  const isDocument = item.category === 'Document' && ['txt', 'md', 'html', 'htm'].includes(ext);
  const [chimeraXStatus, setChimeraXStatus] = useState('');
  const [openingChimeraX, setOpeningChimeraX] = useState(false);

  useEffect(() => {
    setChimeraXStatus('');
    setOpeningChimeraX(false);
  }, [item.path]);

  const showInFolder = async () => {
    try {
      await api.artifactOpenFolder(item.path, item.projectPath);
    } catch {}
  };

  const openInChimeraX = async () => {
    setOpeningChimeraX(true);
    setChimeraXStatus('');
    try {
      const result = await api.artifactOpenChimeraX(item.path, item.projectPath);
      setChimeraXStatus(result.ok ? 'Opened in ChimeraX.' : result.error || 'ChimeraX could not open this file.');
    } catch (e: any) {
      setChimeraXStatus(e?.message || 'ChimeraX could not open this file.');
    } finally {
      setOpeningChimeraX(false);
    }
  };

  return (
    <div className={`space-y-3 ${structureFocus ? 'p-4' : 'p-3'}`}>
      <div className="flex items-center gap-2">
        <FileIcon name={item.name} />
        <span className="text-xs font-medium text-ink-800 truncate flex-1" title={item.name}>
          {item.name}
        </span>
        <button
          className="rounded-[8px] p-1 text-ink-400 hover:bg-cream-100 hover:text-ink-700"
          onClick={onCollapse}
          title="Collapse artifacts"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="truncate text-[10px] font-medium text-ink-500">From: {item.artTitle}</div>

      {isImage && (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          <div className="overflow-hidden rounded-lg bg-cream-100 shadow-card">
            <img src={url} alt={item.name} className="w-full" />
          </div>
        </a>
      )}

      {isPdf && (
        <div className="h-72 overflow-hidden rounded-lg bg-cream-100 shadow-card">
          <object data={url} type="application/pdf" className="w-full h-full" title={item.name}>
            <div className="p-3 text-center">
              <FileText size={24} className="mx-auto text-ink-400 mb-1.5" />
              <p className="text-xs text-ink-500 break-all">{item.name}</p>
              <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-clay-500 underline">Open PDF</a>
            </div>
          </object>
        </div>
      )}

      {isTable && <TablePreview path={item.path} projectPath={item.projectPath} ext={ext} />}
      {isStructure && <StructurePreview path={item.path} projectPath={item.projectPath} large={structureFocus} />}
      {isDocument && <DocumentPreview path={item.path} projectPath={item.projectPath} />}

      {!isImage && !isPdf && !isTable && !isStructure && !isDocument && (
        <div className="rounded-lg bg-cream-100 p-3 text-center">
          <FileText size={24} className="mx-auto text-ink-400 mb-1.5" />
          <p className="text-xs text-ink-500 break-all">{item.name}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">{item.category}</p>
        </div>
      )}

      {/* Inline review + code from the artifact record. The backend already
          embeds a shape note ("12 rows x 4 cols") and an ```sw-table preview
          in artifact.output; surface it here so the panel isn't code-only. */}
      {item.artifact?.output && (
        <ArtifactReview output={item.artifact.output} />
      )}

      {isStructure && (
        <div className="space-y-1.5">
          <button
            onClick={openInChimeraX}
            disabled={openingChimeraX}
            className="btn-outline w-full px-2 py-2 text-xs"
          >
            {openingChimeraX ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Open in ChimeraX
          </button>
          {chimeraXStatus && (
            <p className="rounded-[8px] bg-cream-100 px-2.5 py-1.5 text-[10px] leading-relaxed text-ink-500">
              {chimeraXStatus}
            </p>
          )}
        </div>
      )}

      <button
        onClick={showInFolder}
        className="flex w-full items-center justify-center gap-1.5 rounded-[10px]
                   bg-clay-50 px-2 py-2 text-xs font-semibold text-clay-600 transition-colors hover:bg-clay-100"
      >
        <FolderOpen size={13} /> Show in Folder
      </button>
    </div>
  );
}

function DocumentPreview({ path, projectPath }: { path: string; projectPath?: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setText('');
    (async () => {
      try {
        const resp = await fetch(api.artifactFileUrl(path, projectPath));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.text();
        if (!cancelled) setText(raw.slice(0, 16000));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, projectPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-ink-400">
        <Loader2 size={14} className="animate-spin mr-1.5" />
        <span className="text-xs">Loading document...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg bg-cream-100 p-3 text-center">
        <FileText size={20} className="mx-auto text-ink-400 mb-1" />
        <p className="text-[11px] text-ink-500">{error}</p>
      </div>
    );
  }
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-cream-50 p-2.5 font-mono text-[10px] leading-relaxed text-ink-700 shadow-card">
      {text || 'Empty document'}
    </pre>
  );
}

// Fetch a CSV/TSV artifact and render its first ~50 rows as a real table.
// Renders a fenced ```sw-table block from the artifact review when present
// (the backend already wrote one for tables it generated), and otherwise
// streams the raw file from the artifact file endpoint.
function TablePreview({ path, projectPath, ext }: { path: string; projectPath?: string; ext: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRows(null);
    (async () => {
      try {
        const resp = await fetch(api.artifactFileUrl(path, projectPath));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const delim = ext === 'tsv' ? '\t' : ',';
        const all = text.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split(delim));
        if (cancelled) return;
        setRows(all.slice(0, 51));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load table');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, projectPath, ext]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-ink-400">
        <Loader2 size={14} className="animate-spin mr-1.5" />
        <span className="text-xs">Loading table...</span>
      </div>
    );
  }
  if (error || !rows || !rows.length) {
    return (
      <div className="rounded-lg bg-cream-100 p-3 text-center">
        <FileSpreadsheet size={20} className="mx-auto text-ink-400 mb-1" />
        <p className="text-[11px] text-ink-500">{error || 'Empty table'}</p>
      </div>
    );
  }
  const [header, ...body] = rows;
  const truncated = body.length >= 50;
  return (
    <div className="max-h-72 overflow-auto rounded-lg bg-cream-50 shadow-card">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 bg-cream-100">
          <tr>{header.map((c, i) => <th key={i} className="border border-cream-200 px-1.5 py-1 text-left font-semibold whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="even:bg-cream-100/40">
              {r.map((c, ci) => <td key={ci} className="border border-cream-200 px-1.5 py-0.5 whitespace-nowrap">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && <div className="text-[10px] text-ink-500 px-2 py-1 border-t border-cream-200">Showing first 50 rows · open file for full data</div>}
    </div>
  );
}

// Pull the prose review (shape notes, visual review, and any ```sw-table
// preview block) out of an artifact's output and render it inline. The output
// mixes stdout/stderr with the review section; we only surface the review.
function ArtifactReview({ output }: { output: string }) {
  const marker = '--- artifact review ---';
  const idx = output.indexOf(marker);
  if (idx < 0) return null;
  const review = output.slice(idx + marker.length).trim();
  if (!review) return null;
  return (
      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-cream-100 px-2.5 py-2 text-[11px] leading-relaxed text-ink-600">
      {review}
    </div>
  );
}
