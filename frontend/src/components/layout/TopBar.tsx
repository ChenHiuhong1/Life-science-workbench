import type { ReactNode } from 'react';
import { Cpu, HelpCircle, Settings, ShieldCheck } from 'lucide-react';
import { useStore } from '@/store';
import { useI18n } from '@/i18n';
import { BrandAvatar } from '@/components/BrandMark';

export function TopBar({ agentCount = 0, onOpenSettings }: { agentCount?: number; onOpenSettings: () => void }) {
  const t = useI18n((s) => s.t);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <header className="h-14 shrink-0 border-b border-cream-300 bg-cream-50/95 flex items-center px-4 gap-4 shadow-[0_1px_0_rgba(255,255,255,0.72)]">
      <div className="flex items-center gap-2">
        <BrandAvatar size={30} />
        <div className="leading-none">
          <div className="font-serif text-[15px] font-semibold text-ink-900">{t('app.title')}</div>
          <div className="mt-0.5 text-[10px] font-medium text-ink-400">{t('app.subtitle')}</div>
        </div>
      </div>

      {currentProject && (
        <>
          <div className="h-5 w-px bg-cream-300" />
          <div className="max-w-[300px] truncate rounded-full border border-cream-300 bg-white/60 px-3 py-1 text-xs font-semibold text-ink-700" title={currentProject.name}>
            {currentProject.name}
          </div>
        </>
      )}

      <div className="flex-1" />

      <div className="hidden items-center gap-2 xl:flex">
        <StatusChip icon={<ShieldCheck size={13} strokeWidth={1.75} />} label="Local-first" />
        <StatusChip icon={<Cpu size={13} strokeWidth={1.75} />} label={`${agentCount || 8} agents`} />
      </div>

      <div
        className="flex items-center gap-0.5 rounded-[10px] border border-cream-300 bg-cream-100/70 p-0.5"
        title="Assistant response language"
      >
        {(['zh', 'en'] as const).map((l) => (
          <button
            key={l}
            className={`px-2.5 py-1 text-xs rounded-[6px] transition-colors ${
              lang === l ? 'bg-white text-ink-900 shadow-subtle font-semibold' : 'text-ink-500 hover:text-ink-700'
            }`}
            onClick={() => setLang(l)}
          >
            {l === 'zh' ? 'ZH' : 'EN'}
          </button>
        ))}
      </div>

      <button
        className="btn-ghost px-2 text-xs"
        onClick={() => window.open('https://github.com', '_blank')}
        title={t('topbar.help')}
      >
        <HelpCircle size={14} strokeWidth={1.75} />
      </button>
      <button className="btn-outline px-2.5 text-xs" onClick={onOpenSettings}>
        <Settings size={14} strokeWidth={1.75} />
        <span>{t('topbar.settings')}</span>
      </button>
    </header>
  );
}

function StatusChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-white/70 px-2.5 py-1 text-xs font-semibold text-ink-500 shadow-subtle">
      <span className="text-clay-500">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
