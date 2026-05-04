import { useState } from 'react';
import { useSearchStore } from '../../stores/searchStore';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, Loader2 } from 'lucide-react';
import { validateExpression } from '../../api/endpoints';
import type { KeywordInput } from '../../api/types';
import { extractApiErrorMessage } from '../../api/client';

interface QueryBoxProps {
  onSearch: () => void;
  isLoading?: boolean;
}

export function QueryBox({ onSearch, isLoading }: QueryBoxProps) {
  const { queryExpression, setQueryExpression, keywords } = useSearchStore();
  const [parsedDisplay, setParsedDisplay] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleParse = async () => {
    try {
      if (!queryExpression.trim()) {
        setParsedDisplay(null);
        setErrorMsg(null);
        return;
      }

      // Build keyword inputs with serial numbers for the backend
      const keywordInputs: KeywordInput[] = keywords
        .filter((kw) => kw.keyword.trim() !== '')
        .map((kw, idx) => ({
          serial: kw.serial ?? idx + 1,
          keyword: kw.keyword,
          mode: kw.mode,
          action: kw.action,
          weight: kw.weight,
        }));

      const res = await validateExpression({
        query_expression: queryExpression,
        keywords: keywordInputs,
      });

      if (res.valid) {
        setParsedDisplay(res.parsed_query);
        setErrorMsg(null);
      } else {
        setErrorMsg(res.errors.join('; ') || 'Invalid boolean expression');
        setParsedDisplay(null);
      }
    } catch (e: any) {
      setErrorMsg(extractApiErrorMessage(e, 'Parse failed'));
    }
  };

  return (
    <div className="flex flex-col space-y-4 p-4 bg-surface-0 rounded-lg shadow-sm border border-border">
      <div className="flex items-center gap-3">
        <Input
          className="font-mono flex-1 bg-surface-1"
          data-shortcut-target="query-input"
          placeholder="e.g. (1 AND 2) OR 3"
          value={queryExpression}
          onChange={(e) => setQueryExpression(e.target.value)}
        />
        <Button variant="outline" className="border-brand/20 text-brand hover:bg-brand/5" onClick={handleParse}>
          Parse
        </Button>
        <Button
          onClick={onSearch}
          disabled={isLoading}
          data-shortcut-target="execute-search"
          className="bg-brand text-brand-fg hover:bg-brand-hover"
        >
          {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
          Search
        </Button>
      </div>

      {errorMsg && (
        <div className="text-sm text-danger font-medium">{errorMsg}</div>
      )}

      {parsedDisplay && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-surface-1 rounded-md min-h-12 border border-border">
          <span className="text-xs font-semibold text-text-tertiary mr-2">Parsed:</span>
          <span className="font-mono text-sm text-text-secondary">{parsedDisplay}</span>
        </div>
      )}
    </div>
  );
}
