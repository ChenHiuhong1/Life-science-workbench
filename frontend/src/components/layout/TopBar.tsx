import { Settings, HelpCircle } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { BrandLogo } from '@/components/BrandMark';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <header className="h-12 shrink-0 border-b border-cream-300 bg-cream-50 flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <BrandLogo size={28} />
        <div className="leading-none">
          <div className="font-serif text-sm font-semibold text-ink-900">{t('app.title')}</div>
          <div className="text-[10px] text-ink-300">{t('app.subtitle')}</div>
        </div>
      </div>

      {currentProject && (
        <>
          <div className="text-ink-300">/</div>
          <div className="text-sm text-ink-500 truncate max-w-[260px]" title={currentProject.name}>
            {currentProject.name}
          </div>
        </>
      )}

      <div className="flex-1" />

      <div
        className="flex items-center gap-0.5 bg-cream-100 rounded-[8px] p-0.5"
        title="Assistant response language"
      >
        {(['zh', 'en'] as const).map((l) => (
          <button
            key={l}
            className={`px-2.5 py-1 text-xs rounded-[6px] transition-colors ${
              lang === l ? 'bg-white text-ink-900 shadow-subtle font-medium' : 'text-ink-500 hover:text-ink-700'
            }`}
            onClick={() => setLang(l)}
          >
            {l === 'zh' ? 'ZH' : 'EN'}
          </button>
        ))}
      </div>

      <button
        className="btn-ghost text-xs"
        onClick={() => window.open('https://github.com', '_blank')}
        title={t('topbar.help')}
      >
        <HelpCircle size={14} strokeWidth={1.75} />
      </button>
      <button className="btn-ghost text-xs" onClick={onOpenSettings}>
        <Settings size={14} strokeWidth={1.75} />
        <span>{t('topbar.settings')}</span>
      </button>
    </header>
  );
}
