import { FormEvent } from 'react';
import { SendHorizonal } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * LLMChatMessageComposer
 *
 * Drop this at the bottom of any chat-oriented route. The current implementation
 * keeps input state outside the component so parent pages can decide when to
 * append messages, persist drafts, or trigger auto-send behaviors.
 */
interface LLMChatMessageComposerProps {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function LLMChatMessageComposer({
  value,
  disabled = false,
  placeholder = 'Ask the screening assistant something…',
  onChange,
  onSubmit,
}: LLMChatMessageComposerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="border-t bg-white px-6 py-4">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl items-end gap-3">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[84px] flex-1 resize-none rounded-2xl border border-border bg-surface-1 px-4 py-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button type="submit" size="lg" disabled={disabled || !value.trim()}>
          <SendHorizonal className="mr-2 size-4" />
          Send
        </Button>
      </form>
    </div>
  );
}
