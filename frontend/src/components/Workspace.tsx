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

  // Keep every agent's view mounted and toggle visibility with CSS instead of
  // unmounting/mounting on each agent switch. The previous `if (agent === x)
  // return <X/>` chain tore down a view (and its in-flight stream reader) the
  // moment the user switched tabs; now a background stream keeps running in its
  // hidden view and resumes instantly when the user comes back, with no
  // remount cost competing with whatever the user types in the new agent.
  const hasProject = !!currentProjectId;
  const showHpc = agent === 'hpc';
  const showLiterature = agent === 'literature';
  // chat-family agents (chat / brainstorm / bio / protocol / reviewer / module)
  // share one ChatView surface driven by `agent`.
  const isChatFamily = !showHpc && !showLiterature && agent !== 'document';
  const showChat = isChatFamily && hasProject;
  const showDocument = agent === 'document' && hasProject;

  return (
    <>
      <div className={showHpc ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <HpcView />
      </div>
      <div className={showLiterature ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <LiteratureView />
      </div>
      <div className={showDocument ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <DocumentEditor />
      </div>
      <div className={showChat ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <ChatView agents={agents} />
      </div>
      {!showHpc && !showLiterature && !showChat && !showDocument && <NoProject />}
    </>
  );
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
