import { useEffect, useState } from 'react';
import {
  Server, Plus, Trash2, Plug, Terminal, Upload, Download,
  ListChecks, FolderOpen, Loader2, CheckCircle2, XCircle, Send, FileText,
} from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import { FolderPicker } from '@/components/common/FolderPicker';
import { FilePicker } from '@/components/common/FilePicker';

interface HpcConn {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  scheduler: string;
  work_dir: string;
  project_id: string | null;
  has_password: boolean;
}

type Tab = 'terminal' | 'files' | 'jobs';

export function HpcView() {
  const t = useI18n((s) => s.t);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const [conns, setConns] = useState<HpcConn[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('terminal');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.hpcList(currentProjectId || undefined);
      setConns(list);
      if (list.length && !activeId) setActiveId(list[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentProjectId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (conns.length && !activeId) setActiveId(conns[0].id); }, [conns]);

  const active = conns.find((conn) => conn.id === activeId);

  const del = async (id: string) => {
    await api.hpcDelete(id);
    setConns((items) => items.filter((conn) => conn.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-cream-50/70">
      <div className="shrink-0 border-b border-cream-200 px-5 py-3.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1" />
          <button className="btn-outline text-xs" onClick={() => setAdding(true)}>
            <Plus size={12} /> {t('hpc.add')}
          </button>
        </div>

        {conns.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conns.map((conn) => (
              <button
                key={conn.id}
                onClick={() => setActiveId(conn.id)}
                className={`group flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors
                  ${activeId === conn.id
                    ? 'bg-clay-100 text-clay-600'
                    : 'bg-cream-100 text-ink-600 hover:bg-cream-150'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                <span>{conn.name}</span>
                <span className="text-ink-500 font-mono">{conn.username}@{conn.host}:{conn.port}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-err"
                  onClick={(e) => { e.stopPropagation(); del(conn.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); del(conn.id); } }}
                  title="Delete connection"
                >
                  <Trash2 size={11} />
                </span>
              </button>
            ))}
          </div>
        )}

        {conns.length === 0 && !loading && (
          <div className="text-center py-6">
            <Server size={28} className="mx-auto text-cream-400 mb-2" strokeWidth={1} />
            <p className="text-xs text-ink-500 mb-3">{t('hpc.empty')}</p>
            <button className="btn-primary text-xs" onClick={() => setAdding(true)}>
              <Plus size={12} /> {t('hpc.add')}
            </button>
          </div>
        )}
      </div>

      {active ? (
        <HpcBody conn={active} tab={tab} setTab={setTab} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          {loading ? (
            <Loader2 size={20} className="animate-spin text-ink-500" />
          ) : (
            <>
              <Server size={40} className="text-cream-400" strokeWidth={1.2} />
              <p className="text-sm text-ink-500">Add a connection to configure your HPC server.</p>
              <p className="text-xs text-ink-500">Host, port, username, and password are enough for password SSH.</p>
            </>
          )}
        </div>
      )}

      {adding && (
        <AddConnModal
          projectId={currentProjectId || ''}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); load(); }}
        />
      )}
    </section>
  );
}

function HpcBody({ conn, tab, setTab }: { conn: HpcConn; tab: Tab; setTab: (tab: Tab) => void }) {
  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: 'terminal', icon: Terminal, label: 'Terminal' },
    { key: 'files', icon: FolderOpen, label: 'Files' },
    { key: 'jobs', icon: ListChecks, label: 'Jobs' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-cream-200 bg-cream-100 px-4 flex items-center gap-1">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors
                ${tab === item.key ? 'border-clay-500 text-clay-600' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
            >
              <Icon size={13} /> {item.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'terminal' && <TerminalPane conn={conn} />}
        {tab === 'files' && <FilesPane conn={conn} />}
        {tab === 'jobs' && <JobsPane conn={conn} />}
      </div>
    </div>
  );
}

function TerminalPane({ conn }: { conn: HpcConn }) {
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<{ cmd: string; out: string; err: string; code: number }[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!cmd.trim() || running) return;
    const command = cmd.trim();
    setCmd('');
    setRunning(true);
    setHistory((items) => [...items, { cmd: command, out: '', err: '', code: -1 }]);
    try {
      const result = await api.hpcExec(conn.id, command, 300);
      setHistory((items) => {
        const last = items[items.length - 1];
        return [...items.slice(0, -1), { ...last, out: result.stdout || '', err: result.stderr || '', code: result.code }];
      });
    } catch (e: any) {
      setHistory((items) => {
        const last = items[items.length - 1];
        return [...items.slice(0, -1), { ...last, err: e.message, code: 1 }];
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-ink-900">
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        <div className="text-ink-500 mb-2">
          <span className="text-ok">online</span> {conn.username}@{conn.host}:{conn.port}
          {conn.work_dir && <span className="text-[#BCA98F]"> - {conn.work_dir}</span>}
        </div>
        {history.map((item, index) => (
          <div key={index} className="mb-2">
            <div className="text-clay-300">$ {item.cmd}</div>
            {item.out && <pre className="whitespace-pre-wrap text-cream-50">{item.out}</pre>}
            {item.err && <pre className="text-[#F48771] whitespace-pre-wrap">{item.err}</pre>}
            {item.code !== 0 && item.code !== -1 && (
              <div className="text-[#F48771]">[exit {item.code}]</div>
            )}
          </div>
        ))}
        {running && <div className="text-ink-400">Running...</div>}
      </div>
      <div className="shrink-0 border-t border-[#3B2D23] p-2 flex items-center gap-2">
        <span className="px-1 font-mono text-xs text-clay-300">$</span>
        <input
          className="flex-1 bg-transparent font-mono text-xs text-cream-50 placeholder:text-[#8AA092] focus:outline-none"
          placeholder="Type a command, for example: ls -lh, squeue --me, module load python"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          disabled={running}
        />
        <button onClick={run} disabled={!cmd.trim() || running} className="text-[#BCA98F] hover:text-clay-300 disabled:opacity-40" title="Run command">
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

function FilesPane({ conn }: { conn: HpcConn }) {
  const t = useI18n((s) => s.t);
  const [remotePath, setRemotePath] = useState(conn.work_dir || '~');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState('');
  const [uploadLocal, setUploadLocal] = useState('');
  const [uploadRemote, setUploadRemote] = useState('');
  const [downloadLocal, setDownloadLocal] = useState('');
  const [downloadRemote, setDownloadRemote] = useState('');
  const [picker, setPicker] = useState<null | 'up_file' | 'up_dir' | 'dl_dir'>(null);

  const ls = async (path = remotePath) => {
    setLoading(true);
    try {
      const result = await api.hpcLs(conn.id, path);
      if (result.ok) {
        setRemotePath(result.path || path);
        setEntries(result.entries);
        setLog('');
      } else {
        setLog(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = conn.work_dir || '~';
    setRemotePath(initial);
    setEntries([]);
    setLog('');
    ls(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  const doUpload = async () => {
    if (!uploadLocal || !uploadRemote) return;
    setLog('Uploading...');
    const result = await api.hpcUpload(conn.id, uploadLocal, uploadRemote);
    setLog(result.ok ? `Upload complete (${result.size}B) -> ${result.remote}` : `Upload failed: ${result.error}`);
    if (result.ok) ls();
  };

  const doDownload = async () => {
    if (!downloadLocal || !downloadRemote) return;
    setLog('Downloading...');
    const result = await api.hpcDownload(conn.id, downloadRemote, downloadLocal);
    setLog(result.ok ? `Download complete (${result.size}B) -> ${result.local}` : `Download failed: ${result.error}`);
  };

  const onRemoteClick = (entry: any) => {
    const full = remotePath.replace(/\/$/, '') + '/' + entry.name;
    if (entry.is_dir) {
      ls(full);
    } else {
      setDownloadRemote(full);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 bg-cream-50/70 p-4">
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-clay-500" />
            <span className="text-xs font-medium">Remote Directory</span>
          </div>
          <span className="text-[10px] text-ink-400">Click folders to enter, files to prepare a download.</span>
        </div>
        <div className="flex gap-1.5 mb-2">
          <input
            className="input text-xs font-mono py-1.5"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ls()}
          />
          <button className="btn-outline text-xs" onClick={() => ls()}>List</button>
        </div>
        {loading && <Loader2 size={14} className="animate-spin text-ink-500" />}
        <div className="max-h-48 overflow-y-auto font-mono text-xs">
          {entries.map((entry, index) => (
            <button
              key={`${entry.name}:${index}`}
              className={`group flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-left hover:bg-cream-100
                ${!entry.is_dir && downloadRemote.endsWith('/' + entry.name) ? 'bg-clay-50 text-clay-600' : ''}`}
              onClick={() => onRemoteClick(entry)}
            >
              {entry.is_dir
                ? <FolderOpen size={12} className="text-clay-400" />
                : <FileText size={12} className="text-ink-400" />}
              <span className={entry.is_dir ? 'text-ink-700' : 'text-ink-500'}>{entry.name}</span>
              <span className="ml-auto text-ink-500 text-[10px]">
                {entry.is_dir ? 'dir' : formatSize(entry.size)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Upload size={14} className="text-clay-500" />
          <span className="text-xs font-medium">{t('hpc.upload')} (local to remote)</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              className="input text-xs font-mono py-1.5"
              placeholder="Local file or folder path"
              value={uploadLocal}
              onChange={(e) => setUploadLocal(e.target.value)}
              readOnly
            />
            <button className="btn-outline text-xs shrink-0" onClick={() => setPicker('up_file')}>File</button>
            <button className="btn-outline text-xs shrink-0" onClick={() => setPicker('up_dir')}>Folder</button>
          </div>
          <input
            className="input text-xs font-mono py-1.5"
            placeholder="Remote target folder or full path, for example /home/user/data/"
            value={uploadRemote}
            onChange={(e) => setUploadRemote(e.target.value)}
          />
          <button className="btn-primary text-xs w-full" onClick={doUpload} disabled={!uploadLocal || !uploadRemote}>
            <Upload size={12} /> {t('hpc.upload')}
          </button>
        </div>
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Download size={14} className="text-clay-500" />
          <span className="text-xs font-medium">{t('hpc.download')} (remote to local)</span>
        </div>
        <div className="space-y-1.5">
          <input
            className="input text-xs font-mono py-1.5"
            placeholder="Remote file path. Clicking a file above fills this field."
            value={downloadRemote}
            onChange={(e) => setDownloadRemote(e.target.value)}
          />
          <div className="flex gap-1.5">
            <input
              className="input text-xs font-mono py-1.5"
              placeholder="Local save path"
              value={downloadLocal}
              onChange={(e) => setDownloadLocal(e.target.value)}
              readOnly
            />
            <button className="btn-outline text-xs shrink-0" onClick={() => setPicker('dl_dir')}>Folder</button>
          </div>
          <button className="btn-primary text-xs w-full" onClick={doDownload} disabled={!downloadLocal || !downloadRemote}>
            <Download size={12} /> {t('hpc.download')}
          </button>
        </div>
      </div>

      {log && <div className="text-xs text-ink-500 px-2 font-mono break-all">{log}</div>}

      {picker === 'up_file' && (
        <FilePicker
          onConfirm={(path) => { setUploadLocal(path); setPicker(null); }}
          onCancel={() => setPicker(null)}
        />
      )}
      {picker === 'up_dir' && (
        <FolderPicker
          onConfirm={(path) => { setUploadLocal(path); setPicker(null); }}
          onCancel={() => setPicker(null)}
        />
      )}
      {picker === 'dl_dir' && (
        <FolderPicker
          onConfirm={(path) => {
            const fileName = downloadRemote.split('/').pop() || 'download';
            setDownloadLocal(path.replace(/[/\\]$/, '') + '/' + fileName);
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function formatSize(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}G`;
}

function JobsPane({ conn }: { conn: HpcConn }) {
  const t = useI18n((s) => s.t);
  const [queue, setQueue] = useState('');
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState(`#!/bin/bash
#SBATCH --job-name=my_analysis
#SBATCH --partition=cpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=04:00:00
#SBATCH --output=result_%j.out

module load python/3.11
cd $SLURM_SUBMIT_DIR

echo "Job started at $(date)"
python my_analysis.py
echo "Job finished at $(date)"
`);
  const [submitMsg, setSubmitMsg] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await api.hpcQueue(conn.id);
      setQueue((result.stdout || '') + (result.stderr ? '\n[stderr]\n' + result.stderr : ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async () => {
    setSubmitMsg('Submitting...');
    const result = await api.hpcSbatch(conn.id, script);
    setSubmitMsg(JSON.stringify(result.submit_result || result, null, 2));
    setTimeout(refresh, 1000);
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 bg-cream-50/70 p-4">
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ListChecks size={14} className="text-clay-500" />
            <span className="text-xs font-medium">{t('hpc.queue')} ({conn.scheduler})</span>
          </div>
          <button className="btn-outline text-xs" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : 'Refresh'}
          </button>
        </div>
        <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap rounded-lg bg-ink-900 p-2.5 font-mono text-xs text-cream-50">
          {queue || '(empty)'}
        </pre>
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Send size={14} className="text-clay-500" />
          <span className="text-xs font-medium">{t('hpc.sbatch')}</span>
        </div>
        <textarea
          className="input font-mono text-xs"
          rows={14}
          value={script}
          onChange={(e) => setScript(e.target.value)}
        />
        <button className="btn-primary text-xs w-full mt-2" onClick={submit}>
          <Send size={12} /> Submit Job
        </button>
        {submitMsg && (
          <pre className="mt-2 bg-cream-100 rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
            {submitMsg}
          </pre>
        )}
      </div>
    </div>
  );
}

function AddConnModal({ projectId, onClose, onCreated }: { projectId?: string; onClose: () => void; onCreated: () => void }) {
  const t = useI18n((s) => s.t);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number | ''>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [workDir, setWorkDir] = useState('');
  const [scheduler, setScheduler] = useState('slurm');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const create = async () => {
    if (!host || !username) return;
    await api.hpcCreate({
      name: name || host,
      host,
      port: port || 22,
      username,
      password,
      scheduler,
      work_dir: workDir,
      project_id: projectId || null,
    });
    onCreated();
  };

  const test = async () => {
    if (!host || !username) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.hpcTestCreds({
        host,
        port: port || 22,
        username,
        password,
        work_dir: workDir,
      });
      setTestResult({ ok: result.ok, msg: result.ok ? result.output : result.error });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'Request failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-cream-50 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-cream-200 bg-cream-100 px-5 py-4">
          <Server size={16} className="text-clay-500" />
          <h2 className="text-base font-medium">{t('hpc.add')}</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <Field label="Connection Name" hint="A memorable name for this server. Any language is accepted.">
            <input className="input" placeholder="Lab cluster" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Host (IP or domain)" hint="The server IP or domain without protocol or port.">
            <input className="input" placeholder="yun.example.com or 192.168.1.100" value={host} onChange={(e) => setHost(e.target.value)} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Port" hint="SSH port">
              <input type="number" className="input" placeholder="22" value={port} onChange={(e) => setPort(e.target.value ? Number(e.target.value) : '')} />
            </Field>
            <Field label="Username" className="col-span-2" hint="Login account">
              <input className="input" placeholder="iy191" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
          </div>

          <Field label="Password" hint="Stored locally and used only for SSH connection.">
            <input type="password" className="input" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Working Directory" hint="Default remote folder after login. Leave blank for home.">
              <input className="input font-mono text-xs" placeholder="~/work" value={workDir} onChange={(e) => setWorkDir(e.target.value)} />
            </Field>
            <Field label="Scheduler" hint="Job scheduler used by this server.">
              <select className="input" value={scheduler} onChange={(e) => setScheduler(e.target.value)}>
                <option value="slurm">SLURM</option>
                <option value="pbs">PBS</option>
                <option value="sge">SGE</option>
                <option value="none">None</option>
              </select>
            </Field>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
              testResult.ok ? 'bg-ok/10 text-ok' : 'bg-err/10 text-err'
            }`}>
              {testResult.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
              <pre className="font-mono whitespace-pre-wrap break-all">{testResult.msg}</pre>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-cream-200 bg-cream-100 px-5 py-3.5">
          <button className="btn-outline text-sm" onClick={test} disabled={!host || !username || testing}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            {t('hpc.test')}
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn-primary text-sm" onClick={create} disabled={!host || !username}>
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-ink-700 mb-0.5">{label}</label>
      {hint && <p className="text-[10px] text-ink-500 mb-1.5 leading-tight">{hint}</p>}
      {children}
    </div>
  );
}
