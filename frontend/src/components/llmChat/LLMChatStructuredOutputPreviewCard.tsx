import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * LLMChatStructuredOutputPreviewCard
 *
 * This component is intentionally more future-facing than the current chat flow.
 * The final JSON output contract is still undecided, but product asked for the
 * UI building block to exist now with clear usage documentation.
 *
 * How to use later:
 * - pass the parsed JSON returned from `/api/v1/llmsuite/structured`
 * - render this beside the transcript when analysts need to inspect or approve
 *   structured criteria, generated keyword plans, or downstream automation data
 */
interface LLMChatStructuredOutputPreviewCardProps {
  title?: string;
  outputJson: Record<string, any> | null;
}

export function LLMChatStructuredOutputPreviewCard({
  title = 'Structured Output Preview',
  outputJson,
}: LLMChatStructuredOutputPreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Reserved for the future analyst-reviewed JSON output returned by the structured LLM workflow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[320px] overflow-auto rounded-lg border border-border bg-slate-950 p-3 text-xs text-slate-100">
          {outputJson ? JSON.stringify(outputJson, null, 2) : '{\n  "status": "awaiting_schema_definition"\n}'}
        </pre>
      </CardContent>
    </Card>
  );
}

