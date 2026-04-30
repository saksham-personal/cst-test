"""Small shared helpers for Company Screener."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pandas as pd


def _normalize_text_value(value):
    """Normalize scalar values used as keys or labels."""
    if value is None:
        return ''
    try:
        if pd.isna(value):
            return ''
    except TypeError:
        pass
    text = str(value).strip()
    if text.lower() in ('', 'nan', 'none'):
        return ''
    return text


def _unique_preserve_order(values):
    """Return values without duplicates while preserving order."""
    seen = set()
    ordered = []
    for value in values:
        if value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def _safe_threadpool_map(items, fn, max_workers=8):
    """Run a map operation with a defensive fallback for empty/small batches."""
    item_list = list(items)
    if not item_list:
        return []

    worker_count = min(max_workers, len(item_list))
    if worker_count <= 1:
        return [fn(item) for item in item_list]

    try:
        with ThreadPoolExecutor(max_workers=worker_count) as pool:
            return list(pool.map(fn, item_list))
    except ValueError:
        return [fn(item) for item in item_list]


def _normalize_url(url):
    """Ensure URL has a scheme for clickable links."""
    if url is None:
        return ''
    try:
        if pd.isna(url):
            return ''
    except TypeError:
        pass
    if str(url).strip() in ('', '-', 'nan', 'None'):
        return ''
    url = str(url).strip()
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    return url
