"""Highlighting utilities shared by the Streamlit app and backend."""

from __future__ import annotations

import re

from .keyword_utils import (
    _build_exact_text_pattern,
    _clean_exact_keyword,
    _clean_fts_keyword,
    _is_exact_keyword,
)


_stem_cache: dict[str, str] = {}


def _porter_stem(word: str) -> str:
    """Porter stemmer -- matches FTS5 porter tokenizer behavior."""
    if word in _stem_cache:
        return _stem_cache[word]
    original = word
    w = word.lower()
    if len(w) <= 2:
        _stem_cache[original] = w
        return w

    def _is_consonant(s, i):
        c = s[i]
        if c in 'aeiou':
            return False
        if c == 'y':
            return i == 0 or not _is_consonant(s, i - 1)
        return True

    def _measure(s):
        """Count VC sequences (Porter's m)."""
        n = len(s)
        if n == 0:
            return 0
        i = 0
        while i < n and _is_consonant(s, i):
            i += 1
        if i >= n:
            return 0
        m = 0
        while True:
            while i < n and not _is_consonant(s, i):
                i += 1
            if i >= n:
                break
            while i < n and _is_consonant(s, i):
                i += 1
            m += 1
        return m

    def _has_vowel(s):
        return any(not _is_consonant(s, i) for i in range(len(s)))

    def _ends_double_c(s):
        return len(s) >= 2 and s[-1] == s[-2] and _is_consonant(s, len(s) - 1)

    def _cvc(s):
        n = len(s)
        if n < 3:
            return False
        return (_is_consonant(s, n - 1) and not _is_consonant(s, n - 2)
                and _is_consonant(s, n - 3) and s[-1] not in 'wxy')

    # Step 1a
    if w.endswith('sses'):
        w = w[:-2]
    elif w.endswith('ies'):
        w = w[:-2]
    elif not w.endswith('ss') and w.endswith('s'):
        w = w[:-1]

    # Step 1b
    step1b_extra = False
    if w.endswith('eed'):
        stem = w[:-3]
        if _measure(stem) > 0:
            w = w[:-1]
    elif w.endswith('ed'):
        stem = w[:-2]
        if _has_vowel(stem):
            w = stem
            step1b_extra = True
    elif w.endswith('ing'):
        stem = w[:-3]
        if _has_vowel(stem):
            w = stem
            step1b_extra = True

    if step1b_extra:
        if w.endswith('at') or w.endswith('bl') or w.endswith('iz'):
            w += 'e'
        elif _ends_double_c(w) and w[-1] not in 'lsz':
            w = w[:-1]
        elif _measure(w) == 1 and _cvc(w):
            w += 'e'

    # Step 1c
    if w.endswith('y') and _has_vowel(w[:-1]):
        w = w[:-1] + 'i'

    # Step 2
    _step2 = [
        ('ational', 'ate'), ('tional', 'tion'), ('enci', 'ence'),
        ('anci', 'ance'), ('izer', 'ize'), ('abli', 'able'),
        ('alli', 'al'), ('entli', 'ent'), ('eli', 'e'), ('ousli', 'ous'),
        ('ization', 'ize'), ('ation', 'ate'), ('ator', 'ate'),
        ('alism', 'al'), ('iveness', 'ive'), ('fulness', 'ful'),
        ('ousness', 'ous'), ('aliti', 'al'), ('iviti', 'ive'),
        ('biliti', 'ble'),
    ]
    for suffix, repl in _step2:
        if w.endswith(suffix):
            stem = w[:-len(suffix)]
            if _measure(stem) > 0:
                w = stem + repl
            break

    # Step 3
    _step3 = [
        ('icate', 'ic'), ('ative', ''), ('alize', 'al'),
        ('iciti', 'ic'), ('ical', 'ic'), ('ful', ''), ('ness', ''),
    ]
    for suffix, repl in _step3:
        if w.endswith(suffix):
            stem = w[:-len(suffix)]
            if _measure(stem) > 0:
                w = stem + repl
            break

    # Step 4
    _step4 = [
        'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant',
        'ement', 'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti',
        'ous', 'ive', 'ize',
    ]
    for suffix in _step4:
        if w.endswith(suffix):
            stem = w[:-len(suffix)]
            if suffix == 'ion' and len(stem) > 0 and stem[-1] in 'st':
                if _measure(stem) > 1:
                    w = stem
            elif _measure(stem) > 1:
                w = stem
            break

    # Step 5a
    if w.endswith('e'):
        stem = w[:-1]
        m = _measure(stem)
        if m > 1 or (m == 1 and not _cvc(stem)):
            w = stem

    # Step 5b
    if _ends_double_c(w) and w[-1] == 'l' and _measure(w) > 1:
        w = w[:-1]

    _stem_cache[original] = w
    return w


