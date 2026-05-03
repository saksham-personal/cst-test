import { apiClient } from './client';
import type {
  SearchExecuteRequest,
  SearchPageResponse,
  ExpressionValidateRequest,
  ExpressionValidateResponse,
  ExportSearchRequest,
  MetaResponse,
  HealthResponse,
  IndexJobDetail,
  HistoryEntry,
  ScreeningDetail,
  ScreeningSummary,
  ScreeningFieldPatchRequest,
  ScreeningFieldPatchResponse,
  ScreeningIntakeResponse,
  ScreeningStartResponse,
  LLMSuiteChatCompletionResponse,
  LLMSuiteChatCreateRequest,
  LLMSuiteHealthStatus,
  LLMSuiteModelInfo,
  LLMSuiteStructuredChatRequest,
  LLMSuiteStructuredChatResponse,
} from './types';

// ── Search ─────────────────────────────────────────────────────
export async function executeSearch(payload: SearchExecuteRequest): Promise<SearchPageResponse> {
  const { data } = await apiClient.post<SearchPageResponse>('/v1/search/execute', payload);
  return data;
}

export async function getSearchPage(
  searchId: string,
  page: number,
  pageSize: number,
  includeHighlights = false,
  includeMetadata = true,
): Promise<SearchPageResponse> {
  const { data } = await apiClient.get<SearchPageResponse>(`/v1/search/${searchId}/page`, {
    params: { page, page_size: pageSize, include_highlights: includeHighlights, include_metadata: includeMetadata },
  });
  return data;
}

export interface SearchPageOptions {
  page: number;
  pageSize: number;
  includeHighlights?: boolean;
  includeMetadata?: boolean;
  quickFilter?: string;
  filterModel?: Record<string, unknown> | null;
  sortModel?: { colId: string; sort: 'asc' | 'desc' }[] | null;
}

/** POST variant of the page endpoint — used by the interactive grid so that
 * sort/filter/quick-filter state is applied server-side against the full
 * cached result set (not just the currently-loaded block). */
export async function searchPage(
  searchId: string,
  opts: SearchPageOptions,
): Promise<SearchPageResponse> {
  const { data } = await apiClient.post<SearchPageResponse>(
    `/v1/search/${searchId}/page`,
    {
      page: opts.page,
      page_size: opts.pageSize,
      include_highlights: opts.includeHighlights ?? true,
      include_metadata: opts.includeMetadata ?? true,
      quick_filter: opts.quickFilter || null,
      filter_model: opts.filterModel || null,
      sort_model: opts.sortModel || null,
    },
  );
  return data;
}

// ── Keywords ────���──────────────────────────────────────────────
export async function validateExpression(payload: ExpressionValidateRequest): Promise<ExpressionValidateResponse> {
  const { data } = await apiClient.post<ExpressionValidateResponse>('/v1/keywords/validate', payload);
  return data;
}

