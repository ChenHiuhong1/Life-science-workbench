import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ArtifactPanel } from './components/layout/ArtifactPanel';
import { CodeReviewPanel } from './components/layout/CodeReviewPanel';
import { Workspace } from './components/Workspace';
import { SettingsModal } from './components/settings/SettingsModal';
import { BrandGlyph } from './components/BrandMark';
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
        { key: 'structure', label_zh: 'Structure-Bio', label_en: 'Structure-Bio', icon: 'atom' },
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
    const timer = window.setTimeout(() => setLaunchVisible(false), prefersReducedMotion ? 450 : 1400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-dvh min-w-[1024px] flex-col overflow-hidden bg-cream-50">
      <TopBar agentCount={agents.length} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar agents={agents} />
        <main className="flex-1 flex overflow-hidden">
          <Workspace agents={agents} onOpenSettings={() => setSettingsOpen(true)} />
          <ArtifactPanel />
        </main>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <CodeReviewPanel />
      {launchVisible && <LaunchScreen onDismiss={() => setLaunchVisible(false)} />}
    </div>
  );
}

/**
 * Cinematic launch surface — a single confident brand moment, not a card of
 * stats. Warm ivory floor, a deep SYSU-green spine on the left, the wordmark
 * in Newsreader serif, one elegant progress bar, and one decisive entry action.
 * No three-metric grid, no gradient text, no ghost card.
 */
function LaunchScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="launch-shell fixed inset-0 z-50 flex cursor-pointer overflow-hidden bg-cream-50"
      onClick={onDismiss}
      role="button"
      aria-label="Enter Science Workbench"
    >
      {/* Deep emerald spine — the committed color surface (≤10% of view). */}
      <div className="w-2 shrink-0 bg-clay-600" aria-hidden />

      <div className="launch-rise flex flex-1 flex-col items-center justify-center px-8 text-center">
        <BrandGlyph size={56} strokeWidth={1.6} className="mb-7 text-clay-500" />

        <h1 className="font-serif text-[2.6rem] leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[3.1rem]">
          Science Workbench
        </h1>
        <p className="mt-3 font-serif text-base italic text-ink-600">
          A local research instrument.
        </p>

        {/* Single divider — a short, deliberate rule, not a decorative grid. */}
        <div className="mt-9 h-px w-16 bg-cream-300" aria-hidden />

        {/* One progress treatment — the workspace is being prepared. */}
        <div className="mt-7 w-64 max-w-full">
          <div className="h-[3px] overflow-hidden rounded-full bg-cream-200">
            <div className="launch-progress h-full rounded-full bg-clay-500" />
          </div>
        </div>

        <button
          className="group mt-10 inline-flex items-center gap-2 text-sm font-medium text-ink-600 transition-colors hover:text-clay-500"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        >
          <span>Enter workspace</span>
          <ArrowRight size={15} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

export type { AgentInfo, AgentKey };
