import { useStore } from '@/store';
import { Boxes, FolderPlus, Settings, ShieldCheck } from 'lucide-react';
import { BrandAvatar } from './BrandMark';
import { ChatView } from './chat/ChatView';
import { HpcView } from './hpc/HpcView';
import { DocumentEditor } from './document/DocumentEditor';
import type { AgentInfo } from '@/types';

export function Workspace({ agents, onOpenSettings }: { agents: AgentInfo[]; onOpenSettings: () => void }) {
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
  // chat-family agents (chat / brainstorm / bio / protocol / reviewer / module)
  // share one ChatView surface driven by `agent`.
  const isChatFamily = !showHpc && agent !== 'document';
  const showChat = isChatFamily && hasProject;
  const showDocument = agent === 'document' && hasProject;

  return (
    <>
      <div className={showHpc ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <HpcView />
      </div>
      <div className={showDocument ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <DocumentEditor />
      </div>
      <div className={showChat ? 'flex-1 flex overflow-hidden' : 'hidden'}>
        <ChatView agents={agents} />
      </div>
      {!showHpc && !showChat && !showDocument && (
        <NoProject agentCount={agents.length} onOpenSettings={onOpenSettings} />
      )}
    </>
  );
}

function NoProject({ agentCount, onOpenSettings }: { agentCount: number; onOpenSettings: () => void }) {
  const modules = agentCount || 8;

  return (
    <div className="flex-1 overflow-auto bg-cream-50">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-8 py-12">
        <div className="mb-8 flex items-center gap-4">
          <BrandAvatar size={56} rounded="rounded-xl" className="shadow-subtle" />
          <div className="min-w-0">
            <h2 className="font-serif text-2xl tracking-[-0.02em] text-ink-900">Start a research workspace</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
              Select a project from the left rail or create one to bind chat, code, documents, and artifacts to a local folder.
            </p>
          </div>
        </div>

        {/* Single status line instead of a three-card metric grid (the
            hero-metric template cliché). Local-first · N modules · awaiting. */}
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-clay-500" /> Local-first
          </span>
          <span className="text-cream-300">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Boxes size={15} className="text-clay-500" /> {modules} agent modules
          </span>
          <span className="text-cream-300">·</span>
          <span className="inline-flex items-center gap-1.5">
            <FolderPlus size={15} className="text-clay-500" /> No project selected
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-cream-100 px-4 py-3.5 shadow-card">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-800">Configuration stays available before project setup.</p>
            <p className="mt-0.5 text-xs text-ink-600">Model, sandbox, language, and app folders can be adjusted at any time.</p>
          </div>
          <button className="btn-outline shrink-0 px-3 text-xs" onClick={onOpenSettings}>
            <Settings size={14} strokeWidth={1.75} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
