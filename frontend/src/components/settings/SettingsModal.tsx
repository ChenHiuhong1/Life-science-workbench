import { useEffect, useState } from 'react';
import { X, Check, KeyRound, Terminal, Globe, Brain, FolderOpen, Trash2, NotebookPen } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useStore } from '@/store';
import { api } from '@/api/client';

const PRESETS = [
  // glm-5.2 base id already provides the full 1M context (verified by live
  // probe: it accepts 400K-token inputs natively). Don't expose a [1m]
  // variant: that suffix returns "model not found" on the Anthropic endpoint.
  { name: 'GLM-5.2 (1M context)', base: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.2' },
  { name: 'GLM-4.6', base: 'https://open.bigmodel.cn/api/paas/v4/', model: 'glm-4.6' },
  { name: 'GLM-4-Plus', base: 'https://open.bigmodel.cn/api/paas/v4/', model: 'glm-4-plus' },
  { name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: 'Local Ollama', base: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
];

// Zhipu GLM exposes three thinking tiers: none / high / max. These are the
// values stored in .env (REASONING_EFFORT) and sent per-message from chat.
type ReasoningEffort = 'none' | 'high' | 'max';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('max');
  const [hasKey, setHasKey] = useState(false);
  const [python, setPython] = useState('python');
  const [r, setR] = useState('Rscript');
  const [timeout, setTimeout_] = useState(120);
  const [appHome, setAppHome] = useState('');
  const [workspacesDir, setWorkspacesDir] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  // AGENTS.md long-term memory editor.
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectPath = projects.find((p) => p.id === currentProjectId)?.local_path || '';
  const [memoryContent, setMemoryContent] = useState('');
  const [memoryPath, setMemoryPath] = useState('');
  const [memoryDirty, setMemoryDirty] = useState(false);

  useEffect(() => {
    // Load the effective AGENTS.md (per-project when a folder is bound, else global).
    setMemoryDirty(false);
    api.getMemory(currentProjectPath).then((m) => {
      setMemoryContent(m.content);
      setMemoryPath(m.target_path);
    }).catch(() => { setMemoryContent(''); setMemoryPath(''); });
  }, [currentProjectPath]);

  useEffect(() => {
    api.getSettings().then((s) => {
      setBaseUrl(s.llm_base_url);
      setModel(s.llm_model);
      // Normalise legacy values (auto/low/medium) into the 3 GLM tiers.
      const raw = (s.reasoning_effort || 'max') as string;
      const norm: ReasoningEffort = raw === 'none' ? 'none' : raw === 'high' ? 'high' : 'max';
      setReasoningEffort(norm);
      setHasKey(s.has_api_key);
      setPython(s.python_executable);
      setR(s.r_executable);
      setTimeout_(s.sandbox_timeout);
      setAppHome(s.app_home || '');
      setWorkspacesDir(s.workspaces_dir || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    await api.saveSettings({
      llm_base_url: baseUrl,
      llm_api_key: apiKey || undefined,
      llm_model: model,
      reasoning_effort: reasoningEffort,
      python_executable: python,
      r_executable: r,
      sandbox_timeout: timeout,
    });
    setSaved(true);
    setHasKey(true);
    setApiKey('');
    setTimeout(() => setSaved(false), 2000);
  };

  const clearApiKey = async () => {
    if (!confirm('Clear the stored API key?\n\nThis removes the key from the local .env file on this machine. Other settings are kept. This cannot be undone.')) {
      return;
    }
    try {
      await api.clearApiKey();
      setApiKey('');
      setHasKey(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // surface via saved flag inversion is overkill; the dialog stays usable.
    }
  };

  const openAppHome = async () => {
    if (!appHome) return;
    await api.fsOpenFolder(appHome);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-cream-300 bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cream-300 bg-cream-50 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-ink-900">{t('settings.title')}</h2>
          <button className="text-ink-300 hover:text-ink-700" onClick={onClose} title="Close settings">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-300">{t('common.loading')}</div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <Section icon={<Globe size={14} />} title={t('settings.lang')}>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['zh', 'Chinese'],
                  ['en', 'English'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setLang(value)}
                    className={`py-1.5 text-sm rounded-[8px] border transition-colors ${
                      lang === value
                        ? 'border-clay-400 bg-clay-50 text-clay-600'
                        : 'border-cream-300 text-ink-500 hover:bg-cream-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-ink-300 mt-1 leading-relaxed">
                The interface stays English. This only controls assistant replies in chat.
              </p>
            </Section>

            <Section icon={<KeyRound size={14} />} title={t('settings.llm')}>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => { setBaseUrl(p.base); setModel(p.model); }}
                    className={`px-2 py-1 text-[11px] rounded-full border transition-colors ${
                      baseUrl === p.base
                        ? 'border-clay-400 bg-clay-50 text-clay-600'
                        : 'border-cream-300 text-ink-500 hover:bg-cream-100'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <Field label={t('settings.base_url')}>
                <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </Field>
              <Field label={t('settings.api_key')}>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="input flex-1"
                    placeholder={hasKey ? 'Configured. Leave blank to keep the existing key.' : 'sk-...'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {hasKey && (
                    <button
                      type="button"
                      onClick={clearApiKey}
                      title="Remove the stored API key from this machine"
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-[8px]
                                 border border-err/30 text-err hover:bg-err/10"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  )}
                </div>
              </Field>
              <Field label={t('settings.model')}>
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
              </Field>
            </Section>

            <Section icon={<Brain size={14} />} title={t('settings.thinking')}>
              <Field label={t('settings.reasoning_effort')}>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['none', 'No thinking'],
                    ['high', 'High'],
                    ['max', 'Highest'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReasoningEffort(value)}
                      className={`py-1.5 text-xs rounded-[8px] border transition-colors ${
                        reasoningEffort === value
                          ? 'border-clay-400 bg-clay-50 text-clay-600'
                          : 'border-cream-300 text-ink-500 hover:bg-cream-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-300 mt-1 leading-relaxed">
                  Highest is best for complex analysis and review. No thinking keeps quick chats snappy. This is the default for new chats; you can also override it per message in the chat box.
                </p>
              </Field>
            </Section>

            <Section icon={<FolderOpen size={14} />} title={t('settings.app_folder')}>
              <div className="rounded-[8px] border border-cream-300 bg-cream-50 px-3 py-2 space-y-1.5">
                <PathRow label="App Home" value={appHome} />
                <PathRow label="Workspaces" value={workspacesDir} />
                <button className="btn-outline text-xs mt-1" type="button" onClick={openAppHome}>
                  <FolderOpen size={13} /> Open App Folder
                </button>
              </div>
            </Section>

            <Section icon={<NotebookPen size={14} />} title="Project memory (AGENTS.md)">
              <p className="text-[11px] text-ink-400 leading-relaxed -mt-1">
                Durable instructions injected into every agent for this project (like CLAUDE.md). Plain Markdown. Empty = no memory. Saved to{' '}
                <span className="font-mono text-ink-500 break-all">{memoryPath || '(none)'}</span>.
              </p>
              <textarea
                className="input font-mono text-xs min-h-[120px]"
                placeholder={'# Project memory\n\n- This project uses GRCh38.\n- Prefer R (Seurat) for single-cell.\n- Always cite package versions in Methods.'}
                value={memoryContent}
                onChange={(e) => { setMemoryContent(e.target.value); setMemoryDirty(true); }}
                rows={6}
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-ink-300">{memoryContent.length} chars</span>
                <button
                  className="btn-primary text-xs"
                  type="button"
                  disabled={!memoryDirty}
                  onClick={async () => {
                    await api.saveMemory(currentProjectPath, memoryContent);
                    setMemoryDirty(false);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1500);
                  }}
                >
                  {saved ? <><Check size={13} /> Saved</> : 'Save memory'}
                </button>
              </div>
            </Section>

            <Section icon={<Terminal size={14} />} title={t('settings.sandbox')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('settings.python')}>
                  <input className="input" value={python} onChange={(e) => setPython(e.target.value)} />
                </Field>
                <Field label={t('settings.r')}>
                  <input className="input" value={r} onChange={(e) => setR(e.target.value)} />
                </Field>
              </div>
              <Field label={t('settings.timeout')}>
                <input
                  type="number"
                  className="input"
                  value={timeout}
                  onChange={(e) => setTimeout_(Number(e.target.value))}
                />
              </Field>
            </Section>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-cream-300 bg-cream-50 px-5 py-3.5">
          <button className="btn-ghost text-sm" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary text-sm" onClick={save} disabled={loading}>
            {saved ? <><Check size={14} /> {t('settings.saved')}</> : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-ink-600">
        {icon}
        <span className="text-xs font-bold uppercase tracking-[0.14em]">{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="text-xs font-mono text-ink-700 break-all">{value || '-'}</div>
    </div>
  );
}
