import { useEffect, useState } from 'react';
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
  const loadProjects = useStore((s) => s.loadProjects);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {
      setAgents([
        { key: 'chat', label_zh: 'Chat', label_en: 'Chat', icon: 'message' },
        { key: 'literature', label_zh: 'Literature', label_en: 'Literature', icon: 'book' },
        { key: 'brainstorm', label_zh: 'Study Design', label_en: 'Study Design', icon: 'lightbulb' },
        { key: 'bio', label_zh: 'Bio-Analysis', label_en: 'Bio-Analysis', icon: 'dna' },
        { key: 'protocol', label_zh: 'Protocol', label_en: 'Protocol', icon: 'flask' },
        { key: 'reviewer', label_zh: 'Reviewer', label_en: 'Reviewer', icon: 'shield-check' },
        { key: 'module', label_zh: 'Module', label_en: 'Module', icon: 'boxes' },
      ]);
    });
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-cream-50">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar agents={agents} />
        <main className="flex-1 flex overflow-hidden">
          <Workspace agents={agents} />
          <ArtifactPanel />
        </main>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export type { AgentInfo, AgentKey };
