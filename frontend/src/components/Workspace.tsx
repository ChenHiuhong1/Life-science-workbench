import { useStore } from '@/store';
import { BrandGlyph } from './BrandMark';
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-clay-400 to-clay-600 text-white grid place-items-center mx-auto mb-4 shadow-subtle">
          <BrandGlyph size={30} strokeWidth={2} />
        </div>
        <p className="text-sm text-ink-500">Create or select a project</p>
        <p className="text-xs text-ink-300 mt-1">Use the plus button in Projects to begin.</p>
      </div>
    </div>
  );
}