// ── Exports ──────���─────────────────────────────────────────────
export function getExportSearchUrl(searchId: string, payload: ExportSearchRequest): string {
  const baseURL = (import.meta as any).env.VITE_API_BASE || '/api';
  const params = new URLSearchParams({
    format: payload.format,
    layout: payload.layout || 'standard',
    include_highlights: String(payload.include_highlights ?? false),
    include_metadata: String(payload.include_metadata ?? true),
    highlight_limit: String(payload.highlight_limit ?? 50),
  });
  return `${baseURL}/v1/exports/search/${searchId}?${params.toString()}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Meta ────��──────────────────────────────────────────────────
export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/v1/meta/health');
  return data;
}

export async function getMeta(): Promise<MetaResponse> {
  const { data } = await apiClient.get<MetaResponse>('/v1/meta');
  return data;
}

// ── Lists ──────────────────────────────────────────────────────
export interface ListSummary {
  name: string;
  count: number;
  screening_id?: string | null;
  screen_name?: string | null;
  created_at?: string;
  updated_at: string;
}

export interface ListCompanyEntry {
  company: string;
  primary_key_value?: string | null;
  source_keywords?: string[];
  added_at?: string;
  crescendo_id?: string | null;
}

export interface ListDetail {
  name: string;
  created_at: string;
  updated_at: string;
  screening_id?: string | null;
  screen_name?: string | null;
  count: number;
  companies: ListCompanyEntry[];
}

export interface ListCompanyDetail extends ListCompanyEntry {
  metadata: Record<string, any>;
}

export interface ListCollectionResponse {
  count: number;
  lists: ListSummary[];
}

export async function getLists(screeningId?: string | null): Promise<ListCollectionResponse> {
  const { data } = await apiClient.get<ListCollectionResponse>('/v1/lists', {
    params: screeningId ? { screening_id: screeningId } : undefined,
  });
  return data;
}

export async function createList(
  name: string,
  screeningId?: string | null,
  screenName?: string | null,
): Promise<{ item: ListDetail }> {
  const { data } = await apiClient.post('/v1/lists', {
    name,
    screening_id: screeningId ?? null,
    screen_name: screenName ?? null,
  });
  return data;
}

export async function getListDetail(name: string): Promise<ListDetail> {
  const { data } = await apiClient.get<ListDetail>(`/v1/lists/${encodeURIComponent(name)}`);
  return data;
}

export async function getListCompanyDetail(listName: string, companyKey: string): Promise<ListCompanyDetail> {
  const { data } = await apiClient.get<ListCompanyDetail>(
    `/v1/lists/${encodeURIComponent(listName)}/companies/${encodeURIComponent(companyKey)}`,
  );
  return data;
}

export interface ListCompanyInput {
  company: string;
  /** Crescendo ID — primary key for list membership and dedup. */
  primary_key_value?: string;
  /** Explicit Crescendo ID. When omitted, the backend falls back to primary_key_value. */
  crescendo_id?: string;
  source_keywords?: string[];
}

export async function addCompaniesToList(listName: string, companies: ListCompanyInput[]) {
  const { data } = await apiClient.post(`/v1/lists/${encodeURIComponent(listName)}/companies`, { companies });
  return data;
}

/** Server-side "select all + add to list": adds every row of a cached search
 *  to `listName` by searchId, so we don't have to ship 100k rows back to the
 *  backend one at a time. */
export async function addCompaniesFromSearchToList(
  listName: string,
  searchId: string,
  sourceKeywords: string[] = [],
) {
  const { data } = await apiClient.post(
    `/v1/lists/${encodeURIComponent(listName)}/companies-from-search`,
    { search_id: searchId, source_keywords: sourceKeywords },
    // Adding 170k rows server-side can take a while; don't let an axios default
    // timeout kill it (we have none set globally, but be explicit here).
    { timeout: 0 },
  );
  return data;
}

export async function removeCompaniesFromList(listName: string, companyNames: string[]) {
  const { data } = await apiClient.delete(`/v1/lists/${encodeURIComponent(listName)}/companies`, {
    data: { company_names: companyNames },
  });
  return data;
}

export async function deleteList(name: string) {
  const { data } = await apiClient.delete(`/v1/lists/${encodeURIComponent(name)}`);
  return data;
}

// ── LLM Screening ───────────────────────────────────────────────
export interface LLMScreeningPromptsResponse {
  prompts: Record<string, string>;
  source_screening_id?: string | null;
  criteria_used: string;
}

export async function generateLLMScreeningPrompts(
  payload: { screening_id?: string | null; screen_id?: string | null; rationale_enabled: boolean },
): Promise<LLMScreeningPromptsResponse> {
  const { data } = await apiClient.post<LLMScreeningPromptsResponse>('/v1/llm-screening/generate-prompts', payload, {
    timeout: 0,
  });
  return data;
}

export function getIndependentLLMOutputUrl(useCaseName: string): string {
  const baseURL = (import.meta as any).env.VITE_API_BASE || '/api';
  const params = new URLSearchParams({ use_case_name: useCaseName });
  return `${baseURL}/v1/llm-screening/independent-output-stub?${params.toString()}`;
}

// ── History ────────��───────────────────────────────────────────
// Backend actually returns { max_entries, count, entries[] }. We unwrap to the
// entries array here since that's what every consumer wants.
export async function getHistory(): Promise<HistoryEntry[]> {
  const { data } = await apiClient.get('/v1/history');
  if (Array.isArray(data)) return data as HistoryEntry[];
  if (data && Array.isArray(data.entries)) return data.entries as HistoryEntry[];
  return [];
}

export async function clearHistory() {
  const { data } = await apiClient.delete('/v1/history');
  return data;
}

// ── Index Jobs ─────────────────────────────────────────────────
export async function getIndexJobs(): Promise<IndexJobDetail[]> {
  const { data } = await apiClient.get('/v1/index-jobs');
  if (Array.isArray(data)) return data as IndexJobDetail[];
  if (data && Array.isArray((data as any).jobs)) return (data as any).jobs as IndexJobDetail[];
  return [];
}

export async function createIndexJob(payload: { source_type: 'path'; xlsx_path: string; output_bundle_name: string; activate_on_success: boolean }) {
  const { data } = await apiClient.post('/v1/index-jobs', payload);
  return data;
}

export async function uploadIndexJob(
  file: File,
  options: { output_bundle_name: string; activate_on_success: boolean },
  onUploadProgress?: (pct: number) => void,
) {
  const form = new FormData();
  form.append('file', file);
  form.append('output_bundle_name', options.output_bundle_name);
  form.append('activate_on_success', options.activate_on_success ? 'true' : 'false');
  const { data } = await apiClient.post('/v1/index-jobs/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onUploadProgress
      ? (e) => {
          if (!e.total) return;
          onUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  return data;
}

export async function getIndexJob(jobId: string): Promise<IndexJobDetail> {
  const { data } = await apiClient.get(`/v1/index-jobs/${jobId}`);
  return data;
}

export async function activateIndexJob(jobId: string): Promise<IndexJobDetail> {
  const { data } = await apiClient.post<IndexJobDetail>(`/v1/index-jobs/${jobId}/activate`);
  return data;
}

export async function cancelIndexJob(jobId: string): Promise<IndexJobDetail> {
  const { data } = await apiClient.post<IndexJobDetail>(`/v1/index-jobs/${jobId}/cancel`);
  return data;
}

// ── Screenings ─────────────────────────────────────────────────
export async function uploadScreeningIntake(
  file: File,
  onUploadProgress?: (pct: number) => void,
): Promise<ScreeningIntakeResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<ScreeningIntakeResponse>('/v1/screenings/intake', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onUploadProgress
      ? (e) => {
          if (!e.total) return;
          onUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  return data;
}

export async function createDuplicateScreening(documentId: string): Promise<ScreeningDetail> {
  const { data } = await apiClient.post<ScreeningDetail>('/v1/screenings/intake/duplicate-create', {
    document_id: documentId,
  });
  return data;
}

export async function getScreeningDetail(screeningId: string): Promise<ScreeningDetail> {
  const { data } = await apiClient.get<ScreeningDetail>(`/v1/screenings/${encodeURIComponent(screeningId)}`);
  return data;
}

export async function getActiveScreening(): Promise<ScreeningDetail> {
  const { data } = await apiClient.get<ScreeningDetail>('/v1/screenings/active', {
    headers: { 'X-Skip-Error-Toast': '1' },
  });
  return data;
}

export async function listScreenings(): Promise<ScreeningSummary[]> {
  const { data } = await apiClient.get<ScreeningSummary[]>('/v1/screenings', {
    headers: { 'X-Skip-Error-Toast': '1' },
  });
  return data;
}

export async function patchScreeningFields(
  screeningId: string,
  payload: ScreeningFieldPatchRequest,
): Promise<ScreeningFieldPatchResponse> {
  const { data } = await apiClient.patch<ScreeningFieldPatchResponse>(
    `/v1/screenings/${encodeURIComponent(screeningId)}/fields`,
    payload,
  );
  return data;
}

export function getScreeningPdfUrl(screeningId: string): string {
  const baseURL = (import.meta as any).env.VITE_API_BASE || '/api';
  return `${baseURL}/v1/screenings/${encodeURIComponent(screeningId)}/pdf`;
}

export async function startScreening(screeningId: string): Promise<ScreeningStartResponse> {
  const { data } = await apiClient.post<ScreeningStartResponse>(
    `/v1/screenings/${encodeURIComponent(screeningId)}/start`,
  );
  return data;
}

// ── LLMSuite Stub Proxy ───────────────────────────────────────
export async function getLLMSuiteHealth(): Promise<LLMSuiteHealthStatus> {
  const { data } = await apiClient.get<LLMSuiteHealthStatus>('/v1/llmsuite/health');
  return data;
}

export async function listLLMSuiteModels(): Promise<LLMSuiteModelInfo[]> {
  const { data } = await apiClient.get<LLMSuiteModelInfo[]>('/v1/llmsuite/models');
  return data;
}

export async function createLLMSuiteChatCompletion(
  payload: LLMSuiteChatCreateRequest,
): Promise<LLMSuiteChatCompletionResponse> {
  const { data } = await apiClient.post<LLMSuiteChatCompletionResponse>('/v1/llmsuite/chat/completions', payload);
  return data;
}

export async function createLLMSuiteStructuredCompletion(
  payload: LLMSuiteStructuredChatRequest,
): Promise<LLMSuiteStructuredChatResponse> {
  const { data } = await apiClient.post<LLMSuiteStructuredChatResponse>('/v1/llmsuite/structured', payload);
  return data;
}
