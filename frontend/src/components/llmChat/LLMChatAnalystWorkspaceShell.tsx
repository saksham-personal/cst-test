import { ReactNode } from 'react';

/**
 * LLMChatAnalystWorkspaceShell
 *
 * Use this shell when a future analyst-facing LLM route needs the same visual
 * split between a main conversation column and a secondary context column.
 *
 * Suggested future uses:
 * - screening payload review + chat transcript
 * - structured JSON preview + debugging warnings
 * - deployment or model configuration side panels
 */
interface LLMChatAnalystWorkspaceShellProps {
  header: ReactNode;
  mainContent: ReactNode;
  secondaryContent: ReactNode;
}

export function LLMChatAnalystWorkspaceShell({
  header,
  mainContent,
  secondaryContent,
}: LLMChatAnalystWorkspaceShellProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1">
      {header}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r bg-surface-0">
          {mainContent}
        </div>
        <aside className="hidden w-[360px] flex-shrink-0 overflow-auto bg-surface-1 xl:block">
          <div className="space-y-4 p-4">
            {secondaryContent}
          </div>
        </aside>
      </div>
    </div>
  );
}

