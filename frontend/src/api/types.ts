/** Mirrors backend app.schemas.search.KeywordInput */
export interface KeywordInput {
  serial: number;
  keyword: string;
  mode: 'lexical' | 'semantic';
  action: 'include' | 'exclude';
  weight: number;
}

/** Mirrors backend app.schemas.search.MatchSnippet */
export interface MatchSnippet {
  source: string;
  keyword: string;
  match_type: string;
  sentence: string;
  context_before: string;
  context_after: string;
}

/** Mirrors backend app.schemas.search.SearchResultRow */
export interface SearchResultRow {
  primary_key_value: string;
  company_name: string | null;
  rowid: number | null;
  relevance: number;
  completeness: number;
  composite_score: number;
  keywords_matched: number;
  n_keywords: number;
  matched_keywords: string[];
  matched_serials: number[];
  matches: MatchSnippet[];
  metadata: Record<string, any>;
}

/** Mirrors backend app.schemas.search.SearchPageResponse */
export interface SearchPageResponse {
  search_id: string;
  search_mode: 'default' | 'expression';
  query_expression: string;
  parsed_query: string;
  total_count: number;
  page: number;
  page_size: number;
  page_count: number;
  results: SearchResultRow[];
  keyword_hit_counts: Record<string, number>;
  cache_hit: boolean | null;
  timings_ms: Record<string, number>;
}

/** Mirrors backend app.schemas.search.SearchExecuteRequest */
export interface SearchExecuteRequest {
  keywords: KeywordInput[];
  query_expression: string;
  page: number;
  page_size: number;
  include_highlights: boolean;
  include_metadata: boolean;
}

/** Mirrors backend app.schemas.keywords.ExpressionValidateRequest */
export interface ExpressionValidateRequest {
  query_expression: string;
  keywords: KeywordInput[];
}

/** Mirrors backend app.schemas.keywords.ExpressionValidateResponse */
export interface ExpressionValidateResponse {
  valid: boolean;
  parsed_query: string;
  errors: string[];
  warnings: string[];
  timings_ms: Record<string, number>;
}

/** Mirrors backend app.schemas.exports.ExportSearchRequest */
export type ExportFormat = 'csv' | 'xlsx';
export type ExportLayout = 'standard' | 'pitchbook' | 'llm';

export interface ExportSearchRequest {
  format: ExportFormat;
  layout?: ExportLayout;
  include_highlights: boolean;
  include_metadata: boolean;
  highlight_limit: number;
}

/** Mirrors backend app.schemas.meta.HealthResponse */
export interface HealthResponse {
  status: string;
  index_loaded: boolean;
  app_name: string;
  environment: string;
}

/** Mirrors backend app.schemas.meta.MetaResponse */
export interface MetaResponse {
  app_name: string;
  api_version: string;
  environment: string;
  index_dir: string;
  index_loaded: boolean;
  primary_key: string;
  company_name_col: string;
}

/** Index job detail from backend */
export interface IndexJobDetail {
  job_id: string;
  source_type: 'path' | 'upload';
  state: 'queued' | 'running' | 'completed' | 'failed' | 'activating' | 'activated' | 'cancelled';
  stage: string;
  percent: number;
  message: string;
  current?: number | null;
  total?: number | null;
  eta_seconds?: number | null;
  source_path: string;
  source_filename?: string | null;
  output_bundle_name?: string;
  output_dir: string;
  activate_on_success?: boolean;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  activated_at?: string | null;
  pid?: number | null;
  exit_code?: number | null;
  error?: string | null;
  bundle_ready?: boolean;
  timings_ms: Record<string, number>;
  details: Record<string, any>;
}

export interface IndexJobCollectionResponse {
  count: number;
  jobs: IndexJobDetail[];
}

/** History entry from backend */
export interface HistoryEntry {
  timestamp: string;
  keywords: KeywordInput[];
  query_expression: string;
  parsed_query: string;
  search_mode: string;
  result_count: number;
  page?: number;
  page_size?: number;
  include_highlights?: boolean;
  include_metadata?: boolean;
  keyword_hit_counts: Record<string, number>;
  timings_ms?: Record<string, number>;
}

/** History list response (what the backend actually returns). */
export interface HistoryResponse {
  max_entries: number;
  count: number;
  entries: HistoryEntry[];
}

export interface ScreeningDocumentSummary {
  id: string;
  original_filename: string;
  pdf_sha256: string;
  file_size_bytes: number;
  mime_type: string | null;
}

