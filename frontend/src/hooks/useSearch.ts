import { useMutation } from '@tanstack/react-query';
import { executeSearch } from '../api/endpoints';
import type { SearchExecuteRequest, SearchPageResponse } from '../api/types';
import { useSearchStore } from '../stores/searchStore';

export function useSearch() {
  return useMutation({
    mutationFn: async (payload: SearchExecuteRequest): Promise<SearchPageResponse> => {
      return executeSearch(payload);
    },
    onSuccess: () => {
      useSearchStore.getState().markClean();
    },
  });
}

/** Build a SearchExecuteRequest from the current searchStore state. */
export function buildSearchPayload(
  page = 1,
  pageSize = 100,
): SearchExecuteRequest {
  const { keywords, queryExpression } = useSearchStore.getState();

  return {
    keywords: keywords
      .filter((kw) => kw.keyword.trim() !== '')
      .map((kw, idx) => ({
        serial: kw.serial ?? idx + 1,
        keyword: kw.keyword,
        mode: kw.mode,
        action: kw.action,
        weight: kw.weight,
      })),
    query_expression: queryExpression,
    page,
    page_size: pageSize,
    include_highlights: true,
    include_metadata: true,
  };
}
