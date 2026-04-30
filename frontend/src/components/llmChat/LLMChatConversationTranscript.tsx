import { Bot, Sparkles, User2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export interface LLMChatTranscriptMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  caption?: string;
}

/**
 * LLMChatConversationTranscript
 *
 * Render this inside a scrollable chat route body. Keep the data source simple:
 * a flat ordered array of messages is enough for the current stub workflow.
 *
 * Future integration note:
 * - Tool messages can be introduced later by extending `LLMChatTranscriptMessage`
 * - Rich markdown rendering can be added here without changing the page shell
 */
interface LLMChatConversationTranscriptProps {
  messages: LLMChatTranscriptMessage[];
  isSending: boolean;
}

const ROLE_STYLES: Record<LLMChatTranscriptMessage['role'], string> = {
  system: 'border-brand/30 bg-brand/5 text-text-primary',
  user: 'border-accent-teal/20 bg-white text-text-primary',
  assistant: 'border-accent-purple/20 bg-surface-1 text-text-primary',
};

export function LLMChatConversationTranscript({ messages, isSending }: LLMChatConversationTranscriptProps) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {messages.map((message) => {
          const icon = message.role === 'assistant'
            ? <Bot className="size-4 text-accent-purple" />
            : message.role === 'system'
              ? <Sparkles className="size-4 text-brand" />
              : <User2 className="size-4 text-accent-teal" />;

          return (
            <Card key={message.id} className={ROLE_STYLES[message.role]}>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold capitalize">
                  {icon}
                  {message.role}
                </CardTitle>
                {message.caption && <span className="text-xs text-text-tertiary">{message.caption}</span>}
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</div>
              </CardContent>
            </Card>
          );
        })}

        {isSending && (
          <Card className="border-brand/20 bg-brand/5 text-text-primary">
            <CardContent className="flex items-center gap-2 py-4 text-sm">
              <Sparkles className="size-4 animate-pulse text-brand" />
              Sending request to the LLMSuite stub proxy…
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

