import type { ReactNode } from 'react';
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
    <div className="flex-1 overflow-auto bg-cream-50/70">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-8 py-10">
        <div className="mb-6 flex items-center gap-4">
          <BrandAvatar size={58} rounded="rounded-xl" className="shadow-subtle" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink-900">Start a research workspace</p>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">
              Select a project from the left rail or create one to bind chat, code, documents, and artifacts to a local folder.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <EntryMetric icon={<ShieldCheck size={17} />} label="Trust boundary" value="Local-first" />
          <EntryMetric icon={<Boxes size={17} />} label="Agent system" value={`${modules} modules`} />
          <EntryMetric icon={<FolderPlus size={17} />} label="Workspace state" value="No project selected" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-cream-300 bg-white/85 px-4 py-3 shadow-subtle">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-800">Configuration stays available before project setup.</p>
            <p className="mt-0.5 text-xs text-ink-500">Model, sandbox, language, and app folders can be adjusted at any time.</p>
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

function EntryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cream-300 bg-white/90 p-4 shadow-subtle">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[8px] bg-clay-50 text-clay-600">
        {icon}
      </div>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}
