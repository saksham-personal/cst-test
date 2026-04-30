import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * LLMChatScreeningContextInspector
 *
 * Use this component when a chat session is seeded by a screening draft or a
 * future analyst workflow step. It intentionally renders raw JSON so analysts
 * and developers can verify exactly what context the chat layer received.
 *
 * Future integration note:
 * - replace the raw JSON block with a structured field list if product wants a
 *   friendlier analyst-facing view
 * - keep the raw view available in a debug accordion for auditability
 */
interface LLMChatScreeningContextInspectorProps {
  screeningId?: string | null;
  sourcePdfName?: string | null;
  payload: Record<string, any> | null;
}

export function LLMChatScreeningContextInspector({
  screeningId,
  sourcePdfName,
  payload,
}: LLMChatScreeningContextInspectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linked Screening Context</CardTitle>
        <CardDescription>
          This panel shows the screening payload that will travel with the stub LLM requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
          <div>Screening ID: <span className="font-medium text-text-primary">{screeningId || 'None attached'}</span></div>
          <div className="mt-1">Source PDF: <span className="font-medium text-text-primary">{sourcePdfName || 'Unknown'}</span></div>
        </div>

        <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-slate-950 p-3 text-xs text-slate-100">
          {payload ? JSON.stringify(payload, null, 2) : 'No screening payload has been attached yet.'}
        </pre>
      </CardContent>
    </Card>
  );
}

