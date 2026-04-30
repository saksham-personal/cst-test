"""Shared engine utilities for Company Screener."""

from .runtime import (
    SearchEngine,
    get_db_connection,
    get_db_connection_light,
    load_config,
    load_metadata,
    load_scoring_config,
    merge_results_with_metadata,
)
from .utils import _normalize_text_value, _normalize_url, _safe_threadpool_map, _unique_preserve_order
from .keyword_utils import (
    _build_exact_fts_term,
    _build_exact_text_pattern,
    _build_fts_term,
    _build_keyword_query_spec,
    _clean_exact_keyword,
    _clean_fts_keyword,
    _exact_keyword_requires_raw_fallback,
    _is_exact_keyword,
    _keyword_has_searchable_text,
)
from .highlighter import (
    _build_highlight_pattern,
    _build_keyword_highlight_pattern,
    _common_prefix,
    _extract_snippet,
    _highlight_text_fast,
    _keyword_match_prefix,
    _porter_stem,
)
from .parser import (
    AndNode,
    NotNode,
    NumberNode,
    OrNode,
    ParseError,
    build_keyword_serial_map,
    collect_positive_numbers,
    collect_serial_numbers,
    evaluate_expression,
    humanize_expression,
    parse_expression,
    tokenize,
    validate_expression,
)