def _common_prefix(a, b):
    """Longest common prefix of two strings."""
    i = 0
    while i < len(a) and i < len(b) and a[i] == b[i]:
        i += 1
    return a[:i]


def _keyword_match_prefix(keyword_lower):
    """Compute the broadest safe prefix for highlighting a keyword."""
    stem = _porter_stem(keyword_lower)
    prefix = _common_prefix(keyword_lower, stem)
    if len(prefix) < 3:
        prefix = keyword_lower if len(keyword_lower) <= len(stem) else stem
    return prefix


_highlight_pattern_cache: dict[tuple, 're.Pattern | None'] = {}


def _build_highlight_pattern(keywords):
    """Build ONE compiled regex for all keywords -- no Python callbacks needed."""
    cache_key = tuple(sorted(keywords))
    if cache_key in _highlight_pattern_cache:
        return _highlight_pattern_cache[cache_key]

    parts = []
    for kw in keywords:
        if _is_exact_keyword(kw):
            clean = _clean_exact_keyword(kw)
            if clean:
                literal = re.escape(clean)
                literal = literal.replace(r'\ ', r'\s+')
                parts.append(rf'(?<!\w){literal}(?!\w)')
            continue

        clean = _clean_fts_keyword(kw).lower()
        words = clean.split()
        for w in words:
            if w:
                prefix = _keyword_match_prefix(w)
                escaped = re.escape(prefix)
                parts.append(rf'\b{escaped}\w*\b')

    if not parts:
        _highlight_pattern_cache[cache_key] = None
        return None
    parts = sorted(set(parts), key=len, reverse=True)
    alt = '|'.join(parts)
    pattern = re.compile(rf'({alt})', re.IGNORECASE)
    _highlight_pattern_cache[cache_key] = pattern
    return pattern


def _build_keyword_highlight_pattern(keyword):
    """Return the appropriate highlight regex for one keyword."""
    if _is_exact_keyword(keyword):
        return _build_exact_text_pattern(keyword)
    return _build_highlight_pattern([keyword])


def _highlight_text_fast(text, pattern):
    """Apply pre-compiled highlight pattern. Pure C regex, zero Python callbacks."""
    if not text or not pattern:
        return text
    return pattern.sub(r'<mark>\g<0></mark>', text)


def _extract_snippet(text, window=120):
    """Extract a context window around the first <mark> in *text*."""
    pos = text.find('<mark>')
    if pos == -1:
        return None

    start = max(0, pos - window)
    if start > 0:
        sp = text.rfind(' ', max(0, start - 30), start + 15)
        if sp > 0:
            start = sp + 1

    end_mark = text.find('</mark>', pos)
    anchor = end_mark + 7 if end_mark != -1 else pos + 6
    end = min(len(text), anchor + window)
    if end < len(text):
        sp = text.find(' ', max(anchor, end - 20), end + 30)
        if sp > 0:
            end = sp

    snippet = text[start:end].strip()
    if start > 0:
        snippet = '...' + snippet
    if end < len(text):
        snippet = snippet + '...'
    return snippet

