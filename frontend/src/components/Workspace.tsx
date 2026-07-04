import { FlaskConical } from 'lucide-react';
import { useStore } from '@/store';
import { ChatView } from './chat/ChatView';
import { HpcView } from './hpc/HpcView';
import { LiteratureView } from './literature/LiteratureView';
import type { AgentInfo } from '@/types';

export function Workspace({ agents }: { agents: AgentInfo[] }) {
  const agent = useStore((s) => s.agent);
  const currentProjectId = useStore((s) => s.currentProjectId);

  if (agent === 'hpc') {
    return <HpcView />;
  }

  if (agent === 'literature') {
    return <LiteratureView />;
  }

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-cream-100 flex items-center justify-center mx-auto mb-4">
            <FlaskConical size={24} className="text-clay-500" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink-500">Create or select a project</p>
          <p className="text-xs text-ink-300 mt-1">Use the plus button in Projects to begin.</p>
        </div>
      </div>
    );
  }

  return <ChatView agents={agents} />;
}
