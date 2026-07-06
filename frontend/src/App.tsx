import { type ReactNode, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, FolderKanban, Loader2, ShieldCheck } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ArtifactPanel } from './components/layout/ArtifactPanel';
import { Workspace } from './components/Workspace';
import { SettingsModal } from './components/settings/SettingsModal';
import { useStore } from './store';
import { api } from './api/client';
import type { AgentInfo, AgentKey } from './types';

export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(true);
  const loadProjects = useStore((s) => s.loadProjects);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {
      setAgents([
        { key: 'chat', label_zh: 'Chat', label_en: 'Chat', icon: 'message' },
        { key: 'brainstorm', label_zh: 'Study Design', label_en: 'Study Design', icon: 'lightbulb' },
        { key: 'bio', label_zh: 'Bio-Analysis', label_en: 'Bio-Analysis', icon: 'dna' },
        { key: 'protocol', label_zh: 'Protocol', label_en: 'Protocol', icon: 'flask' },
        { key: 'reviewer', label_zh: 'Reviewer', label_en: 'Reviewer', icon: 'shield-check' },
        { key: 'module', label_zh: 'Module', label_en: 'Module', icon: 'boxes' },
        { key: 'document', label_zh: 'Document', label_en: 'Document', icon: 'file-text' },
      ]);
    });
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setLaunchVisible(false), prefersReducedMotion ? 450 : 1120);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-dvh min-w-[1024px] flex-col overflow-hidden bg-[linear-gradient(135deg,#faf8f1_0%,#f1eadb_45%,#edf5ef_100%)]">
      <TopBar agentCount={agents.length} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar agents={agents} />
        <main className="flex-1 flex overflow-hidden">
          <Workspace agents={agents} onOpenSettings={() => setSettingsOpen(true)} />
          <ArtifactPanel />
        </main>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {launchVisible && <LaunchScreen agentCount={agents.length} onDismiss={() => setLaunchVisible(false)} />}
    </div>
  );
}

function LaunchScreen({ agentCount, onDismiss }: { agentCount: number; onDismiss: () => void }) {
  const modules = agentCount || 8;

  return (
    <div className="launch-shell fixed inset-0 z-50 flex items-center justify-center bg-cream-50/95 px-6 text-ink-900">
      <div className="launch-panel w-full max-w-xl overflow-hidden rounded-xl border border-cream-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-5 py-4 text-ink-900">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-[10px] bg-clay-500 p-1 shadow-subtle">
              <FolderKanban size={24} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight">Science Workbench</p>
              <p className="mt-0.5 truncate text-xs text-cream-300">Local research system</p>
            </div>
          </div>
          <button className="btn-ghost px-2 py-1 text-xs text-clay-600 hover:bg-clay-50" onClick={onDismiss}>
            Enter
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-3 gap-2">
            <LaunchSignal icon={<ShieldCheck size={15} />} label="Private" value="Local data" />
            <LaunchSignal icon={<Cpu size={15} />} label="Agents" value={`${modules} modules`} />
            <LaunchSignal icon={<CheckCircle2 size={15} />} label="Artifacts" value="Ready" />
          </div>

          <div className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-ink-700">Preparing workspace</span>
              <Loader2 size={14} className="animate-spin text-clay-500" />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cream-200">
              <div className="launch-progress h-full rounded-full bg-clay-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LaunchSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cream-300 bg-white px-3 py-2 shadow-subtle">
      <div className="mb-1 flex items-center gap-1.5 text-clay-600">
        {icon}
        <span className="text-[10px] font-semibold">{label}</span>
      </div>
      <p className="truncate text-xs font-semibold text-ink-800">{value}</p>
    </div>
  );
}

export type { AgentInfo, AgentKey };
