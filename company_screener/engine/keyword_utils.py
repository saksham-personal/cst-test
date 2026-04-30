"""Keyword parsing helpers shared by the Streamlit app and backend."""

from __future__ import annotations

import re


from .utils import _normalize_text_value


def _clean_fts_keyword(keyword):
    """Sanitize keyword for FTS5 MATCH without collapsing punctuation-separated words."""
    if keyword is None:
        return ''
    clean = re.sub(r'[^\w\s]', ' ', str(keyword))
    return re.sub(r'\s+', ' ', clean).strip()


def _is_exact_keyword(keyword):
    """Quoted keywords use the exact, unstemmed search path."""
    return keyword is not None and '"' in str(keyword)


def _clean_exact_keyword(keyword):
    """Strip quote markers while preserving literal punctuation and word boundaries."""
    if keyword is None:
        return ''
    clean = str(keyword).replace('"', '')
    return re.sub(r'\s+', ' ', clean).strip()


_exact_highlight_pattern_cache: dict[str, 're.Pattern | None'] = {}
_WORD_BOUNDARY_CLASS = r'0-9A-Za-z_'


def _build_exact_text_pattern(keyword):
    """Build a case-insensitive literal regex for quoted exact matching/highlighting."""
    clean = _clean_exact_keyword(keyword)
    if not clean:
        return None

    cache_key = clean.casefold()
    if cache_key in _exact_highlight_pattern_cache:
        return _exact_highlight_pattern_cache[cache_key]

    literal_parts = [re.escape(part) for part in re.split(r'\s+', clean) if part]
    if not literal_parts:
        _exact_highlight_pattern_cache[cache_key] = None
        return None

    literal = r'\s+'.join(literal_parts)
    pattern = re.compile(
        rf'(?<![{_WORD_BOUNDARY_CLASS}]){literal}(?![{_WORD_BOUNDARY_CLASS}])',
        re.IGNORECASE,
    )
    _exact_highlight_pattern_cache[cache_key] = pattern
    return pattern


def _exact_keyword_requires_raw_fallback(keyword):
    """Return True when literal punctuation cannot be preserved by the exact FTS tokenizer."""
    clean = _clean_exact_keyword(keyword)
    if not clean:
        return False
    return bool(re.search(r'[^\w\s&/-]', clean))


def _keyword_has_searchable_text(keyword):
    if _is_exact_keyword(keyword):
        return bool(_clean_exact_keyword(keyword))
    return bool(_normalize_text_value(keyword))


def _build_exact_fts_term(keyword):
    """Build an exact, case-insensitive MATCH term against the unstemmed FTS table."""
    clean = _clean_exact_keyword(keyword)
    if not clean:
        return None
    return f'"{clean}"'


def _build_fts_term(keyword):
    """Build FTS5 query term with prefix matching.

    Single word  -> supply*   (prefix match: supply, supplier, supplies ...)
    Multi-word   -> "air filter"  (exact phrase -- FTS5 doesn't support phrase + prefix)
    """
    clean = _clean_fts_keyword(keyword)
    if not clean:
        return None
    words = clean.split()
    if len(words) > 1:
        # Exact phrase match for multi-word keywords
        return f'"{clean}"'
    # Single word: prefix match so "supply" finds "supplier", "supplies" etc.
    return f'{clean}*'


def _build_keyword_query_spec(keyword):
    """Return the FTS table + term for a keyword."""
    if _is_exact_keyword(keyword):
        return {
            'table': 'exact',
            'term': _build_exact_fts_term(keyword),
            'exact': True,
            'clean_keyword': _clean_exact_keyword(keyword),
        }
    return {
        'table': 'porter',
        'term': _build_fts_term(keyword),
        'exact': False,
        'clean_keyword': _clean_fts_keyword(keyword),
    }

