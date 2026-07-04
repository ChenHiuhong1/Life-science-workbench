import { useEffect, useState } from 'react';
import { X, Check, KeyRound, Terminal, Globe, Brain, FolderOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';

const PRESETS = [
  { name: 'Zhipu GLM', base: 'https://open.bigmodel.cn/api/paas/v4/', model: 'glm-4-plus' },
  { name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: 'Local Ollama', base: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
];

type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('auto');
  const [hasKey, setHasKey] = useState(false);
  const [python, setPython] = useState('python');
  const [r, setR] = useState('Rscript');
  const [timeout, setTimeout_] = useState(120);
  const [appHome, setAppHome] = useState('');
  const [workspacesDir, setWorkspacesDir] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((s) => {
      setBaseUrl(s.llm_base_url);
      setModel(s.llm_model);
      setReasoningEffort(s.reasoning_effort || 'auto');
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
    setTimeout(() => setSaved(false), 2000);
  };

  const openAppHome = async () => {
    if (!appHome) return;
    await api.fsOpenFolder(appHome);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-lg shadow-lg border border-cream-300 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-300">
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
                <input
                  type="password"
                  className="input"
                  placeholder={hasKey ? 'Configured. Leave blank to keep the existing key.' : 'sk-...'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
              <Field label={t('settings.model')}>
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
              </Field>
            </Section>

            <Section icon={<Brain size={14} />} title={t('settings.thinking')}>
              <Field label={t('settings.reasoning_effort')}>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    ['auto', 'Auto'],
                    ['low', 'Low'],
                    ['medium', 'Medium'],
                    ['high', 'High'],
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
                  High effort is better for complex analysis and review. Low effort keeps quick chats snappy.
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

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-cream-300 bg-cream-50">
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
      <div className="flex items-center gap-1.5 mb-2 text-ink-500">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
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
      <div className="text-[10px] uppercase tracking-wider text-ink-300">{label}</div>
      <div className="text-xs font-mono text-ink-700 break-all">{value || '-'}</div>
    </div>
  );
}
