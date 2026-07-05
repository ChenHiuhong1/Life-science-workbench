import { useStore } from '@/store';
import { BrandAvatar } from './BrandMark';
import { ChatView } from './chat/ChatView';
import { HpcView } from './hpc/HpcView';
import { LiteratureView } from './literature/LiteratureView';
import { DocumentEditor } from './document/DocumentEditor';
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

  if (agent === 'document') {
    if (!currentProjectId) {
      return <NoProject />;
    }
    return <DocumentEditor />;
  }

  if (!currentProjectId) {
    return <NoProject />;
  }

  return <ChatView agents={agents} />;
}

function NoProject() {
  return (
    <div className="flex-1 flex items-center justify-center bg-cream-50">
      <div className="text-center">
        <BrandAvatar size={64} rounded="rounded-2xl" className="mx-auto mb-4" />
        <p className="text-sm text-ink-500">Create or select a project</p>
        <p className="text-xs text-ink-300 mt-1">Use the plus button in Projects to begin.</p>
      </div>
    </div>
  );
}