export interface ScreeningDuplicateItem {
  id: string;
  status: 'draft' | 'screening_started';
  screen_name: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScreeningDetail {
  id: string;
  document_id: string;
  status: 'draft' | 'screening_started';
  screen_name: string | null;
  website: string | null;
  inbound_date: string | null;
  target_date: string | null;
  targets_found: number | null;
  output_file: string | null;
  extracted_fields: Record<string, string>;
  edited_fields: Record<string, string>;
  original_filename: string;
  pdf_sha256: string;
  created_at: string;
  updated_at: string;
}

export interface ScreeningIntakeResponse {
  status: 'created' | 'duplicate';
  document_id: string;
  document: ScreeningDocumentSummary;
  screening: ScreeningDetail | null;
  existing_screenings: ScreeningDuplicateItem[];
  default_reuse_screening_id: string | null;
}

export interface ScreeningFieldPatchRequest {
  screen_name?: string | null;
  website?: string | null;
  edited_fields?: Record<string, string | null>;
}

export interface ScreeningFieldPatchResponse {
  screening_id: string;
  status: 'draft' | 'screening_started';
  screen_name: string | null;
  website: string | null;
  edited_fields: Record<string, string>;
  updated_at: string;
}

export interface ScreeningStartResponse {
  screening_id: string;
  status: 'draft' | 'screening_started';
  message: string;
  payload: Record<string, any>;
}

export type LLMSuiteMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type LLMSuiteWarningCode =
  | 'auth_recovered'
  | 'rate_limited'
  | 'blank_response_retry'
  | 'timeout_retry'
  | 'json_parse_failed'
  | 'json_repair_attempted'
  | 'schema_validation_failed'
  | 'partial_structured_output'
  | 'provider_changed'
  | 'stub_response';

export interface LLMSuiteClientWarning {
  code: LLMSuiteWarningCode;
  message: string;
  details: Record<string, any>;
}

export interface LLMSuiteIdentity {
  tenantId: string;
  groupId: string;
  userId: string | null;
  raw: Record<string, any>;
}

export interface LLMSuiteModelInfo {
  modelId: string;
  displayName: string | null;
  provider: string | null;
  supportsThinking: boolean | null;
  supportsTools: boolean | null;
  raw: Record<string, any>;
}

export interface LLMSuiteModelConfig {
  model: string;
  temperature?: number | null;
  maxTokens?: number | null;
  thinking?: boolean | null;
  topP?: number | null;
  extra?: Record<string, any>;
}

export interface LLMSuiteChatMessage {
  role: LLMSuiteMessageRole;
  content: string;
  name?: string | null;
  metadata?: Record<string, any>;
}

export interface LLMSuiteUsageInfo {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  raw: Record<string, any>;
}

export interface LLMSuiteChatCreateRequest {
  deploymentId: string;
  conversationId: string;
  messages: LLMSuiteChatMessage[];
  modelConfig?: LLMSuiteModelConfig | null;
  toolsEnabled?: boolean | null;
  sourcesEnabled?: boolean | null;
  metadata?: Record<string, any>;
  retryOnBlankMessage?: boolean;
  retryOnTimeout?: boolean;
  retryOnAuthError?: boolean;
}

export interface LLMSuiteChatCompletionResponse {
  deploymentId: string;
  conversationId: string;
  message: LLMSuiteChatMessage;
  finishReason?: string | null;
  usage?: LLMSuiteUsageInfo | null;
  latencyMs?: number | null;
  warnings: LLMSuiteClientWarning[];
  raw: Record<string, any>;
}

export interface LLMSuiteStructuredChatRequest extends LLMSuiteChatCreateRequest {
  responseSchema: Record<string, any>;
  strict?: boolean;
  maxRepairAttempts?: number;
  mode?: 'fenced_json' | 'json_only' | 'repair_retry';
  injectSchemaInstruction?: boolean;
}

export interface LLMSuiteStructuredChatResponse {
  deploymentId: string;
  conversationId: string;
  parsed: Record<string, any>;
  rawText: string;
  validationPassed: boolean;
  repairAttempts: number;
  warnings: LLMSuiteClientWarning[];
  usage?: LLMSuiteUsageInfo | null;
  latencyMs?: number | null;
  raw: Record<string, any>;
}

export interface LLMSuiteHealthStatus {
  browserRunning: boolean;
  pageLoaded: boolean;
  authenticated: boolean;
  identity: LLMSuiteIdentity | null;
  modelCount: number | null;
  lastError: string | null;
  currentQueueDepth: number | null;
  secondsUntilNextRequest: number | null;
}
